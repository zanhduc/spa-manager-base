import { describe, expect, it } from "vitest";
import {
  CACHE_CONSUMERS,
  CACHE_KEY_IDS,
  MUTATION_CROSS_SYNC,
  getCacheConsumers,
  mergeInvalidationKeys,
} from "../src/client/api/cacheRegistry.js";

describe("cacheRegistry cross-sync map", () => {
  it("maps schedule mutations to attendance consumers", () => {
    expect(MUTATION_CROSS_SYNC.updateSpaStaffSchedules).toContain(
      CACHE_KEY_IDS.staffAttendance,
    );
    expect(getCacheConsumers(CACHE_KEY_IDS.staffAttendance)).toContain(
      "StaffAttendancePanel",
    );
  });

  it("merges base invalidation keys with cross-sync extras", () => {
    const keys = mergeInvalidationKeys("recordSpaAttendance", [
      CACHE_KEY_IDS.staffAttendance,
    ]);
    expect(keys).toContain(CACHE_KEY_IDS.staffAttendance);
    expect(keys).toContain(CACHE_KEY_IDS.staffPayroll);
  });

  it("deduplicates repeated cache keys", () => {
    const keys = mergeInvalidationKeys("checkoutRoom", [
      CACHE_KEY_IDS.stayHistory,
      CACHE_KEY_IDS.inventory,
      CACHE_KEY_IDS.productCatalog,
    ]);
    expect(keys.filter((key) => key === CACHE_KEY_IDS.inventory)).toHaveLength(1);
    expect(keys).toContain(CACHE_KEY_IDS.inventorySuggestions);
  });

  it("documents consumers for shared catalog caches", () => {
    expect(CACHE_CONSUMERS[CACHE_KEY_IDS.productCatalog]).toEqual(
      expect.arrayContaining(["products", "inventory", "create-order"]),
    );
  });

  it("maps booking with items to session and progress caches", () => {
    expect(MUTATION_CROSS_SYNC.createBookingWithItems).toEqual(
      expect.arrayContaining([
        CACHE_KEY_IDS.rooms,
        CACHE_KEY_IDS.customerProgress,
        CACHE_KEY_IDS.stayHistory,
      ]),
    );
  });

  it("merges checkout cross-sync inventory keys", () => {
    const keys = mergeInvalidationKeys("checkoutRoom", [
      CACHE_KEY_IDS.stayHistory,
    ]);
    expect(keys).toContain(CACHE_KEY_IDS.inventory);
    expect(keys).toContain(CACHE_KEY_IDS.inventorySuggestions);
  });
});
