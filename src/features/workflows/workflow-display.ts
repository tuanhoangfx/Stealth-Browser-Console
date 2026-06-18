import {
  Bot,
  Camera,
  Github,
  Globe2,
  GraduationCap,
  Instagram,
  Layers3,
  MessageCircle,
  Play,
  ShieldCheck
} from "lucide-react";
import type { DropdownOption } from "../../ui/dropdown-types";
import type { WorkflowConfig, WorkflowIconKey, WorkflowId } from "./workflow-types";

export function workflowIconFor(icon: WorkflowIconKey) {
  if (icon === "globe") return Globe2;
  if (icon === "camera") return Camera;
  if (icon === "shield") return ShieldCheck;
  if (icon === "education") return GraduationCap;
  if (icon === "layers") return Layers3;
  return Play;
}

export function workflowPlatformIconFor(platform: string) {
  const value = platform.toLowerCase();
  if (value.includes("github")) return Github;
  if (value.includes("instagram")) return Instagram;
  if (value.includes("facebook")) return MessageCircle;
  if (value.includes("claude")) return Bot;
  if (value.includes("grok")) return Bot;
  if (value.includes("google")) return Globe2;
  return workflowIconFor("play");
}

export function inferWorkflowPlatform(targetUrl: string, fallback: string) {
  const value = String(targetUrl || "").toLowerCase();
  if (value.includes("chatgpt.com") || value.includes("openai.com")) return "OpenAI";
  if (value.includes("higgsfield.ai")) return "Higgsfield";
  if (value.includes("login.live.com") || value.includes("outlook.live.com") || value.includes("hotmail.com") || value.includes("microsoft.com")) return "Microsoft";
  if (value.includes("github.com")) return "GitHub";
  if (value.includes("forms.gle") || value.includes("docs.google.com/forms")) return "Google Forms";
  if (value.includes("google.com") || value.includes("googleusercontent.com") || value.includes("one.google.com")) return "Google";
  if (value.includes("facebook.com") || value.includes("fb.com")) return "Facebook";
  if (value.includes("instagram.com")) return "Instagram";
  if (value.includes("claude.ai") || value.includes("anthropic.com")) return "Claude";
  if (value.includes("grok.com") || value.includes("x.ai")) return "Grok";
  return fallback || "Generic";
}

export function workflowDisplayPlatform(workflow: WorkflowConfig) {
  return inferWorkflowPlatform(workflow.targetUrl, workflow.platform);
}

export function workflowPlatformSlug(platform: string) {
  const value = platform.toLowerCase();
  if (value.includes("github")) return "github";
  if (value.includes("instagram")) return "instagram";
  if (value.includes("facebook")) return "facebook";
  if (value.includes("claude")) return "claude";
  if (value.includes("grok")) return "grok";
  if (value.includes("openai") || value.includes("chatgpt")) return "openai";
  if (value.includes("microsoft") || value.includes("hotmail") || value.includes("outlook")) return "microsoft";
  if (value.includes("google")) return "google";
  return "";
}

export function workflowPlatformSvgUrl(platform: string) {
  const slug = workflowPlatformSlug(platform);
  if (!slug) return "";
  return `https://cdn.jsdelivr.net/gh/glincker/thesvg@main/public/icons/${slug}/default.svg`;
}

export function workflowPlatformTone(platform: string) {
  const value = platform.toLowerCase();
  if (value.includes("github")) return "workflow-platform-github";
  if (value.includes("instagram")) return "workflow-platform-instagram";
  if (value.includes("facebook")) return "workflow-platform-facebook";
  if (value.includes("claude")) return "workflow-platform-claude";
  if (value.includes("grok")) return "workflow-platform-grok";
  if (value.includes("openai") || value.includes("chatgpt")) return "workflow-platform-openai";
  if (value.includes("microsoft") || value.includes("hotmail") || value.includes("outlook")) return "workflow-platform-microsoft";
  if (value.includes("google")) return "workflow-platform-google";
  if (value.includes("higgsfield")) return "workflow-platform-higgsfield";
  return "workflow-platform-generic";
}

export function workflowDisplayId(id: WorkflowId, builtinWorkflows: WorkflowConfig[]) {
  const index = builtinWorkflows.findIndex((workflow) => workflow.id === id);
  const fallbackIndex = Math.abs(
    String(id)
      .split("")
      .reduce((total, char) => total + char.charCodeAt(0), 0)
  );
  return `WF${String((index >= 0 ? index + 1 : fallbackIndex) || 1).padStart(5, "0").slice(-5)}`;
}

export function toneFromSeed(seed: string): NonNullable<DropdownOption["dotTone"]> {
  const palette: NonNullable<DropdownOption["dotTone"]>[] = [
    "blue",
    "teal",
    "violet",
    "amber",
    "rose",
    "cyan",
    "lime",
    "indigo",
    "orange",
    "pink",
    "emerald",
    "sky"
  ];
  const hash = String(seed)
    .split("")
    .reduce((total, char) => total + char.charCodeAt(0), 0);
  return palette[Math.abs(hash) % palette.length];
}
