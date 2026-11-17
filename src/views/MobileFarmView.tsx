import { memo, useCallback, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowUp,
  CheckSquare,
  Circle,
  Grid2x2,
  Laptop,
  Layers,
  MessageCircle,
  MonitorSmartphone,
  PanelLeftOpen,
  Power,
  ShieldCheck,
  Wifi,
  WifiOff,
  XCircle,
} from "lucide-react";
import {
  HUB_VIRTUAL_ROW_THRESHOLD,
  HubBrandIcon,
  HubBulkActionButton,
  HubListChromeHeader,
  HubResultCount,
  HubSearchField,
  HubSegmentToggle,
  KpiStrip,
  compactIconSize,
  searchTextIncludes,
  useHubVirtualRows,
  type KpiTileData,
} from "@tool-workspace/hub-ui";
import { useAppToast } from "../components/toast";
import { useHostHeaderStats } from "../hooks/useHostHeaderStats";
import { useStealthVersionMetaItems } from "../hooks/useStealthVersionMetaItems";
import { STEALTH_PROFILE_KPI_STICKER } from "../lib/stealth-column-stickers";
import { useStealthHubListPrefs } from "../lib/useStealthHubListPrefs";
import { useProfilesRuntime } from "../providers/ProfilesRuntimeProvider";
import type { MobileProfileRow } from "./AndroidProfilesView";
import { MobileFarmControlRail } from "./mobile-farm/MobileFarmControlRail";
import { MobileFarmPhoneCard } from "./mobile-farm/MobileFarmPhoneCard";
import { MobileFarmTheaterOverlay } from "./mobile-farm/MobileFarmTheaterOverlay";
import {
  FARM_PREFS_STORAGE_KEY,
  fetchFarmApi,
  getMirrorCanvasForDisplay,
  hasLiveMirrorFrame,
  isNonBlackScreenUrl,
  readFarmUiPrefs,
  resetMuxDisplayStreams,
  type AvailableAdbDevice,
  type ExtendedDisplayInfo,
  type ExtendedLiveScreenState,
  type FarmEngineMode,
  type FarmFilterConnection,
  type FarmGroupFilter,
  type FarmPhoneCardItem,
  type FarmTouchVector,
  type FarmUiPrefs,
  type MobileDeviceTelemetry,
} from "./mobile-farm/mobile-farm-stream";

export const MobileFarmView = memo(function MobileFarmView({
  headerActions,
}: {
  headerActions?: ReactNode;
}) {
  const { profiles: pcProfiles, openOne, closeOne, runningHeadlessIds } = useProfilesRuntime();
  const { pushToast } = useAppToast();
  const { metaItems } = useStealthVersionMetaItems();
  const hubPrefs = useStealthHubListPrefs();
  const centerStats = useHostHeaderStats(hubPrefs.headerStats);

  const initialFarmPrefs = useMemo(() => readFarmUiPrefs(), []);

  const [engineMode, setEngineMode] = useState<FarmEngineMode>(initialFarmPrefs.engineMode);
  const [liveState, setLiveState] = useState<ExtendedLiveScreenState | null>(null);
  const [profiles, setProfiles] = useState<MobileProfileRow[]>([]);
  const [deviceTelemetry, setDeviceTelemetry] = useState<MobileDeviceTelemetry | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [actionBusy, setActionBusy] = useState<string>("");
  const [autoStream, setAutoStream] = useState<boolean>(initialFarmPrefs.autoStream);
  const [syncMaster, setSyncMaster] = useState<boolean>(initialFarmPrefs.syncMaster);
  const [dualWall, setDualWall] = useState<boolean>(initialFarmPrefs.dualWall);
  const dualWallRef = useRef<boolean>(dualWall);
  dualWallRef.current = dualWall;

  const pcProfileByCode = useMemo(() => {
    const map = new Map<string, (typeof pcProfiles)[number]>();
    for (const p of pcProfiles) {
      const m = String(p.name || "").match(/^(\d{4})\b/);
      if (m) map.set(m[1], p);
    }
    return map;
  }, [pcProfiles]);

  // Left control rail settings (persisted in localStorage via p0003:mobile-farm-prefs:v1)
  const [cardWidth, setCardWidth] = useState<number>(initialFarmPrefs.cardWidth);
  const [refreshIntervalMs, setRefreshIntervalMs] = useState<number>(initialFarmPrefs.refreshIntervalMs);
  const [connectionFilter, setConnectionFilter] = useState<FarmFilterConnection>(initialFarmPrefs.connectionFilter);
  const [groupFilter, setGroupFilter] = useState<FarmGroupFilter>(initialFarmPrefs.groupFilter);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCardIds, setSelectedCardIds] = useState<Set<string>>(() => new Set());
  const [cachedSlotScreens, setCachedSlotScreens] = useState<Record<string, string>>({});
  const [lastGestureByCard, setLastGestureByCard] = useState<Record<string, FarmTouchVector & { ts: number }>>({});
  const [railCollapsed, setRailCollapsed] = useState<boolean>(initialFarmPrefs.railCollapsed);
  const [theaterCardId, setTheaterCardId] = useState<string | null>(null);
  const pointerDownRef = useRef<{
    cardId: string;
    relX: number;
    relY: number;
    startedAt: number;
  } | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const nextPrefs: FarmUiPrefs = {
        engineMode,
        cardWidth,
        refreshIntervalMs,
        connectionFilter,
        groupFilter,
        railCollapsed,
        autoStream,
        syncMaster,
        dualWall,
      };
      window.localStorage.setItem(FARM_PREFS_STORAGE_KEY, JSON.stringify(nextPrefs));
    } catch {
      /* ignore quota error */
    }
  }, [autoStream, cardWidth, connectionFilter, dualWall, engineMode, groupFilter, railCollapsed, refreshIntervalMs, syncMaster]);

  const loadProfilesAndTelemetry = useCallback(async () => {
    try {
      const data = await fetchFarmApi("/api/mobile-stealth/profiles");
      if (data?.ok) {
        setProfiles(Array.isArray(data.profiles) ? data.profiles : []);
        if (data.device) setDeviceTelemetry(data.device);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const pullInFlightRef = useRef<boolean>(false);
  const pollTickRef = useRef<number>(0);

  const pullFarmLiveState = useCallback(async (includeShot = true) => {
    if (pullInFlightRef.current) return;
    pullInFlightRef.current = true;
    setLoading(true);
    try {
      const wantDual = dualWallRef.current;
      const data = (await fetchFarmApi(
        `/api/mobile-stealth/live-screen?displayId=all&screenshot=${includeShot ? "1" : "0"}&allDevices=${wantDual ? "1" : "0"}`,
      )) as ExtendedLiveScreenState;
      if (data) {
        setLiveState(data);
        setCachedSlotScreens((prev) => {
          let changed = false;
          const next = { ...prev };
          const assignIfChanged = (key: string, val: string | null | undefined) => {
            if (isNonBlackScreenUrl(val) && next[key] !== val) {
              next[key] = val!;
              changed = true;
            }
          };
          if (data.displayScreenshots) {
            for (const [dispId, url] of Object.entries(data.displayScreenshots)) {
              assignIfChanged(`disp:${dispId}`, url);
            }
          }
          if (data.screenDataUrl) {
            assignIfChanged("disp:0", data.screenDataUrl);
            const fgUser = data.currentUserId ?? 0;
            assignIfChanged(`user:${fgUser}`, data.screenDataUrl);
          }
          for (const slot of data.multiUserSlots || []) {
            if (slot.lastScreenDataUrl) {
              assignIfChanged(`user:${slot.userId}`, slot.lastScreenDataUrl);
              if (slot.profileCode) assignIfChanged(`prof:${slot.profileCode}`, slot.lastScreenDataUrl);
            }
          }
          if (data.deviceStates) {
            for (const [peerSerial, peerSnap] of Object.entries(data.deviceStates)) {
              if (!peerSnap || peerSerial === data.serial) continue;
              if (peerSnap.displayScreenshots) {
                for (const [dispId, url] of Object.entries(peerSnap.displayScreenshots)) {
                  assignIfChanged(`peer:${peerSerial}:disp:${dispId}`, url);
                }
              }
              if (peerSnap.screenDataUrl) {
                assignIfChanged(`peer:${peerSerial}:disp:0`, peerSnap.screenDataUrl);
              }
            }
          }
          return changed ? next : prev;
        });
      }
    } catch {
      /* ignore transient poll error */
    } finally {
      pullInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfilesAndTelemetry();
    void pullFarmLiveState(engineMode !== "pc_emulation");
  }, [dualWall, engineMode, loadProfilesAndTelemetry, pullFarmLiveState]);

  useEffect(() => {
    if (!autoStream || engineMode === "pc_emulation") return;
    const timer = window.setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      pollTickRef.current += 1;
      const h264HasLiveFrame = hasLiveMirrorFrame(0);
      const shouldIncludeShot = !h264HasLiveFrame || pollTickRef.current % 5 === 0;
      void pullFarmLiveState(shouldIncludeShot);
    }, refreshIntervalMs);
    return () => window.clearInterval(timer);
  }, [autoStream, engineMode, pullFarmLiveState, refreshIntervalMs]);

  const dispatchControl = useCallback(
    async (payload: Record<string, unknown>, toastLabel?: string) => {
      const busyKey = String(payload.action || "cmd");
      setActionBusy(busyKey);
      try {
        const res = await fetchFarmApi("/api/mobile-stealth/live-control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (res?.ok && toastLabel) {
          pushToast(toastLabel, "success");
        } else if (!res?.ok && toastLabel) {
          pushToast(`${toastLabel}: ${res?.reason || "failed"}`, "error");
        }
        window.setTimeout(() => {
          void pullFarmLiveState(true);
        }, 280);
        return res;
      } catch (err) {
        if (toastLabel) {
          pushToast(`${toastLabel}: ${err instanceof Error ? err.message : "error"}`, "error");
        }
        return null;
      } finally {
        setActionBusy("");
      }
    },
    [pullFarmLiveState, pushToast],
  );

  const handleReconnectWifiAdb = useCallback(async () => {
    setActionBusy("wifi-adb");
    try {
      const res = await fetchFarmApi("/api/android-vault/wifi-adb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res?.ok) {
        pushToast(`Wi-Fi ADB Connected: ${res.endpoint || res.host} (${res.mode || "wifi_tcp"})`, "success");
      } else {
        pushToast(`Wi-Fi ADB Reconnect: ${res?.reason || "device_offline_plug_usb_or_wake_wifi"}`, "error");
      }
      await loadProfilesAndTelemetry();
      await pullFarmLiveState(true);
    } catch (err) {
      pushToast(`Wi-Fi ADB Error: ${err instanceof Error ? err.message : "error"}`, "error");
    } finally {
      setActionBusy("");
    }
  }, [loadProfilesAndTelemetry, pullFarmLiveState, pushToast]);

  const handleSelectDevice = useCallback(
    async (targetSerial: string) => {
      if (!targetSerial) return;
      setActionBusy(`select:${targetSerial}`);
      try {
        const res = await fetchFarmApi("/api/mobile-stealth/live-control", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "select-device", serial: targetSerial }),
        });
        if (res?.ok) {
          setCachedSlotScreens({});
          resetMuxDisplayStreams();
          pushToast(
            `Switched active device to ${res.device?.model || "Android"} (${res.serial || targetSerial})`,
            "success",
          );
          await loadProfilesAndTelemetry();
          await pullFarmLiveState(true);
        } else {
          pushToast(`Device switch failed: ${res?.reason || "device_offline"}`, "error");
        }
      } catch (err) {
        pushToast(`Device switch error: ${err instanceof Error ? err.message : "error"}`, "error");
      } finally {
        setActionBusy("");
      }
    },
    [loadProfilesAndTelemetry, pullFarmLiveState, pushToast],
  );

  const handleEnsureVirtualDisplay = useCallback(async () => {
    await dispatchControl(
      { action: "ensure-virtual-display" },
      "Spawned Parallel Agent Virtual Display (1080x2400)",
    );
  }, [dispatchControl]);

  const handleEnsureVirtualDisplayPool = useCallback(async () => {
    await dispatchControl(
      { action: "ensure-virtual-display-pool", x: 4 },
      "Spawned 4x Concurrent Virtual Display Pool (D1–D4 bound to U10–U13)",
    );
  }, [dispatchControl]);

  const handleCloseVirtualDisplayPool = useCallback(async () => {
    await dispatchControl(
      { action: "close-virtual-display-pool" },
      "Closed Virtual Display Pool",
    );
  }, [dispatchControl]);

  const handleTogglePatrol = useCallback(async () => {
    const nextEnabled = !liveState?.patrolRunning;
    await dispatchControl(
      { action: nextEnabled ? "toggle-patrol" : "stop-patrol" },
      nextEnabled
        ? "Auto Patrol ON: real-time Antidetect swipe/feed behavior running"
        : "Auto Patrol paused",
    );
  }, [dispatchControl, liveState?.patrolRunning]);

  const phoneCards = useMemo<FarmPhoneCardItem[]>(() => {
    const list: FarmPhoneCardItem[] = [];
    const adbOnline = Boolean(liveState?.adbOnline);
    const serialEndpoint = liveState?.serial || deviceTelemetry?.wifiEndpoint || "192.168.0.208:42011";
    const fgUserId = liveState?.currentUserId ?? 0;
    const displays: ExtendedDisplayInfo[] = liveState?.displays || [];
    const slots = liveState?.multiUserSlots || [];
    const profileMap = new Map<string, MobileProfileRow>();
    for (const p of profiles) {
      profileMap.set(p.code, p);
    }
    const slotByUserId = new Map<number, ExtendedLiveScreenState["multiUserSlots"][number]>();
    for (const s of slots) {
      slotByUserId.set(s.userId, s);
    }

    const seenProfileCodes = new Set<string>();

    const activeAvailable = (liveState?.availableDevices || deviceTelemetry?.availableDevices || []).find(
      (d) => d.active || d.serial === liveState?.serial,
    );
    const primarySerial = activeAvailable?.serial || liveState?.serial || serialEndpoint;
    const activeDevModel = activeAvailable?.model || deviceTelemetry?.liveDeviceModel || "Pixel 6a";
    const activeDevBrand = /samsung|sm-|galaxy/i.test(activeDevModel) ? "Samsung" : "Google";
    const activeShortTag = /sm-g965|s9\+/i.test(activeDevModel)
      ? "S9+"
      : /pixel/i.test(activeDevModel)
        ? "PIXEL"
        : "DEV";

    if (engineMode !== "pc_emulation") {
      // 1. Active Physical & Virtual Displays (Display 0 + Display 1..4)
      if (displays.length > 0) {
        for (const disp of displays) {
          const isVirtual = disp.kind === "virtual";
          const activeProf = profiles.find((p) => p.activeOnPhone);
          const boundUserId = disp.assignedUserId ?? fgUserId;
          const boundSlot = slotByUserId.get(boundUserId);
          const boundCode =
            disp.assignedProfileCode ||
            boundSlot?.profileCode ||
            (isVirtual ? "AGENT" : activeProf?.code || "0005");
          const boundProf = profileMap.get(boundCode) || activeProf;
          const resolvedCUser = disp.c_user || boundSlot?.c_user || boundProf?.c_user || null;
          const resolvedFbLabel =
            disp.fbAccountName ||
            boundSlot?.fbAccountName ||
            boundProf?.fbAccountName ||
            (resolvedCUser ? `UID ${resolvedCUser}` : null);
          const resParts = String(disp.resolution || "").split("x").map((n) => Number(n));
          const parsedW = resParts.length === 2 && Number.isFinite(resParts[0]) && resParts[0] > 0 ? resParts[0] : 0;
          const parsedH = resParts.length === 2 && Number.isFinite(resParts[1]) && resParts[1] > 0 ? resParts[1] : 0;
          const is540p = disp.resolution === "540x1200";
          const is720p = disp.resolution === "720x1600";
          const rawDispScreen =
            liveState?.displayScreenshots?.[String(disp.logicalId)] ||
            cachedSlotScreens[`disp:${disp.logicalId}`] ||
            (disp.logicalId === 0 ? liveState?.screenDataUrl || null : null);
          const screenUrl = isNonBlackScreenUrl(rawDispScreen) ? rawDispScreen : null;
          if (isVirtual && !screenUrl) continue;
          if (boundCode && boundCode !== "AGENT") seenProfileCodes.add(boundCode);
          list.push({
            id: `display-${disp.logicalId}`,
            kind: "display",
            code: boundCode,
            badgeTopLeft: isVirtual ? `${activeShortTag} · D${disp.logicalId}` : `${activeShortTag} · D0`,
            badgeTone: isVirtual ? "sky" : "emerald",
            titleCode: isVirtual
              ? boundCode && boundCode !== "AGENT"
                ? `D${disp.logicalId} · #${boundCode}`
                : `D${disp.logicalId}`
              : boundCode,
            modelLabel: isVirtual
              ? `VIRTUAL ${disp.resolution || "540X1200"} · U${boundUserId}`
              : activeDevModel.toUpperCase(),
            endpointLabel: `${serialEndpoint} · Display ${disp.logicalId}`,
            subMetaLabel: resolvedFbLabel
              ? `${resolvedFbLabel} · U${boundUserId}`
              : isVirtual
                ? `Isolated Slot U${boundUserId} · 24fps H.264 Stream`
                : `Foreground U${fgUserId} · 24fps H.264 Stream`,
            displayId: disp.logicalId,
            userId: boundUserId,
            coordWidth: parsedW || (is540p ? 540 : is720p ? 720 : 1080),
            coordHeight: parsedH || (is540p ? 1200 : is720p ? 1600 : /sm-g965|s9\+/i.test(activeDevModel) ? 2220 : 2400),
            isLiveForeground: true,
            isRunning: true,
            cookieCount: boundSlot?.cookieCount || boundProf?.cookieCount || 435,
            c_user: resolvedCUser,
            fbAccountLabel: resolvedFbLabel,
            manufacturer: activeDevBrand,
            deviceSerial: primarySerial,
            screenDataUrl: screenUrl,
          });
        }
      } else {
        // Offline Display 0 placeholder so physical device screen slot stays visible at #1
        const activeProf = profiles.find((p) => p.activeOnPhone);
        const resolvedCUser = activeProf?.c_user || null;
        const resolvedFbLabel =
          activeProf?.fbAccountName || (resolvedCUser ? `UID ${resolvedCUser}` : null);
        list.push({
          id: "display-0",
          kind: "display",
          code: activeProf?.code || "0005",
          badgeTopLeft: "OFFLINE · D0",
          badgeTone: "amber",
          titleCode: activeProf?.code || "0005",
          modelLabel: `${activeDevModel} · ADB SLEEP`.toUpperCase(),
          endpointLabel: `${serialEndpoint} · Disconnected`,
          subMetaLabel: resolvedFbLabel || "Plug USB-C / Wake Wireless Debugging",
          displayId: 0,
          userId: 0,
          coordWidth: 1080,
          coordHeight: /sm-g965|s9\+/i.test(activeDevModel) ? 2220 : 2400,
          isLiveForeground: false,
          isRunning: false,
          cookieCount: activeProf?.cookieCount || 435,
          c_user: resolvedCUser,
          fbAccountLabel: resolvedFbLabel,
          manufacturer: activeDevBrand,
          deviceSerial: primarySerial,
          screenDataUrl: isNonBlackScreenUrl(cachedSlotScreens["disp:0"]) ? cachedSlotScreens["disp:0"] : null,
        });
      }

      // 1b. Dual-Device Wall: Peer connected Android devices (e.g. Galaxy S9+ beside Pixel 6a)
      if (dualWall && liveState?.deviceStates) {
        const peerEntries = Object.entries(liveState.deviceStates).filter(
          ([peerSerial, snap]) => Boolean(snap?.ok) && peerSerial && peerSerial !== primarySerial,
        );
        for (const [peerSerial, peerSnap] of peerEntries) {
          const peerAvail = (liveState.availableDevices || []).find((d) => d.serial === peerSerial);
          const peerModel = peerAvail?.model || (peerSerial.includes("120") ? "SM-G965N" : "Android");
          const peerBrand = /samsung|sm-|galaxy/i.test(peerModel) ? "Samsung" : "Google";
          const peerShortTag = /sm-g965|s9\+/i.test(peerModel)
            ? "S9+"
            : /pixel/i.test(peerModel)
              ? "PIXEL"
              : "PEER";
          const peerDefaultH = /sm-g965|s9\+/i.test(peerModel) ? 2220 : 2400;
          const peerDisplays = peerSnap.displays || [];
          const peerFgUser = peerSnap.currentUserId ?? 0;
          for (const disp of peerDisplays) {
            const isVirtual = disp.kind === "virtual";
            const boundUserId = disp.assignedUserId ?? peerFgUser;
            const resParts = String(disp.resolution || "").split("x").map((n) => Number(n));
            const parsedW = resParts.length === 2 && Number.isFinite(resParts[0]) && resParts[0] > 0 ? resParts[0] : 0;
            const parsedH = resParts.length === 2 && Number.isFinite(resParts[1]) && resParts[1] > 0 ? resParts[1] : 0;
            const rawPeerScreen =
              peerSnap.displayScreenshots?.[String(disp.logicalId)] ||
              cachedSlotScreens[`peer:${peerSerial}:disp:${disp.logicalId}`] ||
              (disp.logicalId === 0 ? peerSnap.screenDataUrl || null : null);
            const screenUrl = isNonBlackScreenUrl(rawPeerScreen) ? rawPeerScreen : null;
            if (isVirtual && !screenUrl) continue;
            list.push({
              id: `peer-${peerSerial}-display-${disp.logicalId}`,
              kind: "display",
              code: disp.assignedProfileCode || `${peerShortTag}-D${disp.logicalId}`,
              badgeTopLeft: isVirtual ? `${peerShortTag} · D${disp.logicalId}` : `${peerShortTag} · D0`,
              badgeTone: isVirtual ? "sky" : "violet",
              titleCode: isVirtual ? `${peerShortTag} · D${disp.logicalId}` : `${peerShortTag} · ${peerModel}`,
              modelLabel: isVirtual
                ? `VIRTUAL ${disp.resolution || "540X1200"} · U${boundUserId}`
                : peerModel.toUpperCase(),
              endpointLabel: `${peerSerial} · Display ${disp.logicalId}`,
              subMetaLabel: `${peerBrand} · U${boundUserId} · Dual Wall Live`,
              displayId: disp.logicalId,
              userId: boundUserId,
              coordWidth: parsedW || 1080,
              coordHeight: parsedH || peerDefaultH,
              isLiveForeground: true,
              isRunning: true,
              cookieCount: 0,
              c_user: disp.c_user || null,
              fbAccountLabel: disp.fbAccountName || `${peerShortTag} (${peerSerial.split(":")[0]})`,
              manufacturer: peerBrand,
              deviceSerial: peerSerial,
              screenDataUrl: screenUrl,
            });
          }
        }
      }

      // 2. Rooted Multi-User Isolated Slots (U0, U10..U22)
      for (const slot of slots) {
        const code = slot.profileCode || `U${slot.userId}`;
        if (slot.profileCode) seenProfileCodes.add(slot.profileCode);
        if (slot.userId === fgUserId && list.some((c) => c.id === "display-0")) continue;
        const prof = slot.profileCode ? profileMap.get(slot.profileCode) : undefined;
        const boundVirt = displays.find((d) => d.kind === "virtual" && d.assignedUserId === slot.userId);
        const rawSlotScreen =
          (boundVirt ? liveState?.displayScreenshots?.[String(boundVirt.logicalId)] : null) ||
          (adbOnline && slot.userId === fgUserId ? liveState?.screenDataUrl || cachedSlotScreens["disp:0"] : null) ||
          slot.lastScreenDataUrl ||
          cachedSlotScreens[`user:${slot.userId}`] ||
          (slot.profileCode ? cachedSlotScreens[`prof:${slot.profileCode}`] : null) ||
          null;
        const screenUrl = isNonBlackScreenUrl(rawSlotScreen) ? rawSlotScreen : null;
        const isFg = adbOnline && Boolean(boundVirt || ((slot.isForeground || slot.userId === fgUserId) && screenUrl));
        const modelStr = (prof?.model || slot.model || "Pixel 6a").toUpperCase();
        const brandStr = prof?.manufacturer || (/samsung|sm-/i.test(modelStr) ? "Samsung" : "Google");
        const resolvedCUser = slot.c_user || prof?.c_user || null;
        const resolvedFbLabel =
          slot.fbAccountName || prof?.fbAccountName || (resolvedCUser ? `UID ${resolvedCUser}` : null);
        list.push({
          id: `slot-${slot.userId}`,
          kind: "user_slot",
          code,
          badgeTopLeft: boundVirt ? `D${boundVirt.logicalId} · U${slot.userId}` : `TCP · U${slot.userId}`,
          badgeTone: isFg ? "emerald" : slot.running ? "violet" : "amber",
          titleCode: code.replace(/^#/, ""),
          modelLabel: modelStr,
          endpointLabel: serialEndpoint,
          subMetaLabel: resolvedCUser
            ? `UID ${resolvedCUser.slice(0, 12)} · ${slot.cookieCount || prof?.cookieCount || 0} ck`
            : `U${slot.userId} Isolated · ${slot.cookieCount || prof?.cookieCount || 0} ck`,
          displayId: boundVirt ? boundVirt.logicalId : 0,
          userId: slot.userId,
          coordWidth:
            boundVirt?.resolution === "540x1200"
              ? 540
              : boundVirt?.resolution === "720x1600"
                ? 720
                : 1080,
          coordHeight:
            boundVirt?.resolution === "540x1200"
              ? 1200
              : boundVirt?.resolution === "720x1600"
                ? 1600
                : 2400,
          isLiveForeground: isFg,
          isRunning: adbOnline && (slot.running || isFg),
          cookieCount: slot.cookieCount || prof?.cookieCount || 0,
          c_user: resolvedCUser,
          fbAccountLabel: resolvedFbLabel,
          manufacturer: brandStr,
          deviceSerial: primarySerial,
          screenDataUrl: screenUrl,
        });
      }
    }

    // 3. PC Android 14 Antidetect Emulation Profiles (#0001-#0054) — 100% Independent of Physical Pixel 6a
    if (engineMode !== "pixel6a_hardware") {
      for (const prof of profiles) {
        if (engineMode === "unified" && seenProfileCodes.has(prof.code)) continue;
        const pcProf = pcProfileByCode.get(prof.code);
        const isPcRunning = Boolean(
          pcProf && (pcProf.status === "running" || runningHeadlessIds.has(pcProf.id)),
        );
        const isMounted = engineMode !== "pc_emulation" && adbOnline && Boolean(prof.activeOnPhone);
        const rawProfScreen =
          (isMounted ? liveState?.screenDataUrl || cachedSlotScreens["disp:0"] : null) ||
          cachedSlotScreens[`prof:${prof.code}`] ||
          null;
        const screenUrl = isNonBlackScreenUrl(rawProfScreen) ? rawProfScreen : null;
        const resolvedCUser = prof.c_user || null;
        const resolvedFbLabel =
          prof.fbAccountName || (resolvedCUser ? `UID ${resolvedCUser}` : null);
        list.push({
          id: `profile-${prof.code}`,
          kind: "profile",
          code: prof.code,
          badgeTopLeft: isPcRunning
            ? "PC · RUNNING"
            : isMounted
              ? "MOUNTED · ADB"
              : "PC · READY",
          badgeTone: isPcRunning || isMounted ? "emerald" : "sky",
          titleCode: prof.code,
          modelLabel: `${prof.manufacturer} ${prof.model}`.toUpperCase(),
          endpointLabel: isPcRunning
            ? "PC Android 14 · Live"
            : isMounted
              ? serialEndpoint
              : `PC Emulation · AID ${prof.androidId.slice(0, 8)}`,
          subMetaLabel: resolvedCUser
            ? `UID ${resolvedCUser.slice(0, 12)} · ${prof.cookieCount} ck`
            : `${prof.glRenderer} · ${prof.cookieCount} cookies`,
          displayId: 0,
          userId: 0,
          coordWidth: 1080,
          coordHeight: 2400,
          isLiveForeground: isMounted && Boolean(screenUrl),
          isRunning: isPcRunning || isMounted,
          isPcRunning,
          cookieCount: prof.cookieCount,
          c_user: resolvedCUser,
          fbAccountLabel: resolvedFbLabel,
          manufacturer: prof.manufacturer,
          screenDataUrl: screenUrl,
        });
      }
    }

    return list;
  }, [cachedSlotScreens, deviceTelemetry, dualWall, engineMode, liveState, pcProfileByCode, profiles, runningHeadlessIds]);

  const filteredCards = useMemo(() => {
    const q = searchQuery.trim();
    return phoneCards.filter((c) => {
      if (connectionFilter === "displays" && c.kind !== "display") return false;
      if (connectionFilter === "users" && c.kind !== "user_slot") return false;
      if (connectionFilter === "wifi" && c.kind === "profile" && !c.isRunning) return false;
      if (connectionFilter === "mounted" && !c.isRunning) return false;

      if (groupFilter === "running" && !c.isRunning) return false;
      if (groupFilter === "fb_ready" && c.cookieCount <= 0 && !c.c_user) return false;
      if (groupFilter === "google" && !/google|pixel/i.test(`${c.manufacturer} ${c.modelLabel}`)) return false;
      if (groupFilter === "samsung" && !/samsung|sm-/i.test(`${c.manufacturer} ${c.modelLabel}`)) return false;

      if (q) {
        const hay = `${c.titleCode} ${c.modelLabel} ${c.endpointLabel} ${c.subMetaLabel} ${c.badgeTopLeft} ${c.c_user || ""} ${c.fbAccountLabel || ""}`;
        if (!searchTextIncludes(hay, q)) return false;
      }
      return true;
    });
  }, [connectionFilter, groupFilter, phoneCards, searchQuery]);

  const theaterCard = useMemo(
    () => (theaterCardId ? phoneCards.find((c) => c.id === theaterCardId) || null : null),
    [phoneCards, theaterCardId],
  );

  const handleCloseTheater = useCallback(() => {
    setTheaterCardId(null);
  }, []);

  const handleScreenPointerDown = useCallback((card: FarmPhoneCardItem, e: PointerEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const relX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const relY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    pointerDownRef.current = {
      cardId: card.id,
      relX,
      relY,
      startedAt: Date.now(),
    };
  }, []);

  const selectedCards = useMemo(
    () => phoneCards.filter((c) => selectedCardIds.has(c.id)),
    [phoneCards, selectedCardIds],
  );

  const handleScreenPointerUp = useCallback(
    (card: FarmPhoneCardItem, e: PointerEvent<HTMLButtonElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const endRelX = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const endRelY = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      const start = pointerDownRef.current?.cardId === card.id ? pointerDownRef.current : null;
      pointerDownRef.current = null;

      const x1 = Math.round((start ? start.relX : endRelX) * card.coordWidth);
      const y1 = Math.round((start ? start.relY : endRelY) * card.coordHeight);
      const x2 = Math.round(endRelX * card.coordWidth);
      const y2 = Math.round(endRelY * card.coordHeight);
      const distPx = Math.hypot(x2 - x1, y2 - y1);

      const batchTargets =
        selectedCardIds.has(card.id) && selectedCards.length > 1 ? selectedCards : null;

      if (start && distPx >= 45) {
        const durationMs = Math.max(180, Math.min(800, Date.now() - start.startedAt));
        setLastGestureByCard((prev) => ({
          ...prev,
          [card.id]: { type: "swipe", x: x1, y: y1, x2, y2, durationMs, ts: Date.now() },
        }));
        if (syncMaster && (liveState?.displays?.length || 0) > 1) {
          for (const d of liveState?.displays || []) {
            void dispatchControl({
              action: "swipe",
              serial: card.deviceSerial,
              displayId: d.logicalId,
              userId: d.assignedUserId ?? card.userId,
              profileCode: d.assignedProfileCode || card.code,
              x: x1,
              y: y1,
              x2,
              y2,
              durationMs,
            });
          }
        } else if (batchTargets) {
          for (const t of batchTargets) {
            void dispatchControl({
              action: "swipe",
              serial: t.deviceSerial,
              displayId: t.displayId,
              userId: t.userId,
              profileCode: t.code,
              x: Math.round((start ? start.relX : endRelX) * t.coordWidth),
              y: Math.round((start ? start.relY : endRelY) * t.coordHeight),
              x2: Math.round(endRelX * t.coordWidth),
              y2: Math.round(endRelY * t.coordHeight),
              durationMs,
            });
          }
        } else {
          void dispatchControl({
            action: "swipe",
            serial: card.deviceSerial,
            displayId: card.displayId,
            userId: card.userId,
            profileCode: card.code,
            x: x1,
            y: y1,
            x2,
            y2,
            durationMs,
          });
        }
      } else {
        setLastGestureByCard((prev) => ({
          ...prev,
          [card.id]: { type: "tap", x: x2, y: y2, ts: Date.now() },
        }));
        if (syncMaster && (liveState?.displays?.length || 0) > 1) {
          for (const d of liveState?.displays || []) {
            void dispatchControl({
              action: "tap",
              serial: card.deviceSerial,
              displayId: d.logicalId,
              userId: d.assignedUserId ?? card.userId,
              profileCode: d.assignedProfileCode || card.code,
              x: x2,
              y: y2,
            });
          }
        } else if (batchTargets) {
          for (const t of batchTargets) {
            void dispatchControl({
              action: "tap",
              serial: t.deviceSerial,
              displayId: t.displayId,
              userId: t.userId,
              profileCode: t.code,
              x: Math.round(endRelX * t.coordWidth),
              y: Math.round(endRelY * t.coordHeight),
            });
          }
        } else {
          void dispatchControl({
            action: "tap",
            serial: card.deviceSerial,
            displayId: card.displayId,
            userId: card.userId,
            profileCode: card.code,
            x: x2,
            y: y2,
          });
        }
      }
    },
    [dispatchControl, liveState?.displays, selectedCardIds, selectedCards, syncMaster],
  );

  const handleMountOnPhone = useCallback(
    async (card: FarmPhoneCardItem) => {
      setActionBusy(`mount-${card.code}`);
      try {
        const res = await fetchFarmApi("/api/mobile-stealth/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profileCode: card.code, restoreIfAvailable: true }),
        });
        if (res?.ok) {
          pushToast(`Mounted Profile #${card.code} (${card.modelLabel}) on Pixel 6a`, "success");
          await loadProfilesAndTelemetry();
          await pullFarmLiveState(true);
        } else {
          pushToast(`Mount #${card.code} on Pixel 6a failed: ${res?.reason || "adb_offline"}`, "error");
        }
      } finally {
        setActionBusy("");
      }
    },
    [loadProfilesAndTelemetry, pullFarmLiveState, pushToast],
  );

  const handleActivateCard = useCallback(
    async (card: FarmPhoneCardItem) => {
      if (card.kind === "user_slot") {
        await dispatchControl(
          { action: "switch-user", serial: card.deviceSerial, userId: card.userId },
          `Switched foreground to U${card.userId} (#${card.titleCode})`,
        );
      } else if (card.kind === "profile") {
        const pcProf = pcProfileByCode.get(card.code);
        if (pcProf && (engineMode === "pc_emulation" || !liveState?.adbOnline)) {
          if (card.isPcRunning) {
            await closeOne(pcProf);
          } else {
            await openOne(pcProf);
          }
          return;
        }
        if (pcProf && engineMode === "unified" && !card.isLiveForeground) {
          if (card.isPcRunning) {
            await closeOne(pcProf);
          } else {
            await openOne(pcProf);
          }
          return;
        }
        await handleMountOnPhone(card);
      } else {
        await pullFarmLiveState(true);
      }
    },
    [
      closeOne,
      dispatchControl,
      engineMode,
      handleMountOnPhone,
      liveState?.adbOnline,
      openOne,
      pcProfileByCode,
      pullFarmLiveState,
    ],
  );

  const handleBatchTogglePcBrowsers = useCallback(
    async (mode: "launch" | "stop") => {
      const profileCards = selectedCards.filter((c) => c.kind === "profile");
      if (profileCards.length === 0) return;
      setActionBusy(`batch-pc-${mode}`);
      try {
        for (const c of profileCards) {
          const pcProf = pcProfileByCode.get(c.code);
          if (!pcProf) continue;
          if (mode === "launch" && !c.isPcRunning) {
            await openOne(pcProf);
          } else if (mode === "stop" && c.isPcRunning) {
            await closeOne(pcProf);
          }
        }
        pushToast(
          `${mode === "launch" ? "Launched" : "Stopped"} ${profileCards.length} PC Android Emulation browser(s)`,
          "success",
        );
      } finally {
        setActionBusy("");
      }
    },
    [closeOne, openOne, pcProfileByCode, pushToast, selectedCards],
  );

  const toggleSelectCard = useCallback((id: string) => {
    setSelectedCardIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleSelectAllFiltered = useCallback(() => {
    setSelectedCardIds((prev) => {
      const allSelected =
        filteredCards.length > 0 && filteredCards.every((c) => prev.has(c.id));
      if (allSelected) {
        return new Set();
      }
      return new Set(filteredCards.map((c) => c.id));
    });
  }, [filteredCards]);

  const handleBatchLaunchApp = useCallback(
    async (packageName: string, appLabel: string) => {
      if (selectedCards.length === 0) return;
      setActionBusy(`batch-${packageName}`);
      try {
        await Promise.all(
          selectedCards.map((c) =>
            dispatchControl({
              action: "launch-app",
              serial: c.deviceSerial,
              userId: c.userId,
              displayId: c.displayId,
              packageName,
              profileCode: c.code,
            }),
          ),
        );
        pushToast(
          `Launched ${appLabel} on ${selectedCards.length} selected screen(s)`,
          "success",
        );
      } finally {
        setActionBusy("");
      }
    },
    [dispatchControl, pushToast, selectedCards],
  );

  const handleBatchWakeAndScroll = useCallback(async () => {
    if (selectedCards.length === 0) return;
    setActionBusy("batch-scroll");
    try {
      await Promise.all(
        selectedCards.map(async (c) => {
          await dispatchControl({
            action: "keyevent",
            serial: c.deviceSerial,
            displayId: c.displayId,
            userId: c.userId,
            profileCode: c.code,
            keyCode: "224",
          });
          await dispatchControl({
            action: "swipe",
            serial: c.deviceSerial,
            displayId: c.displayId,
            userId: c.userId,
            profileCode: c.code,
            x: Math.round(c.coordWidth * 0.5),
            y: Math.round(c.coordHeight * 0.76),
            x2: Math.round(c.coordWidth * 0.5),
            y2: Math.round(c.coordHeight * 0.24),
            durationMs: 320,
          });
        }),
      );
      pushToast(
        `Woke & scrolled feed across ${selectedCards.length} selected screen(s)`,
        "success",
      );
    } finally {
      setActionBusy("");
    }
  }, [dispatchControl, pushToast, selectedCards]);

  const handleBatchStopUsers = useCallback(async () => {
    const targets = selectedCards.filter(
      (c) => c.userId >= 10 && c.userId !== 95 && c.userId !== 999 && !/dual.?app|dual messenger/i.test(c.modelLabel),
    );
    if (targets.length === 0) {
      pushToast(
        "Select at least 1 secondary Multi-User slot (U10..U21) to stop (Dual App U95 is protected)",
        "info",
      );
      return;
    }
    setActionBusy("batch-stop-users");
    try {
      await Promise.all(
        targets.map((c) =>
          dispatchControl({
            action: "stop-user",
            serial: c.deviceSerial,
            userId: c.userId,
            profileCode: c.code,
          }),
        ),
      );
      await pullFarmLiveState(true);
      pushToast(
        `Stopped ${targets.length} secondary Android user slot(s)`,
        "success",
      );
    } finally {
      setActionBusy("");
    }
  }, [dispatchControl, pullFarmLiveState, pushToast, selectedCards]);

  const handleCopyCardScreenshot = useCallback(
    async (card: FarmPhoneCardItem) => {
      try {
        let sourceCanvas: HTMLCanvasElement | null = getMirrorCanvasForDisplay(card.displayId);
        if (!sourceCanvas && card.screenDataUrl) {
          const img = new Image();
          img.crossOrigin = "anonymous";
          await new Promise<void>((resolve, reject) => {
            img.onload = () => resolve();
            img.onerror = () => reject(new Error("Image load failed"));
            img.src = card.screenDataUrl!;
          });
          const off = document.createElement("canvas");
          off.width = img.naturalWidth || card.coordWidth || 540;
          off.height = img.naturalHeight || card.coordHeight || 1200;
          const ctx = off.getContext("2d");
          if (ctx) ctx.drawImage(img, 0, 0);
          sourceCanvas = off;
        }

        if (!sourceCanvas) {
          pushToast(
            `No live frame available yet for #${card.titleCode} — wake or stream first`,
            "info",
          );
          return;
        }

        const w = sourceCanvas.width;
        const h = sourceCanvas.height;
        const blob = await new Promise<Blob | null>((resolve) =>
          sourceCanvas!.toBlob((b) => resolve(b), "image/png"),
        );
        if (!blob) {
          pushToast("Failed to encode PNG screenshot", "error");
          return;
        }

        if (navigator.clipboard && typeof ClipboardItem !== "undefined") {
          await navigator.clipboard.write([
            new ClipboardItem({ "image/png": blob }),
          ]);
          pushToast(
            `Copied #${card.titleCode} PNG screenshot (${w}×${h}) to PC Clipboard`,
            "success",
          );
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `mobile-farm-${card.titleCode}-D${card.displayId}.png`;
          a.click();
          URL.revokeObjectURL(url);
          pushToast(
            `Downloaded #${card.titleCode} PNG screenshot (${w}×${h})`,
            "success",
          );
        }
      } catch {
        pushToast("Unable to copy PNG screenshot to PC Clipboard", "error");
      }
    },
    [pushToast],
  );

  const pcRunningCount = useMemo(() => {
    let count = 0;
    for (const p of profiles) {
      const pc = pcProfileByCode.get(p.code);
      if (pc && (pc.status === "running" || runningHeadlessIds.has(pc.id))) count += 1;
    }
    return count;
  }, [pcProfileByCode, profiles, runningHeadlessIds]);

  const kpiTiles = useMemo<KpiTileData[]>(() => {
    const displaysCount = liveState?.displays?.length || 1;
    const slotsCount = liveState?.multiUserSlots?.length || 13;
    const runningSlots = (liveState?.multiUserSlots || []).filter((s) => s.running).length;
    const fbSyncedCount = profiles.filter((p) => p.cookieCount > 0).length;
    const activeDev = (liveState?.availableDevices || deviceTelemetry?.availableDevices || []).find(
      (d) => d.active || d.serial === liveState?.serial,
    );
    const activeDevLabel = activeDev?.model || deviceTelemetry?.liveDeviceModel || "Pixel 6a";
    return [
      {
        prefKey: "total",
        label: engineMode === "pc_emulation" ? "PC Android Slots" : engineMode === "pixel6a_hardware" ? `${activeDevLabel} Screens` : "Farm Screens",
        value: phoneCards.length,
        emojiGlyph: STEALTH_PROFILE_KPI_STICKER.total,
        tone: "indigo",
        active: false,
        onClick: () => {
          setConnectionFilter("all");
          setGroupFilter("all");
        },
      },
      {
        prefKey: "running",
        label: "PC Emulation Mode",
        value: `${pcRunningCount}/${profiles.length || 52} Ready`,
        emojiGlyph: "💻",
        tone: "emerald",
        active: engineMode === "pc_emulation",
        onClick: () => setEngineMode((prev) => (prev === "pc_emulation" ? "unified" : "pc_emulation")),
      },
      {
        prefKey: "headless",
        label: `${activeDevLabel} Hardware`,
        value: liveState?.adbOnline ? `ONLINE · ${runningSlots}/${slotsCount} U` : `ADB STANDBY · ${displaysCount}D`,
        emojiGlyph: "📱",
        tone: liveState?.adbOnline ? "emerald" : "amber",
        active: engineMode === "pixel6a_hardware",
        onClick: () => setEngineMode((prev) => (prev === "pixel6a_hardware" ? "unified" : "pixel6a_hardware")),
      },
      {
        prefKey: "ready",
        label: "Session Ready",
        value: fbSyncedCount,
        emojiGlyph: STEALTH_PROFILE_KPI_STICKER.ready,
        tone: "emerald",
        active: groupFilter === "fb_ready",
        onClick: () => setGroupFilter((prev) => (prev === "fb_ready" ? "all" : "fb_ready")),
      },
      {
        prefKey: "failed",
        label: `${activeDevLabel} (80–85%)`,
        value: `${liveState?.hardwareHealth?.batteryLevel ?? deviceTelemetry?.batteryLevel ?? 85}% · ${(liveState?.hardwareHealth?.batteryTempC ?? deviceTelemetry?.batteryTempC ?? 30.1).toFixed(1)}°C`,
        emojiGlyph: (liveState?.hardwareHealth?.batteryLevel ?? deviceTelemetry?.batteryLevel ?? 85) <= 20 ? "⚠️" : "🔋",
        tone: (liveState?.hardwareHealth?.batteryLevel ?? deviceTelemetry?.batteryLevel ?? 85) <= 20 ? "amber" : "emerald",
        active: false,
      },
    ];
  }, [
    deviceTelemetry,
    engineMode,
    groupFilter,
    liveState?.adbOnline,
    liveState?.displays?.length,
    liveState?.hardwareHealth?.batteryLevel,
    liveState?.hardwareHealth?.batteryTempC,
    liveState?.multiUserSlots,
    pcRunningCount,
    phoneCards.length,
    profiles,
  ]);

  const countsByGroup = useMemo(() => {
    return {
      all: phoneCards.length,
      running: phoneCards.filter((c) => c.isRunning).length,
      fb_ready: phoneCards.filter((c) => c.cookieCount > 0 || Boolean(c.c_user)).length,
      google: phoneCards.filter((c) => /google|pixel/i.test(`${c.manufacturer} ${c.modelLabel}`)).length,
      samsung: phoneCards.filter((c) => /samsung|sm-/i.test(`${c.manufacturer} ${c.modelLabel}`)).length,
    };
  }, [phoneCards]);

  const batLevel = liveState?.hardwareHealth?.batteryLevel ?? deviceTelemetry?.batteryLevel ?? 85;
  const batLow = batLevel <= 22;
  const adbOnline = Boolean(liveState?.adbOnline);
  const patrolRunning = Boolean(liveState?.patrolRunning);
  const virtualPoolCount = (liveState?.displays || []).filter((d) => d.kind === "virtual").length;
  const recentEvents = liveState?.liveEvents || [];
  const icon12 = compactIconSize(12);

  const farmGridScrollRef = useRef<HTMLDivElement>(null);
  const [farmWallWidth, setFarmWallWidth] = useState(1200);
  useEffect(() => {
    const el = farmGridScrollRef.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => {
      if (el.clientWidth > 0) setFarmWallWidth(el.clientWidth);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const farmGridCols = Math.max(1, Math.floor((farmWallWidth + 10) / (cardWidth + 10)));
  const shouldVirtualizeFarmWall = filteredCards.length > HUB_VIRTUAL_ROW_THRESHOLD;
  const farmVirtualRowCount = shouldVirtualizeFarmWall
    ? Math.ceil(filteredCards.length / farmGridCols)
    : 0;
  const {
    virtualized: farmWallVirtualized,
    virtualItems: farmVirtualRowItems,
    paddingTop: farmPaddingTop,
    paddingBottom: farmPaddingBottom,
  } = useHubVirtualRows({
    count: farmVirtualRowCount,
    scrollRef: farmGridScrollRef,
    estimateSize: Math.round(cardWidth * 1.95) + 82,
    threshold: 0,
    enabled: shouldVirtualizeFarmWall,
  });
  const visibleFarmCards = useMemo(() => {
    if (!farmWallVirtualized) return filteredCards;
    const out: FarmPhoneCardItem[] = [];
    for (const rowItem of farmVirtualRowItems) {
      const start = rowItem.index * farmGridCols;
      const end = Math.min(filteredCards.length, start + farmGridCols);
      for (let i = start; i < end; i += 1) {
        const card = filteredCards[i];
        if (card) out.push(card);
      }
    }
    return out;
  }, [farmGridCols, farmVirtualRowItems, farmWallVirtualized, filteredCards]);

  return (
    <div className="hub-tab-chrome-stack flex min-h-0 flex-1 flex-col overflow-hidden">
      <HubListChromeHeader
        ariaLabel="Mobile Farm header"
        titleIcon={MonitorSmartphone}
        titleIconClass="text-emerald-300"
        title="Mobile Farm"
        metaItems={metaItems}
        versionReleaseNotesCode="P0003"
        centerStats={centerStats ?? []}
        actions={headerActions}
      />

      <div className="px-3 pt-1">
        <KpiStrip items={kpiTiles} />
      </div>

      {/* Main Split Farm Workspace: Left Control Rail + Right Multi-Screen Phone Grid */}
      <div className="flex min-h-0 flex-1 gap-2.5 overflow-hidden px-3 pb-3 pt-1">
        {!railCollapsed ? (
          <MobileFarmControlRail
            engineMode={engineMode}
            setEngineMode={setEngineMode}
            cardWidth={cardWidth}
            setCardWidth={setCardWidth}
            refreshIntervalMs={refreshIntervalMs}
            setRefreshIntervalMs={setRefreshIntervalMs}
            autoStream={autoStream}
            setAutoStream={setAutoStream}
            patrolRunning={patrolRunning}
            actionBusy={actionBusy}
            setActionBusy={setActionBusy}
            handleTogglePatrol={handleTogglePatrol}
            virtualPoolCount={virtualPoolCount}
            handleEnsureVirtualDisplayPool={handleEnsureVirtualDisplayPool}
            syncMaster={syncMaster}
            setSyncMaster={setSyncMaster}
            dualWall={dualWall}
            setDualWall={setDualWall}
            pushToast={pushToast}
            handleReconnectWifiAdb={handleReconnectWifiAdb}
            handleEnsureVirtualDisplay={handleEnsureVirtualDisplay}
            dispatchControl={dispatchControl}
            loading={loading}
            pullFarmLiveState={pullFarmLiveState}
            handleCloseVirtualDisplayPool={handleCloseVirtualDisplayPool}
            connectionFilter={connectionFilter}
            setConnectionFilter={setConnectionFilter}
            filteredCount={filteredCards.length}
            totalCount={phoneCards.length}
            countsByGroup={countsByGroup}
            groupFilter={groupFilter}
            setGroupFilter={setGroupFilter}
            adbOnline={adbOnline}
            batLow={batLow}
            batLevel={batLevel}
            deviceTelemetry={deviceTelemetry}
            liveState={liveState}
            availableDevices={
              (liveState?.availableDevices && liveState.availableDevices.length > 0
                ? liveState.availableDevices
                : deviceTelemetry?.availableDevices || []) as AvailableAdbDevice[]
            }
            handleSelectDevice={handleSelectDevice}
            onCollapse={() => setRailCollapsed(true)}
          />
        ) : null}

        {/* Right Multi-Screen Phone Wall Grid */}
        <section className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden rounded-lg border border-white/10 bg-black/20 p-2.5">
          {/* Wall Toolbar (Hub-UI SSOT Search, ResultCount & BulkActionButtons) */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
            <div className="flex items-center gap-2">
              {railCollapsed ? (
                <HubBulkActionButton
                  tone="neutral"
                  icon={<PanelLeftOpen size={icon12} aria-hidden />}
                  label="Controls"
                  title="Expand Farm Control Rail"
                  onClick={() => setRailCollapsed(false)}
                />
              ) : null}
              <HubSearchField
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search code (#0005, U10), model, UID..."
                showShortcutHint={false}
                className="w-64"
              />
              <HubResultCount
                icon={MonitorSmartphone}
                shown={filteredCards.length}
                total={phoneCards.length}
                label="screens"
              />
              <HubBulkActionButton
                tone={selectedCardIds.size > 0 ? "sky" : "neutral"}
                icon={<CheckSquare size={icon12} aria-hidden />}
                label={
                  filteredCards.length > 0 &&
                  filteredCards.every((c) => selectedCardIds.has(c.id))
                    ? "Unselect All"
                    : "Select All"
                }
                selectedCount={selectedCardIds.size > 0 ? selectedCardIds.size : undefined}
                title="Select or unselect all currently filtered screens for batch operations"
                onClick={handleSelectAllFiltered}
              />
              <HubSegmentToggle<FarmEngineMode>
                value={engineMode}
                onChange={setEngineMode}
                options={[
                  { value: "pc_emulation", label: `💻 PC Emulation (${profiles.length || 52})`, activeTone: "emerald" },
                  {
                    value: "pixel6a_hardware",
                    label: `📱 Pixel 6a (${adbOnline ? "ONLINE" : "STANDBY"})`,
                    activeTone: "emerald",
                  },
                  { value: "unified", label: "⚡ Dual View", activeTone: "emerald" },
                ]}
              />
            </div>

            {/* Global Multi-Display Pool, Auto Patrol & Hardware Keys Bar (HubBulkActionButton SSOT) */}
            <div className="flex flex-wrap items-center gap-1.5">
              <HubBulkActionButton
                tone="sky"
                icon={<Grid2x2 size={icon12} aria-hidden />}
                label={`4x Virtual Pool (${virtualPoolCount}/4)`}
                title="Spawn 4 concurrent Virtual Displays (Display 1..4) bound to Multi-User U10..U13"
                disabled={Boolean(actionBusy)}
                onClick={() => void handleEnsureVirtualDisplayPool()}
              />
              <HubBulkActionButton
                tone={patrolRunning ? "emerald" : "neutral"}
                icon={<Activity size={icon12} aria-hidden />}
                iconPulsing={patrolRunning}
                label={patrolRunning ? `Auto Patrol #${liveState?.patrolStepCount || 0}` : "Auto Patrol"}
                title="Run autonomous Antidetect feed scroll & swipe behavior across active displays"
                disabled={Boolean(actionBusy)}
                onClick={() => void handleTogglePatrol()}
              />
              <HubBulkActionButton
                tone="neutral"
                icon={<ArrowLeft size={icon12} aria-hidden />}
                label="Back"
                title="Send Android Hardware Back Key (KEYCODE_BACK)"
                onClick={() => void dispatchControl({ action: "keyevent", keyCode: "KEYCODE_BACK" }, "Sent Back Key")}
              />
              <HubBulkActionButton
                tone="neutral"
                icon={<Circle size={compactIconSize(11)} aria-hidden />}
                label="Home"
                title="Send Android Hardware Home Key (KEYCODE_HOME)"
                onClick={() => void dispatchControl({ action: "keyevent", keyCode: "KEYCODE_HOME" }, "Sent Home Key")}
              />
              <HubBulkActionButton
                tone="neutral"
                icon={<Layers size={icon12} aria-hidden />}
                label="Recents"
                title="Open Android Recent Apps Switcher (KEYCODE_APP_SWITCH)"
                onClick={() =>
                  void dispatchControl({ action: "keyevent", keyCode: "KEYCODE_APP_SWITCH" }, "Opened Recents")
                }
              />
              <HubBulkActionButton
                tone="indigo"
                icon={<HubBrandIcon brandId="facebook" size={12} />}
                label="Open FB"
                title="Launch Facebook on Foreground User"
                onClick={() =>
                  void dispatchControl(
                    {
                      action: "launch-app",
                      packageName: "com.facebook.katana",
                      userId: liveState?.currentUserId ?? 0,
                    },
                    "Launched Facebook on Foreground User",
                  )
                }
              />
              <HubBulkActionButton
                tone="sky"
                icon={<MessageCircle size={icon12} aria-hidden />}
                label="Messenger"
                title="Launch Messenger on Foreground User"
                onClick={() =>
                  void dispatchControl(
                    {
                      action: "launch-app",
                      packageName: "com.facebook.orca",
                      userId: liveState?.currentUserId ?? 0,
                    },
                    "Launched Messenger on Foreground User",
                  )
                }
              />
            </div>
          </div>

          {/* Batch Selection Action Bar */}
          {selectedCardIds.size > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-sky-400/40 bg-sky-950/30 px-2.5 py-1.5 text-xs text-sky-100">
              <div className="flex items-center gap-2">
                <CheckSquare size={compactIconSize(13)} className="shrink-0 text-sky-300" aria-hidden />
                <span>
                  <span className="tabular-nums text-white">{selectedCardIds.size}</span> screen(s) selected — Taps &amp; Swipes on any selected screen broadcast across the selection
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {selectedCards.some((c) => c.kind === "profile") ? (
                  <>
                    <HubBulkActionButton
                      tone="emerald"
                      icon={<Laptop size={icon12} aria-hidden />}
                      label="Launch PC Selected"
                      selectedCount={selectedCards.filter((c) => c.kind === "profile").length}
                      disabled={Boolean(actionBusy)}
                      title="Launch selected Android profiles in PC Emulation Browser mode (independent of Pixel 6a)"
                      onClick={() => void handleBatchTogglePcBrowsers("launch")}
                    />
                    <HubBulkActionButton
                      tone="rose"
                      icon={<Power size={icon12} aria-hidden />}
                      label="Stop PC Selected"
                      selectedCount={selectedCards.filter((c) => c.kind === "profile" && c.isPcRunning).length || undefined}
                      disabled={Boolean(actionBusy)}
                      title="Close selected running PC Emulation browsers"
                      onClick={() => void handleBatchTogglePcBrowsers("stop")}
                    />
                  </>
                ) : null}
                <HubBulkActionButton
                  tone="indigo"
                  icon={<HubBrandIcon brandId="facebook" size={12} />}
                  label="Open FB Selected"
                  selectedCount={selectedCardIds.size}
                  disabled={Boolean(actionBusy)}
                  title="Launch Facebook App across all selected screens/slots"
                  onClick={() => void handleBatchLaunchApp("com.facebook.katana", "Facebook")}
                />
                <HubBulkActionButton
                  tone="sky"
                  icon={<MessageCircle size={icon12} aria-hidden />}
                  label="Messenger Selected"
                  selectedCount={selectedCardIds.size}
                  disabled={Boolean(actionBusy)}
                  title="Launch Messenger across all selected screens/slots"
                  onClick={() => void handleBatchLaunchApp("com.facebook.orca", "Messenger")}
                />
                <HubBulkActionButton
                  tone="emerald"
                  icon={<ArrowUp size={icon12} aria-hidden />}
                  label="Wake & Scroll Selected"
                  selectedCount={selectedCardIds.size}
                  disabled={Boolean(actionBusy)}
                  title="Wake displays and perform Antidetect feed scroll across all selected screens"
                  onClick={() => void handleBatchWakeAndScroll()}
                />
                <HubBulkActionButton
                  tone="rose"
                  icon={<Power size={icon12} aria-hidden />}
                  label="Stop Users Selected"
                  selectedCount={selectedCards.filter((c) => c.userId >= 10).length || undefined}
                  disabled={Boolean(actionBusy)}
                  title="Stop selected background secondary Android users (U10..U21) to free RAM"
                  onClick={() => void handleBatchStopUsers()}
                />
                <HubBulkActionButton
                  variant="ghost"
                  tone="neutral"
                  icon={<XCircle size={icon12} aria-hidden />}
                  label="Clear"
                  title="Clear selection"
                  onClick={() => setSelectedCardIds(new Set())}
                />
              </div>
            </div>
          ) : null}

          {/* Real-Time Independent Mode Status Banner */}
          {engineMode === "pc_emulation" ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-emerald-500/30 bg-emerald-950/25 px-3 py-1.5 text-xs text-emerald-100">
              <div className="flex items-center gap-2">
                <Laptop size={compactIconSize(14)} className="shrink-0 text-emerald-300" aria-hidden />
                <span>
                  <span className="text-emerald-300">PC Android 14 Emulation Mode (Independent):</span>{" "}
                  <span className="tabular-nums text-white">{profiles.length || 52}</span> hardware fingerprints ready on PC ·{" "}
                  <span className="tabular-nums text-emerald-200">{pcRunningCount} running</span>. Click any card or{" "}
                  <span className="text-white">&ldquo;Launch PC&rdquo;</span> to open independently without Physical Pixel 6a ADB.
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px]">
                <span className="rounded border border-emerald-400/35 bg-black/40 px-2 py-0.5 text-emerald-300 tabular-nums">
                  💻 PC Emulation: ONLINE ({pcRunningCount}/{profiles.length || 52})
                </span>
                <button
                  type="button"
                  onClick={() => setEngineMode("pixel6a_hardware")}
                  className={`rounded border px-2 py-0.5 tabular-nums transition ${
                    adbOnline
                      ? "border-emerald-400/35 bg-emerald-950/40 text-emerald-200 hover:bg-emerald-900/50"
                      : "border-amber-400/35 bg-amber-950/40 text-amber-200 hover:bg-amber-900/50"
                  }`}
                  title="Switch to Physical Pixel 6a Hardware Mode"
                >
                  📱 Pixel 6a Hardware: {adbOnline ? "ONLINE" : `ADB STANDBY (${batLevel}% Wi-Fi)`}
                </button>
              </div>
            </div>
          ) : liveState && !adbOnline ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-amber-400/40 bg-amber-950/35 px-3 py-1.5 text-xs text-amber-100">
              <div className="flex items-center gap-2">
                <WifiOff size={compactIconSize(14)} className="shrink-0 text-amber-300" aria-hidden />
                <span>
                  Physical Pixel 6a (<span className="tabular-nums text-white">{liveState.serial || "192.168.0.208:42011"}</span>) is currently disconnected from ADB (last seen at{" "}
                  <span className="tabular-nums text-amber-200">{batLevel}% battery</span>). Plug USB-C charger or wake Wireless Debugging, or switch to independent PC Emulation.
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <HubBulkActionButton
                  tone="sky"
                  icon={<Laptop size={icon12} aria-hidden />}
                  label={`Use PC Emulation (${profiles.length || 52})`}
                  title="Switch to 100% independent PC Android 14 Emulation mode"
                  onClick={() => setEngineMode("pc_emulation")}
                />
                <HubBulkActionButton
                  tone="emerald"
                  icon={<Wifi size={icon12} aria-hidden />}
                  iconSpinning={actionBusy === "wifi-adb"}
                  label={actionBusy === "wifi-adb" ? "Scanning LAN…" : "Reconnect Wi-Fi / USB"}
                  title="Scan LAN for Wireless Debugging or USB ADB"
                  disabled={Boolean(actionBusy)}
                  onClick={() => void handleReconnectWifiAdb()}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-500/25 bg-emerald-950/20 px-2.5 py-1 text-xs text-emerald-100">
              <div className="flex min-w-0 items-center gap-2 overflow-hidden">
                <ShieldCheck size={13} className="shrink-0 text-emerald-400" aria-hidden />
                <span className="shrink-0 text-emerald-300">Live Antidetect Stream:</span>
                {recentEvents.length > 0 ? (
                  <div className="flex items-center gap-2 truncate text-white/90">
                    {recentEvents.slice(0, 3).map((ev) => (
                      <span
                        key={ev.id}
                        className="inline-flex items-center gap-1 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-sky-200 border border-white/10"
                      >
                        <span className="text-emerald-300">D{ev.displayId}</span>
                        <span>·</span>
                        <span className="truncate max-w-[240px]">{ev.label}</span>
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="truncate text-hub-muted">
                    Click or drag on any live screen to Tap / Swipe, or click &ldquo;4x Virtual Pool&rdquo; + &ldquo;Auto Patrol&rdquo; for concurrent behavior.
                  </span>
                )}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-1.5 tabular-nums text-[10px]">
                {liveState?.hardwareHealth?.ok ? (
                  <>
                    <span
                      className="rounded border border-emerald-400/30 bg-black/40 px-1.5 py-0.5 text-emerald-300"
                      title="Available RAM on Pixel 6a"
                    >
                      RAM {((liveState.hardwareHealth.ramAvailableMb || 0) / 1024).toFixed(2)}GB free
                    </span>
                    <span
                      className="rounded border border-sky-400/30 bg-black/40 px-1.5 py-0.5 text-sky-300"
                      title="Available ZRAM Swap on Pixel 6a"
                    >
                      Swap {((liveState.hardwareHealth.swapFreeMb || 0) / 1024).toFixed(2)}GB free
                    </span>
                    <span
                      className="rounded border border-white/15 bg-black/40 px-1.5 py-0.5 text-white/90"
                      title="Battery Level, Temperature & Never-Power-Off Hardware Charge Band (80-85%)"
                    >
                      🔋 {liveState.hardwareHealth.batteryLevel ?? batLevel}% ·{" "}
                      {typeof liveState.hardwareHealth.batteryTempC === "number"
                        ? `${liveState.hardwareHealth.batteryTempC.toFixed(1)}°C `
                        : ""}
                      ({liveState.hardwareHealth.chargeStartLevel ?? 80}–{liveState.hardwareHealth.chargeStopLevel ?? 85}%)
                    </span>
                    <span
                      className="rounded border border-white/15 bg-black/40 px-1.5 py-0.5 text-emerald-200"
                      title="Running Android Users & Physical Display 0 State"
                    >
                      U:{liveState.hardwareHealth.runningUserCount ?? 1}/{liveState.hardwareHealth.totalUserCount ?? 10} · D0{" "}
                      {liveState.hardwareHealth.display0Off !== false ? "OFF" : "ON"}
                    </span>
                  </>
                ) : null}
                <span className="text-emerald-300">
                  {adbOnline
                    ? `Eco 850Kbps · 20fps H.264 + ${(1000 / refreshIntervalMs).toFixed(1)}fps`
                    : "Standby"}
                </span>
              </div>
            </div>
          )}

          {/* Multi-Screen Phone Wall Grid */}
          <div ref={farmGridScrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
            {farmWallVirtualized && farmPaddingTop > 0 ? (
              <div aria-hidden style={{ height: `${farmPaddingTop}px` }} />
            ) : null}
            <div
              className="grid gap-2.5"
              style={{
                gridTemplateColumns: `repeat(auto-fill, minmax(${cardWidth}px, 1fr))`,
              }}
            >
              {visibleFarmCards.map((card) => (
                <MobileFarmPhoneCard
                  key={card.id}
                  card={card}
                  isSelected={selectedCardIds.has(card.id)}
                  localGesture={lastGestureByCard[card.id]}
                  adbOnline={adbOnline}
                  autoStream={autoStream}
                  engineMode={engineMode}
                  toggleSelectCard={toggleSelectCard}
                  handleScreenPointerDown={handleScreenPointerDown}
                  handleScreenPointerUp={handleScreenPointerUp}
                  onOpenTheater={setTheaterCardId}
                  handleActivateCard={handleActivateCard}
                  handleMountOnPhone={handleMountOnPhone}
                  dispatchControl={dispatchControl}
                  handleCopyCardScreenshot={handleCopyCardScreenshot}
                />
              ))}
            </div>
            {farmWallVirtualized && farmPaddingBottom > 0 ? (
              <div aria-hidden style={{ height: `${farmPaddingBottom}px` }} />
            ) : null}
          </div>
        </section>
      </div>

      <MobileFarmTheaterOverlay
        theaterCard={theaterCard}
        adbOnline={adbOnline}
        localGesture={theaterCard ? lastGestureByCard[theaterCard.id] : undefined}
        onClose={handleCloseTheater}
        handleScreenPointerDown={handleScreenPointerDown}
        handleScreenPointerUp={handleScreenPointerUp}
        dispatchControl={(payload, toastLabel) =>
          dispatchControl(
            theaterCard?.deviceSerial && !payload.serial
              ? { serial: theaterCard.deviceSerial, ...payload }
              : payload,
            toastLabel,
          )
        }
        handleCopyCardScreenshot={handleCopyCardScreenshot}
        handleActivateCard={handleActivateCard}
        pushToast={pushToast}
      />
    </div>
  );
});
