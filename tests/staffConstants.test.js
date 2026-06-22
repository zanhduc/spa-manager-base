import { describe, expect, it } from "vitest";
import {
  canAssignStaffToSession,
  inferStaffRole,
  isBlockingStaffStatus,
  matchesStaffStatusFilter,
  normalizeStaffCatalogStatus,
} from "../src/client/components/staff/staffConstants";

describe("staffConstants", () => {
  it("infers KTV role from legacy ghiChu", () => {
    expect(inferStaffRole({ ghiChu: "KTV chính" })).toBe("KTV");
    expect(inferStaffRole({ ghiChu: "Điều phối/KTV" })).toBe("KTV");
  });

  it("uses explicit chucVu when available", () => {
    expect(inferStaffRole({ chucVu: "LE_TAN", ghiChu: "KTV chính" })).toBe("LE_TAN");
  });

  it("allows only KTV for session assignment", () => {
    expect(canAssignStaffToSession({ chucVu: "KTV" })).toBe(true);
    expect(canAssignStaffToSession({ ghiChu: "Tư vấn" })).toBe(false);
    expect(canAssignStaffToSession({ ghiChu: "KTV" })).toBe(true);
  });

  it("blocks inactive staff statuses", () => {
    expect(isBlockingStaffStatus("Nghỉ việc")).toBe(true);
    expect(isBlockingStaffStatus("Ngưng làm việc")).toBe(true);
    expect(isBlockingStaffStatus("Đang làm việc")).toBe(false);
    expect(isBlockingStaffStatus("Thử việc")).toBe(false);
  });

  it("normalizes legacy staff status for filters", () => {
    expect(normalizeStaffCatalogStatus("Ngưng làm việc")).toBe("Nghỉ việc");
    expect(
      matchesStaffStatusFilter({ trangThai: "Ngưng làm việc" }, "Nghỉ việc"),
    ).toBe(true);
  });
});
