import { useState } from "react";
import { FolderTree } from "lucide-react";
import {
  HubAlert,
  HubFormFieldLabel,
  HubToolDetailModalPrimaryAction,
  HubToolDetailModalSecondaryAction,
  HUB_TOOL_DETAIL_FORM_GRID_CLASS
} from "@tool-workspace/hub-ui";
import { StealthHubFormModal } from "../../components/StealthHubFormModal";
import { useProfilesRuntime } from "../../providers/ProfilesRuntimeProvider";

export function ManageGroupsModal({ onClose }: { onClose: () => void }) {
  const { groups, createGroup, updateGroup, deleteGroup } = useProfilesRuntime();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  return (
    <StealthHubFormModal
      title="Profile groups"
      headerIcon={FolderTree}
      headerIconClassName="text-amber-300"
      onClose={onClose}
      footer={<HubToolDetailModalSecondaryAction label="Close" onClick={onClose} disabled={busy} />}
    >
      <div className={HUB_TOOL_DETAIL_FORM_GRID_CLASS}>
        {error ? <HubAlert tone="danger">{error}</HubAlert> : null}

        <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.id} className="flex items-center gap-2 rounded-lg border border-white/10 px-2 py-1.5">
              {editingId === group.id ? (
                <>
                  <input className="hub-input flex-1" value={editName} onChange={(e) => setEditName(e.target.value)} />
                  <HubToolDetailModalPrimaryAction
                    label="Save"
                    onClick={() => {
                      setBusy(true);
                      setError("");
                      void updateGroup(group.id, editName.trim())
                        .then(() => setEditingId(null))
                        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Rename failed"))
                        .finally(() => setBusy(false));
                    }}
                    disabled={busy || !editName.trim()}
                    busy={busy}
                  />
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{group.name}</span>
                  {group.id !== "default" ? (
                    <>
                      <HubToolDetailModalSecondaryAction
                        label="Rename"
                        disabled={busy}
                        onClick={() => {
                          setEditingId(group.id);
                          setEditName(group.name);
                        }}
                      />
                      <HubToolDetailModalSecondaryAction
                        label="Delete"
                        disabled={busy}
                        onClick={() => {
                          setBusy(true);
                          setError("");
                          void deleteGroup(group.id)
                            .catch((err: unknown) => setError(err instanceof Error ? err.message : "Delete failed"))
                            .finally(() => setBusy(false));
                        }}
                      />
                    </>
                  ) : (
                    <span className="text-xs text-[var(--muted)]">System</span>
                  )}
                </>
              )}
            </div>
          ))}
        </div>

        <label className="block min-w-0">
          <HubFormFieldLabel>New group</HubFormFieldLabel>
          <div className="flex gap-2">
            <input
              className="hub-input flex-1"
              placeholder="Group name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <HubToolDetailModalPrimaryAction
              label="Add"
              disabled={busy || !newName.trim()}
              busy={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void createGroup(newName.trim())
                  .then(() => setNewName(""))
                  .catch((err: unknown) => setError(err instanceof Error ? err.message : "Create failed"))
                  .finally(() => setBusy(false));
              }}
            />
          </div>
        </label>
      </div>
    </StealthHubFormModal>
  );
}
