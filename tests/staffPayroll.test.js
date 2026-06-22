import { describe, expect, it } from "vitest";
import {
  ATTENDANCE_STATUS,
} from "../src/client/components/staff/staffConstants";
import {
  buildStaffPayrollRows,
  calculateBasicSalaryPayout,
  calculateServiceBonus,
  countCompletedShiftsInRange,
  countScheduledShiftsInRange,
  getStaffBonusRate,
} from "../src/client/components/staff/staffPayrollHelpers";

describe("staffPayroll helpers", () => {
  const staffs = [
    {
      maNhanVien: "NV000001",
      tenNhanVien: "Lan KTV",
      chucVu: "KTV",
      luongCoBanThang: 8000000,
      tyLeThuongDichVu: "",
    },
    {
      maNhanVien: "NV000002",
      tenNhanVien: "Hoa KTV",
      chucVu: "KTV",
      luongCoBanThang: 6000000,
      tyLeThuongDichVu: 12,
    },
  ];

  const scheduleRows = [
    { ngay: "2026-06-09", caSang: "NV000001", caChieu: "NV000001", caToi: "" },
    { ngay: "2026-06-10", caSang: "NV000001", caChieu: "", caToi: "" },
    { ngay: "2026-06-09", caSang: "NV000002", caChieu: "NV000002", caToi: "" },
  ];

  const attendanceRows = [
    {
      maNhanVien: "NV000001",
      ngay: "2026-06-09",
      caDuKien: "SANG",
      trangThai: ATTENDANCE_STATUS.COMPLETED,
      checkOutAt: "2026-06-09T06:00:00.000Z",
    },
    {
      maNhanVien: "NV000001",
      ngay: "2026-06-09",
      caDuKien: "CHIEU",
      trangThai: ATTENDANCE_STATUS.COMPLETED,
      checkOutAt: "2026-06-09T10:00:00.000Z",
    },
    {
      maNhanVien: "NV000002",
      ngay: "2026-06-09",
      caDuKien: "SANG",
      trangThai: ATTENDANCE_STATUS.ABSENT,
    },
  ];

  const stays = [
    {
      maNhanVien: "NV000001",
      trangThaiPhien: "CHECKED_OUT",
      ketThucThucTe: "2026-06-09T10:00:00.000Z",
      tienDichVu: 500000,
    },
    {
      maNhanVien: "NV000002",
      trangThaiPhien: "CHECKED_OUT",
      ketThucThucTe: "2026-06-09T11:00:00.000Z",
      tienDichVu: 1000000,
    },
  ];

  it("uses default bonus rate by role when staff has no custom rate", () => {
    expect(getStaffBonusRate({ chucVu: "KTV" })).toBe(10);
    expect(getStaffBonusRate({ chucVu: "LE_TAN" })).toBe(5);
    expect(getStaffBonusRate({ chucVu: "KTV", tyLeThuongDichVu: 15 })).toBe(15);
  });

  it("prorates basic salary by completed vs scheduled shifts", () => {
    const payout = calculateBasicSalaryPayout({
      luongCoBanThang: 8000000,
      caKeHoach: 4,
      caHoanThanh: 2,
    });
    expect(payout.luongCoBan).toBe(4000000);
    expect(payout.tyLeCong).toBe(0.5);
  });

  it("counts scheduled and completed shifts in a date range", () => {
    expect(
      countScheduledShiftsInRange("NV000001", scheduleRows, "2026-06-09", "2026-06-10"),
    ).toBe(3);
    expect(
      countCompletedShiftsInRange("NV000001", attendanceRows, "2026-06-09", "2026-06-10"),
    ).toBe(2);
  });

  it("calculates service bonus from revenue and rate", () => {
    expect(calculateServiceBonus(1000000, 10)).toBe(100000);
  });

  it("builds payroll rows with basic salary plus bonus", () => {
    const rows = buildStaffPayrollRows(
      staffs,
      stays,
      attendanceRows,
      scheduleRows,
      [],
      {
        tuNgay: "2026-06-09",
        denNgay: "2026-06-10",
        chucVu: "KTV",
      },
    );

    const lan = rows.find((row) => row.maNhanVien === "NV000001");
    expect(lan.caKeHoach).toBe(3);
    expect(lan.caHoanThanh).toBe(2);
    expect(lan.luongCoBan).toBe(5333333);
    expect(lan.thuong).toBe(50000);
    expect(lan.truViPham).toBe(0);
    expect(lan.tongLuong).toBe(5383333);

    const hoa = rows.find((row) => row.maNhanVien === "NV000002");
    expect(hoa.caHoanThanh).toBe(0);
    expect(hoa.luongCoBan).toBe(0);
    expect(hoa.thuong).toBe(120000);
    expect(hoa.tongLuong).toBe(120000);
  });

  it("subtracts active violation deductions from gross payroll", () => {
    const violationRows = [
      {
        maViPham: "VP000001",
        maNhanVien: "NV000001",
        ngay: "2026-06-09",
        capDo: "TRU_THUONG",
        mucTru: 300000,
        trangThai: "AP_DUNG",
      },
    ];
    const rows = buildStaffPayrollRows(
      staffs,
      stays,
      attendanceRows,
      scheduleRows,
      violationRows,
      {
        tuNgay: "2026-06-09",
        denNgay: "2026-06-10",
        chucVu: "KTV",
      },
    );
    const lan = rows.find((row) => row.maNhanVien === "NV000001");
    expect(lan.truViPham).toBe(300000);
    expect(lan.soVuViPham).toBe(1);
    expect(lan.tongLuong).toBe(5083333);
  });
});
