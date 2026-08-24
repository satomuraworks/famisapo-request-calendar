import test from "node:test";
import assert from "node:assert/strict";
import { datesForWeekdaysExcludingHolidays, defaultSelectedDates, daysInMonth, formatJapaneseDate, japaneseHolidayDates, nextMonthValue } from "../date-utils.js";
import {
  APP_STORAGE_KEYS,
  calculateEstimate,
  calculateEstimateForDurations,
  calculatePricePerVisit,
  clearAppStorage,
  DEFAULT_USAGE_SETTINGS,
  durationHoursForDate,
  formatYen,
  latestVersionUrl,
  makeLineMessage,
  makePriceBreakdown,
  normalizeSendStatus,
  normalizeUsageSettings,
  sendStatusLabel,
} from "../app-utils.js";
import { APP_UPDATED_AT, APP_VERSION } from "../version.js";
import { durationHoursBetween, endTimeForDuration, extractScheduleDatesFromOcr } from "../provider-utils.js";
import { normalizeProviderSchedule } from "../provider.js";

test("うるう年の2月の日数を返す", () => {
  assert.equal(daysInMonth(2028, 1), 29);
  assert.equal(daysInMonth(2027, 1), 28);
});

test("月曜から木曜を指定した日付として抽出する", () => {
  const selected = defaultSelectedDates(2026, 7); // 2026年8月
  assert.deepEqual(selected.slice(0, 4), ["2026-08-03", "2026-08-04", "2026-08-05", "2026-08-06"]);
  assert.equal(selected.includes("2026-08-07"), false);
  assert.equal(selected.includes("2026-08-02"), false);
});

test("祝日が月曜から木曜でも指定日から除外する", () => {
  const selected = defaultSelectedDates(2026, 7); // 2026年8月、山の日は火曜日
  assert.equal(selected.includes("2026-08-11"), false);
});

test("祝日を含める指定では平日祝日も抽出する", () => {
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

test("人数・料金・交通費から利用料金を計算し、子どもごとの内訳を返す", () => {
  const settings = { ...DEFAULT_USAGE_SETTINGS, childrenCount: 3, firstChildFee: 700, additionalChildFee: 350, transportFee: 100 };
  assert.equal(calculatePricePerVisit(settings), 1500);
  assert.deepEqual(makePriceBreakdown(settings), [
    { label: "1人目", amount: 700 },
    { label: "2人目", amount: 350 },
    { label: "3人目", amount: 350 },
    { label: "交通費", amount: 100 },
  ]);
  assert.equal(calculateEstimate(15, settings), 22500);
  assert.equal(formatYen(calculateEstimate(15, settings)), "22,500");
  assert.equal(calculateEstimate(15, settings, 0.5), 12000);
  assert.equal(calculateEstimate(15, settings, 1.5), 33000);
  assert.equal(calculateEstimate(15, settings, 0.75), 0);
  assert.equal(calculateEstimateForDurations([0.5, 1.5], settings), 3000);
});

test("不正な料金は0円として扱い、保存済みの旧祝日設定を引き継ぐ", () => {
  assert.deepEqual(
    { firstChildFee: DEFAULT_USAGE_SETTINGS.firstChildFee, additionalChildFee: DEFAULT_USAGE_SETTINGS.additionalChildFee, transportFee: DEFAULT_USAGE_SETTINGS.transportFee },
    { firstChildFee: 0, additionalChildFee: 0, transportFee: 0 },
  );
  const settings = normalizeUsageSettings({ childrenCount: 2, firstChildFee: -1, additionalChildFee: 350.5, transportFee: "abc", includeHolidays: true });
  assert.deepEqual(settings, { childrenCount: 2, firstChildFee: 0, additionalChildFee: 0, transportFee: 0, durationHours: 1, weekdayDurationHours: {}, regularWeekdays: [], regularHolidays: true });
  assert.equal(normalizeUsageSettings({ regularHolidays: false, includeHolidays: true }).regularHolidays, false);
  assert.equal(normalizeUsageSettings({ durationHours: 0.5 }).durationHours, 0.5);
  assert.equal(normalizeUsageSettings({ durationHours: 24 }).durationHours, 24);
  assert.equal(normalizeUsageSettings({ durationHours: 0.75 }).durationHours, 1);
  assert.equal(normalizeUsageSettings({ durationHours: 24.5 }).durationHours, 1);
  assert.equal(calculatePricePerVisit({ ...DEFAULT_USAGE_SETTINGS, firstChildFee: 0, additionalChildFee: 0, transportFee: 0 }), 0);
});

test("曜日別の利用時間は共通設定より優先し、祝日設定は曜日設定より優先する", () => {
  const settings = normalizeUsageSettings({
    durationHours: 2,
    weekdayDurationHours: { 1: 3, 2: 3.5, holiday: 4, invalid: 12, 6: 0.75 },
  });
  assert.deepEqual(settings.weekdayDurationHours, { 1: 3, 2: 3.5, holiday: 4 });
  assert.equal(durationHoursForDate("2026-08-03", settings), 3); // 月
  assert.equal(durationHoursForDate("2026-08-04", settings), 3.5); // 火
  assert.equal(durationHoursForDate("2026-08-11", settings), 4); // 山の日の火
  assert.equal(durationHoursForDate("2026-08-05", settings), 2); // 水は共通設定
  assert.equal(calculateEstimateForDurations([3, 3.5, 4, 2], { ...settings, firstChildFee: 700, transportFee: 100 }), 9150);
});

test("指定曜日の一括選択では祝日を除外する", () => {
  const selected = datesForWeekdaysExcludingHolidays(2026, 7, [1, 2, 3, 4]);
  assert.equal(selected.includes("2026-08-11"), false); // 山の日（火）
  assert.equal(selected.includes("2026-08-03"), true);
  assert.equal(selected.includes("2026-08-07"), false);
});

test("祝日選択では曜日に関係なく祝日を追加し、重複しない", () => {
  const holidayOnly = datesForWeekdaysExcludingHolidays(2026, 7, [], true);
  assert.deepEqual(holidayOnly, ["2026-08-11"]);

  const mondayAndHolidays = datesForWeekdaysExcludingHolidays(2026, 7, [1], true);
  assert.equal(mondayAndHolidays.includes("2026-08-03"), true);
  assert.equal(mondayAndHolidays.includes("2026-08-11"), true);
  assert.equal(mondayAndHolidays.includes("2026-08-04"), false);
  assert.equal(new Set(mondayAndHolidays).size, mondayAndHolidays.length);
});

test("LINE文章に日付、曜日、合計日数を昇順で含め、料金を含めない", () => {
  const message = makeLineMessage(2026, 7, ["2026-08-05", "2026-08-03", "2026-08-04"], { "2026-08-03": 2, "2026-08-04": 3.5, "2026-08-05": 4 });
  assert.match(message, /^2026年8月のファミサポ依頼日についてご連絡します。/);
  assert.ok(message.indexOf("8月3日（月）") < message.indexOf("8月4日（火）"));
  assert.ok(message.indexOf("8月4日（火）") < message.indexOf("8月5日（水）"));
  assert.match(message, /以上の3日間をお願いいたします。/);
  assert.match(message, /8月3日（月）　2時間/);
  assert.match(message, /8月4日（火）　3時間30分/);
  assert.doesNotMatch(message, /円|料金|内訳|概算|子ども/);
  const messageWithoutDuration = makeLineMessage(2026, 7, ["2026-08-03"], { "2026-08-03": 2 }, false);
  assert.match(messageWithoutDuration, /8月3日（月）/);
  assert.doesNotMatch(messageWithoutDuration, /2時間/);
});

test("送信状況を個別に扱い、履歴用の表示文言を返す", () => {
  assert.deepEqual(normalizeSendStatus({ member: true }), { member: true, center: false });
  assert.equal(sendStatusLabel({ member: true, center: true }), "ファミサポ・協力会員へ送信済み");
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
  assert.equal(APP_VERSION, "1.5.0");
  assert.equal(APP_UPDATED_AT, "2026-08-24");
});

test("受ける側の予定終了時刻と既存時刻の利用時間を30分単位で扱う", () => {
  assert.deepEqual(endTimeForDuration("16:00", 1.5), { time: "17:30", nextDay: false });
  assert.deepEqual(endTimeForDuration("23:30", 1), { time: "00:30", nextDay: true });
  assert.equal(durationHoursBetween("16:00", "18:30"), 2.5);
  assert.equal(durationHoursBetween("23:30", "00:30"), 1);
});

test("OCR文字列から予定画像の日付候補を抽出し、確認不能な日付を分ける", () => {
  const result = extractScheduleDatesFromOcr("2026年9月 依頼日一覧\n9月3日（木）\n9月7日（月）\n9月31日", "2026-09");
  assert.deepEqual(result.dates, ["2026-09-03", "2026-09-07"]);
  assert.match(result.warnings.join(" "), /9月31日/);
  assert.deepEqual(extractScheduleDatesFromOcr("読み取り失敗", "2026-09").dates, []);
});

test("予定画像の一覧形式とカレンダー付き形式で共通の日付一覧を候補にする", () => {
  const imageText = "ファミサポ利用予定\n2026年9月 依頼日一覧\n9 月 1 日（火） 1時間\n9月3日（木） 1時間30分";
  assert.deepEqual(extractScheduleDatesFromOcr(imageText, "2026-09").dates, ["2026-09-01", "2026-09-03"]);
});

test("終了時刻だけを保存した既存の受ける側予定に利用時間を補完する", () => {
  const schedule = normalizeProviderSchedule({
    id: "old-record", memberName: "Aさん", date: "2026-09-01", plannedStart: "15:15", plannedEnd: "16:45",
    actualStart: "15:15", actualEnd: "16:45", content: "自由入力の内容", status: "依頼あり",
  });
  assert.equal(schedule.plannedDurationHours, 1.5);
  assert.equal(schedule.plannedEnd, "16:45");
  assert.equal(schedule.content, "自由入力の内容");
});
