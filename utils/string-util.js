// utils/StringUtil.js
// 문자열 관련 유틸리티 함수들

/**
 * HTML 특수문자를 이스케이프합니다
 * @param {string} text - 이스케이프할 텍스트
 * @returns {string} 이스케이프된 텍스트
 */
export function escapeHtml(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

/**
 * URL을 지정된 길이로 자릅니다
 * @param {string} url - 자를 URL
 * @param {number} maxLength - 최대 길이 (기본값: 50)
 * @returns {string} 잘린 URL
 */
export function truncateUrl(url, maxLength = 50) {
  if (!url || url.length <= maxLength) return url;
  return url.substring(0, maxLength - 3) + "...";
}

/**
 * URL에서 도메인을 추출합니다
 * @param {string} url - URL
 * @returns {string} 도메인 (www. 제거됨)
 */
export function extractDomain(url) {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace("www.", "");
  } catch {
    return "알 수 없음";
  }
}

/**
 * 제목이 없을 때 대체 텍스트를 반환합니다
 * @param {string} title - 원본 제목
 * @param {string} domain - 도메인
 * @param {string} fallback - 최종 대체 텍스트 (기본값: "알 수 없는 사이트")
 * @returns {string} 표시할 제목
 */
export function getDisplayTitle(title, domain, fallback = "알 수 없는 사이트") {
  if (title && title.trim()) {
    return title.trim();
  }
  if (domain && domain.trim()) {
    return domain.trim();
  }
  return fallback;
}

/**
 * 타이머 시간을 HH:MM:SS 형식으로 포맷합니다
 * @param {number} milliseconds - 밀리초 단위 시간
 * @returns {string} HH:MM:SS 형식의 시간
 */
export function formatTimerTime(milliseconds) {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return `${hours.toString().padStart(2, "0")}:${minutes
    .toString()
    .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

/**
 * 제목을 안전하게 잘라서 반환합니다
 * @param {string} title - 원본 제목
 * @param {number} maxLength - 최대 길이 (기본값: 30)
 * @param {string} fallback - 제목이 없을 때 사용할 텍스트 (기본값: "제목 없음")
 * @returns {string} 안전하게 처리된 제목
 */
export function safeTruncateTitle(
  title,
  maxLength = 30,
  fallback = "제목 없음"
) {
  if (!title || typeof title !== "string") {
    return fallback;
  }
  return title.length > maxLength
    ? title.substring(0, maxLength) + "..."
    : title;
}
