import { describe, expect, it } from "vitest";
import {
  buildChecklistRecordKey,
  buildDailyChecklistSummary,
  calculateChecklistProgress,
  getChecklistTemplate,
  mergeChecklistItems,
  supportsShiftChecklist,
  validateChecklistSave,
} from "../src/client/components/staff/staffChecklistHelpers";

describe("staffChecklist helpers", () => {
  const ktvStaff = { maNhanVien: "NV000001", chucVu: "KTV", tenNhanVien: "Lan KTV" };

  it("builds templates by role and checklist type", () => {
    const items = getChecklistTemplate("LE_TAN", "DAU_CA");
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toMatchObject({ code: expect.any(String), label: expect.any(String) });
    expect(getChecklistTemplate("KTV", "CUOI_CA").map((item) => item.code)).toContain("DON_DUNG_CU");
  });

  it("supports only operational roles for shift checklist", () => {
    expect(supportsShiftChecklist({ chucVu: "KTV" })).toBe(true);
    expect(supportsShiftChecklist({ chucVu: "MARKETING" })).toBe(false);
  });

  it("calculates progress and validates required items", () => {
    const template = getChecklistTemplate("KTV", "DAU_CA");
    const partial = mergeChecklistItems(template, [{ code: template[0].code, checked: true }]);
    const progress = calculateChecklistProgress(partial);
    expect(progress.requiredChecked).toBe(1);
    expect(progress.percent).toBeLessThan(100);

    const invalid = validateChecklistSave(
      {
        maNhanVien: "NV000001",
        ngay: "2026-06-09",
        caDuKien: "SANG",
        loaiChecklist: "DAU_CA",
        items: partial,
      },
      ktvStaff,
    );
    expect(invalid.ok).toBe(false);

    const allChecked = mergeChecklistItems(
      template,
      template.map((item) => ({ code: item.code, checked: true })),
    );
    const valid = validateChecklistSave(
      {
        maNhanVien: "NV000001",
        ngay: "2026-06-09",
        caDuKien: "SANG",
        loaiChecklist: "DAU_CA",
        items: allChecked,
        ghiChu: "Đủ dụng cụ",
      },
      ktvStaff,
    );
    expect(valid.ok).toBe(true);
    expect(valid.data.itemsJson).toContain("CHUAN_BI_KHAN");
  });

  it("builds stable record keys and daily summary", () => {
    expect(buildChecklistRecordKey("NV000001", "09/06/2026", "SANG", "DAU_CA")).toBe(
      "NV000001|2026-06-09|SANG|DAU_CA",
    );
    const summary = buildDailyChecklistSummary(
      [
        {
          maNhanVien: "NV000001",
          ngay: "2026-06-09",
          loaiChecklist: "DAU_CA",
          chucVu: "KTV",
          itemsJson: JSON.stringify(
            getChecklistTemplate("KTV", "DAU_CA").map((item) => ({
              ...item,
              checked: true,
            })),
          ),
        },
        {
          maNhanVien: "NV000002",
          ngay: "2026-06-09",
          loaiChecklist: "DAU_CA",
          chucVu: "KTV",
          itemsJson: JSON.stringify([
            { code: "CHUAN_BI_KHAN", checked: true, required: true },
          ]),
        },
      ],
      "2026-06-09",
      [{ maNhanVien: "NV000001", chucVu: "KTV" }, { maNhanVien: "NV000002", chucVu: "KTV" }],
    );
    expect(summary.total).toBe(2);
    expect(summary.completed).toBe(1);
    expect(summary.partial).toBe(1);
  });
});
