import assert from "node:assert";

import { isStealthDevCommandLine } from "./dev-desktop-process.mjs";

assert.strictEqual(
  isStealthDevCommandLine("node E:\\Dev\\Tool\\P0003-Stealth-Browser-Console\\scripts\\dev-node.mjs"),
  true,
);
assert.strictEqual(
  isStealthDevCommandLine("node E:\\Dev\\Tool\\P0003-Stealth-Browser-Console\\scripts\\reload-and-verify-p0003.mjs"),
  true,
);
assert.strictEqual(
  isStealthDevCommandLine("C:\\Program Files\\Stealth Browser Console\\Stealth Browser Console.exe"),
  false,
);
assert.strictEqual(isStealthDevCommandLine("electron ."), false);

console.log("dev-desktop-process.test: ok");
