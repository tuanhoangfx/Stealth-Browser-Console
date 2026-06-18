import type { ReactNode } from "react";

export type ScriptStepCategoryKey = "page" | "interact" | "capture" | "logic";

export type ScriptsViewProps = {
  headerActions?: ReactNode;
};
