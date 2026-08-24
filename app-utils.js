import { formatJapaneseDate, fromIsoDate, japaneseHolidayDates } from "./date-utils.js";

export const HISTORY_STORAGE_KEY = "famisapo-request-calendar.history.v1";
export const SETTINGS_STORAGE_KEY = "famisapo-request-calendar.settings.v1";
export const SEND_STATUS_STORAGE_KEY = "famisapo-request-calendar.send-status.v1";
export const WEEKDAY_DURATION_KEYS = Object.freeze(["0", "1", "2", "3", "4", "5", "6", "holiday"]);
export const APP_STORAGE_KEYS = Object.freeze([
  HISTORY_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  SEND_STATUS_STORAGE_KEY,
]);

export const DEFAULT_USAGE_SETTINGS = Object.freeze({
  childrenCount: 1,
  firstChildFee: 0,
  additionalChildFee: 0,
  transportFee: 0,
  durationHours: 1,
  weekdayDurationHours: {},
  regularWeekdays: [],
  regularHolidays: false,
});

function normalizeNonNegativeInteger(value, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
}

export function normalizeDurationHours(value, fallback = DEFAULT_USAGE_SETTINGS.durationHours) {
  const duration = typeof value === "number" ? value : Number(value);
  return Number.isFinite(duration) && duration >= 0.5 && duration <= 24 && Number.isInteger(duration * 2) ? duration : fallback;
}

export function normalizeWeekdayDurationHours(weekdayDurationHours) {
  const rawDurations = weekdayDurationHours && typeof weekdayDurationHours === "object" && !Array.isArray(weekdayDurationHours)
    ? weekdayDurationHours
    : {};
  return Object.fromEntries(WEEKDAY_DURATION_KEYS.flatMap((key) => {
    const durationHours = normalizeDurationHours(rawDurations[key], null);
    return durationHours === null ? [] : [[key, durationHours]];
  }));
}

export function normalizeUsageSettings(settings) {
  const rawCount = normalizeNonNegativeInteger(settings?.childrenCount, DEFAULT_USAGE_SETTINGS.childrenCount);
  const rawWeekdays = Array.isArray(settings?.regularWeekdays)
    ? settings.regularWeekdays.map(Number).filter((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)
    : DEFAULT_USAGE_SETTINGS.regularWeekdays;
  const regularHolidays = typeof settings?.regularHolidays === "boolean"
    ? settings.regularHolidays
    : Boolean(settings?.includeHolidays);
  return {
    childrenCount: Math.min(10, Math.max(1, rawCount)),
    firstChildFee: normalizeNonNegativeInteger(settings?.firstChildFee, DEFAULT_USAGE_SETTINGS.firstChildFee),
    additionalChildFee: normalizeNonNegativeInteger(settings?.additionalChildFee, DEFAULT_USAGE_SETTINGS.additionalChildFee),
    transportFee: normalizeNonNegativeInteger(settings?.transportFee, DEFAULT_USAGE_SETTINGS.transportFee),
    durationHours: normalizeDurationHours(settings?.durationHours),
    weekdayDurationHours: normalizeWeekdayDurationHours(settings?.weekdayDurationHours),
    regularWeekdays: [...new Set(rawWeekdays)].sort((a, b) => a - b),
    regularHolidays,
  };
}

export function durationHoursForDate(isoDate, settings = DEFAULT_USAGE_SETTINGS) {
  const normalized = normalizeUsageSettings(settings);
  const date = fromIsoDate(isoDate);
  const weekdayKey = String(date.getDay());
  const holidayKey = japaneseHolidayDates(date.getFullYear()).has(isoDate) ? "holiday" : weekdayKey;
  return normalized.weekdayDurationHours[holidayKey]
    ?? normalized.weekdayDurationHours[weekdayKey]
    ?? normalized.durationHours;
}

export function calculatePricePerVisit(settings = DEFAULT_USAGE_SETTINGS) {
  const normalized = normalizeUsageSettings(settings);
  return normalized.firstChildFee
    + normalized.additionalChildFee * Math.max(0, normalized.childrenCount - 1)
    + normalized.transportFee;
}

export function makePriceBreakdown(settings = DEFAULT_USAGE_SETTINGS) {
  const normalized = normalizeUsageSettings(settings);
  const breakdown = [];
  for (let childNumber = 1; childNumber <= normalized.childrenCount; childNumber += 1) {
    breakdown.push({
      label: `${childNumber}人目`,
      amount: childNumber === 1 ? normalized.firstChildFee : normalized.additionalChildFee,
    });
  }
  breakdown.push({ label: "交通費", amount: normalized.transportFee });
  return breakdown;
}

export function calculateEstimate(selectedCount, settings = DEFAULT_USAGE_SETTINGS, durationHours = settings?.durationHours ?? 1) {
  const normalized = normalizeUsageSettings(settings);
  const normalizedDuration = Number(durationHours);
  const durationMultiplier = Number.isFinite(normalizedDuration)
    && normalizedDuration >= 0.5
    && normalizedDuration <= 24
    && Number.isInteger(normalizedDuration * 2)
    ? normalizedDuration
    : 0;
  if (!durationMultiplier) return 0;
  const hourlyUsageFee = normalized.firstChildFee
    + normalized.additionalChildFee * Math.max(0, normalized.childrenCount - 1);
  return Math.max(0, Number(selectedCount) || 0) * (hourlyUsageFee * durationMultiplier + normalized.transportFee);
}

export function calculateEstimateForDurations(durationHoursList, settings = DEFAULT_USAGE_SETTINGS) {
  if (!Array.isArray(durationHoursList)) return 0;
  return durationHoursList.reduce((total, durationHours) => total + calculateEstimate(1, settings, durationHours), 0);
}

export function formatYen(amount) {
  return new Intl.NumberFormat("ja-JP").format(amount);
}

export function formatDuration(hours) {
  const totalMinutes = Math.round(hours * 60);
  const wholeHours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (!wholeHours) return `${minutes}分`;
  return minutes ? `${wholeHours}時間${minutes}分` : `${wholeHours}時間`;
}

export function makeLineMessage(year, monthIndex, selectedDates, durationHoursByDate = {}) {
  const dates = [...selectedDates].sort();
  if (!dates.length) return "依頼日を選択してください。";
  return `${year}年${monthIndex + 1}月のファミサポ依頼日についてご連絡します。\n\n${dates.map((date) => {
    const durationHours = normalizeDurationHours(durationHoursByDate[date], null);
    return durationHours === null ? formatJapaneseDate(date) : `${formatJapaneseDate(date)}　${formatDuration(durationHours)}`;
  }).join("\n")}\n\n以上の${dates.length}日間をお願いいたします。\n確認用の画像も添付します。\nご確認よろしくお願いいたします。`;
}

export function normalizeSendStatus(status) {
  return {
    member: Boolean(status?.member),
    center: Boolean(status?.center),
  };
}

export function sendStatusLabel(status) {
  const normalized = normalizeSendStatus(status);
  if (normalized.member && normalized.center) return "ファミサポ・協力会員へ送信済み";
  if (normalized.member) return "協力会員のみ送信済み";
  if (normalized.center) return "ファミサポのみ送信済み";
  return "未送信";
}

export function clearAppStorage(storage) {
  APP_STORAGE_KEYS.forEach((key) => storage.removeItem(key));
}

export function latestVersionUrl(currentUrl, timestamp) {
  const url = new URL(currentUrl);
  url.searchParams.set("v", String(timestamp));
  return url.toString();
}
