// TabbyMansion Background Service Worker
let isTabTrackerEnabled = false;
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
chrome.runtime.onInstalled.addListener(async () => {
  if (typeof debug !== "undefined")
    debug.serviceWorker("TabbyMansion 확장 프로그램이 설치되었습니다.");

  // 기본 설정 초기화
  await chrome.storage.local.set({
    isStopwatchEnabled: false,
    isTabTrackerEnabled: false,
    tabLogs: [],
    timerState: {
      status: "paused",
      startedAt: null,
      accumulatedMs: 0,
      label: "",
      lastSaveTime: null,
    },
  });

  // 기존 데이터 마이그레이션 수행
  await migrateLegacyStats();

  // 저장된 타이머 상태 로드
  await loadTimerState();
});

// Service Worker 시작 시 타이머 상태 복원
chrome.runtime.onStartup.addListener(async () => {
  if (typeof debug !== "undefined")
    debug.serviceWorker("TabbyMansion Service Worker 시작됨");
  await loadTimerState();
});

// Service Worker 활성화 시 타이머 상태 복원
self.addEventListener("activate", async event => {
  if (typeof debug !== "undefined")
    debug.serviceWorker("TabbyMansion Service Worker 활성화됨");
  await loadTimerState();
});

// Service Worker 종료 전 타이머 상태 저장
self.addEventListener("beforeunload", async event => {
  if (typeof debug !== "undefined")
    debug.serviceWorker("TabbyMansion Service Worker 종료 예정 - 상태 저장");
  if (timerState.status === "running") {
    await saveTimerState();
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
        if (typeof debug !== "undefined")
          debug.warn("저장된 타이머 상태가 유효하지 않습니다. 초기화합니다.");
        resetTimer();
        return;
      }

      timerState = { ...timerState, ...savedState };
      if (typeof debug !== "undefined")
        debug.timer("TabbyMansion 타이머 상태 로드됨:", {
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
          if (typeof debug !== "undefined")
            debug.timer(
              "타이머가 7일 이상 실행되어 리셋합니다 (비정상적인 상태)"
            );
          resetTimer();
        } else {
          // 타이머 상태를 현재 시간으로 업데이트하여 정확한 시간 계산
          timerState.startedAt = now;
          saveTimerState();
          broadcastTimerState();
          if (typeof debug !== "undefined")
            debug.timer("실행 중이던 타이머 복원됨:", {
              status: timerState.status,
              accumulatedMs: timerState.accumulatedMs,
              label: timerState.label,
            });
        }
      }
    }
  } catch (error) {
    console.error("❌ 타이머 상태 로드 실패:", error);
  }
}

// 타이머 상태 저장
async function saveTimerState() {
  try {
    // 저장 시간 기록
    timerState.lastSaveTime = Date.now();

    await chrome.storage.local.set({ timerState });
    if (typeof debug !== "undefined")
      debug.storage("타이머 상태 저장됨:", {
        status: timerState.status,
        accumulatedMs: timerState.accumulatedMs,
        label: timerState.label,
        lastSaveTime: new Date(timerState.lastSaveTime).toLocaleString(),
      });
  } catch (error) {
    console.error("❌ 타이머 상태 저장 실패:", error);
  }
}

// 타이머 시작
function startTimer(label = "") {
  if (timerState.status === "running") {
    if (typeof debug !== "undefined")
      debug.timer("타이머가 이미 실행 중입니다");
    return false;
  }

  timerState.status = "running";
  timerState.startedAt = Date.now();
  timerState.label = label;

  saveTimerState();
  broadcastTimerState();

  // 타이머 실행 중일 때 주기적으로 상태 저장 (Service Worker 재시작 대비)
  if (timerState.saveInterval) {
    clearInterval(timerState.saveInterval);
  }
  timerState.saveInterval = setInterval(() => {
    if (timerState.status === "running") {
      saveTimerState();
    }
  }, 30000); // 30초마다 저장

  if (typeof debug !== "undefined") debug.timer("타이머 시작:", timerState);
  return true;
}

// 타이머 일시정지
function pauseTimer() {
  if (timerState.status !== "running") {
    if (typeof debug !== "undefined")
      debug.timer("타이머가 실행 중이 아닙니다");
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
  if (typeof debug !== "undefined") debug.timer("타이머 일시정지:", timerState);
  return true;
}

// 타이머 리셋
function resetTimer() {
  if (typeof debug !== "undefined") debug.timer("타이머 리셋 시작");

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
  if (typeof debug !== "undefined") debug.timer("타이머 리셋 완료");
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
      console.log(
        "⚠️ 타이머 실행 시간이 비정상적으로 큽니다 (7일 이상). 리셋합니다."
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
  if (typeof debug !== "undefined")
    debug.timer("타이머 상태 브로드캐스트:", state);

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

// 기존 통계 데이터 마이그레이션 (titles 타입 정규화)
async function migrateLegacyStats() {
  try {
    if (typeof debug !== "undefined")
      debug.log("기존 통계 데이터 마이그레이션 시작...");

    const result = await chrome.storage.local.get([
      "dailyStats",
      "realTimeStats",
    ]);
    let migrationNeeded = false;

    // dailyStats 마이그레이션
    if (result.dailyStats) {
      const dailyStats = result.dailyStats;

      Object.keys(dailyStats).forEach(dayKey => {
        Object.keys(dailyStats[dayKey]).forEach(domain => {
          const bucket = dailyStats[dayKey][domain];

          if (bucket.titles && !Array.isArray(bucket.titles)) {
            // Set이나 다른 타입을 배열로 변환
            if (bucket.titles instanceof Set) {
              bucket.titles = Array.from(bucket.titles);
            } else if (typeof bucket.titles === "string") {
              bucket.titles = [bucket.titles];
            } else {
              bucket.titles = [];
            }
            migrationNeeded = true;
          }
        });
      });

      if (migrationNeeded) {
        await chrome.storage.local.set({ dailyStats });
        if (typeof debug !== "undefined")
          debug.log("dailyStats 마이그레이션 완료");
      }
    }

    if (typeof debug !== "undefined") debug.log("데이터 마이그레이션 완료");
  } catch (error) {
    console.error("❌ 데이터 마이그레이션 실패:", error);
  }
}

// 탭 활성화 이벤트 리스너
chrome.tabs.onActivated.addListener(async activeInfo => {
  if (typeof debug !== "undefined")
    debug.tracker("탭 활성화 이벤트:", activeInfo);

  const result = await chrome.storage.local.get(["isTabTrackerEnabled"]);
  if (typeof debug !== "undefined")
    debug.tracker("탭 트래커 상태:", result.isTabTrackerEnabled);

  if (!result.isTabTrackerEnabled) {
    if (typeof debug !== "undefined") debug.tracker("탭 트래커가 비활성화됨");
    return;
  }

  try {
    // 이전 탭의 종료 시간 기록
    if (currentTabId && tabStartTime) {
      if (typeof debug !== "undefined")
        debug.timer("이전 탭 종료 기록:", currentTabId, tabStartTime);
      await recordTabEndTime(currentTabId, tabStartTime);
    }

    const tab = await chrome.tabs.get(activeInfo.tabId);
    if (typeof debug !== "undefined")
      debug.tracker("새 탭 정보:", { title: tab.title, url: tab.url });

    currentTabId = activeInfo.tabId;
    tabStartTime = Date.now(); // 새 탭 시작 시간 기록

    await logTabActivity(tab, tabStartTime);
    if (typeof debug !== "undefined") debug.tracker("탭 활동 로그 저장 완료");
  } catch (error) {
    console.error("❌ 탭 정보 가져오기 실패:", error);
  }
});

// 탭 업데이트 이벤트 리스너 (URL 변경 등)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const result = await chrome.storage.local.get(["isTabTrackerEnabled"]);
  if (!result.isTabTrackerEnabled) return;

  // 현재 활성 탭이고 URL이 변경된 경우
  if (tabId === currentTabId && changeInfo.url) {
    // URL 변경 시에는 새로운 시작 시간으로 설정
    tabStartTime = Date.now();
    await logTabActivity(tab, tabStartTime);
  }
});

// 탭이 닫힐 때 실제 사용 시간을 기록
chrome.tabs.onRemoved.addListener(async (tabId, removeInfo) => {
  try {
    const tracker = await chrome.storage.local.get(["isTabTrackerEnabled"]);
    if (!tracker.isTabTrackerEnabled) return;

    // 현재 추적 중이던 탭이 닫힌 경우
    if (currentTabId === tabId && tabStartTime) {
      await recordTabEndTime(tabId, tabStartTime);
      currentTabId = null;
      tabStartTime = null;
      return;
    }

    // 비활성 탭이 닫힌 경우에도 마지막 미종료 로그가 있으면 정리
    const result = await chrome.storage.local.get(["tabLogs"]);
    const tabLogs = result.tabLogs || [];
    for (let i = tabLogs.length - 1; i >= 0; i--) {
      const log = tabLogs[i];
      if (log.tabId === tabId && !log.actualTime) {
        const start =
          typeof log.startTime === "number"
            ? log.startTime
            : new Date(log.timestamp).getTime();
        const actualTime = Date.now() - start;
        log.actualTime = actualTime;
        log.endTime = new Date().toISOString();
        break;
      }
    }
    await chrome.storage.local.set({ tabLogs });
  } catch (error) {
    console.error("탭 종료 처리 중 오류:", error);
  }
});

// 이전 탭 종료 시간 기록
async function recordTabEndTime(tabId, startTime) {
  // 탭 트래커 상태 확인
  const trackerResult = await chrome.storage.local.get(["isTabTrackerEnabled"]);
  if (!trackerResult.isTabTrackerEnabled) {
    if (typeof debug !== "undefined")
      debug.tracker("탭 트래커가 비활성화되어 종료 시간 기록을 건너뜁니다");
    return;
  }

  try {
    const result = await chrome.storage.local.get(["tabLogs"]);
    const tabLogs = result.tabLogs || [];

    // 가장 최근 로그 중에서 해당 탭의 로그 찾기
    for (let i = tabLogs.length - 1; i >= 0; i--) {
      const log = tabLogs[i];
      if (log.tabId === tabId && !log.actualTime) {
        // 실제 사용 시간 계산 및 저장
        const actualTime = Date.now() - startTime;
        log.actualTime = actualTime;
        log.endTime = new Date().toISOString();
        break;
      }
    }

    await chrome.storage.local.set({ tabLogs });
  } catch (error) {
    console.error("탭 종료 시간 기록 실패:", error);
  }
}

// 탭 활동 로그 저장
async function logTabActivity(tab, startTime = null) {
  // 탭 트래커 상태 확인
  const trackerResult = await chrome.storage.local.get(["isTabTrackerEnabled"]);
  if (!trackerResult.isTabTrackerEnabled) {
    if (typeof debug !== "undefined")
      debug.tracker("탭 트래커가 비활성화되어 데이터 저장을 건너뜁니다");
    return;
  }

  if (typeof debug !== "undefined")
    debug.tracker("탭 활동 로그 시작:", { title: tab.title, url: tab.url });

  if (
    !tab.url ||
    tab.url.startsWith("chrome://") ||
    tab.url.startsWith("chrome-extension://")
  ) {
    if (typeof debug !== "undefined") debug.tracker("제외된 URL:", tab.url);
    return;
  }

  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    title: tab.title || "제목 없음",
    url: tab.url,
    timeFormatted: new Date().toLocaleString("ko-KR"),
    sessionId: generateSessionId(),
    domain: extractDomain(tab.url),
    tabId: tab.id,
    startTime: startTime || Date.now(),
    actualTime: null, // 실제 사용 시간 (나중에 계산)
    endTime: null,
  };

  const result = await chrome.storage.local.get([
    "tabLogs",
    "dailyStats",
    "realTimeStats",
  ]);
  const tabLogs = result.tabLogs || [];

  tabLogs.push(logEntry);

  // 최근 1000개 로그만 유지 (더 많은 데이터 보존)
  if (tabLogs.length > 1000) {
    tabLogs.splice(0, tabLogs.length - 1000);
  }

  // 실시간 통계 업데이트
  await updateRealTimeStats(logEntry, result.realTimeStats || {});

  // 일별 통계 업데이트
  await updateDailyStats(logEntry, result.dailyStats || {});

  await chrome.storage.local.set({ tabLogs });

  if (typeof debug !== "undefined")
    debug.storage("로그 저장 완료:", {
      totalLogs: tabLogs.length,
      latestLog: {
        domain: logEntry.domain,
        title: logEntry.title.substring(0, 30),
        timestamp: logEntry.timeFormatted,
      },
    });
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

// 세션 ID 생성
function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// 실시간 통계 업데이트
async function updateRealTimeStats(logEntry, currentStats) {
  // 탭 트래커 상태 확인
  const trackerResult = await chrome.storage.local.get(["isTabTrackerEnabled"]);
  if (!trackerResult.isTabTrackerEnabled) {
    if (typeof debug !== "undefined")
      debug.tracker(
        "탭 트래커가 비활성화되어 실시간 통계 업데이트를 건너뜁니다"
      );
    return;
  }

  const now = new Date();
  const hourKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(now.getDate()).padStart(2, "0")}-${String(
    now.getHours()
  ).padStart(2, "0")}`;

  if (!currentStats[hourKey]) {
    currentStats[hourKey] = {};
  }

  if (!currentStats[hourKey][logEntry.domain]) {
    currentStats[hourKey][logEntry.domain] = {
      count: 0,
      lastVisit: logEntry.timestamp,
      totalTime: 0,
    };
  }

  currentStats[hourKey][logEntry.domain].count++;
  currentStats[hourKey][logEntry.domain].lastVisit = logEntry.timestamp;

  // 오래된 시간별 데이터 정리 (24시간 이상)
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  Object.keys(currentStats).forEach(key => {
    const keyDate = new Date(key.replace(/-/g, "/"));
    if (keyDate < twentyFourHoursAgo) {
      delete currentStats[key];
    }
  });

  await chrome.storage.local.set({ realTimeStats: currentStats });
}

// 일별 통계 업데이트 - titles 타입 안정성 개선
async function updateDailyStats(logEntry, currentStats) {
  // 탭 트래커 상태 확인
  const trackerResult = await chrome.storage.local.get(["isTabTrackerEnabled"]);
  if (!trackerResult.isTabTrackerEnabled) {
    console.log("🚫 탭 트래커가 비활성화되어 일별 통계 업데이트를 건너뜁니다");
    return;
  }

  const date = new Date(logEntry.timestamp);
  const dayKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
    2,
    "0"
  )}-${String(date.getDate()).padStart(2, "0")}`;

  if (!currentStats[dayKey]) {
    currentStats[dayKey] = {};
  }

  // 도메인별 버킷 생성 또는 가져오기
  const bucket = currentStats[dayKey][logEntry.domain] || {
    count: 0,
    firstVisit: logEntry.timestamp,
    lastVisit: logEntry.timestamp,
    titles: new Set(),
  };

  // titles 속성 타입 정규화 (Set 보장)
  if (!bucket.titles) {
    bucket.titles = new Set();
  } else if (Array.isArray(bucket.titles)) {
    // 스토리지에서 복원된 배열을 Set으로 변환
    bucket.titles = new Set(bucket.titles);
  } else if (typeof bucket.titles === "string") {
    // 문자열인 경우 단일 항목으로 Set 생성
    bucket.titles = new Set([bucket.titles]);
  } else if (!(bucket.titles instanceof Set)) {
    // 기타 타입인 경우 새 Set 생성
    bucket.titles = new Set();
  }

  // 통계 업데이트
  bucket.count++;
  bucket.lastVisit = logEntry.timestamp;
  bucket.titles.add(logEntry.title);

  // 버킷을 currentStats에 할당
  currentStats[dayKey][logEntry.domain] = bucket;

  // 스토리지 저장 전에 Set을 배열로 변환
  const statsToSave = JSON.parse(JSON.stringify(currentStats));
  Object.keys(statsToSave).forEach(dayKey => {
    Object.keys(statsToSave[dayKey]).forEach(domain => {
      if (currentStats[dayKey][domain].titles instanceof Set) {
        statsToSave[dayKey][domain].titles = Array.from(
          currentStats[dayKey][domain].titles
        );
      }
    });
  });

  // 30일 이상 된 데이터 정리
  const thirtyDaysAgo = new Date(date.getTime() - 30 * 24 * 60 * 60 * 1000);
  Object.keys(statsToSave).forEach(key => {
    const keyDate = new Date(key);
    if (keyDate < thirtyDaysAgo) {
      delete statsToSave[key];
      delete currentStats[key]; // 메모리에서도 제거
    }
  });

  await chrome.storage.local.set({ dailyStats: statsToSave });
}

// 메시지 처리
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (typeof debug !== "undefined")
    debug.log("백그라운드 메시지 수신:", request);

  if (request.action === "updateTabTracker") {
    isTabTrackerEnabled = request.enabled;
    if (typeof debug !== "undefined")
      debug.tracker("탭 트래커 상태 변경:", isTabTrackerEnabled);

    if (request.enabled) {
      // 현재 활성 탭 확인
      chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
        if (tabs[0]) {
          if (typeof debug !== "undefined")
            debug.tracker("초기 활성 탭 설정:", tabs[0].url);
          currentTabId = tabs[0].id;
          tabStartTime = Date.now();
          logTabActivity(tabs[0], tabStartTime);
        }
      });
    } else {
      // 탭 트래커 비활성화 시 추적 상태만 초기화 (데이터 수집 중단)
      if (typeof debug !== "undefined")
        debug.tracker("탭 트래커 비활성화 - 데이터 수집 중단");
      currentTabId = null;
      tabStartTime = null;
      if (typeof debug !== "undefined")
        debug.tracker("탭 트래커 비활성화 완료");
    }
    sendResponse({ success: true });
  }

  // 타이머 관련 메시지 처리
  else if (request.action === "TIMER_START") {
    const success = startTimer(request.label || "");
    sendResponse({ success, state: getTimerState() });
  } else if (request.action === "TIMER_PAUSE") {
    const success = pauseTimer();
    sendResponse({ success, state: getTimerState() });
  } else if (request.action === "TIMER_RESET") {
    const success = resetTimer();
    sendResponse({ success, state: getTimerState() });
  } else if (request.action === "TIMER_GET") {
    const state = getTimerState();
    sendResponse({ success: true, state });
  }

  return true;
});
