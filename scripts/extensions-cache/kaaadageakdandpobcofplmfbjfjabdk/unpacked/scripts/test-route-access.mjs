import assert from "node:assert/strict";
import {
  bindingOwnerMatch,
  bindingRoleInfo,
  normalizeRouteEmail,
  routeSourceLockState,
} from "../route-access.js";

assert.equal(normalizeRouteEmail(" CzP@Outlook.COM "), "czp@outlook.com");

const ownerBinding = {
  ownerUserId: "data-uuid-1",
  ownerUserEmail: "czpgo@outlook.com",
  accessRole: "owner",
};

assert.equal(
  bindingOwnerMatch(ownerBinding, {
    dataUserId: "data-uuid-1",
    hubIdentityUserId: "hub-uuid-9",
    userEmail: "czpgo@outlook.com",
  }),
  true,
);

assert.equal(
  bindingOwnerMatch(ownerBinding, {
    dataUserId: "hub-uuid-9",
    hubIdentityUserId: "hub-uuid-9",
    userEmail: "czpgo@outlook.com",
  }),
  true,
);

assert.equal(
  bindingOwnerMatch(ownerBinding, {
    dataUserId: "hub-uuid-9",
    hubIdentityUserId: "hub-uuid-9",
    userEmail: "czpgo@outlook.com",
  }),
  true,
);

assert.equal(
  bindingOwnerMatch(ownerBinding, {
    dataUserId: "wrong",
    hubIdentityUserId: "also-wrong",
    userEmail: "czpgo@outlook.com",
  }),
  true,
  "email fallback when ids differ across planes",
);

const role = bindingRoleInfo(ownerBinding, {
  dataUserId: "hub-uuid-9",
  hubIdentityUserId: "hub-uuid-9",
  userEmail: "czpgo@outlook.com",
  browserId: "browser-a",
});
assert.equal(role.canSync, true, "owner should sync when email matches");
assert.equal(role.syncDisabledReason, "");

const locked = bindingRoleInfo(
  { ...ownerBinding, sourceBrowserId: "browser-b" },
  {
    dataUserId: "data-uuid-1",
    userEmail: "czpgo@outlook.com",
    browserId: "browser-a",
  },
);
assert.equal(locked.canSync, false);
assert.match(locked.syncDisabledReason, /Locked to/);

const lock = routeSourceLockState(ownerBinding, "browser-a", {
  dataUserId: "hub-uuid-9",
  hubIdentityUserId: "hub-uuid-9",
  userEmail: "czpgo@outlook.com",
});
assert.equal(lock.canWrite, true);

console.log("test-route-access: OK");
