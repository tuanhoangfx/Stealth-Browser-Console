export type PhysicalPhoneNode = {
  id: string;
  name: string;
  shortCode: string;
  os: "android" | "ios";
  osLabel: string;
  ip: string;
  transportLabel: string;
  role: string;
  batteryPct: number;
  tempC: number;
  acPowered: boolean;
  powerBadge: string;
  ramUsedPct: number;
  ramFreeMb: number;
  proxyLabel: string;
  proxyIp: string;
  proxyLatencyMs: number;
  isBusy: boolean;
  taskPhase: "WAVE" | "COOLDOWN BURST" | "24/7 GATEWAY";
  activeTaskTitle: string;
  appBadge: string;
  screenUrl: string;
  dimModeLabel: string;
  accent: "emerald" | "cyan" | "amber" | "violet" | "sky";
  uiHeader: string;
  uiTitle: string;
  uiLines: string[];
  uiCta: string;
  lastOtp?: string;
};

export type FarmDaemonRow = {
  id: string;
  title: string;
  status: "ACTIVE WAVE" | "COOLDOWN BURST" | "RUNNING" | "HEALTHY" | "COOLING GUARD";
  progressPct: number;
  summary: string;
  meta: string;
};

export type KaizenCarrierRow = {
  laneId: string;
  label: string;
  attempts: number;
  live: number;
  convPct: number;
  avgMs: number;
  latencyMs: number;
  lastOutcome: string;
};

export const PHYSICAL_PHONES: PhysicalPhoneNode[] = [
  {
    id: "pixel6a",
    name: "Google Pixel 6a",
    shortCode: "6A · .208",
    os: "android",
    osLabel: "Android 16 · KernelSU",
    ip: "192.168.0.208",
    transportLabel: "ADB :5555",
    role: "FB Primary + FPT 4G",
    batteryPct: 85,
    tempC: 35.8,
    acPowered: true,
    powerBadge: "AC · Pixel Limit",
    ramUsedPct: 58,
    ramFreeMb: 1390,
    proxyLabel: "FPT 4G :31080",
    proxyIp: "59.153.225.236",
    proxyLatencyMs: 502,
    isBusy: true,
    taskPhase: "COOLDOWN BURST",
    activeTaskTitle: "Gmail Mweb Create",
    appBadge: "Chrome",
    screenUrl: "accounts.google.com/signup",
    dimModeLabel: "Screen Awake · Brightness 1",
    accent: "emerald",
    uiHeader: "Google Account",
    uiTitle: "Basic information",
    uiLines: ["First name: Minh", "Last name: Nguyen", "Proxy: 59.153.225.236", "RAM free: 1390 MB"],
    uiCta: "Next step",
  },
  {
    id: "pixel7",
    name: "Google Pixel 7",
    shortCode: "P7 · .253",
    os: "android",
    osLabel: "Android 16 · KernelSU",
    ip: "192.168.0.253",
    transportLabel: "ADB :5555",
    role: "FB Failover + Root Lab",
    batteryPct: 45,
    tempC: 34.5,
    acPowered: true,
    powerBadge: "AC · Fast Charge",
    ramUsedPct: 58,
    ramFreeMb: 2857,
    proxyLabel: "Viettel 4G :31082",
    proxyIp: "171.253.232.193",
    proxyLatencyMs: 966,
    isBusy: true,
    taskPhase: "COOLDOWN BURST",
    activeTaskTitle: "TikTok Lite Warmup",
    appBadge: "TikTok",
    screenUrl: "musically.go/signup",
    dimModeLabel: "Screen Awake · Brightness 1",
    accent: "cyan",
    uiHeader: "TikTok Lite",
    uiTitle: "Sign up for TikTok",
    uiLines: ["Carrier: Viettel 4G", "IP: 171.253.232.193", "Thermal: 34.5 C", "AC Charging 45%"],
    uiCta: "Continue with Mail",
  },
  {
    id: "s9plus",
    name: "Galaxy S9+",
    shortCode: "S9+ · .120",
    os: "android",
    osLabel: "Android 10 · Magisk",
    ip: "192.168.0.120",
    transportLabel: "ADB :5555",
    role: "SIM 0973648075 + 4G",
    batteryPct: 58,
    tempC: 39.2,
    acPowered: true,
    powerBadge: "AC · Store Mode",
    ramUsedPct: 53,
    ramFreeMb: 1616,
    proxyLabel: "Viettel 4G :31081",
    proxyIp: "171.255.69.181",
    proxyLatencyMs: 796,
    isBusy: true,
    taskPhase: "24/7 GATEWAY",
    activeTaskTitle: "SMS OTP + 4G Relay",
    appBadge: "SIM Bridge",
    screenUrl: "gost://:31081 + SIM",
    dimModeLabel: "Background Service · Cool",
    accent: "amber",
    uiHeader: "SIM + 4G Gateway",
    uiTitle: "0973648075 Online",
    uiLines: ["SMS Daemon: :6016 OK", "Lenovo SSE: 200 OK", "Relay: 171.255.69.181", "Load: 0.8s avg"],
    uiCta: "Copy Last OTP",
    lastOtp: "849201",
  },
  {
    id: "ios6s",
    name: "iPhone 6s",
    shortCode: "6S · .183",
    os: "ios",
    osLabel: "iOS 14.8 · Jailbroken",
    ip: "192.168.0.183",
    transportLabel: "MCP :8090",
    role: "Safari Crane Node #2",
    batteryPct: 81,
    tempC: 34.6,
    acPowered: true,
    powerBadge: "Unlocked · Dim 0%",
    ramUsedPct: 48,
    ramFreeMb: 980,
    proxyLabel: "Via FPT :31080",
    proxyIp: "59.153.225.236",
    proxyLatencyMs: 502,
    isBusy: true,
    taskPhase: "COOLDOWN BURST",
    activeTaskTitle: "Safari Gmail Probe",
    appBadge: "Safari",
    screenUrl: "m.youtube.com -> Google",
    dimModeLabel: "Auto-Lock Never · Dim 0%",
    accent: "violet",
    uiHeader: "Safari · Crane #14",
    uiTitle: "Birthday & Gender",
    uiLines: ["Shadowrocket: Connected", "Slot #2748 isolated", "Display: Dim 0% (Awake)", "Wi-Fi 3/3 bars · 1ms"],
    uiCta: "Confirm Date",
  },
  {
    id: "ios6splus",
    name: "iPhone 6s Plus",
    shortCode: "6S+ · .222",
    os: "ios",
    osLabel: "iOS 15.8.2 · Jailbroken",
    ip: "192.168.0.222",
    transportLabel: "MCP :8090",
    role: "Safari Crane Node #1",
    batteryPct: 62,
    tempC: 35.1,
    acPowered: true,
    powerBadge: "Unlocked · Dim 0%",
    ramUsedPct: 44,
    ramFreeMb: 1090,
    proxyLabel: "Via Viettel :31082",
    proxyIp: "171.253.232.193",
    proxyLatencyMs: 966,
    isBusy: true,
    taskPhase: "WAVE",
    activeTaskTitle: "FB Live #2750 Verified",
    appBadge: "Safari FB",
    screenUrl: "m.facebook.com/reg/",
    dimModeLabel: "Auto-Lock Never · Dim 0%",
    accent: "sky",
    uiHeader: "Safari · Crane #09",
    uiTitle: "Instagram / FB Form",
    uiLines: ["Last: barbol85@gmail.com", "Result: created_live", "Mirror: .222 + .183 OK", "Backlight: Dim 0%"],
    uiCta: "Next Container",
  },
];

export const FARM_DAEMONS: FarmDaemonRow[] = [
  {
    id: "fb-multi-method-100",
    title: "FB Multi-Method 100 Factory",
    status: "COOLDOWN BURST",
    progressPct: 86,
    summary: "Wave #249 · 86/100 live · 4/5 physical phones active in Cooldown Burst (Gmail + TikTok + IG)",
    meta: "PID 16292 · batch=4 · cooldown=2m",
  },
  {
    id: "mobile-sim-otp",
    title: "24/7 Physical SIM OTP + P0011 Bridge",
    status: "RUNNING",
    progressPct: 100,
    summary: "4 SIMs polled every 8s -> mail.infi28.com/api/phone/inbound-notify (HTTP 200)",
    meta: "PID 46848 · :6016",
  },
  {
    id: "hardware-watchdog",
    title: "5-Device Wi-Fi Power & Thermal Guard",
    status: "HEALTHY",
    progressPct: 100,
    summary: "5/5 nodes Wi-Fi online (0% loss) · iOS keep-awake 60s · S9+ Frida guard · Pixel 7 AC OK",
    meta: "PID 2492 · 60s tick",
  },
  {
    id: "gmail-pool-daemon",
    title: "Gmail Pool & Recovery Daemon",
    status: "RUNNING",
    progressPct: 68,
    summary: "122 Infi-forwarded unused Gmails ready for Meta / TikTok signup",
    meta: "PC Headless Stealth",
  },
];

export const KAIZEN_CARRIER_LANES: KaizenCarrierRow[] = [
  {
    laneId: "pixel6a_fpt_4g",
    label: "Pixel 6a FPT 4G (:31080)",
    attempts: 78,
    live: 11,
    convPct: 14.1,
    avgMs: 202571,
    latencyMs: 502,
    lastOutcome: "created_live / cp282",
  },
  {
    laneId: "pixel7_viettel_4g",
    label: "Pixel 7 Viettel 4G (:31082)",
    attempts: 14,
    live: 3,
    convPct: 21.4,
    avgMs: 164000,
    latencyMs: 966,
    lastOutcome: "tiktok_ok / mweb_probe",
  },
  {
    laneId: "s9_viettel_4g",
    label: "S9+ Viettel 4G (:31081)",
    attempts: 67,
    live: 0,
    convPct: 0,
    avgMs: 174422,
    latencyMs: 796,
    lastOutcome: "gateway_relay_only",
  },
  {
    laneId: "static_vn_proxy",
    label: "Static VN Proxy Pool",
    attempts: 174,
    live: 9,
    convPct: 5.2,
    avgMs: 175960,
    latencyMs: 847,
    lastOutcome: "account_creation_failed",
  },
];

export const VIRTUAL_PROFILES_SUMMARY = {
  total: 53,
  running: 12,
  standby: 41,
  sampleCodes: ["2750", "2749", "2748", "2747", "2746", "2745"],
};
