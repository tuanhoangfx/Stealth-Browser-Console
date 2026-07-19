/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useMemo, useState } from "react";
import { useDirectoryBandSync, type DirectoryBandHandlers } from "./useDirectoryBandSync";

type BandState = {
  kpis?: { label: string }[];
  charts: string | null;
  sectionRuleLabel?: string;
};

function useBandHarness(enabled: boolean) {
  const [band, setBand] = useState<BandState>({
    kpis: [{ label: "Mail" }],
    charts: "mail-chart",
    sectionRuleLabel: "Mail",
  });
  const handlers = useMemo<DirectoryBandHandlers>(
    () => ({
      setDirectoryKpis: (kpis) => setBand((prev) => ({ ...prev, kpis: kpis as BandState["kpis"] })),
      setDirectoryCharts: (charts) => setBand((prev) => ({ ...prev, charts: (charts as string | null) ?? null })),
      setSectionRuleLabel: (label) => setBand((prev) => ({ ...prev, sectionRuleLabel: label })),
    }),
    [],
  );

  useDirectoryBandSync(
    {
      kpis: [{ label: "Services" }] as never,
      charts: "services-chart" as never,
      sectionRuleLabel: "Services",
      kpiKey: "services-kpi",
      chartsKey: "services-chart",
    },
    handlers,
    enabled,
  );

  return band;
}

function useBandHarnessEmptyPulse(enabled: boolean) {
  const [band, setBand] = useState<BandState>({
    kpis: [{ label: "Mail" }],
    charts: "mail-chart",
    sectionRuleLabel: "Mail",
  });
  const handlers = useMemo<DirectoryBandHandlers>(
    () => ({
      setDirectoryKpis: (kpis) => setBand((prev) => ({ ...prev, kpis: kpis as BandState["kpis"] })),
      setDirectoryCharts: (charts) => setBand((prev) => ({ ...prev, charts: (charts as string | null) ?? null })),
      setSectionRuleLabel: (label) => setBand((prev) => ({ ...prev, sectionRuleLabel: label })),
    }),
    [],
  );

  useDirectoryBandSync(
    {
      kpis: [] as never,
      charts: null,
      sectionRuleLabel: undefined,
      kpiKey: "",
      chartsKey: "",
    },
    handlers,
    enabled,
  );

  return band;
}

describe("useDirectoryBandSync", () => {
  it("keeps last snapshot while disabled", () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useBandHarness(enabled),
      { initialProps: { enabled: true } },
    );

    expect(result.current.kpis?.[0]?.label).toBe("Services");
    expect(result.current.charts).toBe("services-chart");
    expect(result.current.sectionRuleLabel).toBe("Services");

    rerender({ enabled: false });
    expect(result.current.kpis?.[0]?.label).toBe("Services");
    expect(result.current.charts).toBe("services-chart");
    expect(result.current.sectionRuleLabel).toBe("Services");
  });

  it("keeps last snapshot when enabled push is empty (stale-while-revalidate)", () => {
    const { result } = renderHook(() => useBandHarnessEmptyPulse(true));
    expect(result.current.kpis?.[0]?.label).toBe("Mail");
    expect(result.current.charts).toBe("mail-chart");
    expect(result.current.sectionRuleLabel).toBe("Mail");
  });
});
