import {
  calculateEstimate,
  formatDuration,
  formatYen,
  normalizeDurationHours,
  normalizeUsageSettings,
  SETTINGS_STORAGE_KEY,
} from "./app-utils.js";
import { JAPANESE_WEEKDAYS, formatJapaneseDate, getMonthDates, japaneseHolidayDates } from "./date-utils.js";
import { durationHoursBetween, endTimeForDuration, extractScheduleDatesFromOcr, timeToMinutes } from "./provider-utils.js";

export const PROVIDER_SETTINGS_STORAGE_KEY = "famisapo-request-calendar.provider-settings.v1";
export const PROVIDER_SCHEDULES_STORAGE_KEY = "famisapo-request-calendar.provider-schedules.v1";
export const PROVIDER_SETTLEMENTS_STORAGE_KEY = "famisapo-request-calendar.provider-settlements.v1";

const STATUS_OPTIONS = ["依頼あり", "調整中", "合意済み", "ファミサポ提出済み", "実施済み", "精算済み", "キャンセル"];
const CHECKLIST_ITEMS = [
  ["centerConfirmed", "ファミサポ料金確認済み"],
  ["memberNotified", "利用会員へ料金通知済み"],
  ["collected", "集金済み"],
  ["receiptConfirmed", "領収書発行・受取確認済み"],
  ["reported", "ファミサポへ報告済み"],
];
const AVAILABILITY_KEYS = ["1", "2", "3", "4", "5", "6", "0", "holiday"];
const AVAILABILITY_LABELS = { 0: "日", 1: "月", 2: "火", 3: "水", 4: "木", 5: "金", 6: "土", holiday: "祝日" };
const CONTENT_OPTIONS = [
  "",
  "保育園・幼稚園・学校等への送迎",
  "保護者不在時の預かり",
  "保護者在宅時の見守り",
  "習い事等への送迎",
  "通院・用事の間の預かり",
  "その他",
];

function readJson(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isTime(value) {
  return typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function normalizeStatus(value) {
  return STATUS_OPTIONS.includes(value) ? value : "依頼あり";
}

export function normalizeProviderSchedule(value) {
  if (!value || typeof value !== "object" || !isIsoDate(value.date) || !isTime(value.plannedStart) || !isTime(value.plannedEnd)) return null;
  const plannedDurationHours = normalizeDurationHours(value.plannedDurationHours, durationHours(value.plannedStart, value.plannedEnd));
  const calculatedEnd = endTimeForDuration(value.plannedStart, plannedDurationHours).time;
  return {
    id: typeof value.id === "string" ? value.id : crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
    memberName: typeof value.memberName === "string" ? value.memberName.slice(0, 40) : "",
    date: value.date,
    plannedStart: value.plannedStart,
    plannedEnd: calculatedEnd || value.plannedEnd,
    plannedDurationHours,
    actualStart: isTime(value.actualStart) ? value.actualStart : value.plannedStart,
    actualEnd: isTime(value.actualEnd) ? value.actualEnd : value.plannedEnd,
    content: typeof value.content === "string" ? value.content.slice(0, 100) : "",
    note: typeof value.note === "string" ? value.note.slice(0, 300) : "",
    status: normalizeStatus(value.status),
    createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
  };
}

function defaultAvailability() {
  return Object.fromEntries(AVAILABILITY_KEYS.map((key) => [key, { enabled: false, start: "", end: "" }]));
}

function normalizeSettings(value) {
  const availability = defaultAvailability();
  if (!value || typeof value !== "object") return { availability };
  AVAILABILITY_KEYS.forEach((key) => {
    const setting = value.availability?.[key];
    availability[key] = {
      enabled: Boolean(setting?.enabled),
      start: isTime(setting?.start) ? setting.start : "",
      end: isTime(setting?.end) ? setting.end : "",
    };
  });
  return { availability };
}

function normalizeSettlement(value) {
  const confirmedAmount = Number(value?.confirmedAmount);
  return {
    confirmedAmount: Number.isInteger(confirmedAmount) && confirmedAmount >= 0 ? confirmedAmount : null,
    checklist: Object.fromEntries(CHECKLIST_ITEMS.map(([key]) => [key, Boolean(value?.checklist?.[key])])),
  };
}

function dateMonth(date) {
  return date.slice(0, 7);
}

function monthLabel(month) {
  const [year, number] = month.split("-").map(Number);
  return `${year}年${number}月`;
}

function timeMinutes(value) {
  return timeToMinutes(value) ?? 0;
}

function durationHours(start, end) {
  return isTime(start) && isTime(end) ? durationHoursBetween(start, end, 0) : 0;
}

function shortDate(date) {
  const [, month, day] = date.split("-").map(Number);
  const weekday = new Date(`${date}T00:00:00`).getDay();
  return `${month}/${day}（${JAPANESE_WEEKDAYS[weekday]}）`;
}

async function copyText(value, statusElement) {
  if (!value) {
    statusElement.textContent = "コピーする内容がありません。";
    return;
  }
  try {
    await navigator.clipboard.writeText(value);
    statusElement.textContent = "コピーしました。";
  } catch {
    statusElement.textContent = "コピーできませんでした。文章を選択してコピーしてください。";
  }
}

export function initializeProviderMode() {
  const elements = {
    month: document.querySelector("#provider-target-month"),
    dashboardMonth: document.querySelector("#provider-dashboard-month"), dashboard: document.querySelector("#provider-dashboard"),
    form: document.querySelector("#provider-schedule-form"), memberName: document.querySelector("#provider-member-name"),
    plannedStart: document.querySelector("#provider-planned-start"), plannedDuration: document.querySelector("#provider-planned-duration"), plannedEnd: document.querySelector("#provider-planned-end"), content: document.querySelector("#provider-content"), contentOther: document.querySelector("#provider-content-other"), contentOtherWrap: document.querySelector("#provider-content-other-wrap"), note: document.querySelector("#provider-note"), status: document.querySelector("#provider-status"), availabilityWarning: document.querySelector("#provider-availability-warning"), formStatus: document.querySelector("#provider-form-status"), registerSelected: document.querySelector("#provider-register-selected"),
    ocrImage: document.querySelector("#provider-ocr-image"), ocrRead: document.querySelector("#provider-ocr-read"), ocrStatus: document.querySelector("#provider-ocr-status"),
    calendar: document.querySelector("#provider-calendar"), calendarLabel: document.querySelector("#provider-calendar-label"), clearSelection: document.querySelector("#provider-clear-selection"), showSelected: document.querySelector("#provider-show-selected"), selectionSummary: document.querySelector("#provider-selection-summary"), draftWrap: document.querySelector("#provider-draft-wrap"), draftList: document.querySelector("#provider-draft-list"), selectedDateLabel: document.querySelector("#provider-selected-date-label"), dayList: document.querySelector("#provider-day-list"),
    agreementText: document.querySelector("#provider-agreement-text"), agreementCopy: document.querySelector("#provider-copy-agreement"), agreementStatus: document.querySelector("#provider-agreement-status"),
    submissionText: document.querySelector("#provider-submission-text"), submissionCopy: document.querySelector("#provider-copy-submission"), markSubmitted: document.querySelector("#provider-mark-submitted"), submissionStatus: document.querySelector("#provider-submission-status"),
    settlementList: document.querySelector("#provider-settlement-list"), estimateTotal: document.querySelector("#provider-estimate-total"), confirmedAmount: document.querySelector("#provider-confirmed-amount"), difference: document.querySelector("#provider-difference"), saveSettlement: document.querySelector("#provider-save-settlement"), notificationText: document.querySelector("#provider-notification-text"), notificationCopy: document.querySelector("#provider-copy-notification"), settlementStatus: document.querySelector("#provider-settlement-status"), checklist: document.querySelector("#provider-checklist"),
    availabilitySettings: document.querySelector("#provider-availability-settings"), saveSettings: document.querySelector("#provider-save-settings"), settingsStatus: document.querySelector("#provider-settings-status"),
    resetSettings: document.querySelector("#provider-reset-settings"), deleteMonth: document.querySelector("#provider-delete-month"), deleteAll: document.querySelector("#provider-delete-all"), maintenanceStatus: document.querySelector("#provider-maintenance-status"),
  };
  let schedules = readJson(PROVIDER_SCHEDULES_STORAGE_KEY, []).map(normalizeProviderSchedule).filter(Boolean);
  let settings = normalizeSettings(readJson(PROVIDER_SETTINGS_STORAGE_KEY, {}));
  let settlements = readJson(PROVIDER_SETTLEMENTS_STORAGE_KEY, {});
  let selectedDate = "";
  let selectedDraftDates = new Set();
  let draftOverrides = new Map();

  const currentMonth = () => elements.month.value;
  const monthSchedules = () => schedules.filter((schedule) => dateMonth(schedule.date) === currentMonth()).sort((a, b) => a.date.localeCompare(b.date) || a.plannedStart.localeCompare(b.plannedStart));
  const currentSettlement = () => normalizeSettlement(settlements[currentMonth()]);
  const persistSchedules = () => writeJson(PROVIDER_SCHEDULES_STORAGE_KEY, schedules);
  const persistSettings = () => writeJson(PROVIDER_SETTINGS_STORAGE_KEY, settings);
  const persistSettlements = () => writeJson(PROVIDER_SETTLEMENTS_STORAGE_KEY, settlements);
  const requesterSettings = () => normalizeUsageSettings(readJson(SETTINGS_STORAGE_KEY, {}));

  function saveSettlement(settlement) {
    settlements[currentMonth()] = normalizeSettlement(settlement);
    return persistSettlements();
  }

  function renderStatusOptions(select, selected) {
    select.replaceChildren(...STATUS_OPTIONS.map((status) => {
      const option = document.createElement("option");
      option.value = status;
      option.textContent = status;
      option.selected = status === selected;
      return option;
    }));
  }

  function renderPlannedDurationOptions(selectedDuration = 1) {
    elements.plannedDuration.replaceChildren(...Array.from({ length: 48 }, (_, index) => {
      const duration = (index + 1) / 2;
      const option = document.createElement("option");
      option.value = String(duration);
      option.textContent = formatDuration(duration);
      option.selected = duration === selectedDuration;
      return option;
    }));
  }

  function renderPlannedStartOptions(select, selectedTime = "") {
    const options = ["", ...Array.from({ length: 96 }, (_, index) => `${String(Math.floor(index / 4)).padStart(2, "0")}:${String((index % 4) * 15).padStart(2, "0")}`)];
    select.replaceChildren(...options.map((time) => {
      const option = document.createElement("option");
      option.value = time;
      option.textContent = time || "選択してください";
      option.selected = time === selectedTime;
      return option;
    }));
  }

  function renderContentOptions(select, selectedContent = "") {
    const choice = CONTENT_OPTIONS.includes(selectedContent) ? selectedContent : "その他";
    select.replaceChildren(...CONTENT_OPTIONS.map((content) => {
      const option = document.createElement("option");
      option.value = content;
      option.textContent = content || "選択してください";
      option.selected = content === choice;
      return option;
    }));
    return choice;
  }

  function contentFromFields(contentSelect, otherInput) {
    return contentSelect.value === "その他" ? otherInput.value.trim() : contentSelect.value;
  }

  function renderContentOther() {
    const isOther = elements.content.value === "その他";
    elements.contentOtherWrap.hidden = !isOther;
    elements.contentOther.required = isOther;
  }

  function currentPlannedDuration() {
    return normalizeDurationHours(Number(elements.plannedDuration.value), 1);
  }

  function plannedEndInfo() {
    return endTimeForDuration(elements.plannedStart.value, currentPlannedDuration());
  }

  function renderPlannedEnd() {
    const { time, nextDay } = plannedEndInfo();
    elements.plannedEnd.textContent = time
      ? `終了予定時刻：${nextDay ? "翌日 " : ""}${time}`
      : "予定開始時刻と利用時間を選ぶと、終了予定時刻を表示します。";
  }

  function commonDraftForDate(date) {
    return {
      date,
      memberName: elements.memberName.value.trim(),
      plannedStart: elements.plannedStart.value,
      plannedDurationHours: currentPlannedDuration(),
      content: contentFromFields(elements.content, elements.contentOther),
      note: elements.note.value.trim(),
      status: elements.status.value,
    };
  }

  function draftForDate(date) {
    return { ...commonDraftForDate(date), ...(draftOverrides.get(date) ?? {}) };
  }

  function makeScheduleFromDraft(draft) {
    const duration = normalizeDurationHours(draft.plannedDurationHours, 1);
    const { time: plannedEnd } = endTimeForDuration(draft.plannedStart, duration);
    if (!isIsoDate(draft.date) || !isTime(draft.plannedStart) || !plannedEnd || !draft.memberName.trim()) return null;
    return normalizeProviderSchedule({
      id: crypto.randomUUID?.() ?? `${Date.now()}-${Math.random()}`,
      memberName: draft.memberName.trim(), date: draft.date, plannedStart: draft.plannedStart, plannedEnd, plannedDurationHours: duration,
      actualStart: draft.plannedStart, actualEnd: plannedEnd, content: draft.content.trim(), note: draft.note.trim(), status: draft.status, createdAt: new Date().toISOString(),
    });
  }

  function canRegisterFromForm() {
    return Boolean(elements.memberName.value.trim() && isTime(elements.plannedStart.value) && plannedEndInfo().time);
  }

  function clearScheduleForm() {
    elements.form.reset();
    renderStatusOptions(elements.status, "依頼あり");
    renderPlannedStartOptions(elements.plannedStart);
    renderPlannedDurationOptions(1);
    renderContentOptions(elements.content);
    elements.contentOther.value = "";
    renderContentOther();
    renderPlannedEnd();
  }

  async function recognizeImageTextWithNativeDetector(file) {
    if (!("TextDetector" in window) || !("createImageBitmap" in window)) return "";
    const bitmap = await createImageBitmap(file);
    try {
      const detector = new window.TextDetector();
      const blocks = await detector.detect(bitmap);
      return blocks.map((block) => block.rawValue).join("\n");
    } finally {
      bitmap.close();
    }
  }

  async function recognizeImageTextWithOcr(file) {
    const tesseract = await import("https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.esm.min.js");
    const createWorker = tesseract.createWorker ?? tesseract.default?.createWorker;
    if (typeof createWorker !== "function") throw new Error("OCRライブラリを初期化できませんでした。");
    const worker = await createWorker("jpn");
    try {
      const bitmap = await createImageBitmap(file);
      const scale = Math.max(1, Math.min(2, 1440 / bitmap.width));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.filter = "grayscale(1) contrast(1.8)";
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const { data } = await worker.recognize(canvas);
      return data.text;
    } finally {
      await worker.terminate();
    }
  }

  async function readOcrImage() {
    const file = elements.ocrImage.files?.[0];
    if (!file) { elements.ocrStatus.textContent = "予定画像を選択してください。"; return; }
    elements.ocrRead.disabled = true;
    elements.ocrStatus.textContent = "画像から日付候補を読み取っています。画像は確認前には保存されません。";
    try {
      const nativeText = await recognizeImageTextWithNativeDetector(file).catch(() => "");
      let result = extractScheduleDatesFromOcr(nativeText, currentMonth());
      if (!result.dates.length) {
        elements.ocrStatus.textContent = "画像内の「○月○日」を再確認しています。";
        const ocrText = await recognizeImageTextWithOcr(file);
        result = extractScheduleDatesFromOcr(`${nativeText}\n${ocrText}`, currentMonth());
      }
      selectedDraftDates = new Set(result.dates);
      draftOverrides = new Map();
      if (result.dates.length) {
        const [year, month] = result.dates[0].split("-");
        elements.month.value = `${year}-${month}`;
        selectedDate = result.dates[0];
        elements.ocrStatus.textContent = `${result.dates.length}件の日付候補をカレンダーに反映しました。内容を確認してから登録してください。`;
      } else {
        elements.ocrStatus.textContent = "画像内の「○月○日」の文字を確認できませんでした。画像の一覧形式またはカレンダー付き形式の下部にある日付一覧が見える画像を選ぶか、カレンダーから日付を選んでください。";
      }
      renderAll();
    } catch {
      elements.ocrStatus.textContent = "画像の文字を読み取れませんでした。対応しているPNG、JPEG、WebP画像か確認し、カレンダーから日付を選んで登録してください。";
    } finally {
      elements.ocrRead.disabled = false;
    }
  }


  function renderDashboard() {
    const rows = monthSchedules();
    const settlement = currentSettlement();
    const counts = [
      ["依頼あり", rows.filter((row) => row.status === "依頼あり").length],
      ["調整中", rows.filter((row) => row.status === "調整中").length],
      ["合意済み", rows.filter((row) => row.status === "合意済み").length],
      ["ファミサポ未提出", rows.filter((row) => row.status === "合意済み").length],
      ["実施済み・未精算", rows.filter((row) => row.status === "実施済み").length],
      ["未集金", settlement.checklist.collected ? 0 : rows.filter((row) => row.status === "精算済み").length],
    ];
    elements.dashboardMonth.textContent = monthLabel(currentMonth());
    elements.dashboard.replaceChildren(...counts.map(([label, count]) => {
      const card = document.createElement("div");
      card.className = "provider-dashboard-card";
      card.innerHTML = `<span>${label}</span><strong>${count}件</strong>`;
      return card;
    }));
  }

  function renderCalendar() {
    const [year, monthNumber] = currentMonth().split("-").map(Number);
    const monthIndex = monthNumber - 1;
    const dates = getMonthDates(year, monthIndex);
    const counts = new Map();
    monthSchedules().forEach((schedule) => counts.set(schedule.date, (counts.get(schedule.date) ?? 0) + 1));
    elements.calendar.replaceChildren();
    elements.calendarLabel.textContent = monthLabel(currentMonth());
    for (let blank = 0; blank < dates[0].weekday; blank += 1) {
      const spacer = document.createElement("span");
      spacer.className = "calendar-spacer";
      elements.calendar.append(spacer);
    }
    dates.forEach(({ day, weekday, isoDate }) => {
      const count = counts.get(isoDate) ?? 0;
      const daySchedules = monthSchedules().filter((schedule) => schedule.date === isoDate);
      const calendarStatus = count === 1
        ? daySchedules[0].status.replace("ファミサポ提出済み", "提出済").replace("実施済み", "実施済").replace("精算済み", "精算済")
        : count ? `${count}件` : "";
      const button = document.createElement("button");
      button.type = "button";
      button.className = "day-button provider-day-button";
      button.dataset.date = isoDate;
      button.dataset.weekday = weekday;
      const isDraft = selectedDraftDates.has(isoDate);
      button.setAttribute("aria-label", `${formatJapaneseDate(isoDate, true)}${isDraft ? "、登録候補として選択中" : ""}${count ? `、予定${count}件、${daySchedules.map((schedule) => schedule.status).join("、")}` : ""}`);
      button.setAttribute("aria-pressed", String(isDraft));
      button.innerHTML = `<span>${day}</span>${calendarStatus ? `<small>${calendarStatus}</small>` : ""}`;
      if (count) button.classList.add("has-schedules");
      if (isDraft) button.classList.add("is-selected", "is-draft");
      if (selectedDate === isoDate) button.classList.add("is-inspected");
      elements.calendar.append(button);
    });
  }

  function renderDraftDurationOptions(select, selectedDuration) {
    select.replaceChildren(...Array.from({ length: 48 }, (_, index) => {
      const duration = (index + 1) / 2;
      const option = document.createElement("option");
      option.value = String(duration);
      option.textContent = formatDuration(duration);
      option.selected = duration === selectedDuration;
      return option;
    }));
  }

  function renderDraftList() {
    const dates = [...selectedDraftDates].sort();
    elements.selectionSummary.textContent = dates.length ? `${dates.length}日を予定候補として選択中です。` : "日付を選択してください。";
    elements.registerSelected.disabled = !dates.length;
    elements.clearSelection.disabled = !dates.length;
    elements.showSelected.disabled = !dates.length;
    elements.draftWrap.hidden = !dates.length;
    elements.draftList.replaceChildren();
    dates.forEach((date) => {
      const draft = draftForDate(date);
      const article = document.createElement("article");
      article.className = "provider-draft-item";
      const heading = document.createElement("div"); heading.className = "provider-draft-heading";
      const title = document.createElement("strong"); title.textContent = formatJapaneseDate(date, true);
      const remove = document.createElement("button"); remove.type = "button"; remove.className = "button danger"; remove.textContent = "候補から外す";
      remove.addEventListener("click", () => { selectedDraftDates.delete(date); draftOverrides.delete(date); renderAll(); });
      heading.append(title, remove);

      const fields = document.createElement("div"); fields.className = "provider-draft-fields";
      const memberLabel = document.createElement("label"); memberLabel.textContent = "利用会員";
      const member = document.createElement("input"); member.maxLength = 40; member.value = draft.memberName; memberLabel.append(member);
      const dateLabel = document.createElement("label"); dateLabel.textContent = "日付";
      const dateInput = document.createElement("input"); dateInput.type = "date"; dateInput.value = date; dateLabel.append(dateInput);
      const startLabel = document.createElement("label"); startLabel.textContent = "開始";
      const start = document.createElement("select"); renderPlannedStartOptions(start, draft.plannedStart); startLabel.append(start);
      const durationLabel = document.createElement("label"); durationLabel.textContent = "利用時間";
      const duration = document.createElement("select"); renderDraftDurationOptions(duration, draft.plannedDurationHours); durationLabel.append(duration);
      const end = document.createElement("p"); end.className = "provider-draft-end";
      const contentLabel = document.createElement("label"); contentLabel.textContent = "利用内容";
      const content = document.createElement("select"); const contentChoice = renderContentOptions(content, draft.content); contentLabel.append(content);
      const otherLabel = document.createElement("label"); otherLabel.textContent = "その他の内容";
      const other = document.createElement("input"); other.maxLength = 100; other.value = contentChoice === "その他" ? draft.content : ""; otherLabel.append(other); otherLabel.hidden = contentChoice !== "その他";
      const noteLabel = document.createElement("label"); noteLabel.textContent = "備考";
      const note = document.createElement("textarea"); note.rows = 2; note.maxLength = 300; note.value = draft.note; noteLabel.append(note);
      const statusLabel = document.createElement("label"); statusLabel.textContent = "ステータス";
      const status = document.createElement("select"); renderStatusOptions(status, draft.status); statusLabel.append(status);
      const updateEnd = () => {
        const result = endTimeForDuration(start.value, Number(duration.value));
        end.textContent = result.time ? `終了予定時刻：${result.nextDay ? "翌日 " : ""}${result.time}` : "開始時刻を選択してください。";
      };
      const saveOverride = () => {
        draftOverrides.set(date, {
          memberName: member.value.trim(), plannedStart: start.value, plannedDurationHours: Number(duration.value),
          content: contentFromFields(content, other), note: note.value.trim(), status: status.value,
        });
      };
      [member, start, duration, other, note, status].forEach((field) => field.addEventListener("change", saveOverride));
      start.addEventListener("change", updateEnd); duration.addEventListener("change", updateEnd);
      content.addEventListener("change", () => { otherLabel.hidden = content.value !== "その他"; saveOverride(); });
      dateInput.addEventListener("change", () => {
        if (!isIsoDate(dateInput.value) || selectedDraftDates.has(dateInput.value)) { dateInput.value = date; return; }
        const override = { ...draftForDate(date), date: dateInput.value };
        selectedDraftDates.delete(date); draftOverrides.delete(date); selectedDraftDates.add(dateInput.value); draftOverrides.set(dateInput.value, override); renderAll();
      });
      updateEnd();
      fields.append(memberLabel, dateLabel, startLabel, durationLabel, end, contentLabel, otherLabel, noteLabel, statusLabel);
      article.append(heading, fields);
      elements.draftList.append(article);
    });
  }

  function updateSchedule(id, change) {
    schedules = schedules.map((schedule) => schedule.id === id ? normalizeProviderSchedule({ ...schedule, ...change }) : schedule);
    persistSchedules();
    renderAll();
  }

  function renderDayList() {
    elements.dayList.replaceChildren();
    if (!selectedDate) {
      elements.selectedDateLabel.textContent = "日付を選択してください";
      elements.dayList.textContent = "カレンダーの日付を選ぶと、その日の予定を確認できます。";
      return;
    }
    const rows = schedules.filter((schedule) => schedule.date === selectedDate).sort((a, b) => a.plannedStart.localeCompare(b.plannedStart));
    elements.selectedDateLabel.textContent = formatJapaneseDate(selectedDate, true);
    if (!rows.length) {
      elements.dayList.textContent = "この日の予定はありません。";
      return;
    }
    rows.forEach((schedule) => {
      const article = document.createElement("article");
      article.className = "provider-schedule-item";
      const header = document.createElement("p");
      header.className = "provider-schedule-heading";
      header.textContent = `${schedule.memberName || "表示名未入力"}　${schedule.plannedStart}〜${schedule.plannedEnd}`;
      const details = document.createElement("p");
      details.className = "provider-schedule-details";
      details.textContent = [schedule.content, schedule.note].filter(Boolean).join("　") || "利用内容・備考は未入力です。";
      const fields = document.createElement("div");
      fields.className = "provider-schedule-fields";
      const statusLabel = document.createElement("label"); statusLabel.textContent = "ステータス";
      const status = document.createElement("select"); renderStatusOptions(status, schedule.status); statusLabel.append(status);
      const contentLabel = document.createElement("label"); contentLabel.textContent = "利用内容";
      const content = document.createElement("select"); const contentChoice = renderContentOptions(content, schedule.content); contentLabel.append(content);
      const contentOtherLabel = document.createElement("label"); contentOtherLabel.textContent = "その他の内容";
      const contentOther = document.createElement("input"); contentOther.maxLength = 100; contentOther.value = contentChoice === "その他" ? schedule.content : ""; contentOtherLabel.append(contentOther); contentOtherLabel.hidden = contentChoice !== "その他";
      content.addEventListener("change", () => { contentOtherLabel.hidden = content.value !== "その他"; });
      const actualStart = document.createElement("input"); actualStart.type = "time"; actualStart.value = schedule.actualStart;
      const actualEnd = document.createElement("input"); actualEnd.type = "time"; actualEnd.value = schedule.actualEnd;
      const actualLabel = document.createElement("label"); actualLabel.className = "provider-actual-time"; actualLabel.textContent = "実績"; actualLabel.append(actualStart, document.createTextNode("〜"), actualEnd);
      const save = document.createElement("button"); save.type = "button"; save.className = "button secondary"; save.textContent = "状態・実績を保存";
      save.addEventListener("click", () => {
        if (!isTime(actualStart.value) || !isTime(actualEnd.value) || durationHours(actualStart.value, actualEnd.value) <= 0) {
          elements.formStatus.textContent = "実績終了時刻は開始時刻より後にしてください。";
          return;
        }
        updateSchedule(schedule.id, { status: status.value, content: contentFromFields(content, contentOther), actualStart: actualStart.value, actualEnd: actualEnd.value });
        elements.formStatus.textContent = "利用内容、状態、実績時間を保存しました。";
      });
      fields.append(statusLabel, contentLabel, contentOtherLabel, actualLabel, save);
      article.append(header, details, fields);
      elements.dayList.append(article);
    });
  }

  function renderAgreement() {
    const rows = monthSchedules().filter((row) => !["キャンセル"].includes(row.status));
    elements.agreementText.value = rows.length
      ? `${monthLabel(currentMonth())}の予定はこちらでお願いします。\n\n${rows.map((row) => `${shortDate(row.date)} ${row.plannedStart}〜${row.plannedEnd}${row.content ? `　${row.content}` : ""}`).join("\n")}`
      : "予定を登録すると、確認文章を作成できます。";
  }

  function submissionRows() {
    return monthSchedules().filter((row) => row.status === "合意済み");
  }

  function renderSubmission() {
    const rows = submissionRows();
    elements.submissionText.value = rows.length
      ? `${monthLabel(currentMonth())}利用予定\n\n${rows.map((row) => `${shortDate(row.date)} ${row.plannedStart}〜${row.plannedEnd}${row.memberName ? `　${row.memberName}` : ""}`).join("\n")}`
      : "合意済みで未提出の予定はありません。";
    elements.markSubmitted.disabled = !rows.length;
  }

  function settlementRows() {
    return monthSchedules().filter((row) => row.status === "実施済み");
  }

  function renderSettlement() {
    const rows = settlementRows();
    const estimate = rows.reduce((total, row) => total + calculateEstimate(1, requesterSettings(), durationHours(row.actualStart, row.actualEnd)), 0);
    const settlement = currentSettlement();
    elements.settlementList.replaceChildren();
    if (!rows.length) {
      elements.settlementList.textContent = "実施済みの予定はありません。";
    } else {
      rows.forEach((row) => {
        const item = document.createElement("div");
        item.className = "provider-settlement-item";
        item.innerHTML = `<strong>${shortDate(row.date)}　${row.memberName || "表示名未入力"}</strong><span>${row.actualStart}〜${row.actualEnd}　実績${durationHours(row.actualStart, row.actualEnd)}時間</span>`;
        elements.settlementList.append(item);
      });
    }
    elements.estimateTotal.textContent = `${formatYen(estimate)}円`;
    elements.confirmedAmount.value = settlement.confirmedAmount ?? "";
    if (settlement.confirmedAmount === null) elements.difference.textContent = "確定金額を入力してください。";
    else if (settlement.confirmedAmount === estimate) elements.difference.textContent = "一致";
    else {
      const difference = settlement.confirmedAmount - estimate;
      elements.difference.textContent = `差額 ${difference >= 0 ? "+" : ""}${formatYen(difference)}円`;
    }
    elements.notificationText.value = settlement.confirmedAmount === null
      ? "ファミサポ確定金額を入力すると、料金通知文を作成できます。"
      : `${monthLabel(currentMonth())}分のファミサポ利用料金についてご連絡します。\n\n利用回数：${rows.length}回\n確定金額：${formatYen(settlement.confirmedAmount)}円\n\nよろしくお願いいたします。`;
  }

  function renderChecklist() {
    const settlement = currentSettlement();
    elements.checklist.replaceChildren(...CHECKLIST_ITEMS.map(([key, label]) => {
      const control = document.createElement("label");
      control.className = "toggle-control";
      const input = document.createElement("input"); input.type = "checkbox"; input.checked = settlement.checklist[key]; input.dataset.key = key;
      const text = document.createElement("span"); text.innerHTML = `<strong>${label}</strong>`;
      control.append(input, text);
      return control;
    }));
  }

  function renderAvailabilitySettings() {
    elements.availabilitySettings.replaceChildren(...AVAILABILITY_KEYS.map((key) => {
      const availability = settings.availability[key];
      const row = document.createElement("div"); row.className = "provider-availability-row";
      row.innerHTML = `<strong>${AVAILABILITY_LABELS[key]}</strong><label class="provider-availability-toggle"><input type="checkbox" data-key="${key}" data-field="enabled" ${availability.enabled ? "checked" : ""} />対応可能</label><div class="provider-time-fields"><label>開始<input type="time" data-key="${key}" data-field="start" value="${availability.start}" /></label><label>終了<input type="time" data-key="${key}" data-field="end" value="${availability.end}" /></label></div>`;
      return row;
    }));
  }

  function updateAvailabilityWarning() {
    const date = [...selectedDraftDates].sort()[0] ?? selectedDate;
    const start = elements.plannedStart.value;
    const end = plannedEndInfo().time;
    if (!isIsoDate(date) || !isTime(start) || !isTime(end)) { elements.availabilityWarning.textContent = "日付と予定開始時刻を選ぶと、対応可能時間の目安を表示します。"; return; }
    const localDate = new Date(`${date}T00:00:00`);
    const key = japaneseHolidayDates(localDate.getFullYear()).has(date) ? "holiday" : String(localDate.getDay());
    const availability = settings.availability[key];
    if (!availability.enabled || !isTime(availability.start) || !isTime(availability.end) || timeMinutes(start) < timeMinutes(availability.start) || timeMinutes(end) > timeMinutes(availability.end)) {
      elements.availabilityWarning.textContent = "通常の対応可能時間外です。登録はできます。";
    } else elements.availabilityWarning.textContent = "通常の対応可能時間内です。";
  }

  function renderAll() {
    renderDashboard(); renderCalendar(); renderDraftList(); renderDayList(); renderAgreement(); renderSubmission(); renderSettlement(); renderChecklist(); updateAvailabilityWarning();
  }

  elements.month.value = document.querySelector("#target-month").value;
  renderStatusOptions(elements.status, "依頼あり");
  renderPlannedStartOptions(elements.plannedStart);
  renderPlannedDurationOptions(1);
  renderContentOptions(elements.content);
  renderContentOther();
  renderPlannedEnd();
  renderAvailabilitySettings();
  renderAll();

  elements.month.addEventListener("change", () => { selectedDate = ""; selectedDraftDates = new Set(); draftOverrides = new Map(); renderAll(); });
  elements.calendar.addEventListener("click", (event) => {
    const button = event.target.closest(".provider-day-button");
    if (!button) return;
    selectedDate = button.dataset.date;
    if (selectedDraftDates.has(selectedDate)) {
      selectedDraftDates.delete(selectedDate); draftOverrides.delete(selectedDate);
    } else selectedDraftDates.add(selectedDate);
    renderAll();
  });
  elements.clearSelection.addEventListener("click", () => { selectedDraftDates = new Set(); draftOverrides = new Map(); renderAll(); });
  elements.showSelected.addEventListener("click", () => elements.draftWrap.scrollIntoView({ behavior: "smooth", block: "start" }));
  elements.plannedStart.addEventListener("change", () => { renderPlannedEnd(); updateAvailabilityWarning(); renderDraftList(); });
  elements.plannedDuration.addEventListener("change", () => { renderPlannedEnd(); updateAvailabilityWarning(); renderDraftList(); });
  elements.content.addEventListener("change", () => { renderContentOther(); renderDraftList(); });
  [elements.memberName, elements.contentOther, elements.note, elements.status].forEach((input) => input.addEventListener("change", () => renderDraftList()));
  elements.form.addEventListener("submit", (event) => {
    event.preventDefault();
    const dates = [...selectedDraftDates].sort();
    if (!dates.length) {
      elements.formStatus.textContent = "カレンダーから登録する日付を1件以上選択してください。";
      return;
    }
    const newSchedules = dates.map((date) => makeScheduleFromDraft(draftForDate(date))).filter(Boolean);
    if (newSchedules.length !== dates.length) {
      elements.formStatus.textContent = "利用会員の表示名、予定開始時刻、利用時間、その他の内容を確認してください。";
      return;
    }
    schedules.push(...newSchedules);
    if (!persistSchedules()) { elements.formStatus.textContent = "端末内に保存できませんでした。"; return; }
    selectedDate = newSchedules[0]?.date ?? "";
    selectedDraftDates = new Set(); draftOverrides = new Map();
    clearScheduleForm();
    elements.formStatus.textContent = `${newSchedules.length}件を新しい予定として登録しました。既存予定は変更していません。`;
    renderAll();
  });
  elements.ocrRead.addEventListener("click", readOcrImage);
  elements.agreementCopy.addEventListener("click", () => copyText(elements.agreementText.value, elements.agreementStatus));
  elements.submissionCopy.addEventListener("click", () => copyText(elements.submissionText.value, elements.submissionStatus));
  elements.markSubmitted.addEventListener("click", () => {
    const rows = submissionRows();
    if (!rows.length || !window.confirm(`${rows.length}件を「ファミサポ提出済み」に変更しますか？`)) return;
    const ids = new Set(rows.map((row) => row.id));
    schedules = schedules.map((row) => ids.has(row.id) ? { ...row, status: "ファミサポ提出済み" } : row);
    if (persistSchedules()) { elements.submissionStatus.textContent = "提出済みに変更しました。"; renderAll(); }
  });
  elements.saveSettlement.addEventListener("click", () => {
    const value = elements.confirmedAmount.valueAsNumber;
    if (!Number.isInteger(value) || value < 0) { elements.settlementStatus.textContent = "ファミサポ確定金額は0円以上の整数で入力してください。"; return; }
    const settlement = currentSettlement(); settlement.confirmedAmount = value;
    if (saveSettlement(settlement)) { elements.settlementStatus.textContent = "ファミサポ確定金額を保存しました。"; renderSettlement(); }
  });
  elements.notificationCopy.addEventListener("click", () => copyText(elements.notificationText.value, elements.settlementStatus));
  elements.checklist.addEventListener("change", (event) => {
    const input = event.target.closest("input[data-key]"); if (!input) return;
    const settlement = currentSettlement(); settlement.checklist[input.dataset.key] = input.checked;
    saveSettlement(settlement); renderDashboard();
  });
  elements.saveSettings.addEventListener("click", () => {
    const availability = defaultAvailability();
    elements.availabilitySettings.querySelectorAll("[data-key]").forEach((input) => {
      const key = input.dataset.key; const field = input.dataset.field;
      availability[key][field] = field === "enabled" ? input.checked : input.value;
    });
    settings = normalizeSettings({ availability });
    elements.settingsStatus.textContent = persistSettings() ? "対応可能時間を保存しました。" : "端末内に保存できませんでした。";
    updateAvailabilityWarning();
  });
  elements.resetSettings.addEventListener("click", () => {
    if (!window.confirm("対応可能時間の設定だけを初期化しますか？")) return;
    settings = normalizeSettings({}); persistSettings(); renderAvailabilitySettings(); updateAvailabilityWarning(); elements.maintenanceStatus.textContent = "対応可能時間の設定を初期化しました。";
  });
  elements.deleteMonth.addEventListener("click", () => {
    const count = monthSchedules().length;
    if (!count || !window.confirm(`${monthLabel(currentMonth())}の予定${count}件と月末事務の記録を削除しますか？`)) return;
    schedules = schedules.filter((row) => dateMonth(row.date) !== currentMonth()); delete settlements[currentMonth()]; persistSchedules(); persistSettlements(); selectedDate = ""; renderAll(); elements.maintenanceStatus.textContent = "この月の予定を削除しました。";
  });
  elements.deleteAll.addEventListener("click", () => {
    if (!window.confirm("依頼を受ける側の予定、設定、月末事務の全データを削除しますか？ この操作は元に戻せません。")) return;
    try {
      window.localStorage.removeItem(PROVIDER_SETTINGS_STORAGE_KEY); window.localStorage.removeItem(PROVIDER_SCHEDULES_STORAGE_KEY); window.localStorage.removeItem(PROVIDER_SETTLEMENTS_STORAGE_KEY);
      schedules = []; settings = normalizeSettings({}); settlements = {}; selectedDate = ""; renderAvailabilitySettings(); renderAll(); elements.maintenanceStatus.textContent = "依頼を受ける側の全データを削除しました。";
    } catch { elements.maintenanceStatus.textContent = "削除できませんでした。"; }
  });
}
