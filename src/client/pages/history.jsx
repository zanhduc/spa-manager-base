import { useEffect, useMemo, useState } from "react";
import { CACHE_INVALIDATED_EVENT, CACHE_KEYS, getRooms, getStayHistory } from "../api";

const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");

const prettyTime = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("vi-VN");
};

const STATUS_OPTIONS = ["ALL", "BOOKED", "IN_HOUSE", "CHECKED_OUT", "CANCELLED"];

function statusLabel(status) {
  const key = String(status || "").toUpperCase();
  if (key === "BOOKED") return "Đã đặt trước";
  if (key === "IN_HOUSE") return "Đang ở";
  if (key === "CHECKED_OUT") return "Đã checkout";
  if (key === "CANCELLED") return "Đã hủy";
  return status || "-";
}

export default function HistoryPage() {
  const [rooms, setRooms] = useState([]);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("ALL");
  const [room, setRoom] = useState("ALL");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [selected, setSelected] = useState(null);

  const loadData = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [roomRes, stayRes] = await Promise.all([
        getRooms(),
        getStayHistory({}),
      ]);
      setRooms(Array.isArray(roomRes?.data) ? roomRes.data : []);
      setList(Array.isArray(stayRes?.data) ? stayRes.data : []);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const onInvalidated = (event) => {
      const keys = event?.detail?.keys;
      if (!Array.isArray(keys)) return;
      if (keys.includes(CACHE_KEYS.rooms) || keys.includes(CACHE_KEYS.stayHistory)) {
        loadData({ silent: true });
      }
    };
    window.addEventListener(CACHE_INVALIDATED_EVENT, onInvalidated);
    return () => window.removeEventListener(CACHE_INVALIDATED_EVENT, onInvalidated);
  }, []);

  const filtered = useMemo(() => {
    const q = String(keyword || "").trim().toLowerCase();
    return list.filter((item) => {
      if (status !== "ALL" && String(item.trangThaiLuuTru || "").toUpperCase() !== status)
        return false;
      if (room !== "ALL" && String(item.maPhong || "") !== room) return false;
      if (fromDate) {
        const fromMs = new Date(fromDate).getTime();
        const checkinMs = new Date(item.checkinAt || 0).getTime();
        if (Number.isFinite(fromMs) && Number.isFinite(checkinMs) && checkinMs < fromMs)
          return false;
      }
      if (toDate) {
        const toMs = new Date(toDate).getTime() + 86400000;
        const checkinMs = new Date(item.checkinAt || 0).getTime();
        if (Number.isFinite(toMs) && Number.isFinite(checkinMs) && checkinMs > toMs)
          return false;
      }
      if (!q) return true;
      const source = [item.maLuuTru, item.maDatPhong, item.maPhong, item.tenKhach, item.soDienThoai]
        .join(" ")
        .toLowerCase();
      return source.includes(q);
    });
  }, [list, keyword, status, room, fromDate, toDate]);

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 md:px-5 md:py-5">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h1 className="text-xl font-black text-slate-800">Lịch sử lưu trú</h1>
          <p className="text-sm text-slate-500">Tra cứu theo phòng, trạng thái và thời gian checkin.</p>

          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-5">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Mã lưu trú / khách / SĐT"
              className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5 text-sm md:col-span-2"
            />
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              {STATUS_OPTIONS.map((x) => (
                <option key={`status-${x}`} value={x}>
                  {x === "ALL" ? "Tất cả trạng thái" : statusLabel(x)}
                </option>
              ))}
            </select>
            <select
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <option value="ALL">Tất cả phòng</option>
              {rooms.map((r) => (
                <option key={`room-${r.maPhong}`} value={r.maPhong}>
                  {r.tenPhong} ({r.maPhong})
                </option>
              ))}
            </select>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              />
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
              />
            </div>
          </div>
        </section>

        {loading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
            Đang tải lịch sử lưu trú...
          </section>
        ) : filtered.length === 0 ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
            Không có dữ liệu phù hợp.
          </section>
        ) : (
          <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((item) => (
              <article
                key={item.maLuuTru}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-bold text-slate-800">{item.maLuuTru}</p>
                    <p className="text-xs text-slate-500">
                      {item.maPhong} • {statusLabel(item.trangThaiLuuTru)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelected(item)}
                    className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Chi tiết
                  </button>
                </div>

                <div className="mt-3 space-y-1 text-xs text-slate-700">
                  <p>
                    <strong>Khách:</strong> {item.tenKhach || "-"}
                  </p>
                  <p>
                    <strong>Checkin:</strong> {prettyTime(item.checkinAt)}
                  </p>
                  <p>
                    <strong>Checkout:</strong> {prettyTime(item.checkoutAtThucTe)}
                  </p>
                  <p>
                    <strong>Tiền phòng:</strong> {fmt(item.tienPhong)}
                  </p>
                  <p>
                    <strong>Dịch vụ:</strong> {fmt(item.tienDichVu)}
                  </p>
                </div>

                <div className="mt-3 rounded-lg bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                  Tổng: <strong>{fmt(item.tongThanhToan)}</strong>
                  <span className="mx-1.5">•</span>
                  Thu checkout: <strong>{fmt(item.canThuCheckout)}</strong>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[9500] bg-slate-900/40 p-4">
          <div className="mx-auto mt-[6vh] w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-base font-bold text-slate-800">Chi tiết lưu trú {selected.maLuuTru}</h3>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
              >
                Đóng
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-2">
              <div className="space-y-1 text-sm text-slate-700">
                <p><strong>Phòng:</strong> {selected.maPhong}</p>
                <p><strong>Khách:</strong> {selected.tenKhach}</p>
                <p><strong>SĐT:</strong> {selected.soDienThoai || "-"}</p>
                <p><strong>Trạng thái:</strong> {statusLabel(selected.trangThaiLuuTru)}</p>
                <p><strong>Checkin:</strong> {prettyTime(selected.checkinAt)}</p>
                <p><strong>Checkout dự kiến:</strong> {prettyTime(selected.checkoutAtDuKien)}</p>
                <p><strong>Checkout thực tế:</strong> {prettyTime(selected.checkoutAtThucTe)}</p>
              </div>
              <div className="space-y-1 text-sm text-slate-700">
                <p><strong>Hình thức giá:</strong> {selected.hinhThucTinhGia}</p>
                <p><strong>Số đêm:</strong> {selected.soDem || 0}</p>
                <p><strong>Số giờ:</strong> {selected.soGio || 0}</p>
                <p><strong>Đơn giá:</strong> {fmt(selected.donGiaPhongApDung)}</p>
                <p><strong>Tiền phòng:</strong> {fmt(selected.tienPhong)}</p>
                <p><strong>Tiền dịch vụ:</strong> {fmt(selected.tienDichVu)}</p>
                <p><strong>Đã thu checkin:</strong> {fmt(selected.daThuCheckin)}</p>
                <p><strong>Thu checkout:</strong> {fmt(selected.canThuCheckout)}</p>
              </div>
            </div>

            <div className="border-t border-slate-200 px-4 py-3">
              <p className="mb-2 text-sm font-semibold text-slate-700">Dịch vụ phát sinh</p>
              <div className="max-h-56 overflow-auto rounded-xl border border-slate-200">
                {(selected.serviceItems || []).length === 0 ? (
                  <div className="px-3 py-3 text-sm text-slate-500">Không có phát sinh.</div>
                ) : (
                  (selected.serviceItems || []).map((item, idx) => (
                    <div
                      key={`${selected.maLuuTru}-svc-${idx}`}
                      className="grid grid-cols-[1fr_auto] gap-2 border-b border-slate-100 px-3 py-2 text-sm last:border-b-0"
                    >
                      <div>
                        <p className="font-semibold text-slate-800">{item.tenSanPham}</p>
                        <p className="text-xs text-slate-500">
                          {item.soLuong} {item.donVi || ""} x {fmt(item.donGia)}
                        </p>
                      </div>
                      <p className="font-semibold text-slate-800">{fmt(item.thanhTien)}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
