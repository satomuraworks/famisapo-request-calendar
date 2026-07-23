import { formatJapaneseDate } from "./date-utils.js";

export const HISTORY_STORAGE_KEY = "famisapo-request-calendar.history.v1";
export const SETTINGS_STORAGE_KEY = "famisapo-request-calendar.settings.v1";
export const SEND_STATUS_STORAGE_KEY = "famisapo-request-calendar.send-status.v1";
export const APP_STORAGE_KEYS = Object.freeze([
  HISTORY_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  SEND_STATUS_STORAGE_KEY,
]);

export const PRICE_BREAKDOWN = Object.freeze([
  { label: "1人目", amount: 700 },
  { label: "2人目", amount: 350 },
  { label: "交通費", amount: 100 },
]);
export const PRICE_PER_VISIT = 1150;

export function calculateEstimate(selectedCount) {
  return selectedCount * PRICE_PER_VISIT;
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
  if (normalized.member && normalized.center) return "両方送信済み";
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
