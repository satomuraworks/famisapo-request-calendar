import { formatJapaneseDate } from "./date-utils.js";

export const HISTORY_STORAGE_KEY = "famisapo-request-calendar.history.v1";
export const SETTINGS_STORAGE_KEY = "famisapo-request-calendar.settings.v1";
export const SEND_STATUS_STORAGE_KEY = "famisapo-request-calendar.send-status.v1";
export const APP_STORAGE_KEYS = Object.freeze([
  HISTORY_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  SEND_STATUS_STORAGE_KEY,
]);

export const DEFAULT_USAGE_SETTINGS = Object.freeze({
  childrenCount: 1,
  firstChildFee: 700,
  additionalChildFee: 350,
  transportFee: 100,
  regularWeekdays: [],
  regularHolidays: false,
});

function normalizeNonNegativeInteger(value, fallback = 0) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isInteger(number) && number >= 0 ? number : fallback;
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
    regularWeekdays: [...new Set(rawWeekdays)].sort((a, b) => a - b),
    regularHolidays,
  };
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

export function calculateEstimate(selectedCount, settings = DEFAULT_USAGE_SETTINGS) {
  return Math.max(0, Number(selectedCount) || 0) * calculatePricePerVisit(settings);
}

export function formatYen(amount) {
  return new Intl.NumberFormat("ja-JP").format(amount);
}

export function makeLineMessage(year, monthIndex, selectedDates) {
  const dates = [...selectedDates].sort();
  if (!dates.length) return "依頼日を選択してください。";
  return `${year}年${monthIndex + 1}月のファミサポ依頼日についてご連絡します。\n\n${dates.map((date) => formatJapaneseDate(date)).join("\n")}\n\n以上の${dates.length}日間をお願いいたします。\n確認用の画像も添付します。\nご確認よろしくお願いいたします。`;
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
