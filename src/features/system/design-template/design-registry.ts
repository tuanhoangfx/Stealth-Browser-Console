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

/** Locked 2026-06 — GroupCreatorPanel toolbar selection chip Design V5 Quiet bloom. */
export const DIRECTORY_TOOLBAR_SELECTION_DESIGN_LOCK = "V5" as const;

