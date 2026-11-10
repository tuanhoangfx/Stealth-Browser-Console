import { useMemo, useState } from "react";
import { Camera, Download, ExternalLink, RotateCcw, Save, Smartphone, Upload } from "lucide-react";
import {
  HubAccountDetailAdmScaffold,
  HubAccountDetailHeaderSearch,
  HubAccountDetailSearchProvider,
  HubAdmNoteRail,
  HubAdmPlainRelativeTime,
  HubAdmReadonlyField,
  HubAdmRecordMetaRow,
  HubAdmSectionBlock,
  HubAlert,
  HubCopyBadge,
  HubDirectoryBrandNameCell,
  HubToolDetailModal,
  HubToolDetailModalAccountFooter,
  HubToolDetailModalSecondaryAction,
  HubToolDetailRail,
  HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT,
  HUB_ACCOUNT_DETAIL_NAVIGATE_EMOJI,
  HUB_ADM_TYPE_MONO_CLASS,
  HUB_DETAIL_MODAL_RESET_LABEL,
  HUB_DETAIL_MODAL_SAVE_LABEL,
  HUB_DETAIL_MODAL_SAVING_LABEL,
} from "@tool-workspace/hub-ui";
import { stealthProfileColumnHintContent } from "../../lib/stealth-directory-column-hints";
import { PROFILE_EDIT_MODAL_SHELL_CLASS } from "../profiles/profile-form-modal";
import { PROFILE_DETAIL_FORM_ROW_ALIGNED_3 } from "../profiles/ProfileDetailField";
import { ProfileDetailLogRail } from "../profiles/ProfileDetailLogRail";
import { ProfileDetailTocNav } from "../profiles/ProfileDetailTocNav";
import type { MobileProfileRow } from "../../views/AndroidProfilesView";

const SECTION_IDENTITY = "android-detail-identity";
const SECTION_TELEMETRY = "android-detail-telemetry";
const SECTION_SYNC = "android-detail-sync";
const SECTION_NOTE = "android-detail-note";
const SECTION_LOG = "android-detail-log";

export type AndroidProfileDetailModalProps = {
  profile: MobileProfileRow;
  pcProfileName?: string;
  onClose: () => void;
  onSaveProfile: (
    code: string,
    patch: {
      manufacturer: string;
      model: string;
      glRenderer: string;
      customNote: string;
      autoSync: boolean;
    },
  ) => Promise<void>;
  onMountPhone: (code: string) => Promise<void>;
  onPushCookies: (code: string) => Promise<void>;
  onPullCookies: (code: string) => Promise<void>;
  onSaveSnapshot: (code: string) => Promise<void>;
  onOpenPcBrowser?: (code: string) => void;
  busy?: boolean;
};

export function AndroidProfileDetailModal({
  profile,
  pcProfileName,
  onClose,
  onSaveProfile,
  onMountPhone,
  onPushCookies,
  onPullCookies,
  onSaveSnapshot,
  onOpenPcBrowser,
  busy = false,
}: AndroidProfileDetailModalProps) {
  const [baseline, setBaseline] = useState(() => ({
    customNote: profile.customNote || "",
    autoSync: Boolean(profile.autoSync),
  }));
  const [customNote, setCustomNote] = useState(baseline.customNote);
  const [autoSync, setAutoSync] = useState(baseline.autoSync);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [logRailFocused, setLogRailFocused] = useState(false);

  const dirty =
    customNote !== baseline.customNote ||
    autoSync !== baseline.autoSync;

  const sectionIds = useMemo(
    () => [SECTION_IDENTITY, SECTION_TELEMETRY, SECTION_SYNC, SECTION_NOTE, SECTION_LOG],
    [],
  );

  const tocItems = useMemo(
    () => [
      { id: SECTION_IDENTITY, label: "Pinned Device (1:1)", emoji: "📱" },
      { id: SECTION_TELEMETRY, label: "Spoofed IDs", emoji: "🆔" },
      { id: SECTION_SYNC, label: "Cookie & Vault Sync", emoji: "🍪" },
      { id: SECTION_NOTE, label: "Note", emoji: "✍️" },
      { id: SECTION_LOG, label: "Activity Log", emoji: "📜" },
    ],
    [],
  );

  const handleReset = () => {
    setCustomNote(baseline.customNote);
    setAutoSync(baseline.autoSync);
    setError("");
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      await onSaveProfile(profile.code, {
        manufacturer: profile.manufacturer || "Google",
        model: profile.model || "Pixel 8 Pro",
        glRenderer: profile.glRenderer || "Mali-G715-Immortalis MC11",
        customNote,
        autoSync,
      });
      setBaseline({ customNote, autoSync });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save Android profile settings");
    } finally {
      setSaving(false);
    }
  };

  const anyBusy = busy || saving;
  const displayName = pcProfileName || `#${profile.code}`;

  return (
    <HubAccountDetailSearchProvider>
      <HubToolDetailModal
        open
        onClose={onClose}
        title={`Android Detail · #${profile.code}`}
        titleId="android-profile-detail-title"
        headerIcon={Smartphone}
        headerIconClassName="text-emerald-300"
        headerCenter={<HubAccountDetailHeaderSearch />}
        headerTrailing={
          <span className="ml-2 shrink-0 text-xs font-medium text-emerald-300">
            {profile.activeOnPhone ? "Mounted on Phone" : "Pinned 1:1 Vault"}
          </span>
        }
        shellClassName={PROFILE_EDIT_MODAL_SHELL_CLASS}
        sectionIds={sectionIds}
        scrollRootSelector={HUB_ACCOUNT_DETAIL_MAIN_SCROLL_ROOT}
        busy={anyBusy}
        toc={
          <HubToolDetailRail
            title="Navigate"
            titleEmoji={HUB_ACCOUNT_DETAIL_NAVIGATE_EMOJI}
            className="twofa-adm-rail--toc stealth-profile-detail-toc-rail"
            scroll={false}
            ariaLabel="Sections"
          >
            <ProfileDetailTocNav items={tocItems} onLogFocus={() => setLogRailFocused(true)} />
          </HubToolDetailRail>
        }
        footer={
          <HubToolDetailModalAccountFooter
            onClose={onClose}
            onSave={() => void handleSave()}
            saveLabel={HUB_DETAIL_MODAL_SAVE_LABEL}
            saveBusyLabel={HUB_DETAIL_MODAL_SAVING_LABEL}
            saveIcon={Save}
            saveDisabled={anyBusy || !dirty}
            busy={saving}
            leading={
              <>
                <HubToolDetailModalSecondaryAction
                  label={profile.activeOnPhone ? "Re-Mount Phone" : "Mount Phone"}
                  icon={Smartphone}
                  tone="emerald"
                  disabled={anyBusy}
                  onClick={() => void onMountPhone(profile.code)}
                />
                <HubToolDetailModalSecondaryAction
                  label="Push Cookies"
                  icon={Upload}
                  tone="sky"
                  disabled={anyBusy}
                  onClick={() => void onPushCookies(profile.code)}
                />
                <HubToolDetailModalSecondaryAction
                  label="Pull Cookies"
                  icon={Download}
                  tone="sky"
                  disabled={anyBusy}
                  onClick={() => void onPullCookies(profile.code)}
                />
                <HubToolDetailModalSecondaryAction
                  label="Snapshot"
                  icon={Camera}
                  disabled={anyBusy}
                  onClick={() => void onSaveSnapshot(profile.code)}
                />
                {onOpenPcBrowser ? (
                  <HubToolDetailModalSecondaryAction
                    label="Open PC Browser"
                    icon={ExternalLink}
                    disabled={anyBusy}
                    onClick={() => onOpenPcBrowser(profile.code)}
                  />
                ) : null}
                <HubToolDetailModalSecondaryAction
                  label={HUB_DETAIL_MODAL_RESET_LABEL}
                  icon={RotateCcw}
                  disabled={anyBusy || !dirty}
                  onClick={handleReset}
                />
              </>
            }
          />
        }
        ariaLabelledBy="android-profile-detail-title"
      >
        {error ? <HubAlert tone="danger">{error}</HubAlert> : null}
        <HubAccountDetailAdmScaffold
          panelId={SECTION_IDENTITY}
          panelTitle="Android Antidetect Profile"
          panelAdmSectionKey="profile"
          frameClassName="twofa-account-detail-modal__frame"
          panelClassName="twofa-account-detail__panel"
          main={
            <div className="twofa-adm-credentials-stack">
              <HubAdmRecordMetaRow
                createdHint={stealthProfileColumnHintContent("createdAt")}
                updatedHint={stealthProfileColumnHintContent("updated")}
                vaultId={
                  <HubCopyBadge
                    value={profile.code}
                    title="Copy 4-digit Profile Code"
                    className={`${HUB_ADM_TYPE_MONO_CLASS} hub-adm-type-mono`}
                  />
                }
                created={
                  profile.createdAt ? (
                    <HubAdmPlainRelativeTime at={profile.createdAt} />
                  ) : (
                    <span className="font-mono text-xs text-emerald-300">STRONG_INTEGRITY · PINNED 1:1</span>
                  )
                }
                updated={
                  profile.updatedAt ? (
                    <HubAdmPlainRelativeTime at={profile.updatedAt} />
                  ) : (
                    <span className="text-[var(--muted)]">—</span>
                  )
                }
              />

              <HubAdmSectionBlock
                id={SECTION_IDENTITY}
                label="Pinned Hardware Model & GPU (Locked 1:1 for Account Safety)"
                emoji="📱"
                sectionKey="device"
              >
                <div className={PROFILE_DETAIL_FORM_ROW_ALIGNED_3}>
                  <HubAdmReadonlyField
                    header={{ label: "Brand", headerEmoji: "📁" }}
                    valueLayout="inline"
                  >
                    <HubDirectoryBrandNameCell
                      label={profile.manufacturer || "Google"}
                      brandId={
                        String(profile.manufacturer || "").toLowerCase().includes("samsung")
                          ? "samsung"
                          : String(profile.manufacturer || "").toLowerCase().includes("google")
                            ? "google"
                            : undefined
                      }
                      fallbackGlyph="📱"
                    />
                  </HubAdmReadonlyField>
                  <HubAdmReadonlyField
                    header={{ label: "Device Model", headerEmoji: "📱" }}
                    valueLayout="inline"
                  >
                    <HubCopyBadge
                      value={profile.model}
                      title="Copy Device Model"
                      className="hub-adm-detail-value-text font-mono truncate"
                    />
                  </HubAdmReadonlyField>
                  <HubAdmReadonlyField
                    header={{ label: "GL Renderer (GPU)", headerEmoji: "🎮" }}
                    valueLayout="inline"
                  >
                    <HubCopyBadge
                      value={profile.glRenderer}
                      title="Copy GL Renderer"
                      className="hub-adm-detail-value-text font-mono truncate"
                    />
                  </HubAdmReadonlyField>
                </div>
              </HubAdmSectionBlock>

              <HubAdmSectionBlock
                id={SECTION_TELEMETRY}
                label="Deterministic Spoofed Telemetry (Locked 1:1)"
                emoji="🆔"
              >
                <div className={PROFILE_DETAIL_FORM_ROW_ALIGNED_3}>
                  <HubAdmReadonlyField
                    header={{ label: "Android_ID (SSAID)", headerEmoji: "🆔" }}
                    valueLayout="inline"
                  >
                    <HubCopyBadge
                      value={profile.androidId}
                      title="Copy Android_ID"
                      className="hub-adm-detail-value-text font-mono truncate"
                    />
                  </HubAdmReadonlyField>
                  <HubAdmReadonlyField
                    header={{ label: "IMEI (Luhn Valid)", headerEmoji: "📟" }}
                    valueLayout="inline"
                  >
                    <HubCopyBadge
                      value={profile.imei}
                      title="Copy IMEI"
                      className="hub-adm-detail-value-text font-mono truncate"
                    />
                  </HubAdmReadonlyField>
                  <HubAdmReadonlyField
                    header={{ label: "Hardware Serial", headerEmoji: "🔢" }}
                    valueLayout="inline"
                  >
                    <HubCopyBadge
                      value={profile.serialNo}
                      title="Copy Serial"
                      className="hub-adm-detail-value-text font-mono truncate"
                    />
                  </HubAdmReadonlyField>
                </div>
                <div className={PROFILE_DETAIL_FORM_ROW_ALIGNED_3}>
                  <HubAdmReadonlyField
                    header={{ label: "GSF_ID (Google Services)", headerEmoji: "🔐" }}
                    valueLayout="inline"
                  >
                    <HubCopyBadge
                      value={profile.gsfId}
                      title="Copy GSF_ID"
                      className="hub-adm-detail-value-text font-mono truncate"
                    />
                  </HubAdmReadonlyField>
                  <HubAdmReadonlyField
                    header={{ label: "GAID (Advertising ID)", headerEmoji: "🎯" }}
                    valueLayout="inline"
                  >
                    <HubCopyBadge
                      value={profile.gaid}
                      title="Copy GAID"
                      className="hub-adm-detail-value-text font-mono truncate"
                    />
                  </HubAdmReadonlyField>
                  <HubAdmReadonlyField
                    header={{ label: "Build Fingerprint", headerEmoji: "🧬" }}
                    valueLayout="inline"
                  >
                    <HubCopyBadge
                      value={profile.fingerprint}
                      title="Copy Build Fingerprint"
                      className="hub-adm-detail-value-text font-mono truncate"
                    />
                  </HubAdmReadonlyField>
                </div>
              </HubAdmSectionBlock>

              <HubAdmSectionBlock
                id={SECTION_SYNC}
                label="Cross-Platform Cookie & Vault Sync"
                emoji="🍪"
                blockClassName="hub-adm-section-block--status"
              >
                <div className={PROFILE_DETAIL_FORM_ROW_ALIGNED_3}>
                  <HubAdmReadonlyField
                    header={{ label: "PC ↔ Phone Cookies", headerEmoji: "🍪" }}
                    valueLayout="inline"
                  >
                    <span className="hub-adm-detail-value-text truncate">
                      {profile.cookieCount} cookies ({profile.services.join(", ") || "No services yet"})
                    </span>
                  </HubAdmReadonlyField>
                  <HubAdmReadonlyField
                    header={{ label: "App Data Snapshot", headerEmoji: "💾" }}
                    valueLayout="inline"
                  >
                    <span className="hub-adm-detail-value-text truncate">
                      {profile.hasSnapshot
                        ? `Ready (${Math.max(1, Math.round(profile.snapshotSizeBytes / 1024))} KB)`
                        : "Not captured yet"}
                    </span>
                  </HubAdmReadonlyField>
                  <HubAdmReadonlyField
                    header={{ label: "Auto-Sync on Close", headerEmoji: "⚡" }}
                    valueLayout="inline"
                  >
                    <button
                      type="button"
                      className={`btn ${autoSync ? "primary" : "secondary"} text-xs`}
                      onClick={() => setAutoSync((v) => !v)}
                    >
                      {autoSync ? "ON — Auto-Push Cookies" : "OFF — Manual Push"}
                    </button>
                  </HubAdmReadonlyField>
                </div>
              </HubAdmSectionBlock>
            </div>
          }
          rail={
            <div className="stealth-profile-detail-runtime-rail">
              <HubAdmNoteRail
                id={SECTION_NOTE}
                mode="editor"
                title="Note"
                titleEmoji="✍️"
                className="stealth-profile-adm-rail--note stealth-profile-detail-note-rail"
                value={customNote}
                onChange={setCustomNote}
                placeholder="Notes for this Android profile, account recovery status, QR unlock notes…"
                controlClassName="field auth-gate-field hub-adm-note-textarea"
              />
              <ProfileDetailLogRail profileName={displayName} focused={logRailFocused} />
            </div>
          }
        />
      </HubToolDetailModal>
    </HubAccountDetailSearchProvider>
  );
}
