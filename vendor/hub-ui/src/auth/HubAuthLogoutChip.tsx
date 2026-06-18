import { LogOut, User } from "lucide-react";
import { compactIconSize } from "../ui-scale";

export type HubAuthLogoutChipProps = {
  email: string;
  onOpenUser?: () => void;
  onLogout: () => void;
  disabled?: boolean;
  signingOut?: boolean;
  linked?: boolean;
  className?: string;
};

/** Header User chip — email + LogOut icon (golden auth panel styling). */
export function HubAuthLogoutChip({
  email,
  onOpenUser,
  onLogout,
  disabled = false,
  signingOut = false,
  linked = false,
  className = "",
}: HubAuthLogoutChipProps) {
  const label = email.trim() || "User";
  const busy = disabled || signingOut;

  return (
    <div
      className={`hub-auth-logout-chip${linked ? " hub-auth-logout-chip--linked" : ""}${className ? ` ${className}` : ""}`.trim()}
    >
      <button
        type="button"
        className="hub-auth-logout-chip__identity"
        onClick={onOpenUser}
        disabled={busy || !onOpenUser}
        title={onOpenUser ? `${label} — User details` : label}
        aria-label={onOpenUser ? `Open user details for ${label}` : label}
      >
        <User size={compactIconSize(14)} className="hub-auth-logout-chip__user-icon" aria-hidden />
        <span className="hub-auth-logout-chip__email">{label}</span>
      </button>
      <button
        type="button"
        className="hub-auth-logout-chip__logout"
        onClick={onLogout}
        disabled={busy}
        title={signingOut ? "Signing out…" : "Log out"}
        aria-label={signingOut ? "Signing out" : "Log out"}
      >
        <LogOut size={compactIconSize(14)} aria-hidden />
      </button>
    </div>
  );
}
