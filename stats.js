// TabbyMansion 상세 통계 페이지 - UMD 번들 사용 버전
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

  /**
   * DOM 요소 존재 여부 확인
   */
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

    const missingElements = requiredElements.filter(
      id => !document.getElementById(id)
    );

    if (missingElements.length > 0) {
      console.warn("Missing DOM elements:", missingElements);
      return false;
    }

    return true;
  }

  /**
   * 시간 포맷팅 함수 - 동적 단위 스케일링
   */
  function formatDuration(seconds) {
    if (seconds < 5) {
      return `${Math.round(seconds)}초`;
    } else if (seconds < 60) {
      return `${Math.round(seconds)}초`;
    } else if (seconds < 3600) {
      const minutes = Math.round(seconds / 60);
      return `${minutes}분`;
    } else {
      const hours = Math.floor(seconds / 3600);
      let minutes = Math.round((seconds - hours * 3600) / 60);
      let normHours = hours;
      if (minutes === 60) {
        normHours += 1;
        minutes = 0;
      }
      return `${normHours}시간 ${minutes}분`;
    }
  }

  /**
   * 날짜 포맷팅 함수 - 타임존 안전
   */
  function formatDateForInputTZ(date, tz) {
    if (typeof window.dateFnsTz === "undefined") {
      throw new Error("date-fns-tz is required for timezone handling");
    }
    return window.dateFnsTz.formatInTimeZone(date, tz, "yyyy-MM-dd");
  }

  /**
   * 입력 날짜를 UTC 범위로 변환
   */
  function inputDateToUtcRange(dateStr, tz) {
    if (typeof window.dateFnsTz === "undefined") {
      throw new Error("date-fns-tz is required for timezone handling");
    }

    const startUtc = window.dateFnsTz.zonedTimeToUtc(`${dateStr}`, tz);
    const endUtc = window.dateFnsTz.zonedTimeToUtc(`${dateStr}`, tz);

    return { startUtc, endUtc };
  }

  /**
   * 타임존 날짜 파싱
   */
  function parseZonedDate(dateStr, tz) {
    if (typeof window.dateFnsTz === "undefined") {
      throw new Error("date-fns-tz is required for timezone handling");
    }
    return window.dateFnsTz.utcToZonedTime(
      window.dateFnsTz.zonedTimeToUtc(`${dateStr} 00:00:00`, tz),
      tz
    );
  }

  /**
   * 날짜 포맷팅
   */
  function formatDateTZ(date, tz, pattern = "yyyy-MM-dd HH:mm") {
    if (typeof window.dateFnsTz === "undefined") {
      throw new Error("date-fns-tz is required for timezone handling");
    }
    return window.dateFnsTz.formatInTimeZone(date, tz, pattern);
  }

  /**
   * 날짜 키 생성
   */
  function getDateKey(date, view) {
    switch (view) {
      case "hourly":
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(date.getDate()).padStart(2, "0")} ${String(
          date.getHours()
        ).padStart(2, "0")}:00`;
      case "weekly":
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - date.getDay());
        return `${weekStart.getFullYear()}-${String(
          weekStart.getMonth() + 1
        ).padStart(2, "0")}-${String(weekStart.getDate()).padStart(2, "0")}`;
      default: // daily
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
          2,
          "0"
        )}-${String(date.getDate()).padStart(2, "0")}`;
    }
  }

  /**
   * 날짜 라벨 포맷팅
   */
  function formatDateLabel(date, view) {
    try {
      if (!date || isNaN(date.getTime())) {
        console.warn("Invalid date in formatDateLabel:", date);
        return "Invalid Date";
      }

      const options = { timeZone: currentTimezone };

      switch (view) {
        case "hourly":
          return `${date.toLocaleDateString(currentLocale, options)} ${String(
            date.getHours()
          ).padStart(2, "0")}:00`;
        case "weekly":
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          return weekStart.toLocaleDateString(currentLocale, options);
        default: // daily
          return date.toLocaleDateString(currentLocale, options);
      }
    } catch (error) {
      console.error("Error in formatDateLabel:", error, date, view);
      return "Invalid Date";
    }
  }

  // =========================================================================
  // 데이터 로딩 및 필터링
  // =========================================================================

  /**
   * 탭 로그 데이터 로드 - 팝업과 동일한 방식
   */
  async function loadData() {
    try {
      // Chrome Extension 컨텍스트인지 확인
      if (
        typeof chrome !== "undefined" &&
        chrome.storage &&
        chrome.runtime &&
        chrome.runtime.id
      ) {
        console.log("Running in Chrome Extension context");
        console.log("Chrome runtime ID:", chrome.runtime.id);
        console.log("Chrome storage available:", !!chrome.storage.local);
        console.log("Reading from chrome.storage.local...");
        const result = await chrome.storage.local.get([
          "tabLogs",
          "isTabTrackerEnabled",
          "dailyStats",
        ]);
        console.log("Storage read result:", result);

        allTabLogs = result.tabLogs || [];
        isTabTrackerEnabled = result.isTabTrackerEnabled || false;

        console.log(`Loaded ${allTabLogs.length} tab logs`);
        console.log(`Tab tracker enabled: ${isTabTrackerEnabled}`);

        // 데이터 구조 확인
        if (allTabLogs.length > 0) {
          console.log("Sample tab log:", allTabLogs[0]);
          console.log("All tab logs:", allTabLogs);
        } else {
          console.log("No tab logs found in storage");
          console.log("Storage result:", result);
        }

        // 탭 추적이 비활성화된 경우 경고
        if (!isTabTrackerEnabled) {
          console.warn(
            "Tab tracker is disabled. No new data will be collected."
          );
        }

        // dailyStats에서 titles 타입 정규화 (팝업과 동일)
        if (result.dailyStats) {
          Object.keys(result.dailyStats).forEach(dayKey => {
            Object.keys(result.dailyStats[dayKey]).forEach(domain => {
              const bucket = result.dailyStats[dayKey][domain];
              if (bucket.titles && !Array.isArray(bucket.titles)) {
                if (bucket.titles instanceof Set) {
                  bucket.titles = Array.from(bucket.titles);
                } else if (typeof bucket.titles === "string") {
                  bucket.titles = [bucket.titles];
                } else {
                  bucket.titles = [];
                }
              }
            });
          });
        }
      } else {
        console.error("Not running in Chrome Extension context!");
        console.error("Please open this page from the extension popup.");

        // 사용자에게 안내 메시지 표시
        document.body.innerHTML = `
          <div style="
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            height: 100vh;
            font-family: Arial, sans-serif;
            text-align: center;
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
          ">
            <h1>🚫 접근 제한</h1>
            <p>이 페이지는 Chrome Extension에서만 접근할 수 있습니다.</p>
            <p>확장 프로그램 팝업에서 "상세보기" 버튼을 클릭해주세요.</p>
            <div style="margin-top: 20px; padding: 15px; background: rgba(255,255,255,0.1); border-radius: 10px;">
              <p><strong>해결 방법:</strong></p>
              <ol style="text-align: left; display: inline-block;">
                <li>Chrome 확장 프로그램 아이콘을 클릭</li>
                <li>TabbyMansion 팝업에서 "상세보기" 버튼 클릭</li>
                <li>새 탭에서 상세 통계 페이지가 열립니다</li>
              </ol>
            </div>
          </div>
        `;
        return;
      }
    } catch (error) {
      console.error("Error loading data:", error);
      allTabLogs = [];
    }
  }

  /**
   * 데이터 필터링 - 시간순 정렬 포함
   */
  function filterData() {
    // 범위 필터링
    if (!currentFilters.startDate || !currentFilters.endDate) {
      filteredData = allTabLogs.slice();
    } else {
      filteredData = allTabLogs.filter(record => {
        const timestamp = new Date(record.timestamp);
        return (
          timestamp >= currentFilters.startDate &&
          timestamp <= currentFilters.endDate &&
          (!currentFilters.site || record.domain === currentFilters.site)
        );
      });
    }

    // 중복 제거: 동일 시각(ms) + 동일 탭ID + 동일 URL 은 하나로 간주
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

    // 시간순 정렬 (중요)
    filteredData.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    console.log(
      `Filtered ${filteredData.length} records from ${allTabLogs.length} total`
    );
  }

  // =========================================================================
  // 시간 계산 유틸리티들
  // =========================================================================

  /**
   * 시간 추정값을 항상 0 이상 & 유한값으로 보정
   */
  function getEstimatedTimeInSeconds(log, index = 0, logs = []) {
    const timeMs = getEstimatedTime(log, index, logs);
    const sec = Math.round(timeMs / 1000);
    return Number.isFinite(sec) ? Math.max(0, sec) : 0;
  }

  /**
   * getEstimatedTime도 NaN/음수 가드
   */
  function getEstimatedTime(log, index = 0, logs = []) {
    const averageTabTime = 30000; // 30초

    if (log.actualTime && log.actualTime > 0) return log.actualTime;

    const cur = new Date(log.timestamp);
    const curMs = cur.getTime();
    if (!Number.isFinite(curMs)) return averageTabTime;

    if (index < logs.length - 1) {
      const nxt = new Date(logs[index + 1]?.timestamp);
      const diff = nxt - cur;
      if (Number.isFinite(diff) && diff > 0 && diff < 10800000) return diff; // 3시간 제한
    } else {
      // 마지막 로그인 경우, 탭 트래커 상태에 따라 처리
      if (isTabTrackerEnabled) {
        // 활성화된 경우: 현재까지의 시간 계산
        const diff = Date.now() - curMs;
        if (Number.isFinite(diff) && diff > 0) return Math.min(diff, 10800000); // 3시간 제한
      } else {
        // 비활성화된 경우: 기본값 사용 (시간 증가 방지)
        return averageTabTime;
      }
    }
    return averageTabTime;
  }

  // ===== 정확한 기간 클리핑을 위한 헬퍼들 =====
  let allLogsSortedCache = null;
  let allLogsSortedTimestamps = null;

  function ensureAllLogsSorted() {
    if (!allLogsSortedCache) {
      allLogsSortedCache = [...allTabLogs].sort(
        (a, b) => new Date(a.timestamp) - new Date(b.timestamp)
      );
      allLogsSortedTimestamps = allLogsSortedCache.map(l =>
        new Date(l.timestamp).getTime()
      );
    }
  }

  function invalidateLogsSortedCache() {
    allLogsSortedCache = null;
    allLogsSortedTimestamps = null;
  }

  // loadData 이후 캐시 무효화
  const _origLoadData = loadData;
  loadData = async function patchedLoadData() {
    const res = await _origLoadData();
    invalidateLogsSortedCache();
    return res;
  };

  function upperBound(arr, target) {
    let lo = 0,
      hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] <= target) lo = mid + 1;
      else hi = mid;
    }
    return lo; // first index with value > target
  }

  function getNextTimestampMs(currentMs) {
    ensureAllLogsSorted();
    if (!allLogsSortedTimestamps || allLogsSortedTimestamps.length === 0)
      return null;
    const idx = upperBound(allLogsSortedTimestamps, currentMs);
    return idx < allLogsSortedTimestamps.length
      ? allLogsSortedTimestamps[idx]
      : null;
  }

  // 같은 탭의 다음 이벤트 시각(ms) 탐색 (없으면 null)
  function getNextTimestampSameTabMs(currentLog) {
    try {
      const curMs = new Date(currentLog.timestamp).getTime();
      const tabId = currentLog.tabId;
      if (!tabId) return null;
      // 시간순으로 한 번만 순회 (데이터 수가 수백~수천 기준 충분히 빠름)
      let nextMs = null;
      for (let i = 0; i < allTabLogs.length; i++) {
        const rec = allTabLogs[i];
        if (rec.tabId !== tabId) continue;
        const ts = new Date(rec.timestamp).getTime();
        if (ts > curMs) {
          nextMs = ts;
          break;
        }
      }
      return nextMs;
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

    // 기본 timespan 계산 (global next 또는 actualTime 사용)
    let spanMs = 0;
    // 1) 명시 끝시간 우선
    if (log.endTime) {
      const end = new Date(log.endTime).getTime();
      if (Number.isFinite(end) && end > curMs) spanMs = end - curMs;
    } else if (log.actualTime && log.actualTime > 0) {
      spanMs = log.actualTime;
    } else {
      // 2) 같은 탭의 다음 이벤트 시각
      let nextMs = getNextTimestampSameTabMs(log);
      if (!nextMs) {
        // 3) 동일 탭이 없으면 전역 다음 이벤트로 보수
        nextMs = getNextTimestampMs(curMs);
      }
      if (nextMs) {
        const diff = nextMs - curMs;
        if (Number.isFinite(diff) && diff > 0 && diff < 10800000) spanMs = diff;
      }
      if (spanMs === 0) {
        if (isTabTrackerEnabled) {
          spanMs = Math.min(Math.max(0, Date.now() - curMs), 10800000);
        } else {
          spanMs = 30000; // 기본값
        }
      }
    }

    const segStart = Math.max(curMs, startMs);
    const segEnd = Math.min(curMs + spanMs, endMs);
    const clipped = Math.max(0, segEnd - segStart);
    return Math.round(clipped / 1000);
  }

  // 로그들을 구간으로 변환 후 합집합 길이(초) 계산
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

      // 끝시각 계산 (endTime > actualTime > same-tab next > 전역 next > fallback)
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
      if (!eMs) {
        eMs = isTabTrackerEnabled
          ? Math.min(sMs + 10800000, Date.now())
          : sMs + 30000;
      }

      const a = Math.max(sMs, startMs);
      const b = Math.min(eMs, endMs);
      if (b > a) intervals.push([a, b]);
    }

    if (intervals.length === 0) return 0;
    intervals.sort((x, y) => x[0] - y[0]);
    let [curS, curE] = intervals[0];
    let total = 0;
    for (let i = 1; i < intervals.length; i++) {
      const [s, e] = intervals[i];
      if (s <= curE) {
        curE = Math.max(curE, e);
      } else {
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

  /**
   * 페이지 초기화
   */
  async function initializePage() {
    console.log("Initializing page...");
    console.log("date-fns available:", typeof window.dateFns !== "undefined");
    console.log(
      "date-fns-tz available:",
      typeof window.dateFnsTz !== "undefined"
    );

    // date-fns-tz 필수 확인
    if (typeof window.dateFnsTz === "undefined") {
      console.error(
        "date-fns-tz is not loaded! Please check UMD bundle links."
      );
      alert(
        "타임존 처리 라이브러리가 로드되지 않았습니다. 페이지를 새로고침해주세요."
      );
      return;
    }

    // 사용자 타임존 및 언어 감지
    currentTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    currentLocale = navigator.language || "ko-KR";

    console.log("Current timezone:", currentTimezone);
    console.log("Current locale:", currentLocale);

    // 타임존 선택기 업데이트
    updateTimezoneSelector();

    // 기본 날짜 설정 - 오늘 하루로 설정
    const today = new Date();

    startDateEl.value = formatDateForInputTZ(today, currentTimezone);
    endDateEl.value = formatDateForInputTZ(today, currentTimezone);
    if (startTimeEl) startTimeEl.value = "00:00";
    if (endTimeEl) endTimeEl.value = "23:59";

    // 초기 필터 설정
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
    } catch (error) {
      console.error("Error setting initial filters:", error);
      currentFilters.startDate = new Date(`${startDateEl.value}T00:00:00`);
      currentFilters.endDate = new Date(`${endDateEl.value}T23:59:59`);
    }

    // 데이터 로드
    await loadData();

    // 탭 트래커 비활성화 경고 표시
    if (!isTabTrackerEnabled) {
      showTabTrackerWarning();
    }

    // 오늘 날짜 표시
    updateStatsTodayDate();

    // 초기 통계 표시
    updateAllStats();
  }

  /**
   * 탭 트래커 비활성화 경고 표시
   */
  function showTabTrackerWarning() {
    const warningHtml = `
      <div id="tab-tracker-warning" style="
        position: fixed;
        top: 20px;
        right: 20px;
        background: linear-gradient(135deg, #ff6b6b, #ee5a24);
        color: white;
        padding: 15px 20px;
        border-radius: 10px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
        z-index: 1000;
        max-width: 300px;
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        animation: slideIn 0.3s ease-out;
      ">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 20px;">⚠️</span>
          <div>
            <div style="font-weight: bold; margin-bottom: 5px;">탭 트래커 비활성화</div>
            <div style="font-size: 14px; opacity: 0.9;">
              정확한 사용시간 측정을 위해 탭 트래커를 활성화해주세요.
            </div>
          </div>
        </div>
        <button onclick="closeTabTrackerWarning()" style="
          position: absolute;
          top: 5px;
          right: 5px;
          background: none;
          border: none;
          color: white;
          font-size: 18px;
          cursor: pointer;
          padding: 0;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
        ">×</button>
      </div>
      <style>
        @keyframes slideIn {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
      </style>
    `;

    document.body.insertAdjacentHTML("beforeend", warningHtml);

    // 10초 후 자동으로 사라지게 설정
    setTimeout(() => {
      const warning = document.getElementById("tab-tracker-warning");
      if (warning) {
        warning.style.animation = "slideIn 0.3s ease-out reverse";
        setTimeout(() => warning.remove(), 300);
      }
    }, 10000);
  }

  /**
   * 탭 트래커 경고 닫기 (전역 함수로 등록)
   */
  window.closeTabTrackerWarning = function () {
    const warning = document.getElementById("tab-tracker-warning");
    if (warning) {
      warning.style.animation = "slideIn 0.3s ease-out reverse";
      setTimeout(() => warning.remove(), 300);
    }
  };

  /**
   * 상세페이지 오늘 날짜 표시
   */
  function updateStatsTodayDate() {
    const todayDateEl = document.getElementById("stats-today-date");
    if (todayDateEl) {
      const today = new Date();
      const options = {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "long",
      };
      const dateString = today.toLocaleDateString("ko-KR", options);
      todayDateEl.textContent = `📅 ${dateString}`;
    }
  }

  /**
   * 모든 통계 업데이트
   */
  async function updateAllStats() {
    console.log("Updating all stats...");

    // 시간 범위 표시 업데이트
    updateTimeRangeDisplay();

    // 필터 적용
    filterData();

    // 디버그: 범위 내 합산 검증 로그 (필요시 주석 처리 가능)
    if (false) {
      console.group("Clipped sum debug");
      filteredData.slice(0, 50).forEach(r => {
        const s = getTimeInRangeSeconds(
          r,
          currentFilters.startDate,
          currentFilters.endDate
        );
        console.log(r.timestamp, r.domain, s);
      });
      console.groupEnd();
    }

    // 결과 표시
    await displayResults();
  }

  /**
   * 타임존 선택기 업데이트
   */
  function updateTimezoneSelector() {
    const currentOption = Array.from(timezoneSelectEl.options).find(
      opt => opt.value === currentTimezone
    );
    if (!currentOption) {
      const option = document.createElement("option");
      option.value = currentTimezone;
      option.textContent = `🌍 ${currentTimezone}`;
      timezoneSelectEl.appendChild(option);
    }
    timezoneSelectEl.value = currentTimezone;
  }

  // =========================================================================
  // 이벤트 핸들러들
  // =========================================================================

  /**
   * 이벤트 리스너 등록
   */
  function setupEventListeners() {
    // 필터 적용
    if (applyFilterBtn) {
      applyFilterBtn.addEventListener("click", async () => {
        await applyFilters();
      });
    }

    // 필터 초기화
    if (resetFilterBtn) {
      resetFilterBtn.addEventListener("click", async () => {
        await resetFilters();
      });
    }

    // 새로고침
    if (refreshDataBtn) {
      refreshDataBtn.addEventListener("click", async () => {
        await refreshData();
      });
    }

    // 데이터 내보내기
    if (exportDataBtn) {
      exportDataBtn.addEventListener("click", () => {
        exportData();
      });
    }

    // 분석 단위 변경
    if (viewDailyBtn) {
      viewDailyBtn.addEventListener("click", () => setView("daily"));
    }
    if (viewHourlyBtn) {
      viewHourlyBtn.addEventListener("click", () => setView("hourly"));
    }
    if (viewWeeklyBtn) {
      viewWeeklyBtn.addEventListener("click", () => setView("weekly"));
    }

    // 타임존 변경
    if (timezoneSelectEl) {
      timezoneSelectEl.addEventListener("change", async () => {
        currentTimezone = timezoneSelectEl.value;
        await applyFilters();
      });
    }

    // 사이트 필터 변경
    if (siteFilterEl) {
      siteFilterEl.addEventListener("change", async () => {
        currentFilters.site = siteFilterEl.value;
        await applyFilters();
      });
    }

    // 날짜 입력 변경
    if (startDateEl) {
      startDateEl.addEventListener("change", () => updateTimeRangeDisplay());
    }
    if (endDateEl) {
      endDateEl.addEventListener("change", () => updateTimeRangeDisplay());
    }
    if (startTimeEl) {
      startTimeEl.addEventListener("change", () => updateTimeRangeDisplay());
    }
    if (endTimeEl) {
      endTimeEl.addEventListener("change", () => updateTimeRangeDisplay());
    }

    // 상세 데이터 리스트 클릭 이벤트 리스너
    if (timelineContainer) {
      timelineContainer.addEventListener("click", e => {
        const siteEntry = e.target.closest(".site-entry");
        if (siteEntry) {
          const url = siteEntry.getAttribute("data-url");
          if (url) {
            window.open(url, "_blank");
          }
        }
      });
    }
  }

  // =========================================================================
  // 필터 관련 함수들
  // =========================================================================

  /**
   * 필터 적용
   */
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
    } catch (error) {
      console.error("Error applying filters:", error);
      alert("필터 적용 중 오류가 발생했습니다.");
    } finally {
      showLoading(false);
    }
  }

  /**
   * 필터 초기화
   */
  async function resetFilters() {
    const today = new Date();
    const weekAgo = new Date(today.getTime() - 6 * 24 * 60 * 60 * 1000);

    startDateEl.value = formatDateForInputTZ(weekAgo, currentTimezone);
    endDateEl.value = formatDateForInputTZ(today, currentTimezone);
    if (startTimeEl) startTimeEl.value = "00:00";
    if (endTimeEl) endTimeEl.value = "23:59";

    siteFilterEl.value = "";
    currentFilters.site = "";

    timezoneSelectEl.value = currentTimezone;
    setView("daily");

    await applyFilters();
  }

  /**
   * 데이터 새로고침
   */
  async function refreshData() {
    try {
      refreshDataBtn.classList.add("loading");
      refreshDataBtn.disabled = true;

      await loadData();
      await applyFilters();
    } catch (error) {
      console.error("Error refreshing data:", error);
      alert("데이터 새로고침 중 오류가 발생했습니다.");
    } finally {
      refreshDataBtn.classList.remove("loading");
      refreshDataBtn.disabled = false;
    }
  }

  // =========================================================================
  // 뷰 관련 함수들
  // =========================================================================

  /**
   * 뷰 설정
   */
  function setView(view) {
    currentView = view;
    updateViewButtons();

    if (queryDebounceTimer) {
      clearTimeout(queryDebounceTimer);
    }
    queryDebounceTimer = setTimeout(() => {
      updateCharts();
      updateTimeList();
    }, 300);
  }

  /**
   * 뷰 버튼 업데이트
   */
  function updateViewButtons() {
    viewDailyBtn.classList.toggle("active", currentView === "daily");
    viewHourlyBtn.classList.toggle("active", currentView === "hourly");
    viewWeeklyBtn.classList.toggle("active", currentView === "weekly");
  }

  // =========================================================================
  // 결과 표시 함수들
  // =========================================================================

  /**
   * 결과 표시
   */
  async function displayResults() {
    console.log("Displaying results...");
    console.log("Filtered data length:", filteredData.length);
    console.log("All tab logs length:", allTabLogs.length);

    if (filteredData.length === 0) {
      console.log("No filtered data, showing no data message");
      showNoData();
      return;
    }

    // 중복 제거: 구간 합집합으로 총 사용 시간 계산
    const totalSeconds = getUnionTimeSeconds(
      currentFilters.startDate,
      currentFilters.endDate,
      filteredData
    );
    // 상한: 선택한 범위 길이를 넘지 않도록 가드 (클리핑된 합이 예기치 않게 커지는 경우 방지)
    const rangeSeconds = Math.max(
      0,
      Math.round((currentFilters.endDate - currentFilters.startDate) / 1000)
    );
    const safeTotalSeconds = Math.min(totalSeconds, rangeSeconds);

    const uniqueSites = new Set(filteredData.map(record => record.domain)).size;
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

    // 오늘 하루인 경우 특별한 표시
    const today = new Date();
    const isToday =
      startStr === endStr &&
      window.dateFnsTz.formatInTimeZone(
        today,
        currentTimezone,
        "yyyy년 MM월 dd일"
      ) === startStr;

    if (isToday) {
      resultsPeriod.textContent = `${startStr} (오늘)`;
    } else {
      resultsPeriod.textContent = `${startStr} ~ ${endStr}`;
    }

    updateCharts();
    updateTimeList();
    updateTimeline();
    updateSiteList();

    resultsSection.style.display = "block";
    resultsSection.classList.add("show");
  }

  /**
   * 데이터 없음 표시
   */
  function showNoData() {
    resultsSection.style.display = "none";

    const noDataHtml = `
      <div class="no-data">
        <div class="no-data-icon">📊</div>
        <div class="no-data-title">데이터가 없습니다</div>
        <div class="no-data-message">
          선택한 기간에 탭 활동 데이터가 없습니다.<br>
          다른 기간을 선택하거나 탭 추적을 활성화해주세요.
        </div>
      </div>
    `;

    timelineContainer.innerHTML = noDataHtml;
  }

  // =========================================================================
  // 기타 유틸리티 함수들
  // =========================================================================

  /**
   * 시간 범위 표시 업데이트
   */
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

  /**
   * 로딩 상태 표시
   */
  function showLoading(show) {
    const loadingElements = document.querySelectorAll(".loading-overlay");
    loadingElements.forEach(el => {
      el.style.display = show ? "flex" : "none";
    });
  }

  /**
   * 데이터 내보내기
   */
  function exportData() {
    const exportData = {
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

    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
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
  // 차트 관련 함수들
  // =========================================================================

  /**
   * 차트 업데이트
   */
  function updateCharts() {
    console.log("Updating charts...");
    console.log("Filtered data length:", filteredData.length);
    console.log("Current view:", currentView);

    if (filteredData.length === 0) {
      console.log("No filtered data, showing no data message");
      showNoData();
      return;
    }

    console.log("Updating time chart...");
    updateTimeChart();
    console.log("Updating distribution chart...");
    updateDistributionChart();
    console.log("Charts update completed");
  }

  /**
   * 시간 추이 차트 업데이트
   */
  function updateTimeChart() {
    console.log("updateTimeChart called");
    if (!timeChartEl) {
      console.log("timeChartEl not found");
      return;
    }

    // 기존 차트 제거
    if (timeChart) {
      console.log("Destroying existing time chart");
      timeChart.destroy();
    }

    // 데이터 집계
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

    console.log("Aggregated data:", aggregatedData);
    console.log("Aggregated data length:", aggregatedData.length);

    if (aggregatedData.length === 0) {
      console.log("No aggregated data, showing no data");
      showNoData();
      return;
    }

    // 차트 데이터 준비
    const labels = aggregatedData.map(item => {
      try {
        // item.date는 이미 날짜 문자열이므로 직접 파싱
        const date = new Date(item.date);
        if (isNaN(date.getTime())) {
          console.warn("Invalid date:", item.date);
          return "Invalid Date";
        }
        return formatDateLabel(date, currentView);
      } catch (error) {
        console.error("Error formatting date label:", error, item.date);
        return "Invalid Date";
      }
    });
    const data = aggregatedData.map(item => item.totalSeconds / 60); // 분 단위로 변환

    console.log("Chart labels:", labels);
    console.log("Chart data:", data);

    // 차트 타입 결정 (데이터가 2개 이하면 막대 차트)
    const chartType = data.filter(d => d > 0).length <= 2 ? "bar" : "line";
    console.log("Chart type:", chartType);

    const ctx = timeChartEl.getContext("2d");
    console.log("Canvas context obtained");

    timeChart = new Chart(ctx, {
      type: chartType,
      data: {
        labels: labels,
        datasets: [
          {
            label: "사용 시간 (분)",
            data: data,
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
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            titleColor: "#fff",
            bodyColor: "#fff",
            callbacks: {
              label: function (context) {
                const minutes = context.parsed.y;
                const hours = Math.floor(minutes / 60);
                const mins = Math.round(minutes % 60);
                return `${hours}시간 ${mins}분`;
              },
            },
          },
        },
        scales: {
          y: {
            beginAtZero: true,
            grid: {
              color: "rgba(255, 255, 255, 0.1)",
            },
            ticks: {
              color: "rgba(255, 255, 255, 0.8)",
              callback: function (value) {
                const minutes = value;
                const hours = Math.floor(minutes / 60);
                const mins = Math.round(minutes % 60);
                return hours > 0 ? `${hours}시간 ${mins}분` : `${mins}분`;
              },
              // 중복 라벨 방지
              maxTicksLimit: 8,
              // 최소 간격 설정
              stepSize: Math.max(1, Math.ceil(Math.max(...data) / 8)),
            },
          },
          x: {
            grid: {
              color: "rgba(255, 255, 255, 0.1)",
            },
            ticks: {
              color: "rgba(255, 255, 255, 0.8)",
              maxRotation: 45,
            },
          },
        },
      },
    });
  }

  /**
   * 분포 차트 업데이트
   */
  function updateDistributionChart() {
    if (!distributionChartEl) return;

    // 기존 차트 제거
    if (distributionChart) {
      distributionChart.destroy();
    }

    // 사이트별 사용 시간 집계
    const siteUsage = new Map();
    filteredData.forEach((record, index, arr) => {
      const domain = record.domain || "unknown";
      const timeSpent = getEstimatedTimeInSeconds(record, index, arr);
      siteUsage.set(domain, (siteUsage.get(domain) || 0) + timeSpent);
    });

    // 상위 6개 사이트 + 기타
    const sortedSites = Array.from(siteUsage.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6);

    const totalSeconds = sortedSites.reduce(
      (sum, [_, seconds]) => sum + (Number.isFinite(seconds) ? seconds : 0),
      0
    );
    const otherSeconds =
      Array.from(siteUsage.values()).reduce(
        (sum, seconds) => sum + (Number.isFinite(seconds) ? seconds : 0),
        0
      ) - totalSeconds;

    const labels = sortedSites.map(([domain, _]) => domain);
    const data = sortedSites.map(([_, seconds]) => seconds / 60); // 분 단위

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
        labels: labels,
        datasets: [
          {
            data: data,
            backgroundColor: colors.slice(0, labels.length),
            borderWidth: 2,
            borderColor: "rgba(255, 255, 255, 0.2)",
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "60%",
        plugins: {
          legend: {
            display: false,
          },
          tooltip: {
            backgroundColor: "rgba(0, 0, 0, 0.8)",
            titleColor: "#fff",
            bodyColor: "#fff",
            callbacks: {
              label: function (context) {
                const minutes = context.parsed;
                const hours = Math.floor(minutes / 60);
                const mins = Math.round(minutes % 60);
                const percentage = (
                  (minutes / data.reduce((a, b) => a + b, 0)) *
                  100
                ).toFixed(1);
                return `${context.label}: ${hours}시간 ${mins}분 (${percentage}%)`;
              },
            },
          },
        },
      },
    });
  }

  // =========================================================================
  // 집계 유틸리티들
  // =========================================================================

  /**
   * 일별 그룹화
   */
  function groupByDay(start, end, records) {
    const groups = new Map();

    records.forEach((record, index, arr) => {
      const dateUtc = new Date(record.timestamp);
      const date = window.dateFnsTz.utcToZonedTime(dateUtc, currentTimezone);
      const key = getDateKey(date, "daily");
      groups.set(
        key,
        groups.get(key) || {
          date: key,
          totalSeconds: 0,
          sites: new Map(),
          sessions: 0,
        }
      );

      const group = groups.get(key);
      const timeSpent = getTimeInRangeSeconds(record, start, end);
      group.totalSeconds += timeSpent;
      group.sessions += 1;

      const domain = record.domain || "unknown";
      group.sites.set(domain, (group.sites.get(domain) || 0) + timeSpent);
    });

    return Array.from(groups.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }

  /**
   * 시간별 그룹화
   */
  function groupByHour(start, end, records) {
    const groups = new Map();

    records.forEach((record, index, arr) => {
      const dateUtc = new Date(record.timestamp);
      const date = window.dateFnsTz.utcToZonedTime(dateUtc, currentTimezone);
      const key = getDateKey(date, "hourly");
      groups.set(
        key,
        groups.get(key) || {
          date: key,
          totalSeconds: 0,
          sites: new Map(),
          sessions: 0,
        }
      );

      const group = groups.get(key);
      const timeSpent = getTimeInRangeSeconds(record, start, end);
      group.totalSeconds += timeSpent;
      group.sessions += 1;

      const domain = record.domain || "unknown";
      group.sites.set(domain, (group.sites.get(domain) || 0) + timeSpent);
    });

    return Array.from(groups.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }

  /**
   * 주별 그룹화
   */
  function groupByWeek(start, end, records) {
    const groups = new Map();

    records.forEach((record, index, arr) => {
      const dateUtc = new Date(record.timestamp);
      const date = window.dateFnsTz.utcToZonedTime(dateUtc, currentTimezone);
      const key = getDateKey(date, "weekly");
      groups.set(
        key,
        groups.get(key) || {
          date: key,
          totalSeconds: 0,
          sites: new Map(),
          sessions: 0,
        }
      );

      const group = groups.get(key);
      const timeSpent = getTimeInRangeSeconds(record, start, end);
      group.totalSeconds += timeSpent;
      group.sessions += 1;

      const domain = record.domain || "unknown";
      group.sites.set(domain, (group.sites.get(domain) || 0) + timeSpent);
    });

    return Array.from(groups.values()).sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }

  /**
   * 시간별 사용 시간 리스트 업데이트
   */
  function updateTimeList() {
    if (!timeListContainer) return;

    if (filteredData.length === 0) {
      timeListContainer.innerHTML =
        '<div class="no-data">데이터가 없습니다</div>';
      return;
    }

    let timeListHtml = "";

    if (currentView === "daily") {
      // 일별 데이터
      const dailyGroups = groupByDay(
        currentFilters.startDate,
        currentFilters.endDate,
        filteredData
      );

      dailyGroups.forEach(group => {
        try {
          const date = new Date(group.date);
          if (isNaN(date.getTime())) {
            console.warn("Invalid date in time list:", group.date);
            return;
          }

          const dateLabel = formatDateLabel(date, "daily");
          timeListHtml += `
            <div class="time-list-item">
              <div class="time-list-date">${dateLabel}</div>
              <div class="time-list-duration">${formatDuration(
                group.totalSeconds
              )}</div>
            </div>
          `;
        } catch (error) {
          console.error(
            "Error processing daily group in time list:",
            error,
            group
          );
        }
      });
    } else if (currentView === "hourly") {
      // 시간별 데이터
      const hourlyGroups = groupByHour(
        currentFilters.startDate,
        currentFilters.endDate,
        filteredData
      );

      hourlyGroups.forEach(group => {
        try {
          const date = new Date(group.date);
          if (isNaN(date.getTime())) {
            console.warn("Invalid date in time list:", group.date);
            return;
          }

          const timeLabel = formatDateLabel(date, "hourly");
          timeListHtml += `
            <div class="time-list-item">
              <div class="time-list-date">${timeLabel}</div>
              <div class="time-list-duration">${formatDuration(
                group.totalSeconds
              )}</div>
            </div>
          `;
        } catch (error) {
          console.error(
            "Error processing hourly group in time list:",
            error,
            group
          );
        }
      });
    } else if (currentView === "weekly") {
      // 주별 데이터
      const weeklyGroups = groupByWeek(
        currentFilters.startDate,
        currentFilters.endDate,
        filteredData
      );

      weeklyGroups.forEach(group => {
        try {
          const date = new Date(group.date);
          if (isNaN(date.getTime())) {
            console.warn("Invalid date in time list:", group.date);
            return;
          }

          const weekLabel = formatDateLabel(date, "weekly");
          timeListHtml += `
            <div class="time-list-item">
              <div class="time-list-date">${weekLabel}</div>
              <div class="time-list-duration">${formatDuration(
                group.totalSeconds
              )}</div>
            </div>
          `;
        } catch (error) {
          console.error(
            "Error processing weekly group in time list:",
            error,
            group
          );
        }
      });
    }

    timeListContainer.innerHTML = timeListHtml;
  }

  /**
   * 타임라인 업데이트 (상세 데이터 리스트)
   */
  function updateTimeline() {
    if (!timelineContainer) return;

    let timelineHtml = "";

    // 조회 기간 내 접속한 모든 페이지를 최신순으로 표시하되,
    // 시간 계산은 오름차순으로 정렬된 filteredData를 기준으로 수행
    const sortedData = [...filteredData].sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
    );

    timelineHtml += `
      <div class="timeline-day">
        <div class="day-header">조회 기간 내 접속 페이지 목록</div>
        <div class="day-summary">
          총 ${sortedData.length}개 페이지 | 시간 순 정렬
        </div>
    `;

    sortedData.forEach((record, displayIndex) => {
      const indexInAsc = filteredData.indexOf(record);
      const timeSpent = getEstimatedTimeInSeconds(
        record,
        indexInAsc,
        filteredData
      );
      const visitTime = new Date(record.timestamp).toLocaleString("ko-KR", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });

      // URL과 제목 길이 제한
      let displayUrl = record.url;

      // URL이 너무 길면 중간 부분을 잘라서 표시
      if (displayUrl.length > 60) {
        const protocol = displayUrl.startsWith("https://")
          ? "https://"
          : displayUrl.startsWith("http://")
          ? "http://"
          : "";
        const domain = displayUrl.replace(/^https?:\/\//, "").split("/")[0];
        const path = displayUrl.replace(/^https?:\/\/[^\/]+/, "");

        if (path.length > 0) {
          const maxPathLength = 60 - protocol.length - domain.length - 3;
          if (path.length > maxPathLength) {
            const lastPart = path.substring(
              path.length - Math.floor(maxPathLength / 2)
            );
            displayUrl = `${protocol}${domain}...${lastPart}`;
          }
        } else {
          displayUrl = `${protocol}${domain}`;
        }
      }

      const truncatedTitle =
        record.title.length > 40
          ? record.title.substring(0, 37) + "..."
          : record.title;

      timelineHtml += `
        <div class="site-entry" data-url="${
          record.url
        }" style="cursor: pointer;">
          <div class="site-info">
            <div class="site-title-col" title="${record.title}">${
        displayIndex + 1
      }. ${truncatedTitle}</div>
            <div class="site-url-col" title="${record.url}">${displayUrl}</div>
          </div>
          <div class="site-time"><span class="visit-time">${visitTime}</span> | <span class="duration">${formatDuration(
        timeSpent
      )}</span></div>
        </div>
      `;
    });

    timelineHtml += "</div>";

    timelineContainer.innerHTML = timelineHtml;

    // 타임라인 검색 필터 적용
    const searchInput = document.getElementById("timeline-search");
    if (searchInput) {
      searchInput.oninput = () => {
        const q = (searchInput.value || "").trim().toLowerCase();
        if (!q) {
          // 검색어 없으면 전체 다시 그림
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
        // 검색 결과로만 리스트 그리기 (최신순 표시는 유지)
        const backup = filteredData;
        filteredData = filtered;
        const originalView = timelineContainer.innerHTML;
        try {
          let tmpHtml = "";
          const sortedTmp = [...filteredData].sort(
            (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
          );
          sortedTmp.forEach(rec => {
            const iAsc = backup.indexOf(rec);
            const ts = getEstimatedTimeInSeconds(rec, iAsc, backup);
            const vt = new Date(rec.timestamp).toLocaleString("ko-KR", {
              year: "numeric",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
            });
            const td =
              rec.title.length > 40
                ? rec.title.substring(0, 37) + "..."
                : rec.title;
            let du = rec.url;
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
              } else {
                du = `${proto}${dom}`;
              }
            }
            tmpHtml += `
              <div class="site-entry" data-url="${
                rec.url
              }" style="cursor: pointer;">
                <div class="site-info">
                  <div class="site-title-col" title="${rec.title}">${td}</div>
                  <div class="site-url-col" title="${rec.url}">${du}</div>
                </div>
                <div class="site-time"><span class="visit-time">${vt}</span> | <span class="duration">${formatDuration(
              ts
            )}</span></div>
              </div>`;
          });
          timelineContainer.innerHTML = `
            <div class="timeline-day">
              <div class="day-header">조회 기간 내 접속 페이지 목록</div>
              <div class="day-summary">총 ${sortedTmp.length}개 페이지 | 시간 순 정렬</div>
            ${tmpHtml}
            </div>`;
        } finally {
          filteredData = backup;
        }
      };
    }
  }

  /**
   * 사이트 목록 업데이트
   */
  function updateSiteList() {
    const siteListContainer = document.getElementById("site-list-container");
    const siteList = document.getElementById("site-list");

    if (!siteListContainer || !siteList) return;

    // 사이트별 사용 시간 집계
    const siteUsage = new Map();
    filteredData.forEach((record, index, arr) => {
      const domain = record.domain || "unknown";
      const timeSpent = getEstimatedTimeInSeconds(record, index, arr);
      siteUsage.set(domain, (siteUsage.get(domain) || 0) + timeSpent);
    });

    if (siteUsage.size === 0) {
      siteListContainer.style.display = "none";
      return;
    }

    // 사용 시간 순으로 정렬
    const sortedSites = Array.from(siteUsage.entries()).sort(
      (a, b) => b[1] - a[1]
    );

    const totalSeconds = sortedSites.reduce(
      (sum, [_, seconds]) => sum + (Number.isFinite(seconds) ? seconds : 0),
      0
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

    let siteListHtml = "";
    sortedSites.forEach(([domain, seconds], index) => {
      const percentage =
        totalSeconds > 0 ? ((seconds / totalSeconds) * 100).toFixed(1) : 0;
      const color = colors[index % colors.length];

      siteListHtml += `
        <div class="site-item">
          <div class="site-item-info">
            <div class="site-color" style="background-color: ${color}"></div>
            <div class="site-domain">${domain}</div>
          </div>
          <div class="site-time">
            ${formatDuration(seconds)}
            <span class="site-percentage">(${percentage}%)</span>
          </div>
        </div>
      `;
    });

    siteList.innerHTML = siteListHtml;
    siteListContainer.style.display = "block";
  }

  /**
   * 현재 열린 Chrome 창 개수
   */
  async function getOpenWindowsCount() {
    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.windows &&
        chrome.windows.getAll
      ) {
        return new Promise(resolve => {
          chrome.windows.getAll({}, windows => {
            resolve(Array.isArray(windows) ? windows.length : 1);
          });
        });
      }
    } catch (e) {
      console.warn("getOpenWindowsCount failed:", e);
    }
    return 1;
  }

  /**
   * 현재 열린 탭 총 개수 (모든 창 합계)
   */
  async function getOpenTabsCount() {
    try {
      if (typeof chrome !== "undefined" && chrome.tabs && chrome.tabs.query) {
        return new Promise(resolve => {
          chrome.tabs.query({}, tabs => {
            resolve(Array.isArray(tabs) ? tabs.length : 0);
          });
        });
      }
    } catch (e) {
      console.warn("getOpenTabsCount failed:", e);
    }
    return 0;
  }

  // =========================================================================
  // 초기화
  // =========================================================================

  // DOM 요소 검증
  if (!validateDOMElements()) {
    console.error(
      "Required DOM elements are missing. Please check the HTML structure."
    );
    return;
  }

  setupEventListeners();
  initializePage();
});
