import { useEffect, useRef, useState, type ReactNode } from "react";
import { Bot, Check } from "lucide-react";
import {
  HUB_BULK_ACTION_BTN_CLASS,
  HubBulkActionCountBadge,
} from "./HubBulkActionButton";
import {
  HUB_FILTER_DROPDOWN_LIST_CLASS,
  HUB_FILTER_DROPDOWN_PANEL_CLASS,
  HUB_FILTER_DROPDOWN_ROW_CLASS,
} from "./filter-dropdown-primitives";

export type HubChatbotBulkPersonalityOption = {
  id: string;
  label: string;
  dotColor: string;
};

export type HubChatbotBulkSelection = {
  allOff: boolean;
  personalityId: string | null;
};

export type HubChatbotBulkActionDropdownProps = {
  hasSelection: boolean;
  selectedCount: number;
  loading?: boolean;
  selection: HubChatbotBulkSelection;
  personalities: HubChatbotBulkPersonalityOption[];
  noun?: string;
  offDotColor: string;
  onSetChatbotOff: () => void;
  onSetChatbotOn: (personalityId: string) => void;
  renderOffDot?: ReactNode;
  renderPersonalityDot?: (personality: HubChatbotBulkPersonalityOption) => ReactNode;
};

function DefaultDot({ color }: { color: string }) {
  return (
    <span
      className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

/** Bulk chatbot on/off + personality picker — Pages / Zalo accounts directory golden. */
export function HubChatbotBulkActionDropdown({
  hasSelection,
  selectedCount,
  loading = false,
  selection,
  personalities,
  noun = "row(s)",
  offDotColor,
  onSetChatbotOff,
  onSetChatbotOn,
  renderOffDot,
  renderPersonalityDot,
}: HubChatbotBulkActionDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const disabled = !hasSelection || loading;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={hasSelection ? `Set chatbot for selected ${noun}` : `Select ${noun} first`}
        className={`${HUB_BULK_ACTION_BTN_CLASS} border border-indigo-400/35 bg-indigo-500/15 text-indigo-100 hover:bg-indigo-500/25`}
      >
        <Bot size={14} aria-hidden />
        Chatbot
        {hasSelection && selectedCount > 0 ? (
          <HubBulkActionCountBadge count={selectedCount} tone="indigo" />
        ) : null}
      </button>
      {open ? (
        <div role="menu" className={`${HUB_FILTER_DROPDOWN_PANEL_CLASS} right-0 w-64`}>
          <div className={HUB_FILTER_DROPDOWN_LIST_CLASS}>
            <button
              type="button"
              role="menuitem"
              className={HUB_FILTER_DROPDOWN_ROW_CLASS}
              onClick={() => {
                onSetChatbotOff();
                setOpen(false);
              }}
            >
              {renderOffDot ?? <DefaultDot color={offDotColor} />}
              <span className="min-w-0 flex-1 truncate">Off</span>
              {selection.allOff ? <Check size={14} className="shrink-0 text-indigo-300" aria-hidden /> : null}
            </button>
            {personalities.map((p) => {
              const active = !selection.allOff && selection.personalityId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="menuitem"
                  className={HUB_FILTER_DROPDOWN_ROW_CLASS}
                  onClick={() => {
                    onSetChatbotOn(p.id);
                    setOpen(false);
                  }}
                >
                  {renderPersonalityDot?.(p) ?? <DefaultDot color={p.dotColor} />}
                  <span className="min-w-0 flex-1 truncate">{p.label}</span>
                  {active ? <Check size={14} className="shrink-0 text-indigo-300" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
