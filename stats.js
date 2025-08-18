document.addEventListener("DOMContentLoaded", async () => {
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
  const timeRangeDisplayEl = document.getElementById("time-range-display");
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
  let isTabTrackerEnabled = false; // 탭 트래커 상태 전역 변수

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
      "time-range-display",
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
  function formatDuration(seconds) {
    if (!Number.isFinite(seconds)) return "0초";
    if (seconds < 60) return `${Math.round(seconds)}초`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}분`;
    const h = Math.floor(seconds / 3600);
    let m = Math.round((seconds - h * 3600) / 60);
    let H = h;
    if (m === 60) {
      H += 1;
      m = 0;
    }
    return `${H}시간 ${m}분`;
  }

  /** 날짜 포맷팅 - 인풋 value용(yyyy-MM-dd) */
  function formatDateForInputTZ(date, tz) {
    if (typeof window.dateFnsTz === "undefined") {
      throw new Error("date-fns-tz is required for timezone handling");
    }
    return window.dateFnsTz.formatInTimeZone(date, tz, "yyyy-MM-dd");
  }

  /** TZ에 맞춘 라벨 포맷 */
  function formatDateLabel(date, view) {
    try {
      if (!date || isNaN(date.getTime())) return "Invalid Date";
      const options = { timeZone: currentTimezone };
      switch (view) {
        case "hourly":
          return `${date.toLocaleDateString(currentLocale, options)} ${String(
            date.getHours()
          ).padStart(2, "0")}:00`;
        case "weekly":
          // 주 시작일 라벨
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          return weekStart.toLocaleDateString(currentLocale, options);
        default:
          return date.toLocaleDateString(currentLocale, options);
      }
    } catch (e) {
      console.error("Error in formatDateLabel:", e, date, view);
      return "Invalid Date";
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
        isTabTrackerEnabled = result.isTabTrackerEnabled || false;

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
    if (log.actualTime && log.actualTime > 0) return log.actualTime;

    const curMs = new Date(log.timestamp).getTime();
    if (!Number.isFinite(curMs)) return AVERAGE;

    if (index < logs.length - 1) {
      const nxt = new Date(logs[index + 1]?.timestamp);
      const diff = nxt - curMs;
      if (Number.isFinite(diff) && diff > 0 && diff < 10800000) return diff;
    } else {
      if (isTabTrackerEnabled) {
        const diff = Date.now() - curMs;
        if (Number.isFinite(diff) && diff > 0) return Math.min(diff, 10800000);
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
    if (typeof window.dateFnsTz === "undefined") {
      alert(
        "타임존 처리 라이브러리가 로드되지 않았습니다. 페이지를 새로고침해주세요."
      );
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
      currentFilters.startDate = window.dateFnsTz.zonedTimeToUtc(
        startIso,
        currentTimezone
      );
      currentFilters.endDate = window.dateFnsTz.zonedTimeToUtc(
        endIso,
        currentTimezone
      );
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
          <div><div style="font-weight:bold;margin-bottom:5px;">탭 트래커 비활성화</div>
          <div style="font-size:14px;opacity:.9;">정확한 사용시간 측정을 위해 탭 트래커를 활성화해주세요.</div></div>
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
    const el = document.getElementById("stats-today-date");
    if (el) {
      const options = {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      };
      el.textContent = `📅 ${new Date().toLocaleDateString("ko-KR", options)}`;
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
    applyFilterBtn?.addEventListener("click", refreshData);
    resetFilterBtn?.addEventListener("click", resetFilters);
    refreshDataBtn?.addEventListener("click", refreshData);
    exportDataBtn?.addEventListener("click", exportData);

    viewDailyBtn?.addEventListener("click", () => setView("daily"));
    viewHourlyBtn?.addEventListener("click", () => setView("hourly"));
    viewWeeklyBtn?.addEventListener("click", () => setView("weekly"));

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
    deleteDateBtn?.addEventListener("click", deleteDataByDate);
    deleteAllBtn?.addEventListener("click", deleteAllData);
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
      currentFilters.startDate = window.dateFnsTz.zonedTimeToUtc(
        startIso,
        currentTimezone
      );
      currentFilters.endDate = window.dateFnsTz.zonedTimeToUtc(
        endIso,
        currentTimezone
      );

      filterData();
      await displayResults();
    } catch (e) {
      console.error("Error applying filters:", e);
      alert("필터 적용 중 오류가 발생했습니다.");
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
        refreshBtnImage.src = "public/images/wink.png";
      }

      refreshDataBtn.disabled = true;
      await loadData();
      await applyFilters();
    } catch (e) {
      console.error("Error refreshing data:", e);
      alert("데이터 새로고침 중 오류가 발생했습니다.");
    } finally {
      refreshDataBtn.disabled = false;

      // 1초 후 이미지를 normal로 변경
      setTimeout(() => {
        const refreshBtnImage = document.getElementById("refresh-btn-image");
        if (refreshBtnImage) {
          refreshBtnImage.src = "public/images/normal.png";
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

    totalTimeEl.textContent = formatDuration(safeTotalSeconds);
    totalSitesEl.textContent = `${uniqueSites}개`;
    totalSessionsEl.textContent = `${totalSessions}회`;
    currentSessionsEl.textContent = `${openWindows}개 창, ${openTabs}개 탭`;

    const startStr = window.dateFnsTz.formatInTimeZone(
      currentFilters.startDate,
      currentTimezone,
      "yyyy년 MM월 dd일"
    );
    const endStr = window.dateFnsTz.formatInTimeZone(
      currentFilters.endDate,
      currentTimezone,
      "yyyy년 MM월 dd일"
    );

    const today = new Date();
    const isToday =
      startStr === endStr &&
      window.dateFnsTz.formatInTimeZone(
        today,
        currentTimezone,
        "yyyy년 MM월 dd일"
      ) === startStr;

    resultsPeriod.textContent = isToday
      ? `${startStr} (오늘)`
      : `${startStr} ~ ${endStr}`;

    updateCharts();
    updateTimeList();
    updateTimeline();
    updateSiteList();

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
    const noDataHtml = `
      <div class="no-data">
        <div class="no-data-icon">📊</div>
        <div class="no-data-title">데이터가 없습니다</div>
        <div class="no-data-message">
          선택한 기간에 탭 활동 데이터가 없습니다.<br>
          다른 기간을 선택하거나 탭 추적을 활성화해주세요.
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
    if (!timeRangeDisplayEl) return;
    const startStr = window.dateFnsTz.formatInTimeZone(
      new Date(`${startDateEl.value}T${startTimeEl?.value || "00:00"}:00`),
      currentTimezone,
      "yyyy년 MM월 dd일 HH:mm"
    );
    const endStr = window.dateFnsTz.formatInTimeZone(
      new Date(`${endDateEl.value}T${endTimeEl?.value || "23:59"}:59`),
      currentTimezone,
      "yyyy년 MM월 dd일 HH:mm"
    );
    timeRangeDisplayEl.textContent = `${startStr} ~ ${endStr}`;
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
      formatDateLabel(new Date(item.dateMs), currentView)
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
            label: "사용 시간 (분)",
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
                const m = ctx.parsed.y || 0;
                const h = Math.floor(m / 60);
                const mm = Math.round(m % 60);
                return `${h}시간 ${mm}분`;
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
                const m = value;
                const h = Math.floor(m / 60);
                const mm = Math.round(m % 60);
                return h > 0 ? `${h}시간 ${mm}분` : `${mm}분`;
              },
            },
          },
          x: {
            grid: { color: "rgba(255,255,255,0.1)" },
            ticks: { color: "rgba(255,255,255,0.8)", maxRotation: 45 },
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
                  const m = ctx.parsed || 0;
                  const h = Math.floor(m / 60),
                    mm = Math.round(m % 60);
                  const pct = (
                    (m / data.reduce((a, b) => a + b, 0)) *
                    100
                  ).toFixed(1);
                  return `${ctx.label}: ${h}시간 ${mm}분 (${pct}%)`;
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
      const date = window.dateFnsTz.utcToZonedTime(dateUtc, currentTimezone);
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
      const d = window.dateFnsTz.utcToZonedTime(dateUtc, currentTimezone);
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
      const d = window.dateFnsTz.utcToZonedTime(dateUtc, currentTimezone);
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
      const label = formatDateLabel(new Date(g.dateMs), currentView);
      html += `
        <div class="time-list-item">
          <div class="time-list-date">${esc(label)}</div>
          <div class="time-list-duration">${esc(
            formatDuration(g.totalSeconds)
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
        <div class="day-header">조회 기간 내 접속 페이지 목록</div>
        <div class="day-summary">총 ${sortedDesc.length}개 페이지 | 시간 순 정렬</div>
    `;

    sortedDesc.forEach((rec, displayIndex) => {
      const idxAsc = indexMap.get(rec);
      const sec = getEstimatedTimeInSeconds(rec, idxAsc, filteredData);
      const visitTime = new Date(rec.timestamp).toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

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
        formatDuration(sec)
      )}</span></div>
        </div>`;
    });

    html += "</div>";
    timelineContainer.innerHTML = html;

    // 검색
    const searchInput = document.getElementById("timeline-search");
    if (searchInput) {
      searchInput.oninput = () => {
        const q = (searchInput.value || "").trim().toLowerCase();
        if (!q) {
          updateTimeline();
          return;
        }
        const filtered = filteredData.filter(r => {
          const t = (r.title || "").toLowerCase();
          const u = (r.url || "").toLowerCase();
          let d = "";
          try {
            d = new URL(r.url).hostname.replace("www.", "").toLowerCase();
          } catch {}
          return t.includes(q) || u.includes(q) || d.includes(q);
        });
        const idxMap = new Map(filteredData.map((r, i) => [r, i]));
        const sortedTmp = [...filtered].sort(
          (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
        );
        let tmp = `
          <div class="timeline-day">
            <div class="day-header">조회 기간 내 접속 페이지 목록</div>
            <div class="day-summary">총 ${sortedTmp.length}개 페이지 | 시간 순 정렬</div>
        `;
        sortedTmp.forEach((rec, i) => {
          const iAsc = idxMap.get(rec);
          const sec = getEstimatedTimeInSeconds(rec, iAsc, filteredData);
          const vt = new Date(rec.timestamp).toLocaleString("ko-KR", {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
          });
          const title = rec.title || "";
          const td = title.length > 40 ? title.substring(0, 37) + "..." : title;
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
            formatDuration(sec)
          )}</span></div>
            </div>`;
        });
        tmp += "</div>";
        timelineContainer.innerHTML = tmp;
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
              formatDuration(seconds)
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
      alert("삭제할 날짜를 선택해주세요.");
      return;
    }

    if (
      !confirm(
        `선택한 날짜 (${selectedDate})의 모든 기록을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없습니다.`
      )
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

      alert(`${selectedDate} 날짜의 기록이 성공적으로 삭제되었습니다.`);

      // 날짜 입력 필드 초기화
      deleteDateEl.value = "";
    } catch (error) {
      console.error("날짜별 기록 삭제 실패:", error);
      alert("기록 삭제 중 오류가 발생했습니다.");
    } finally {
      showLoading(false);
    }
  }

  async function deleteAllData() {
    if (
      !confirm(
        "모든 탭 활동 기록을 삭제하시겠습니까?\n\n이 작업은 되돌릴 수 없으며, 모든 데이터가 영구적으로 삭제됩니다."
      )
    ) {
      return;
    }

    try {
      showLoading(true);

      // 모든 로그 삭제
      await chrome.storage.local.set({ tabLogs: [] });

      // 데이터 새로고침
      await loadData();
      await applyFilters();

      alert("모든 기록이 성공적으로 삭제되었습니다.");
    } catch (error) {
      console.error("전체 기록 삭제 실패:", error);
      alert("기록 삭제 중 오류가 발생했습니다.");
    } finally {
      showLoading(false);
    }
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
  initializePage();
});
