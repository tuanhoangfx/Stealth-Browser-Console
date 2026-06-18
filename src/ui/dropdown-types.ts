export type DropdownOption = {
  value: string;
  label: string;
  tone?: "neutral" | "all" | "group" | "platform" | "status" | "ready" | "opening" | "running" | "failed";
  dotTone?:
    | "blue"
    | "teal"
    | "violet"
    | "amber"
    | "rose"
    | "cyan"
    | "lime"
    | "indigo"
    | "orange"
    | "pink"
    | "emerald"
    | "sky";
};
