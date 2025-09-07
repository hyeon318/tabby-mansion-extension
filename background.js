// TabbyMansion Background Service Worker

// =========================================================================
// 환경별 로깅 설정
// =========================================================================

// 환경 감지 (webpack DefinePlugin으로 주입됨)
const isDevelopment = process.env.NODE_ENV === "development";
const isTest = process.env.NODE_ENV === "test";
const isProduction = process.env.NODE_ENV === "production";

// 로깅 설정
const LOG_CONFIG = {
  enabled: true, // 모든 환경에서 로그 활성화 (디버깅을 위해)
  prefix: "[TabbyMansion]",
  level: isTest ? "debug" : isDevelopment ? "debug" : "info", // 환경별 로그 레벨
};

// 로깅 함수
function log(level, message, data = null) {
  if (!LOG_CONFIG.enabled) return;

  const timestamp = new Date().toISOString();
  const prefix = `${LOG_CONFIG.prefix} [${timestamp}]`;

  switch (level) {
    case "error":
      console.error(`${prefix} ❌ ${message}`, data);
      break;
    case "warn":
      console.warn(`${prefix} ⚠️ ${message}`, data);
      break;
    case "info":
      console.log(`${prefix} ℹ️ ${message}`, data);
      break;
    case "debug":
      if (LOG_CONFIG.level === "debug") {
        console.log(`${prefix} 🔍 ${message}`, data);
      }
      break;
    case "success":
      console.log(`${prefix} ✅ ${message}`, data);
      break;
  }
}

// 환경 정보 로깅
log("info", `환경: ${process.env.NODE_ENV || "development"}`, {
  isDevelopment,
  isTest,
  isProduction,
  loggingEnabled: LOG_CONFIG.enabled,
});

// =========================================================================
// 공통 유틸리티 함수들
// =========================================================================

// 탭 트래커 활성화 상태 확인
async function isTabTrackerEnabled() {
  try {
    const result = await chrome.storage.local.get(["isTabTrackerEnabled"]);
    return result.isTabTrackerEnabled !== undefined
      ? result.isTabTrackerEnabled
      : true;
  } catch (error) {
    console.error("탭 트래커 상태 확인 실패:", error);
    return false;
  }
}

// 날짜 키 생성 (YYYY-MM-DD 형식) - 로컬 시간대 기준
function generateDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  // 로컬 시간대 기준으로 날짜 생성 (UTC 시간과 다를 수 있음)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(d.getDate()).padStart(2, "0")}`;
}

// tabLogs 객체 구조로 안전하게 로드
async function loadTabLogs() {
  try {
    const result = await chrome.storage.local.get(["tabLogs"]);
    log("debug", "tabLogs 로드 성공", {
      hasData: !!result.tabLogs,
      type: typeof result.tabLogs,
      keys: result.tabLogs ? Object.keys(result.tabLogs) : [],
    });
    return result.tabLogs || {};
  } catch (error) {
    log("error", "tabLogs 로드 실패", error);
    return {};
  }
}

// tabLogs 저장
async function saveTabLogs(tabLogs) {
  try {
    // 저장 전 데이터 유효성 검사
    if (!tabLogs || typeof tabLogs !== "object") {
      log("error", "저장할 tabLogs 데이터가 유효하지 않음", {
        tabLogs,
        type: typeof tabLogs,
      });
      return false;
    }

    // Chrome storage quota 확인 (대략적인 크기 체크)
    const dataSize = JSON.stringify(tabLogs).length;
    if (dataSize > 5 * 1024 * 1024) {
      // 5MB 제한
      log("warn", "tabLogs 데이터가 너무 큽니다", { sizeBytes: dataSize });
      // 오래된 데이터 정리
      cleanupOldLogs(tabLogs);
    }

    await chrome.storage.local.set({ tabLogs });
    log("debug", "tabLogs 저장 성공", {
      dateCount: Object.keys(tabLogs).length,
      totalLogs: Object.values(tabLogs).reduce(
        (sum, logs) => sum + logs.length,
        0
      ),
      dataSize,
    });
    return true;
  } catch (error) {
    log("error", "tabLogs 저장 실패", error);

    // Chrome storage 에러 종류별 처리
    if (error.message && error.message.includes("QUOTA_BYTES")) {
      log("error", "Storage quota 초과 - 데이터 정리 필요");
      // 30일 이상 된 데이터만 보관하도록 정리
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      Object.keys(tabLogs).forEach(dateKey => {
        const keyDate = new Date(dateKey);
        if (keyDate < thirtyDaysAgo) {
          delete tabLogs[dateKey];
        }
      });

      // 정리 후 재시도
      try {
        await chrome.storage.local.set({ tabLogs });
        log("success", "데이터 정리 후 저장 성공");
        return true;
      } catch (retryError) {
        log("error", "데이터 정리 후에도 저장 실패", retryError);
        return false;
      }
    }

    return false;
  }
}

// 시간 계산 및 제한
function calculateActualTime(startTime) {
  const startTimeMs =
    typeof startTime === "number" ? startTime : new Date(startTime).getTime();

  const actualTime = Date.now() - startTimeMs;
  const maxReasonableTime = 24 * 60 * 60 * 1000; // 24시간 제한

  return actualTime > maxReasonableTime ? maxReasonableTime : actualTime;
}

// 특정 탭의 미완료 로그 찾기 및 완료 처리
async function findAndCompleteTabLog(tabId, startTime) {
  log("debug", "findAndCompleteTabLog 시작", {
    tabId,
    startTime: startTime ? new Date(startTime).toLocaleString() : null,
  });

  const tabLogs = await loadTabLogs();
  let foundLog = false;
  let completedLogInfo = null;

  // 모든 날짜별 로그에서 해당 탭의 미완료 로그 찾기
  for (const [dateKey, dailyLogs] of Object.entries(tabLogs)) {
    for (let i = dailyLogs.length - 1; i >= 0; i--) {
      const logEntry = dailyLogs[i]; // 변수명을 logEntry로 변경하여 충돌 방지

      if (logEntry.tabId === tabId && !logEntry.actualTime) {
        const finalActualTime = calculateActualTime(
          startTime || logEntry.startTime
        );

        // 로그 완료 처리
        logEntry.actualTime = finalActualTime;
        logEntry.endTime = new Date().toISOString();

        // 완료된 로그 정보 저장
        completedLogInfo = {
          dateKey,
          domain: logEntry.domain,
          title: logEntry.title,
          startTime: logEntry.startTime,
          endTime: logEntry.endTime,
          actualTimeSeconds: Math.round(finalActualTime / 1000),
          url: logEntry.url,
        };

        // 일자별 통계에 실제 시간 추가
        await updateDailyTime(
          logEntry.domain,
          logEntry.timestamp,
          finalActualTime
        );

        log(
          "success",
          `탭 ${tabId} 실제 사용 시간 기록 완료`,
          completedLogInfo
        );

        foundLog = true;
        break;
      }
    }
    if (foundLog) break;
  }

  if (!foundLog) {
    log("warn", "완료할 로그를 찾지 못함", {
      tabId,
      searchedDates: Object.keys(tabLogs),
      totalLogsSearched: Object.values(tabLogs).reduce(
        (sum, logs) => sum + logs.length,
        0
      ),
    });
  }

  // 수정된 tabLogs 저장
  if (foundLog) {
    const saveSuccess = await saveTabLogs(tabLogs);
    if (saveSuccess) {
      log("success", "로그 완료 후 저장 성공", completedLogInfo);
    } else {
      log("error", "로그 완료 후 저장 실패", completedLogInfo);
    }
  }

  return foundLog;
}

// 90일 이상 된 로그 정리
function cleanupOldLogs(tabLogs) {
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  Object.keys(tabLogs).forEach(dateKey => {
    const keyDate = new Date(dateKey);
    if (keyDate < ninetyDaysAgo) {
      delete tabLogs[dateKey];
    }
  });

  return tabLogs;
}

// Google Analytics 4 설정
const GA4_MEASUREMENT_ID = "G-6EYP9W3WCZ";
const GA4_API_SECRET = "R2rqtts1QzGbj2De-epG0w";
const GA4_ENDPOINT = "https://www.google-analytics.com/mp/collect";

// GA4 이벤트 전송 함수
async function sendGA4Event(eventName, parameters = {}) {
  try {
    const clientId = await getOrCreateClientId();

    const eventData = {
      client_id: clientId,
      events: [
        {
          name: eventName,
          params: {
            ...parameters,
            engagement_time_msec: 100,
          },
        },
      ],
    };

    const response = await fetch(
      `${GA4_ENDPOINT}?measurement_id=${GA4_MEASUREMENT_ID}&api_secret=${GA4_API_SECRET}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventData),
      }
    );

    if (response.ok) {
      if (LOG_CONFIG.enabled) {
        log("debug", `GA4 이벤트 전송 성공: ${eventName}`, parameters);
      }
    } else {
      log("warn", `GA4 이벤트 전송 실패: ${eventName}`, response.status);
    }
  } catch (error) {
    log("warn", `GA4 이벤트 전송 오류: ${eventName}`, error);
  }
}

// 클라이언트 ID 생성 또는 가져오기
async function getOrCreateClientId() {
  try {
    const result = await chrome.storage.local.get(["ga4_client_id"]);
    if (result.ga4_client_id) {
      return result.ga4_client_id;
    }

    // 새로운 클라이언트 ID 생성
    const clientId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c == "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      }
    );

    await chrome.storage.local.set({ ga4_client_id: clientId });
    return clientId;
  } catch (error) {
    log("warn", "클라이언트 ID 생성 실패:", error);
    return "anonymous";
  }
}

let isTabTrackerEnabledLocal = true;
let currentTabId = null;
let tabStartTime = null; // 탭 시작 시간 추적

// 타이머 상태 관리 - 단일 소스
let timerState = {
  status: "paused", // 'running' | 'paused'
  startedAt: null, // epoch ms when timer was started
  accumulatedMs: 0, // total accumulated milliseconds
  label: "", // optional label
  lastSaveTime: null, // 마지막 저장 시간 (디버깅용)
};

// 확장 프로그램 설치 시 초기 설정
chrome.runtime.onInstalled.addListener(async details => {
  log("info", "TabbyMansion 확장 프로그램 설치/업데이트됨", {
    reason: details.reason,
    version: chrome.runtime.getManifest().version,
  });

  // GA4 설치 이벤트 전송
  await sendGA4Event("extension_installed", {
    reason: details.reason,
    version: chrome.runtime.getManifest().version,
  });

  // 기존 데이터 확인
  const existingData = await chrome.storage.local.get([
    "isStopwatchEnabled",
    "isTabTrackerEnabled",
    "tabLogs",
    "timerState",
  ]);

  log("debug", "기존 데이터 확인", {
    hasStopwatch: existingData.isStopwatchEnabled !== undefined,
    hasTabTracker: existingData.isTabTrackerEnabled !== undefined,
    hasTabLogs: !!existingData.tabLogs,
    hasTimerState: !!existingData.timerState,
    tabLogsType: typeof existingData.tabLogs,
    tabLogsKeys: existingData.tabLogs ? Object.keys(existingData.tabLogs) : [],
  });

  // 새로 설치하는 경우에만 초기화 (업데이트나 재활성화 시에는 기존 데이터 보존)
  if (details.reason === "install") {
    log("info", "새로 설치됨 - 기본 설정으로 초기화");

    await chrome.storage.local.set({
      isStopwatchEnabled: false,
      isTabTrackerEnabled: true,
      tabLogs: {},
      timerState: {
        status: "paused",
        startedAt: null,
        accumulatedMs: 0,
        label: "",
        lastSaveTime: null,
      },
    });

    log("success", "초기 설정 완료", {
      stopwatch: false,
      tabTracker: true,
      tabLogs: "객체로 초기화",
      timerState: "일시정지 상태로 초기화",
    });

    // GA4 초기 설정 이벤트
    await sendGA4Event("extension_initialized", {
      tab_tracker_enabled: true,
      stopwatch_enabled: false,
    });
  } else {
    // 업데이트나 재활성화 시에는 누락된 필드만 기본값으로 추가
    log("info", "업데이트/재활성화됨 - 기존 설정 보존 및 누락된 설정 추가");

    const updates = {};

    if (existingData.isStopwatchEnabled === undefined) {
      updates.isStopwatchEnabled = false;
    }
    if (existingData.isTabTrackerEnabled === undefined) {
      updates.isTabTrackerEnabled = true;
    }
    if (!existingData.tabLogs) {
      updates.tabLogs = {};
    }
    // 기존 배열 구조를 객체 구조로 마이그레이션
    else if (Array.isArray(existingData.tabLogs)) {
      log("info", "tabLogs 배열 구조 감지 - 객체 구조로 마이그레이션");
      const newTabLogs = {};
      existingData.tabLogs.forEach(logEntry => {
        const date = new Date(logEntry.timestamp);
        const dayKey = generateDateKey(date);
        if (!newTabLogs[dayKey]) {
          newTabLogs[dayKey] = [];
        }
        newTabLogs[dayKey].push(logEntry);
      });
      updates.tabLogs = newTabLogs;
      log("success", "tabLogs 마이그레이션 완료", {
        originalCount: existingData.tabLogs.length,
        newDaysCount: Object.keys(newTabLogs).length,
        newTotalCount: Object.values(newTabLogs).reduce(
          (sum, logs) => sum + logs.length,
          0
        ),
      });
    }

    if (!existingData.timerState) {
      updates.timerState = {
        status: "paused",
        startedAt: null,
        accumulatedMs: 0,
        label: "",
        lastSaveTime: null,
      };
    }

    if (Object.keys(updates).length > 0) {
      await chrome.storage.local.set(updates);
      log("info", "누락된 설정 추가 완료", updates);
    } else {
      log("info", "모든 설정이 이미 존재함");
    }

    // GA4 업데이트 이벤트
    await sendGA4Event("extension_updated", {
      reason: details.reason,
      version: chrome.runtime.getManifest().version,
    });

    // 업데이트 시 패치 노트 확인 상태 초기화
    await chrome.storage.local.set({ patchNotesSeen: false });
  }

  // 저장된 상태 로드
  await loadTimerState();
  await loadTabTrackerState();

  // 사용하지 않는 중복 데이터 정리 (성능 향상)
  await cleanupDuplicateData();

  log("success", "✅ Service Worker 초기화 완료");
});

// Service Worker 시작 시 상태 복원
chrome.runtime.onStartup.addListener(async () => {
  if (LOG_CONFIG.enabled) log("info", "TabbyMansion Service Worker 시작됨");
  await loadTimerState();
  await loadTabTrackerState();
  await initializeTabTracking(); // 탭 추적 초기화 추가
});

// Service Worker 활성화 시 상태 복원
self.addEventListener("activate", async event => {
  if (LOG_CONFIG.enabled) log("info", "TabbyMansion Service Worker 활성화됨");
  await loadTimerState();
  await loadTabTrackerState();
  await initializeTabTracking(); // 탭 추적 초기화 추가
});

// Service Worker 종료 전 타이머 상태 저장
self.addEventListener("beforeunload", async event => {
  log("info", "TabbyMansion Service Worker 종료 예정 - 상태 저장");

  // 타이머 상태 저장
  if (timerState.status === "running") {
    await saveTimerState();
  }

  // 현재 추적 중인 탭 완료 처리
  if (currentTabId && tabStartTime) {
    log("info", "Service Worker 종료 전 현재 탭 완료 처리", {
      tabId: currentTabId,
      startTime: new Date(tabStartTime).toLocaleString(),
    });
    await findAndCompleteTabLog(currentTabId, tabStartTime);
  }
});

// 타이머 상태 로드
async function loadTimerState() {
  try {
    const result = await chrome.storage.local.get(["timerState"]);
    if (result.timerState) {
      const savedState = result.timerState;

      // 저장된 상태의 유효성 검증
      if (
        typeof savedState.status !== "string" ||
        typeof savedState.accumulatedMs !== "number" ||
        (savedState.startedAt && typeof savedState.startedAt !== "number")
      ) {
        if (LOG_CONFIG.enabled)
          log("warn", "저장된 타이머 상태가 유효하지 않습니다. 초기화합니다.");
        resetTimer();
        return;
      }

      timerState = { ...timerState, ...savedState };
      if (LOG_CONFIG.enabled)
        log("debug", "TabbyMansion 타이머 상태 로드됨:", {
          status: timerState.status,
          accumulatedMs: timerState.accumulatedMs,
          label: timerState.label,
          startedAt: timerState.startedAt
            ? new Date(timerState.startedAt).toLocaleString()
            : null,
        });

      // Service Worker 재시작 시 실행 중이던 타이머 복원
      if (timerState.status === "running" && timerState.startedAt) {
        const now = Date.now();
        const timeSinceStart = now - timerState.startedAt;

        // Service Worker 재시작으로 인한 시간 차이가 비정상적으로 큰 경우만 처리
        // (7일 이상은 확실히 비정상적인 경우)
        if (timeSinceStart > 7 * 24 * 60 * 60 * 1000) {
          if (LOG_CONFIG.enabled)
            log(
              "debug",
              "타이머가 7일 이상 실행되어 리셋합니다 (비정상적인 상태)"
            );
          resetTimer();
        } else {
          // 타이머 상태를 현재 시간으로 업데이트하여 정확한 시간 계산
          timerState.startedAt = now;
          saveTimerState();
          broadcastTimerState();
          if (LOG_CONFIG.enabled)
            log("debug", "실행 중이던 타이머 복원됨:", {
              status: timerState.status,
              accumulatedMs: timerState.accumulatedMs,
              label: timerState.label,
            });
        }
      }
    }
  } catch (error) {
    log("error", "❌ 타이머 상태 로드 실패:", error);
  }
}

// 타이머 상태 저장
async function saveTimerState() {
  try {
    // 저장 시간 기록
    timerState.lastSaveTime = Date.now();

    await chrome.storage.local.set({ timerState });
    if (LOG_CONFIG.enabled)
      log("debug", "타이머 상태 저장됨:", {
        status: timerState.status,
        accumulatedMs: timerState.accumulatedMs,
        label: timerState.label,
        lastSaveTime: new Date(timerState.lastSaveTime).toLocaleString(),
      });
  } catch (error) {
    log("error", "❌ 타이머 상태 저장 실패:", error);
  }
}

// 탭 추적 초기화 함수 추가
async function initializeTabTracking() {
  try {
    const isEnabled = await isTabTrackerEnabled();
    if (!isEnabled) {
      log("debug", "탭 트래커가 비활성화되어 있어 초기화하지 않음");
      return;
    }

    // 현재 활성 윈도우의 활성 탭 찾기
    const windows = await chrome.windows.getAll({ populate: true });
    let activeTab = null;

    for (const window of windows) {
      if (window.focused) {
        activeTab = window.tabs.find(tab => tab.active);
        break;
      }
    }

    // 포커스된 윈도우가 없다면 가장 최근에 사용된 윈도우의 활성 탭 사용
    if (!activeTab && windows.length > 0) {
      const lastWindow = windows.sort((a, b) => (b.id || 0) - (a.id || 0))[0];
      activeTab = lastWindow.tabs.find(tab => tab.active);
    }

    if (activeTab) {
      // 유효한 URL인지 확인
      if (
        activeTab.url &&
        !activeTab.url.startsWith("chrome://") &&
        !activeTab.url.startsWith("chrome-extension://") &&
        !activeTab.url.startsWith("edge://") &&
        !activeTab.url.startsWith("about:")
      ) {
        log("info", "Service Worker 시작 시 활성 탭 추적 시작", {
          tabId: activeTab.id,
          windowId: activeTab.windowId,
          url: activeTab.url,
          title: activeTab.title,
        });

        currentTabId = activeTab.id;
        tabStartTime = Date.now();
        await logTabActivity(activeTab, tabStartTime);
      } else {
        log("debug", "활성 탭이 추적 제외 URL", activeTab.url);
      }
    } else {
      log("debug", "활성 탭을 찾을 수 없음");
    }
  } catch (error) {
    log("error", "탭 추적 초기화 중 오류", error);
  }
}

// 탭 트래커 상태 로드
async function loadTabTrackerState() {
  try {
    isTabTrackerEnabledLocal = await isTabTrackerEnabled();
    log("info", "탭 트래커 상태 복원됨", { enabled: isTabTrackerEnabledLocal });

    // 탭 트래커가 활성화되어 있다면 현재 탭 추적 시작
    if (isTabTrackerEnabledLocal) {
      // initializeTabTracking 함수로 분리하여 호출
      await initializeTabTracking();
    }
  } catch (error) {
    log("error", "❌ 탭 트래커 상태 로드 실패:", error);
  }
}

// 타이머 시작
async function startTimer(label = "") {
  if (timerState.status === "running") {
    if (LOG_CONFIG.enabled) log("debug", "타이머가 이미 실행 중입니다");
    return false;
  }

  timerState.status = "running";
  timerState.startedAt = Date.now();
  timerState.label = label;

  saveTimerState();
  broadcastTimerState();

  // GA4 타이머 시작 이벤트
  await sendGA4Event("timer_started", {
    has_label: !!label,
    label_length: label.length,
  });

  // 타이머 실행 중일 때 주기적으로 상태 저장 (Service Worker 재시작 대비)
  if (timerState.saveInterval) {
    clearInterval(timerState.saveInterval);
  }
  timerState.saveInterval = setInterval(() => {
    if (timerState.status === "running") {
      saveTimerState();
    }
  }, 30000); // 30초마다 저장

  if (LOG_CONFIG.enabled) log("debug", "타이머 시작:", timerState);
  return true;
}

// 타이머 일시정지
async function pauseTimer() {
  if (timerState.status !== "running") {
    if (LOG_CONFIG.enabled) log("debug", "타이머가 실행 중이 아닙니다");
    return false;
  }

  const now = Date.now();
  const currentRun = now - timerState.startedAt;
  timerState.accumulatedMs += currentRun;
  timerState.status = "paused";
  timerState.startedAt = null;

  // 주기적 저장 인터벌 정리
  if (timerState.saveInterval) {
    clearInterval(timerState.saveInterval);
    timerState.saveInterval = null;
  }

  saveTimerState();
  broadcastTimerState();

  // GA4 타이머 일시정지 이벤트
  await sendGA4Event("timer_paused", {
    accumulated_time_seconds: Math.round(timerState.accumulatedMs / 1000),
    current_run_seconds: Math.round(currentRun / 1000),
  });

  if (LOG_CONFIG.enabled) log("debug", "타이머 일시정지:", timerState);
  return true;
}

// 타이머 리셋
async function resetTimer() {
  if (LOG_CONFIG.enabled) log("debug", "타이머 리셋 시작");

  // 주기적 저장 인터벌 정리
  if (timerState.saveInterval) {
    clearInterval(timerState.saveInterval);
    timerState.saveInterval = null;
  }

  timerState.status = "paused";
  timerState.startedAt = null;
  timerState.accumulatedMs = 0;
  timerState.label = "";
  timerState.lastSaveTime = null;

  saveTimerState();
  broadcastTimerState();

  // GA4 타이머 리셋 이벤트
  await sendGA4Event("timer_reset");

  if (LOG_CONFIG.enabled) log("debug", "타이머 리셋 완료");
  return true;
}

// 현재 타이머 상태 반환 (계산된 경과 시간 포함)
function getTimerState() {
  const now = Date.now();
  let currentElapsed = timerState.accumulatedMs;

  if (timerState.status === "running" && timerState.startedAt) {
    const currentRun = now - timerState.startedAt;
    currentElapsed += currentRun;

    // Service Worker 재시작으로 인한 시간 차이가 비정상적으로 큰 경우만 처리
    // (7일 이상은 확실히 비정상적인 경우)
    if (currentRun > 7 * 24 * 60 * 60 * 1000) {
      log(
        "warn",
        "타이머 실행 시간이 비정상적으로 큽니다 (7일 이상). 리셋합니다."
      );
      resetTimer();
      return {
        ...timerState,
        currentElapsedMs: 0,
      };
    }
  }

  return {
    ...timerState,
    currentElapsedMs: currentElapsed,
  };
}

// 타이머 상태 브로드캐스트 (모든 UI에 알림)
function broadcastTimerState() {
  const state = getTimerState();
  if (LOG_CONFIG.enabled) log("debug", "타이머 상태 브로드캐스트:", state);

  // 모든 탭에 메시지 전송
  chrome.tabs.query({}, tabs => {
    tabs.forEach(tab => {
      if (
        tab.url &&
        !tab.url.startsWith("chrome://") &&
        !tab.url.startsWith("chrome-extension://")
      ) {
        try {
          chrome.tabs.sendMessage(tab.id, {
            action: "TIMER_STATE_UPDATE",
            state: state,
          });
        } catch (error) {
          // 일부 탭에서는 메시지 전송이 실패할 수 있음 (무시)
        }
      }
    });
  });
}

// 탭 활성화 이벤트 리스너
chrome.tabs.onActivated.addListener(async activeInfo => {
  log("info", "탭 활성화 이벤트 감지", {
    newTabId: activeInfo.tabId,
    windowId: activeInfo.windowId,
    previousTabId: currentTabId,
    previousTabStartTime: tabStartTime
      ? new Date(tabStartTime).toLocaleString()
      : null,
  });

  if (!(await isTabTrackerEnabled())) {
    log("debug", "탭 트래커가 비활성화됨");
    return;
  }

  try {
    // 이전 탭의 종료 시간 기록
    if (currentTabId && tabStartTime) {
      log("info", "이전 탭 종료 처리 시작", {
        tabId: currentTabId,
        startTime: new Date(tabStartTime).toLocaleString(),
        duration: Math.round((Date.now() - tabStartTime) / 1000) + "초",
      });

      const completed = await findAndCompleteTabLog(currentTabId, tabStartTime);
      log(completed ? "success" : "warn", "이전 탭 종료 처리 결과", {
        completed,
        tabId: currentTabId,
      });
    } else {
      log(
        "debug",
        "이전 탭 정보 없음 - 첫 번째 탭이거나 Service Worker 재시작"
      );
    }

    const tab = await chrome.tabs.get(activeInfo.tabId);
    log("info", "새 활성 탭 정보", {
      tabId: tab.id,
      title: tab.title,
      url: tab.url,
      windowId: tab.windowId,
    });

    currentTabId = activeInfo.tabId;
    tabStartTime = Date.now(); // 새 탭 시작 시간 기록

    await logTabActivity(tab, tabStartTime);
    log("success", "새 탭 활동 로그 저장 완료", {
      tabId: currentTabId,
      startTime: new Date(tabStartTime).toLocaleString(),
    });
  } catch (error) {
    log("error", "탭 활성화 이벤트 처리 중 오류", {
      error: error.message,
      stack: error.stack,
      activeInfo,
    });
  }
});

// 탭 업데이트 이벤트 리스너 (URL 변경 등)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (!(await isTabTrackerEnabled())) return;

  // 현재 활성 탭이고 URL이 변경된 경우
  if (tabId === currentTabId && changeInfo.url) {
    log("info", "탭 URL 변경 감지", {
      tabId,
      oldUrl: "이전 URL",
      newUrl: changeInfo.url,
      currentStartTime: tabStartTime
        ? new Date(tabStartTime).toLocaleString()
        : null,
    });

    // URL 변경 시 이전 로그 완료 처리
    if (tabStartTime) {
      await findAndCompleteTabLog(tabId, tabStartTime);
    }

    // 새로운 URL에 대한 시작 시간 설정
    tabStartTime = Date.now();
    await logTabActivity(tab, tabStartTime);
  }

  // 현재 활성 탭이 아니지만 완료되지 않은 로그가 있을 수 있는 경우도 처리
  else if (changeInfo.url) {
    // 비활성 탭의 URL 변경도 완료 처리
    await findAndCompleteTabLog(tabId);
  }
});

// 탭이 닫힐 때 실제 사용 시간을 기록
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  try {
    if (!(await isTabTrackerEnabled())) return;

    // 현재 추적 중이던 탭이 닫힌 경우
    if (currentTabId === tabId && tabStartTime) {
      await findAndCompleteTabLog(tabId, tabStartTime);
      currentTabId = null;
      tabStartTime = null;
      return;
    }

    // 비활성 탭이 닫힌 경우에도 마지막 미종료 로그가 있으면 정리
    await findAndCompleteTabLog(tabId);
  } catch (error) {
    log("error", "탭 종료 처리 중 오류:", error);
  }
});

// 윈도우 포커스 변경 이벤트 리스너
chrome.windows.onFocusChanged.addListener(async windowId => {
  try {
    if (!(await isTabTrackerEnabled())) return;

    // 개발자 도구나 팝업 등은 무시
    if (windowId === chrome.windows.WINDOW_ID_NONE) {
      log("debug", "포커스가 브라우저 밖으로 이동");
      return;
    }

    log("debug", "윈도우 포커스 변경", { windowId });

    // 이전 탭 완료 처리
    if (currentTabId && tabStartTime) {
      await findAndCompleteTabLog(currentTabId, tabStartTime);
    }

    // 새로 포커스된 윈도우의 활성 탭 추적
    const window = await chrome.windows.get(windowId, { populate: true });
    const activeTab = window.tabs.find(tab => tab.active);

    if (
      activeTab &&
      activeTab.url &&
      !activeTab.url.startsWith("chrome://") &&
      !activeTab.url.startsWith("chrome-extension://") &&
      !activeTab.url.startsWith("edge://") &&
      !activeTab.url.startsWith("about:")
    ) {
      log("info", "윈도우 포커스 변경으로 새 탭 추적", {
        windowId,
        tabId: activeTab.id,
        url: activeTab.url,
      });

      currentTabId = activeTab.id;
      tabStartTime = Date.now();
      await logTabActivity(activeTab, tabStartTime);
    } else {
      log("debug", "새 윈도우에 추적 가능한 활성 탭 없음");
      currentTabId = null;
      tabStartTime = null;
    }
  } catch (error) {
    log("error", "윈도우 포커스 변경 처리 중 오류:", error);
  }
});

// 탭 활동 로그 저장 (환경별 로깅 적용)
async function logTabActivity(tab, startTime = null) {
  try {
    // 탭 객체 유효성 검사
    if (!tab || !tab.id || !tab.url) {
      log("error", "유효하지 않은 탭 객체", tab);
      return;
    }

    // 탭 트래커 상태 확인
    const trackerEnabled = await isTabTrackerEnabled();
    if (!trackerEnabled) {
      log("debug", "탭 트래커가 비활성화됨");
      return;
    }

    log("info", "탭 활동 로그 시작", {
      title: tab.title,
      url: tab.url,
      tabId: tab.id,
    });

    // URL 유효성 검사
    if (
      !tab.url ||
      tab.url.startsWith("chrome://") ||
      tab.url.startsWith("chrome-extension://") ||
      tab.url.startsWith("edge://") ||
      tab.url.startsWith("about:")
    ) {
      log("debug", "제외된 URL", tab.url);
      return;
    }

    const timestamp = new Date().toISOString();
    const startTimeISO = startTime
      ? new Date(startTime).toISOString()
      : timestamp;

    const logEntry = {
      timestamp,
      title: tab.title || "제목 없음",
      url: tab.url,
      domain: extractDomain(tab.url),
      tabId: tab.id,
      startTime: startTimeISO,
      actualTime: null,
      endTime: null,
    };

    // tabLogs를 날짜별로 구조화하여 저장
    const dayKey = generateDateKey(new Date(logEntry.timestamp));
    log("debug", "날짜 키 생성", dayKey);

    const tabLogs = await loadTabLogs();
    log("debug", "현재 tabLogs 구조", {
      keys: Object.keys(tabLogs),
      totalDays: Object.keys(tabLogs).length,
      currentDayExists: !!tabLogs[dayKey],
      currentDayCount: tabLogs[dayKey]?.length || 0,
    });

    // 날짜별 배열 초기화
    if (!tabLogs[dayKey]) {
      tabLogs[dayKey] = [];
      log("debug", "새로운 날짜 배열 생성", { dayKey });
    }

    // 중복 로그 방지 (동일한 탭ID와 시간의 로그가 이미 존재하는지 확인)
    const isDuplicate = tabLogs[dayKey].some(
      log =>
        log.tabId === logEntry.tabId &&
        log.startTime === logEntry.startTime &&
        log.url === logEntry.url
    );

    if (isDuplicate) {
      log("warn", "중복 로그 감지 - 저장 건너뜀", {
        tabId: logEntry.tabId,
        url: logEntry.url,
        startTime: logEntry.startTime,
      });
      return;
    }

    tabLogs[dayKey].push(logEntry);
    log("info", "로그 추가됨", {
      dayKey,
      todayLogsCount: tabLogs[dayKey].length,
      logEntry: {
        domain: logEntry.domain,
        title: logEntry.title.substring(0, 30),
        timestamp: logEntry.timestamp,
        tabId: logEntry.tabId,
      },
    });

    // 90일 이상 된 날짜별 로그 정리
    const logsBeforeCleanup = Object.keys(tabLogs).length;
    cleanupOldLogs(tabLogs);
    const logsAfterCleanup = Object.keys(tabLogs).length;

    if (logsBeforeCleanup !== logsAfterCleanup) {
      log("info", "오래된 로그 정리됨", {
        before: logsBeforeCleanup,
        after: logsAfterCleanup,
        cleaned: logsBeforeCleanup - logsAfterCleanup,
      });
    }

    // 일자별 통계 업데이트
    try {
      await updateDailyStatistics(logEntry);
      log("debug", "일자별 통계 업데이트 완료");
    } catch (error) {
      log("error", "일자별 통계 업데이트 실패", error);
    }

    // tabLogs 저장 시도
    log("debug", "tabLogs 저장 시도 중...", {
      totalDays: Object.keys(tabLogs).length,
      totalLogs: Object.values(tabLogs).reduce(
        (sum, dailyLogs) => sum + dailyLogs.length,
        0
      ),
      todayLogs: tabLogs[dayKey]?.length || 0,
    });

    const saveSuccess = await saveTabLogs(tabLogs);

    if (saveSuccess) {
      const totalLogsCount = Object.values(tabLogs).reduce(
        (sum, dailyLogs) => sum + dailyLogs.length,
        0
      );
      log("success", "로그 저장 완료", {
        totalLogs: totalLogsCount,
        todayLogs: tabLogs[dayKey]?.length || 0,
        allDays: Object.keys(tabLogs),
      });
    } else {
      log("error", "로그 저장 실패 - 재시도 중...");

      // 저장 실패 시 한 번 더 시도
      setTimeout(async () => {
        try {
          const retrySuccess = await saveTabLogs(tabLogs);
          if (retrySuccess) {
            log("success", "로그 저장 재시도 성공");
          } else {
            log("error", "로그 저장 재시도도 실패");
          }
        } catch (retryError) {
          log("error", "로그 저장 재시도 중 예외 발생", retryError);
        }
      }, 1000);
    }
  } catch (error) {
    log("error", "logTabActivity 실행 중 치명적 오류", {
      error: error.message,
      stack: error.stack,
      tab: tab ? { id: tab.id, url: tab.url, title: tab.title } : null,
    });
  }
}

// 도메인 추출 함수
function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace("www.", "");
  } catch {
    return "알 수 없음";
  }
}

// 중복 데이터 정리 (성능 향상)
async function cleanupDuplicateData() {
  try {
    const result = await chrome.storage.local.get(["realTimeStats"]);

    if (result.realTimeStats) {
      // 구 실시간 통계 데이터만 제거 (dailyStats는 새 구조로 사용)
      await chrome.storage.local.remove(["realTimeStats"]);

      if (LOG_CONFIG.enabled) {
        log("info", "✅ 구 실시간 통계 데이터 정리 완료 (realTimeStats 제거)");
      }
    }
  } catch (error) {
    log("error", "❌ 중복 데이터 정리 실패:", error);
  }
}

// 일자별 통계 업데이트
async function updateDailyStatistics(logEntry) {
  try {
    const dayKey = generateDateKey(new Date(logEntry.timestamp));

    const result = await chrome.storage.local.get(["dailyStats"]);
    const dailyStats = result.dailyStats || {};

    if (!dailyStats[dayKey]) {
      dailyStats[dayKey] = {
        totalTime: 0,
        sites: {},
        date: dayKey,
        lastUpdate: new Date().toISOString(),
      };
    }

    const siteStats = dailyStats[dayKey].sites[logEntry.domain] || {
      time: 0,
      visits: 0,
      lastVisit: logEntry.timestamp,
    };

    // 방문 횟수 증가
    siteStats.visits++;
    siteStats.lastVisit = logEntry.timestamp;

    dailyStats[dayKey].sites[logEntry.domain] = siteStats;
    dailyStats[dayKey].lastUpdate = new Date().toISOString();

    // 90일 이상 된 통계 정리
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    Object.keys(dailyStats).forEach(key => {
      const statDate = new Date(key);
      if (statDate < ninetyDaysAgo) {
        delete dailyStats[key];
      }
    });

    await chrome.storage.local.set({ dailyStats });

    if (LOG_CONFIG.enabled) {
      log("debug", "일자별 통계 업데이트:", {
        date: dayKey,
        domain: logEntry.domain,
        visits: siteStats.visits,
      });
    }
  } catch (error) {
    log("error", "❌ 일자별 통계 업데이트 실패:", error);
  }
}

// 일자별 통계에 시간 추가
async function updateDailyTime(domain, timestamp, timeMs) {
  try {
    const dayKey = generateDateKey(new Date(timestamp));

    const result = await chrome.storage.local.get(["dailyStats"]);
    const dailyStats = result.dailyStats || {};

    if (dailyStats[dayKey] && dailyStats[dayKey].sites[domain]) {
      dailyStats[dayKey].sites[domain].time += timeMs;
      dailyStats[dayKey].totalTime += timeMs;
      dailyStats[dayKey].lastUpdate = new Date().toISOString();

      await chrome.storage.local.set({ dailyStats });

      if (LOG_CONFIG.enabled) {
        log("debug", "일자별 시간 업데이트:", {
          date: dayKey,
          domain: domain,
          addedTime: Math.round(timeMs / 1000) + "초",
        });
      }
    }
  } catch (error) {
    log("error", "❌ 일자별 시간 업데이트 실패:", error);
  }
}

// 메시지 처리
chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (LOG_CONFIG.enabled) log("debug", "백그라운드 메시지 수신:", request);

  if (request.action === "updateTabTracker") {
    isTabTrackerEnabledLocal = request.enabled;
    if (LOG_CONFIG.enabled)
      log("debug", "탭 트래커 상태 변경:", isTabTrackerEnabledLocal);

    // GA4 탭 트래커 토글 이벤트
    sendGA4Event("tab_tracker_toggled", {
      enabled: request.enabled,
    });

    if (request.enabled) {
      // 현재 활성 탭 확인
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]) {
          if (LOG_CONFIG.enabled)
            log("debug", "초기 활성 탭 설정:", tabs[0].url);
          currentTabId = tabs[0].id;
          tabStartTime = Date.now();
          logTabActivity(tabs[0], tabStartTime);
        }
      });
    } else {
      // 탭 트래커 비활성화 시 추적 상태만 초기화 (데이터 수집 중단)
      if (LOG_CONFIG.enabled)
        log("debug", "탭 트래커 비활성화 - 데이터 수집 중단");
      currentTabId = null;
      tabStartTime = null;
      if (LOG_CONFIG.enabled) log("debug", "탭 트래커 비활성화 완료");
    }
    sendResponse({ success: true });
  }

  // 타이머 관련 메시지 처리
  else if (request.action === "TIMER_START") {
    startTimer(request.label || "").then(success => {
      sendResponse({ success, state: getTimerState() });
    });
    return true;
  } else if (request.action === "TIMER_PAUSE") {
    pauseTimer().then(success => {
      sendResponse({ success, state: getTimerState() });
    });
    return true;
  } else if (request.action === "TIMER_RESET") {
    resetTimer().then(success => {
      sendResponse({ success, state: getTimerState() });
    });
    return true;
  } else if (request.action === "TIMER_GET") {
    const state = getTimerState();
    sendResponse({ success: true, state });
  } else if (request.action === "GA4_EVENT") {
    // 팝업에서 전송된 GA4 이벤트 처리
    sendGA4Event(request.eventName, request.parameters || {});
    sendResponse({ success: true });
  }

  // tabLogs 디버깅용 액션들
  else if (request.action === "DEBUG_GET_TABLOGS") {
    try {
      const tabLogs = await loadTabLogs();
      const stats = {
        totalDays: Object.keys(tabLogs).length,
        totalLogs: Object.values(tabLogs).reduce(
          (sum, logs) => sum + logs.length,
          0
        ),
        todayKey: generateDateKey(),
        todayLogs: tabLogs[generateDateKey()]?.length || 0,
        recentDays: Object.keys(tabLogs).sort().slice(-7), // 최근 7일
        currentTabId,
        tabStartTime: tabStartTime
          ? new Date(tabStartTime).toLocaleString()
          : null,
        isTrackerEnabled: isTabTrackerEnabledLocal,
        // 추가 디버깅 정보
        incompleteLogsCount: Object.values(tabLogs).reduce(
          (count, dailyLogs) => {
            return count + dailyLogs.filter(log => !log.actualTime).length;
          },
          0
        ),
        lastTabLogs:
          Object.keys(tabLogs).length > 0
            ? Object.values(tabLogs)[Object.keys(tabLogs).length - 1].slice(-3)
            : [],
      };

      log("info", "DEBUG: tabLogs 상태 조회", stats);
      sendResponse({ success: true, tabLogs, stats });
    } catch (error) {
      log("error", "DEBUG: tabLogs 조회 실패", error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  } else if (request.action === "DEBUG_FORCE_LOG_CURRENT_TAB") {
    try {
      const tabs = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (tabs && tabs[0]) {
        log("info", "DEBUG: 현재 탭 강제 로그 추가", { tab: tabs[0].url });
        await logTabActivity(tabs[0], Date.now());
        sendResponse({ success: true, message: "현재 탭 로그 추가됨" });
      } else {
        sendResponse({ success: false, message: "활성 탭을 찾을 수 없음" });
      }
    } catch (error) {
      log("error", "DEBUG: 현재 탭 로그 추가 실패", error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  } else if (request.action === "DEBUG_COMPLETE_ALL_LOGS") {
    try {
      const tabLogs = await loadTabLogs();
      let completedCount = 0;

      // 모든 미완료 로그를 완료 처리
      for (const [dateKey, dailyLogs] of Object.entries(tabLogs)) {
        for (const logEntry of dailyLogs) {
          if (!logEntry.actualTime) {
            // 기본적으로 30초의 사용 시간을 할당 (실제 시간을 모르므로)
            const estimatedTime = 30 * 1000; // 30초
            logEntry.actualTime = estimatedTime;
            logEntry.endTime = new Date().toISOString();

            // 일자별 통계에도 추가
            await updateDailyTime(
              logEntry.domain,
              logEntry.timestamp,
              estimatedTime
            );
            completedCount++;
          }
        }
      }

      if (completedCount > 0) {
        await saveTabLogs(tabLogs);
        log("success", "DEBUG: 미완료 로그 강제 완료", { completedCount });
        sendResponse({
          success: true,
          message: `${completedCount}개의 미완료 로그를 완료 처리했습니다.`,
        });
      } else {
        sendResponse({
          success: true,
          message: "완료할 미완료 로그가 없습니다.",
        });
      }
    } catch (error) {
      log("error", "DEBUG: 미완료 로그 완료 처리 실패", error);
      sendResponse({ success: false, error: error.message });
    }
    return true;
  }

  return true;
});
