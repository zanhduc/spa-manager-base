import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_STATUS,
  buildAttendanceRecordKey,
  buildAttendanceShiftSlots,
  formatExpectedShiftLabel,
  getAttendanceButtonState,
  inferStaffExpectedShiftsFromSchedule,
  resolveAttendanceDisplayStatus,
  validateAttendanceAction,
} from "../src/client/components/staff/staffConstants";

describe("staffAttendance helpers", () => {
  it("infers expected shifts from weekly schedule row", () => {
    const shifts = inferStaffExpectedShiftsFromSchedule("NV000001", "2026-06-09", [
      { ngay: "2026-06-09", caSang: "NV000001,NV000002", caChieu: "", caToi: "NV000001" },
    ]);
    expect(shifts).toEqual(["SANG", "TOI"]);
    expect(formatExpectedShiftLabel(shifts)).toContain("Ca sáng");
  });

  it("builds one slot per scheduled shift and tracks each independently", () => {
    const slots = buildAttendanceShiftSlots(
      "NV000001",
      "2026-06-09",
      [{ ngay: "2026-06-09", caSang: "NV000001", caChieu: "NV000001", caToi: "" }],
      [
        {
          maNhanVien: "NV000001",
          ngay: "2026-06-09",
          caDuKien: "SANG",
          checkInAt: "2026-06-09T02:00:00.000Z",
          checkOutAt: "2026-06-09T06:00:00.000Z",
          trangThai: "Đã ra ca",
        },
      ],
    );
    expect(slots.map((slot) => slot.shiftCode)).toEqual(["SANG", "CHIEU"]);
    expect(slots[0].status).toBe(ATTENDANCE_STATUS.COMPLETED);
    expect(slots[1].status).toBe(ATTENDANCE_STATUS.NOT_RECORDED);
    expect(getAttendanceButtonState(slots[1].record).checkIn.ok).toBe(true);
  });

  it("resolves display status from attendance record fields", () => {
    expect(resolveAttendanceDisplayStatus(null)).toBe(ATTENDANCE_STATUS.NOT_RECORDED);
    expect(
      resolveAttendanceDisplayStatus({ checkInAt: "2026-06-09T08:00:00.000Z" }),
    ).toBe(ATTENDANCE_STATUS.IN_PROGRESS);
    expect(
      resolveAttendanceDisplayStatus({
        checkInAt: "2026-06-09T08:00:00.000Z",
        checkOutAt: "2026-06-09T17:00:00.000Z",
      }),
    ).toBe(ATTENDANCE_STATUS.COMPLETED);
    expect(resolveAttendanceDisplayStatus({ trangThai: "Vắng" })).toBe("Vắng");
  });

  it("validates check-in, check-out, absent, and clear-absent transitions", () => {
    expect(validateAttendanceAction("CHECK_IN", null).ok).toBe(true);
    expect(
      validateAttendanceAction("CHECK_IN", {
        checkInAt: "2026-06-09T08:00:00.000Z",
      }).ok,
    ).toBe(false);
    expect(
      validateAttendanceAction("CHECK_OUT", {
        checkInAt: "2026-06-09T08:00:00.000Z",
      }).ok,
    ).toBe(true);
    expect(
      validateAttendanceAction("MARK_ABSENT", {
        checkInAt: "2026-06-09T08:00:00.000Z",
      }).ok,
    ).toBe(false);
    expect(validateAttendanceAction("CLEAR_ABSENT", { trangThai: "Vắng" }).ok).toBe(true);
    expect(validateAttendanceAction("CLEAR_ABSENT", null).ok).toBe(false);
  });

  it("does not fall back to catalog shifts when schedule module has rows but staff is unassigned", () => {
    const slots = buildAttendanceShiftSlots(
      "NV000001",
      "2026-06-14",
      [{ ngay: "2026-06-14", caSang: "", caChieu: "", caToi: "" }],
      [],
      ["SANG", "CHIEU", "TOI"],
    );
    expect(slots).toEqual([]);
  });

  it("builds stable attendance record keys per shift", () => {
    expect(buildAttendanceRecordKey("NV000001", "09/06/2026", "SANG")).toBe(
      "NV000001|2026-06-09|SANG",
    );
  });

  it("shows no attendance slots when staff is scheduled off for the day", () => {
    const slots = buildAttendanceShiftSlots(
      "NV000001",
      "2026-06-09",
      [{ ngay: "2026-06-09", caSang: "NV000002", caChieu: "NV000002", caToi: "" }],
      [],
    );
    expect(slots).toEqual([]);
  });
});
