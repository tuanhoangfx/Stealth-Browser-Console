let measuredScrollbarWidth: number | null = null;

export function measureDirectorySplitScrollbarWidth(doc: Document = document): number {
  if (measuredScrollbarWidth != null) return measuredScrollbarWidth;
  const outer = doc.createElement("div");
  outer.style.cssText = "visibility:hidden;overflow:scroll;width:100px;height:100px;position:absolute;top:-9999px";
  doc.body.appendChild(outer);
  const inner = doc.createElement("div");
  inner.style.height = "200px";
  outer.appendChild(inner);
  measuredScrollbarWidth = Math.max(0, outer.offsetWidth - outer.clientWidth) || 10;
  doc.body.removeChild(outer);
  return measuredScrollbarWidth;
}

function readScrollSizeToken(el: HTMLElement, doc: Document): number {
  const token = doc.defaultView?.getComputedStyle(el).getPropertyValue("--hub-split-scroll-size").trim() ?? "";
  const parsed = parseFloat(token);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return measureDirectorySplitScrollbarWidth(doc);
}

function isFlexPaneSplitBody(body: HTMLElement): boolean {
  const wrap = body.closest(".hub-directory-table-split");
  return wrap instanceof HTMLElement && wrap.classList.contains("hub-directory-table-scroll--flex-pane");
}

/** Read vertical scrollbar gutter width for split directory tbody pane. */
export function readDirectorySplitScrollbarPad(body: HTMLElement, doc: Document = document): number {
  if (isFlexPaneSplitBody(body)) {
    return readScrollSizeToken(body, doc);
  }

  const measured = body.offsetWidth - body.clientWidth;
  if (measured > 0) return measured;
  if (body.scrollHeight > body.clientHeight + 1) {
    return readScrollSizeToken(body, doc);
  }
  return 0;
}

/** Apply split thead scrollbar gutter — shared by hook + gates. Flex-pane pad is CSS-only. */
export function applyDirectorySplitScrollbarSync(head: HTMLElement, body: HTMLElement): number {
  const wrap = head.closest(".hub-directory-table-split");
  const isFlexPane =
    wrap instanceof HTMLElement && wrap.classList.contains("hub-directory-table-scroll--flex-pane");

  const pad = readDirectorySplitScrollbarPad(body, head.ownerDocument);

  if (isFlexPane) {
    return pad;
  }

  const padValue = `${pad}px`;
  head.style.setProperty("--hub-directory-split-scrollbar-pad", padValue);
  body.style.setProperty("--hub-directory-split-scrollbar-pad", padValue);
  if (wrap instanceof HTMLElement) {
    wrap.style.setProperty("--hub-directory-split-scrollbar-pad", padValue);
  }
  return pad;
}
