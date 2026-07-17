import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { compactIconSize } from "../ui-scale";
import {
  HUB_FILTER_DROPDOWN_PANEL_PORTAL_CLASS,
  HUB_FILTER_OPTION_EMOJI_CLASS,
  HubFilterDropdownTrigger,
} from "./filter-dropdown-primitives";

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
};

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

/** Todo golden calendar picker — portal panel + HubFilterDropdownTrigger (P0020 SSOT). */
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
}: HubFilterDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const initialDate = value ? new Date(value) : new Date();
  const safeInitialDate = Number.isNaN(initialDate.getTime()) ? new Date() : initialDate;
  const [viewDate, setViewDate] = useState(safeInitialDate);

  useLayoutEffect(() => {
    if (!isOpen || !containerRef.current) {
      setPanelPos(null);
      return;
    }
    const update = () => {
      const rect = containerRef.current!.getBoundingClientRect();
      const width = 250;
      let left = rect.left;
      if (left + width > window.innerWidth - 8) {
        left = window.innerWidth - width - 8;
      }
      setPanelPos({ top: rect.bottom + 4, left, width });
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
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) setViewDate(d);
    }
  }, [value]);

  const daysOfWeek = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: "short" });
    return Array.from({ length: 7 }, (_, i) => formatter.format(new Date(2023, 0, i + 1)).slice(0, 2));
  }, [locale]);

  const { monthName, year, days } = useMemo(() => {
    const y = viewDate.getFullYear();
    const month = viewDate.getMonth();
    const monthLabel = new Intl.DateTimeFormat(locale, { month: "short" }).format(viewDate);
    const firstDayOfMonth = new Date(y, month, 1);
    const lastDayOfMonth = new Date(y, month + 1, 0);
    const startingDayOfWeek = firstDayOfMonth.getDay();
    const totalDays = lastDayOfMonth.getDate();
    const daysArray: (Date | null)[] = [];
    for (let i = 0; i < startingDayOfWeek; i++) daysArray.push(null);
    for (let i = 1; i <= totalDays; i++) daysArray.push(new Date(y, month, i));
    return { monthName: monthLabel, year: y, days: daysArray };
  }, [viewDate, locale]);

  const handleDayClick = (date: Date) => {
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

  const isSelected = (date: Date) => {
    if (!value) return false;
    const target = new Date(value);
    return (
      date.getDate() === target.getDate() &&
      date.getMonth() === target.getMonth() &&
      date.getFullYear() === target.getFullYear()
    );
  };

  const isToday = (date: Date) => {
    const today = new Date();
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  const triggerLabel = value
    ? compactTrigger
      ? formatDateCompact(value)
      : formatDateFull(value)
    : placeholder;
  const triggerTitle = value && compactTrigger ? formatDateFull(value) : undefined;

  const panel =
    isOpen && panelPos ? (
      <div
        ref={panelRef}
        className={HUB_FILTER_DROPDOWN_PANEL_PORTAL_CLASS}
        style={{ top: panelPos.top, left: panelPos.left, width: panelPos.width }}
      >
        <div className="p-3">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={() => changeMonth(-1)} className="rounded-full p-1 hover:bg-white/5">
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-bold text-[var(--text)]">
              {monthName} {year}
            </span>
            <button type="button" onClick={() => changeMonth(1)} className="rounded-full p-1 hover:bg-white/5">
              <ChevronRight size={16} />
            </button>
          </div>
          <div className="mb-1 grid grid-cols-7">
            {daysOfWeek.map((d) => (
              <div
                key={d}
                className="text-center text-[10px] font-bold uppercase tracking-wide text-[var(--muted)]"
              >
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day, idx) => {
              if (!day) return <div key={`empty-${idx}`} />;
              const selected = isSelected(day);
              const today = isToday(day);
              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => handleDayClick(day)}
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-xs transition-all ${
                    selected
                      ? "scale-105 bg-[var(--accent-color)] font-bold text-white shadow-md"
                      : today
                        ? "bg-[var(--accent-color)]/10 font-bold text-[var(--accent-color)] hover:bg-white/5"
                        : "text-[var(--text)] hover:bg-white/5"
                  }`}
                >
                  {day.getDate()}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-center gap-3 border-t border-white/5 pt-2">
            {value && clearLabel ? (
              <button
                type="button"
                onClick={handleClear}
                className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)] hover:text-[var(--text)] hover:underline"
              >
                {clearLabel}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => handleDayClick(new Date())}
              className="text-[10px] font-bold uppercase tracking-wider text-[var(--accent-color)] hover:underline"
            >
              {todayLabel}
            </button>
          </div>
        </div>
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
