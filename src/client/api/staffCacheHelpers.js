import { readCache } from "./localCache.js";

const STAFF_ATTENDANCE_KEY = "staff_attendance";

const pad2 = (n) => String(n).padStart(2, "0");

const toDateKey = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

export function buildStaffAttendanceCacheKeyFromHelpers(filters = {}) {
  const root = STAFF_ATTENDANCE_KEY;
  const ngay = String(filters?.ngay || "").trim();
  if (ngay) return `${root}:${ngay}`;
  const tuNgay = String(filters?.tuNgay || "").trim();
  const denNgay = String(filters?.denNgay || "").trim();
  if (tuNgay && denNgay) return `${root}:${tuNgay}:${denNgay}`;
  return root;
}

/** Gộp cache chấm công theo ngày lẻ trong khoảng tuNgay–denNgay. */
export function readCachedAttendanceRowsForRange(tuNgay, denNgay) {
  const rangeKey = buildStaffAttendanceCacheKeyFromHelpers({ tuNgay, denNgay });
  const rangeCached = readCache(rangeKey)?.response?.data;
  if (Array.isArray(rangeCached)) return rangeCached;

  const start = new Date(`${String(tuNgay || "").trim()}T00:00:00`);
  const end = new Date(`${String(denNgay || "").trim()}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const merged = [];
  const seen = new Set();
  for (let cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    const ngay = toDateKey(cursor);
    const dayRows = readCache(buildStaffAttendanceCacheKeyFromHelpers({ ngay }))?.response?.data;
    if (!Array.isArray(dayRows)) continue;
    dayRows.forEach((row) => {
      const recordKey = [
        String(row?.maNhanVien || "").trim(),
        String(row?.ngay || ngay).trim(),
        String(row?.caDuKien || "").trim(),
      ].join("|");
      if (!recordKey || seen.has(recordKey)) return;
      seen.add(recordKey);
      merged.push(row);
    });
  }
  return merged;
}
