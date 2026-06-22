import { describe, expect, it } from "vitest";
import {
  doesStayOverlapWindow,
  getTimelineBlockMetrics,
  getTimelineNowMarker,
  getTimelinePhase,
  prepareCanonicalTimelineStays,
  TIMELINE_PHASE,
} from "../src/client/pages/create-order.timeline";
import { mergeTreatmentSessionPatch } from "../src/client/api/spaCheckoutCacheHelpers.js";

const makeStay = (overrides = {}) => ({
  maPhien: "LT00001",
  maLichHen: "BK00001",
  maGiuong: "G201",
  maNhanVien: "NV001",
  tenKhach: "Khach A",
  batDauAt: "2026-06-13T09:00:00.000Z",
  ketThucDuKien: "2026-06-13T10:00:00.000Z",
  ketThucThucTe: "",
  trangThaiPhien: "IN_HOUSE",
  thoiLuongPhut: 60,
  ...overrides,
});

describe("create-order timeline helpers", () => {
  it("marks TEMP duplicate as ghost when persisted booking exists", () => {
    const nowMs = new Date("2026-06-13T09:30:00.000Z").getTime();
    const rows = prepareCanonicalTimelineStays(
      [
        makeStay({
          maPhien: "TEMP-1730000000000",
          maLichHen: "BK00001",
          batDauAt: "2026-06-13T09:00:00.000Z",
        }),
        makeStay({
          maPhien: "LT00088",
          maLichHen: "BK00001",
          batDauAt: "2026-06-13T09:05:00.000Z",
        }),
      ],
      nowMs,
    );

    const tempRow = rows.find((row) => String(row.maPhien || "").startsWith("TEMP-"));
    const liveRow = rows.find((row) => row.maPhien === "LT00088");
    expect(tempRow?._timelineGhostConflict).toBe(true);
    expect(liveRow?._timelineLive).toBe(true);
  });

  it("keeps live IN_HOUSE block visible through current time", () => {
    const nowMs = new Date("2026-06-13T09:45:00.000Z").getTime();
    const stay = makeStay({
      batDauAt: "2026-06-13T09:00:00.000Z",
      ketThucDuKien: "2026-06-13T10:00:00.000Z",
    });
    const rangeStartMs = new Date("2026-06-13T00:00:00.000Z").getTime();
    const rangeEndMs = new Date("2026-06-13T23:59:59.999Z").getTime();

    const metrics = getTimelineBlockMetrics({
      stay,
      rangeStartMs,
      rangeEndMs,
      fallbackMinutes: 30,
      nowMs,
    });

    expect(metrics).not.toBeNull();
    expect(getTimelinePhase(stay, nowMs, 30)).toBe(TIMELINE_PHASE.CURRENT);
    expect(metrics.heightPct).toBeGreaterThan(0);
  });

  it("returns now marker inside day range only", () => {
    const rangeStartMs = new Date("2026-06-13T00:00:00.000Z").getTime();
    const rangeEndMs = new Date("2026-06-13T23:59:59.999Z").getTime();
    const nowMs = new Date("2026-06-13T09:30:00.000Z").getTime();

    const marker = getTimelineNowMarker({ nowMs, rangeStartMs, rangeEndMs });
    expect(marker).not.toBeNull();
    expect(marker.topPct).toBeGreaterThan(30);
    expect(marker.topPct).toBeLessThan(45);
  });

  it("keeps checked-out session visible after partial checkout patch", () => {
    const nowMs = new Date("2026-06-13T10:30:00.000Z").getTime();
    const rangeStartMs = new Date("2026-06-13T00:00:00.000Z").getTime();
    const rangeEndMs = new Date("2026-06-13T23:59:59.999Z").getTime();
    const stay = mergeTreatmentSessionPatch(makeStay(), {
      trangThaiPhien: "CHECKED_OUT",
      ketThucThucTe: "2026-06-13T10:15:00.000Z",
      batDauAt: "",
      ketThucDuKien: "",
    });

    expect(
      doesStayOverlapWindow({
        stay,
        rangeStartMs,
        rangeEndMs,
        fallbackMinutes: 30,
        nowMs,
      }),
    ).toBe(true);
    expect(getTimelinePhase(stay, nowMs, 30)).toBe(TIMELINE_PHASE.PAST);
    expect(
      getTimelineBlockMetrics({
        stay,
        rangeStartMs,
        rangeEndMs,
        fallbackMinutes: 30,
        nowMs,
      }),
    ).not.toBeNull();
  });
});
