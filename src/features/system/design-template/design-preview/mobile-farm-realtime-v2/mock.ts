export type MockDeviceId = "pixel6a" | "pixel7" | "s9plus" | "ios6s" | "ios6splus";

export interface MockPhysicalDevice {
  id: MockDeviceId;
  shortCode: string;
  name: string;
  ip: string;
  transport: string;
  os: "android" | "ios";
  phase: "WAVE" | "24/7 GATEWAY" | "COOLDOWN BURST" | "ATTENTION";
  fps: number;
  frameAgeMs: number;
  batteryPct: number;
  tempC: number;
  ramUsedPct: number;
  ramFreeMb: number;
  proxyLabel: string;
  laneId: string;
  latencyMs: number;
  latencyHistory: number[];
  taskTitle: string;
  orchestratorState: "LEASED" | "DISPATCH" | "GATEWAY";
  orchestratorNote: string;
  lastOtp?: string;
  alert?: {
    code: string;
    label: string;
    actionLabel: string;
  } | null;
  screenScene: "chrome_code" | "android_anr" | "google_login" | "rocket_boot" | "ios_springboard";
}

export interface MockCarrierLane {
  laneId: string;
  label: string;
  port: string;
  carrier: string;
  attempts: number;
  live: number;
  convPct: number;
  latencyMs: number;
  history: number[];
  status: "prioritized" | "capped" | "fallback";
}

export interface MockDaemon {
  id: string;
  title: string;
  status: "RUNNING" | "STANDBY" | "STOPPED";
  step: string;
  progress: string;
  pct: number;
}

export interface MockLiveEvent {
  id: string;
  tsLabel: string;
  deviceId: MockDeviceId;
  shortCode: string;
  kind: "TAP" | "OTP" | "PROXY" | "ANR" | "WAVE" | "LEASE";
  message: string;
}

export const MOCK_MISSION = {
  goalTitle: "FB Multi-Method 100",
  goalCurrent: 91,
  goalTarget: 100,
  waveNumber: 294,
  physicalOnline: 5,
  physicalTotal: 5,
  simOnline: 4,
  simTotal: 4,
  otpCount: 13,
  avgTempC: 35.7,
  maxTempC: 37.6,
  activeDaemons: 4,
  totalDaemons: 8,
  orchestratorCycle: 170,
  queuedComments: 22,
  sentComments: 0,
  cpuPct: 16,
  ramUsedGb: 24.2,
  ramTotalGb: 128,
} as const;

export const MOCK_DEVICES: MockPhysicalDevice[] = [
  {
    id: "pixel6a",
    shortCode: "6A",
    name: "Google Pixel 6a",
    ip: "192.168.0.208",
    transport: "ADB :5555",
    os: "android",
    phase: "WAVE",
    fps: 24,
    frameAgeMs: 88,
    batteryPct: 85,
    tempC: 36.2,
    ramUsedPct: 86,
    ramFreeMb: 2065,
    proxyLabel: "FPT 4G :31080",
    laneId: "pixel6a_fpt_4g",
    latencyMs: 582,
    latencyHistory: [620, 595, 640, 570, 610, 582],
    taskTitle: "leased:android_mweb_sms_gmail",
    orchestratorState: "LEASED",
    orchestratorNote: "Wave #294 · Confirm 6-digit code",
    alert: null,
    screenScene: "chrome_code",
  },
  {
    id: "pixel7",
    shortCode: "P7",
    name: "Google Pixel 7",
    ip: "192.168.0.253",
    transport: "ADB :5555",
    os: "android",
    phase: "ATTENTION",
    fps: 21,
    frameAgeMs: 142,
    batteryPct: 85,
    tempC: 37.6,
    ramUsedPct: 53,
    ramFreeMb: 3564,
    proxyLabel: "Viettel 4G :31082",
    laneId: "pixel7_viettel_4g",
    latencyMs: 616,
    latencyHistory: [690, 650, 630, 605, 625, 616],
    taskTitle: "leased:android_mweb_gmail_direct",
    orchestratorState: "LEASED",
    orchestratorNote: "ANR popup blocking foreground",
    alert: {
      code: "ANR_DIALOG",
      label: "System UI Not Responding",
      actionLabel: "Dismiss ANR",
    },
    screenScene: "android_anr",
  },
  {
    id: "s9plus",
    shortCode: "S9+",
    name: "Galaxy S9+",
    ip: "192.168.0.120",
    transport: "ADB :5555",
    os: "android",
    phase: "24/7 GATEWAY",
    fps: 15,
    frameAgeMs: 240,
    batteryPct: 78,
    tempC: 32.8,
    ramUsedPct: 47,
    ramFreeMb: 2724,
    proxyLabel: "SIM 0973648075 (:31081)",
    laneId: "s9_viettel_4g",
    latencyMs: 685,
    latencyHistory: [710, 740, 695, 705, 680, 685],
    taskTitle: "SMS OTP + 4G Relay (Online)",
    orchestratorState: "GATEWAY",
    orchestratorNote: "Instagram Multi-Device Create & Warm",
    lastOtp: "609288",
    alert: null,
    screenScene: "google_login",
  },
  {
    id: "ios6s",
    shortCode: "6S",
    name: "iPhone 6s",
    ip: "192.168.0.183",
    transport: "MCP :8090",
    os: "ios",
    phase: "WAVE",
    fps: 20,
    frameAgeMs: 175,
    batteryPct: 85,
    tempC: 34.3,
    ramUsedPct: 68,
    ramFreeMb: 640,
    proxyLabel: "Via FPT :31080",
    laneId: "pixel6a_fpt_4g",
    latencyMs: 590,
    latencyHistory: [610, 585, 600, 625, 595, 590],
    taskTitle: "multi_platform_threads_probe",
    orchestratorState: "DISPATCH",
    orchestratorNote: "Threads Session Warmup Probe",
    alert: null,
    screenScene: "rocket_boot",
  },
  {
    id: "ios6splus",
    shortCode: "6S+",
    name: "iPhone 6s Plus",
    ip: "192.168.0.222",
    transport: "MCP :8090",
    os: "ios",
    phase: "WAVE",
    fps: 24,
    frameAgeMs: 105,
    batteryPct: 62,
    tempC: 36.5,
    ramUsedPct: 61,
    ramFreeMb: 780,
    proxyLabel: "Via FPT :31080",
    laneId: "pixel7_viettel_4g",
    latencyMs: 612,
    latencyHistory: [640, 620, 615, 598, 608, 612],
    taskTitle: "leased:fb_multi_method_100",
    orchestratorState: "LEASED",
    orchestratorNote: "Wave #294 · Safari FB / IG",
    alert: null,
    screenScene: "ios_springboard",
  },
];

export const MOCK_CARRIER_LANES: MockCarrierLane[] = [
  {
    laneId: "pixel6a_fpt_4g",
    label: "Pixel 6a FPT 4G",
    port: ":31080",
    carrier: "FPT 4G",
    attempts: 102,
    live: 14,
    convPct: 13.7,
    latencyMs: 582,
    history: [12, 13, 14, 13.2, 13.9, 13.7],
    status: "prioritized",
  },
  {
    laneId: "pixel7_viettel_4g",
    label: "Pixel 7 Viettel 4G",
    port: ":31082",
    carrier: "Viettel 4G",
    attempts: 52,
    live: 10,
    convPct: 19.2,
    latencyMs: 616,
    history: [15, 16, 17.5, 18.1, 19.0, 19.2],
    status: "prioritized",
  },
  {
    laneId: "s9_viettel_4g",
    label: "S9+ Viettel 4G",
    port: ":31081",
    carrier: "Viettel 4G",
    attempts: 75,
    live: 0,
    convPct: 0,
    latencyMs: 685,
    history: [0, 0, 0, 0, 0, 0],
    status: "capped",
  },
  {
    laneId: "static_vn_proxy",
    label: "Static VN Proxy Pool",
    port: "pool",
    carrier: "Static VN",
    attempts: 234,
    live: 13,
    convPct: 5.6,
    latencyMs: 412,
    history: [5.1, 5.4, 5.2, 5.8, 5.5, 5.6],
    status: "fallback",
  },
];

export const MOCK_DAEMONS: MockDaemon[] = [
  {
    id: "fb-multi-100",
    title: "FB Multi-Method 100 Campaign",
    status: "RUNNING",
    step: "Wave #294 · ios_safari_gmail_s9lte",
    progress: "91 / 100 live",
    pct: 91,
  },
  {
    id: "gmail-pool",
    title: "Gmail Pool & Recovery Daemon",
    status: "STANDBY",
    step: "Batch #4 · Queue Sweep",
    progress: "181 ok · 32 queued",
    pct: 85,
  },
  {
    id: "outlook-heal",
    title: "Outlook & OWA Heal Daemon",
    status: "RUNNING",
    step: "Batch #103 · Active #0151",
    progress: "34 processed · 1 left",
    pct: 97,
  },
  {
    id: "fasttrack-totp",
    title: "FastTrack TOTP / Mail / TikTok",
    status: "STOPPED",
    step: "Stopped (running_tiktok_autologin)",
    progress: "Round #2 · 4/12 healed",
    pct: 33,
  },
  {
    id: "fanpage-fleet",
    title: "Fanpage Fleet Monitor",
    status: "STANDBY",
    step: "Standby (checking) · Proxy 12 alive",
    progress: "380 / 312 pages live",
    pct: 100,
  },
  {
    id: "muse-onboard",
    title: "Muse Fleet Onboard",
    status: "STANDBY",
    step: "Idle · Waiting next batch",
    progress: "Completed / Idle",
    pct: 100,
  },
  {
    id: "power-thermal",
    title: "24/7 Device Power & Thermal",
    status: "RUNNING",
    step: "60–70% (hold_store_mode · TA)",
    progress: "5 / 5 online",
    pct: 100,
  },
  {
    id: "master-orch",
    title: "24/7 Master Orchestrator",
    status: "RUNNING",
    step: "Cycle #170 · Auto Dispatch",
    progress: "22 queued · 0 sent",
    pct: 72,
  },
];

export const MOCK_LIVE_EVENTS: MockLiveEvent[] = [
  {
    id: "ev-1",
    tsLabel: "19:15:48",
    deviceId: "s9plus",
    shortCode: "S9+",
    kind: "OTP",
    message: "Captured SMS OTP 609288 -> forwarded to Pixel 6a (:31081)",
  },
  {
    id: "ev-2",
    tsLabel: "19:15:44",
    deviceId: "pixel6a",
    shortCode: "6A",
    kind: "TAP",
    message: "Chrome Mweb · Prompted notification modal on confirm-code step",
  },
  {
    id: "ev-3",
    tsLabel: "19:15:39",
    deviceId: "pixel7",
    shortCode: "P7",
    kind: "ANR",
    message: "System UI ANR dialog detected on Display 0 · waiting dismiss",
  },
  {
    id: "ev-4",
    tsLabel: "19:15:31",
    deviceId: "ios6splus",
    shortCode: "6S+",
    kind: "WAVE",
    message: "Wave #294 · Safari FB cookie checkpoint verified (live #91)",
  },
  {
    id: "ev-5",
    tsLabel: "19:15:24",
    deviceId: "ios6s",
    shortCode: "6S",
    kind: "LEASE",
    message: "Leased Threads Session Warmup Probe via FPT :31080",
  },
  {
    id: "ev-6",
    tsLabel: "19:15:18",
    deviceId: "pixel6a",
    shortCode: "6A",
    kind: "PROXY",
    message: "FPT 4G :31080 subnet rotated cleanly (582ms RTT)",
  },
];
