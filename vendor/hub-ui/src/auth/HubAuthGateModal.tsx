import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LogIn, UserPlus, UserRound } from "lucide-react";
import { HubModalCloseButton } from "../shell/HubModalCloseButton";
import { compactIconSize } from "../ui-scale";
import { formatHubAuthToolInfo, type HubAuthToolInfo } from "./hub-auth-tool-info";
import { formatHubAuthErrorMessage, normalizeHubAuthError, type NormalizeHubAuthErrorOptions } from "./normalize-hub-auth-error";

type AuthMode = "signin" | "signup" | "anonymous";

export type HubAuthGateModalProps = {
  open: boolean;
  onClose: () => void;
  onAuthed?: () => void;
  onAnonymous?: () => void;
  /** When false, × / backdrop / Escape do not dismiss (P0004 hub gate). */
  dismissible?: boolean;
  title: string;
  toolInfo?: HubAuthToolInfo;
  /** @deprecated Use toolInfo */
  subtitle?: string;
  headerLeading?: ReactNode;
  showFieldHints?: boolean;
  submitPlacement?: "form" | "footer";
  errorOptions?: NormalizeHubAuthErrorOptions;
  anonymousHint?: string;
  onSubmit: (
    login: string,
    password: string,
    mode: Exclude<AuthMode, "anonymous">,
  ) => Promise<void | { error?: string }>;
  onForgotPassword?: (login: string) => Promise<string | void>;
};

export function HubAuthGateModal({
  open,
  onClose,
  onAuthed,
  onAnonymous,
  dismissible = true,
  title,
  toolInfo,
  subtitle,
  headerLeading,
  onSubmit,
  onForgotPassword,
  errorOptions,
  anonymousHint = "Browse with limited features. Cloud sync and vault require sign-in.",
}: HubAuthGateModalProps) {
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<AuthMode>("signin");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, dismissible, onClose]);

  const toolLine = toolInfo ? formatHubAuthToolInfo(toolInfo) : subtitle?.trim() || "";
  const SubmitIcon = mode === "signin" ? LogIn : UserPlus;
  const showAnonymous = Boolean(onAnonymous);

  const submit = async (e?: FormEvent) => {
    e?.preventDefault();
    if (mode === "anonymous") return;
    setBusy(true);
    setMessage("");
    try {
      const result = await onSubmit(login, password, mode);
      if (result && "error" in result && result.error) {
        setMessage(normalizeHubAuthError(result.error, errorOptions));
        setBusy(false);
        return;
      }
      setBusy(false);
      onAuthed?.();
    } catch (err) {
      setBusy(false);
      setMessage(normalizeHubAuthError(err, errorOptions));
    }
  };

  const onForgot = async () => {
    if (!onForgotPassword) return;
    setBusy(true);
    setMessage("");
    try {
      const msg = await onForgotPassword(login);
      setBusy(false);
      if (msg) setMessage(msg);
    } catch (err) {
      setBusy(false);
      setMessage(err instanceof Error ? err.message : "Enter your linked email first.");
    }
  };

  if (!open) return null;

  const handleBackdrop = () => {
    if (dismissible) onClose();
  };

  return createPortal(
    <div
      className="auth-gate-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-gate-title"
    >
      <div className="auth-gate-backdrop" aria-hidden="true" onClick={handleBackdrop} />
      <div className="auth-gate-panel auth-gate-panel--modal hub-modal-frame">
        {dismissible ? (
          <HubModalCloseButton onClose={onClose} aria-label="Close sign in" />
        ) : null}
        {headerLeading ? <div className="auth-gate-brand">{headerLeading}</div> : null}
        <h2 id="auth-gate-title" className="auth-gate-title">
          {title}
        </h2>
        {toolLine ? <p className="auth-gate-tool-info">{toolLine}</p> : null}
        <div
          className={`auth-gate-tabs${showAnonymous ? " auth-gate-tabs--triple" : ""}`}
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signin"}
            className={`auth-gate-tab${mode === "signin" ? " auth-gate-tab--active" : ""}`}
            onClick={() => {
              setMode("signin");
              setMessage("");
            }}
          >
            <LogIn size={compactIconSize(14)} className="auth-gate-tab__icon" aria-hidden />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "signup"}
            className={`auth-gate-tab${mode === "signup" ? " auth-gate-tab--active" : ""}`}
            onClick={() => {
              setMode("signup");
              setMessage("");
            }}
          >
            <UserPlus size={compactIconSize(14)} className="auth-gate-tab__icon" aria-hidden />
            <span>Sign Up</span>
          </button>
          {showAnonymous ? (
            <button
              type="button"
              role="tab"
              aria-selected={mode === "anonymous"}
              className={`auth-gate-tab auth-gate-tab--anonymous${mode === "anonymous" ? " auth-gate-tab--active" : ""}`}
              onClick={() => {
                setMode("anonymous");
                setMessage("");
              }}
            >
              <UserRound size={compactIconSize(14)} className="auth-gate-tab__icon" aria-hidden />
              <span>Anonymous</span>
            </button>
          ) : null}
        </div>
        {mode === "anonymous" ? (
          <div className="auth-gate-anonymous">
            <p className="auth-gate-anonymous__hint">{anonymousHint}</p>
            <button
              type="button"
              className="auth-gate-submit auth-gate-submit--anonymous"
              disabled={busy}
              onClick={() => onAnonymous?.()}
            >
              <UserRound size={compactIconSize(16)} aria-hidden />
              <span>Continue as Anonymous</span>
            </button>
          </div>
        ) : (
          <form className="auth-gate-form" onSubmit={(e) => void submit(e)}>
            <input
              className="field auth-gate-field w-full"
              type="text"
              name="login"
              placeholder="User ID or email"
              autoComplete="username"
              value={login}
              onChange={(e) => setLogin(e.target.value)}
              required
            />
            <div className="auth-gate-password-wrap">
              <input
                className="field auth-gate-field w-full"
                type="password"
                name="password"
                placeholder="Password"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {mode === "signin" && onForgotPassword ? (
                <button
                  type="button"
                  className="auth-gate-forgot"
                  disabled={busy}
                  onClick={() => void onForgot()}
                >
                  Forgot Password?
                </button>
              ) : null}
            </div>
            {message ? <p className="auth-gate-message">{message}</p> : null}
            <button type="submit" className="auth-gate-submit" disabled={busy}>
              <SubmitIcon size={compactIconSize(16)} aria-hidden />
              <span>{busy ? "Please wait…" : mode === "signin" ? "Sign In" : "Sign Up"}</span>
            </button>
          </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
