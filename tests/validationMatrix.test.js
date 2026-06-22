import { describe, expect, it } from "vitest";
import { validateProductRow } from "../src/client/utils/productValidators.js";
import {
  validateInventoryLineItem,
  validateInventoryReceipt,
} from "../src/client/utils/inventoryValidators.js";
import { validateTreatmentCatalogPayload } from "../src/client/utils/treatmentCatalogValidators.js";
import { validateSessionScheduleConflicts } from "../src/client/utils/sessionScheduleValidators.js";

describe("validation matrix FE modules", () => {
  it("validates product row", () => {
    expect(validateProductRow({ tenSanPham: "", donVi: "g", donGiaBan: 1, giaVon: 1 }).ok).toBe(
      false,
    );
    expect(
      validateProductRow({
        tenSanPham: "Serum",
        donVi: "chai",
        donGiaBan: 10000,
        giaVon: 5000,
      }).ok,
    ).toBe(true);
  });

  it("validates inventory line and receipt", () => {
    const line = validateInventoryLineItem(
      { tenSanPham: "", donViChan: "", soLuong: 0, giaNhapChan: 0 },
      [],
    );
    expect(line.ok).toBe(false);

    const receipt = validateInventoryReceipt({ nhaCungCap: "NCC A" }, []);
    expect(receipt.ok).toBe(false);
    expect(receipt.errors.products).toBeTruthy();
  });

  it("validates treatment catalog payload", () => {
    expect(validateTreatmentCatalogPayload({ phacDo: [], dichVu: [], goiDieuTri: [] })).toBe(
      "",
    );
    expect(
      validateTreatmentCatalogPayload({
        phacDo: [{ maPhacDo: "", tenPhacDo: "X" }],
        dichVu: [],
        goiDieuTri: [],
      }),
    ).toContain("Thiếu mã");
  });

  it("blocks overlapping spa schedule on FE", () => {
    const stays = [
      {
        maPhien: "P1",
        maGiuong: "G1",
        maNhanVien: "NV1",
        trangThaiPhien: "IN_HOUSE",
        batDauAt: "2026-06-15T10:00:00.000Z",
        ketThucDuKien: "2026-06-15T11:00:00.000Z",
      },
    ];
    const result = validateSessionScheduleConflicts(stays, {
      maGiuong: "G1",
      batDauAt: "2026-06-15T10:30:00.000Z",
      ketThucDuKien: "2026-06-15T11:30:00.000Z",
    });
    expect(result.ok).toBe(false);
  });
});
