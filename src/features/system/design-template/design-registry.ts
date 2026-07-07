export type DesignFeatureId = never;

export type ActiveDesignFeature = {
  id: DesignFeatureId;
  title: string;
  subtitle: string;
  project: string;
};

const FEATURES: ActiveDesignFeature[] = [];

export function listActiveDesignFeatures(): ActiveDesignFeature[] {
  return FEATURES;
}

export function getActiveDesignFeature(_id: string): ActiveDesignFeature | null {
  return null;
}

export const ACTIVE_DESIGN_COUNT = FEATURES.length;

/** Locked 2026-07-06 — Run History Design V1 Chip lanes. */
export const RUN_HISTORY_DESIGN_LOCK = "V1" as const;

/** Locked 2026-07-06 — Workflow canvas Design V5 Spaced bezier flow. */
export const WORKFLOW_CANVAS_LAYOUT_DESIGN_LOCK = "V5" as const;

/** Locked 2026-06 — GroupCreatorPanel toolbar selection chip Design V5 Quiet bloom. */
export const DIRECTORY_TOOLBAR_SELECTION_DESIGN_LOCK = "V5" as const;
