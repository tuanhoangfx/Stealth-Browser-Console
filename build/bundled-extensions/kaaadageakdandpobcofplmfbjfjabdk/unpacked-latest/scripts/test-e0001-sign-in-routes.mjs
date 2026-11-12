#!/usr/bin/env node
/** E0001 dual-plane login + route pull — P0005/P0020 parity locks. */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");

const auth = read("auth-session.js");
assert.doesNotMatch(auth, /hubAuthEmailFromLogin/);
assert.match(auth, /AUTH_FETCH_TIMEOUT_MS = 16_000/);
const grantFn = auth.slice(auth.indexOf("export async function signInWithPassword"));
assert.ok(
  grantFn.indexOf("grant_type=password") < grantFn.indexOf("signInViaHubGateway"),
  "direct GoTrue before Worker gateway (P0005/P0020)",
);

const background = read("background.js");
const signInHandler = background.slice(
  background.indexOf('if (msg?.type === "EXTENSION_SIGN_IN"'),
  background.indexOf('if (msg?.type === "STORE_IDENTITY"'),
);
assert.match(signInHandler, /pull cloud routes after dataPending/);
assert.match(background, /ensureAuthForRoutePull/);
assert.match(background, /waitMs: 8_000/);

const popup = read("popup.js");
assert.match(popup, /function pullCloudRoutesThenPaint/);
assert.match(popup, /PULL_CLOUD_ROUTES/);
assert.match(popup, /pullCloudRoutesThenPaint\(\)/);
assert.match(popup, /isAuthTransportError\(err\)/);

console.log("test-e0001-sign-in-routes: ok");
