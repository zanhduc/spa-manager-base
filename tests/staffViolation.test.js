import { describe, expect, it } from "vitest";
import {
  VIOLATION_STATUS,
  calculateNetPayroll,
  getViolationDeductionAmount,
  isActiveViolation,
  sumViolationDeductions,
  validateViolationSave,
} from "../src/client/components/staff/staffViolationHelpers";

describe("staffViolation helpers", () => {
  const staff = { maNhanVien: "NV000001", tenNhanVien: "Lan KTV", chucVu: "KTV" };

  const violationRows = [
    {
      maViPham: "VP000001",
      maNhanVien: "NV000001",
      ngay: "2026-06-09",
      capDo: "TRU_THUONG",
      noiDung: "Đi muộn",
      mucTru: 200000,
      trangThai: VIOLATION_STATUS.ACTIVE,
    },
    {
      maViPham: "VP000002",
      maNhanVien: "NV000001",
      ngay: "2026-06-10",
      capDo: "KHIEN_TRACH",
      noiDung: "Không mặc đồng phục",
      mucTru: 0,
      trangThai: VIOLATION_STATUS.ACTIVE,
    },
    {
      maViPham: "VP000003",
      maNhanVien: "NV000001",
      ngay: "2026-06-09",
      capDo: "TRU_THUONG",
      noiDung: "Đã hủy",
      mucTru: 500000,
      trangThai: VIOLATION_STATUS.CANCELLED,
    },
    {
      maViPham: "VP000004",
      maNhanVien: "NV000002",
      ngay: "2026-06-09",
      capDo: "TRU_THUONG",
      noiDung: "Sai quy trình",
      mucTru: 100000,
      trangThai: VIOLATION_STATUS.ACTIVE,
    },
  ];

  it("detects active vs cancelled violations", () => {
    expect(isActiveViolation(violationRows[0])).toBe(true);
    expect(isActiveViolation(violationRows[2])).toBe(false);
  });

  it("sums only active deductions in date range", () => {
    expect(sumViolationDeductions("NV000001", violationRows, "2026-06-09", "2026-06-10")).toEqual({
      mucTru: 200000,
      soVu: 1,
    });
    expect(getViolationDeductionAmount(violationRows[2])).toBe(0);
  });

  it("calculates net payroll with floor at zero", () => {
    expect(
      calculateNetPayroll({ luongCoBan: 3000000, thuong: 500000, truViPham: 200000 }),
    ).toEqual({
      thuNhapGross: 3500000,
      truViPham: 200000,
      tongLuong: 3300000,
    });
    expect(
      calculateNetPayroll({ luongCoBan: 100000, thuong: 50000, truViPham: 300000 }),
    ).toEqual({
      thuNhapGross: 150000,
      truViPham: 300000,
      tongLuong: 0,
    });
  });

  it("validates violation save payload", () => {
    expect(
      validateViolationSave(
        { maNhanVien: "NV000001", ngay: "2026-06-09", capDo: "TRU_THUONG", noiDung: "Muộn" },
        staff,
        violationRows,
      ).ok,
    ).toBe(false);

    const ok = validateViolationSave(
      {
        maNhanVien: "NV000001",
        ngay: "2026-06-09",
        capDo: "TRU_THUONG",
        noiDung: "Muộn",
        mucTru: 150000,
      },
      staff,
      violationRows,
    );
    expect(ok.ok).toBe(true);
    expect(ok.data.maViPham).toBe("VP000005");
    expect(ok.data.mucTru).toBe(150000);
  });
});
