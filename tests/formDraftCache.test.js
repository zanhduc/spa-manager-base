import { beforeEach, describe, expect, it } from "vitest";
import {
  FORM_DRAFT_KEYS,
  clearFormDraft,
  readFormDraft,
  writeFormDraft,
} from "../src/client/utils/formDraftCache.js";

describe("formDraftCache", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists and restores draft values per page key", () => {
    writeFormDraft(FORM_DRAFT_KEYS.staffCatalog, {
      tenNhanVien: "Lan Nguyen",
      chucVu: "KTV",
    });

    expect(readFormDraft(FORM_DRAFT_KEYS.staffCatalog)).toEqual({
      tenNhanVien: "Lan Nguyen",
      chucVu: "KTV",
    });
  });

  it("clears draft after successful submit flow", () => {
    writeFormDraft(FORM_DRAFT_KEYS.staffSchedule, {
      draft: { "2026-06-15": { caSang: ["NV001"], caChieu: [], caToi: [] } },
      weekOffset: 1,
    });
    clearFormDraft(FORM_DRAFT_KEYS.staffSchedule);
    expect(readFormDraft(FORM_DRAFT_KEYS.staffSchedule)).toBeNull();
  });

  it("expires stale drafts", () => {
    writeFormDraft(FORM_DRAFT_KEYS.productEditor, { tenSanPham: "Serum" });
    const key = Object.keys(localStorage).find((item) =>
      item.includes(FORM_DRAFT_KEYS.productEditor),
    );
    expect(key).toBeTruthy();
    const parsed = JSON.parse(localStorage.getItem(key));
    parsed.savedAt = Date.now() - 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem(key, JSON.stringify(parsed));

    expect(readFormDraft(FORM_DRAFT_KEYS.productEditor, 7 * 24 * 60 * 60 * 1000)).toBeNull();
  });
});
