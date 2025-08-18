// Debug 유틸리티 - 개발 환경에서만 로그 출력
const isDevelopment =
  process.env.NODE_ENV === "development" ||
  (typeof chrome !== "undefined" &&
    chrome.runtime &&
    chrome.runtime.getManifest &&
    chrome.runtime.getManifest().version.includes("dev")) ||
  (typeof window !== "undefined" &&
    window.location &&
    window.location.hostname === "localhost");

// 개발 환경에서만 로그 출력하는 함수들
export const debug = {
  log: (...args) => {
    if (isDevelopment) {
      console.log(...args);
    }
  },

  warn: (...args) => {
    if (isDevelopment) {
      console.warn(...args);
    }
  },

  error: (...args) => {
    // 에러는 항상 출력 (프로덕션에서도)
    console.error(...args);
  },

  info: (...args) => {
    if (isDevelopment) {
      console.info(...args);
    }
  },

  // 타이머 관련 디버그
  timer: (...args) => {
    if (isDevelopment) {
      console.log("⏰", ...args);
    }
  },

  // 탭 트래커 관련 디버그
  tracker: (...args) => {
    if (isDevelopment) {
      console.log("📊", ...args);
    }
  },

  // 스토리지 관련 디버그
  storage: (...args) => {
    if (isDevelopment) {
      console.log("💾", ...args);
    }
  },

  // 차트 관련 디버그
  chart: (...args) => {
    if (isDevelopment) {
      console.log("📈", ...args);
    }
  },

  // 서비스 워커 관련 디버그
  serviceWorker: (...args) => {
    if (isDevelopment) {
      console.log("🔧", ...args);
    }
  },
};

// 전역으로 사용할 수 있도록 window 객체에 추가 (브라우저 환경에서만)
if (typeof window !== "undefined") {
  window.debug = debug;
}

export default debug;
