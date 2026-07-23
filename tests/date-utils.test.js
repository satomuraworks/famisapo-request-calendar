import test from "node:test";
import assert from "node:assert/strict";
import { defaultSelectedDates, daysInMonth, formatJapaneseDate, japaneseHolidayDates, nextMonthValue } from "../date-utils.js";
import {
  APP_STORAGE_KEYS,
  calculateEstimate,
  clearAppStorage,
  formatYen,
  latestVersionUrl,
  makeLineMessage,
  normalizeSendStatus,
  PRICE_BREAKDOWN,
  PRICE_PER_VISIT,
  sendStatusLabel,
} from "../app-utils.js";
import { APP_UPDATED_AT, APP_VERSION } from "../version.js";

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

test("祝日を初期選択する設定では平日祝日も選択する", () => {
  const selected = defaultSelectedDates(2026, 7, true); // 2026年8月、山の日は火曜日
  assert.equal(selected.includes("2026-08-11"), true);
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

test("利用料金を選択日数から計算して3桁区切りで表示する", () => {
  assert.equal(PRICE_BREAKDOWN.reduce((total, item) => total + item.amount, 0), PRICE_PER_VISIT);
  assert.equal(calculateEstimate(15), 17250);
  assert.equal(formatYen(calculateEstimate(15)), "17,250");
});

test("LINE文章に日付、曜日、合計日数を昇順で含める", () => {
  const message = makeLineMessage(2026, 7, ["2026-08-05", "2026-08-03", "2026-08-04"]);
  assert.match(message, /^2026年8月のファミサポ依頼日についてご連絡します。/);
  assert.ok(message.indexOf("8月3日（月）") < message.indexOf("8月4日（火）"));
  assert.ok(message.indexOf("8月4日（火）") < message.indexOf("8月5日（水）"));
  assert.match(message, /以上の3日間をお願いいたします。/);
});

test("送信状況を個別に扱い、履歴用の表示文言を返す", () => {
  assert.deepEqual(normalizeSendStatus({ member: true }), { member: true, center: false });
  assert.equal(sendStatusLabel({ member: true, center: true }), "両方送信済み");
  assert.equal(sendStatusLabel({ member: true, center: false }), "協力会員のみ送信済み");
  assert.equal(sendStatusLabel({ member: false, center: true }), "ファミサポのみ送信済み");
  assert.equal(sendStatusLabel(), "未送信");
});

test("このアプリの保存データだけをリセットする", () => {
  const values = new Map([...APP_STORAGE_KEYS, "unrelated-key"].map((key) => [key, "saved"]));
  clearAppStorage({ removeItem: (key) => values.delete(key) });
  APP_STORAGE_KEYS.forEach((key) => assert.equal(values.has(key), false));
  assert.equal(values.get("unrelated-key"), "saved");
});

test("最新版URLはvパラメータを付与または置き換える", () => {
  assert.equal(
    latestVersionUrl("https://example.com/famisapo/?mode=test#history", 1721712345),
    "https://example.com/famisapo/?mode=test&v=1721712345#history",
  );
  assert.equal(
    latestVersionUrl("https://example.com/famisapo/?v=old", 1721712345),
    "https://example.com/famisapo/?v=1721712345",
  );
});

test("バージョンと更新日はversion.jsから取得する", () => {
  assert.equal(APP_VERSION, "1.0.0");
  assert.equal(APP_UPDATED_AT, "2026-07-23");
});
