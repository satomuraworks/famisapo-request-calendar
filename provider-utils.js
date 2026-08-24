import { normalizeDurationHours } from "./app-utils.js";

export function timeToMinutes(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function endTimeForDuration(start, durationHours) {
  const startMinutes = timeToMinutes(start);
  const duration = normalizeDurationHours(durationHours, null);
  if (startMinutes === null || duration === null) return { time: "", nextDay: false };
  const totalMinutes = startMinutes + duration * 60;
  const minutes = totalMinutes % (24 * 60);
  return {
    time: `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    nextDay: totalMinutes >= 24 * 60,
  };
}

export function durationHoursBetween(start, end, fallback = 1) {
  const startMinutes = timeToMinutes(start);
  const endMinutes = timeToMinutes(end);
  if (startMinutes === null || endMinutes === null) return normalizeDurationHours(fallback);
  const difference = endMinutes - startMinutes;
  const hours = difference > 0 ? difference / 60 : difference === 0 ? 24 : (difference + 24 * 60) / 60;
  return normalizeDurationHours(hours, fallback);
}

function normalizeOcrText(value) {
  return String(value ?? "")
    .replace(/[０-９]/g, (character) => String.fromCharCode(character.charCodeAt(0) - 0xfee0))
    .replace(/[年月日]/g, (character) => character)
    .replace(/[\s　]+/g, " ");
}

function validIsoDate(year, month, day) {
  const date = new Date(year, month - 1, day);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/** OCR文字列から予定日候補を抽出する。OCR結果は確認前提であり、保存は行わない。 */
export function extractScheduleDatesFromOcr(text, fallbackMonth) {
  const normalized = normalizeOcrText(text);
  const [fallbackYear, fallbackMonthNumber] = String(fallbackMonth ?? "").split("-").map(Number);
  const header = normalized.match(/(20\d{2})年\s*(1[0-2]|[1-9])\s*月/);
  const headerYear = header ? Number(header[1]) : fallbackYear;
  const headerMonth = header ? Number(header[2]) : fallbackMonthNumber;
  const candidates = new Set();
  const invalidCandidates = [];
  const datePattern = /(?:(20\d{2})\s*年\s*)?(1[0-2]|[1-9])\s*月\s*([0-3]?\d)\s*日/g;
  for (const match of normalized.matchAll(datePattern)) {
    const year = Number(match[1] ?? headerYear);
    const month = Number(match[2] ?? headerMonth);
    const day = Number(match[3]);
    if (Number.isInteger(year) && validIsoDate(year, month, day)) {
      candidates.add(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    } else invalidCandidates.push(match[0]);
  }
  const warnings = [];
  if (!candidates.size) warnings.push("日付候補を読み取れませんでした。日付を手入力してください。");
  if (invalidCandidates.length) warnings.push(`確認できない日付候補: ${invalidCandidates.join("、")}`);
  return { dates: [...candidates].sort(), warnings };
}
