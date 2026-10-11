/** Hub calendar month stickers — date picker + Record Month column SSOT. */
export const HUB_CALENDAR_MONTH_EMOJI = [
  "❄️", // Jan
  "💖", // Feb
  "🍀", // Mar
  "🌧️", // Apr
  "🎓", // May
  "☀", // Jun
  "🏖️", // Jul
  "🏝️", // Aug
  "📚", // Sep
  "🎃", // Oct
  "🍁", // Nov
  "🎄", // Dec
] as const;

export function hubCalendarMonthEmoji(monthIndex0: number): string {
  const idx = Math.trunc(monthIndex0);
  if (idx < 0 || idx > 11) return "";
  return HUB_CALENDAR_MONTH_EMOJI[idx]!;
}

/** Locale short month name only (`Jan`). */
export function hubCalendarMonthNameShort(
  monthIndex0: number,
  locale = "en",
  year = 2000,
): string {
  return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, monthIndex0, 1)),
  );
}

/** `❄️ Jan` — short month for grids. */
export function formatHubCalendarMonthShort(
  monthIndex0: number,
  locale = "en",
  year = 2000,
): string {
  const emoji = hubCalendarMonthEmoji(monthIndex0);
  const name = hubCalendarMonthNameShort(monthIndex0, locale, year);
  return emoji ? `${emoji} ${name}` : name;
}

/** `❄️ Jan 2026` — date-picker header + directory Month cells. */
export function formatHubCalendarMonthYear(
  year: number,
  monthIndex0: number,
  locale = "en",
): string {
  return `${formatHubCalendarMonthShort(monthIndex0, locale, year)} ${year}`;
}
