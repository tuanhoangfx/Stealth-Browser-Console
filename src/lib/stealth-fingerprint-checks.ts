/** Common machine / fingerprint audit sites for CloakBrowser smoke runs. */
export type FingerprintCheckSite = {
  id: string;
  label: string;
  url: string;
  hint: string;
};

export const FINGERPRINT_CHECK_SITES: FingerprintCheckSite[] = [
  {
    id: "sannysoft",
    label: "Bot test",
    url: "https://bot.sannysoft.com/",
    hint: "Headless / automation flags"
  },
  {
    id: "browserleaks-canvas",
    label: "Canvas",
    url: "https://browserleaks.com/canvas",
    hint: "Canvas fingerprint consistency"
  },
  {
    id: "browserleaks-webgl",
    label: "WebGL",
    url: "https://browserleaks.com/webgl",
    hint: "GPU / WebGL renderer"
  },
  {
    id: "creepjs",
    label: "CreepJS",
    url: "https://abrahamjuliot.github.io/creepjs/",
    hint: "Trust score + entropy"
  },
  {
    id: "pixelscan",
    label: "Pixelscan",
    url: "https://pixelscan.net/",
    hint: "Consistency scan"
  }
];

export const DEFAULT_FINGERPRINT_CHECK_URL = FINGERPRINT_CHECK_SITES[0]!.url;
