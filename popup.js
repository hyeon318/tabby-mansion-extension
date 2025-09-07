// TabbyMansion Popup Script
// 필요한 date-fns 함수들만 부분 import
import { format, startOfDay, endOfDay, isWithinInterval } from "date-fns";
import { ko } from "date-fns/locale";

// Chart.js에서 필요한 컴포넌트만 선택적 import
import {
  Chart,
  DoughnutController,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

// Debug 유틸리티 import
import { debug } from "./debug.js";

// 새로운 유틸리티 import
import { appState, applyI18n } from "./utils/state.js";
import { fmtDurationHM, fmtDurationSec } from "./utils/datetime.js";

// 필요한 Chart.js 컴포넌트만 등록
Chart.register(DoughnutController, ArcElement, Tooltip, Legend);

// 등록 확인
console.log(
  "Doughnut controller registered:",
  Chart.registry.getController("doughnut")
);

document.addEventListener("DOMContentLoaded", async () => {
  // 상태 초기화
  await appState.initialize();

  // i18n 초기화 보장
  if (typeof i18n !== "undefined") {
    await i18n.initialize();
  }

  const stopwatchToggle = document.getElementById("stopwatch-toggle");
  const tabTrackerToggle = document.getElementById("tab-tracker-toggle");
  const logsContainer = document.getElementById("logs-container");
  const chartContainer = document.getElementById("chart-container");
  const chartViewBtn = document.getElementById("chart-view-btn");
  const logViewBtn = document.getElementById("log-view-btn");
  const refreshBtn = document.getElementById("refresh-btn");
  const detailBtn = document.getElementById("detail-btn");
  const usageChart = document.getElementById("usage-chart");
  const chartLegend = document.getElementById("chart-legend");

  // 타이머 관련 요소들
  const timerDisplay = document.getElementById("timer-display");
  const timerLabel = document.getElementById("timer-label");
  const timerStartBtn = document.getElementById("timer-start-btn");
  const timerPauseBtn = document.getElementById("timer-pause-btn");
  const timerResetBtn = document.getElementById("timer-reset-btn");
  const timerLabelInput = document.getElementById("timer-label-input");

  // 타이머 상태 (백그라운드에서 받은 상태만 저장)
  let timerState = {
    status: "paused",
    startedAt: null,
    accumulatedMs: 0,
    label: "",
    currentElapsedMs: 0,
  };

  // 타이머 표시 업데이트 인터벌 (렌더링만 담당)
  let timerDisplayInterval = null;

  // 렌더 락과 디바운스를 위한 변수들
  let renderLock = false;
  let debouncedDisplayStats = null;

  // 디바운스 함수
  function debounce(func, delay) {
    let timeoutId;
    return function (...args) {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => func.apply(this, args), delay);
    };
  }

  // 디바운스된 displayStats 함수 생성
  debouncedDisplayStats = debounce(displayStats, 250);

  // 초기 상태 로드
  await loadInitialState();

  // 타이머 초기화
  await initializeTimer();

  // 오늘 날짜 표시
  updateTodayDate();

  // 패치 노트 표시
  await showPatchNotes();

  // 차트 및 로그 표시
  await displayStats();

  // 이벤트 리스너 설정 (DOM 요소들이 준비된 후)
  setupEventListeners();

  // 초기 상태 로드
  async function loadInitialState() {
    try {
      const result = await chrome.storage.local.get([
        "isStopwatchEnabled",
        "isTabTrackerEnabled",
      ]);

      if (result.isStopwatchEnabled) {
        stopwatchToggle.classList.add("active");
      }

      // 탭 트래커 기본값을 true로 설정 (undefined인 경우)
      if (result.isTabTrackerEnabled === undefined) {
        // 기본값을 true로 설정하고 저장
        await chrome.storage.local.set({ isTabTrackerEnabled: true });
        tabTrackerToggle.classList.add("active");
        console.log("탭 트래커 기본값을 true로 설정했습니다.");
      } else if (result.isTabTrackerEnabled) {
        tabTrackerToggle.classList.add("active");
      }
    } catch (error) {
      console.error("초기 상태 로드 실패:", error);
    }
  }

  // 패치 노트 표시
  async function showPatchNotes() {
    try {
      const currentVersion = chrome.runtime.getManifest().version;
      const result = await chrome.storage.local.get(["patchNotesSeen"]);

      // 패치 노트 메시지 가져오기
      const patchMessageKey = `patchMessageV${currentVersion.replace(
        /\./g,
        ""
      )}`;
      const patchMessage = i18n.getMessage(patchMessageKey);

      // 해당 버전의 패치 메시지가 없으면 패치 노트 영역 전체 숨김
      // i18n.getMessage()는 키를 찾지 못하면 키 값 자체를 반환하므로 이를 체크
      if (!patchMessage || patchMessage === patchMessageKey) {
        const patchNotesEl = document.getElementById("patch-notes");
        if (patchNotesEl) {
          patchNotesEl.style.display = "none";
        }
        return;
      }

      // 패치 노트를 이미 봤는지 확인
      if (result.patchNotesSeen === true) {
        const patchNotesEl = document.getElementById("patch-notes");
        if (patchNotesEl) {
          patchNotesEl.style.display = "none";
        }
        return; // 이미 봤으면 표시하지 않음
      }

      // 패치 노트 표시
      const patchNotesEl = document.getElementById("patch-notes");
      const patchMessageEl = document.getElementById("patch-message");
      const patchCloseBtn = document.getElementById("patch-close-btn");

      if (patchNotesEl && patchMessageEl && patchCloseBtn) {
        patchMessageEl.innerHTML = patchMessage;
        patchNotesEl.style.display = "block";

        // 확인 버튼 클릭 이벤트
        patchCloseBtn.addEventListener("click", async () => {
          // GA4 패치 노트 확인 이벤트
          try {
            await chrome.runtime.sendMessage({
              action: "GA4_EVENT",
              eventName: "patch_notes_dismissed",
              parameters: {
                version: currentVersion,
                patch_message_key: patchMessageKey,
              },
            });
          } catch (error) {
            console.warn("GA4 이벤트 전송 실패:", error);
          }

          patchNotesEl.style.display = "none";

          // 패치 노트를 봤다고 표시
          await chrome.storage.local.set({ patchNotesSeen: true });
        });
      }
    } catch (error) {
      console.warn("패치 노트 표시 실패:", error);
    }
  }

  // 타이머 초기화
  async function initializeTimer() {
    try {
      // 백그라운드에서 현재 타이머 상태 가져오기
      const response = await chrome.runtime.sendMessage({
        action: "TIMER_GET",
      });
      if (response.success) {
        timerState = response.state;
        updateTimerDisplay();
        updateTimerControls();
        startTimerDisplay();
      }
    } catch (error) {
      console.error("타이머 초기화 실패:", error);
    }
  }

  // 타이머 표시 업데이트 (백그라운드 상태에서 계산)
  function updateTimerDisplay() {
    const now = Date.now();
    let currentElapsed = timerState.accumulatedMs;

    if (timerState.status === "running" && timerState.startedAt) {
      currentElapsed += now - timerState.startedAt;
    }

    const formattedTime = formatTimerTime(currentElapsed);
    timerDisplay.textContent = formattedTime;

    if (timerState.label) {
      timerLabel.textContent = timerState.label;
      timerLabel.style.display = "block";
    } else {
      timerLabel.style.display = "none";
    }
  }

  // 타이머 시간 형식화 (HH:MM:SS)
  function formatTimerTime(milliseconds) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  // 타이머 컨트롤 버튼 상태 업데이트
  function updateTimerControls() {
    if (timerState.status === "running") {
      timerStartBtn.disabled = true;
      timerPauseBtn.disabled = false;
    } else {
      timerStartBtn.disabled = false;
      timerPauseBtn.disabled = true;
    }
  }

  // 타이머 표시 업데이트 시작 (렌더링만 담당)
  function startTimerDisplay() {
    if (timerDisplayInterval) {
      clearInterval(timerDisplayInterval);
    }

    // 다음 초 경계에 맞춰 업데이트 시작
    const now = Date.now();
    const nextSecond = Math.ceil(now / 1000) * 1000;
    const delay = nextSecond - now;

    setTimeout(() => {
      updateTimerDisplay();

      // 1초마다 업데이트 (시각적 일관성을 위해)
      timerDisplayInterval = setInterval(() => {
        updateTimerDisplay();
      }, 1000);
    }, delay);
  }

  // 타이머 시작
  async function startTimer() {
    try {
      const label = timerLabelInput.value.trim();
      const response = await chrome.runtime.sendMessage({
        action: "TIMER_START",
        label: label,
      });

      if (response.success) {
        timerState = response.state;
        updateTimerDisplay();
        updateTimerControls();
        startTimerDisplay();
        timerLabelInput.value = ""; // 라벨 입력 필드 초기화
      }
    } catch (error) {
      console.error("타이머 시작 실패:", error);
    }
  }

  // 타이머 일시정지
  async function pauseTimer() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "TIMER_PAUSE",
      });

      if (response.success) {
        timerState = response.state;
        updateTimerDisplay();
        updateTimerControls();
        startTimerDisplay();
      }
    } catch (error) {
      console.error("타이머 일시정지 실패:", error);
    }
  }

  // 타이머 리셋
  async function resetTimer() {
    try {
      const response = await chrome.runtime.sendMessage({
        action: "TIMER_RESET",
      });

      if (response.success) {
        timerState = response.state;
        updateTimerDisplay();
        updateTimerControls();
        startTimerDisplay();
        timerLabelInput.value = ""; // 라벨 입력 필드 초기화
      }
    } catch (error) {
      console.error("타이머 리셋 실패:", error);
    }
  }

  // 이벤트 리스너 설정
  function setupEventListeners() {
    // DOM 요소들이 존재하는지 확인
    if (!stopwatchToggle || !tabTrackerToggle || !detailBtn) {
      console.error("필요한 DOM 요소를 찾을 수 없습니다:", {
        stopwatchToggle: !!stopwatchToggle,
        tabTrackerToggle: !!tabTrackerToggle,
        detailBtn: !!detailBtn,
      });
      return;
    }

    // 타이머 버튼 이벤트
    timerStartBtn.addEventListener("click", startTimer);
    timerPauseBtn.addEventListener("click", pauseTimer);
    timerResetBtn.addEventListener("click", resetTimer);

    // 라벨 입력 필드 엔터 키 이벤트
    timerLabelInput.addEventListener("keypress", e => {
      if (e.key === "Enter") {
        startTimer();
      }
    });

    // 스톱워치 토글
    stopwatchToggle.addEventListener("click", async () => {
      const isEnabled = !stopwatchToggle.classList.contains("active");
      stopwatchToggle.classList.toggle("active");

      // GA4 스톱워치 토글 이벤트
      try {
        await chrome.runtime.sendMessage({
          action: "GA4_EVENT",
          eventName: "stopwatch_toggled",
          parameters: { enabled: isEnabled },
        });
      } catch (error) {
        console.warn("GA4 이벤트 전송 실패:", error);
      }

      try {
        await chrome.storage.local.set({ isStopwatchEnabled: isEnabled });

        // 모든 탭에 메시지 전송
        const tabs = await chrome.tabs.query({});
        for (const tab of tabs) {
          if (
            tab.url &&
            !tab.url.startsWith("chrome://") &&
            !tab.url.startsWith("chrome-extension://")
          ) {
            try {
              await chrome.tabs.sendMessage(tab.id, {
                action: "toggleStopwatch",
                enabled: isEnabled,
              });
            } catch (error) {
              // 일부 탭에서는 메시지 전송이 실패할 수 있음 (무시)
            }
          }
        }
      } catch (error) {
        console.error("스톱워치 토글 실패:", error);
        stopwatchToggle.classList.toggle("active"); // 실패시 원상복구
      }
    });

    // 탭 추적기 토글
    tabTrackerToggle.addEventListener("click", async () => {
      console.log("탭 추적기 토글 클릭됨");
      const isEnabled = !tabTrackerToggle.classList.contains("active");
      debug.tracker("탭 트래커 토글:", isEnabled);

      tabTrackerToggle.classList.toggle("active");

      try {
        await chrome.storage.local.set({ isTabTrackerEnabled: isEnabled });
        debug.storage("탭 트래커 상태 저장됨:", isEnabled);

        // 탭 트래커를 비활성화할 때 기존 데이터 정리
        // if (!isEnabled) {
        //   console.log("🗑️ 탭 트래커 비활성화 - 기존 데이터 정리");
        //   await chrome.storage.local.set({
        //     tabLogs: [],
        //     dailyStats: {},
        //     realTimeStats: {},
        //   });
        // }

        // 백그라운드 스크립트에 상태 알림
        const response = await chrome.runtime.sendMessage({
          action: "updateTabTracker",
          enabled: isEnabled,
        });
        debug.log("백그라운드 응답:", response);

        // 통계 표시 업데이트 (디바운스 적용)
        debouncedDisplayStats();
        debug.tracker("통계 업데이트 요청 완료");

        // 경고 메시지 업데이트
        if (isEnabled) {
          hideTabTrackerWarning();
        } else {
          showTabTrackerWarning();
        }
      } catch (error) {
        console.error("❌ 탭 추적기 토글 실패:", error);
        tabTrackerToggle.classList.toggle("active"); // 실패시 원상복구
      }
    });

    // 뷰 전환 버튼
    chartViewBtn.addEventListener("click", () => {
      chartViewBtn.classList.add("active");
      logViewBtn.classList.remove("active");
      chartContainer.style.display = "block";
      logsContainer.style.display = "none";
    });

    logViewBtn.addEventListener("click", () => {
      logViewBtn.classList.add("active");
      chartViewBtn.classList.remove("active");
      chartContainer.style.display = "none";
      logsContainer.style.display = "block";
    });

    // 새로고침 버튼 - 디바운스 적용
    refreshBtn.addEventListener("click", async () => {
      if (refreshBtn.disabled) return;

      // 이미지를 wink로 변경
      const refreshBtnImage = document.getElementById(
        "popup-refresh-btn-image"
      );
      if (refreshBtnImage) {
        refreshBtnImage.src = "public/images/wink.png";
      }

      refreshBtn.disabled = true;

      try {
        await displayStats();

        // 시각적 피드백을 위해 잠시 대기
        await new Promise(resolve => setTimeout(resolve, 300));
      } catch (error) {
        console.error("새로고침 실패:", error);
      } finally {
        refreshBtn.disabled = false;

        // 1초 후 이미지를 normal로 변경
        setTimeout(() => {
          const refreshBtnImage = document.getElementById(
            "popup-refresh-btn-image"
          );
          if (refreshBtnImage) {
            refreshBtnImage.src = "public/images/normal.png";
          }
        }, 1000);
      }
    });

    // 상세보기 버튼
    detailBtn.addEventListener("click", async () => {
      console.log("상세보기 버튼 클릭됨");

      // GA4 상세보기 클릭 이벤트
      try {
        await chrome.runtime.sendMessage({
          action: "GA4_EVENT",
          eventName: "stats_page_opened",
          parameters: {},
        });
      } catch (error) {
        console.warn("GA4 이벤트 전송 실패:", error);
      }

      try {
        // 새 탭에서 상세페이지 열기
        chrome.tabs.create({
          url: chrome.runtime.getURL("stats.html"),
          active: true,
        });
      } catch (error) {
        console.error("상세보기 페이지 열기 실패:", error);
      }
    });
  }

  // 통계 표시 (차트 + 로그) - 렌더 락 적용
  async function displayStats() {
    if (renderLock) {
      debug.log("렌더링이 이미 진행 중입니다. 건너뜁니다.");
      return;
    }

    renderLock = true;

    try {
      // 탭 트래커 상태 확인 및 경고 표시
      const result = await chrome.storage.local.get(["isTabTrackerEnabled"]);
      const isTrackerEnabled =
        result.isTabTrackerEnabled !== undefined
          ? result.isTabTrackerEnabled
          : true;

      if (!isTrackerEnabled) {
        showTabTrackerWarning();
      } else {
        hideTabTrackerWarning();
      }
    } catch (error) {
      console.error("탭 트래커 상태 확인 실패:", error);
    }
    try {
      await displayChart();
      await displayLogs();
    } catch (error) {
      console.error("📊 통계 표시 중 오류:", error);
    } finally {
      renderLock = false;
    }
  }

  // 차트 표시 - 안전한 데이터 읽기 사용
  async function displayChart() {
    try {
      const result = await getSafeStorageData();
      const tabLogs = result.tabLogs || [];
      const isTrackerEnabled =
        result.isTabTrackerEnabled !== undefined
          ? result.isTabTrackerEnabled
          : true;

      // 오늘 데이터만 필터링
      const todayLogs = filterTodayData(tabLogs);

      if (todayLogs.length === 0) {
        drawEmptyChart();
        const noLogsMessage =
          i18n.getMessage("noLogsToday") || "오늘 기록이 없습니다";
        chartLegend.innerHTML = `<div class="no-logs">${noLogsMessage}</div>`;
        return;
      }

      // 사이트별 사용 시간 계산
      const siteUsage = await calculateSiteUsage(todayLogs);

      // 차트 그리기
      drawUsageChart(siteUsage);

      // 범례 표시
      displayChartLegend(siteUsage);
    } catch (error) {
      console.error("차트 표시 실패:", error);
      drawEmptyChart();
      chartLegend.innerHTML =
        '<div class="no-logs">차트 표시 중 오류가 발생했습니다</div>';
    }
  }

  // 로그 표시 - 안전한 데이터 읽기 사용
  async function displayLogs() {
    try {
      const result = await getSafeStorageData();
      const tabLogs = result.tabLogs || [];
      const isTrackerEnabled =
        result.isTabTrackerEnabled !== undefined
          ? result.isTabTrackerEnabled
          : true;

      // 오늘 데이터만 필터링
      const todayLogs = filterTodayData(tabLogs);

      if (todayLogs.length === 0) {
        const noLogsMessage =
          i18n.getMessage("noLogsToday") || "오늘 기록이 없습니다";
        logsContainer.innerHTML = `<div class="no-logs">${noLogsMessage}</div>`;
        return;
      }

      // 최신 로그부터 표시 (최대 20개)
      const recentLogs = todayLogs.slice(-20).reverse();

      logsContainer.innerHTML = recentLogs
        .map(
          log => `
        <div class="log-item">
          <div class="log-time">${log.timeFormatted}</div>
          <div class="log-title">${escapeHtml(log.title)}</div>
          <div class="log-url">${escapeHtml(truncateUrl(log.url))}</div>
        </div>
      `
        )
        .join("");

      // 스크롤을 맨 위로
      logsContainer.scrollTop = 0;
    } catch (error) {
      console.error("로그 표시 실패:", error);
      logsContainer.innerHTML =
        '<div class="no-logs">로그 표시 중 오류가 발생했습니다</div>';
    }
  }

  // HTML 이스케이프
  function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  // 탭 트래커 경고 표시
  function showTabTrackerWarning() {
    // 기존 경고가 있으면 제거
    hideTabTrackerWarning();

    const warningHtml = `
      <div id="popup-tab-tracker-warning" style="
        background: linear-gradient(135deg, #ff6b6b, #ee5a24);
        color: white;
        padding: 10px 15px;
        border-radius: 8px;
        margin-bottom: 15px;
        font-size: 12px;
        text-align: center;
        box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      ">
        <div style="display: flex; align-items: center; justify-content: center; gap: 8px;">
          <span style="font-size: 16px;">⚠️</span>
          <div>
            <div style="font-weight: bold; margin-bottom: 2px;">${
              i18n.getMessage("popupTrackerOffTitle") ||
              "탭 추적이 비활성화되어 있습니다"
            }</div>
            <div style="opacity: 0.9; font-size: 11px;">
              ${
                i18n.getMessage("popupTrackerOffDesc") ||
                "시간 추적을 시작하려면 활성화해주세요"
              }
            </div>
          </div>
        </div>
      </div>
    `;

    // 차트 컨테이너 앞에 경고 삽입
    const chartContainer = document.getElementById("chart-container");
    if (chartContainer) {
      chartContainer.insertAdjacentHTML("beforebegin", warningHtml);
    }
  }

  // 탭 트래커 경고 숨기기
  function hideTabTrackerWarning() {
    const warning = document.getElementById("popup-tab-tracker-warning");
    if (warning) {
      warning.remove();
    }
  }

  // 오늘 날짜 표시
  function updateTodayDate() {
    // i18n 유틸에서 처리하도록 위임
    if (typeof i18n !== "undefined" && i18n.updateDateFormatElements) {
      i18n.updateDateFormatElements();
    }
  }

  // URL 길이 제한
  function truncateUrl(url) {
    if (url.length <= 50) return url;
    return url.substring(0, 47) + "...";
  }

  // 오늘 데이터만 필터링
  function filterTodayData(tabLogs) {
    const today = new Date();
    const todayStart = startOfDay(today);
    const todayEnd = endOfDay(today);

    return tabLogs.filter(log => {
      const logDate = new Date(log.timestamp);
      return isWithinInterval(logDate, { start: todayStart, end: todayEnd });
    });
  }

  // 사이트별 사용 시간 계산
  async function calculateSiteUsage(tabLogs) {
    const siteData = {};
    const averageTabTime = 5000; // 기본 5초 추정 (과대계산 방지)

    // 탭 트래커 상태 확인
    const result = await chrome.storage.local.get(["isTabTrackerEnabled"]);
    const isTrackerEnabled = result.isTabTrackerEnabled || false;

    // 각 로그에 대해 사이트별로 시간 계산
    for (let i = 0; i < tabLogs.length; i++) {
      const log = tabLogs[i];
      const domain = extractDomain(log.url);

      if (!siteData[domain]) {
        siteData[domain] = {
          domain,
          title: log.title.substring(0, 30),
          timeSpent: 0,
          visits: 0,
        };
      }

      // 실제 사용 시간이 있으면 그것을 사용, 없으면 추정
      let timeSpent;
      if (log.actualTime && log.actualTime > 0) {
        // 실제 측정된 시간 사용
        timeSpent = log.actualTime;
      } else if (i < tabLogs.length - 1) {
        // 다음 로그와의 시간 차이 계산
        const nextLog = tabLogs[i + 1];
        const timeDiff = new Date(nextLog.timestamp) - new Date(log.timestamp);
        // 3시간 이내의 차이만 유효한 사용 시간으로 간주
        if (timeDiff > 0 && timeDiff < 10800000) {
          timeSpent = timeDiff;
        } else {
          timeSpent = averageTabTime;
        }
      } else {
        // 마지막 로그인 경우, 기본값 사용 (실시간 계산 제거)
        timeSpent = averageTabTime;
      }

      siteData[domain].timeSpent += timeSpent;
      siteData[domain].visits++;
    }

    // 사용 시간 순으로 정렬하고 상위 10개만 반환
    return Object.values(siteData)
      .sort((a, b) => b.timeSpent - a.timeSpent)
      .slice(0, 10);
  }

  // 도메인 추출
  function extractDomain(url) {
    try {
      const hostname = new URL(url).hostname;
      return hostname.replace("www.", "");
    } catch {
      return "알 수 없음";
    }
  }

  // 차트 그리기
  // Chart.js 인스턴스 저장용 (전역 스코프에서 관리)
  if (typeof window.popupPie !== "undefined") {
    window.popupPie = null;
  }

  // 안전한 차트 인스턴스 삭제 함수
  function destroyPopupChart() {
    // Chart.getChart로 기존 인스턴스 확인
    const existingChart = Chart.getChart(usageChart);
    if (existingChart) {
      debug.chart("기존 차트 인스턴스 삭제 중...");
      existingChart.destroy();
    }

    // 전역 참조도 정리
    if (window.popupPie) {
      window.popupPie = null;
    }
  }

  // 안전한 스토리지 데이터 읽기 (날짜별 로그 포함)
  async function getSafeStorageData() {
    try {
      // 새로운 구조의 tabLogs 로드
      const tabLogsResult = await chrome.storage.local.get(["tabLogs"]);
      const tabLogs = tabLogsResult.tabLogs || {};

      // 모든 날짜별 tabLogs를 합치기
      let allTabLogs = [];
      Object.values(tabLogs).forEach(dailyLogs => {
        allTabLogs.push(...dailyLogs);
      });

      // 시간순 정렬
      allTabLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      const trackerResult = await chrome.storage.local.get([
        "isTabTrackerEnabled",
      ]);

      return {
        tabLogs: allTabLogs,
        isTabTrackerEnabled:
          trackerResult.isTabTrackerEnabled !== undefined
            ? trackerResult.isTabTrackerEnabled
            : true,
      };
    } catch (error) {
      console.error("스토리지 데이터 읽기 실패:", error);
      return { tabLogs: [], isTabTrackerEnabled: true };
    }
  }

  function drawUsageChart(siteUsage) {
    // 안전한 차트 인스턴스 제거
    destroyPopupChart();

    const total = siteUsage.reduce((sum, site) => sum + site.timeSpent, 0);

    // totalSeconds === 0인 경우 빈 상태 표시
    if (total === 0) {
      drawEmptyChart();
      return;
    }

    // 차트 캔버스 표시
    usageChart.style.display = "block";
    hideEmptyChart();

    const ctx = usageChart.getContext("2d");

    // 퍼센티지 계산 및 도메인 정규화
    const dataWithPercentages = siteUsage.map((item, index) => ({
      ...item,
      domain: normalizeDomain(item.domain || item.url), // eTLD+1 정규화
      percentage: total > 0 ? ((item.timeSpent / total) * 100).toFixed(1) : 0,
      color: getChartColor(index),
    }));

    debug.chart("Creating donut chart with data:", dataWithPercentages);

    // Chart.js 도넛 차트 생성 (리팩토링된 버전)
    window.popupPie = new Chart(ctx, {
      type: "doughnut",
      data: {
        labels: dataWithPercentages.map(item => item.domain),
        datasets: [
          {
            data: dataWithPercentages.map(item => item.timeSpent),
            backgroundColor: dataWithPercentages.map(item => item.color),
            borderWidth: 1,
            borderColor: "#ffffff",
            hoverBorderWidth: 2,
            // 모든 데이터 라벨 비활성화
            datalabels: {
              display: false,
            },
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        aspectRatio: 1, // 정원 형태 유지
        animation: {
          duration: 200, // 적당한 애니메이션
        },
        layout: {
          padding: 10, // 툴팁을 위한 충분한 패딩
        },
        // 인터랙션 설정
        interaction: {
          mode: "nearest",
          intersect: true,
        },
        // 도넛 홀 크기
        cutout: "55%",
        // 요소 설정
        elements: {
          arc: {
            borderWidth: 1,
            borderAlign: "inner",
          },
        },
        plugins: {
          // 데이터 라벨 플러그인 비활성화
          datalabels: {
            display: false,
          },
          // 툴팁 설정 - 도메인 이름만 표시
          tooltip: {
            enabled: true,
            position: "nearest",
            backgroundColor: "rgba(0, 0, 0, 0.9)",
            titleColor: "#fff",
            bodyColor: "#fff",
            borderColor: "#ffffff",
            borderWidth: 1,
            cornerRadius: 6,
            padding: 8,
            titleFont: { size: 12, weight: "bold" },
            bodyFont: { size: 11 },
            displayColors: true,
            caretPadding: 6,
            callbacks: {
              title: items => items[0]?.label ?? "",
              label: function (context) {
                const dataIndex = context.dataIndex;
                const item = dataWithPercentages[dataIndex];
                if (item) {
                  const timeText = formatDuration(item.timeSpent);
                  return `${timeText} (${item.percentage}%)`;
                }
                return "";
              },
            },
          },
          // 범례 비활성화 (커스텀 HTML 범례 사용)
          legend: {
            display: false,
          },
        },
      },
    });
  }

  // 도메인 정규화 함수 (eTLD+1)
  function normalizeDomain(url) {
    if (!url) return getMessage("unknown") || "알 수 없음";

    try {
      const hostname = new URL(
        url.startsWith("http") ? url : `https://${url}`
      ).hostname.toLowerCase();

      // www. 제거
      const withoutWww = hostname.replace(/^www\./, "");

      // 간단한 eTLD+1 추출 (주요 도메인들)
      const parts = withoutWww.split(".");
      if (parts.length >= 2) {
        // 일반적인 경우: domain.com
        if (parts.length === 2) {
          return withoutWww;
        }

        // co.kr, com.au 등의 경우 처리
        const lastTwo = parts.slice(-2).join(".");
        const commonTlds = ["co.kr", "co.jp", "co.uk", "com.au", "com.br"];

        if (commonTlds.includes(lastTwo) && parts.length >= 3) {
          return parts.slice(-3).join(".");
        }

        // 기본적으로 마지막 두 부분 반환
        return lastTwo;
      }

      return withoutWww;
    } catch {
      return url.toString();
    }
  }

  // 빈 차트 그리기
  function drawEmptyChart() {
    // 차트 캔버스 숨기기
    usageChart.style.display = "none";

    // 빈 상태 메시지 표시
    const container = usageChart.parentElement;
    let emptyDiv = container.querySelector(".empty-chart-message");

    if (!emptyDiv) {
      emptyDiv = document.createElement("div");
      emptyDiv.className = "empty-chart-message";
      emptyDiv.style.cssText = `
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 160px;
      width: 160px;
      color: rgba(255, 255, 255, 0.8);
      font-size: 13px;
      text-align: center;
      margin: 0 auto;
    `;
      container.appendChild(emptyDiv);
    }

    emptyDiv.innerHTML = `
    <div style="font-size: 28px; margin-bottom: 8px;">📊</div>
    <div>데이터 없음</div>
  `;
    emptyDiv.style.display = "flex";
  }

  function hideEmptyChart() {
    const container = usageChart.parentElement;
    const emptyDiv = container.querySelector(".empty-chart-message");
    if (emptyDiv) {
      emptyDiv.style.display = "none";
    }
  }

  // 차트 범례 표시
  function displayChartLegend(siteUsage) {
    if (siteUsage.length === 0) {
      const noDataMessage =
        i18n.getMessage("noDataTitle") || "데이터가 없습니다";
      chartLegend.innerHTML = `<div class="no-logs">${noDataMessage}</div>`;
      return;
    }

    chartLegend.innerHTML = siteUsage
      .map(
        (site, index) => `
      <div class="legend-item">
        <div style="display: flex; align-items: center; flex: 1;">
          <div class="legend-color" style="background-color: ${getChartColor(
            index
          )}"></div>
          <div class="legend-label">${escapeHtml(
            normalizeDomain(site.domain || site.url)
          )}</div>
        </div>
                        <div class="legend-time">${fmtDurationHM(
                          site.timeSpent,
                          true
                        )}</div>
      </div>
    `
      )
      .join("");
  }

  // 차트 색상 생성
  function getChartColor(index) {
    const colors = [
      "#FF6B6B",
      "#4ECDC4",
      "#45B7D1",
      "#96CEB4",
      "#FFEAA7",
      "#DDA0DD",
      "#98D8C8",
      "#F7DC6F",
      "#BB8FCE",
      "#85C1E9",
    ];
    return colors[index % colors.length];
  }

  // 기존 formatTime 함수 제거 - utils/datetime.js의 fmtDurationHM 사용

  // 로그 실시간 업데이트를 위한 스토리지 변경 리스너 - 디바운스 적용
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === "local") {
      if (changes.tabLogs) {
        debug.storage("스토리지 변경 감지, 디바운스된 업데이트 실행");
        debouncedDisplayStats();
      }

      // 타이머 상태 변경 감지
      if (changes.timerState) {
        debug.timer("타이머 상태 변경 감지");
        timerState = changes.timerState.newValue;
        updateTimerDisplay();
        updateTimerControls();
        startTimerDisplay();
      }
    }
  });
});
