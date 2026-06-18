import type { ReactNode } from "react";

export type HubToolDetailIdentityHeaderProps = {
  /** `aria-labelledby` target on the modal. */
  titleId: string;
  title: string;
  /** Avatar, site icon, role badge — left of title. */
  leading?: ReactNode;
  /** Domain, email, meta chips — right of title. */
  trailing?: ReactNode;
};

/** Golden tool-detail header — P0004 User Access · P0020 Cookie Route. */
export function HubToolDetailIdentityHeader({
  titleId,
  title,
  leading,
  trailing,
}: HubToolDetailIdentityHeaderProps) {
  return (
    <header className="user-access-modal__header">
      <div className="user-access-modal__header-main min-w-0 flex-1">
        {leading}
        <h2
          id={titleId}
          className="user-access-modal__header-name min-w-0 truncate text-sm font-semibold text-[var(--text)]"
        >
          {title}
        </h2>
        {trailing}
      </div>
    </header>
  );
}
