import { describe, expect, it } from "vitest";
import {
  scheduleCsvIncludesStaffCode,
} from "../src/client/components/staff/staffConstants";
import {
  getStaffShiftCodesForDate,
  getStaffShiftViolation,
} from "../src/client/components/staff/staffScheduleHelpers";

describe("staffScheduleHelpers", () => {
  const staff = {
    maNhanVien: "NV000001",
    tenNhanVien: "Lan KTV",
    caLamViec: "SANG,CHIEU",
  };

  it("matches staff codes in schedule CSV without substring collisions", () => {
    expect(scheduleCsvIncludesStaffCode("NV000001,NV000002", "NV000001")).toBe(true);
    expect(scheduleCsvIncludesStaffCode("NV000012,NV000002", "NV000001")).toBe(false);
  });

  it("returns no shifts when schedule row exists but staff is off", () => {
    const schedules = [{ ngay: "2026-06-09", caSang: "NV000002", caChieu: "", caToi: "" }];
    expect(getStaffShiftCodesForDate(staff, schedules, "2026-06-09T10:00:00")).toEqual([]);
  });

  it("falls back to staff default shifts when no schedule row exists for the day", () => {
    expect(getStaffShiftCodesForDate(staff, [], "2026-06-09T10:00:00")).toEqual([
      "SANG",
      "CHIEU",
    ]);
  });

  it("falls back to all shifts only when no schedule row and no valid default shifts exist", () => {
    expect(
      getStaffShiftCodesForDate(
        { maNhanVien: "NV000009", tenNhanVien: "Test", caLamViec: "CA_X" },
        [],
        "2026-06-09T10:00:00",
      ),
    ).toEqual([
      "SANG",
      "CHIEU",
      "TOI",
    ]);
  });

  it("blocks booking when staff has no shift for the selected start time", () => {
    const schedules = [{ ngay: "2026-06-09", caSang: "", caChieu: "NV000001", caToi: "" }];
    const violation = getStaffShiftViolation(
      staff,
      "2026-06-09T10:30:00",
      "2026-06-09T11:30:00",
      schedules,
    );
    expect(violation?.message).toContain("không có ca làm");
  });
});
