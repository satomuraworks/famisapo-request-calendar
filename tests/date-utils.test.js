import test from "node:test";
import assert from "node:assert/strict";
import { defaultSelectedDates, daysInMonth, formatJapaneseDate, japaneseHolidayDates, nextMonthValue } from "../date-utils.js";

test("うるう年の2月の日数を返す", () => {
  assert.equal(daysInMonth(2028, 1), 29);
  assert.equal(daysInMonth(2027, 1), 28);
});

test("月曜から木曜だけを初期選択する", () => {
  const selected = defaultSelectedDates(2026, 7); // 2026年8月
  assert.deepEqual(selected.slice(0, 4), ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06"]);
  assert.equal(selected.includes("2026-08-07"), false);
  assert.equal(selected.includes("2026-08-02"), false);
});

test("祝日が月曜から木曜でも初期選択から除外する", () => {
  const selected = defaultSelectedDates(2026, 7); // 2026年8月、山の日は火曜日
  assert.equal(selected.includes("2026-08-11"), false);
});

test("振替休日と国民の休日を祝日に含める", () => {
  assert.equal(japaneseHolidayDates(2021).has("2021-08-09"), true); // 山の日の振替休日
  assert.equal(japaneseHolidayDates(2026).has("2026-09-22"), true); // 国民の休日
});

test("日本語曜日を含む日付に整形する", () => {
  assert.equal(formatJapaneseDate("2026-08-03"), "8月3日（月）");
  assert.equal(formatJapaneseDate("2026-08-09", true), "2026年8月9日（日）");
});

test("翌月の月入力値を返す", () => {
  assert.equal(nextMonthValue(new Date(2026, 11, 20)), "2027-01");
});
