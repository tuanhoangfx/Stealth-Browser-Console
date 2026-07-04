/** Resolve hub-ui brand icon paths for Vite dev (/) and packaged file:// (./). */
export function resolveHubBrandAssetSrc(src: string): string {
  if (!src) return src;
  if (/^https?:\/\//i.test(src) || /^data:/i.test(src)) return src;
  if (typeof window !== "undefined" && window.location.protocol === "file:") {
    const rel = src.startsWith("/") ? `.${src}` : src.startsWith("./") ? src : `./${src}`;
    return rel;
  }
  const base = import.meta.env.BASE_URL || "/";
  const normalized = src.startsWith("/") ? src.slice(1) : src;
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}${normalized}`;
}
