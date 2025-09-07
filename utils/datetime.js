// 날짜/시간 포맷팅 유틸리티
// date-fns와 date-fns-tz를 사용하여 다국어 및 타임존 지원

import { format, formatInTimeZone } from "date-fns-tz";
import { ko, ja, enUS } from "date-fns/locale";

// date-fns 로케일 매핑
const getDateFnsLocale = lang => {
  switch (lang) {
    case "ko":
      return ko;
    case "ja":
      return ja;
    case "en":
    default:
      return enUS;
  }
};

// 안전한 i18n 메시지 가져오기
function safeGetMessage(key, substitutions = []) {
  try {
    if (typeof i18n !== "undefined" && i18n.getMessage) {
      return i18n.getMessage(key, substitutions);
    }
  } catch (error) {
    console.warn(`Failed to get i18n message for key: ${key}`, error);
  }
  return null;
}

// 지속시간 포맷팅 (분 또는 밀리초 입력)
export function fmtDurationHM(input, isMs = false) {
  const minutes = isMs ? Math.round(input / 1000 / 60) : input;
  if (!minutes || minutes < 0) return i18n.getMessage("noData") || "0분";

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours > 0) {
    return i18n.getMessage("hoursMinutes", { hours, minutes: mins });
  } else {
    return i18n.getMessage("minutesOnly", { minutes: mins });
  }
}

// 지속시간 포맷팅 (초 입력)
export function fmtDurationSec(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) {
    return i18n.getMessage("noData") || "0분";
  }

  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.round(totalSeconds % 60);

  if (h > 0)
    return (
      i18n.getMessage("hoursMinutes", { hours: h, minutes: m }) ||
      `${h}시간 ${m}분`
    );
  if (m > 0) return i18n.getMessage("minutesOnly", { minutes: m }) || `${m}분`;
  return i18n.getMessage("secondsOnly", { seconds: s }) || `${s}초`;
}

// 완전한 날짜 포맷 (오늘 라벨 포함 옵션)
export function fmtDateFull(date, tz, lang, withToday = false) {
  if (!date || isNaN(date.getTime())) return "Invalid Date";

  const locale = getDateFnsLocale(lang);
  const formatKey = withToday ? "dateFullWithToday" : "dateFull";
  const formatStr = safeGetMessage(formatKey) || "yyyy년 MMMM d일";

  try {
    const formattedDate = formatInTimeZone(date, tz, formatStr, { locale });

    if (withToday) {
      const today = new Date();
      const isToday =
        formatInTimeZone(date, tz, "yyyy-MM-dd") ===
        formatInTimeZone(today, tz, "yyyy-MM-dd");

      if (isToday) {
        const todayLabel = safeGetMessage("todayLabel") || "(오늘)";
        return `${formattedDate} ${todayLabel}`;
      }
    }

    return formattedDate;
  } catch (error) {
    console.warn("Date formatting error:", error);
    return date.toLocaleDateString();
  }
}

// 연-월-일 포맷 (input/라벨용)
export function fmtYMD(date, tz, lang) {
  if (!date || isNaN(date.getTime())) return "Invalid Date";

  const locale = getDateFnsLocale(lang);
  const formatStr = safeGetMessage("dateFormat") || "yyyy-MM-dd";

  try {
    return formatInTimeZone(date, tz, formatStr, { locale });
  } catch (error) {
    console.warn("YMD formatting error:", error);
    return formatInTimeZone(date, tz, "yyyy-MM-dd");
  }
}

// 날짜 범위 포맷팅
export function fmtDateRange(startDate, endDate, tz, lang, withToday = false) {
  if (!startDate || !endDate) return "";

  const startStr = fmtDateFull(startDate, tz, lang, withToday);
  const endStr = fmtDateFull(endDate, tz, lang, withToday);
  const separator = safeGetMessage("dateRangeSeparator") || " ~ ";

  // 같은 날인지 확인
  const isSameDay = fmtYMD(startDate, tz, lang) === fmtYMD(endDate, tz, lang);

  if (isSameDay) {
    return startStr;
  } else {
    return `${startStr}${separator}${endStr}`;
  }
}

// ?�간�?리스?�용 ?�짜 ?�맷
export function fmtTimeListDate(date, view, tz, lang) {
  if (!date || isNaN(date.getTime())) return "Invalid Date";

  const locale = getDateFnsLocale(lang);
  let formatKey, formatStr;

  switch (view) {
    case "hourly":
      formatKey = "timeListHourlyFormat";
      formatStr = safeGetMessage(formatKey) || "yyyy??MM??dd??HH:mm";
      break;
    case "weekly":
      formatKey = "timeListWeeklyFormat";
      formatStr = safeGetMessage(formatKey) || "yyyy년 MM월 dd일";
      // 주 시작일로 조정
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      return formatInTimeZone(weekStart, tz, formatStr, { locale });
    default:
      formatKey = "timeListDateFormat";
      formatStr = safeGetMessage(formatKey) || "yyyy년 MM월 dd일";
      break;
  }

  try {
    return formatInTimeZone(date, tz, formatStr, { locale });
  } catch (error) {
    console.warn("Time list date formatting error:", error);
    return date.toLocaleDateString();
  }
}

// 사이트 리스트용 날짜+시간 포맷
export function fmtSiteListDate(date, tz, lang) {
  if (!date || isNaN(date.getTime())) return "Invalid Date";

  const locale = getDateFnsLocale(lang);
  const formatStr =
    safeGetMessage("siteListDateFormat") || "yyyy년 MM월 dd일 HH:mm";

  try {
    return formatInTimeZone(date, tz, formatStr, { locale });
  } catch (error) {
    console.warn("Site list date formatting error:", error);
    return date.toLocaleDateString();
  }
}
