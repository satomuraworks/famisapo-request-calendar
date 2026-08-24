import {
  JAPANESE_WEEKDAYS,
  datesForWeekdaysExcludingHolidays,
  formatJapaneseDate,
  getMonthDates,
  nextMonthValue,
} from "./date-utils.js?v=20260723-holiday-selection";
import {
  clearAppStorage,
  calculateEstimateForDurations,
  calculatePricePerVisit,
  DEFAULT_USAGE_SETTINGS,
  durationHoursForDate,
  formatDuration,
  formatYen,
  HISTORY_STORAGE_KEY,
  latestVersionUrl,
  makeLineMessage,
  makePriceBreakdown,
  normalizeSendStatus,
  normalizeDurationHours,
  normalizeUsageSettings,
  SEND_STATUS_STORAGE_KEY,
  sendStatusLabel,
  SETTINGS_STORAGE_KEY,
  WEEKDAY_DURATION_KEYS,
} from "./app-utils.js?v=20260824-weekday-durations";
import {
  disableAnalytics,
  getAnalyticsConsent,
  initializeAnalytics,
  saveAnalyticsConsent,
  trackAnalyticsEvent,
} from "./analytics.js?v=20260824-weekday-durations";
import { APP_UPDATED_AT, APP_VERSION } from "./version.js?v=20260824-weekday-durations";
import { initializeProviderMode } from "./provider.js?v=20260824-provider-rebuild";

const elements = {
  month: document.querySelector("#target-month"),
  childrenCount: document.querySelector("#children-count"),
  childrenDecrease: document.querySelector("#children-decrease"),
  childrenIncrease: document.querySelector("#children-increase"),
  firstChildFee: document.querySelector("#first-child-fee"),
  additionalChildFee: document.querySelector("#additional-child-fee"),
  transportFee: document.querySelector("#transport-fee"),
  durationHours: document.querySelector("#duration-hours"),
  weekdayDurationDetails: document.querySelector("#weekday-duration-details"),
  weekdayDurationInputs: document.querySelectorAll("select[data-weekday-duration]"),
  weekdayDurationSummary: document.querySelector("#weekday-duration-summary"),
  regularWeekdays: document.querySelectorAll("input[name='regular-weekday']"),
  regularHoliday: document.querySelector("#regular-holiday"),
  saveSettingsButton: document.querySelector("#save-settings-button"),
  resetSettingsButton: document.querySelector("#reset-settings-button"),
  settingStatus: document.querySelector("#setting-status"),
  calendar: document.querySelector("#calendar"),
  calendarLabel: document.querySelector("#calendar-month-label"),
  selectedDates: document.querySelector("#selected-dates"),
  summary: document.querySelector("#selection-summary"),
  cost: document.querySelector("#estimated-cost"),
  priceBreakdown: document.querySelector("#price-breakdown"),
  priceBreakdownSummary: document.querySelector("#price-breakdown-summary"),
  pricePerVisit: document.querySelector("#price-per-visit"),
  message: document.querySelector("#line-message"),
  copyButton: document.querySelector("#copy-button"),
  copyStatus: document.querySelector("#copy-status"),
  imageLayout: document.querySelectorAll("input[name='image-layout']"),
  generateButton: document.querySelector("#generate-button"),
  imageStatus: document.querySelector("#image-status"),
  previewWrap: document.querySelector("#image-preview-wrap"),
  canvas: document.querySelector("#image-canvas"),
  downloadButton: document.querySelector("#download-button"),
  memberSent: document.querySelector("#member-sent"),
  centerSent: document.querySelector("#center-sent"),
  sendStatusMessage: document.querySelector("#send-status-message"),
  saveButton: document.querySelector("#save-button"),
  historyList: document.querySelector("#history-list"),
  historyStatus: document.querySelector("#history-status"),
  clearHistoryButton: document.querySelector("#clear-history-button"),
  resetDataButton: document.querySelector("#reset-data-button"),
  resetDataModal: document.querySelector("#reset-data-modal"),
  resetDataCancelButton: document.querySelector("#reset-data-cancel-button"),
  resetDataConfirmButton: document.querySelector("#reset-data-confirm-button"),
  resetCompleteNotice: document.querySelector("#reset-complete-notice"),
  reloadLatestButton: document.querySelector("#reload-latest-button"),
  maintenanceStatus: document.querySelector("#maintenance-status"),
  selectRegularWeekdaysButton: document.querySelector("#select-regular-weekdays-button"),
  clearSelectionButton: document.querySelector("#clear-selection-button"),
  analyticsModal: document.querySelector("#analytics-consent-modal"),
  analyticsAcceptButton: document.querySelector("#analytics-accept-button"),
  analyticsDeclineButton: document.querySelector("#analytics-decline-button"),
  analyticsSettingsButton: document.querySelector("#analytics-settings-button"),
  analyticsStatus: document.querySelector("#analytics-status"),
  appVersion: document.querySelector("#app-version"),
  appUpdatedAt: document.querySelector("#app-updated-at"),
  requesterMode: document.querySelector("#requester-mode"),
  providerMode: document.querySelector("#provider-mode"),
  requesterModeTab: document.querySelector("#requester-mode-tab"),
  providerModeTab: document.querySelector("#provider-mode-tab"),
  modeIndicator: document.querySelector("#mode-indicator"),
  modeIndicatorTitle: document.querySelector("#mode-indicator-title"),
  modeIndicatorDescription: document.querySelector("#mode-indicator-description"),
  pageDescription: document.querySelector("#page-description"),
};

let selectedDates = new Set();
let selectedDateDurations = {};
let imageIsCurrent = false;
let storageAvailable = true;
let historyEntries = [];
let sendStatuses = {};
let usageSettings = { ...DEFAULT_USAGE_SETTINGS };
const RELOAD_TO_TOP_STORAGE_KEY = "famisapo-request-calendar.reload-to-top.v1";
const RESET_COMPLETE_NOTICE_STORAGE_KEY = "famisapo-request-calendar.reset-complete-notice.v1";
let resetCompleteNoticeTimer;
let resetDataIsRunning = false;

function setTransientStatus(element, message) {
  element.textContent = message;
  window.setTimeout(() => {
    if (element.textContent === message) element.textContent = "";
  }, 2500);
}

function setAppMode(mode) {
  const requester = mode === "requester";
  elements.requesterMode.hidden = !requester;
  elements.providerMode.hidden = requester;
  elements.requesterModeTab.classList.toggle("is-active", requester);
  elements.providerModeTab.classList.toggle("is-active", !requester);
  elements.requesterModeTab.setAttribute("aria-selected", String(requester));
  elements.providerModeTab.setAttribute("aria-selected", String(!requester));
  elements.modeIndicator.dataset.mode = requester ? "requester" : "provider";
  elements.modeIndicatorTitle.textContent = requester ? "依頼する側" : "依頼を受ける側";
  elements.modeIndicatorDescription.textContent = requester
    ? "利用したい日を選び、連絡用の文章と予定画像を作ります。"
    : "受ける日を選んで、予定をまとめて登録・管理します。";
  elements.pageDescription.textContent = requester
    ? "利用を依頼する日を選び、連絡用の文章と画像を作成します。"
    : "受ける日を選んで、予定をまとめて登録・管理します。";
}

function renderAnalyticsNotice() {
  const consent = getAnalyticsConsent();
  elements.analyticsStatus.textContent = consent === "granted"
    ? "アクセス解析を許可しています。"
    : consent === "denied"
      ? "アクセス解析は許可していません。"
      : "アクセス解析はまだ許可されていません。";
}

function openAnalyticsConsentModal() {
  elements.analyticsModal.hidden = false;
  document.body.classList.add("modal-open");
  elements.analyticsAcceptButton.focus();
}

function closeAnalyticsConsentModal() {
  elements.analyticsModal.hidden = true;
  document.body.classList.remove("modal-open");
}

function trapAnalyticsConsentFocus(event) {
  if (elements.analyticsModal.hidden || event.key !== "Tab") return;
  const firstButton = elements.analyticsDeclineButton;
  const lastButton = elements.analyticsAcceptButton;
  if (event.shiftKey && document.activeElement === firstButton) {
    event.preventDefault();
    lastButton.focus();
  } else if (!event.shiftKey && document.activeElement === lastButton) {
    event.preventDefault();
    firstButton.focus();
  }
}

function setAnalyticsConsent(consent) {
  if (!saveAnalyticsConsent(consent)) {
    elements.analyticsStatus.textContent = "このブラウザでは選択を保存できませんでした。";
    return;
  }
  if (consent === "granted") initializeAnalytics();
  else disableAnalytics();
  closeAnalyticsConsentModal();
  renderAnalyticsNotice();
}

function getSelectedMonth() {
  const [year, month] = elements.month.value.split("-").map(Number);
  return { year, monthIndex: month - 1 };
}

function selectedMonthValue() {
  const { year, monthIndex } = getSelectedMonth();
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
}

function monthTitle(year, monthIndex) {
  return `${year}年${monthIndex + 1}月`;
}

function sortedSelection() {
  return [...selectedDates].sort();
}

function getDurationHours() {
  const duration = Number(elements.durationHours.value);
  return normalizeDurationHours(duration, 0);
}

function populateDurationOptions(select, selectedHours = 1, includeCommonOption = false, commonOptionLabel = "共通設定を使用") {
  select.replaceChildren();
  if (includeCommonOption) {
    const commonOption = document.createElement("option");
    commonOption.value = "";
    commonOption.textContent = commonOptionLabel;
    commonOption.selected = selectedHours === null || selectedHours === undefined;
    select.append(commonOption);
  }
  for (let halfHour = 1; halfHour <= 48; halfHour += 1) {
    const durationHours = halfHour / 2;
    const option = document.createElement("option");
    option.value = String(durationHours);
    option.textContent = formatDuration(durationHours);
    option.selected = durationHours === selectedHours;
    select.append(option);
  }
}

function hasSelectedDateDurationOverride(date) {
  return Object.hasOwn(selectedDateDurations, date);
}

function getSelectedDateDuration(date, settings = getCurrentUsageSettings()) {
  return hasSelectedDateDurationOverride(date)
    ? normalizeDurationHours(selectedDateDurations[date])
    : durationHoursForDate(date, settings);
}

function setSelectedDateDuration(date, durationHours) {
  selectedDateDurations[date] = normalizeDurationHours(durationHours);
}

function selectedDurationHours(dates = sortedSelection()) {
  const settings = getCurrentUsageSettings();
  return dates.map((date) => getSelectedDateDuration(date, settings));
}

function selectedDateDurationMap(dates = sortedSelection(), settings = getCurrentUsageSettings()) {
  return Object.fromEntries(dates.map((date) => [date, getSelectedDateDuration(date, settings)]));
}

function normalizeDateDurations(dates, durations, fallback = DEFAULT_USAGE_SETTINGS.durationHours) {
  const rawDurations = durations && typeof durations === "object" && !Array.isArray(durations) ? durations : {};
  return Object.fromEntries(dates.map((date) => [date, normalizeDurationHours(rawDurations[date], fallback)]));
}

function getImageLayout() {
  return [...elements.imageLayout].find((radio) => radio.checked)?.value ?? "list";
}

function readStoredJson(key, fallback) {
  try {
    const rawValue = window.localStorage.getItem(key);
    return rawValue ? JSON.parse(rawValue) : fallback;
  } catch {
    storageAvailable = false;
    return fallback;
  }
}

function writeStoredJson(key, value) {
  if (!storageAvailable) return false;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    storageAvailable = false;
    showStorageError();
    return false;
  }
}

function showStorageError() {
  const message = "このブラウザでは端末内への保存を利用できません。";
  elements.historyStatus.textContent = message;
  elements.settingStatus.textContent = message;
  elements.saveButton.disabled = true;
  elements.clearHistoryButton.disabled = true;
  elements.memberSent.disabled = true;
  elements.centerSent.disabled = true;
  elements.saveSettingsButton.disabled = true;
  elements.resetSettingsButton.disabled = true;
  elements.resetDataButton.disabled = true;
}

function getCurrentUsageSettings() {
  const readFee = (input) => {
    const amount = input.valueAsNumber;
    return Number.isInteger(amount) && amount >= 0 ? amount : 0;
  };
  return {
    childrenCount: usageSettings.childrenCount,
    firstChildFee: readFee(elements.firstChildFee),
    additionalChildFee: readFee(elements.additionalChildFee),
    transportFee: readFee(elements.transportFee),
    durationHours: getDurationHours(),
    weekdayDurationHours: Object.fromEntries([...elements.weekdayDurationInputs].flatMap((input) => {
      const durationHours = normalizeDurationHours(input.value === "" ? null : Number(input.value), null);
      return durationHours === null ? [] : [[input.dataset.weekdayDuration, durationHours]];
    })),
    regularWeekdays: [...elements.regularWeekdays].filter((input) => input.checked).map((input) => Number(input.value)),
    regularHolidays: elements.regularHoliday.checked,
  };
}

function weekdayDurationLabel(key) {
  return key === "holiday" ? "祝日" : ["日", "月", "火", "水", "木", "金", "土"][Number(key)];
}

function renderWeekdayDurationSummary(settings = getCurrentUsageSettings()) {
  const configuredKeys = WEEKDAY_DURATION_KEYS.filter((key) => settings.weekdayDurationHours[key] !== undefined);
  elements.weekdayDurationSummary.textContent = configuredKeys.length
    ? `設定済み：${configuredKeys.map(weekdayDurationLabel).join("・")}`
    : "共通設定を使用";
}

function renderUsageSettings() {
  elements.childrenCount.textContent = `${usageSettings.childrenCount}人`;
  elements.childrenDecrease.disabled = usageSettings.childrenCount <= 1;
  elements.childrenIncrease.disabled = usageSettings.childrenCount >= 10;
  elements.firstChildFee.value = usageSettings.firstChildFee;
  elements.additionalChildFee.value = usageSettings.additionalChildFee;
  elements.transportFee.value = usageSettings.transportFee;
  elements.durationHours.value = usageSettings.durationHours;
  elements.weekdayDurationInputs.forEach((input) => {
    input.value = usageSettings.weekdayDurationHours[input.dataset.weekdayDuration] ?? "";
  });
  renderWeekdayDurationSummary(usageSettings);
  const regularWeekdays = new Set(usageSettings.regularWeekdays);
  elements.regularWeekdays.forEach((input) => { input.checked = regularWeekdays.has(Number(input.value)); });
  elements.regularHoliday.checked = usageSettings.regularHolidays;
}

function loadSettings() {
  usageSettings = normalizeUsageSettings(readStoredJson(SETTINGS_STORAGE_KEY, DEFAULT_USAGE_SETTINGS));
  renderUsageSettings();
  elements.weekdayDurationDetails.open = Object.keys(usageSettings.weekdayDurationHours).length > 0;
}

function saveSettings() {
  usageSettings = normalizeUsageSettings(getCurrentUsageSettings());
  return writeStoredJson(SETTINGS_STORAGE_KEY, usageSettings);
}

function loadSendStatuses() {
  const storedStatuses = readStoredJson(SEND_STATUS_STORAGE_KEY, {});
  if (!storedStatuses || typeof storedStatuses !== "object" || Array.isArray(storedStatuses)) return {};
  return Object.fromEntries(Object.entries(storedStatuses).map(([month, status]) => [month, normalizeSendStatus(status)]));
}

function saveSendStatuses() {
  return writeStoredJson(SEND_STATUS_STORAGE_KEY, sendStatuses);
}

function getCurrentSendStatus() {
  return normalizeSendStatus(sendStatuses[selectedMonthValue()]);
}

function updateSendStatusMessage(message = "") {
  if (message) {
    elements.sendStatusMessage.textContent = message;
    return;
  }
  const status = getCurrentSendStatus();
  elements.sendStatusMessage.textContent = status.member && status.center
    ? "この月の連絡は完了しています。"
    : "送信後に該当する項目へチェックしてください。";
}

function syncSendStatusControls() {
  const status = getCurrentSendStatus();
  elements.memberSent.checked = status.member;
  elements.centerSent.checked = status.center;
  elements.memberSent.disabled = !storageAvailable;
  elements.centerSent.disabled = !storageAvailable;
  updateSendStatusMessage();
}

function setCurrentSendStatus(status, message = "") {
  sendStatuses[selectedMonthValue()] = normalizeSendStatus(status);
  if (saveSendStatuses()) {
    syncSendStatusControls();
    if (message) {
      elements.sendStatusMessage.textContent = message;
      window.setTimeout(() => {
        if (elements.sendStatusMessage.textContent === message) updateSendStatusMessage();
      }, 3000);
    }
  }
}

function clearSendStatusAfterDateChange() {
  const status = getCurrentSendStatus();
  if (status.member || status.center) {
    setCurrentSendStatus({ member: false, center: false }, "依頼内容が変更されたため、送信済みチェックを解除しました。");
  }
}

function isValidHistoryEntry(entry) {
  return entry
    && typeof entry.month === "string"
    && /^\d{4}-\d{2}$/.test(entry.month)
    && Array.isArray(entry.dates)
    && entry.dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))
    && typeof entry.savedAt === "string";
}

function loadHistory() {
  const entries = readStoredJson(HISTORY_STORAGE_KEY, []);
  return Array.isArray(entries)
    ? entries
      .filter(isValidHistoryEntry)
      .map((entry) => ({
        ...entry,
        durationHoursByDate: normalizeDateDurations(entry.dates, entry.durationHoursByDate),
        sendStatus: normalizeSendStatus(entry.sendStatus),
      }))
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    : [];
}

function saveHistory() {
  return writeStoredJson(HISTORY_STORAGE_KEY, historyEntries);
}

function invalidateImage(message) {
  imageIsCurrent = false;
  elements.previewWrap.hidden = true;
  elements.imageStatus.textContent = message;
}

function renderPriceBreakdown() {
  const settings = getCurrentUsageSettings();
  elements.priceBreakdownSummary.textContent = `子ども${settings.childrenCount}人`;
  elements.priceBreakdown.replaceChildren();
  makePriceBreakdown(settings).forEach(({ label, amount }) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const detail = document.createElement("dd");
    detail.textContent = `${formatYen(amount)}円`;
    elements.priceBreakdown.append(term, detail);
  });
  elements.pricePerVisit.textContent = `${formatYen(calculatePricePerVisit(getCurrentUsageSettings()))}円`;
}

function updateConfirmation() {
  const dates = sortedSelection();
  const count = dates.length;
  elements.selectedDates.replaceChildren();
  if (!count) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "依頼日が選択されていません。";
    elements.selectedDates.append(empty);
  } else {
    dates.forEach((date) => {
      const item = document.createElement("li");
      item.className = "selected-date-item";
      const label = document.createElement("span");
      label.className = "selected-date-label";
      label.textContent = formatJapaneseDate(date);
      const durationLabel = document.createElement("label");
      durationLabel.className = "date-duration";
      durationLabel.textContent = "利用時間";
      const durationSelect = document.createElement("select");
      durationSelect.className = "date-duration-select";
      durationSelect.dataset.date = date;
      const effectiveDurationHours = getSelectedDateDuration(date);
      populateDurationOptions(
        durationSelect,
        hasSelectedDateDurationOverride(date) ? effectiveDurationHours : null,
        true,
        `自動（${formatDuration(effectiveDurationHours)}）`,
      );
      durationLabel.append(durationSelect);
      item.append(label, durationLabel);
      elements.selectedDates.append(item);
    });
  }

  elements.summary.textContent = `合計 ${count}日間`;
  const settings = getCurrentUsageSettings();
  const perHour = calculatePricePerVisit(settings);
  const durationHoursByDate = selectedDateDurationMap(dates, settings);
  const durationHours = dates.map((date) => durationHoursByDate[date]);
  const totalDurationHours = durationHours.reduce((total, duration) => total + duration, 0);
  const hourlyUsageFee = perHour - settings.transportFee;
  elements.cost.textContent = `${count}回（利用料金${formatYen(hourlyUsageFee)}円 × 合計${formatDuration(totalDurationHours)} ＋ 交通費${formatYen(settings.transportFee)}円 × ${count}回） = ${formatYen(calculateEstimateForDurations(durationHours, settings))}円`;
  elements.message.value = makeLineMessage(getSelectedMonth().year, getSelectedMonth().monthIndex, dates, durationHoursByDate);
  elements.copyButton.disabled = count === 0;
  elements.generateButton.disabled = count === 0;
  elements.saveButton.disabled = count === 0 || !storageAvailable;

  if (imageIsCurrent) {
    invalidateImage("選択内容が変わりました。確認後、画像を再生成してください。");
  } else if (!count) {
    elements.imageStatus.textContent = "依頼日を1日以上選択すると、画像を生成できます。";
  } else if (!elements.imageStatus.textContent) {
    elements.imageStatus.textContent = "内容を確認してから画像を生成してください。";
  }
}

function renderCalendar() {
  const { year, monthIndex } = getSelectedMonth();
  const dates = getMonthDates(year, monthIndex);
  elements.calendar.replaceChildren();
  elements.calendarLabel.textContent = monthTitle(year, monthIndex);
  for (let blank = 0; blank < dates[0].weekday; blank += 1) {
    const spacer = document.createElement("span");
    spacer.className = "calendar-spacer";
    spacer.setAttribute("aria-hidden", "true");
    elements.calendar.append(spacer);
  }
  dates.forEach(({ day, weekday, isoDate }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-button";
    button.dataset.date = isoDate;
    button.dataset.weekday = weekday;
    button.textContent = day;
    button.setAttribute("aria-label", formatJapaneseDate(isoDate, true));
    button.setAttribute("aria-pressed", String(selectedDates.has(isoDate)));
    if (selectedDates.has(isoDate)) button.classList.add("is-selected");
    elements.calendar.append(button);
  });
}

function setMonth(resetSelection = true) {
  if (resetSelection) {
    selectedDates = new Set();
    selectedDateDurations = {};
  }
  imageIsCurrent = false;
  elements.previewWrap.hidden = true;
  elements.imageStatus.textContent = "";
  renderCalendar();
  updateConfirmation();
  syncSendStatusControls();
}

function renderHistory() {
  elements.historyList.replaceChildren();
  if (!historyEntries.length) {
    const empty = document.createElement("li");
    empty.className = "history-empty";
    empty.textContent = "保存済みの履歴はありません。";
    elements.historyList.append(empty);
    elements.clearHistoryButton.disabled = true;
    return;
  }
  elements.clearHistoryButton.disabled = !storageAvailable;
  historyEntries.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "history-item";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.className = "history-restore";
    restore.dataset.month = entry.month;
    const [year, month] = entry.month.split("-").map(Number);
    const totalDurationHours = entry.dates.reduce((total, date) => total + entry.durationHoursByDate[date], 0);
    restore.innerHTML = `<strong>${year}年${month}月・${entry.dates.length}日間・合計${formatDuration(totalDurationHours)}・${sendStatusLabel(entry.sendStatus)}</strong><span>${new Date(entry.savedAt).toLocaleString("ja-JP")}</span>`;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "button danger history-delete";
    remove.dataset.month = entry.month;
    remove.textContent = "削除";
    item.append(restore, remove);
    elements.historyList.append(item);
  });
}

function saveCurrentHistory() {
  const dates = sortedSelection();
  if (!dates.length) return;
  if (!storageAvailable) {
    showStorageError();
    return;
  }
  const { year, monthIndex } = getSelectedMonth();
  const month = `${year}-${String(monthIndex + 1).padStart(2, "0")}`;
  if (historyEntries.some((entry) => entry.month === month) && !window.confirm(`${monthTitle(year, monthIndex)}の保存履歴を上書きしますか？`)) return;
  const entry = {
    month,
    dates,
    durationHoursByDate: selectedDateDurationMap(dates),
    count: dates.length,
    sendStatus: getCurrentSendStatus(),
    savedAt: new Date().toISOString(),
  };
  historyEntries = [entry, ...historyEntries.filter((saved) => saved.month !== month)];
  if (saveHistory()) {
    renderHistory();
    setTransientStatus(elements.historyStatus, "この内容を端末内に保存しました。");
    trackAnalyticsEvent("schedule_saved");
  }
}

function restoreHistory(month) {
  const entry = historyEntries.find((saved) => saved.month === month);
  if (!entry) return;
  elements.month.value = entry.month;
  selectedDates = new Set(entry.dates);
  selectedDateDurations = normalizeDateDurations(entry.dates, entry.durationHoursByDate, getDurationHours());
  sendStatuses[entry.month] = normalizeSendStatus(entry.sendStatus);
  saveSendStatuses();
  imageIsCurrent = false;
  elements.previewWrap.hidden = true;
  elements.imageStatus.textContent = "";
  renderCalendar();
  updateConfirmation();
  syncSendStatusControls();
  setTransientStatus(elements.historyStatus, `${entry.month.replace("-", "年")}月の履歴を復元しました。`);
  elements.month.scrollIntoView({ behavior: "smooth", block: "center" });
}

function deleteHistory(month) {
  const entry = historyEntries.find((saved) => saved.month === month);
  if (!entry || !window.confirm(`${entry.month.replace("-", "年")}月の履歴を削除しますか？`)) return;
  historyEntries = historyEntries.filter((saved) => saved.month !== month);
  if (saveHistory()) {
    renderHistory();
    setTransientStatus(elements.historyStatus, "履歴を削除しました。");
  }
}

function clearHistory() {
  if (!historyEntries.length || !window.confirm("保存済みの履歴をすべて削除しますか？")) return;
  historyEntries = [];
  if (saveHistory()) {
    renderHistory();
    setTransientStatus(elements.historyStatus, "保存済みの履歴をすべて削除しました。");
  }
}

function openResetDataModal() {
  if (resetDataIsRunning || !elements.resetDataModal.hidden) return;
  elements.resetDataModal.hidden = false;
  document.body.classList.add("modal-open");
  window.requestAnimationFrame(() => elements.resetDataConfirmButton.focus());
}

function closeResetDataModal() {
  if (elements.resetDataModal.hidden) return;
  elements.resetDataModal.hidden = true;
  document.body.classList.remove("modal-open");
  elements.resetDataButton.focus();
}

function resetAppData() {
  if (resetDataIsRunning) return;
  resetDataIsRunning = true;
  elements.resetDataConfirmButton.disabled = true;
  closeResetDataModal();
  try {
    clearAppStorage(window.localStorage);
  } catch {
    storageAvailable = false;
    showStorageError();
    resetDataIsRunning = false;
    elements.resetDataConfirmButton.disabled = false;
    return;
  }
  try {
    window.sessionStorage.setItem(RESET_COMPLETE_NOTICE_STORAGE_KEY, "1");
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  } catch {
    // 保存データの削除完了には影響しない
  }
  elements.maintenanceStatus.textContent = "保存データを削除しました。";
  window.scrollTo(0, 0);
  window.setTimeout(() => window.location.reload(), 800);
}

function showResetCompleteNotice() {
  window.clearTimeout(resetCompleteNoticeTimer);
  elements.resetCompleteNotice.textContent = "保存データをリセットしました。";
  elements.resetCompleteNotice.hidden = false;
  resetCompleteNoticeTimer = window.setTimeout(() => {
    elements.resetCompleteNotice.hidden = true;
    elements.resetCompleteNotice.textContent = "";
  }, 3000);
}

function restoreResetCompleteNotice() {
  let shouldShow = false;
  try {
    shouldShow = window.sessionStorage.getItem(RESET_COMPLETE_NOTICE_STORAGE_KEY) === "1";
  } catch {
    return;
  }
  if (!shouldShow) return;

  const supportsScrollRestoration = "scrollRestoration" in window.history;
  if (supportsScrollRestoration) window.history.scrollRestoration = "manual";
  const scrollToTop = () => window.scrollTo(0, 0);
  scrollToTop();
  window.addEventListener("load", () => {
    window.requestAnimationFrame(() => {
      scrollToTop();
      window.requestAnimationFrame(() => {
        scrollToTop();
        try {
          window.sessionStorage.removeItem(RESET_COMPLETE_NOTICE_STORAGE_KEY);
        } catch {
          // 通知の表示には影響しない
        }
        if (supportsScrollRestoration) window.history.scrollRestoration = "auto";
        showResetCompleteNotice();
      });
    });
  }, { once: true });
}

function reloadLatestVersion() {
  try {
    window.sessionStorage.setItem(RELOAD_TO_TOP_STORAGE_KEY, "1");
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
  } catch {
    // sessionStorage が使えない環境でも最新版の読み込みは続行する
  }
  window.location.href = latestVersionUrl(window.location.href, Date.now());
}

function restoreTopAfterLatestReload() {
  let shouldRestore = false;
  try {
    shouldRestore = window.sessionStorage.getItem(RELOAD_TO_TOP_STORAGE_KEY) === "1";
  } catch {
    return;
  }
  if (!shouldRestore) return;

  const supportsScrollRestoration = "scrollRestoration" in window.history;
  if (supportsScrollRestoration) window.history.scrollRestoration = "manual";
  const scrollToTop = () => window.scrollTo(0, 0);
  scrollToTop();
  window.addEventListener("load", () => {
    window.requestAnimationFrame(() => {
      scrollToTop();
      window.requestAnimationFrame(() => {
        scrollToTop();
        try {
          window.sessionStorage.removeItem(RELOAD_TO_TOP_STORAGE_KEY);
        } catch {
          // 読み込み後のスクロール位置には影響しない
        }
        if (supportsScrollRestoration) window.history.scrollRestoration = "auto";
      });
    });
  }, { once: true });
}

function renderVersion() {
  elements.appVersion.textContent = `Version ${APP_VERSION}`;
  elements.appUpdatedAt.textContent = `Updated: ${APP_UPDATED_AT}`;
}

function drawTextCentered(ctx, text, y, font, color = "#171717", x = 540) {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, x, y);
}

function drawImageHeader(ctx, year, monthIndex) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1080, 1350);
  drawTextCentered(ctx, "ファミサポ利用予定", 150, "500 40px -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif");
  drawTextCentered(ctx, `${year}年${monthIndex + 1}月　依頼日一覧`, 242, "700 62px -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif");
  ctx.strokeStyle = "#171717";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(110, 290); ctx.lineTo(970, 290); ctx.stroke();
}

function drawImageFooter(ctx, count) {
  ctx.strokeStyle = "#d0d0d0";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(110, 1135); ctx.lineTo(970, 1135); ctx.stroke();
  drawTextCentered(ctx, `合計 ${count}日間`, 1230, "700 52px -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif");
  drawTextCentered(ctx, "ご確認よろしくお願いいたします。", 1315, "400 32px -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif", "#444");
}

function formatDateWithDuration(date, durationHoursByDate) {
  return `${formatJapaneseDate(date)}　${formatDuration(durationHoursByDate[date])}`;
}

function drawListOnly(ctx, dates, durationHoursByDate) {
  const listTop = 365;
  const listHeight = 695;
  const lineHeight = Math.min(76, listHeight / dates.length);
  const fontSize = Math.min(40, Math.max(17, Math.floor(lineHeight * 0.68)));
  const startY = listTop + ((listHeight - lineHeight * dates.length) / 2) + lineHeight * 0.72;
  dates.forEach((date, index) => {
    drawTextCentered(ctx, formatDateWithDuration(date, durationHoursByDate), startY + lineHeight * index, `700 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif`, "#c92a2a");
  });
}

function drawSmallCalendar(ctx, year, monthIndex, dates) {
  const monthDates = getMonthDates(year, monthIndex);
  const selected = new Set(dates);
  const startX = 120;
  const startY = 345;
  const cellWidth = 120;
  const headerHeight = 42;
  const rowHeight = 48;
  const rowCount = Math.ceil((monthDates[0].weekday + monthDates.length) / 7);
  const calendarBottom = startY + headerHeight + rowCount * rowHeight;

  JAPANESE_WEEKDAYS.forEach((weekday, index) => {
    const color = index === 0 ? "#c92a2a" : index === 6 ? "#3d5c9d" : "#444";
    drawTextCentered(ctx, weekday, startY + 30, "700 24px -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif", color, startX + cellWidth * index + cellWidth / 2);
  });
  ctx.strokeStyle = "#d8d8d8";
  ctx.lineWidth = 1;
  for (let row = 0; row <= rowCount; row += 1) {
    const y = startY + headerHeight + row * rowHeight;
    ctx.beginPath(); ctx.moveTo(startX, y); ctx.lineTo(startX + cellWidth * 7, y); ctx.stroke();
  }
  for (let column = 0; column <= 7; column += 1) {
    const x = startX + column * cellWidth;
    ctx.beginPath(); ctx.moveTo(x, startY + headerHeight); ctx.lineTo(x, calendarBottom); ctx.stroke();
  }
  monthDates.forEach(({ day, weekday, isoDate }) => {
    const position = monthDates[0].weekday + day - 1;
    const column = position % 7;
    const row = Math.floor(position / 7);
    const x = startX + column * cellWidth + cellWidth / 2;
    const y = startY + headerHeight + row * rowHeight + 32;
    if (selected.has(isoDate)) {
      ctx.fillStyle = "#c92a2a";
      ctx.beginPath(); ctx.arc(x, y - 8, 19, 0, Math.PI * 2); ctx.fill();
      drawTextCentered(ctx, String(day), y, "700 25px -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif", "#ffffff", x);
    } else {
      const color = weekday === 0 ? "#c92a2a" : weekday === 6 ? "#3d5c9d" : "#444";
      drawTextCentered(ctx, String(day), y, "600 25px -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif", color, x);
    }
  });
  return calendarBottom;
}

function drawListWithCalendar(ctx, dates, durationHoursByDate, listTop) {
  const columns = 2;
  const rows = Math.ceil(dates.length / columns);
  const listHeight = 360;
  const lineHeight = Math.min(44, listHeight / rows);
  const fontSize = Math.min(24, Math.max(14, Math.floor(lineHeight * 0.62)));
  dates.forEach((date, index) => {
    const column = Math.floor(index / rows);
    const row = index % rows;
    const x = column === 0 ? 330 : 750;
    drawTextCentered(ctx, formatDateWithDuration(date, durationHoursByDate), listTop + 30 + row * lineHeight, `700 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif`, "#c92a2a", x);
  });
}

function drawImage() {
  const dates = sortedSelection();
  if (!dates.length) return;
  const durationHoursByDate = selectedDateDurationMap(dates);
  const { year, monthIndex } = getSelectedMonth();
  const ctx = elements.canvas.getContext("2d");
  drawImageHeader(ctx, year, monthIndex);
  if (getImageLayout() === "calendar") {
    const calendarBottom = drawSmallCalendar(ctx, year, monthIndex, dates);
    drawListWithCalendar(ctx, dates, durationHoursByDate, Math.max(740, calendarBottom + 70));
  } else {
    drawListOnly(ctx, dates, durationHoursByDate);
  }
  drawImageFooter(ctx, dates.length);
}

function getImageBlob() {
  return new Promise((resolve) => elements.canvas.toBlob(resolve, "image/png"));
}

async function copyMessage() {
  try {
    await navigator.clipboard.writeText(elements.message.value);
    setTransientStatus(elements.copyStatus, "コピーしました。");
  } catch {
    elements.message.focus();
    elements.message.select();
    const copied = document.execCommand("copy");
    if (copied) setTransientStatus(elements.copyStatus, "コピーしました。");
    else elements.copyStatus.textContent = "コピーできませんでした。文章を選択してコピーしてください。";
  }
}

async function downloadImage() {
  const blob = await getImageBlob();
  if (!blob) return;
  if (!navigator.share || !navigator.canShare || !window.File) {
    elements.imageStatus.textContent = "このブラウザでは画像の保存機能を利用できません。Safariなどのブラウザで開いてください。";
    return;
  }
  const { year, monthIndex } = getSelectedMonth();
  const file = new File([blob], `famisapo-${year}-${String(monthIndex + 1).padStart(2, "0")}.png`, { type: "image/png" });
  if (!navigator.canShare({ files: [file] })) {
    elements.imageStatus.textContent = "このブラウザでは画像の保存機能を利用できません。Safariなどのブラウザで開いてください。";
    return;
  }
  try {
    await navigator.share({ files: [file] });
    trackAnalyticsEvent("image_export_completed");
  } catch (error) {
    if (error.name !== "AbortError") elements.imageStatus.textContent = "画像の保存を開始できませんでした。Safariなどのブラウザで開いてください。";
  }
}

elements.month.value = nextMonthValue();
populateDurationOptions(elements.durationHours);
elements.weekdayDurationInputs.forEach((input) => populateDurationOptions(input, null, true));
loadSettings();
sendStatuses = loadSendStatuses();
historyEntries = loadHistory();
if (!storageAvailable) showStorageError();

elements.month.addEventListener("change", () => setMonth(true));
elements.requesterModeTab.addEventListener("click", () => setAppMode("requester"));
elements.providerModeTab.addEventListener("click", () => setAppMode("provider"));
elements.childrenDecrease.addEventListener("click", () => {
  usageSettings.childrenCount = Math.max(1, usageSettings.childrenCount - 1);
  renderUsageSettings();
  renderPriceBreakdown();
  updateConfirmation();
});
elements.childrenIncrease.addEventListener("click", () => {
  usageSettings.childrenCount = Math.min(10, usageSettings.childrenCount + 1);
  renderUsageSettings();
  renderPriceBreakdown();
  updateConfirmation();
});
[elements.firstChildFee, elements.additionalChildFee, elements.transportFee].forEach((input) => {
  input.addEventListener("input", () => {
    input.setAttribute("aria-invalid", String(input.value !== "" && (!Number.isInteger(input.valueAsNumber) || input.valueAsNumber < 0)));
    renderPriceBreakdown();
    updateConfirmation();
  });
});
elements.durationHours.addEventListener("change", () => {
  const duration = Number(elements.durationHours.value);
  elements.durationHours.setAttribute("aria-invalid", String(elements.durationHours.value !== "" && (!Number.isFinite(duration) || duration < 0.5 || duration > 24 || !Number.isInteger(duration * 2))));
  updateConfirmation();
});
elements.weekdayDurationInputs.forEach((input) => input.addEventListener("change", () => {
  renderWeekdayDurationSummary();
  updateConfirmation();
}));
elements.saveSettingsButton.addEventListener("click", () => {
  if (saveSettings()) {
    renderUsageSettings();
    renderPriceBreakdown();
    updateConfirmation();
    setTransientStatus(elements.settingStatus, "利用設定を保存しました。");
  }
});
elements.resetSettingsButton.addEventListener("click", () => {
  if (!window.confirm("利用設定を初期値に戻しますか？\n保存履歴と連絡状況は削除されません。")) return;
  usageSettings = { ...DEFAULT_USAGE_SETTINGS };
  renderUsageSettings();
  elements.weekdayDurationDetails.open = false;
  if (saveSettings()) {
    selectedDates.clear();
    selectedDateDurations = {};
    renderCalendar();
    renderPriceBreakdown();
    updateConfirmation();
    clearSendStatusAfterDateChange();
    setTransientStatus(elements.settingStatus, "利用設定を初期値に戻しました。");
  }
});
elements.calendar.addEventListener("click", (event) => {
  const button = event.target.closest(".day-button");
  if (!button) return;
  const { date } = button.dataset;
  if (selectedDates.has(date)) {
    selectedDates.delete(date);
    delete selectedDateDurations[date];
  } else {
    selectedDates.add(date);
  }
  renderCalendar();
  updateConfirmation();
  clearSendStatusAfterDateChange();
});
elements.selectRegularWeekdaysButton.addEventListener("click", () => {
  const { year, monthIndex } = getSelectedMonth();
  const settings = getCurrentUsageSettings();
  const dates = datesForWeekdaysExcludingHolidays(year, monthIndex, settings.regularWeekdays, settings.regularHolidays);
  const before = selectedDates.size;
  dates.forEach((date) => {
    if (selectedDates.has(date)) return;
    selectedDates.add(date);
  });
  renderCalendar();
  updateConfirmation();
  if (selectedDates.size !== before) clearSendStatusAfterDateChange();
  setTransientStatus(elements.settingStatus, dates.length ? "設定した曜日を追加選択しました。" : "定期利用曜日または祝日を選択してから実行してください。");
});
elements.clearSelectionButton.addEventListener("click", () => {
  if (!selectedDates.size) return;
  selectedDates.clear();
  selectedDateDurations = {};
  renderCalendar();
  updateConfirmation();
  clearSendStatusAfterDateChange();
});
elements.selectedDates.addEventListener("change", (event) => {
  const durationSelect = event.target.closest(".date-duration-select");
  if (!durationSelect) return;
  if (durationSelect.value === "") delete selectedDateDurations[durationSelect.dataset.date];
  else setSelectedDateDuration(durationSelect.dataset.date, Number(durationSelect.value));
  updateConfirmation();
});
elements.copyButton.addEventListener("click", copyMessage);
elements.imageLayout.forEach((radio) => radio.addEventListener("change", () => {
  if (radio.checked) invalidateImage("画像形式が変わりました。内容を確認して再生成してください。");
}));
elements.generateButton.addEventListener("click", () => {
  drawImage();
  imageIsCurrent = true;
  elements.previewWrap.hidden = false;
  elements.imageStatus.textContent = "PNG画像を生成しました。ダウンロードを押して保存してください。";
  trackAnalyticsEvent("image_generated");
});
elements.downloadButton.addEventListener("click", downloadImage);
elements.memberSent.addEventListener("change", () => {
  const status = getCurrentSendStatus();
  status.member = elements.memberSent.checked;
  setCurrentSendStatus(status);
});
elements.centerSent.addEventListener("change", () => {
  const status = getCurrentSendStatus();
  status.center = elements.centerSent.checked;
  setCurrentSendStatus(status);
});
elements.saveButton.addEventListener("click", saveCurrentHistory);
elements.historyList.addEventListener("click", (event) => {
  const restore = event.target.closest(".history-restore");
  const remove = event.target.closest(".history-delete");
  if (restore) restoreHistory(restore.dataset.month);
  if (remove) deleteHistory(remove.dataset.month);
});
elements.clearHistoryButton.addEventListener("click", clearHistory);
elements.resetDataButton.addEventListener("click", openResetDataModal);
elements.resetDataCancelButton.addEventListener("click", closeResetDataModal);
elements.resetDataConfirmButton.addEventListener("click", resetAppData);
elements.resetDataModal.addEventListener("click", (event) => {
  if (event.target === elements.resetDataModal) closeResetDataModal();
});
elements.resetDataModal.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    event.preventDefault();
    closeResetDataModal();
    return;
  }
  if (event.key === "Tab") {
    const firstButton = elements.resetDataCancelButton;
    const lastButton = elements.resetDataConfirmButton;
    if ((!event.shiftKey && document.activeElement === lastButton) || (event.shiftKey && document.activeElement === firstButton)) {
      event.preventDefault();
      (event.shiftKey ? lastButton : firstButton).focus();
    }
  }
});
elements.reloadLatestButton.addEventListener("click", reloadLatestVersion);
elements.analyticsAcceptButton.addEventListener("click", () => setAnalyticsConsent("granted"));
elements.analyticsDeclineButton.addEventListener("click", () => setAnalyticsConsent("denied"));
elements.analyticsSettingsButton.addEventListener("click", openAnalyticsConsentModal);
document.addEventListener("keydown", trapAnalyticsConsentFocus);

renderHistory();
renderPriceBreakdown();
renderVersion();
renderAnalyticsNotice();
if (getAnalyticsConsent() === "granted") initializeAnalytics();
else if (getAnalyticsConsent() === null) openAnalyticsConsentModal();
restoreTopAfterLatestReload();
restoreResetCompleteNotice();
setMonth(true);
initializeProviderMode();
setAppMode("requester");
