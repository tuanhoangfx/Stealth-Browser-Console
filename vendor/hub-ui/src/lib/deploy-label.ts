/** Deploy target label for filter badges and directory chips. */
export function deployLabel(target?: string): string {
  const map: Record<string, string> = {
    "github-pages": "GitHub Pages",
    vercel: "Vercel",
    vps: "VPS · CloudFly",
    "github-release": "GitHub Release",
    local: "Local only",
  };
  return target ? (map[target] ?? target) : "—";
}
