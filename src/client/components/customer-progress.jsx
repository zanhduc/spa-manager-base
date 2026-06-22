import { useCallback, useEffect, useMemo, useState } from "react";
import { parseLocalString } from "../utils/dateFormatter.js";
import { toUsDate, toUsDateTime } from '../../core/dateUtils.js';
import {
  CACHE_KEYS,
  clearReadCacheByKeys,
  getCustomerProgress,
  updateComboSchedule,
} from "../api";
import toast from "react-hot-toast";
import ComboScheduleManager from "./ComboScheduleManager";
import { readCache } from "../api/localCache.js";
import {
  bootstrapSilentAny,
  hasCachedResponse,
  readCachedList,
  shouldBlockPanelUI,
} from "../utils/cacheBootstrap.js";
import { useCacheSync } from "../hooks/useCacheSync.js";
import { CACHE_KEY_IDS } from "../api/cacheRegistry.js";

const fmtDateTime = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const date = parseLocalString(raw);
  if (!date || Number.isNaN(date.getTime())) return raw;
  return toUsDateTime(date);
};

const statusLabel = (status) => {
  const key = String(status || "").trim().toUpperCase();
  if (key === "BOOKED") return "Đã hẹn";
  if (key === "IN_HOUSE") return "Đang trị liệu";
  if (key === "CHECKED_OUT") return "Đã hoàn thành";
  if (key === "NO_SHOW") return "Không đến";
  if (key === "CANCELLED") return "Đã hủy";
  return status || "-";
};

const statusTone = (status) => {
  const key = String(status || "").trim().toUpperCase();
  if (key === "CHECKED_OUT") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (key === "IN_HOUSE") return "bg-sky-50 text-sky-700 border-sky-200";
  if (key === "BOOKED") return "bg-rose-50 text-rose-700 border-rose-200";
  if (key === "NO_SHOW") return "bg-slate-100 text-slate-600 border-slate-200";
  return "bg-amber-50 text-amber-700 border-amber-200";
};

const normalizePhone = (value) => String(value || "").replace(/[^\d]/g, "");
const buildCustomerKey = (row) => {
  const phone = normalizePhone(row?.soDienThoai);
  if (phone) return `phone:${phone}`;
  return `name:${String(row?.tenKhach || "").trim().toLowerCase()}`;
};

const safeTimeMs = (dateStr) => {
  if (!dateStr) return 0;
  const d = parseLocalString(dateStr);
  return d ? d.getTime() : 0;
};

const MIN_COMBO_SESSIONS = 2;

const groupProgressRows = (rows = []) => {
  const grouped = new Map();
  rows.forEach((row) => {
    const totalSessions = Math.max(Number(row?.soBuoiCuaCombo || 1), 1);
    const baseProgressCode = String(row?.maTienTrinh || row?.maPhien || "").trim();
    const progressCode =
      totalSessions <= 1
        ? [baseProgressCode, row?.maPhien, row?.ngay].filter(Boolean).join("::")
        : baseProgressCode;
    if (!progressCode) return;
    const current = grouped.get(progressCode) || [];
    current.push(row);
    grouped.set(progressCode, current);
  });
  return [...grouped.entries()]
    .map(([maTienTrinh, sessions]) => {
      const sortedSessions = [...sessions].sort((a, b) => {
        const sessionDelta = Number(a?.buoiThu || 0) - Number(b?.buoiThu || 0);
        if (sessionDelta !== 0) return sessionDelta;
        return safeTimeMs(a?.ngay) - safeTimeMs(b?.ngay);
      });
      const latestSession = [...sortedSessions].sort(
        (a, b) => safeTimeMs(b?.ngay) - safeTimeMs(a?.ngay),
      )[0];
      const totalSessions = Math.max(Number(latestSession?.soBuoiCuaCombo || 1), 1);
      const completedSessions = sortedSessions.filter(
        (session) => String(session?.trangThai || "").trim().toUpperCase() === "CHECKED_OUT",
      ).length;
      const currentSessionNumber = Math.max(Number(latestSession?.buoiThu || 1), 1);
      const isCompleted = Math.max(Number(latestSession?.soBuoiConLai || totalSessions - currentSessionNumber), 0) === 0;
      
      let hasToday = false;
      try {
        const schedule = JSON.parse(latestSession?.lichTrinhChiTiet || "[]");
        const todayStr = toUsDate(new Date());
        hasToday = schedule.some(s => s.date === todayStr && s.status === "PENDING");
      } catch(e) {}
      
      let cardColor = "bg-white"; // default
      let borderColor = "border-slate-200";
      if (isCompleted) {
        cardColor = "bg-slate-100";
        borderColor = "border-slate-300";
      } else if (hasToday) {
        cardColor = "bg-rose-50/70";
        borderColor = "border-rose-300 shadow-rose-100 shadow-sm";
      } else {
        cardColor = "bg-emerald-50/60";
        borderColor = "border-emerald-200";
      }

      return {
        maTienTrinh: String(latestSession?.maTienTrinh || maTienTrinh).trim(),
        cardColor,
        borderColor,
        tenKhach: String(latestSession?.tenKhach || "").trim(),
        soDienThoai: String(latestSession?.soDienThoai || "").trim(),
        goiCombo: String(latestSession?.goiCombo || "").trim(),
        soBuoiCuaCombo: totalSessions,
        soBuoiConLai: Math.max(Number(latestSession?.soBuoiConLai || totalSessions - currentSessionNumber), 0),
        daDen: completedSessions,
        sessionHienTai: currentSessionNumber,
        trangThaiGanNhat: String(latestSession?.trangThai || "").trim(),
        ngayGanNhat: String(latestSession?.ngay || "").trim(),
        sessions: sortedSessions,
        searchKey: [
          maTienTrinh,
          latestSession?.tenKhach,
          latestSession?.soDienThoai,
          latestSession?.goiCombo,
          ...sortedSessions.map((session) => session?.maPhien),
        ]
          .join(" ")
          .toLowerCase(),
      };
    })
    .sort((a, b) => safeTimeMs(b.ngayGanNhat) - safeTimeMs(a.ngayGanNhat))
    .filter((item) => Number(item.soBuoiCuaCombo || 0) >= MIN_COMBO_SESSIONS);
};

export default function CustomerProgressPage() {
  const [rows, setRows] = useState(() => readCachedList(CACHE_KEYS.customerProgress));
  const [loading, setLoading] = useState(() => !hasCachedResponse(CACHE_KEYS.customerProgress));
  const [refreshing, setRefreshing] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState(null);
  const [isEditingSchedule, setIsEditingSchedule] = useState(false);

  const hydrateFromCache = useCallback(() => {
    const cached = readCache(CACHE_KEYS.customerProgress)?.response?.data;
    if (Array.isArray(cached)) {
      setRows(cached);
      return true;
    }
    const list = readCachedList(CACHE_KEYS.customerProgress);
    if (list.length) {
      setRows(list);
      return true;
    }
    return false;
  }, []);

  const loadData = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await getCustomerProgress();
      if (res && res.success === false) {
        setError(res.message || "Không thể tải dữ liệu tiến trình khách.");
        setRows([]);
        return;
      }
      setRows(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      setError(err?.message || "Lỗi không xác định khi tải dữ liệu.");
      setRows([]);
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    hydrateFromCache();
    void loadData({ silent: bootstrapSilentAny(CACHE_KEYS.customerProgress) });
  }, [hydrateFromCache, loadData]);

  /**
   * ⚠️ FIXED: Xóa void loadData() trong onCacheInvalidated
   * Lý do: Gây stack overflow khi event được dispatch liên tục
   * 
   * Pattern đúng: Chỉ đọc từ cache và update state
   * Cache sẽ được update khi mutation hoàn thành (afterSuccess writeCache)
   */
  useCacheSync({
    cacheKeys: [CACHE_KEYS.customerProgress],
    cacheKeyPrefixes: [CACHE_KEY_IDS.stayHistory],
    onCacheUpdated: (_detail, cacheKey) => {
      if (cacheKey === CACHE_KEYS.customerProgress) {
        hydrateFromCache();
        return;
      }
      // Chỉ hydrate từ cache, không gọi API
      if (String(cacheKey || "").startsWith(`${CACHE_KEY_IDS.stayHistory}`)) {
        hydrateFromCache();
      }
    },
    onCacheInvalidated: (keys) => {
      if (
        keys.includes(CACHE_KEYS.customerProgress) ||
        keys.some((key) => String(key || "").startsWith(CACHE_KEY_IDS.stayHistory))
      ) {
        hydrateFromCache();
        // ⚠️ KHÔNG gọi loadData() ở đây - chỉ đọc từ cache
      }
    },
  });

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      clearReadCacheByKeys([CACHE_KEYS.customerProgress, CACHE_KEYS.stayHistory], {
        source: "manual_refresh_customer_progress",
      });
      await loadData({ silent: true });
    } finally {
      setRefreshing(false);
    }
  };

  const grouped = useMemo(() => groupProgressRows(rows), [rows]);

  const filtered = useMemo(() => {
    const q = String(keyword || "").trim().toLowerCase();
    if (!q) return grouped;
    return grouped.filter((item) => item.searchKey.includes(q));
  }, [grouped, keyword]);

  const summary = useMemo(() => {
    const uniqueCustomers = new Set(filtered.map((item) => buildCustomerKey(item)));
    const activeCombos = filtered.filter((item) =>
      ["BOOKED", "IN_HOUSE"].includes(String(item.trangThaiGanNhat || "").trim().toUpperCase()),
    ).length;
    const completedCombos = filtered.filter(
      (item) => Math.min(item.daDen, item.soBuoiCuaCombo) >= item.soBuoiCuaCombo,
    ).length;
    const remainingSessions = filtered.reduce(
      (sum, item) => sum + Math.max(Number(item.soBuoiConLai || 0), 0),
      0,
    );
    return {
      customers: uniqueCustomers.size,
      activeCombos,
      completedCombos,
      remainingSessions,
    };
  }, [filtered]);

  const blockPanel = shouldBlockPanelUI(loading, rows.length > 0);

  return (
    <main className="app-page bg-slate-100 pb-24">
      <div className="app-shell space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-xl font-black text-slate-800">Tiến trình khách</h1>
              <p className="text-sm text-slate-500 mb-2">
                Theo dõi combo điều trị từ {MIN_COMBO_SESSIONS} buổi trở lên. Mỗi buổi gắn với một mã phiên riêng.
              </p>
              <div className="flex flex-wrap items-center gap-3 text-[11px] font-semibold text-slate-600">
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-rose-50 border border-rose-300"></span>Có buổi hôm nay</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-emerald-50 border border-emerald-200"></span>Đang còn buổi</span>
                <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-full bg-slate-100 border border-slate-300"></span>Đã hoàn tất</span>
              </div>
            </div>
            <button
              type="button"
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-white disabled:cursor-not-allowed disabled:opacity-70"
            >
              {refreshing ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-700/80 border-r-transparent" />
              ) : null}
              {refreshing ? "Đang tải..." : "Tải lại"}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,1fr)_repeat(4,minmax(0,160px))]">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Tìm theo khách, SĐT, mã tiến trình, mã phiên, gói đang điều trị..."
              className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm"
            />
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Khách đang theo dõi</p>
              <p className="mt-1 text-xl font-black text-slate-900">{summary.customers}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Combo còn hoạt động</p>
              <p className="mt-1 text-xl font-black text-slate-900">{summary.activeCombos}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Đã hoàn tất</p>
              <p className="mt-1 text-xl font-black text-slate-900">{summary.completedCombos}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Buổi còn lại</p>
              <p className="mt-1 text-xl font-black text-slate-900">{summary.remainingSessions}</p>
            </div>
          </div>
        </section>

        {blockPanel ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
            Đang tải tiến trình khách...
          </section>
        ) : error ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-10 text-center text-red-600 shadow-sm">
            <p className="font-semibold">Lỗi tải dữ liệu</p>
            <p className="mt-1 text-sm">{error}</p>
          </section>
        ) : filtered.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
            Chưa có combo từ {MIN_COMBO_SESSIONS} buổi trở lên phù hợp với bộ lọc hiện tại.
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {filtered.map((item) => (
              <article
                key={item.maTienTrinh}
                className={`rounded-2xl border p-4 transition-colors ${item.cardColor} ${item.borderColor}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {item.maTienTrinh}
                    </p>
                    <h3 className="mt-1 truncate text-lg font-black text-slate-900">
                      {item.tenKhach || "Khách ghé thăm"}
                    </h3>
                    <p className="mt-1 truncate text-sm text-slate-500">
                      {item.soDienThoai || "Chưa có SĐT"} • {item.goiCombo || "Chưa gắn gói"}
                    </p>
                  </div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(item.trangThaiGanNhat)}`}>
                    {statusLabel(item.trangThaiGanNhat)}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tiến độ</p>
                    <p className="mt-1 text-lg font-black text-slate-900">
                      {Math.min(item.daDen, item.soBuoiCuaCombo)}/{item.soBuoiCuaCombo}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Buổi hiện tại</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{item.sessionHienTai}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Còn lại</p>
                    <p className="mt-1 text-lg font-black text-slate-900">{item.soBuoiConLai}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800">Các buổi đã ghi nhận</p>
                    <button
                      type="button"
                      onClick={() => setSelected(item)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Xem chi tiết
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {item.sessions.slice(0, 3).map((session) => (
                      <div
                        key={session.maPhien}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            Buổi {session.buoiThu}/{item.soBuoiCuaCombo} • {session.maPhien}
                          </p>
                          <p className="truncate text-xs text-slate-500">{fmtDateTime(session.ngay)}</p>
                        </div>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${statusTone(session.trangThai)}`}>
                          {statusLabel(session.trangThai)}
                        </span>
                      </div>
                    ))}
                    {item.sessions.length > 3 ? (
                      <p className="text-xs text-slate-500">Còn {item.sessions.length - 3} buổi khác trong tiến trình này.</p>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-[9600] bg-slate-900/40 p-3 sm:p-4" onClick={() => setSelected(null)}>
          <div
            className="mx-auto mt-4 max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{selected.maTienTrinh}</p>
                <h3 className="truncate text-lg font-black text-slate-900">
                  {selected.tenKhach || "Khách ghé thăm"} • {selected.goiCombo || "Chưa gắn gói"}
                </h3>
                <p className="text-sm text-slate-500">
                  Đã tới {Math.min(selected.daDen, selected.soBuoiCuaCombo)}/{selected.soBuoiCuaCombo} buổi • Còn lại {selected.soBuoiConLai} buổi
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditingSchedule(!isEditingSchedule)}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold ${isEditingSchedule ? 'border-indigo-600 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-700'}`}
                >
                  {isEditingSchedule ? "Đóng Quản lý Lịch" : "Quản lý Lịch trình"}
                </button>
                <button
                  type="button"
                  onClick={() => { setSelected(null); setIsEditingSchedule(false); }}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Đóng
                </button>
              </div>
            </div>

            <div className="p-4">
              {isEditingSchedule ? (
                <ComboScheduleEditor
                  selected={selected}
                  onSaved={(schedule) => {
                    const lichTrinhChiTiet = JSON.stringify(schedule);
                    setIsEditingSchedule(false);
                    setSelected((prev) =>
                      prev
                        ? {
                            ...prev,
                            sessions: prev.sessions.map((session) => ({
                              ...session,
                              lichTrinhChiTiet,
                            })),
                          }
                        : prev,
                    );
                    hydrateFromCache();
                  }}
                />
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200">
                  <div className="grid grid-cols-[96px_minmax(0,1fr)_160px_140px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <div>Buổi</div>
                    <div>Phiên điều trị</div>
                    <div>Ngày giờ</div>
                    <div>Trạng thái</div>
                  </div>
                  {selected.sessions.map((session) => (
                    <div
                      key={session.maPhien}
                      className="grid grid-cols-[96px_minmax(0,1fr)_160px_140px] gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0"
                    >
                      <div className="text-sm font-semibold text-slate-800">
                        {session.buoiThu}/{selected.soBuoiCuaCombo}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-800">{session.maPhien}</p>
                        <p className="truncate text-xs text-slate-500">
                          Còn lại sau buổi này: {Math.max(Number(session.soBuoiConLai || 0), 0)} buổi
                        </p>
                      </div>
                      <div className="text-sm text-slate-700">{fmtDateTime(session.ngay)}</div>
                      <div>
                        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(session.trangThai)}`}>
                          {statusLabel(session.trangThai)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function ComboScheduleEditor({ selected, onSaved }) {
  const [schedule, setSchedule] = useState(() => {
    try {
      const raw = selected.sessions[0]?.lichTrinhChiTiet;
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return [];
  });

  const handleSave = async () => {
    const payload = {
      maTienTrinh: selected.maTienTrinh,
      lichTrinhChiTiet: JSON.stringify(schedule),
    };
    const res = await updateComboSchedule(payload);
    if (res?.success === false && !res?.isOptimistic) {
      toast.error(res.message || "Lỗi khi lưu lịch trình.");
      return;
    }
    onSaved(schedule);
  };

  return (
    <div className="bg-white rounded-xl border border-indigo-100 overflow-hidden shadow-sm">
      <div className="p-4 border-b border-indigo-100 bg-indigo-50 flex items-center justify-between">
        <div>
          <h4 className="font-semibold text-indigo-900">Quản lý Lịch trình & Trạng thái</h4>
          <p className="text-xs text-indigo-700 mt-1">Cập nhật lịch bù, dời lịch hoặc xác nhận khách bùng lịch (No-show).</p>
        </div>
        <button
          type="button"
          onClick={handleSave}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          Lưu Thay Đổi
        </button>
      </div>
      <div className="p-4">
        <ComboScheduleManager
          selectedDates={schedule}
          maxSessions={selected.soBuoiCuaCombo}
          onChange={setSchedule}
        />
      </div>
    </div>
  );
}


