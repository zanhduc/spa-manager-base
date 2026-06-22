import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CACHE_KEYS,
  getTreatmentBeds,
  getTreatmentHistory,
  getSpaStaff,
  updateStayStaff,
} from "../api";
import { useCachedQuery } from "../hooks/useCachedQuery.js";
import {
  bootstrapSilentAny,
  hasCachedResponse,
  readCachedList,
  shouldBlockPanelUI,
} from "../utils/cacheBootstrap.js";
import { toUsDateTime, getTimeMs, toIsoDate } from "../../core/dateUtils";
import toast from "react-hot-toast";

const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");

const prettyTime = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  return toUsDateTime(raw) || raw;
};

const getStayStartAt = (stay) => stay?.batDauAt || "";
const getStayExpectedEndAt = (stay) => stay?.ketThucDuKien || "";
const getStayActualEndAt = (stay) => stay?.ketThucThucTe || "";
const getStayPackageAmount = (stay) =>
  Math.max(Number(stay?.tienGoi ?? 0), 0);

const STATUS_OPTIONS = ["ALL", "BOOKED", "IN_HOUSE", "CHECKED_OUT", "NO_SHOW"];

function statusLabel(status) {
  const key = String(status || "").toUpperCase();
  if (key === "BOOKED") return "Đã hẹn";
  if (key === "IN_HOUSE") return "Đang trị liệu";
  if (key === "CHECKED_OUT") return "Đã kết thúc";
  if (key === "NO_SHOW") return "Không đến";
  return status || "-";
}

function statusTone(status) {
  const key = String(status || "").toUpperCase();
  if (key === "CHECKED_OUT") return "bg-emerald-50 text-emerald-700 border-emerald-200";
  if (key === "IN_HOUSE") return "bg-sky-50 text-sky-700 border-sky-200";
  if (key === "BOOKED") return "bg-rose-50 text-rose-700 border-rose-200";
  return "bg-slate-100 text-slate-700 border-slate-200";
}

const buildProgressGroups = (sessions = []) => {
  const grouped = new Map();
  sessions.forEach((session) => {
    const totalSessions = Math.max(Number(session?.tongBuoiCombo || 1), 1);
    const baseKey = String(session?.maTienTrinh || session?.maPhien || "").trim();
    const key =
      totalSessions <= 1
        ? [baseKey, session?.maPhien, getStayStartAt(session)].filter(Boolean).join("::")
        : baseKey;
    if (!key) return;
    const current = grouped.get(key) || [];
    current.push(session);
    grouped.set(key, current);
  });
  return [...grouped.entries()]
    .map(([maTienTrinh, rows]) => {
      const sortedRows = [...rows].sort((a, b) => {
        const sessionDelta = Number(a?.buoiThu || 0) - Number(b?.buoiThu || 0);
        if (sessionDelta !== 0) return sessionDelta;
        return getTimeMs(getStayStartAt(a)) - getTimeMs(getStayStartAt(b));
      });
      const latest = [...sortedRows].sort(
        (a, b) => getTimeMs(getStayStartAt(b)) - getTimeMs(getStayStartAt(a)),
      )[0];
      const totalSessions = Math.max(Number(latest?.tongBuoiCombo || 1), 1);
      const completedSessions = sortedRows.filter(
        (row) => String(row?.trangThaiPhien || "").trim().toUpperCase() === "CHECKED_OUT",
      ).length;
      const searchKey = [
        String(latest?.maTienTrinh || maTienTrinh).trim(),
        latest?.tenKhach,
        latest?.soDienThoai,
        latest?.tenGoi,
        latest?.maGoi,
        ...sortedRows.map((row) => [row.maPhien, row.maLichHen, row.maGiuong].join(" ")),
      ]
        .join(" ")
        .toLowerCase();
      return {
        maTienTrinh: String(latest?.maTienTrinh || maTienTrinh).trim(),
        tenKhach: String(latest?.tenKhach || "").trim(),
        soDienThoai: String(latest?.soDienThoai || "").trim(),
        maGoi: String(latest?.maGoi || "").trim(),
        tenGoi: String(latest?.tenGoi || latest?.tenDichVu || "").trim(),
        tongBuoiCombo: totalSessions,
        daDen: completedSessions,
        trangThaiGanNhat: String(latest?.trangThaiPhien || "").trim(),
        maGiuongGanNhat: String(latest?.maGiuong || "").trim(),
        ngayGanNhat: getStayStartAt(latest),
        tongThanhToan: sortedRows.reduce((sum, row) => sum + Math.max(Number(row?.tongThanhToan || 0), 0), 0),
        sessions: sortedRows,
        searchKey,
      };
    })
    .sort((a, b) => getTimeMs(b.ngayGanNhat) - getTimeMs(a.ngayGanNhat));
};

// Session row component with staff edit
function SessionRow({ session, tongBuoiCombo, staffList, onStaffChange }) {
  const [editingStaff, setEditingStaff] = useState(false);
  const [selectedStaff, setSelectedStaff] = useState(session.maNhanVien || "");
  const [saving, setSaving] = useState(false);

  const sessionStatus = String(session.trangThaiPhien || "").toUpperCase();
  const isEditable = !["CHECKED_OUT", "CANCELLED"].includes(sessionStatus);

  // DEBUG: Log session info
  console.log("[SessionRow] maPhien:", session.maPhien, "status:", sessionStatus, "isEditable:", isEditable);

  const handleStaffSave = async () => {
    if (selectedStaff === (session.maNhanVien || "")) {
      setEditingStaff(false);
      return;
    }
    setSaving(true);
    try {
      const res = await updateStayStaff({
        maPhien: session.maPhien,
        maNhanVien: selectedStaff,
      });
      if (res.success) {
        toast.success("Đã cập nhật nhân viên");
        onStaffChange && onStaffChange(session.maPhien, selectedStaff);
        setEditingStaff(false);
      } else {
        toast.error(res.message || "Không thể cập nhật nhân viên");
      }
    } catch (e) {
      toast.error("Lỗi: " + e.message);
    }
    setSaving(false);
  };

  const handleCancel = () => {
    setSelectedStaff(session.maNhanVien || "");
    setEditingStaff(false);
  };

  return (
    <div className="grid grid-cols-[96px_100px_120px_80px_1fr_120px] gap-3 border-b border-slate-100 px-4 py-3 last:border-b-0 items-center">
      <div className="text-sm font-semibold text-slate-800">
        {session.buoiThu}/{tongBuoiCombo}
      </div>
      <div className="text-sm font-semibold text-slate-800">{session.maPhien}</div>
      <div className="text-sm text-slate-700">{session.maGiuong || "-"}</div>
      {/* Nhân viên KTV */}
      <div className="text-sm">
        {editingStaff ? (
          <div className="flex items-center gap-1">
            <select
              value={selectedStaff}
              onChange={(e) => setSelectedStaff(e.target.value)}
              disabled={saving}
              className="w-full rounded border border-slate-300 bg-white px-1 py-1 text-xs"
            >
              <option value="">-- Chọn NV --</option>
              {staffList.map((s) => (
                <option key={s.maNhanVien} value={s.maNhanVien}>
                  {s.tenNhanVien}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <span className="text-xs text-slate-600">
            {session.tenNhanVien || session.maNhanVien || "-"}
          </span>
        )}
      </div>
      <div className="space-y-1 text-sm text-slate-700">
        <p>{prettyTime(getStayStartAt(session))}</p>
        <p className="text-xs text-slate-500">
          Gói: {fmt(getStayPackageAmount(session))} • DV: {fmt(session.tienDichVu)} • Tổng: {fmt(session.tongThanhToan)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(session.trangThaiPhien)}`}>
          {statusLabel(session.trangThaiPhien)}
        </span>
        {isEditable && !editingStaff && (
          <button
            type="button"
            onClick={() => setEditingStaff(true)}
            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
          >
            Sửa NV
          </button>
        )}
        {editingStaff && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleStaffSave}
              disabled={saving}
              className="rounded bg-emerald-500 px-2 py-1 text-xs text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {saving ? "..." : "Lưu"}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={saving}
              className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-50"
            >
              Hủy
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function HistoryPage() {
  // Initialize from cache immediately
  const initialRooms = useMemo(() => readCachedList(CACHE_KEYS.rooms), []);
  const initialStays = useMemo(() => readCachedList(CACHE_KEYS.stayHistory), []);
  const initialStaffs = useMemo(() => readCachedList(CACHE_KEYS.staffCatalog), []);
  const [rooms, setRooms] = useState(initialRooms);
  const [list, setList] = useState(initialStays);
  const [staffList, setStaffList] = useState(initialStaffs);
  const [loading, setLoading] = useState(() =>
    !bootstrapSilentAny(CACHE_KEYS.stayHistory, CACHE_KEYS.rooms),
  );
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("ALL");
  const [room, setRoom] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);

  // useCachedQuery for rooms
  const {
    data: roomData,
    isLoading: roomsLoading,
    refresh: refreshRooms,
  } = useCachedQuery(getTreatmentBeds, CACHE_KEYS.rooms, {
    select: (res) => res?.data || [],
  });

  // useCachedQuery for stays
  const {
    data: stayData,
    isLoading: staysLoading,
    refresh: refreshStays,
  } = useCachedQuery(getTreatmentHistory, CACHE_KEYS.stayHistory, {
    select: (res) => res?.data || [],
  });

  // useCachedQuery for staffs
  const {
    data: staffData,
    isLoading: staffsLoading,
    refresh: refreshStaffs,
  } = useCachedQuery(getSpaStaff, CACHE_KEYS.staffCatalog, {
    select: (res) => res?.data || [],
  });

  // Sync data from useCachedQuery to local state
  useEffect(() => {
    if (Array.isArray(roomData)) setRooms(roomData);
  }, [roomData]);

  useEffect(() => {
    if (Array.isArray(stayData)) setList(stayData);
  }, [stayData]);

  useEffect(() => {
    if (Array.isArray(staffData)) setStaffList(staffData);
  }, [staffData]);

  // Keep loading state in sync
  useEffect(() => {
    if (!roomsLoading && !staysLoading && !staffsLoading) setLoading(false);
  }, [roomsLoading, staysLoading, staffsLoading]);

  // Handle error from stays query
  useEffect(() => {
    if (stayData && stayData.success === false) {
      setError(stayData.message || "Không thể tải lịch sử trị liệu.");
      setList([]);
    } else {
      setError(null);
    }
  }, [stayData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await Promise.all([refreshRooms(), refreshStays(), refreshStaffs()]);
    } finally {
      setRefreshing(false);
    }
  };

  // Handle staff change in session
  const handleStaffChange = useCallback((maPhien, newMaNhanVien) => {
    // Tìm staff info
    const staff = newMaNhanVien
      ? staffList.find((s) => String(s.maNhanVien || "").trim() === String(newMaNhanVien || "").trim())
      : null;
    const newTenNhanVien = staff ? staff.tenNhanVien : (newMaNhanVien || "");

    setList((prevList) => {
      const newList = prevList.map((item) => {
        if (item.maPhien === maPhien) {
          return {
            ...item,
            maNhanVien: newMaNhanVien,
            tenNhanVien: newTenNhanVien,
          };
        }
        return item;
      });
      return newList;
    });
    // Update selected if open
    if (selected) {
      const updatedSessions = selected.sessions.map((s) => {
        if (s.maPhien === maPhien) {
          return {
            ...s,
            maNhanVien: newMaNhanVien,
            tenNhanVien: newTenNhanVien,
          };
        }
        return s;
      });
      setSelected((prev) => prev ? { ...prev, sessions: updatedSessions } : prev);
    }
  }, [staffList, selected]);

  const allGroups = useMemo(() => buildProgressGroups(list), [list]);

  const groups = useMemo(() => {
    const q = String(keyword || "").trim().toLowerCase();
    return allGroups.filter((group) => {
      const hasMatchingSession = group.sessions.some((item) => {
        if (status !== "ALL" && String(item.trangThaiPhien || "").toUpperCase() !== status) {
          return false;
        }
        if (room !== "ALL" && String(item.maGiuong || "") !== room) return false;
        if (fromDate) {
          const fromMs = getTimeMs(fromDate);
          const sessionMs = getTimeMs(getStayStartAt(item));
          if (fromMs > 0 && sessionMs > 0 && sessionMs < fromMs) return false;
        }
        if (toDate) {
          const toMs = getTimeMs(toDate) + 86400000;
          const sessionMs = getTimeMs(getStayStartAt(item));
          if (toMs > 0 && sessionMs > 0 && sessionMs > toMs) return false;
        }
        return true;
      });
      if (!hasMatchingSession) return false;
      if (!q) return true;
      return group.searchKey.includes(q);
    });
  }, [allGroups, keyword, status, room, fromDate, toDate]);

  const summary = useMemo(() => {
    const totalProgress = groups.length;
    const totalSessions = groups.reduce(
      (sum, group) => sum + Number(group.sessions?.length || 0),
      0,
    );
    const activeProgress = groups.filter((group) =>
      ["BOOKED", "IN_HOUSE"].includes(String(group.trangThaiGanNhat || "").trim().toUpperCase()),
    ).length;
    return {
      totalProgress,
      totalSessions,
      activeProgress,
    };
  }, [groups]);

  const blockPanel = shouldBlockPanelUI(loading, list.length > 0);

  return (
    <main className="app-page bg-slate-100 pb-24">
      <div className="app-shell space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-xl font-black text-slate-800">Danh sách lịch trị liệu</h1>
              <p className="text-sm text-slate-500">
                Mỗi combo được nhóm theo tiến trình điều trị, hiển thị rõ khách đã tới bao nhiêu buổi và từng mã phiên tương ứng.
              </p>
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

          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-5">
            <input
              value={keyword}
              onChange={(event) => setKeyword(event.target.value)}
              placeholder="Mã tiến trình / mã phiên / khách / SĐT / gói"
              className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm sm:col-span-2 md:col-span-2"
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? "Tất cả trạng thái" : statusLabel(option)}
                </option>
              ))}
            </select>
            <select
              value={room}
              onChange={(event) => setRoom(event.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <option value="ALL">Tất cả giường trị liệu</option>
              {rooms.map((item) => (
                <option key={item.maGiuong} value={item.maGiuong}>
                  {item.tenGiuong} ({item.maGiuong})
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={fromDate}
                onChange={(event) => setFromDate(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm"
              />
              <input
                type="date"
                value={toDate}
                onChange={(event) => setToDate(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-2 py-2.5 text-sm"
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tiến trình</p>
              <p className="mt-1 text-lg font-black text-slate-900">{summary.totalProgress}</p>
            </div>
            <div className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">Đang hoạt động</p>
              <p className="mt-1 text-lg font-black text-sky-900">{summary.activeProgress}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Tổng buổi</p>
              <p className="mt-1 text-lg font-black text-slate-900">{summary.totalSessions}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Đang lọc</p>
              <p className="mt-1 text-lg font-black text-slate-900">{groups.length}</p>
            </div>
          </div>
        </section>

        {blockPanel ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
            Đang tải lịch sử phiên trị liệu...
          </section>
        ) : error ? (
          <section className="rounded-2xl border border-red-200 bg-red-50 p-10 text-center text-red-600 shadow-sm">
            <p className="font-semibold">Lỗi tải dữ liệu</p>
            <p className="mt-1 text-sm">{error}</p>
          </section>
        ) : groups.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
            Không có dữ liệu phù hợp.
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            {groups.map((group) => (
              <article key={group.maTienTrinh} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{group.maTienTrinh}</p>
                    <h3 className="mt-1 truncate text-lg font-black text-slate-900">
                      {group.tenKhach || "Khách ghé thăm"}
                    </h3>
                    <p className="truncate text-sm text-slate-500">
                      {group.tenGoi || "Chưa gắn gói"} • {group.soDienThoai || "Chưa có SĐT"}
                    </p>
                  </div>
                  <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${statusTone(group.trangThaiGanNhat)}`}>
                    {statusLabel(group.trangThaiGanNhat)}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2">
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Đã tới</p>
                    <p className="mt-1 text-lg font-black text-slate-900">
                      {Math.min(group.daDen, group.tongBuoiCombo)}/{group.tongBuoiCombo}
                    </p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Phiên gần nhất</p>
                    <p className="mt-1 text-sm font-black text-slate-900">{group.sessions[group.sessions.length - 1]?.maPhien || "-"}</p>
                  </div>
                  <div className="rounded-xl bg-slate-50 px-3 py-2">
                    <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Doanh thu ghi nhận</p>
                    <p className="mt-1 text-sm font-black text-slate-900">{fmt(group.tongThanhToan)}</p>
                  </div>
                </div>

                <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-slate-800">
                      Chi tiết các buổi • {group.maGiuongGanNhat || "Chưa gắn giường"}
                    </p>
                    <button
                      type="button"
                      onClick={() => setSelected(group)}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                    >
                      Xem chi tiết
                    </button>
                  </div>
                  <div className="mt-3 space-y-2">
                    {group.sessions.slice(0, 3).map((session) => (
                      <div
                        key={session.maPhien}
                        className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-800">
                            Buổi {session.buoiThu}/{group.tongBuoiCombo} • {session.maPhien}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {session.tenNhanVien || session.maNhanVien || "-"} • {session.maGiuong || "Chưa gắn giường"} • {prettyTime(getStayStartAt(session))}
                          </p>
                        </div>
                        <span className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${statusTone(session.trangThaiPhien)}`}>
                          {statusLabel(session.trangThaiPhien)}
                        </span>
                      </div>
                    ))}
                    {group.sessions.length > 3 ? (
                      <p className="text-xs text-slate-500">Còn {group.sessions.length - 3} buổi khác trong lịch sử combo này.</p>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      {selected ? (
        <div className="fixed inset-0 z-[9500] bg-slate-900/40 overflow-y-auto p-3 sm:p-4" onClick={() => setSelected(null)}>
          <div
            className="mx-auto my-4 w-full max-w-5xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <div className="min-w-0 pr-3">
                <h3 className="truncate text-base font-bold text-slate-800">
                  {selected.tenKhach || "Khách ghé thăm"} • {selected.tenGoi || "Chưa gắn gói"}
                </h3>
                <p className="text-sm text-slate-500">
                  {selected.maTienTrinh} • Đã tới {Math.min(selected.daDen, selected.tongBuoiCombo)}/{selected.tongBuoiCombo} buổi
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Đóng
              </button>
            </div>

            <div className="space-y-4 px-4 py-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Khách</p>
                  <p className="mt-1 font-semibold">{selected.tenKhach || "-"}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">SĐT</p>
                  <p className="mt-1 font-semibold">{selected.soDienThoai || "-"}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Gói trị liệu</p>
                  <p className="mt-1 font-semibold">{selected.tenGoi || "-"}</p>
                </div>
                <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tiến độ</p>
                  <p className="mt-1 font-semibold">
                    {Math.min(selected.daDen, selected.tongBuoiCombo)}/{selected.tongBuoiCombo} buổi
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto rounded-2xl border border-slate-200">
                <div className="grid grid-cols-[96px_100px_120px_80px_1fr_120px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <div>Buổi</div>
                  <div>Mã phiên</div>
                  <div>Giường</div>
                  <div>NV KTV</div>
                  <div>Ngày giờ / tiền</div>
                  <div>Trạng thái</div>
                </div>
                {selected.sessions.map((session) => (
                  <SessionRow
                    key={session.maPhien}
                    session={session}
                    tongBuoiCombo={selected.tongBuoiCombo}
                    staffList={staffList}
                    onStaffChange={handleStaffChange}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
