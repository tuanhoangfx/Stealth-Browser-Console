/** Route owner / sync permission — dual-plane auth (hub-api identity vs sb-api data). */

export function normalizeRouteEmail(value = "") {
  return String(value ?? "").trim().toLowerCase();
}

/**
 * Cookie routes store owner on sb-api (data plane). Match by data user id first,
 * then hub identity id, then owner email (same person, different Supabase projects).
 */
export function bindingOwnerMatch(binding, ctx = {}) {
  const ownerId = String(binding?.ownerUserId ?? "").trim();
  const ownerEmail = normalizeRouteEmail(binding?.ownerUserEmail);
  const dataUserId = String(ctx.dataUserId ?? ctx.userId ?? "").trim();
  const hubUserId = String(ctx.hubIdentityUserId ?? "").trim();
  const userEmail = normalizeRouteEmail(ctx.userEmail);

  if (!ownerId && !ownerEmail) return true;
  if (ownerId && dataUserId && ownerId === dataUserId) return true;
  if (ownerId && hubUserId && ownerId === hubUserId) return true;
  if (ownerEmail && userEmail && ownerEmail === userEmail) return true;
  return false;
}

export function bindingRoleInfo(binding, ctx = {}) {
  const sourceId = String(binding?.sourceBrowserId ?? "").trim();
  const ownerId = String(binding?.ownerUserId ?? "").trim();
  const ownerEmail = String(binding?.ownerUserEmail ?? "").trim();
  const browserId = String(ctx.browserId ?? "").trim();
  const ownsRoute = bindingOwnerMatch(binding, ctx);
  const isMemberReadOnly = Boolean(binding?.accessRole === "member" && binding?.canPublish !== true);
  const isOtherOwner = Boolean(binding && (ownerId || ownerEmail) && !ownsRoute);
  const isSource = Boolean(sourceId && browserId && sourceId === browserId);
  const sourceMismatch = Boolean(sourceId && browserId && sourceId !== browserId);
  const ownerCanSync = Boolean(binding && ownsRoute && !isMemberReadOnly && !sourceId);
  const canSync = Boolean(isSource || ownerCanSync);

  return {
    sourceId,
    ownsRoute,
    isSource,
    isReadOnly: isMemberReadOnly || isOtherOwner || sourceMismatch,
    canSync,
    roleFilter: isSource ? "source" : canSync ? "owner" : "readonly",
    sourceFilter: sourceId ? "locked" : ownsRoute && binding?.accessRole !== "member" ? "owner" : "unset",
    syncDisabledReason: !binding
      ? "No route"
      : isMemberReadOnly
        ? "Load only"
        : isOtherOwner
          ? `Owner only (${ownerEmail || ownerId.slice(0, 8)})`
          : sourceMismatch
            ? `Locked to ${sourceId.slice(0, 8)}`
            : "",
  };
}

/** Background source-lock gate — same owner semantics as popup. */
export function routeSourceLockState(binding, browserId, auth = {}, overrideSourceId = null) {
  if (binding?.accessRole === "member" && binding?.canPublish !== true) {
    return {
      canWrite: false,
      state: "read_only",
      message: "Read-only target. This Note ID permission allows apply only.",
    };
  }

  const ctx = {
    dataUserId: auth.dataUserId ?? auth.userId ?? null,
    hubIdentityUserId: auth.hubIdentityUserId ?? null,
    userEmail: auth.userEmail ?? null,
  };
  const ownerId = String(binding?.ownerUserId ?? "").trim();
  const ownerEmail = String(binding?.ownerUserEmail ?? "").trim();
  if ((ownerId || ownerEmail) && !bindingOwnerMatch(binding, ctx)) {
    return {
      canWrite: false,
      state: "read_only",
      message: `Read-only target. Route owner is ${ownerEmail || ownerId.slice(0, 8)}.`,
    };
  }

  const locked = String(overrideSourceId ?? binding?.sourceBrowserId ?? "").trim();
  if (!locked) {
    return {
      canWrite: true,
      state: "owner",
      message: "Route owner can Sync Now. Set Source only when you want to lock publishing to one browser.",
    };
  }
  if (locked !== String(browserId ?? "").trim()) {
    return {
      canWrite: false,
      state: "read_only",
      message: `Read-only target. Source browser is ${locked.slice(0, 8)}.`,
    };
  }
  return { canWrite: true, state: "source" };
}
