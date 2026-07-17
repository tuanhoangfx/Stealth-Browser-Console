/** Split leading emoji cluster from directory header label (e.g. "🦸‍♂️Own" → glyph + "Own"). */
export function parseHubTableHeaderLabel(label: string): {
  embeddedGlyph: string | null;
  text: string;
} {
  const trimmed = label.trim();
  if (!trimmed) return { embeddedGlyph: null, text: label };

  const match = trimmed.match(
    /^(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)+/u,
  );
  if (!match || match[0].length >= trimmed.length) {
    return { embeddedGlyph: null, text: label };
  }

  const embeddedGlyph = match[0];
  const text = trimmed.slice(embeddedGlyph.length).trimStart();
  if (!text) return { embeddedGlyph: null, text: label };
  return { embeddedGlyph, text };
}

/**
 * Visible label beside a separate glyph (emoji / Lucide / brand).
 * Strips a leading emoji so sticker + label never double the same glyph.
 */
export function hubTableLabelTextForGlyph(label: string): string {
  const parsed = parseHubTableHeaderLabel(label);
  return parsed.embeddedGlyph ? parsed.text : label;
}
