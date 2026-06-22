import { describe, expect, it } from "vitest";
import {
  isPayrollPeriodLocked,
  validatePayrollLock,
} from "../src/client/components/staff/staffPayrollLockHelpers";

describe("staffPayrollLock helpers", () => {
  const payrollRow = {
    maNhanVien: "NV000001",
    tenNhanVien: "Lan",
    chucVu: "KTV",
    caHoanThanh: 10,
    caKeHoach: 12,
    luongCoBan: 3000000,
    doanhSoDichVu: 10000000,
    tyLeThuong: 10,
    thuong: 1000000,
    truViPham: 0,
    tongLuong: 4000000,
  };

  it("detects locked payroll period", () => {
    const locks = [{ tuNgay: "2026-06-01", denNgay: "2026-06-30", trangThai: "DA_CHOT" }];
    expect(isPayrollPeriodLocked(locks, "2026-06-01", "2026-06-30")).toBe(true);
    expect(isPayrollPeriodLocked(locks, "2026-07-01", "2026-07-31")).toBe(false);
  });

  it("validates payroll lock payload", () => {
    expect(validatePayrollLock([], "2026-06-01", "2026-06-30", [])).toEqual({
      ok: false,
      message: "Không có dữ liệu lương để chốt.",
    });
    const result = validatePayrollLock([payrollRow], "2026-06-01", "2026-06-30", []);
    expect(result.ok).toBe(true);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].tongLuong).toBe(4000000);
  });
});
