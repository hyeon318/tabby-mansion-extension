// 다국어 지원 유틸리티
class I18n {
  constructor() {
    this.locale = "en";
    this.messages = {};
  }

  // UI 언어 -> 지원 로케일 매핑
  resolveSupportedLocale(uiLanguage) {
    const lang = (uiLanguage || "en").toLowerCase();
    if (lang.startsWith("ko")) return "ko";
    if (lang.startsWith("ja")) return "ja";
    return "en";
  }

  async initialize() {
    try {
      // Chrome API가 있는지 확인
      if (
        typeof chrome !== "undefined" &&
        chrome.storage &&
        chrome.storage.local
      ) {
        const stored = await chrome.storage.local.get(["language"]);
        const uiLang = chrome.i18n?.getUILanguage?.() || "en";
        const preferred =
          stored?.language || this.resolveSupportedLocale(uiLang);
        await this.loadMessagesFromLocale(preferred);
        this.locale = preferred;
      } else {
        // Chrome API가 없는 경우 (일반 웹페이지에서 테스트할 때)
        this.locale = this.resolveSupportedLocale(navigator.language);
        await this.loadMessagesFromLocale(this.locale);
      }
      this.updatePageText();
    } catch (err) {
      console.warn("i18n initialize failed:", err);
      this.locale = this.resolveSupportedLocale(navigator.language);
      this.loadMessages();
      this.updatePageText();
    }
  }

  // 기본 i18n API 백업 로드 (브라우저 로케일 기반)
  loadMessages() {
    try {
      this.messages = {};
    } catch (error) {
      console.warn("i18n messages 로드 실패:", error);
      this.messages = {};
    }
  }

  // 커스텀 메시지 로딩 (확장 내 _locales 경로에서 직접)
  async loadMessagesFromLocale(locale) {
    try {
      let url;
      if (
        typeof chrome !== "undefined" &&
        chrome.runtime &&
        chrome.runtime.getURL
      ) {
        url = chrome.runtime.getURL(`_locales/${locale}/messages.json`);
      } else {
        // 일반 웹페이지에서 테스트할 때
        url = `_locales/${locale}/messages.json`;
      }
      const res = await fetch(url, { cache: "no-cache" });
      if (!res.ok) throw new Error(`Failed to load locale file: ${locale}`);
      const json = await res.json();
      // messages.json 포맷을 key -> string 으로 평탄화
      this.messages = Object.fromEntries(
        Object.entries(json).map(([k, v]) => [k, (v && v.message) || ""])
      );
    } catch (error) {
      console.warn(`Failed to load locale ${locale}:`, error);
      // 기본 영어 메시지로 폴백
      this.messages = {
        extName: "TabbyMansion",
        extShortName: "TabbyMansion",
        extDescription: "Focus session timer with tab activity tracking",
        sharedTimer: "Shared Timer",
        start: "Start",
        pause: "Pause",
        reset: "Reset",
        timerLabel: "Timer Label (Optional)",
        stopwatchTimer: "Stopwatch Timer",
        stopwatchDescription: "Display floating timer on screen",
        tabActivityTracking: "Tab Activity Tracking",
        tabTrackingDescription: "Save active tab switching records",
        siteUsageStats: "Site Usage Statistics",
        chart: "Chart",
        log: "Log",
        details: "Details",
        focusWorkTimer: "Focus Work Timer & Tab Tracker",
      };
    }
  }

  // getMessage(key, substitutions = []) {
  //   try {
  //     const local = this.messages?.[key];
  //     if (local) {
  //       if (!Array.isArray(substitutions) || substitutions.length === 0)
  //         return local;
  //       return this.applySubstitutions(local, substitutions);
  //     }
  //     // 폴백: Chrome i18n
  //     const fromChrome = chrome.i18n?.getMessage?.(key, substitutions);
  //     return fromChrome || key;
  //   } catch (error) {
  //     console.warn(`i18n 메시지 가져오기 실패 (${key}):`, error);
  //     return key;
  //   }
  // }
  // i18n.js
  getMessage(key, substitutions) {
    try {
      let msg = this.messages?.[key];
      if (!msg && typeof chrome !== "undefined" && chrome.i18n?.getMessage) {
        msg = chrome.i18n.getMessage(
          key,
          Array.isArray(substitutions) ? substitutions : undefined
        );
      }
      if (!msg) return key;

      if (Array.isArray(substitutions) && substitutions.length) {
        substitutions.forEach((val, i) => {
          msg = msg.replace(new RegExp(`\\$${i + 1}`, "g"), String(val));
        });
      } else if (substitutions && typeof substitutions === "object") {
        Object.entries(substitutions).forEach(([name, val]) => {
          msg = msg.replace(new RegExp(`\\{${name}\\}`, "g"), String(val));
        });
      }
      return msg;
    } catch (e) {
      console.warn(`i18n getMessage failed (${key})`, e);
      return key;
    }
  }

  applySubstitutions(template, substitutions) {
    let result = template;
    substitutions.forEach((s, idx) => {
      result = result.replace(new RegExp(`\u0000${idx}\u0000`, "g"), String(s));
    });
    return result;
  }

  updatePageText() {
    try {
      const elements = document.querySelectorAll("[data-i18n]");
      elements.forEach(element => {
        const key = element.getAttribute("data-i18n");
        const message = this.getMessage(key);
        if (message && message !== key) {
          // 동적 텍스트 처리 (예: "총 {count}개 페이지")
          let finalMessage = message;
          const countMatch = message.match(/\{count\}/);
          if (countMatch) {
            // count 값이 있는 경우 동적으로 치환
            const count = element.getAttribute("data-count") || "0";
            finalMessage = message.replace(/\{count\}/g, count);
          }
          // 버튼/일반 텍스트 모두 대응
          element.textContent = finalMessage;
        }
      });

      const inputs = document.querySelectorAll("[data-i18n-placeholder]");
      inputs.forEach(input => {
        const key = input.getAttribute("data-i18n-placeholder");
        const message = this.getMessage(key);
        if (message && message !== key) {
          input.placeholder = message;
        }
      });

      const titleElements = document.querySelectorAll("[data-i18n-title]");
      titleElements.forEach(element => {
        const key = element.getAttribute("data-i18n-title");
        const message = this.getMessage(key);
        if (message && message !== key) {
          element.title = message;
        }
      });

      const altElements = document.querySelectorAll("[data-i18n-alt]");
      altElements.forEach(element => {
        const key = element.getAttribute("data-i18n-alt");
        const message = this.getMessage(key);
        if (message && message !== key) {
          element.alt = message;
        }
      });

      const contentElements = document.querySelectorAll("[data-i18n-content]");
      contentElements.forEach(element => {
        const key = element.getAttribute("data-i18n-content");
        const message = this.getMessage(key);
        if (message && message !== key) {
          element.content = message;
        }
      });

      // data-i18n-format 요소들 업데이트
      this.updateDateFormatElements();
    } catch (error) {
      console.warn("i18n 텍스트 업데이트 중 오류:", error);
    }
  }

  getCurrentLanguage() {
    return this.locale;
  }

  async setLanguage(locale) {
    try {
      if (
        typeof chrome !== "undefined" &&
        chrome.storage &&
        chrome.storage.local
      ) {
        await chrome.storage.local.set({ language: locale });
      }
      await this.loadMessagesFromLocale(locale);
      this.locale = locale;
      this.updatePageText();
      // 전체 페이지를 사용하는 컨텍스트들은 리로드로 안전 적용
      setTimeout(() => window.location.reload(), 300);
    } catch (e) {
      console.error("언어 변경 실패:", e);
    }
  }

  formatDate(date, options = {}) {
    const defaultOptions = { year: "numeric", month: "long", day: "numeric" };
    const localeMap = { ko: "ko-KR", ja: "ja-JP", en: "en-US" };
    const loc = localeMap[this.locale] || "en-US";
    return date.toLocaleDateString(loc, { ...defaultOptions, ...options });
  }

  formatTime(date, options = {}) {
    const defaultOptions = { hour: "2-digit", minute: "2-digit" };
    const localeMap = { ko: "ko-KR", ja: "ja-JP", en: "en-US" };
    const loc = localeMap[this.locale] || "en-US";
    return date.toLocaleTimeString(loc, { ...defaultOptions, ...options });
  }

  formatNumber(number, options = {}) {
    const localeMap = { ko: "ko-KR", ja: "ja-JP", en: "en-US" };
    const loc = localeMap[this.locale] || "en-US";
    return Number(number).toLocaleString(loc, options);
  }

  // 날짜·시간 통합 유틸리티 함수들
  formatDateWithFormat(date, formatKey) {
    if (!date) return "";

    const format = this.getMessage(formatKey);
    if (!format || format === formatKey) {
      // 폴백: 기본 포맷
      return this.formatDate(date);
    }

    try {
      // date-fns 임포트가 있는지 확인
      if (typeof window !== "undefined" && window.dateFns) {
        const { format: dateFnsFormat } = window.dateFns;
        const locale = this.getDateFnsLocale();
        return dateFnsFormat(date, format, { locale });
      } else {
        // 폴백: 브라우저 내장 포맷
        return this.formatDate(date);
      }
    } catch (error) {
      console.warn("Date formatting error:", error);
      return this.formatDate(date);
    }
  }

  getDateFnsLocale() {
    // date-fns 로케일 매핑
    if (typeof window !== "undefined" && window.dateFnsLocales) {
      const { ko, ja, enUS } = window.dateFnsLocales;
      switch (this.locale) {
        case "ko":
          return ko;
        case "ja":
          return ja;
        case "en":
        default:
          return enUS;
      }
    }
    return null;
  }

  // 시간 지속시간 포맷팅
  formatDuration(milliseconds) {
    if (!milliseconds || milliseconds < 0)
      return this.getMessage("noData") || "0분";

    const totalMinutes = Math.round(milliseconds / 1000 / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    if (hours > 0) {
      const hoursText =
        this.getMessage("hoursMinutes") || "{hours}시간 {minutes}분";
      return hoursText
        .replace("{hours}", hours.toString())
        .replace("{minutes}", minutes.toString());
    } else {
      const minutesText = this.getMessage("minutesOnly") || "{minutes}분";
      return minutesText.replace("{minutes}", minutes.toString());
    }
  }

  // 차트용 시간 포맷팅 (분 단위)
  formatMinutes(minutes) {
    if (!minutes || minutes < 0) return this.getMessage("noData") || "0분";

    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);

    if (hours > 0) {
      const hoursText =
        this.getMessage("hoursMinutes") || "{hours}시간 {minutes}분";
      return hoursText
        .replace("{hours}", hours.toString())
        .replace("{minutes}", mins.toString());
    } else {
      const minutesText = this.getMessage("minutesOnly") || "{minutes}분";
      return minutesText.replace("{minutes}", mins.toString());
    }
  }

  // 날짜 범위 포맷팅
  formatDateRange(startDate, endDate) {
    if (!startDate || !endDate) return "";

    const startStr = this.formatDateWithFormat(startDate, "dateFull");
    const endStr = this.formatDateWithFormat(endDate, "dateFull");
    const separator = this.getMessage("dateRangeSeparator") || " ~ ";

    // 같은 날인지 확인
    const isSameDay = startDate.toDateString() === endDate.toDateString();
    const today = new Date();
    const isToday =
      isSameDay && startDate.toDateString() === today.toDateString();

    if (isSameDay) {
      const todayLabel = this.getMessage("todayLabel") || "(오늘)";
      return isToday ? `${startStr} ${todayLabel}` : startStr;
    } else {
      return `${startStr}${separator}${endStr}`;
    }
  }

  // data-i18n-format 요소들 업데이트
  updateDateFormatElements() {
    const formatElements = document.querySelectorAll("[data-i18n-format]");
    formatElements.forEach(element => {
      const formatKey = element.getAttribute("data-i18n-format");

      if (element.id === "stats-today-date" || element.id === "today-date") {
        // 오늘 날짜 표시 (stats와 popup 모두)
        const today = new Date();
        const dateString = this.formatDateWithFormat(today, formatKey);
        element.textContent = `📅 ${dateString}`;
      } else if (element.id === "results-period") {
        // 조회 기간 표시 - stats.js에서 별도 처리
        // 여기서는 빈 처리
      }
    });
  }

  // 단위 포맷팅 유틸리티 함수들
  formatUnit(count, unitKey) {
    const unit = this.getMessage(unitKey) || unitKey;
    return `${count}${unit}`;
  }

  formatItems(count) {
    return this.formatUnit(count, " items");
  }

  formatTimes(count) {
    return this.formatUnit(count, " times");
  }

  formatWindows(count) {
    return this.formatUnit(count, " windows");
  }

  formatTabs(count) {
    return this.formatUnit(count, " tabs");
  }

  formatWindowsAndTabs(windows, tabs) {
    const windowsText = this.formatWindows(windows);
    const tabsText = this.formatTabs(tabs);
    return `${windowsText}, ${tabsText}`;
  }

  // 차트 라벨 포맷팅
  formatChartLabel(label, time, percentage) {
    const format =
      this.getMessage("chartLabelFormat") || "{label}: {time} ({percentage}%)";
    return format
      .replace("{label}", label)
      .replace("{time}", time)
      .replace("{percentage}", percentage);
  }
}

// 전역 i18n 인스턴스 생성
const i18n = new I18n();

// DOM이 로드되면 자동으로 초기화
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => {
    // 비동기 초기화 (약간의 지연을 두어 다른 스크립트들이 먼저 실행되도록)
    setTimeout(() => {
      i18n.initialize();
    }, 100);
  });
} else {
  // DOM이 이미 로드된 경우 즉시 초기화
  setTimeout(() => {
    i18n.initialize();
  }, 100);
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = I18n;
} else if (typeof window !== "undefined") {
  window.I18n = I18n;
  window.i18n = i18n;
  window.getMessage = key => i18n.getMessage(key);
  window.formatDuration = ms => i18n.formatDuration(ms);
  window.formatMinutes = minutes => i18n.formatMinutes(minutes);
  window.formatDateRange = (start, end) => i18n.formatDateRange(start, end);
  window.formatItems = count => i18n.formatItems(count);
  window.formatTimes = count => i18n.formatTimes(count);
  window.formatWindows = count => i18n.formatWindows(count);
  window.formatTabs = count => i18n.formatTabs(count);
  window.formatWindowsAndTabs = (windows, tabs) =>
    i18n.formatWindowsAndTabs(windows, tabs);
  window.formatChartLabel = (label, time, percentage) =>
    i18n.formatChartLabel(label, time, percentage);
}
