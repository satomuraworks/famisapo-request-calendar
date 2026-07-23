export const JAPANESE_WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function toIsoDate(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function fromIsoDate(isoDate) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function daysInMonth(year, monthIndex) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

export function getMonthDates(year, monthIndex) {
  return Array.from({ length: daysInMonth(year, monthIndex) }, (_, index) => {
    const day = index + 1;
    const date = new Date(year, monthIndex, day);
    return { day, weekday: date.getDay(), isoDate: toIsoDate(year, monthIndex, day) };
  });
}

function weekdayOf(year, monthIndex, day) {
  return new Date(year, monthIndex, day).getDay();
}

function nthWeekdayOfMonth(year, monthIndex, weekday, occurrence) {
  const firstWeekday = weekdayOf(year, monthIndex, 1);
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (occurrence - 1) * 7;
  return toIsoDate(year, monthIndex, day);
}

function vernalEquinoxDay(year) {
  return Math.floor(20.8431 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

function autumnalEquinoxDay(year) {
  return Math.floor(23.2488 + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/**
 * 日本の祝日を YYYY-MM-DD で返す。
 * 振替休日と国民の休日も含める。春分・秋分の日の近似式は 1980〜2099年用。
 */
export function japaneseHolidayDates(year) {
  if (year < 1948 || year > 2099) return new Set();

  const holidays = new Set();
  const add = (monthIndex, day) => holidays.add(toIsoDate(year, monthIndex, day));

  add(0, 1); // 元日
  if (year >= 2000) holidays.add(nthWeekdayOfMonth(year, 0, 1, 2)); // 成人の日
  else if (year >= 1949) add(0, 15);
  add(1, 11); // 建国記念の日
  if (year >= 2020) add(1, 23); // 天皇誕生日
  else if (year >= 1989 && year <= 2018) add(11, 23);
  add(2, vernalEquinoxDay(year));
  add(3, 29); // 昭和の日
  add(4, 3);
  if (year >= 2007) add(4, 4);
  add(4, 5);

  if (year === 2020) add(6, 23);
  else if (year === 2021) add(6, 22);
  else if (year >= 2003) holidays.add(nthWeekdayOfMonth(year, 6, 1, 3)); // 海の日
  else if (year >= 1996) add(6, 20);

  if (year === 2020) add(7, 10);
  else if (year === 2021) add(7, 8);
  else if (year >= 2016) add(7, 11); // 山の日

  holidays.add(nthWeekdayOfMonth(year, 8, 1, 3)); // 敬老の日
  add(8, autumnalEquinoxDay(year));

  if (year === 2020) add(6, 24);
  else if (year === 2021) add(6, 23);
  else if (year >= 2000) holidays.add(nthWeekdayOfMonth(year, 9, 1, 2)); // スポーツの日
  else add(9, 10);

  add(10, 3);
  add(10, 23);

  // 日曜日の祝日は、次に来る平日以外の祝日でない日を振替休日にする。
  [...holidays].sort().forEach((isoDate) => {
    const date = fromIsoDate(isoDate);
    if (date.getDay() !== 0) return;
    date.setDate(date.getDate() + 1);
    while (holidays.has(toIsoDate(date.getFullYear(), date.getMonth(), date.getDate()))) {
      date.setDate(date.getDate() + 1);
    }
    if (date.getFullYear() === year) add(date.getMonth(), date.getDate());
  });

  // 祝日に挟まれた平日は「国民の休日」。
  for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
    getMonthDates(year, monthIndex).forEach(({ day, isoDate }) => {
      if (holidays.has(isoDate)) return;
      const previousDate = new Date(year, monthIndex, day - 1);
      const nextDate = new Date(year, monthIndex, day + 1);
      const previous = toIsoDate(previousDate.getFullYear(), previousDate.getMonth(), previousDate.getDate());
      const next = toIsoDate(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
      if (holidays.has(previous) && holidays.has(next)) holidays.add(isoDate);
    });
  }

  return holidays;
}

export function defaultSelectedDates(year, monthIndex, includeHolidays = false) {
  const holidays = japaneseHolidayDates(year);
  return getMonthDates(year, monthIndex)
    .filter(({ weekday, isoDate }) => weekday >= 1 && weekday <= 4 && (includeHolidays || !holidays.has(isoDate)))
    .map(({ isoDate }) => isoDate);
}

/**
 * 指定した曜日の日付を返す。曜日の一括選択では祝日を常に除外する。
 */
export function datesForWeekdaysExcludingHolidays(year, monthIndex, weekdays) {
  const selectedWeekdays = new Set(
    Array.isArray(weekdays)
      ? weekdays.map(Number).filter((weekday) => Number.isInteger(weekday) && weekday >= 0 && weekday <= 6)
      : [],
  );
  const holidays = japaneseHolidayDates(year);
  return getMonthDates(year, monthIndex)
    .filter(({ weekday, isoDate }) => selectedWeekdays.has(weekday) && !holidays.has(isoDate))
    .map(({ isoDate }) => isoDate);
}

export function formatJapaneseDate(isoDate, includeYear = false) {
  const date = fromIsoDate(isoDate);
  const prefix = includeYear ? `${date.getFullYear()}年` : "";
  return `${prefix}${date.getMonth() + 1}月${date.getDate()}日（${JAPANESE_WEEKDAYS[date.getDay()]}）`;
}

export function nextMonthValue(now = new Date()) {
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, "0")}`;
}
