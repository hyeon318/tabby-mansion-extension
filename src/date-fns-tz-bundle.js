// date-fns-tz UMD bundle entry point
import {
  format,
  formatInTimeZone,
  toZonedTime,
  fromZonedTime,
  getTimezoneOffset,
  toDate,
} from "date-fns-tz";

// Export all needed functions with aliases for compatibility
export default {
  format,
  formatInTimeZone,
  zonedTimeToUtc: toZonedTime, // alias for compatibility
  utcToZonedTime: fromZonedTime, // alias for compatibility
  toZonedTime,
  fromZonedTime,
  getTimezoneOffset,
  toDate,
};
