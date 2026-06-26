#!/usr/bin/env node
/** One-shot Surfshark purge — AppData cache + all profile Chrome prefs. */
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { purgeAllProfilesSurfshark } = require("../electron/lib/profile-chrome-cleanup.cjs");

const root = process.env.STEALTH_USER_DATA || path.join(os.homedir(), "AppData", "Roaming", "stealth-browser-console");
const result = purgeAllProfilesSurfshark(root);
console.log(JSON.stringify({ root, ...result }, null, 2));
