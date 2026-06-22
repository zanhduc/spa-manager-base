import { describe, expect, it } from "vitest";
import {
  buildCheckoutInventoryPatch,
  computeCheckoutStockDelta,
  findCatalogProductIndex,
  isStockTrackedServiceItem,
  mergeTreatmentSessionPatch,
} from "../src/client/api/spaCheckoutCacheHelpers.js";

describe("spaCheckoutCacheHelpers", () => {
  const catalog = [
    {
      maSanPham: "SP0001",
      tenSanPham: "Nước suối Aquafina 500ml",
      nhomHang: "Nước",
      donVi: "Chai",
      donViLon: "Thùng",
      quyCach: 24,
      tonKho: 240,
    },
    {
      maSanPham: "SV001",
      tenSanPham: "Massage cổ vai 30 phút",
      nhomHang: "Dịch vụ",
      donVi: "Buổi",
      tonKho: 999,
    },
  ];

  it("matches products by maSanPham even when display name differs", () => {
    const index = findCatalogProductIndex(catalog, {
      maSanPham: "SP0001",
      tenSanPham: "NUOC SUOI AQUAFINA 500ML",
    });
    expect(index).toBe(0);
  });

  it("deducts stock for tracked products and skips services", () => {
    const stay = {
      maPhien: "PH001",
      serviceItems: [
        {
          maPhien: "PH001",
          maSanPham: "SP0001",
          tenSanPham: "Nước suối Aquafina 500ml",
          nhomHang: "Nước",
          donVi: "Chai",
          soLuong: 2,
        },
        {
          maPhien: "PH001",
          maSanPham: "SV001",
          tenSanPham: "Massage cổ vai 30 phút",
          nhomHang: "Dịch vụ",
          donVi: "Buổi",
          soLuong: 1,
        },
      ],
    };

    const patch = buildCheckoutInventoryPatch({
      stay,
      inventoryProducts: catalog,
      catalogProducts: catalog,
    });

    expect(patch.deductedCount).toBe(1);
    expect(patch.inventoryProducts[0].tonKho).toBe(238);
    expect(patch.catalogProducts[0].tonKho).toBe(238);
    expect(patch.inventoryProducts[1].tonKho).toBe(999);
    expect(patch.patchedStay.serviceItems[0].daTruTonKho).toBe(true);
    expect(patch.patchedStay.serviceItems[1].daTruTonKho).toBe(true);
  });

  it("converts bulk unit quantities using quyCach", () => {
    const delta = computeCheckoutStockDelta(
      {
        donViLon: "Thùng",
        donViNho: "Chai",
        quyCach: 24,
      },
      {
        donVi: "Thùng",
        soLuong: 1,
      },
    );
    expect(delta).toBe(24);
  });

  it("ignores package-like groups for stock tracking", () => {
    expect(
      isStockTrackedServiceItem({
        nhomHang: "Gói điều trị",
        tenSanPham: "Combo 10 buổi",
      }),
    ).toBe(false);
  });

  it("keeps timeline fields when checkout patch omits batDauAt", () => {
    const merged = mergeTreatmentSessionPatch(
      {
        maPhien: "LT00001",
        maGiuong: "G201",
        batDauAt: "2026-06-13T09:00:00.000Z",
        ketThucDuKien: "2026-06-13T10:00:00.000Z",
        trangThaiPhien: "IN_HOUSE",
      },
      {
        maPhien: "LT00001",
        trangThaiPhien: "CHECKED_OUT",
        ketThucThucTe: "2026-06-13T10:15:00.000Z",
        batDauAt: "",
        ketThucDuKien: "",
      },
    );

    expect(merged.trangThaiPhien).toBe("CHECKED_OUT");
    expect(merged.batDauAt).toBe("2026-06-13T09:00:00.000Z");
    expect(merged.ketThucDuKien).toBe("2026-06-13T10:00:00.000Z");
    expect(merged.ketThucThucTe).toBe("2026-06-13T10:15:00.000Z");
  });

  it("keeps serviceItems when checkout patch sends an empty list", () => {
    const merged = mergeTreatmentSessionPatch(
      {
        maPhien: "LT00001",
        serviceItems: [{ maSanPham: "SP0001", soLuong: 2 }],
      },
      {
        trangThaiPhien: "CHECKED_OUT",
        serviceItems: [],
      },
    );

    expect(merged.serviceItems).toEqual([{ maSanPham: "SP0001", soLuong: 2 }]);
  });
});
