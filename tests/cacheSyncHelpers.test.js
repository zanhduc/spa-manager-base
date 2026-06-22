import { describe, expect, it } from "vitest";
import {
  matchesCacheKey,
  matchesInvalidationKeys,
} from "../src/client/utils/cacheSyncHelpers.js";

describe("cacheSyncHelpers", () => {
  it("matches exact cache keys", () => {
    expect(
      matchesCacheKey("product_catalog", { exactKeys: ["product_catalog"] }),
    ).toBe(true);
    expect(
      matchesCacheKey("inventory", { exactKeys: ["product_catalog"] }),
    ).toBe(false);
  });

  it("matches date-scoped keys by prefix", () => {
    expect(
      matchesCacheKey("staff_attendance:2026-06-15", {
        prefixes: ["staff_attendance"],
      }),
    ).toBe(true);
    expect(
      matchesCacheKey("staff_leaves:2026-06-01:2026-06-30", {
        prefixes: ["staff_leaves"],
      }),
    ).toBe(true);
  });

  it("matches invalidation key arrays", () => {
    expect(
      matchesInvalidationKeys(["stay_history", "product_catalog"], {
        prefixes: ["stay_history"],
      }),
    ).toBe(true);
  });
});
