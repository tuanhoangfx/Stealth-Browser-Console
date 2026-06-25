import { useEffect, useMemo, useState } from "react";
import { ClipboardList, Copy, Hash, ListOrdered, User, UserPlus } from "lucide-react";
import {
  HubAlert,
  HubTocSectionNav,
  HubToolDetailModal,
  HubToolDetailModalPrimaryAction,
  HubToolDetailModalSecondaryAction,
  HubToolDetailSection,
  HUB_TOOL_DETAIL_SCROLL_ROOT,
  HUB_TOOL_DETAIL_SECTIONS_CLASS,
  HUB_TOOL_DETAIL_FORM_GRID_3_CLASS,
  KpiStrip,
  type KpiTileData,
} from "@tool-workspace/hub-ui";
import { deviceConfigFromDefaults, defaultStartupUrlFromPrefs } from "../../lib/stealth-app-prefs";
import { resolveStartupUrlSave, startupUrlSaveError } from "../../lib/startup-url";
import { createProfile as apiCreateProfile, fetchProfilesAndGroups } from "../../api";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";
import { randomFingerprintSeed } from "../../lib/stealth-profile-utils";
import type { DeviceConfig, ProfileRow } from "../../types";
import { useAppToast } from "../../components/toast";
import { ProfileFormFields } from "./ProfileFormFields";
import { ProfileBasicsFields } from "./ProfileBasicsFields";
import { ProfileFormModalLayout } from "./ProfileFormModalLayout";
import { profileFormTocItems } from "./profile-form-toc";
import { PROFILE_FORM_MODAL_SHELL_CLASS } from "./profile-form-modal";
import { extractProfileCode } from "./profile-directory-search";
import type { ProfileActivityLogEntry } from "./profile-run-log";

type CreateProfileTab = "single" | "bulk";
type BulkCreateMode = "names" | "range";

const CREATE_PROFILE_TABS = [
  { id: "single", label: "Single", emoji: "🧍" },
  { id: "bulk", label: "Bulk", emoji: "📦" },
] as const;

const BULK_MODE_ITEMS = [
  { id: "range", label: "Number range", emoji: "🔢" },
  { id: "names", label: "Name list", emoji: "📝" },
] as const satisfies readonly { id: BulkCreateMode; label: string; emoji: string }[];

/** Bulk number range — profile names are always zero-padded to 4 digits (0000). */
const BULK_RANGE_PAD = 4;

function formatBulkKpiHint(samples: string[], total: number): string | undefined {
  if (!total) return undefined;
  const head = samples.slice(0, 4);
  if (!head.length) return undefined;
  const text = head.join(", ");
  const rest = total - head.length;
  return rest > 0 ? `${text} +${rest}` : text;
}

function ProfileCreateModalToc({
  tab,
  onTabChange,
  bulkMode,
  onBulkModeChange,
  singleTocItems,
}: {
  tab: CreateProfileTab;
  onTabChange: (tab: CreateProfileTab) => void;
  bulkMode: BulkCreateMode;
  onBulkModeChange: (mode: BulkCreateMode) => void;
  singleTocItems: ReturnType<typeof profileFormTocItems>;
}) {
  return (
    <nav className="hub-toc-nav hub-add-modal__toc stealth-profile-create-toc" aria-label="Add mode">
      <ul className="hub-toc-nav__list space-y-0.5" role="tablist">
        {CREATE_PROFILE_TABS.map((item) => {
          const active = tab === item.id;
          const isBulk = item.id === "bulk";
          return (
            <li key={item.id} className={isBulk ? "stealth-profile-create-toc__branch" : undefined}>
              <button
                type="button"
                role="tab"
                aria-selected={active}
                aria-expanded={isBulk ? active : undefined}
                className={`hub-toc-nav__item group relative z-[1] min-h-[var(--overview-toc-row-h,2rem)] w-full cursor-pointer text-left text-[13px] transition-colors${
                  active ? " is-active" : ""
                }`}
                onClick={() => onTabChange(item.id)}
              >
                <span className="hub-toc-nav__label flex min-w-0 items-center gap-1.5 truncate rounded-lg px-2 py-1 font-medium text-[var(--muted)] transition-all duration-200 group-hover:text-[var(--text)]">
                  <span className="shrink-0 text-[12px] leading-none opacity-90" aria-hidden>
                    {item.emoji}
                  </span>
                  <span className="truncate">{item.label}</span>
                </span>
              </button>
              {isBulk && active ? (
                <ul
                  className="stealth-profile-create-toc__children"
                  role="group"
                  aria-label="Bulk source mode"
                >
                  {BULK_MODE_ITEMS.map((modeItem) => {
                    const modeActive = bulkMode === modeItem.id;
                    return (
                      <li key={modeItem.id}>
                        <button
                          type="button"
                          className={`hub-toc-nav__item group relative z-[1] w-full cursor-pointer text-left text-[12px] transition-colors${
                            modeActive ? " is-active" : ""
                          }`}
                          aria-current={modeActive ? "true" : undefined}
                          onClick={() => {
                            onTabChange("bulk");
                            onBulkModeChange(modeItem.id);
                          }}
                        >
                          <span className="hub-toc-nav__label flex min-w-0 items-center gap-1.5 truncate rounded-lg py-1 pl-1.5 pr-2 font-medium text-[var(--muted)] transition-all duration-200 group-hover:text-[var(--text)]">
                            <span className="shrink-0 text-[11px] leading-none opacity-90" aria-hidden>
                              {modeItem.emoji}
                            </span>
                            <span className="truncate">{modeItem.label}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </li>
          );
        })}
      </ul>
      {tab === "single" ? (
        <div className="hub-add-modal__toc-sections mt-3 border-t border-white/5 pt-3">
          <HubTocSectionNav items={singleTocItems} scrollRootSelector={HUB_TOOL_DETAIL_SCROLL_ROOT} />
        </div>
      ) : (
        <div className="hub-add-modal__toc-sections mt-3 border-t border-white/5 pt-3" aria-hidden />
      )}
    </nav>
  );
}

type BulkPreview = {
  requested: number;
  createNames: string[];
  skippedNames: string[];
  duplicateNames: string[];
  error: string | null;
};

function buildExistingProfileIndexes(profiles: ProfileRow[]) {
  const exactNames = new Set<string>();
  const numericCodes = new Set<string>();
  for (const profile of profiles) {
    const name = String(profile.name || "").trim();
    if (!name) continue;
    exactNames.add(name);
    numericCodes.add(extractProfileCode(name, profile.id));
  }
  return { exactNames, numericCodes };
}

function parseBulkNameLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("//"));
}

function previewBulkNames(text: string, profiles: ProfileRow[]): BulkPreview {
  const { exactNames, numericCodes } = buildExistingProfileIndexes(profiles);
  const createNames: string[] = [];
  const skippedNames: string[] = [];
  const duplicateNames: string[] = [];
  const seen = new Set<string>();
  const parsed = parseBulkNameLines(text);

  for (const name of parsed) {
    if (seen.has(name)) {
      duplicateNames.push(name);
      continue;
    }
    seen.add(name);
    const numericOnly = /^\d{1,8}$/.test(name);
    const numericCode = numericOnly ? String(name).padStart(4, "0") : null;
    if (exactNames.has(name) || (numericCode && numericCodes.has(numericCode))) {
      skippedNames.push(name);
      continue;
    }
    createNames.push(name);
  }

  return {
    requested: parsed.length,
    createNames,
    skippedNames,
    duplicateNames,
    error: null,
  };
}

function previewBulkRange(startText: string, endText: string, profiles: ProfileRow[]): BulkPreview {
  const start = Number(startText);
  const end = Number(endText);
  const pad = BULK_RANGE_PAD;
  if (!Number.isInteger(start) || start < 0) {
    return { requested: 0, createNames: [], skippedNames: [], duplicateNames: [], error: "Range start must be a non-negative integer." };
  }
  if (!Number.isInteger(end) || end < 0) {
    return { requested: 0, createNames: [], skippedNames: [], duplicateNames: [], error: "Range end must be a non-negative integer." };
  }
  if (start > end) {
    return { requested: 0, createNames: [], skippedNames: [], duplicateNames: [], error: "Range start must be less than or equal to range end." };
  }
  const requested = end - start + 1;
  if (requested > 50_000) {
    return { requested: 0, createNames: [], skippedNames: [], duplicateNames: [], error: "Range is too large. Maximum 50,000 profiles per bulk create." };
  }

  const { exactNames, numericCodes } = buildExistingProfileIndexes(profiles);
  const createNames: string[] = [];
  const skippedNames: string[] = [];
  for (let value = start; value <= end; value += 1) {
    const name = String(value).padStart(pad, "0");
    const numericCode = String(value).padStart(4, "0");
    if (exactNames.has(name) || numericCodes.has(numericCode)) {
      skippedNames.push(name);
      continue;
    }
    createNames.push(name);
  }

  return { requested, createNames, skippedNames, duplicateNames: [], error: null };
}

export function CreateProfileModal({
  onClose,
  onProfilesChanged,
}: {
  onClose: () => void;
  onProfilesChanged?: () => void;
}) {
  const { createProfile, groups, refreshProfiles } = useProfilesRuntime();
  const { pushToast } = useAppToast();
  const [existingProfiles, setExistingProfiles] = useState<ProfileRow[]>([]);
  const [tab, setTab] = useState<CreateProfileTab>("single");
  const [name, setName] = useState("");
  const [groupId, setGroupId] = useState("default");
  const [proxy, setProxy] = useState("");
  const [note, setNote] = useState("");
  const [fingerprintSeed, setFingerprintSeed] = useState(() => randomFingerprintSeed());
  const [device, setDevice] = useState<DeviceConfig>(() => deviceConfigFromDefaults());
  const [startupUrl, setStartupUrl] = useState(() => defaultStartupUrlFromPrefs());
  const [bulkMode, setBulkMode] = useState<BulkCreateMode>("range");
  const [bulkNamesText, setBulkNamesText] = useState("");
  const [rangeStart, setRangeStart] = useState("0");
  const [rangeEnd, setRangeEnd] = useState("100");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [bulkActivityLog, setBulkActivityLog] = useState<ProfileActivityLogEntry[]>([]);

  const tocItems = useMemo(() => profileFormTocItems(), []);
  const singleSectionIds = useMemo(() => tocItems.map((item) => item.id), [tocItems]);
  const sectionIds = tab === "single" ? singleSectionIds : [];
  useEffect(() => {
    void fetchProfilesAndGroups()
      .then((data) => setExistingProfiles(data.profiles))
      .catch(() => setExistingProfiles([]));
  }, []);
  const bulkPreview = useMemo(
    () =>
      bulkMode === "names"
        ? previewBulkNames(bulkNamesText, existingProfiles)
        : previewBulkRange(rangeStart, rangeEnd, existingProfiles),
    [bulkMode, bulkNamesText, existingProfiles, rangeEnd, rangeStart],
  );

  const bulkPreviewKpis = useMemo((): KpiTileData[] => {
    const { requested, createNames, skippedNames, duplicateNames } = bulkPreview;
    return [
      {
        prefKey: "requested",
        label: "Requested",
        value: requested,
        icon: Hash,
        tone: "indigo",
      },
      {
        prefKey: "create",
        label: "Create",
        value: createNames.length,
        icon: UserPlus,
        tone: "emerald",
        hint: formatBulkKpiHint(createNames, createNames.length),
      },
      {
        prefKey: "existing",
        label: "Existing",
        value: skippedNames.length,
        icon: ListOrdered,
        tone: "amber",
        hint: formatBulkKpiHint(skippedNames, skippedNames.length),
      },
      {
        prefKey: "dupes",
        label: "Dup input",
        value: duplicateNames.length,
        icon: Copy,
        tone: "rose",
        hint: formatBulkKpiHint(duplicateNames, duplicateNames.length),
      },
    ];
  }, [bulkPreview]);

  const bulkDefaults = useMemo(
    () => ({
      groupId,
      proxy: proxy.trim(),
      note: note.trim(),
      startupUrl: resolveStartupUrlSave(startupUrl, ""),
      ...device,
    }),
    [device, groupId, note, proxy, startupUrl],
  );

  const save = () => {
    const urlError = startupUrlSaveError(startupUrl);
    if (urlError) {
      setError(urlError);
      return;
    }
    setBusy(true);
    setError("");
    void createProfile({
      name: name.trim(),
      groupId,
      proxy: proxy.trim(),
      note: note.trim(),
      fingerprintSeed,
      startupUrl: resolveStartupUrlSave(startupUrl, ""),
      ...device
    })
      .then(() => {
        onProfilesChanged?.();
        onClose();
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Create failed"))
      .finally(() => setBusy(false));
  };

  const saveBulk = () => {
    const urlError = startupUrlSaveError(startupUrl);
    if (urlError) {
      setError(urlError);
      return;
    }
    if (bulkPreview.error) {
      setError(bulkPreview.error);
      return;
    }
    if (!bulkPreview.createNames.length) {
      setError("No new profiles to create.");
      return;
    }

    const names = [...bulkPreview.createNames];
    setBusy(true);
    setError("");
    setBulkActivityLog([]);

    void (async () => {
      let created = 0;
      let failed = 0;

      for (const profileName of names) {
        const startedAt = new Date().toISOString();
        const runningId = `bulk-run-${profileName}-${startedAt}`;
        setBulkActivityLog((prev) => [
          ...prev,
          {
            id: runningId,
            status: "running",
            startedAt,
            message: `Creating "${profileName}"…`,
          },
        ]);

        try {
          await apiCreateProfile({
            name: profileName,
            fingerprintSeed: randomFingerprintSeed(),
            ...bulkDefaults,
          });
          const finishedAt = new Date().toISOString();
          created += 1;
          setBulkActivityLog((prev) =>
            prev.map((entry) =>
              entry.id === runningId
                ? {
                    ...entry,
                    status: "success",
                    finishedAt,
                    message: `Created profile "${profileName}"`,
                  }
                : entry,
            ),
          );
        } catch (err: unknown) {
          const finishedAt = new Date().toISOString();
          const message = err instanceof Error ? err.message : "Create failed";
          failed += 1;
          setBulkActivityLog((prev) =>
            prev.map((entry) =>
              entry.id === runningId
                ? {
                    ...entry,
                    status: "failed",
                    finishedAt,
                    message: `Failed "${profileName}": ${message}`,
                  }
                : entry,
            ),
          );
        }
      }

      try {
        const data = await fetchProfilesAndGroups();
        setExistingProfiles(data.profiles);
      } catch {
        // Preview refresh is best-effort; directory reload still runs below.
      }

      await refreshProfiles();
      onProfilesChanged?.();

      if (failed > 0) {
        pushToast(
          `Bulk create finished: ${created} created, ${failed} failed.`,
          created > 0 ? "warn" : "error",
        );
      } else {
        pushToast(`Created ${created} profile${created === 1 ? "" : "s"}.`, "success");
      }
    })()
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Bulk create failed"))
      .finally(() => setBusy(false));
  };

  const bulkBody = (
    <div className={`${HUB_TOOL_DETAIL_SECTIONS_CLASS} stealth-profile-create-modal__bulk-sections`}>
          <HubToolDetailSection
            id="bulk-source"
            title="Source"
            icon={bulkMode === "names" ? <ClipboardList size={14} className="text-indigo-300" aria-hidden /> : <Hash size={14} className="text-violet-300" aria-hidden />}
          >
            {bulkMode === "names" ? (
              <textarea
                className="field stealth-profile-bulk-names-input w-full resize-y font-mono text-[12px]"
                placeholder={`0000\n0001\nfacebook-main`}
                value={bulkNamesText}
                onChange={(event) => setBulkNamesText(event.target.value)}
              />
            ) : (
              <div className={`${HUB_TOOL_DETAIL_FORM_GRID_3_CLASS} stealth-settings-form stealth-settings-form--3`}>
                <label className="block min-w-0">
                  <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">From</span>
                  <input
                    className="field h-[var(--hub-control-h)] w-full font-mono text-xs"
                    inputMode="numeric"
                    value={rangeStart}
                    onChange={(event) => setRangeStart(event.target.value.replace(/\D/g, ""))}
                    placeholder="0000"
                  />
                </label>
                <label className="block min-w-0">
                  <span className="mb-1 block text-xs font-semibold text-[var(--muted)]">To</span>
                  <input
                    className="field h-[var(--hub-control-h)] w-full font-mono text-xs"
                    inputMode="numeric"
                    value={rangeEnd}
                    onChange={(event) => setRangeEnd(event.target.value.replace(/\D/g, ""))}
                    placeholder="0100"
                  />
                </label>
              </div>
            )}
          </HubToolDetailSection>

          <HubToolDetailSection id="bulk-preview" title="Preview" icon={<ClipboardList size={14} className="text-emerald-300" aria-hidden />}>
            <KpiStrip items={bulkPreviewKpis} className="stealth-profile-bulk-preview-kpi" />
          </HubToolDetailSection>

          <HubToolDetailSection id="bulk-profile" title="Profile" icon={<User size={14} className="text-indigo-300" aria-hidden />}>
            <ProfileBasicsFields
              showName={false}
              groupId={groupId}
              setGroupId={setGroupId}
              proxy={proxy}
              setProxy={setProxy}
              startupUrl={startupUrl}
              setStartupUrl={setStartupUrl}
              groups={groups}
            />
          </HubToolDetailSection>
    </div>
  );

  return (
    <HubToolDetailModal
      open
      headerIcon={UserPlus}
      headerIconClassName="text-indigo-200"
      title="New profile"
      onClose={onClose}
      shellClassName={PROFILE_FORM_MODAL_SHELL_CLASS}
      sectionIds={sectionIds}
      scrollRootSelector={HUB_TOOL_DETAIL_SCROLL_ROOT}
      toc={
        <ProfileCreateModalToc
          tab={tab}
          onTabChange={setTab}
          bulkMode={bulkMode}
          onBulkModeChange={setBulkMode}
          singleTocItems={tocItems}
        />
      }
      footer={
        <>
          <HubToolDetailModalSecondaryAction label="Cancel" onClick={onClose} disabled={busy} />
          {tab === "single" ? (
            <HubToolDetailModalPrimaryAction label="Create profile" onClick={save} disabled={busy || !name.trim()} busy={busy} />
          ) : (
            <HubToolDetailModalPrimaryAction
              label={bulkPreview.createNames.length ? `Create missing (${bulkPreview.createNames.length})` : "Create missing"}
              onClick={saveBulk}
              disabled={busy || Boolean(bulkPreview.error) || !bulkPreview.createNames.length}
              busy={busy}
            />
          )}
        </>
      }
    >
      {error ? <HubAlert tone="danger">{error}</HubAlert> : null}
      <ProfileFormModalLayout
        note={note}
        onNoteChange={setNote}
        logFilterStorageKey="__create__"
        activityLogEntries={tab === "bulk" ? bulkActivityLog : undefined}
        logEmptyHint={
          tab === "single"
            ? "Activity log appears after the profile is created."
            : busy
              ? "Creating profiles…"
              : "Activity log appears as each profile is created."
        }
        notePlaceholder={tab === "bulk" ? "Optional note applied to all created profiles" : undefined}
      >
        <div className="stealth-profile-create-tab-panels">
          <div
            className={`stealth-profile-create-tab-panel${tab === "single" ? " is-active" : ""}`}
            aria-hidden={tab !== "single"}
          >
            <ProfileFormFields
              layout="hub-sections"
              name={name}
              setName={setName}
              groupId={groupId}
              setGroupId={setGroupId}
              proxy={proxy}
              setProxy={setProxy}
              fingerprintSeed={fingerprintSeed}
              setFingerprintSeed={setFingerprintSeed}
              device={device}
              onDeviceChange={(patch) => setDevice((d) => ({ ...d, ...patch }))}
              startupUrl={startupUrl}
              setStartupUrl={setStartupUrl}
              groups={groups}
            />
          </div>
          <div
            className={`stealth-profile-create-tab-panel${tab === "bulk" ? " is-active" : ""}`}
            aria-hidden={tab !== "bulk"}
          >
            {bulkBody}
          </div>
        </div>
      </ProfileFormModalLayout>
    </HubToolDetailModal>
  );
}
