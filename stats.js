// TabbyMansion Stats Script
// 필요한 date-fns 함수들만 부분 import
// Debug 유틸리티 import
import { debug } from "./debug.js";

// 새로운 유틸리티 import
import { appState, applyI18n } from "./utils/state.js";
import {
  fmtDurationHM,
  fmtDurationSec,
  fmtDateRange,
  fmtTimeListDate,
  fmtSiteListDate,
} from "./utils/datetime.js";

import {
  format,
  startOfDay,
  endOfDay,
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  differenceInMinutes,
  differenceInHours,
  differenceInDays,
  isWithinInterval,
  parseISO,
} from "date-fns";
import { ko, ja, enUS } from "date-fns/locale";

// date-fns를 전역으로 노출
if (typeof window !== "undefined") {
  window.dateFns = {
    format,
    formatInTimeZone,
    toZonedTime,
    fromZonedTime,
    getTimezoneOffset,
    startOfDay,
    endOfDay,
    startOfWeek,
    endOfWeek,
    startOfMonth,
    endOfMonth,
    differenceInMinutes,
    differenceInHours,
    differenceInDays,
    isWithinInterval,
    parseISO,
  };
  window.dateFnsLocales = { ko, ja, enUS };
}

// date-fns-tz에서 필요한 함수들만 부분 import
import {
  formatInTimeZone,
  toZonedTime,
  fromZonedTime,
  getTimezoneOffset,
} from "date-fns-tz";

// Chart.js에서 필요한 컴포넌트만 선택적 import
import { Chart } from "chart.js";
import {
  LineController,
  BarController,
  DoughnutController,
  LineElement,
  BarElement,
  ArcElement,
  PointElement,
  LinearScale,
  CategoryScale,
  TimeScale,
  Tooltip,
  Legend,
  Title,
} from "chart.js";

// 필요한 Chart.js 컴포넌트만 등록
Chart.register(
  LineController,
  BarController,
  DoughnutController,
  LineElement,
  BarElement,
  ArcElement,
  PointElement,
  LinearScale,
  CategoryScale,
  TimeScale,
  Tooltip,
  Legend,
  Title
);

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

  // =========================================================================
  // DOM 요소들
  // =========================================================================
  const totalTimeEl = document.getElementById("total-time");
  const totalSitesEl = document.getElementById("total-sites");
  const totalSessionsEl = document.getElementById("total-sessions");
  const currentSessionsEl = document.getElementById("current-sessions");

  const startDateEl = document.getElementById("start-date");
  const endDateEl = document.getElementById("end-date");
  const startTimeEl = document.getElementById("start-time");
  const endTimeEl = document.getElementById("end-time");
  const timezoneSelectEl = document.getElementById("timezone-select");
  const applyFilterBtn = document.getElementById("apply-filter");
  const siteFilterEl = document.getElementById("site-filter");

  const viewDailyBtn = document.getElementById("view-daily");
  const viewHourlyBtn = document.getElementById("view-hourly");
  const viewWeeklyBtn = document.getElementById("view-weekly");

  const timeChartEl = document.getElementById("time-chart");
  const distributionChartEl = document.getElementById("distribution-chart");
  const timelineContainer = document.getElementById("timeline-container");
  const refreshDataBtn = document.getElementById("refresh-data");
  const resetFilterBtn = document.getElementById("reset-filter");
  const exportDataBtn = document.getElementById("export-data");
  const timeListContainer = document.getElementById("time-list-container");

  const resultsSection = document.getElementById("results-section");
  const resultsPeriod = document.getElementById("results-period");

  // 기록 관리 관련 요소들
  const deleteDateEl = document.getElementById("delete-date");
  const deleteDateBtn = document.getElementById("delete-date-btn");
  const deleteAllBtn = document.getElementById("delete-all-btn");

  // =========================================================================
  // 전역 변수들
  // =========================================================================
  let allTabLogs = [];
  let filteredData = [];
  let currentView = "daily";
  let currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  let currentLocale = navigator.language || "ko-KR";
  let isTabTrackerEnabled = true; // 탭 트래커 상태 전역 변수 (기본값 true)

  let currentFilters = {
    startDate: null,
    endDate: null,
    site: "",
  };

  // Chart.js 인스턴스들
  let timeChart = null;
  let distributionChart = null;

  // 디바운싱
  let queryDebounceTimer = null;

  // =========================================================================
  // 유틸리티 함수들
  // =========================================================================

  /** 안전한 HTML 출력용 escape */
  function esc(s = "") {
    return String(s).replace(
      /[&<>"']/g,
      m =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[m])
    );
  }

  /** DOM 요소 존재 여부 확인 */
  function validateDOMElements() {
    const requiredElements = [
      "total-time",
      "total-sites",
      "total-sessions",
      "current-sessions",
      "start-date",
      "end-date",
      "start-time",
      "end-time",
      "timezone-select",
      "apply-filter",
      "site-filter",
      "view-daily",
      "view-hourly",
      "view-weekly",
      "time-chart",
      "distribution-chart",
      "timeline-container",
      "refresh-data",
      "reset-filter",
      "export-data",
      "time-list-container",
      "results-section",
      "results-period",
    ];
    const missing = requiredElements.filter(id => !document.getElementById(id));
    if (missing.length) {
      console.warn("Missing DOM elements:", missing);
      return false;
    }
    return true;
  }

  /** 시간 포맷팅 */
  // 기존 formatDuration 함수 제거 - utils/datetime.js의 fmtDurationSec 사용

  /** 날짜 포맷팅 - 인풋 value용(yyyy-MM-dd) */
  function formatDateForInputTZ(date, tz) {
    if (typeof formatInTimeZone === "undefined") {
      throw new Error("date-fns-tz is required for timezone handling");
    }
    return formatInTimeZone(date, tz, "yyyy-MM-dd");
  }

  // 기존 formatDateLabel 함수 제거 - utils/datetime.js의 fmtTimeListDate 사용

  // =========================================================================
  // Google Analytics 4 추적
  // =========================================================================

  // GA4 이벤트 전송 함수
  async function sendGA4Event(eventName, parameters = {}) {
    try {
      await chrome.runtime.sendMessage({
        action: "GA4_EVENT",
        eventName: eventName,
        parameters: parameters,
      });
    } catch (error) {
      console.warn("GA4 이벤트 전송 실패:", error);
    }
  }

  // =========================================================================
  // 데이터 로딩 및 필터링
  // =========================================================================

  /** 탭 로그 데이터 로드 */
  async function loadData() {
    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.storage &&
        chrome.runtime &&
        chrome.runtime.id
      ) {
        const result = await chrome.storage.local.get([
          "tabLogs",
          "isTabTrackerEnabled",
          "dailyStats",
        ]);
        allTabLogs = result.tabLogs || [];
        isTabTrackerEnabled =
          result.isTabTrackerEnabled !== undefined
            ? result.isTabTrackerEnabled
            : true;

        // dailyStats titles 정규화(참조용)
        if (result.dailyStats) {
          Object.keys(result.dailyStats).forEach(dayKey => {
            Object.keys(result.dailyStats[dayKey]).forEach(domain => {
              const bucket = result.dailyStats[dayKey][domain];
              if (bucket.titles && !Array.isArray(bucket.titles)) {
                if (bucket.titles instanceof Set)
                  bucket.titles = Array.from(bucket.titles);
                else if (typeof bucket.titles === "string")
                  bucket.titles = [bucket.titles];
                else bucket.titles = [];
              }
            });
          });
        }
      } else {
        // 확장 외부 접근 가드
        document.body.innerHTML = `
          <div style="
            display:flex;flex-direction:column;align-items:center;justify-content:center;
            height:100vh;font-family:Arial,sans-serif;text-align:center;padding:20px;
            background:linear-gradient(135deg,#667eea 0%, #764ba2 100%);color:white;">
            <h1>🚫 접근 제한</h1>
            <p>이 페이지는 Chrome Extension에서만 접근할 수 있습니다.</p>
            <p>확장 프로그램 팝업에서 "상세보기" 버튼을 클릭해주세요.</p>
          </div>`;
        return;
      }
    } catch (error) {
      console.error("Error loading data:", error);
      allTabLogs = [];
    } finally {
      // 로드 후 정렬/인덱스 캐시 무효화
      invalidateLogsSortedCache();
    }
  }

  /** 데이터 필터링 - 시간순 정렬 포함 */
  function filterData() {
    if (!currentFilters.startDate || !currentFilters.endDate) {
      filteredData = allTabLogs.slice();
    } else {
      filteredData = allTabLogs.filter(record => {
        const ts = new Date(record.timestamp);
        return (
          ts >= currentFilters.startDate &&
          ts <= currentFilters.endDate &&
          (!currentFilters.site || record.domain === currentFilters.site)
        );
      });
    }
    // 중복 제거
    const seen = new Set();
    const deduped = [];
    for (const rec of filteredData) {
      const tsMs = new Date(rec.timestamp).getTime();
      const key = `${tsMs}|${rec.tabId || ""}|${rec.url || ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(rec);
    }
    filteredData = deduped;

    // 시간순 정렬(오름차순)
    filteredData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  // =========================================================================
  // 시간 계산 유틸리티들
  // =========================================================================

  /** 추정 초(가드 포함) */
  function getEstimatedTimeInSeconds(log, index = 0, logs = []) {
    const timeMs = getEstimatedTime(log, index, logs);
    const sec = Math.round(timeMs / 1000);
    return Number.isFinite(sec) ? Math.max(0, sec) : 0;
  }

  /** 추정 ms(동일 탭/전역 next, endTime, actualTime 고려) */
  function getEstimatedTime(log, index = 0, logs = []) {
    const AVERAGE = 30000; // 30s
    const MAX_TIME = 1800000; // 30분으로 제한 (2시간 59분 문제 해결)

    if (log.actualTime && log.actualTime > 0) {
      return Math.min(log.actualTime, MAX_TIME);
    }

    const curMs = new Date(log.timestamp).getTime();
    if (!Number.isFinite(curMs)) return AVERAGE;

    if (index < logs.length - 1) {
      const nxt = new Date(logs[index + 1]?.timestamp);
      const diff = nxt - curMs;
      if (Number.isFinite(diff) && diff > 0 && diff < MAX_TIME) return diff;
    } else {
      if (isTabTrackerEnabled) {
        const diff = Date.now() - curMs;
        if (Number.isFinite(diff) && diff > 0) return Math.min(diff, MAX_TIME);
      } else {
        return AVERAGE;
      }
    }
    return AVERAGE;
  }

  // ===== 정확한 기간 클리핑을 위한 인덱스/캐시 =====
  let allLogsSortedCache = null;
  let allLogsSortedTimestamps = null;
  let byTabIndex = null; // tabId -> [timestamps(sorted asc)]

  function ensureAllLogsSorted() {
    if (!allLogsSortedCache) {
      allLogsSortedCache = [...allTabLogs].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );
      allLogsSortedTimestamps = allLogsSortedCache.map(l =>
        new Date(l.timestamp).getTime()
      );
      // 탭별 타임스탬프 인덱스 구축
      byTabIndex = new Map();
      for (const l of allLogsSortedCache) {
        if (!l.tabId) continue;
        const t = new Date(l.timestamp).getTime();
        const arr = byTabIndex.get(l.tabId) || [];
        arr.push(t);
        byTabIndex.set(l.tabId, arr);
      }
    }
  }

  function invalidateLogsSortedCache() {
    allLogsSortedCache = null;
    allLogsSortedTimestamps = null;
    byTabIndex = null;
  }

  function upperBound(arr, target) {
    let lo = 0,
      hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] <= target) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function getNextTimestampMs(currentMs) {
    ensureAllLogsSorted();
    if (!allLogsSortedTimestamps?.length) return null;
    const idx = upperBound(allLogsSortedTimestamps, currentMs);
    return idx < allLogsSortedTimestamps.length
      ? allLogsSortedTimestamps[idx]
      : null;
  }

  // 같은 탭의 다음 이벤트 시각(ms)
  function getNextTimestampSameTabMs(currentLog) {
    try {
      ensureAllLogsSorted();
      const curMs = new Date(currentLog.timestamp).getTime();
      const arr = currentLog.tabId ? byTabIndex?.get(currentLog.tabId) : null;
      if (!arr || !arr.length) return null;
      const idx = upperBound(arr, curMs);
      return idx < arr.length ? arr[idx] : null;
    } catch {
      return null;
    }
  }

  function getTimeInRangeSeconds(log, rangeStart, rangeEnd) {
    if (!log || !rangeStart || !rangeEnd) return 0;
    const startMs = new Date(rangeStart).getTime();
    const endMs = new Date(rangeEnd).getTime();
    const curMs = new Date(log.timestamp).getTime();
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      !Number.isFinite(curMs)
    )
      return 0;

    // 끝시각 계산
    let spanMs = 0;
    if (log.endTime) {
      const end = new Date(log.endTime).getTime();
      if (Number.isFinite(end) && end > curMs) spanMs = end - curMs;
    } else if (log.actualTime && log.actualTime > 0) {
      spanMs = log.actualTime;
    } else {
      let nextMs = getNextTimestampSameTabMs(log) || getNextTimestampMs(curMs);
      if (nextMs) {
        const diff = nextMs - curMs;
        if (Number.isFinite(diff) && diff > 0 && diff < 10800000) spanMs = diff;
      }
      if (spanMs === 0) {
        spanMs = isTabTrackerEnabled
          ? Math.min(Math.max(0, Date.now() - curMs), 10800000)
          : 30000;
      }
    }

    const segStart = Math.max(curMs, startMs);
    const segEnd = Math.min(curMs + spanMs, endMs);
    const clipped = Math.max(0, segEnd - segStart);
    return Math.round(clipped / 1000);
  }

  // 로그 -> 구간 합집합(초)
  function getUnionTimeSeconds(rangeStart, rangeEnd, records) {
    const startMs = new Date(rangeStart).getTime();
    const endMs = new Date(rangeEnd).getTime();
    if (
      !Number.isFinite(startMs) ||
      !Number.isFinite(endMs) ||
      endMs <= startMs
    )
      return 0;

    const intervals = [];
    for (const log of records) {
      const sMs = new Date(log.timestamp).getTime();
      if (!Number.isFinite(sMs)) continue;

      let eMs = null;
      if (log.endTime) {
        const t = new Date(log.endTime).getTime();
        if (Number.isFinite(t) && t > sMs) eMs = t;
      }
      if (!eMs && log.actualTime && log.actualTime > 0)
        eMs = sMs + log.actualTime;
      if (!eMs) {
        let nextMs = getNextTimestampSameTabMs(log) || getNextTimestampMs(sMs);
        if (nextMs && nextMs > sMs && nextMs - sMs < 10800000) eMs = nextMs;
      }
      if (!eMs)
        eMs = isTabTrackerEnabled
          ? Math.min(sMs + 10800000, Date.now())
          : sMs + 30000;

      const a = Math.max(sMs, startMs);
      const b = Math.min(eMs, endMs);
      if (b > a) intervals.push([a, b]);
    }

    if (!intervals.length) return 0;
    intervals.sort((x, y) => x[0] - y[0]);
    let [curS, curE] = intervals[0];
    let total = 0;
    for (let i = 1; i < intervals.length; i++) {
      const [s, e] = intervals[i];
      if (s <= curE) curE = Math.max(curE, e);
      else {
        total += curE - curS;
        curS = s;
        curE = e;
      }
    }
    total += curE - curS;
    return Math.round(total / 1000);
  }

  // =========================================================================
  // 페이지 초기화
  // =========================================================================
  async function initializePage() {
    // date-fns-tz가 import되었는지 확인
    if (typeof formatInTimeZone === "undefined") {
      alert(i18n.getMessage("timezoneLibraryError"));
      return;
    }

    currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    currentLocale = navigator.language || "ko-KR";
    updateTimezoneSelector();

    // 기본: 오늘 하루
    const today = new Date();
    startDateEl.value = formatDateForInputTZ(today, currentTimezone);
    endDateEl.value = formatDateForInputTZ(today, currentTimezone);
    if (startTimeEl) startTimeEl.value = "00:00";
    if (endTimeEl) endTimeEl.value = "23:59";

    // 초기 필터
    try {
      const startIso = `${startDateEl.value} ${
        startTimeEl?.value || "00:00"
      }:00`;
      const endIso = `${endDateEl.value} ${endTimeEl?.value || "23:59"}:59`;
      currentFilters.startDate = toZonedTime(startIso, currentTimezone);
      currentFilters.endDate = toZonedTime(endIso, currentTimezone);
    } catch {
      currentFilters.startDate = new Date(`${startDateEl.value}T00:00:00`);
      currentFilters.endDate = new Date(`${endDateEl.value}T23:59:59`);
    }

    await loadData();
    if (!isTabTrackerEnabled) showTabTrackerWarning();
    updateStatsTodayDate();
    updateAllStats();
  }

  function showTabTrackerWarning() {
    const html = `
      <div id="tab-tracker-warning" style="
        position:fixed;top:20px;right:20px;background:linear-gradient(135deg,#ff6b6b,#ee5a24);
        color:#fff;padding:15px 20px;border-radius:10px;box-shadow:0 4px 15px rgba(0,0,0,.2);
        z-index:1000;max-width:300px;font-family:Segoe UI,Tahoma,Geneva,Verdana,sans-serif;animation:slideIn .3s ease-out;">
        <div style="display:flex;align-items:center;gap:10px;">
          <span style="font-size:20px;">⚠️</span>
          <div><div style="font-weight:bold;margin-bottom:5px;">${i18n.getMessage(
            "tabTrackerDisabled"
          )}</div>
          <div style="font-size:14px;opacity:.9;">${i18n.getMessage(
            "tabTrackerDisabledDesc"
          )}</div></div>
        </div>
        <button onclick="closeTabTrackerWarning()" style="
          position:absolute;top:5px;right:5px;background:none;border:none;color:white;
          font-size:18px;cursor:pointer;width:20px;height:20px;display:flex;align-items:center;justify-content:center;">×</button>
      </div>
      <style>@keyframes slideIn{from{transform:translateX(100%);opacity:0}to{transform:translateX(0);opacity:1}}</style>
    `;
    document.body.insertAdjacentHTML("beforeend", html);
    setTimeout(() => {
      const w = document.getElementById("tab-tracker-warning");
      if (w) {
        w.style.animation = "slideIn .3s ease-out reverse";
        setTimeout(() => w.remove(), 300);
      }
    }, 10000);
  }
  window.closeTabTrackerWarning = function () {
    const w = document.getElementById("tab-tracker-warning");
    if (w) {
      w.style.animation = "slideIn .3s ease-out reverse";
      setTimeout(() => w.remove(), 300);
    }
  };

  function updateStatsTodayDate() {
    // i18n 유틸에서 처리하도록 위임
    if (typeof i18n !== "undefined" && i18n.updateDateFormatElements) {
      i18n.updateDateFormatElements();
    }
  }

  async function updateAllStats() {
    updateTimeRangeDisplay();
    filterData();
    await displayResults();
  }

  function updateTimezoneSelector() {
    const opt = Array.from(timezoneSelectEl.options).find(
      o => o.value === currentTimezone
    );
    if (!opt) {
      const o = document.createElement("option");
      o.value = currentTimezone;
      o.textContent = `🌍 ${currentTimezone}`;
      timezoneSelectEl.appendChild(o);
    }
    timezoneSelectEl.value = currentTimezone;
  }

  // =========================================================================
  // 이벤트 핸들러들
  // =========================================================================
  function setupEventListeners() {
    applyFilterBtn?.addEventListener("click", async () => {
      await sendGA4Event("filter_applied", {
        filter_type: "date_time_site_filter",
        filter_description: "날짜/시간/사이트 필터 적용",
      });
      refreshData();
    });
    resetFilterBtn?.addEventListener("click", async () => {
      await sendGA4Event("filter_reset", {
        filter_type: "all_filters_reset",
        filter_description: "모든 필터 초기화",
      });
      resetFilters();
    });
    refreshDataBtn?.addEventListener("click", async () => {
      await sendGA4Event("data_refreshed", {
        refresh_type: "manual_refresh",
        refresh_description: "수동 데이터 새로고침",
      });
      refreshData();
    });
    exportDataBtn?.addEventListener("click", async () => {
      await sendGA4Event("data_exported", {
        export_type: "csv_export",
        export_description: "CSV 형식으로 데이터 내보내기",
      });
      exportData();
    });

    viewDailyBtn?.addEventListener("click", async () => {
      await sendGA4Event("view_changed", {
        view: "daily",
        view_type: "daily_view",
        view_description: "일별 통계 보기",
        view_granularity: "day",
      });
      setView("daily");
    });
    viewHourlyBtn?.addEventListener("click", async () => {
      await sendGA4Event("view_changed", {
        view: "hourly",
        view_type: "hourly_view",
        view_description: "시간별 통계 보기",
        view_granularity: "hour",
      });
      setView("hourly");
    });
    viewWeeklyBtn?.addEventListener("click", async () => {
      await sendGA4Event("view_changed", {
        view: "weekly",
        view_type: "weekly_view",
        view_description: "주별 통계 보기",
        view_granularity: "week",
      });
      setView("weekly");
    });

    timezoneSelectEl?.addEventListener("change", async () => {
      currentTimezone = timezoneSelectEl.value;
      await applyFilters();
    });

    siteFilterEl?.addEventListener("change", async () => {
      currentFilters.site = siteFilterEl.value;
      await applyFilters();
    });

    startDateEl?.addEventListener("change", updateTimeRangeDisplay);
    endDateEl?.addEventListener("change", updateTimeRangeDisplay);
    startTimeEl?.addEventListener("change", updateTimeRangeDisplay);
    endTimeEl?.addEventListener("change", updateTimeRangeDisplay);

    timelineContainer?.addEventListener("click", e => {
      const siteEntry = e.target.closest(".site-entry");
      if (siteEntry) {
        const url = siteEntry.getAttribute("data-url");
        if (url) window.open(url, "_blank");
      }
    });

    // 기록 관리 이벤트 리스너
    deleteDateBtn?.addEventListener("click", async () => {
      await sendGA4Event("data_deleted_by_date", {
        delete_type: "specific_date_deletion",
        delete_description: "특정 날짜 데이터 삭제",
      });
      deleteDataByDate();
    });
    deleteAllBtn?.addEventListener("click", async () => {
      await sendGA4Event("all_data_deleted", {
        delete_type: "complete_data_deletion",
        delete_description: "전체 데이터 삭제",
      });
      deleteAllData();
    });
  }

  // =========================================================================
  // 필터 관련 함수들
  // =========================================================================
  async function applyFilters() {
    try {
      showLoading(true);
      const startIso = `${startDateEl.value} ${
        startTimeEl?.value || "00:00"
      }:00`;
      const endIso = `${endDateEl.value} ${endTimeEl?.value || "23:59"}:59`;
      currentFilters.startDate = toZonedTime(startIso, currentTimezone);
      currentFilters.endDate = toZonedTime(endIso, currentTimezone);

      filterData();
      await displayResults();
    } catch (e) {
      console.error("Error applying filters:", e);
      alert(i18n.getMessage("filterApplyError"));
    } finally {
      showLoading(false);
    }
  }

  async function resetFilters() {
    const today = new Date();
    startDateEl.value = formatDateForInputTZ(today, currentTimezone);
    endDateEl.value = formatDateForInputTZ(today, currentTimezone);
    if (startTimeEl) startTimeEl.value = "00:00";
    if (endTimeEl) endTimeEl.value = "23:59";
    siteFilterEl.value = "";
    currentFilters.site = "";
    timezoneSelectEl.value = currentTimezone;
    updateTimeRangeDisplay();
    setView("daily");
    await applyFilters();
  }

  async function refreshData() {
    try {
      // 이미지를 wink로 변경
      const refreshBtnImage = document.getElementById("refresh-btn-image");
      if (refreshBtnImage) {
        refreshBtnImage.src = "images/wink.png";
      }

      refreshDataBtn.disabled = true;
      await loadData();
      await applyFilters();
    } catch (e) {
      console.error("Error refreshing data:", e);
      alert(i18n.getMessage("dataRefreshError"));
    } finally {
      refreshDataBtn.disabled = false;

      // 1초 후 이미지를 normal로 변경
      setTimeout(() => {
        const refreshBtnImage = document.getElementById("refresh-btn-image");
        if (refreshBtnImage) {
          refreshBtnImage.src = "images/normal.png";
        }
      }, 1000);
    }
  }

  // =========================================================================
  // 뷰 관련
  // =========================================================================
  function setView(view) {
    currentView = view;
    updateViewButtons();
    if (queryDebounceTimer) clearTimeout(queryDebounceTimer);
    queryDebounceTimer = setTimeout(() => {
      updateCharts();
      updateTimeList();
    }, 300);
  }

  function updateViewButtons() {
    viewDailyBtn.classList.toggle("active", currentView === "daily");
    viewHourlyBtn.classList.toggle("active", currentView === "hourly");
    viewWeeklyBtn.classList.toggle("active", currentView === "weekly");
  }

  // =========================================================================
  // 결과 표시
  // =========================================================================
  async function displayResults() {
    if (filteredData.length === 0) {
      showNoData();
      return;
    }

    const totalSeconds = getUnionTimeSeconds(
      currentFilters.startDate,
      currentFilters.endDate,
      filteredData
    );
    const rangeSeconds = Math.max(
      0,
      Math.round((currentFilters.endDate - currentFilters.startDate) / 1000)
    );
    const safeTotalSeconds = Math.min(totalSeconds, rangeSeconds);

    const uniqueSites = new Set(filteredData.map(r => r.domain)).size;
    const totalSessions = filteredData.length;
    const openWindows = await getOpenWindowsCount();
    const openTabs = await getOpenTabsCount();

    totalTimeEl.textContent = fmtDurationSec(safeTotalSeconds);
    // i18n을 사용한 단위 포맷팅 (Chrome i18n 형식)
    const windowsUnit = i18n.getMessage("windows") || "개 창";
    const tabsUnit = i18n.getMessage("tabs") || "개 탭";

    totalSitesEl.textContent =
      i18n.getMessage("countItems", { count: uniqueSites }) ||
      `${uniqueSites}개`;
    totalSessionsEl.textContent =
      i18n.getMessage("countSessions", { count: totalSessions }) ||
      `${totalSessions}회`;
    currentSessionsEl.textContent = `${openWindows}${windowsUnit}, ${openTabs}${tabsUnit}`;

    // 새로운 유틸리티를 사용하여 날짜 범위 표시
    resultsPeriod.textContent = fmtDateRange(
      currentFilters.startDate,
      currentFilters.endDate,
      appState.getTimezone(),
      appState.getLanguage(),
      true
    );

    updateCharts();
    updateTimeList();
    updateTimeline();
    updateSiteList();

    // 동적 콘텐츠 갱신 후 i18n 재적용 (DOM 렌더링 완료 보장)
    requestAnimationFrame(() => {
      setTimeout(() => {
        if (typeof i18n !== "undefined") {
          i18n.updatePageText();
          // data-i18n-format 요소도 강제 업데이트
          i18n.updateDateFormatElements();
        }
      }, 50);
    });

    resultsSection.style.display = "block";
    resultsSection.classList.add("show");
  }

  function showNoData() {
    // 차트 정리
    if (timeChart) {
      timeChart.destroy();
      timeChart = null;
    }
    if (distributionChart) {
      distributionChart.destroy();
      distributionChart = null;
    }
    resultsSection.style.display = "none";
    const noDataTitle = i18n.getMessage("noDataTitle") || "데이터가 없습니다";
    const noDataMessage =
      i18n.getMessage("noDataMessage") ||
      "선택한 기간에 탭 활동 데이터가 없습니다.<br>다른 기간을 선택하거나 탭 추적을 활성화해주세요.";

    const noDataHtml = `
      <div class="no-data">
        <div class="no-data-icon">📊</div>
        <div class="no-data-title">${noDataTitle}</div>
        <div class="no-data-message">
          ${noDataMessage}
        </div>
      </div>`;
    timelineContainer.innerHTML = noDataHtml;
    timeListContainer.innerHTML = noDataHtml;
    const siteList = document.getElementById("site-list");
    if (siteList) siteList.innerHTML = "";
  }

  // =========================================================================
  // 기타 유틸
  // =========================================================================
  function updateTimeRangeDisplay() {
    // 이 함수는 현재 사용되지 않으므로 제거하거나 필요시 i18n을 사용하도록 수정
  }

  function showLoading(show) {
    document.querySelectorAll(".loading-overlay").forEach(el => {
      el.style.display = show ? "flex" : "none";
    });
  }

  function exportData() {
    const exportPayload = {
      filters: {
        startDate: startDateEl.value,
        endDate: endDateEl.value,
        timezone: currentTimezone,
        site: currentFilters.site,
        view: currentView,
      },
      data: filteredData,
      exportDate: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `tabbymansion-stats-${
      new Date().toISOString().split("T")[0]
    }.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // =========================================================================
  // 차트
  // =========================================================================
  function updateCharts() {
    if (filteredData.length === 0) {
      showNoData();
      return;
    }
    updateTimeChart();
    updateDistributionChart();
  }

  function updateTimeChart() {
    if (!timeChartEl) return;
    if (timeChart) timeChart.destroy();

    let aggregatedData;
    switch (currentView) {
      case "hourly":
        aggregatedData = groupByHour(
          currentFilters.startDate,
          currentFilters.endDate,
          filteredData
        );
        break;
      case "weekly":
        aggregatedData = groupByWeek(
          currentFilters.startDate,
          currentFilters.endDate,
          filteredData
        );
        break;
      default:
        aggregatedData = groupByDay(
          currentFilters.startDate,
          currentFilters.endDate,
          filteredData
        );
    }
    if (!aggregatedData.length) {
      showNoData();
      return;
    }

    // 라벨은 dateMs(UTC epoch)로 안전 생성
    const labels = aggregatedData.map(item =>
      fmtTimeListDate(
        new Date(item.dateMs),
        currentView,
        appState.getTimezone(),
        appState.getLanguage()
      )
    );
    const minutes = aggregatedData.map(item => item.totalSeconds / 60);
    const maxVal = Math.max(0, ...minutes);
    const chartType = minutes.filter(d => d > 0).length <= 2 ? "bar" : "line";

    const ctx = timeChartEl.getContext("2d");
    timeChart = new Chart(ctx, {
      type: chartType,
      data: {
        labels,
        datasets: [
          {
            label: getMessage("usageTimeMinutes") || "사용 시간 (분)",
            data: minutes,
            borderColor: "rgba(255, 215, 0, 1)",
            backgroundColor:
              chartType === "bar"
                ? "rgba(255, 215, 0, 0.8)"
                : "rgba(255, 215, 0, 0.1)",
            borderWidth: 2,
            fill: chartType === "line",
            tension: 0.4,
            pointBackgroundColor: "rgba(255, 215, 0, 1)",
            pointBorderColor: "#fff",
            pointBorderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "rgba(0,0,0,0.8)",
            titleColor: "#fff",
            bodyColor: "#fff",
            callbacks: {
              label(ctx) {
                const minutes = ctx.parsed.y || 0;
                return fmtDurationHM(minutes);
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            suggestedMax: maxVal === 0 ? 1 : undefined,
            grid: { color: "rgba(255,255,255,0.1)" },
            ticks: {
              color: "rgba(255,255,255,0.8)",
              maxTicksLimit: 8,
              ...(maxVal > 0
                ? { stepSize: Math.max(1, Math.ceil(maxVal / 8)) }
                : {}),
              callback(value) {
                const minutes = value;
                return fmtDurationHM(minutes);
              },
            },
          },
          x: {
            grid: { color: "rgba(255,255,255,0.1)" },
            ticks: {
              color: "rgba(255,255,255,0.8)",
              maxRotation: 45,
              callback(value, index) {
                // aggregatedData에서 실제 날짜 데이터 사용
                if (aggregatedData && aggregatedData[index]) {
                  return fmtTimeListDate(
                    new Date(aggregatedData[index].dateMs),
                    currentView,
                    appState.getTimezone(),
                    appState.getLanguage()
                  );
                }
                return "";
              },
            },
          },
        },
      },
    });
  }

  function updateDistributionChart() {
    if (!distributionChartEl) return;
    if (distributionChart) distributionChart.destroy();

    // 전체 중복 제거된 사용 시간 계산
    const totalUnionSeconds = getUnionTimeSeconds(
      currentFilters.startDate,
      currentFilters.endDate,
      filteredData
    );

    if (totalUnionSeconds === 0) {
      return;
    }

    // 전체 사용 시간 구간 계산
    const intervals = [];
    for (const log of filteredData) {
      const sMs = new Date(log.timestamp).getTime();
      if (!Number.isFinite(sMs)) continue;

      let eMs = null;
      if (log.endTime) {
        const t = new Date(log.endTime).getTime();
        if (Number.isFinite(t) && t > sMs) eMs = t;
      }
      if (!eMs && log.actualTime && log.actualTime > 0)
        eMs = sMs + log.actualTime;
      if (!eMs) {
        let nextMs = getNextTimestampSameTabMs(log) || getNextTimestampMs(sMs);
        if (nextMs && nextMs > sMs && nextMs - sMs < 10800000) eMs = nextMs;
      }
      if (!eMs)
        eMs = isTabTrackerEnabled
          ? Math.min(sMs + 10800000, Date.now())
          : sMs + 30000;

      const a = Math.max(sMs, new Date(currentFilters.startDate).getTime());
      const b = Math.min(eMs, new Date(currentFilters.endDate).getTime());
      if (b > a) intervals.push([a, b, log.domain || "unknown"]);
    }

    // 겹치는 구간을 합쳐서 전체 사용 시간 구간 생성
    if (intervals.length > 0) {
      intervals.sort((x, y) => x[0] - y[0]);
      let [curS, curE] = intervals[0];
      const unionIntervals = [];

      for (let i = 1; i < intervals.length; i++) {
        const [s, e] = intervals[i];
        if (s <= curE) curE = Math.max(curE, e);
        else {
          unionIntervals.push([curS, curE]);
          curS = s;
          curE = e;
        }
      }
      unionIntervals.push([curS, curE]);

      // 각 사이트별로 실제 사용 시간 계산
      const siteUsage = new Map();

      for (const [startMs, endMs] of unionIntervals) {
        // 이 구간에서 활성화된 사이트들 찾기
        const activeSites = new Map();

        for (const [s, e, domain] of intervals) {
          if (s < endMs && e > startMs) {
            // 겹치는 구간 계산
            const overlapStart = Math.max(s, startMs);
            const overlapEnd = Math.min(e, endMs);
            const overlapDuration = overlapEnd - overlapStart;

            activeSites.set(
              domain,
              (activeSites.get(domain) || 0) + overlapDuration
            );
          }
        }

        // 이 구간의 시간을 활성 사이트들에게 분배
        const intervalDuration = endMs - startMs;
        const totalActiveTime = Array.from(activeSites.values()).reduce(
          (sum, time) => sum + time,
          0
        );

        if (totalActiveTime > 0) {
          for (const [domain, activeTime] of activeSites) {
            const ratio = activeTime / totalActiveTime;
            const siteTime = Math.round((intervalDuration * ratio) / 1000);
            siteUsage.set(domain, (siteUsage.get(domain) || 0) + siteTime);
          }
        }
      }

      // 상위 6 + 기타
      const entries = Array.from(siteUsage.entries()).sort(
        (a, b) => b[1] - a[1]
      );
      const top6 = entries.slice(0, 6);
      const topSeconds = top6.reduce(
        (s, [, v]) => s + (Number.isFinite(v) ? v : 0),
        0
      );
      const otherSeconds = Math.max(0, totalUnionSeconds - topSeconds);

      const labels = top6.map(([d]) => d);
      const data = top6.map(([, v]) => v / 60);
      if (otherSeconds > 0) {
        labels.push("기타");
        data.push(otherSeconds / 60);
      }

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
        "#F8C471",
        "#82E0AA",
      ];

      const ctx = distributionChartEl.getContext("2d");
      distributionChart = new Chart(ctx, {
        type: "doughnut",
        data: {
          labels,
          datasets: [
            {
              data,
              backgroundColor: colors.slice(0, labels.length),
              borderWidth: 2,
              borderColor: "rgba(255,255,255,0.2)",
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: "60%",
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: "rgba(0,0,0,0.8)",
              titleColor: "#fff",
              bodyColor: "#fff",
              callbacks: {
                label(ctx) {
                  const minutes = ctx.parsed || 0;
                  const pct = (
                    (minutes / data.reduce((a, b) => a + b, 0)) *
                    100
                  ).toFixed(1);
                  const timeText = fmtDurationHM(minutes);
                  return `${ctx.label}: ${timeText} (${pct}%)`;
                },
              },
            },
          },
        },
      });
    }
  }

  // =========================================================================
  // 집계 유틸리티들 (dateMs 포함)
  // =========================================================================
  function groupByDay(start, end, records) {
    const groups = new Map();

    // 각 일별로 해당 일에 속하는 로그들을 그룹화
    records.forEach(rec => {
      const dateUtc = new Date(rec.timestamp);
      const date = fromZonedTime(dateUtc, currentTimezone);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(date.getDate()).padStart(2, "0")}`;
      const dateMs = new Date(
        date.getFullYear(),
        date.getMonth(),
        date.getDate(),
        0,
        0,
        0,
        0
      ).getTime();

      if (!groups.has(key)) {
        groups.set(key, {
          dateKey: key,
          dateMs,
          totalSeconds: 0,
          sites: new Map(),
          sessions: 0,
          records: [], // 해당 일의 모든 로그를 저장
        });
      }

      const g = groups.get(key);
      g.records.push(rec);
    });

    // 각 일별로 getUnionTimeSeconds와 동일한 방식으로 계산
    for (const [key, g] of groups) {
      // 각 일별로 해당 일의 시작과 끝 시간을 계산
      const dayStart = new Date(g.dateMs);
      const dayEnd = new Date(g.dateMs + 24 * 60 * 60 * 1000); // 24시간 후

      // 전체 조회 범위와 일별 범위의 교집합을 사용
      const effectiveStart = new Date(
        Math.max(dayStart.getTime(), new Date(start).getTime())
      );
      const effectiveEnd = new Date(
        Math.min(dayEnd.getTime(), new Date(end).getTime())
      );

      // getUnionTimeSeconds와 동일한 방식으로 계산
      const intervals = [];
      for (const rec of g.records) {
        const sMs = new Date(rec.timestamp).getTime();
        if (!Number.isFinite(sMs)) continue;

        let eMs = null;
        if (rec.endTime) {
          const t = new Date(rec.endTime).getTime();
          if (Number.isFinite(t) && t > sMs) eMs = t;
        }
        if (!eMs && rec.actualTime && rec.actualTime > 0)
          eMs = sMs + rec.actualTime;
        if (!eMs) {
          let nextMs =
            getNextTimestampSameTabMs(rec) || getNextTimestampMs(sMs);
          if (nextMs && nextMs > sMs && nextMs - sMs < 10800000) eMs = nextMs;
        }
        if (!eMs)
          eMs = isTabTrackerEnabled
            ? Math.min(sMs + 10800000, Date.now())
            : sMs + 30000;

        // 일별 범위로 클리핑
        const a = Math.max(sMs, effectiveStart.getTime());
        const b = Math.min(eMs, effectiveEnd.getTime());
        if (b > a) intervals.push([a, b]);
      }

      // getUnionTimeSeconds와 동일한 방식으로 겹치는 구간 합치기
      if (intervals.length > 0) {
        intervals.sort((x, y) => x[0] - y[0]);
        let [curS, curE] = intervals[0];
        let total = 0;
        for (let i = 1; i < intervals.length; i++) {
          const [s, e] = intervals[i];
          if (s <= curE) curE = Math.max(curE, e);
          else {
            total += curE - curS;
            curS = s;
            curE = e;
          }
        }
        total += curE - curS;
        g.totalSeconds = Math.round(total / 1000);
      }

      // 사이트별 통계 계산 (중복 제거 후)
      for (const rec of g.records) {
        const sec = getTimeInRangeSeconds(rec, effectiveStart, effectiveEnd);
        const domain = rec.domain || "unknown";
        g.sites.set(domain, (g.sites.get(domain) || 0) + sec);
      }

      g.sessions = g.records.length;
      delete g.records; // 메모리 정리
    }

    return Array.from(groups.values()).sort((a, b) => a.dateMs - b.dateMs);
  }

  function groupByHour(start, end, records) {
    const groups = new Map();

    // 각 시간대별로 해당 시간대에 속하는 로그들을 그룹화
    records.forEach(rec => {
      const dateUtc = new Date(rec.timestamp);
      const d = fromZonedTime(dateUtc, currentTimezone);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(d.getDate()).padStart(2, "0")} ${String(
        d.getHours()
      ).padStart(2, "0")}:00`;
      const dateMs = new Date(
        d.getFullYear(),
        d.getMonth(),
        d.getDate(),
        d.getHours(),
        0,
        0,
        0
      ).getTime();

      if (!groups.has(key)) {
        groups.set(key, {
          dateKey: key,
          dateMs,
          totalSeconds: 0,
          sites: new Map(),
          sessions: 0,
          records: [], // 해당 시간대의 모든 로그를 저장
        });
      }

      const g = groups.get(key);
      g.records.push(rec);
    });

    // 각 시간대별로 getUnionTimeSeconds와 동일한 방식으로 계산
    for (const [key, g] of groups) {
      // 각 시간대별로 해당 시간대의 시작과 끝 시간을 계산
      const hourStart = new Date(g.dateMs);
      const hourEnd = new Date(g.dateMs + 60 * 60 * 1000); // 1시간 후

      // 전체 조회 범위와 시간대 범위의 교집합을 사용
      const effectiveStart = new Date(
        Math.max(hourStart.getTime(), new Date(start).getTime())
      );
      const effectiveEnd = new Date(
        Math.min(hourEnd.getTime(), new Date(end).getTime())
      );

      // getUnionTimeSeconds와 동일한 방식으로 계산
      const intervals = [];
      for (const rec of g.records) {
        const sMs = new Date(rec.timestamp).getTime();
        if (!Number.isFinite(sMs)) continue;

        let eMs = null;
        if (rec.endTime) {
          const t = new Date(rec.endTime).getTime();
          if (Number.isFinite(t) && t > sMs) eMs = t;
        }
        if (!eMs && rec.actualTime && rec.actualTime > 0)
          eMs = sMs + rec.actualTime;
        if (!eMs) {
          let nextMs =
            getNextTimestampSameTabMs(rec) || getNextTimestampMs(sMs);
          if (nextMs && nextMs > sMs && nextMs - sMs < 10800000) eMs = nextMs;
        }
        if (!eMs)
          eMs = isTabTrackerEnabled
            ? Math.min(sMs + 10800000, Date.now())
            : sMs + 30000;

        // 시간대 범위로 클리핑
        const a = Math.max(sMs, effectiveStart.getTime());
        const b = Math.min(eMs, effectiveEnd.getTime());
        if (b > a) intervals.push([a, b]);
      }

      // getUnionTimeSeconds와 동일한 방식으로 겹치는 구간 합치기
      if (intervals.length > 0) {
        intervals.sort((x, y) => x[0] - y[0]);
        let [curS, curE] = intervals[0];
        let total = 0;
        for (let i = 1; i < intervals.length; i++) {
          const [s, e] = intervals[i];
          if (s <= curE) curE = Math.max(curE, e);
          else {
            total += curE - curS;
            curS = s;
            curE = e;
          }
        }
        total += curE - curS;
        g.totalSeconds = Math.round(total / 1000);
      }

      // 사이트별 통계 계산 (중복 제거 후)
      for (const rec of g.records) {
        const sec = getTimeInRangeSeconds(rec, effectiveStart, effectiveEnd);
        const domain = rec.domain || "unknown";
        g.sites.set(domain, (g.sites.get(domain) || 0) + sec);
      }

      g.sessions = g.records.length;
      delete g.records; // 메모리 정리
    }

    return Array.from(groups.values()).sort((a, b) => a.dateMs - b.dateMs);
  }

  function groupByWeek(start, end, records) {
    const groups = new Map();

    // 각 주별로 해당 주에 속하는 로그들을 그룹화
    records.forEach(rec => {
      const dateUtc = new Date(rec.timestamp);
      const d = fromZonedTime(dateUtc, currentTimezone);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      weekStart.setHours(0, 0, 0, 0);
      const key = `${weekStart.getFullYear()}-${String(
        weekStart.getMonth() + 1
      ).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
      const dateMs = weekStart.getTime();

      if (!groups.has(key)) {
        groups.set(key, {
          dateKey: key,
          dateMs,
          totalSeconds: 0,
          sites: new Map(),
          sessions: 0,
          records: [], // 해당 주의 모든 로그를 저장
        });
      }

      const g = groups.get(key);
      g.records.push(rec);
    });

    // 각 주별로 getUnionTimeSeconds와 동일한 방식으로 계산
    for (const [key, g] of groups) {
      // 각 주별로 해당 주의 시작과 끝 시간을 계산
      const weekStart = new Date(g.dateMs);
      const weekEnd = new Date(g.dateMs + 7 * 24 * 60 * 60 * 1000); // 7일 후

      // 전체 조회 범위와 주별 범위의 교집합을 사용
      const effectiveStart = new Date(
        Math.max(weekStart.getTime(), new Date(start).getTime())
      );
      const effectiveEnd = new Date(
        Math.min(weekEnd.getTime(), new Date(end).getTime())
      );

      // getUnionTimeSeconds와 동일한 방식으로 계산
      const intervals = [];
      for (const rec of g.records) {
        const sMs = new Date(rec.timestamp).getTime();
        if (!Number.isFinite(sMs)) continue;

        let eMs = null;
        if (rec.endTime) {
          const t = new Date(rec.endTime).getTime();
          if (Number.isFinite(t) && t > sMs) eMs = t;
        }
        if (!eMs && rec.actualTime && rec.actualTime > 0)
          eMs = sMs + rec.actualTime;
        if (!eMs) {
          let nextMs =
            getNextTimestampSameTabMs(rec) || getNextTimestampMs(sMs);
          if (nextMs && nextMs > sMs && nextMs - sMs < 10800000) eMs = nextMs;
        }
        if (!eMs)
          eMs = isTabTrackerEnabled
            ? Math.min(sMs + 10800000, Date.now())
            : sMs + 30000;

        // 주별 범위로 클리핑
        const a = Math.max(sMs, effectiveStart.getTime());
        const b = Math.min(eMs, effectiveEnd.getTime());
        if (b > a) intervals.push([a, b]);
      }

      // getUnionTimeSeconds와 동일한 방식으로 겹치는 구간 합치기
      if (intervals.length > 0) {
        intervals.sort((x, y) => x[0] - y[0]);
        let [curS, curE] = intervals[0];
        let total = 0;
        for (let i = 1; i < intervals.length; i++) {
          const [s, e] = intervals[i];
          if (s <= curE) curE = Math.max(curE, e);
          else {
            total += curE - curS;
            curS = s;
            curE = e;
          }
        }
        total += curE - curS;
        g.totalSeconds = Math.round(total / 1000);
      }

      // 사이트별 통계 계산 (중복 제거 후)
      for (const rec of g.records) {
        const sec = getTimeInRangeSeconds(rec, effectiveStart, effectiveEnd);
        const domain = rec.domain || "unknown";
        g.sites.set(domain, (g.sites.get(domain) || 0) + sec);
      }

      g.sessions = g.records.length;
      delete g.records; // 메모리 정리
    }

    return Array.from(groups.values()).sort((a, b) => a.dateMs - b.dateMs);
  }

  // =========================================================================
  // 시간 리스트 & 타임라인 & 사이트 리스트
  // =========================================================================
  function updateTimeList() {
    if (!timeListContainer) return;
    if (!filteredData.length) {
      timeListContainer.innerHTML =
        '<div class="no-data">데이터가 없습니다</div>';
      return;
    }

    let groups =
      currentView === "hourly"
        ? groupByHour(
            currentFilters.startDate,
            currentFilters.endDate,
            filteredData
          )
        : currentView === "weekly"
        ? groupByWeek(
            currentFilters.startDate,
            currentFilters.endDate,
            filteredData
          )
        : groupByDay(
            currentFilters.startDate,
            currentFilters.endDate,
            filteredData
          );

    let html = "";
    for (const g of groups) {
      const label = fmtTimeListDate(
        new Date(g.dateMs),
        currentView,
        appState.getTimezone(),
        appState.getLanguage()
      );
      html += `
        <div class="time-list-item">
          <div class="time-list-date">${esc(label)}</div>
          <div class="time-list-duration">${esc(
            fmtDurationSec(g.totalSeconds)
          )}</div>
        </div>`;
    }
    timeListContainer.innerHTML = html;
  }

  function updateTimeline() {
    if (!timelineContainer) return;

    // 최신순 표시 데이터
    const sortedDesc = [...filteredData].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    // indexOf O(n²) 방지: 오름차순 배열에서 위치 map
    const indexMap = new Map(filteredData.map((r, i) => [r, i]));

    let html = `
      <div class="timeline-day">
        <div class="day-header" data-i18n="listOfAccessedPages">조회 기간 내 접속 페이지 목록</div>
        <div class="day-summary" data-i18n="totalPages" data-count="${sortedDesc.length}">총 ${sortedDesc.length}개 페이지</div>
    `;

    sortedDesc.forEach((rec, displayIndex) => {
      const idxAsc = indexMap.get(rec);
      const sec = getEstimatedTimeInSeconds(rec, idxAsc, filteredData);
      // 새로운 유틸리티를 사용하여 날짜 형식 표시
      const visitTime = fmtSiteListDate(
        new Date(rec.timestamp),
        appState.getTimezone(),
        appState.getLanguage()
      );

      // URL 표시 축약
      let dispUrl = rec.url || "";
      if (dispUrl.length > 60) {
        const proto = dispUrl.startsWith("https://")
          ? "https://"
          : dispUrl.startsWith("http://")
          ? "http://"
          : "";
        const domain = dispUrl.replace(/^https?:\/\//, "").split("/")[0];
        const path = dispUrl.replace(/^https?:\/\/[^\/]+/, "");
        if (path.length > 0) {
          const maxPath = 60 - proto.length - domain.length - 3;
          if (path.length > maxPath) {
            const lastPart = path.substring(
              path.length - Math.floor(maxPath / 2)
            );
            dispUrl = `${proto}${domain}...${lastPart}`;
          }
        } else {
          dispUrl = `${proto}${domain}`;
        }
      }
      const title = rec.title || "";
      const truncatedTitle =
        title.length > 40 ? title.substring(0, 37) + "..." : title;

      html += `
        <div class="site-entry" data-url="${esc(
          rec.url
        )}" style="cursor:pointer;">
          <div class="site-info">
            <div class="site-title-col" title="${esc(title)}">${
        displayIndex + 1
      }. ${esc(truncatedTitle)}</div>
            <div class="site-url-col" title="${esc(rec.url)}">${esc(
        dispUrl
      )}</div>
          </div>
          <div class="site-time"><span class="visit-time">${esc(
            visitTime
          )}</span> | <span class="duration">${esc(
        fmtDurationSec(sec)
      )}</span></div>
        </div>`;
    });

    html += "</div>";
    timelineContainer.innerHTML = html;

    // 동적으로 생성된 HTML에 다국어 적용
    if (typeof i18n !== "undefined" && i18n.updatePageText) {
      i18n.updatePageText();
    }

    // 검색
    const searchInput = document.getElementById("timeline-search");
    if (searchInput) {
      let searchTimeout;
      searchInput.oninput = () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
          const q = (searchInput.value || "").trim().toLowerCase();

          // 검색 결과 수 표시 초기화
          const searchResultsCount = document.getElementById(
            "search-results-count"
          );
          if (searchResultsCount) {
            searchResultsCount.classList.remove("show");
          }

          if (!q) {
            updateTimeline();
            return;
          }

          // 검색어를 공백으로 분리하여 여러 키워드로 검색
          const keywords = q.split(/\s+/).filter(k => k.length > 0);

          const filtered = filteredData.filter(r => {
            const t = (r.title || "").toLowerCase();
            const u = (r.url || "").toLowerCase();
            let d = "";
            try {
              d = new URL(r.url).hostname.replace("www.", "").toLowerCase();
            } catch {}

            // 모든 키워드가 제목, URL, 또는 도메인에 포함되어야 함
            return keywords.every(
              keyword =>
                t.includes(keyword) ||
                u.includes(keyword) ||
                d.includes(keyword)
            );
          });

          const idxMap = new Map(filteredData.map((r, i) => [r, i]));
          const sortedTmp = [...filtered].sort(
            (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
          );

          // 검색 결과 수 표시
          if (searchResultsCount) {
            if (q) {
              searchResultsCount.textContent = `${sortedTmp.length}개`;
              searchResultsCount.classList.add("show");
            } else {
              searchResultsCount.classList.remove("show");
            }
          }

          let tmp = `
          <div class="timeline-day">
            <div class="day-header" data-i18n="listOfAccessedPages">조회 기간 내 접속 페이지 목록</div>
            <div class="day-summary" data-i18n="totalPages" data-count="${sortedTmp.length}">총 ${sortedTmp.length}개 페이지</div>
        `;

          if (sortedTmp.length === 0) {
            tmp += `
            <div class="no-data" style="text-align: center; padding: 20px; color: rgba(255, 255, 255, 0.6);">
              검색 결과가 없습니다. 다른 키워드로 검색해보세요.
            </div>
          `;
          } else {
            sortedTmp.forEach((rec, i) => {
              const iAsc = idxMap.get(rec);
              const sec = getEstimatedTimeInSeconds(rec, iAsc, filteredData);
              const vt = new Date(rec.timestamp).toLocaleString(locale, {
                year: "numeric",
                month: "2-digit",
                day: "2-digit",
                hour: "2-digit",
                minute: "2-digit",
                hour12: currentLanguage !== "en",
              });
              const title = rec.title || "";
              const td =
                title.length > 40 ? title.substring(0, 37) + "..." : title;
              let du = rec.url || "";
              if (du.length > 60) {
                const proto = du.startsWith("https://")
                  ? "https://"
                  : du.startsWith("http://")
                  ? "http://"
                  : "";
                const dom = du.replace(/^https?:\/\//, "").split("/")[0];
                const path = du.replace(/^https?:\/\/[^\/]+/, "");
                if (path.length > 0) {
                  const maxLen = 60 - proto.length - dom.length - 3;
                  if (path.length > maxLen) {
                    const last = path.substring(
                      path.length - Math.floor(maxLen / 2)
                    );
                    du = `${proto}${dom}...${last}`;
                  }
                } else du = `${proto}${dom}`;
              }
              tmp += `
              <div class="site-entry" data-url="${esc(
                rec.url
              )}" style="cursor:pointer;">
                <div class="site-info">
                  <div class="site-title-col" title="${esc(title)}">${
                i + 1
              }. ${esc(td)}</div>
                  <div class="site-url-col" title="${esc(rec.url)}">${esc(
                du
              )}</div>
                </div>
                <div class="site-time"><span class="visit-time">${esc(
                  vt
                )}</span> | <span class="duration">${esc(
                fmtDurationSec(sec)
              )}</span></div>
              </div>`;
            });
          }

          tmp += "</div>";
          timelineContainer.innerHTML = tmp;

          // 검색 결과에도 다국어 적용
          if (typeof i18n !== "undefined" && i18n.updatePageText) {
            i18n.updatePageText();
          }
        }, 300); // 300ms 디바운싱
      };
    }
  }

  function updateSiteList() {
    const container = document.getElementById("site-list-container");
    const list = document.getElementById("site-list");
    if (!container || !list) return;

    // 전체 중복 제거된 사용 시간 계산
    const totalUnionSeconds = getUnionTimeSeconds(
      currentFilters.startDate,
      currentFilters.endDate,
      filteredData
    );

    if (totalUnionSeconds === 0) {
      container.style.display = "none";
      return;
    }

    // 전체 사용 시간 구간 계산
    const intervals = [];
    for (const log of filteredData) {
      const sMs = new Date(log.timestamp).getTime();
      if (!Number.isFinite(sMs)) continue;

      let eMs = null;
      if (log.endTime) {
        const t = new Date(log.endTime).getTime();
        if (Number.isFinite(t) && t > sMs) eMs = t;
      }
      if (!eMs && log.actualTime && log.actualTime > 0)
        eMs = sMs + log.actualTime;
      if (!eMs) {
        let nextMs = getNextTimestampSameTabMs(log) || getNextTimestampMs(sMs);
        if (nextMs && nextMs > sMs && nextMs - sMs < 10800000) eMs = nextMs;
      }
      if (!eMs)
        eMs = isTabTrackerEnabled
          ? Math.min(sMs + 10800000, Date.now())
          : sMs + 30000;

      const a = Math.max(sMs, new Date(currentFilters.startDate).getTime());
      const b = Math.min(eMs, new Date(currentFilters.endDate).getTime());
      if (b > a) intervals.push([a, b, log.domain || "unknown"]);
    }

    // 겹치는 구간을 합쳐서 전체 사용 시간 구간 생성
    if (intervals.length > 0) {
      intervals.sort((x, y) => x[0] - y[0]);
      let [curS, curE] = intervals[0];
      const unionIntervals = [];

      for (let i = 1; i < intervals.length; i++) {
        const [s, e] = intervals[i];
        if (s <= curE) curE = Math.max(curE, e);
        else {
          unionIntervals.push([curS, curE]);
          curS = s;
          curE = e;
        }
      }
      unionIntervals.push([curS, curE]);

      // 각 사이트별로 실제 사용 시간 계산
      const siteUsage = new Map();

      for (const [startMs, endMs] of unionIntervals) {
        // 이 구간에서 활성화된 사이트들 찾기
        const activeSites = new Map();

        for (const [s, e, domain] of intervals) {
          if (s < endMs && e > startMs) {
            // 겹치는 구간 계산
            const overlapStart = Math.max(s, startMs);
            const overlapEnd = Math.min(e, endMs);
            const overlapDuration = overlapEnd - overlapStart;

            activeSites.set(
              domain,
              (activeSites.get(domain) || 0) + overlapDuration
            );
          }
        }

        // 이 구간의 시간을 활성 사이트들에게 분배
        const intervalDuration = endMs - startMs;
        const totalActiveTime = Array.from(activeSites.values()).reduce(
          (sum, time) => sum + time,
          0
        );

        if (totalActiveTime > 0) {
          for (const [domain, activeTime] of activeSites) {
            const ratio = activeTime / totalActiveTime;
            const siteTime = Math.round((intervalDuration * ratio) / 1000);
            siteUsage.set(domain, (siteUsage.get(domain) || 0) + siteTime);
          }
        }
      }

      const sorted = Array.from(siteUsage.entries()).sort(
        (a, b) => b[1] - a[1]
      );
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
        "#F8C471",
        "#82E0AA",
      ];

      let html = "";
      sorted.forEach(([domain, seconds], i) => {
        const pct =
          totalUnionSeconds > 0
            ? ((seconds / totalUnionSeconds) * 100).toFixed(1)
            : 0;
        const color = colors[i % colors.length];
        html += `
          <div class="site-item">
            <div class="site-item-info">
              <div class="site-color" style="background-color:${color}"></div>
              <div class="site-domain">${esc(domain)}</div>
            </div>
            <div class="site-time">${esc(
              fmtDurationSec(seconds)
            )} <span class="site-percentage">(${pct}%)</span></div>
          </div>`;
      });
      list.innerHTML = html;
      container.style.display = "block";
    }
  }

  // 창/탭 수
  async function getOpenWindowsCount() {
    try {
      if (typeof chrome !== "undefined" && chrome.windows?.getAll) {
        return new Promise(resolve =>
          chrome.windows.getAll({}, wins =>
            resolve(Array.isArray(wins) ? wins.length : 1)
          )
        );
      }
    } catch (e) {
      console.warn("getOpenWindowsCount failed:", e);
    }
    return 1;
  }
  async function getOpenTabsCount() {
    try {
      if (typeof chrome !== "undefined" && chrome.tabs?.query) {
        return new Promise(resolve =>
          chrome.tabs.query({}, tabs =>
            resolve(Array.isArray(tabs) ? tabs.length : 0)
          )
        );
      }
    } catch (e) {
      console.warn("getOpenTabsCount failed:", e);
    }
    return 0;
  }

  // =========================================================================
  // 기록 관리 함수들
  // =========================================================================
  async function deleteDataByDate() {
    const selectedDate = deleteDateEl.value;
    if (!selectedDate) {
      alert(i18n.getMessage("selectDateToDelete"));
      return;
    }

    if (
      !confirm(i18n.getMessage("confirmDeleteDate", { date: selectedDate }))
    ) {
      return;
    }

    try {
      showLoading(true);

      // 선택한 날짜의 시작과 끝 시간 계산
      const startOfDay = new Date(`${selectedDate}T00:00:00`);
      const endOfDay = new Date(`${selectedDate}T23:59:59`);

      // 현재 저장된 로그 가져오기
      const result = await chrome.storage.local.get(["tabLogs"]);
      const currentLogs = result.tabLogs || [];

      // 선택한 날짜에 속하지 않는 로그만 필터링
      const filteredLogs = currentLogs.filter(log => {
        const logDate = new Date(log.timestamp);
        return logDate < startOfDay || logDate > endOfDay;
      });

      // 필터링된 로그 저장
      await chrome.storage.local.set({ tabLogs: filteredLogs });

      // 데이터 새로고침
      await loadData();
      await applyFilters();

      alert(i18n.getMessage("dateRecordsDeleted", { date: selectedDate }));

      // 날짜 입력 필드 초기화
      deleteDateEl.value = "";
    } catch (error) {
      console.error(i18n.getMessage("dateRecordsDeleteError") + ":", error);
      alert(i18n.getMessage("deleteRecordsError"));
    } finally {
      showLoading(false);
    }
  }

  async function deleteAllData() {
    if (!confirm(i18n.getMessage("confirmDeleteAll"))) {
      return;
    }

    try {
      showLoading(true);

      // 모든 로그 삭제
      await chrome.storage.local.set({ tabLogs: [] });

      // 데이터 새로고침
      await loadData();
      await applyFilters();

      alert(i18n.getMessage("allRecordsDeleted"));
    } catch (error) {
      console.error(i18n.getMessage("allRecordsDeleteError") + ":", error);
      alert(i18n.getMessage("deleteRecordsError"));
    } finally {
      showLoading(false);
    }
  }

  // =========================================================================
  // 언어 설정 함수들
  // =========================================================================
  function setupLanguageSettings() {
    const languageSelect = document.getElementById("language-select-stats");
    const currentLanguageDisplay = document.getElementById(
      "current-language-display"
    );

    if (!languageSelect || !currentLanguageDisplay) {
      console.warn("Language settings elements not found");
      return;
    }

    // 현재 언어 로드 및 표시
    loadCurrentLanguage();

    // 언어 변경 이벤트 리스너
    languageSelect.addEventListener("change", async e => {
      const newLanguage = e.target.value;
      await changeLanguage(newLanguage);
    });
  }

  async function loadCurrentLanguage() {
    try {
      const result = await chrome.storage.local.get(["language"]);
      const currentLanguage = result.language || i18n.getCurrentLanguage();

      const languageSelect = document.getElementById("language-select-stats");
      const currentLanguageDisplay = document.getElementById(
        "current-language-display"
      );

      if (languageSelect) {
        languageSelect.value = currentLanguage;
      }

      if (currentLanguageDisplay) {
        const languageNames = {
          en: "English",
          ko: "한국어",
          ja: "日本語",
        };
        currentLanguageDisplay.textContent =
          languageNames[currentLanguage] || currentLanguage;
      }
    } catch (error) {
      console.error(i18n.getMessage("languageSettingsLoadError") + ":", error);
    }
  }

  async function changeLanguage(newLanguage) {
    try {
      // 언어 설정 저장
      await chrome.storage.local.set({ language: newLanguage });

      // 현재 언어 표시 업데이트
      await loadCurrentLanguage();

      // 성공 메시지 표시
      showLanguageChangeMessage(newLanguage);

      // 페이지 새로고침으로 언어 변경 적용
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (error) {
      console.error(i18n.getMessage("languageChangeError") + ":", error);
      alert(i18n.getMessage("languageChangeError"));
    }
  }

  function showLanguageChangeMessage(language) {
    const languageNames = {
      en: "English",
      ko: "한국어",
      ja: "日本語",
    };

    const message = i18n.getMessage("languageChangedMessage", {
      language: languageNames[language],
    });

    // 메시지 요소 생성
    const messageEl = document.createElement("div");
    messageEl.className = "language-change-message";
    messageEl.textContent = message;
    messageEl.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      padding: 12px 16px;
      border-radius: 6px;
      background: #27ae60;
      color: white;
      font-size: 14px;
      z-index: 1000;
      animation: slideIn 0.3s ease;
    `;

    document.body.appendChild(messageEl);

    // 3초 후 제거
    setTimeout(() => {
      if (messageEl.parentNode) {
        messageEl.remove();
      }
    }, 3000);
  }

  // =========================================================================
  // 초기화
  // =========================================================================
  if (!validateDOMElements()) {
    console.error(
      "Required DOM elements are missing. Please check the HTML structure."
    );
    return;
  }
  setupEventListeners();
  setupLanguageSettings(); // 언어 설정 초기화 추가
  initializePage();
});
