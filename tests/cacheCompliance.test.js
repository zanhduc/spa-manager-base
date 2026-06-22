import { describe, expect, it } from "vitest";
import {
  CACHE_CONSUMERS,
  CACHE_KEY_IDS,
} from "../src/client/api/cacheRegistry.js";

describe("cache compliance registry", () => {
  it("documents all primary cache keys", () => {
    expect(Object.keys(CACHE_CONSUMERS).length).toBeGreaterThanOrEqual(20);
    expect(CACHE_CONSUMERS[CACHE_KEY_IDS.productCatalog]).toContain("products");
    expect(CACHE_CONSUMERS[CACHE_KEY_IDS.inventory]).toContain("stock");
    expect(CACHE_CONSUMERS[CACHE_KEY_IDS.inventorySuggestions]).toContain("inventory");
  });

  it("does not list inventory page as inventory stock consumer", () => {
    expect(CACHE_CONSUMERS[CACHE_KEY_IDS.inventory]).not.toContain("inventory");
  });
});
