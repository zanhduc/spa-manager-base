import { describe, expect, it } from "vitest";
import {
  buildStaffKpiRows,
  buildStayCustomerKey,
  getStayServiceRevenue,
  isCompletedStay,
  stayMatchesDateRange,
} from "../src/client/components/staff/staffKpiHelpers";

describe("staffKpi helpers", () => {
  const staffs = [
    { maNhanVien: "NV000001", tenNhanVien: "Lan KTV", chucVu: "KTV" },
    { maNhanVien: "NV000002", tenNhanVien: "Hoa KTV", chucVu: "KTV" },
    { maNhanVien: "NV000003", tenNhanVien: "Minh Lễ tân", chucVu: "LE_TAN" },
  ];

  const stays = [
    {
      maNhanVien: "NV000001",
      trangThaiPhien: "CHECKED_OUT",
      ketThucThucTe: "2026-06-01T10:00:00.000Z",
      soDienThoai: "0901111111",
      tenKhach: "Khách A",
      tienDichVu: 200000,
      diemHaiLongKhach: 5,
    },
    {
      maNhanVien: "NV000001",
      trangThaiPhien: "CHECKED_OUT",
      ketThucThucTe: "2026-06-10T10:00:00.000Z",
      soDienThoai: "0901111111",
      tenKhach: "Khách A",
      tienDichVu: 150000,
      diemHaiLongKhach: 3,
    },
    {
      maNhanVien: "NV000001",
      trangThaiPhien: "CHECKED_OUT",
      ketThucThucTe: "2026-06-12T10:00:00.000Z",
      soDienThoai: "0902222222",
      tenKhach: "Khách B",
      tienDichVu: 100000,
    },
    {
      maNhanVien: "NV000002",
      trangThaiPhien: "CHECKED_OUT",
      ketThucThucTe: "2026-06-08T10:00:00.000Z",
      tenKhach: "Khách C",
      tienDichVu: 500000,
      diemHaiLongKhach: 4,
    },
    {
      maNhanVien: "NV000002",
      trangThaiPhien: "IN_HOUSE",
      ketThucThucTe: "2026-06-09T10:00:00.000Z",
      tenKhach: "Khách D",
      tienDichVu: 999999,
    },
    {
      maNhanVien: "NV000003",
      trangThaiPhien: "CHECKED_OUT",
      ketThucThucTe: "2026-06-05T10:00:00.000Z",
      tenKhach: "Khách E",
      tienDichVu: 300000,
    },
  ];

  it("detects completed stays and service revenue", () => {
    expect(isCompletedStay({ trangThaiPhien: "CHECKED_OUT" })).toBe(true);
    expect(isCompletedStay({ trangThaiPhien: "IN_HOUSE" })).toBe(false);
    expect(getStayServiceRevenue({ tienDichVu: 120000 })).toBe(120000);
    expect(buildStayCustomerKey({ soDienThoai: "0909 123 456", tenKhach: "A" })).toBe(
      "phone:0909123456",
    );
  });

  it("filters stays by session end date", () => {
    const stay = stays[0];
    expect(stayMatchesDateRange(stay, "2026-06-01", "2026-06-30")).toBe(true);
    expect(stayMatchesDateRange(stay, "2026-06-02", "2026-06-30")).toBe(false);
  });

  it("ranks KTV by service revenue and repeat-customer rate", () => {
    const rows = buildStaffKpiRows(staffs, stays, {
      tuNgay: "2026-06-01",
      denNgay: "2026-06-30",
      chucVu: "KTV",
    });

    expect(rows).toHaveLength(2);
    expect(rows[0].maNhanVien).toBe("NV000002");
    expect(rows[0].doanhSoDichVu).toBe(500000);
    expect(rows[0].phienHoanThanh).toBe(1);
    expect(rows[0].hang).toBe(1);

    const lan = rows.find((row) => row.maNhanVien === "NV000001");
    expect(lan.doanhSoDichVu).toBe(450000);
    expect(lan.phienHoanThanh).toBe(3);
    expect(lan.khachPhucVu).toBe(2);
    expect(lan.khachQuayLai).toBe(1);
    expect(lan.tyLeKhachQuayLai).toBe(50);
    expect(lan.soPhieuHaiLong).toBe(2);
    expect(lan.diemHaiLongTrungBinh).toBe(4);
    expect(lan.tyLeHaiLongKhach).toBe(50);
  });

  it("computes customer satisfaction from checkout scores", () => {
    const rows = buildStaffKpiRows(staffs, stays, {
      tuNgay: "2026-06-01",
      denNgay: "2026-06-30",
      chucVu: "KTV",
    });
    const hoa = rows.find((row) => row.maNhanVien === "NV000002");
    expect(hoa.soPhieuHaiLong).toBe(1);
    expect(hoa.diemHaiLongTrungBinh).toBe(4);
    expect(hoa.tyLeHaiLongKhach).toBe(100);
  });

  it("can include all roles when filter is ALL", () => {
    const rows = buildStaffKpiRows(staffs, stays, {
      tuNgay: "2026-06-01",
      denNgay: "2026-06-30",
      chucVu: "ALL",
    });
    expect(rows).toHaveLength(3);
    expect(rows.some((row) => row.maNhanVien === "NV000003")).toBe(true);
  });

  it("builds LE_TAN KPI with booking and repeat-customer metrics", () => {
    const bookingStays = [
      ...stays,
      {
        maNhanVien: "NV000003",
        trangThaiPhien: "CHECKED_OUT",
        ketThucThucTe: "2026-06-06T10:00:00.000Z",
        soDienThoai: "0903333333",
        tenKhach: "Khách F",
        tienDichVu: 100000,
      },
      {
        trangThaiPhien: "NO_SHOW",
        batDauAt: "2026-06-07T10:00:00.000Z",
        soDienThoai: "0904444444",
        tenKhach: "Khách G",
      },
    ];
    const rows = buildStaffKpiRows(staffs, bookingStays, {
      tuNgay: "2026-06-01",
      denNgay: "2026-06-30",
      chucVu: "LE_TAN",
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].maNhanVien).toBe("NV000003");
    expect(rows[0].soDatLich).toBeGreaterThanOrEqual(2);
    expect(rows[0].kpiProfile).toBe("LE_TAN");
  });

  it("builds QUAN_LY KPI with spa revenue and retention", () => {
    const rows = buildStaffKpiRows(
      [
        ...staffs,
        { maNhanVien: "NV000004", tenNhanVien: "An Quản lý", chucVu: "QUAN_LY" },
      ],
      stays,
      {
        tuNgay: "2026-06-01",
        denNgay: "2026-06-30",
        chucVu: "QUAN_LY",
      },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].doanhThu).toBeGreaterThan(0);
    expect(rows[0].nsTong).toBeGreaterThan(0);
    expect(rows[0].kpiProfile).toBe("QUAN_LY");
  });
});
