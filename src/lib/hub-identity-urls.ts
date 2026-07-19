import { createHubIdentityUrls } from "@tool-workspace/hub-identity";

const urls = createHubIdentityUrls({
  dev: import.meta.env.DEV,
});

export const { resolveToolHubOrigin, isToolHubOrigin } = urls;
