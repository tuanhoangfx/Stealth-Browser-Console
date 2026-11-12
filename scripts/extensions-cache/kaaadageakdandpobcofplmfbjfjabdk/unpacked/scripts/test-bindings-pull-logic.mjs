/**
 * Unit test: Tool localStorage → extension payload (same rules as executeScript pull).
 */
import assert from "assert";

const KEY = "e0001-cookie-bindings-v1";

function bindingsForExtensionFromStorage(raw) {
  let list;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  return list
    .filter((b) => b.enabled && b.domain?.trim() && (b.syncId?.trim() || b.noteId?.trim()))
    .map((b) => ({
      syncId: String(b.syncId ?? "").trim(),
      noteId: String(b.noteId ?? "").trim(),
      pass: b.pass ?? "",
      domain: String(b.domain).trim(),
      requiresPass: false,
      noteTitle: String(b.noteTitle ?? "").trim(),
    }));
}

const sample = [
  {
    id: "a",
    enabled: true,
    noteId: "5b675aab-4a04-442a-a86f-dab37c4e12e4",
    syncId: "TM-t6sabbts",
    domain: ".facebook.com",
    noteTitle: "Cookie Facebook",
  },
];

const out = bindingsForExtensionFromStorage(JSON.stringify(sample));
assert.strictEqual(out.length, 1, "enabled binding maps");
assert.strictEqual(out[0].domain, ".facebook.com");
assert.strictEqual(out[0].noteId, "5b675aab-4a04-442a-a86f-dab37c4e12e4");

const disabled = bindingsForExtensionFromStorage(
  JSON.stringify([{ ...sample[0], enabled: false }]),
);
assert.strictEqual(disabled.length, 0, "disabled filtered");

console.log("OK: bindings pull logic", out[0]);
