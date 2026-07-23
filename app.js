import {
  JAPANESE_WEEKDAYS,
  defaultSelectedDates,
  formatJapaneseDate,
  fromIsoDate,
  getMonthDates,
  nextMonthValue,
} from "./date-utils.js?v=20260724";

const PRICE_PER_VISIT = 1150;
const elements = {
  month: document.querySelector("#target-month"),
  calendar: document.querySelector("#calendar"),
  calendarLabel: document.querySelector("#calendar-month-label"),
  selectedDates: document.querySelector("#selected-dates"),
  summary: document.querySelector("#selection-summary"),
  cost: document.querySelector("#estimated-cost"),
  message: document.querySelector("#line-message"),
  copyButton: document.querySelector("#copy-button"),
  copyStatus: document.querySelector("#copy-status"),
  generateButton: document.querySelector("#generate-button"),
  imageStatus: document.querySelector("#image-status"),
  previewWrap: document.querySelector("#image-preview-wrap"),
  canvas: document.querySelector("#image-canvas"),
  downloadButton: document.querySelector("#download-button"),
  shareButton: document.querySelector("#share-button"),
};

let selectedDates = new Set();
let imageIsCurrent = false;

function getSelectedMonth() {
  const [year, month] = elements.month.value.split("-").map(Number);
  return { year, monthIndex: month - 1 };
}

function sortedSelection() {
  return [...selectedDates].sort();
}

function monthTitle(year, monthIndex) {
  return `${year}年${monthIndex + 1}月`;
}

function makeLineMessage(dates) {
  const { year, monthIndex } = getSelectedMonth();
  if (dates.length === 0) return "依頼日を選択してください。";
  return `${monthTitle(year, monthIndex)}のファミサポ依頼日についてご連絡します。\n\n${dates.map((date) => formatJapaneseDate(date)).join("\n")}\n\n以上の${dates.length}日間をお願いいたします。\n確認用の画像も添付します。\nご確認よろしくお願いいたします。`;
}

function updateConfirmation() {
  const dates = sortedSelection();
  elements.selectedDates.replaceChildren();
  if (!dates.length) {
    const empty = document.createElement("li");
    empty.className = "empty";
    empty.textContent = "依頼日が選択されていません。";
    elements.selectedDates.append(empty);
  } else {
    dates.forEach((date) => {
      const item = document.createElement("li");
      item.textContent = formatJapaneseDate(date);
      elements.selectedDates.append(item);
    });
  }
  elements.summary.textContent = dates.length ? `合計 ${dates.length}日間` : "合計 0日間";
  elements.cost.textContent = new Intl.NumberFormat("ja-JP", { style: "currency", currency: "JPY", maximumFractionDigits: 0 }).format(dates.length * PRICE_PER_VISIT);
  elements.message.value = makeLineMessage(dates);
  elements.copyButton.disabled = dates.length === 0;
  elements.generateButton.disabled = dates.length === 0;
  if (imageIsCurrent) {
    imageIsCurrent = false;
    elements.previewWrap.hidden = true;
    elements.imageStatus.textContent = "選択内容が変わりました。確認後、画像を再生成してください。";
  } else if (!dates.length) {
    elements.imageStatus.textContent = "依頼日を1日以上選択すると、画像を生成できます。";
  } else {
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
  const { year, monthIndex } = getSelectedMonth();
  if (resetSelection) selectedDates = new Set(defaultSelectedDates(year, monthIndex));
  imageIsCurrent = false;
  elements.previewWrap.hidden = true;
  renderCalendar();
  updateConfirmation();
}

function drawTextCentered(ctx, text, y, font, color = "#111") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.fillText(text, 540, y);
}

function drawImage() {
  const dates = sortedSelection();
  if (!dates.length) return;
  const { year, monthIndex } = getSelectedMonth();
  const ctx = elements.canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 1080, 1350);
  drawTextCentered(ctx, "ファミリー・サポート・センター", 150, "500 40px -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif");
  drawTextCentered(ctx, `${year}年${monthIndex + 1}月　依頼日一覧`, 242, "700 62px -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif");
  ctx.strokeStyle = "#111";
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(110, 290); ctx.lineTo(970, 290); ctx.stroke();
  // 1か月分（最大31日）でも、画像内の一覧領域に収める。
  const listTop = 365;
  const listHeight = 695;
  const lineHeight = Math.min(76, listHeight / dates.length);
  const fontSize = Math.min(46, Math.max(18, Math.floor(lineHeight * 0.74)));
  const startY = listTop + ((listHeight - lineHeight * dates.length) / 2) + lineHeight * 0.72;
  dates.forEach((date, index) => {
    drawTextCentered(ctx, formatJapaneseDate(date), startY + lineHeight * index, `700 ${fontSize}px -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif`, "#c92a2a");
  });
  ctx.strokeStyle = "#d0d0d0";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(110, 1140); ctx.lineTo(970, 1140); ctx.stroke();
  drawTextCentered(ctx, `合計 ${dates.length}日間`, 1230, "700 52px -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif");
  drawTextCentered(ctx, "ご確認よろしくお願いいたします。", 1294, "400 32px -apple-system, BlinkMacSystemFont, 'Hiragino Sans', sans-serif", "#444");
}

function getImageBlob() {
  return new Promise((resolve) => elements.canvas.toBlob(resolve, "image/png"));
}

async function copyMessage() {
  try {
    await navigator.clipboard.writeText(elements.message.value);
    elements.copyStatus.textContent = "LINE用文章をコピーしました。";
  } catch {
    elements.message.focus();
    elements.message.select();
    const copied = document.execCommand("copy");
    elements.copyStatus.textContent = copied ? "LINE用文章をコピーしました。" : "コピーできませんでした。文章を長押ししてコピーしてください。";
  }
}

async function downloadImage() {
  const blob = await getImageBlob();
  if (!blob) return;
  const { year, monthIndex } = getSelectedMonth();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `ファミサポ依頼日_${year}年${String(monthIndex + 1).padStart(2, "0")}月.png`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function shareImage() {
  const blob = await getImageBlob();
  if (!blob) return;
  const { year, monthIndex } = getSelectedMonth();
  const file = new File([blob], `ファミサポ依頼日_${year}年${String(monthIndex + 1).padStart(2, "0")}月.png`, { type: "image/png" });
  try {
    await navigator.share({ title: "ファミサポ依頼日", text: elements.message.value, files: [file] });
  } catch (error) {
    if (error.name !== "AbortError") elements.imageStatus.textContent = "共有を開始できませんでした。画像を保存してから共有してください。";
  }
}

elements.month.value = nextMonthValue();
elements.month.addEventListener("change", () => setMonth(true));
elements.calendar.addEventListener("click", (event) => {
  const button = event.target.closest(".day-button");
  if (!button) return;
  const { date } = button.dataset;
  selectedDates.has(date) ? selectedDates.delete(date) : selectedDates.add(date);
  renderCalendar();
  updateConfirmation();
});
elements.copyButton.addEventListener("click", copyMessage);
elements.generateButton.addEventListener("click", () => {
  drawImage();
  imageIsCurrent = true;
  elements.previewWrap.hidden = false;
  elements.imageStatus.textContent = "PNG画像を生成しました。保存または共有できます。";
  elements.shareButton.hidden = !(navigator.share && window.File && navigator.canShare);
});
elements.downloadButton.addEventListener("click", downloadImage);
elements.shareButton.addEventListener("click", shareImage);

setMonth(true);
