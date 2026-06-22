import { isLocalMutationSource } from "../api/localCache.js";

/** Nguồn refresh thủ công — không toast vì user chủ động bấm Tải lại. */
export function isManualRefreshSource(source = "") {
  const value = String(source || "").trim();
  return value.startsWith("manual_refresh");
}

/** Nguồn refresh nền - không toast để tránh làm rác màn hình. */
export function isBackgroundRefreshSource(source = "") {
  return String(source || "").trim() === "background_refresh";
}

/** Chỉ toast khi sheet thật sự khác cache và không phải mutation local / refresh thủ công / refresh nền. */
export function shouldToastRemoteCacheUpdate(detail = {}) {
  if (!detail?.hadChanges) return false;
  if (isLocalMutationSource(detail.source)) return false;
  if (isManualRefreshSource(detail.source)) return false;
  if (isBackgroundRefreshSource(detail.source)) return false;
  return true;
}

/** Meta chuẩn khi mutation local prime cache — UI đổi ngay, không toast. */
export const LOCAL_MUTATION_CACHE_META = Object.freeze({
  source: "local_mutation_optimistic",
  hadChanges: false,
});
