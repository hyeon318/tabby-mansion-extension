// 애플리케이션 상태 관리 (언어, 타임존)
class AppState {
  constructor() {
    this.lang = "ko";
    this.tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.initialized = false;
  }

  async initialize() {
    if (this.initialized) return;

    try {
      // 저장된 언어 설정 확인
      let storedLang = null;
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const result = await chrome.storage.local.get(["language"]);
        storedLang = result.language;
      }

      // 언어 결정 우선순위: 저장된 설정 > Chrome UI 언어 > 브라우저 언어
      if (storedLang) {
        this.lang = storedLang;
      } else if (typeof chrome !== "undefined" && chrome.i18n?.getUILanguage) {
        const uiLang = chrome.i18n.getUILanguage();
        this.lang = this.resolveSupportedLocale(uiLang);
      } else {
        this.lang = this.resolveSupportedLocale(navigator.language);
      }

      // 타임존은 시스템 기본값 사용
      this.tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

      this.initialized = true;
    } catch (error) {
      console.warn("AppState initialization failed:", error);
      this.lang = "ko"; // 기본값
      this.tz = "Asia/Seoul"; // 기본값
      this.initialized = true;
    }
  }

  resolveSupportedLocale(uiLanguage) {
    const lang = (uiLanguage || "en").toLowerCase();
    if (lang.startsWith("ko")) return "ko";
    if (lang.startsWith("ja")) return "ja";
    return "en";
  }

  async setLanguage(newLang) {
    this.lang = newLang;

    // 저장
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      try {
        await chrome.storage.local.set({ language: newLang });
      } catch (error) {
        console.warn("Failed to save language setting:", error);
      }
    }
  }

  getLanguage() {
    return this.lang;
  }

  getTimezone() {
    return this.tz;
  }
}

// 단일 인스턴스 export
export const appState = new AppState();

// i18n과 상태를 함께 적용하는 유틸리티 함수
export async function applyI18n(lang, tz) {
  if (lang) {
    await appState.setLanguage(lang);
    if (typeof i18n !== "undefined") {
      await i18n.setLanguage(lang);
    }
  }

  if (tz) {
    appState.tz = tz;
  }

  // 페이지 텍스트 업데이트
  if (typeof i18n !== "undefined") {
    i18n.updatePageText();
  }
}
