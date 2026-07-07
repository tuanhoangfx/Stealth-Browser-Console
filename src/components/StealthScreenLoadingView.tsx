import { HubToolScreenChunkFallback, type HubLoadingViewProps } from "@tool-workspace/hub-ui";

/** Golden Suspense chunk fallback — tool icon from HubToolLoadingProvider. */
export function StealthScreenLoadingView({
  enabled = true,
  portaled = true,
  variant = "overlay",
}: {
  /** @deprecated Ignored — tool catalog icon is SSOT. */
  screen?: string;
  enabled?: boolean;
  portaled?: boolean;
  variant?: HubLoadingViewProps["variant"];
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <HubToolScreenChunkFallback variant={variant} enabled={enabled} portaled={portaled} />
    </div>
  );
}
