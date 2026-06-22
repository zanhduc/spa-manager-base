import { describe, expect, it } from "vitest";
import {
  LEAVE_STATUS,
  buildLeaveReviewPayload,
  buildStaffLeaveStatusUpdate,
  hasApprovedLeaveOnDate,
  validateLeaveSave,
} from "../src/client/components/staff/staffLeaveHelpers";

describe("staffLeave helpers", () => {
  it("validates leave save payload", () => {
    expect(validateLeaveSave({})).toEqual({ ok: false, message: "Chọn nhân viên." });
    expect(
      validateLeaveSave({
        maNhanVien: "NV000001",
        tuNgay: "2026-06-10",
        denNgay: "2026-06-09",
        lyDo: "test",
      }).ok,
    ).toBe(false);
    expect(
      validateLeaveSave({
        maNhanVien: "NV000001",
        tuNgay: "2026-06-09",
        denNgay: "2026-06-10",
        lyDo: "Nghỉ việc riêng",
      }),
    ).toMatchObject({ ok: true, maNhanVien: "NV000001" });
  });

  it("builds review payload for pending leave", () => {
    const row = { maDon: "NP000001", trangThai: LEAVE_STATUS.PENDING };
    expect(buildLeaveReviewPayload(row, "APPROVE")).toEqual({
      ok: true,
      maDon: "NP000001",
      trangThai: LEAVE_STATUS.APPROVED,
    });
  });

  it("detects approved leave on date", () => {
    const rows = [
      {
        maNhanVien: "NV000001",
        tuNgay: "2026-06-09",
        denNgay: "2026-06-11",
        trangThai: LEAVE_STATUS.APPROVED,
      },
    ];
    expect(hasApprovedLeaveOnDate("NV000001", rows, "2026-06-10")).toBe(true);
    expect(hasApprovedLeaveOnDate("NV000001", rows, "2026-06-12")).toBe(false);
  });

  it("syncs staff status when leave ends or starts", () => {
    const staff = { maNhanVien: "NV000001", trangThai: "Nghỉ phép" };
    const leaves = [
      {
        maNhanVien: "NV000001",
        tuNgay: "2026-06-09",
        denNgay: "2026-06-10",
        trangThai: LEAVE_STATUS.APPROVED,
      },
    ];
    expect(buildStaffLeaveStatusUpdate(staff, leaves, "2026-06-11")).toMatchObject({
      trangThai: "Đang làm việc",
    });
    expect(
      buildStaffLeaveStatusUpdate(
        { maNhanVien: "NV000001", trangThai: "Đang làm việc" },
        leaves,
        "2026-06-10",
      ),
    ).toMatchObject({ trangThai: "Nghỉ phép" });
  });
});
