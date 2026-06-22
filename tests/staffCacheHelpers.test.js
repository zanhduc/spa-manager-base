import { beforeEach, describe, expect, it } from "vitest";
import { readCachedAttendanceRowsForRange } from "../src/client/api/staffCacheHelpers.js";

const CACHE_PREFIX = "soanhang_api_cache_v1:guest:";

describe("readCachedAttendanceRowsForRange", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("merges per-day attendance caches inside date range", () => {
    localStorage.setItem(
      `${CACHE_PREFIX}staff_attendance:2026-06-15`,
      JSON.stringify({
        response: {
          success: true,
          data: [
            {
              maNhanVien: "NV001",
              ngay: "2026-06-15",
              caDuKien: "SANG",
              trangThai: "CHECKED_IN",
            },
          ],
        },
        updatedAt: Date.now(),
      }),
    );
    localStorage.setItem(
      `${CACHE_PREFIX}staff_attendance:2026-06-16`,
      JSON.stringify({
        response: {
          success: true,
          data: [
            {
              maNhanVien: "NV002",
              ngay: "2026-06-16",
              caDuKien: "CHIEU",
              trangThai: "CHECKED_IN",
            },
          ],
        },
        updatedAt: Date.now(),
      }),
    );

    const rows = readCachedAttendanceRowsForRange("2026-06-15", "2026-06-16");
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.maNhanVien).sort()).toEqual(["NV001", "NV002"]);
  });

  it("prefers range cache when available", () => {
    localStorage.setItem(
      `${CACHE_PREFIX}staff_attendance:2026-06-01:2026-06-30`,
      JSON.stringify({
        response: {
          success: true,
          data: [{ maNhanVien: "NV099", ngay: "2026-06-10", caDuKien: "SANG" }],
        },
        updatedAt: Date.now(),
      }),
    );

    const rows = readCachedAttendanceRowsForRange("2026-06-01", "2026-06-30");
    expect(rows).toEqual([
      { maNhanVien: "NV099", ngay: "2026-06-10", caDuKien: "SANG" },
    ]);
  });
});
