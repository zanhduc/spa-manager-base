import { describe, expect, it, beforeEach } from "vitest";
import {
  readCachedDataList,
  removeCachedListItem,
  upsertCachedListItem,
  writeCachedListResponse,
} from "../src/client/api/cacheListHelpers.js";
import { readCache } from "../src/client/api/localCache.js";

describe("cacheListHelpers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("upserts and removes list items by id field", () => {
    writeCachedListResponse("staff_catalog", [
      { maNhanVien: "NV001", tenNhanVien: "A" },
    ]);

    upsertCachedListItem(
      "staff_catalog",
      { maNhanVien: "NV002", tenNhanVien: "B" },
      "maNhanVien",
    );
    upsertCachedListItem(
      "staff_catalog",
      { maNhanVien: "NV001", tenNhanVien: "A updated" },
      "maNhanVien",
    );

    expect(readCachedDataList("staff_catalog")).toEqual([
      { maNhanVien: "NV001", tenNhanVien: "A updated" },
      { maNhanVien: "NV002", tenNhanVien: "B" },
    ]);

    removeCachedListItem("staff_catalog", "maNhanVien", "NV001");
    expect(readCachedDataList("staff_catalog")).toEqual([
      { maNhanVien: "NV002", tenNhanVien: "B" },
    ]);
    expect(readCache("staff_catalog")?.response?.success).toBe(true);
  });
});
