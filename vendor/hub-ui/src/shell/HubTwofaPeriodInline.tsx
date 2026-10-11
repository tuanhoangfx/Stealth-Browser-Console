export type HubTwofaPeriodTone = "fresh" | "warn" | "urgent";

/** P0020 Time — cyan >20s · amber 11–20s · rose ≤10s. */
export function hubTwofaPeriodTone(secondsLeft: number): HubTwofaPeriodTone {
  if (secondsLeft > 20) return "fresh";
  if (secondsLeft > 10) return "warn";
  return "urgent";
}

export function hubTwofaPeriodDotClass(tone: HubTwofaPeriodTone): string {
  return `hub-twofa-period-dot hub-twofa-period-dot--${tone}`;
}

export type HubTwofaPeriodInlineProps = {
  secondsLeft: number;
};

/**
 * Directory Time cell — colored period dot + `{n}s`.
 * Not the OTP code badge (`HUB_TWOFA_CODE_BADGE_CLASS`).
 */
export function HubTwofaPeriodInline({ secondsLeft }: HubTwofaPeriodInlineProps) {
  const tone = hubTwofaPeriodTone(secondsLeft);
  return (
    <span className="hub-twofa-period-inline" title={`${secondsLeft}s remaining`}>
      <span className={hubTwofaPeriodDotClass(tone)} aria-hidden />
      <span className="hub-twofa-period-label tabular-nums">{secondsLeft}s</span>
    </span>
  );
}
