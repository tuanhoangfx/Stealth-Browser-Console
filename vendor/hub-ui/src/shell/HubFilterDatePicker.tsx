import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { compactIconSize } from "../ui-scale";
import {
  HUB_FILTER_DROPDOWN_PANEL_PORTAL_CLASS,
  HUB_FILTER_OPTION_EMOJI_CLASS,
  HubFilterDropdownTrigger,
} from "./filter-dropdown-primitives";
import { formatHubCalendarMonthShort, formatHubCalendarMonthYear } from "../lib/hub-calendar-month";
import { hubPortalPanelPosition } from "./hub-portal-panel-position";
import "../styles/hub-date-picker.css";

/** Account detail + vault date fields — muted placeholder tone (not column label). */
export const HUB_DATE_PICKER_PLACEHOLDER = "dd/mm/yy";

export type HubFilterDatePickerProps = {
  value: string;
  onChange: (date: string) => void;
  placeholder?: string;
  className?: string;
  min?: string;
  max?: string;
  triggerClassName?: string;
  triggerEmoji?: string;
  compactTrigger?: boolean;
  todayLabel?: string;
  clearLabel?: string;
  locale?: string;
  /** Account detail — label column already shows emoji; value cell is text-only. */
  hideTriggerIcon?: boolean;
  disabled?: boolean;
  /** Filter-bar panel — picker fills the dropdown instead of anchoring to a field. */
  embedded?: boolean;
  /** Creation uses month + year only. Day grid stays the default. */
  precision?: "day" | "month";
};

/** `YYYY-MM-DD` is a calendar day, not a UTC instant. */
function parsePickerDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (match) {
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateFull(dateString: string) {
  const [y, m, d] = dateString.split("-");
  if (!y || !m || !d) return dateString;
  return `${d}/${m}/${y}`;
}

function formatDateCompact(dateString: string) {
  const [y, m, d] = dateString.split("-");
  if (!y || !m || !d) return dateString;
  return `${d}/${m}/${y.slice(-2)}`;
}

function parseMonthValue(value: string): { year: number; monthIndex: number } | null {
  const match = /^(\d{4})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year: Number(match[1]), monthIndex: month - 1 };
}

function formatMonthCompact(value: string) {
  const parsed = parseMonthValue(value);
  if (!parsed) return value;
  return `${String(parsed.monthIndex + 1).padStart(2, "0")}/${String(parsed.year).slice(-2)}`;
}

/**
 * Todo calendar — the single date-picker SSOT for every Hub tool.
 *
 * Monday week, month sticker (`🎃 Oct 2026`), Clear/Today, ISO `YYYY-MM-DD`.
 * Detail fields use it through `HubAdmClickDateField`. Do not add a second calendar.
 */
export function HubFilterDatePicker({
  value,
  onChange,
  placeholder = "Select date",
  className,
  triggerClassName = "w-full justify-between",
  triggerEmoji,
  compactTrigger = false,
  todayLabel = "Today",
  clearLabel = "Clear",
  locale = "en",
  hideTriggerIcon = false,
  disabled = false,
  embedded = false,
  precision = "day",
  min,
  max,
}: HubFilterDatePickerProps) {
  const monthOnly = precision === "month";
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const initialDate = value
    ? monthOnly
      ? (() => {
          const parsed = parseMonthValue(value);
          return parsed ? new Date(parsed.year, parsed.monthIndex, 1) : new Date();
        })()
      : parsePickerDay(value)
    : new Date();
  const safeInitialDate = initialDate ?? new Date();
  const [viewDate, setViewDate] = useState(safeInitialDate);

  useLayoutEffect(() => {
    if (!isOpen || !containerRef.current) {
      setPanelPos(null);
      return;
    }
    const update = () => {
      const rect = containerRef.current!.getBoundingClientRect();
      // Calendar panel is fixed-height (~month grid + Clear/Today).
      const { top, left, width } = hubPortalPanelPosition(rect, {
        width: 268,
        estimatedHeight: 300,
      });
      setPanelPos({ top, left, width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  useEffect(() => {
    if (value) {
      const d = monthOnly
        ? (() => {
            const parsed = parseMonthValue(value);
            return parsed ? new Date(parsed.year, parsed.monthIndex, 1) : null;
          })()
        : parsePickerDay(value);
      if (d) setViewDate(d);
    }
  }, [monthOnly, value]);

  const daysOfWeek = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
    // 2023-01-02 is Monday — week header matches the Todo calendar.
    return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(2023, 0, 2 + i)).slice(0, 2));
  }, [locale]);

  const { monthLabel, days } = useMemo(() => {
    const y = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const firstDayOfMonth = new Date(y, month, 1);
    const lastDayOfMonth = new Date(y, month + 1, 0);
    const leadingBlanks = (firstDayOfMonth.getDay() + 6) % 7;
    const totalDays = lastDayOfMonth.getDate();
    const daysArray: (Date | null)[] = [];
    for (let i = 0; i < leadingBlanks; i++) daysArray.push(null);
    for (let i = 1; i <= totalDays; i++) daysArray.push(new Date(y, month, i));
    return { monthLabel: formatHubCalendarMonthYear(y, month, locale), days: daysArray };
  }, [viewDate, locale]);

  const isoDay = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  };

  const isOutOfRange = (date: Date) => {
    const iso = isoDay(date);
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  };

  const handleDayClick = (date: Date) => {
    if (isOutOfRange(date)) return;
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60 * 1000);
    onChange(localDate.toISOString().split("T")[0]!);
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange("");
    setIsOpen(false);
  };

  const changeMonth = (delta: number) => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + delta, 1));
  };

  const changeYear = (delta: number) => {
    setViewDate(new Date(viewDate.getFullYear() + delta, viewDate.getMonth(), 1));
  };

  const handleMonthClick = (monthIndex: number) => {
    const month = String(monthIndex + 1).padStart(2, "0");
    onChange(`${viewDate.getFullYear()}-${month}`);
    setIsOpen(false);
  };

  const isSelected = (date: Date) => Boolean(value) && isoDay(date) === value.slice(0, 10);

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const triggerLabel = value
    ? monthOnly
      ? formatMonthCompact(value)
      : compactTrigger
        ? formatDateCompact(value)
        : formatDateFull(value)
    : placeholder;
  const triggerTitle = value && compactTrigger && !monthOnly ? formatDateFull(value) : undefined;

  const monthCalendar = (
    <div className="hub-date-picker">
      <div className="hub-date-picker-nav">
        <button type="button" onClick={() => changeYear(-1)} className="hub-date-picker-nav__btn" aria-label="Previous year">
          <ChevronLeft size={16} />
        </button>
        <span className="hub-date-picker-month">{viewDate.getFullYear()}</span>
        <button type="button" onClick={() => changeYear(1)} className="hub-date-picker-nav__btn" aria-label="Next year">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="hub-date-picker-months">
        {Array.from({ length: 12 }, (_, monthIndex) => {
          const selected = parseMonthValue(value);
          const isSelectedMonth =
            selected?.year === viewDate.getFullYear() && selected.monthIndex === monthIndex;
          const today = new Date();
          const isCurrent =
            today.getFullYear() === viewDate.getFullYear() && today.getMonth() === monthIndex;
          return (
            <button
              key={monthIndex}
              type="button"
              onClick={() => handleMonthClick(monthIndex)}
              className={`hub-date-picker-month-btn${isSelectedMonth ? " hub-date-picker-day--selected" : isCurrent ? " hub-date-picker-day--today" : ""}`}
            >
              {formatHubCalendarMonthShort(monthIndex, locale)}
            </button>
          );
        })}
      </div>
      <div className="hub-date-picker-footer">
        {value && clearLabel ? (
          <button type="button" onClick={handleClear} className="hub-date-picker-footer__clear">
            {clearLabel}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            const today = new Date();
            onChange(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`);
            setIsOpen(false);
          }}
          className="hub-date-picker-footer__today"
        >
          {todayLabel}
        </button>
      </div>
    </div>
  );

  const calendar = monthOnly ? monthCalendar : (
    <div className="hub-date-picker">
      <div className="hub-date-picker-nav">
        <button type="button" onClick={() => changeMonth(-1)} className="hub-date-picker-nav__btn" aria-label="Previous month">
          <ChevronLeft size={16} />
        </button>
        <span className="hub-date-picker-month">{monthLabel}</span>
        <button type="button" onClick={() => changeMonth(1)} className="hub-date-picker-nav__btn" aria-label="Next month">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="hub-date-picker-dow">
        {daysOfWeek.map((d, i) => (
          <span key={`${d}-${i}`}>{d}</span>
        ))}
      </div>
      <div className="hub-date-picker-grid">
        {days.map((day, idx) => {
          if (!day) return <div key={`empty-${idx}`} />;
          const selected = isSelected(day);
          const today = isToday(day);
          const blocked = isOutOfRange(day);
          return (
            <button
              key={day.toISOString()}
              type="button"
              disabled={blocked}
              onClick={() => handleDayClick(day)}
              className={`hub-date-picker-day${selected ? " hub-date-picker-day--selected" : today ? " hub-date-picker-day--today" : ""}`}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
      <div className="hub-date-picker-footer">
        {value && clearLabel ? (
          <button type="button" onClick={handleClear} className="hub-date-picker-footer__clear">
            {clearLabel}
          </button>
        ) : null}
        <button type="button" onClick={() => handleDayClick(new Date())} className="hub-date-picker-footer__today">
          {todayLabel}
        </button>
      </div>
    </div>
  );

  if (embedded) return calendar;

  const panel =
    isOpen && panelPos ? (
      <div
        ref={panelRef}
        className={HUB_FILTER_DROPDOWN_PANEL_PORTAL_CLASS}
        style={{ top: panelPos.top, left: panelPos.left, width: panelPos.width }}
      >
        {calendar}
      </div>
    ) : null;

  return (
    <div className={`relative min-w-0${className ? ` ${className}` : ""}`} ref={containerRef}>
      <HubFilterDropdownTrigger
        active={Boolean(value)}
        hasValue={Boolean(value)}
        open={isOpen}
        label={triggerLabel}
        title={triggerTitle}
        icon={
          hideTriggerIcon
            ? false
            : triggerEmoji
              ? (
                  <span className={HUB_FILTER_OPTION_EMOJI_CLASS} aria-hidden>
                    {triggerEmoji}
                  </span>
                )
              : (
                  <Calendar size={compactIconSize(12)} className="shrink-0 text-sky-300" aria-hidden />
                )
        }
        onClick={() => {
          if (disabled) return;
          setIsOpen(!isOpen);
        }}
        disabled={disabled}
        className={triggerClassName}
      />
      {panel ? createPortal(panel, document.body) : null}
    </div>
  );
}
