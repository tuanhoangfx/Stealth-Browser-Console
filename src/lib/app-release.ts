import {
  resolveAppVersionReleaseMeta as hubResolveAppVersionReleaseMeta,
  type AppVersionReleaseMeta,
  type ToolManifestReleaseSlice,
} from "@tool-workspace/hub-ui";
import { APP_VERSION } from "./app-meta";
import toolManifest from "../../tool.manifest.json";

export type { AppVersionReleaseMeta };

/** Header release activity — manifest SSOT via hub-ui. */
export function resolveAppVersionReleaseMeta(): AppVersionReleaseMeta {
  return hubResolveAppVersionReleaseMeta({
    appVersion: APP_VERSION,
    manifest: toolManifest as ToolManifestReleaseSlice,
  });
}
