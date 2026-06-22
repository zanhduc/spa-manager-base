import { describe, expect, it } from "vitest";
import {
  isManualRefreshSource,
  shouldToastRemoteCacheUpdate,
} from "../src/client/utils/cacheToastPolicy.js";

describe("cacheToastPolicy", () => {
  it("skips toast for local mutation cache updates", () => {
    expect(
      shouldToastRemoteCacheUpdate({
        hadChanges: true,
        source: "local_mutation_optimistic",
      }),
    ).toBe(false);
  });

  it("skips toast for manual refresh sources", () => {
    expect(isManualRefreshSource("manual_refresh_products")).toBe(true);
    expect(
      shouldToastRemoteCacheUpdate({
        hadChanges: true,
        source: "manual_refresh_dashboard",
      }),
    ).toBe(false);
  });

  it("does not toast background refresh to avoid noisy UI", () => {
    expect(
      shouldToastRemoteCacheUpdate({
        hadChanges: true,
        source: "background_refresh",
      }),
    ).toBe(false);
    expect(
      shouldToastRemoteCacheUpdate({
        hadChanges: false,
        source: "background_refresh",
      }),
    ).toBe(false);
  });

  it("skips toast for remote version poll when no content diff", () => {
    expect(
      shouldToastRemoteCacheUpdate({
        hadChanges: false,
        source: "remote_version_poll",
      }),
    ).toBe(false);
  });

  it("toasts after remote version poll when cache had real changes", () => {
    expect(
      shouldToastRemoteCacheUpdate({
        hadChanges: true,
        source: "remote_version_poll",
      }),
    ).toBe(true);
  });
});
