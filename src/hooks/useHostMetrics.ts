import { createSharedHostMetricsHook } from "@tool-workspace/hub-ui";
import { fetchHostMetrics } from "../api";
import type { HostMetrics } from "../types";

const stealthHostMetrics = createSharedHostMetricsHook<HostMetrics>(fetchHostMetrics);

/** Live host CPU / RAM — one IPC poll shared across visited screens. */
export const { useHostMetrics, readCurrentMetrics, refreshNow } = stealthHostMetrics;
