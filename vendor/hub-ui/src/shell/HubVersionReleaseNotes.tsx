import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { CheckCircle2, Download, RefreshCw, Sparkles, Wrench, Zap } from "lucide-react";
import { HubActivityFeedToolbar } from "./HubActivityFeed";
import { HubChromeActivityAge } from "./HubChromeActivityAge";
import { HubToolDetailModal, HUB_TOOL_DETAIL_SCROLL_ROOT } from "./HubToolDetailModal";
import { HubToolDetailSection, HUB_TOOL_DETAIL_SECTIONS_CLASS } from "./HubToolDetailSection";
import { HubTocSectionNav, type HubTocNavItem } from "./HubTocSectionNav";
import { compactIconSize } from "../ui-scale";
import {
  HUB_RELEASE_NOTES_URL,
  ensureHubReleaseNotesIncludeCurrent,
  hasUnseenHubReleaseNotes,
  hubReleaseNoteActivityAt,
  hubReleaseSummaryIsRedundant,
  markHubReleaseNotesSeen,
  normalizeReleaseNotesVersion,
  parseHubReleaseNotesPayload,
  readHubReleaseNotesSeen,
  type HubReleaseNoteEntry,
  type HubReleaseNoteKind,
} from "../lib/hub-version-release-notes-core";

/** Module cache — fetch `/release-notes.json` once per page, lazily on first open. */
let hubReleaseNotesCache: HubReleaseNoteEntry[] | null = null;
let hubReleaseNotesPromise: Promise<HubReleaseNoteEntry[]> | null = null;

function loadHubReleaseNotes(): Promise<HubReleaseNoteEntry[]> {
  if (hubReleaseNotesCache) return Promise.resolve(hubReleaseNotesCache);
  if (!hubReleaseNotesPromise) {
    hubReleaseNotesPromise = fetch(HUB_RELEASE_NOTES_URL, { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((json) => {
        hubReleaseNotesCache = parseHubReleaseNotesPayload(json);
        return hubReleaseNotesCache;
      })
      .catch(() => {
        hubReleaseNotesPromise = null;
        return [];
      });
  }
  return hubReleaseNotesPromise;
}

function releaseSectionId(version: string, index: number) {
  const slug = version.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "ver";
  return `release-${slug}-${index}`;
}

function entryMatchesQuery(entry: HubReleaseNoteEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [
    entry.version,
    entry.date,
    entry.title,
    entry.userTitle,
    entry.userSummary,
    entry.kind,
    ...entry.bullets,
    ...entry.userHighlights,
  ]
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

const KIND_META: Record<
  HubReleaseNoteKind,
  { label: string; Icon: LucideIcon; className: string; chip: string }
> = {
  new: {
    label: "New",
    Icon: Sparkles,
    className: "text-emerald-300",
    chip: "border-emerald-400/35 bg-emerald-500/15 text-emerald-100",
  },
  improve: {
    label: "Update",
    Icon: Zap,
    className: "text-violet-300",
    chip: "border-violet-400/40 bg-violet-500/15 text-violet-100",
  },
  fix: {
    label: "Fixed",
    Icon: Wrench,
    className: "text-amber-300",
    chip: "border-amber-400/35 bg-amber-500/15 text-amber-100",
  },
};

/** Kind badge — primary change type for the release (before version + age). */
function ReleaseKindBadge({ kind }: { kind: HubReleaseNoteKind }) {
  const meta = KIND_META[kind];
  const Icon = meta.Icon;
  return (
    <span
      className={`hub-release-kind-badge inline-flex shrink-0 items-center gap-1 rounded-md border px-1.5 py-0.5 font-semibold tracking-wide ${meta.chip}`}
    >
      <Icon size={12} className={meta.className} aria-hidden />
      {meta.label}
    </span>
  );
}

function freshnessTocIcon(isLatest: boolean) {
  if (isLatest) {
    return <CheckCircle2 size={14} className="text-emerald-400" aria-hidden />;
  }
  return <RefreshCw size={14} className="text-indigo-300/90" aria-hidden />;
}

/** Drop stub / version-echo titles — headline only when it adds meaning. */
function releaseHeadline(entry: HubReleaseNoteEntry): string | null {
  const raw = (entry.userTitle || entry.title).trim();
  if (!raw) return null;
  if (/^release\s+v?[\d.]+$/i.test(raw)) return null;
  if (raw.toLowerCase() === `v${entry.version}`.toLowerCase()) return null;
  if (raw.toLowerCase() === entry.version.toLowerCase()) return null;
  return raw;
}

/** Version + activity age — hub header chrome scale (`vX.Y.Z` · dot · `2h ago`). */
function ReleaseVersionMeta({ version, date, at }: { version: string; date: string; at?: string }) {
  const activityAt = hubReleaseNoteActivityAt(date, at);
  return (
    <div className="hub-release-version-meta app-tab-header__chrome-text inline-flex min-w-0 flex-wrap items-center gap-1.5 text-[var(--muted)]">
      <span className="truncate font-semibold tabular-nums tracking-tight text-[var(--text)]/90">
        v{version}
      </span>
      {activityAt ? (
        <HubChromeActivityAge at={activityAt} />
      ) : date ? (
        <span className="tabular-nums text-[var(--text)]/90">{date}</span>
      ) : null}
    </div>
  );
}

function ReleaseTimelineCard({ entry }: { entry: HubReleaseNoteEntry }) {
  const headline = releaseHeadline(entry);
  const lines = entry.userHighlights.length ? entry.userHighlights : entry.bullets;
  const showSummary =
    Boolean(entry.userSummary) &&
    !hubReleaseSummaryIsRedundant(entry.userSummary, headline ?? "", lines);

  return (
    <article className="hub-release-timeline-card">
      <div className="hub-release-timeline-card__head app-tab-header__chrome-text">
        <ReleaseKindBadge kind={entry.kind} />
        <ReleaseVersionMeta version={entry.version} date={entry.date} at={entry.at} />
        {headline ? (
          <span className="hub-release-headline min-w-0 truncate font-semibold text-[var(--text)]">
            {headline}
          </span>
        ) : null}
      </div>
      <div className="app-tab-header__chrome-text mt-2 space-y-1.5">
        {showSummary ? <p className="leading-snug text-[var(--muted)]">{entry.userSummary}</p> : null}
        {lines.length ? (
          <ul className="space-y-1">
            {lines.map((line) => (
              <li key={line} className="flex items-start gap-1.5 leading-snug text-[var(--muted)]">
                <span
                  className="mt-[5px] inline-block h-1 w-1 shrink-0 rounded-full bg-cyan-300/50"
                  aria-hidden
                />
                <span className="min-w-0">{line}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </article>
  );
}

export type HubVersionReleaseNotesProps = {
  /** Tool code — scopes the localStorage seen key (`hub:release-notes-seen:<code>`). */
  code: string;
  /** Current app version, with or without leading `v`. */
  version: string;
  /**
   * Hub tab version activity stamp (CHANGELOG Timestamp / builtAt).
   * Used for Latest stub + modal header age so it matches chrome `Xh ago`.
   */
  publishedAt?: string | null;
  className?: string;
  /**
   * Web/PWA: bundled assets behind the running tab — single header icon SSOT
   * (Download) instead of a second HubVersionUpdateStatusIcon.
   */
  bundleStale?: boolean;
  onBundleReload?: () => void;
};

/**
 * Update Release — Layout 2 TOC + V1 timeline (User copy).
 * Hub trigger = Latest/Update status icons (not scroll glyph).
 * Cards = kind badge → version + age → optional headline (no per-row Latest/Update).
 */
export function HubVersionReleaseNotes({
  code,
  version,
  publishedAt = null,
  className = "",
  bundleStale = false,
  onBundleReload,
}: HubVersionReleaseNotesProps) {
  const [open, setOpen] = useState(false);
  const [entries, setEntries] = useState<HubReleaseNoteEntry[] | null>(hubReleaseNotesCache);
  const [query, setQuery] = useState("");
  const [unseen, setUnseen] = useState(() =>
    hasUnseenHubReleaseNotes(version, readHubReleaseNotesSeen(code)),
  );

  const currentVersion = normalizeReleaseNotesVersion(version);

  useEffect(() => {
    if (!open) return;
    markHubReleaseNotesSeen(code, version);
    setUnseen(false);
  }, [open, code, version]);

  useEffect(() => {
    if (!open || entries !== null) return;
    let alive = true;
    void loadHubReleaseNotes().then((list) => {
      if (alive) setEntries(list);
    });
    return () => {
      alive = false;
    };
  }, [open, entries]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const resolvedEntries = useMemo(() => {
    if (!entries) return null;
    return ensureHubReleaseNotesIncludeCurrent(entries, currentVersion, publishedAt);
  }, [entries, currentVersion, publishedAt]);

  const filtered = useMemo(() => {
    if (!resolvedEntries) return null;
    return resolvedEntries.filter((entry) => entryMatchesQuery(entry, query));
  }, [resolvedEntries, query]);

  const { tocItems, sectionIds, body } = useMemo(() => {
    const toc: HubTocNavItem[] = [];
    const ids: string[] = [];
    const sections: ReactNode[] = [];
    const fallbackIcon = <RefreshCw size={14} className="text-indigo-300" aria-hidden />;

    if (filtered === null) {
      const id = "release-loading";
      toc.push({ id, label: "Recent", icon: fallbackIcon });
      ids.push(id);
      sections.push(
        <HubToolDetailSection key={id} id={id} title="Recent" icon={fallbackIcon} hideHeader>
          <div className="rounded-lg border border-dashed border-white/10 px-3 py-5 text-center text-[var(--muted)] app-tab-header__chrome-text">
            Loading…
          </div>
        </HubToolDetailSection>,
      );
      return { tocItems: toc, sectionIds: ids, body: sections };
    }

    if (filtered.length === 0) {
      const id = "release-empty";
      toc.push({ id, label: "Recent", icon: fallbackIcon });
      ids.push(id);
      sections.push(
        <HubToolDetailSection key={id} id={id} title="Recent" icon={fallbackIcon} hideHeader>
          <div className="rounded-lg border border-dashed border-white/10 px-3 py-5 text-center text-[var(--muted)] app-tab-header__chrome-text">
            {resolvedEntries?.length
              ? "No release notes match the current search."
              : "No release notes yet."}
          </div>
        </HubToolDetailSection>,
      );
      return { tocItems: toc, sectionIds: ids, body: sections };
    }

    for (let index = 0; index < filtered.length; index++) {
      const entry = filtered[index]!;
      const id = releaseSectionId(entry.version, index);
      const isLatest = entry.version === currentVersion || (index === 0 && !currentVersion);
      const label = `v${entry.version}`;
      toc.push({ id, label, icon: freshnessTocIcon(isLatest) });
      ids.push(id);
      sections.push(
        <HubToolDetailSection key={id} id={id} title={label} hideHeader>
          <div className="hub-release-timeline-item">
            <div className="hub-release-timeline-rail" aria-hidden>
              <span className="hub-release-timeline-dot" />
              {index < filtered.length - 1 ? <span className="hub-release-timeline-line" /> : null}
            </div>
            <ReleaseTimelineCard entry={entry} />
          </div>
        </HubToolDetailSection>,
      );
    }

    return { tocItems: toc, sectionIds: ids, body: sections };
  }, [currentVersion, filtered, resolvedEntries?.length]);

  const headerEntry = resolvedEntries?.[0];
  const triggerTitle = bundleStale
    ? `Older bundle — reload for v${currentVersion || version}`
    : unseen
      ? "Update available — open release notes"
      : "You are on the latest version — open release notes";
  const TriggerIcon = bundleStale ? Download : unseen ? RefreshCw : CheckCircle2;
  const triggerIconClass = bundleStale
    ? "text-amber-300"
    : unseen
      ? "text-amber-300"
      : "text-emerald-400";

  return (
    <span className={`relative inline-flex shrink-0 items-center ${className}`.trim()}>
      <button
        type="button"
        aria-haspopup={bundleStale ? undefined : "dialog"}
        aria-expanded={bundleStale ? undefined : open}
        title={triggerTitle}
        aria-label={triggerTitle}
        onClick={() => {
          if (bundleStale) {
            if (onBundleReload) onBundleReload();
            else window.location.reload();
            return;
          }
          setOpen(true);
        }}
        className="relative inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm transition-opacity hover:opacity-90"
      >
        <TriggerIcon size={compactIconSize(13)} className={`shrink-0 ${triggerIconClass}`} aria-hidden />
      </button>

      <HubToolDetailModal
        open={open}
        onClose={() => setOpen(false)}
        ariaLabel="Update Release"
        headerTrailing={
          <div className="hub-release-header-version app-tab-header__chrome-text">
            <ReleaseVersionMeta
              version={currentVersion || headerEntry?.version || "—"}
              date={headerEntry?.date || ""}
              at={headerEntry?.at || publishedAt || undefined}
            />
          </div>
        }
        headerCenter={
          <HubActivityFeedToolbar
            query={query}
            onQueryChange={setQuery}
            kindFilter="all"
            onKindFilterChange={() => undefined}
            showKindFilters={false}
            searchPlaceholder="Search releases…"
            variant="header"
          />
        }
        shellClassName="hub-header-panel-modal hub-release-notes-modal"
        sectionIds={sectionIds}
        toc={
          <div className="hub-toc-nav">
            <HubTocSectionNav items={tocItems} scrollRootSelector={HUB_TOOL_DETAIL_SCROLL_ROOT} />
          </div>
        }
      >
        <div className={`${HUB_TOOL_DETAIL_SECTIONS_CLASS} hub-release-timeline`}>{body}</div>
      </HubToolDetailModal>
    </span>
  );
}
