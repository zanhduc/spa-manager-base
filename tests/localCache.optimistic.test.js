import { describe, expect, it, beforeEach } from "vitest";
import {
  clearCacheByKeys,
  markCacheKeysOptimistic,
  readCache,
  writeCache,
} from "../src/client/api/localCache.js";

describe("localCache optimistic protection", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("keeps optimistic cache when remote invalidation arrives within TTL", () => {
    writeCache("inventory", { success: true, data: [{ tonKho: 10 }] });
    markCacheKeysOptimistic(["inventory"], 5000);

    clearCacheByKeys(["inventory"], { source: "realtime_signal" });

    expect(readCache("inventory")?.response?.data?.[0]?.tonKho).toBe(10);
  });

  it("clears cache on local mutation revert even when protected", () => {
    writeCache("stay_history", { success: true, data: [] });
    markCacheKeysOptimistic(["stay_history"], 5000);

    clearCacheByKeys(["stay_history"], {
      source: "local_mutation_revert",
      force: true,
    });

    expect(readCache("stay_history")).toBeNull();
  });
});
