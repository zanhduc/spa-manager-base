import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import {
  CACHE_INVALIDATED_EVENT,
  CACHE_KEYS,
  addStayServiceItem,
  checkInRoom,
  checkoutRoom,
  createBooking,
  getProductCatalog,
  getRooms,
  getStayHistory,
  updateRoomStatus,
} from "../api";

const ROOM_STATUS = {
  AVAILABLE: "Trống",
  IN_HOUSE: "Đang ở",
  CLEANING: "Đang dọn",
  BOOKED: "Đã đặt trước",
  MAINTENANCE: "Bảo trì",
};

const STATUS_OPTIONS = [
  ROOM_STATUS.AVAILABLE,
  ROOM_STATUS.IN_HOUSE,
  ROOM_STATUS.CLEANING,
  ROOM_STATUS.BOOKED,
  ROOM_STATUS.MAINTENANCE,
];

const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");

const nowLocalDateTimeInput = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const plusHoursInput = (hours) => {
  const now = new Date();
  now.setHours(now.getHours() + hours);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const plusDaysInput = (days) => {
  const now = new Date();
  now.setDate(now.getDate() + days);
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
};

const toIso = (input) => {
  const raw = String(input || "").trim();
  if (!raw) return "";
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString();
};

const prettyTime = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString("vi-VN");
};

const cardTone = (status) => {
  if (status === ROOM_STATUS.AVAILABLE)
    return "border-emerald-200 bg-emerald-50/60";
  if (status === ROOM_STATUS.IN_HOUSE) return "border-sky-200 bg-sky-50/70";
  if (status === ROOM_STATUS.CLEANING)
    return "border-amber-200 bg-amber-50/70";
  if (status === ROOM_STATUS.BOOKED) return "border-violet-200 bg-violet-50/70";
  return "border-rose-200 bg-rose-50/70";
};

function SectionTitle({ children }) {
  return (
    <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
      {children}
    </h2>
  );
}

function RoomCard({ room, stay, onQuickCheckIn, onOpenStay, onStatusChange }) {
  const isInHouse = room.trangThaiPhong === ROOM_STATUS.IN_HOUSE;
  const canQuickCheckIn =
    room.trangThaiPhong === ROOM_STATUS.AVAILABLE ||
    room.trangThaiPhong === ROOM_STATUS.BOOKED;

  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm transition-all ${cardTone(room.trangThaiPhong)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold text-slate-800">{room.tenPhong}</p>
          <p className="text-xs text-slate-500">
            {room.maPhong} • {room.loaiPhong || "-"}
          </p>
        </div>
        <span className="rounded-full border border-white/60 bg-white/70 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
          {room.trangThaiPhong}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700">
        <div className="rounded-lg bg-white/70 px-2 py-1.5">
          Đêm: <strong>{fmt(room.giaTheoDem)}</strong>
        </div>
        <div className="rounded-lg bg-white/70 px-2 py-1.5">
          Giờ: <strong>{fmt(room.giaTheoGio)}</strong>
        </div>
      </div>

      {isInHouse && stay && (
        <div className="mt-3 rounded-xl border border-sky-200 bg-white/80 px-3 py-2 text-xs text-slate-700">
          <p>
            <strong>Khách:</strong> {stay.tenKhach || "-"}
          </p>
          <p>
            <strong>Checkin:</strong> {prettyTime(stay.checkinAt)}
          </p>
          <p>
            <strong>Phát sinh:</strong> {fmt(stay.tienDichVu)}
          </p>
        </div>
      )}

      <div className="mt-3 grid grid-cols-3 gap-2">
        <button
          type="button"
          disabled={!canQuickCheckIn}
          onClick={() => onQuickCheckIn(room)}
          className={`rounded-lg px-2 py-2 text-xs font-semibold ${
            canQuickCheckIn
              ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border border-slate-200 bg-slate-100 text-slate-400"
          }`}
        >
          Checkin
        </button>
        <button
          type="button"
          disabled={!isInHouse || !stay}
          onClick={() => onOpenStay(room, stay)}
          className={`rounded-lg px-2 py-2 text-xs font-semibold ${
            isInHouse && stay
              ? "border border-sky-200 bg-sky-50 text-sky-700"
              : "border border-slate-200 bg-slate-100 text-slate-400"
          }`}
        >
          Hồ sơ ở
        </button>
        <select
          value={room.trangThaiPhong}
          onChange={(e) => onStatusChange(room, e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-semibold text-slate-700"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={`${room.maPhong}-${option}`} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
    </article>
  );
}

function CheckinModal({ room, onClose, onSubmit, onCreateBooking, loading }) {
  const [form, setForm] = useState(() => ({
    tenKhach: "",
    soDienThoai: "",
    giayTo: "",
    hinhThucTinhGia: "THEO_DEM",
    checkinAt: nowLocalDateTimeInput(),
    checkoutAtDuKien: plusDaysInput(1),
    donGiaPhongApDung: Number(room?.giaTheoDem || 0),
    ghiChu: "",
  }));

  useEffect(() => {
    if (!room) return;
    setForm((prev) => ({
      ...prev,
      donGiaPhongApDung:
        prev.hinhThucTinhGia === "THEO_GIO"
          ? Number(room.giaTheoGio || 0)
          : Number(room.giaTheoDem || 0),
    }));
  }, [room]);

  const handlePricingType = (next) => {
    setForm((prev) => ({
      ...prev,
      hinhThucTinhGia: next,
      checkoutAtDuKien: next === "THEO_GIO" ? plusHoursInput(2) : plusDaysInput(1),
      donGiaPhongApDung:
        next === "THEO_GIO"
          ? Number(room?.giaTheoGio || 0)
          : Number(room?.giaTheoDem || 0),
    }));
  };

  const quantity = useMemo(() => {
    const checkinMs = new Date(form.checkinAt).getTime();
    const checkoutMs = new Date(form.checkoutAtDuKien).getTime();
    if (!Number.isFinite(checkinMs) || !Number.isFinite(checkoutMs) || checkoutMs <= checkinMs)
      return 1;
    if (form.hinhThucTinhGia === "THEO_GIO") {
      return Math.max(1, Math.ceil((checkoutMs - checkinMs) / (60 * 60 * 1000)));
    }
    return Math.max(1, Math.ceil((checkoutMs - checkinMs) / (24 * 60 * 60 * 1000)));
  }, [form.checkinAt, form.checkoutAtDuKien, form.hinhThucTinhGia]);

  const estimated = Math.max(0, Number(form.donGiaPhongApDung || 0)) * quantity;

  return (
    <div className="fixed inset-0 z-[9500] bg-slate-900/40 p-4">
      <div className="mx-auto mt-[6vh] w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 className="text-base font-bold text-slate-800">
            Checkin {room?.tenPhong}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Đóng
          </button>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              value={form.tenKhach}
              onChange={(e) => setForm((p) => ({ ...p, tenKhach: e.target.value }))}
              placeholder="Tên khách"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={form.soDienThoai}
              onChange={(e) => setForm((p) => ({ ...p, soDienThoai: e.target.value }))}
              placeholder="Số điện thoại"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={form.giayTo}
              onChange={(e) => setForm((p) => ({ ...p, giayTo: e.target.value }))}
              placeholder="CCCD/Passport"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <select
              value={form.hinhThucTinhGia}
              onChange={(e) => handlePricingType(e.target.value)}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="THEO_DEM">Theo đêm</option>
              <option value="THEO_GIO">Theo giờ</option>
            </select>
            <input
              type="datetime-local"
              value={form.checkinAt}
              onChange={(e) => setForm((p) => ({ ...p, checkinAt: e.target.value }))}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              type="datetime-local"
              value={form.checkoutAtDuKien}
              onChange={(e) =>
                setForm((p) => ({ ...p, checkoutAtDuKien: e.target.value }))
              }
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={form.donGiaPhongApDung}
              onChange={(e) =>
                setForm((p) => ({
                  ...p,
                  donGiaPhongApDung: Number(String(e.target.value).replace(/[^\d]/g, "") || 0),
                }))
              }
              placeholder="Đơn giá áp dụng"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
            <input
              value={form.ghiChu}
              onChange={(e) => setForm((p) => ({ ...p, ghiChu: e.target.value }))}
              placeholder="Ghi chú"
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>

          <div className="rounded-xl border border-rose-200 bg-rose-50/70 px-3 py-2 text-sm text-slate-700">
            {form.hinhThucTinhGia === "THEO_GIO" ? "Số giờ" : "Số đêm"}: <strong>{quantity}</strong>
            <span className="mx-2">•</span>
            Thu tiền phòng ngay: <strong>{fmt(estimated)}</strong>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 px-4 py-3">
          <button
            type="button"
            onClick={() =>
              onCreateBooking({
                maPhong: room?.maPhong,
                tenKhach: form.tenKhach,
                soDienThoai: form.soDienThoai,
                giayTo: form.giayTo,
                hinhThucTinhGia: form.hinhThucTinhGia,
                checkoutAtDuKien: toIso(form.checkoutAtDuKien),
                ghiChu: form.ghiChu,
              })
            }
            disabled={loading}
            className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-60"
          >
            Đặt trước
          </button>
          <button
            type="button"
            onClick={() =>
              onSubmit({
                maPhong: room?.maPhong,
                tenKhach: form.tenKhach,
                soDienThoai: form.soDienThoai,
                giayTo: form.giayTo,
                hinhThucTinhGia: form.hinhThucTinhGia,
                checkinAt: toIso(form.checkinAt),
                checkoutAtDuKien: toIso(form.checkoutAtDuKien),
                donGiaPhongApDung: Number(form.donGiaPhongApDung || 0),
                ghiChu: form.ghiChu,
              })
            }
            disabled={loading || !String(form.tenKhach || "").trim()}
            className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-60"
          >
            {loading ? "Đang xử lý..." : "Checkin ngay"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StayModal({ room, stay, catalog, onClose, onAddService, onCheckout, loading }) {
  const [tab, setTab] = useState("service");
  const [form, setForm] = useState(() => ({
    maSanPham: String(catalog?.[0]?.maSanPham || ""),
    soLuong: 1,
    donGia: Number(catalog?.[0]?.donGiaBan || 0),
    ghiChu: "",
  }));

  useEffect(() => {
    const first = catalog?.[0];
    if (!first) return;
    setForm((prev) => ({
      ...prev,
      maSanPham: prev.maSanPham || String(first.maSanPham || ""),
      donGia: prev.donGia || Number(first.donGiaBan || 0),
    }));
  }, [catalog]);

  const selectedProduct = useMemo(
    () => catalog.find((x) => String(x.maSanPham) === String(form.maSanPham)),
    [catalog, form.maSanPham],
  );

  return (
    <div className="fixed inset-0 z-[9500] bg-slate-900/40 p-4">
      <div className="mx-auto mt-[5vh] w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div>
            <h3 className="text-base font-bold text-slate-800">
              Hồ sơ {stay?.maLuuTru} - {room?.tenPhong}
            </h3>
            <p className="text-xs text-slate-500">
              Khách: {stay?.tenKhach || "-"} • Checkin: {prettyTime(stay?.checkinAt)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700"
          >
            Đóng
          </button>
        </div>

        <div className="border-b border-slate-200 px-4 py-2">
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTab("service")}
              className={`rounded-lg px-3 py-1.5 ${
                tab === "service" ? "bg-white text-sky-700" : "text-slate-600"
              }`}
            >
              Phát sinh dịch vụ
            </button>
            <button
              type="button"
              onClick={() => setTab("checkout")}
              className={`rounded-lg px-3 py-1.5 ${
                tab === "checkout" ? "bg-white text-emerald-700" : "text-slate-600"
              }`}
            >
              Checkout
            </button>
          </div>
        </div>

        <div className="space-y-3 px-4 py-4">
          <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-4">
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              Tiền phòng: <strong>{fmt(stay?.tienPhong)}</strong>
            </div>
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              Đã thu checkin: <strong>{fmt(stay?.daThuCheckin)}</strong>
            </div>
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              Dịch vụ: <strong>{fmt(stay?.tienDichVu)}</strong>
            </div>
            <div className="rounded-lg bg-slate-50 px-2 py-2">
              Thu checkout: <strong>{fmt(stay?.canThuCheckout)}</strong>
            </div>
          </div>

          {tab === "service" && (
            <>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                <select
                  value={form.maSanPham}
                  onChange={(e) => {
                    const code = e.target.value;
                    const found = catalog.find(
                      (x) => String(x.maSanPham) === String(code),
                    );
                    setForm((p) => ({
                      ...p,
                      maSanPham: code,
                      donGia: Number(found?.donGiaBan || p.donGia || 0),
                    }));
                  }}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm md:col-span-2"
                >
                  {catalog.map((p) => (
                    <option key={p.maSanPham} value={p.maSanPham}>
                      {p.tenSanPham} ({p.nhomHang || "-"})
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min="1"
                  value={form.soLuong}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, soLuong: Math.max(1, Number(e.target.value || 1)) }))
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Số lượng"
                />
                <input
                  value={form.donGia}
                  onChange={(e) =>
                    setForm((p) => ({
                      ...p,
                      donGia: Number(String(e.target.value).replace(/[^\d]/g, "") || 0),
                    }))
                  }
                  className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Đơn giá"
                />
              </div>
              <input
                value={form.ghiChu}
                onChange={(e) => setForm((p) => ({ ...p, ghiChu: e.target.value }))}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                placeholder="Ghi chú phát sinh"
              />
              <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-3 py-2 text-sm text-slate-700">
                {selectedProduct?.tenSanPham || "Mặt hàng"}: <strong>{fmt(Number(form.soLuong || 0) * Number(form.donGia || 0))}</strong>
              </div>
              <button
                type="button"
                onClick={() =>
                  onAddService({
                    maLuuTru: stay?.maLuuTru,
                    maSanPham: form.maSanPham,
                    tenSanPham: selectedProduct?.tenSanPham || "",
                    soLuong: Number(form.soLuong || 1),
                    donGia: Number(form.donGia || 0),
                    ghiChu: form.ghiChu,
                  })
                }
                disabled={loading || !form.maSanPham}
                className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-700 disabled:opacity-60"
              >
                {loading ? "Đang thêm..." : "Thêm phát sinh"}
              </button>

              <div className="max-h-56 overflow-auto rounded-xl border border-slate-200 bg-white">
                {(stay?.serviceItems || []).length === 0 ? (
                  <div className="px-3 py-3 text-sm text-slate-500">Chưa có phát sinh.</div>
                ) : (
                  (stay?.serviceItems || []).map((item, idx) => (
                    <div
                      key={`${stay?.maLuuTru}-svc-${idx}`}
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
            </>
          )}

          {tab === "checkout" && (
            <div className="space-y-3">
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-3 text-sm text-slate-700">
                <p>
                  Thu checkout (chỉ dịch vụ): <strong>{fmt(stay?.canThuCheckout)}</strong>
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Checkout xong phòng sẽ chuyển sang trạng thái <strong>Đang dọn</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={() =>
                  onCheckout({
                    maLuuTru: stay?.maLuuTru,
                    checkoutAtThucTe: new Date().toISOString(),
                  })
                }
                disabled={loading}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-semibold text-emerald-700 disabled:opacity-60"
              >
                {loading ? "Đang checkout..." : "Xác nhận checkout"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function CreateOrderPage() {
  const [rooms, setRooms] = useState([]);
  const [stays, setStays] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [keyword, setKeyword] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [checkinRoom, setCheckinRoom] = useState(null);
  const [stayModal, setStayModal] = useState(null);

  const loadData = async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);
    try {
      const [roomRes, stayRes, productRes] = await Promise.all([
        getRooms(),
        getStayHistory({}),
        getProductCatalog(),
      ]);
      setRooms(Array.isArray(roomRes?.data) ? roomRes.data : []);
      setStays(Array.isArray(stayRes?.data) ? stayRes.data : []);
      setCatalog(
        Array.isArray(productRes?.data)
          ? productRes.data
              .map((item, idx) => ({
                ...item,
                maSanPham:
                  String(item?.maSanPham || "").trim() ||
                  `SP${String(idx + 1).padStart(4, "0")}`,
              }))
              .filter((x) => String(x.active ?? true) !== "false")
          : [],
      );
    } catch (e) {
      toast.error("Không tải được dữ liệu homestay.");
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
      if (
        keys.includes(CACHE_KEYS.rooms) ||
        keys.includes(CACHE_KEYS.stayHistory) ||
        keys.includes(CACHE_KEYS.productCatalog)
      ) {
        loadData({ silent: true });
      }
    };
    window.addEventListener(CACHE_INVALIDATED_EVENT, onInvalidated);
    return () => window.removeEventListener(CACHE_INVALIDATED_EVENT, onInvalidated);
  }, []);

  const activeStayByRoom = useMemo(() => {
    const map = new Map();
    stays.forEach((stay) => {
      if (String(stay.trangThaiLuuTru || "").toUpperCase() !== "IN_HOUSE") return;
      map.set(String(stay.maPhong || ""), stay);
    });
    return map;
  }, [stays]);

  const filteredRooms = useMemo(() => {
    const q = String(keyword || "").trim().toLowerCase();
    return rooms
      .filter((room) => {
        if (statusFilter !== "ALL" && room.trangThaiPhong !== statusFilter) return false;
        if (!q) return true;
        const source = [room.maPhong, room.tenPhong, room.loaiPhong]
          .join(" ")
          .toLowerCase();
        return source.includes(q);
      })
      .sort((a, b) => String(a.maPhong || "").localeCompare(String(b.maPhong || ""), "vi"));
  }, [rooms, keyword, statusFilter]);

  const grouped = useMemo(() => {
    const out = {
      [ROOM_STATUS.AVAILABLE]: [],
      [ROOM_STATUS.IN_HOUSE]: [],
      [ROOM_STATUS.CLEANING]: [],
      [ROOM_STATUS.BOOKED]: [],
      [ROOM_STATUS.MAINTENANCE]: [],
    };
    filteredRooms.forEach((room) => {
      const key = out[room.trangThaiPhong] ? room.trangThaiPhong : ROOM_STATUS.AVAILABLE;
      out[key].push(room);
    });
    return out;
  }, [filteredRooms]);

  const refreshAndClose = async () => {
    await loadData({ silent: true });
    setCheckinRoom(null);
    setStayModal(null);
  };

  const handleCheckIn = async (payload) => {
    setActionLoading(true);
    try {
      const res = await checkInRoom(payload);
      if (!res?.success) throw new Error(res?.message || "Checkin thất bại");
      toast.success(res.message || "Checkin thành công.");
      await refreshAndClose();
    } catch (e) {
      toast.error(e?.message || "Checkin thất bại.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateBooking = async (payload) => {
    setActionLoading(true);
    try {
      const res = await createBooking(payload);
      if (!res?.success) throw new Error(res?.message || "Đặt trước thất bại");
      toast.success(res.message || "Đặt trước thành công.");
      await refreshAndClose();
    } catch (e) {
      toast.error(e?.message || "Đặt trước thất bại.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleAddService = async (payload) => {
    setActionLoading(true);
    try {
      const res = await addStayServiceItem(payload);
      if (!res?.success) throw new Error(res?.message || "Thêm dịch vụ thất bại");
      toast.success(res.message || "Đã thêm phát sinh.");
      await loadData({ silent: true });
      const refreshed = (await getStayHistory({})).data || [];
      const stay = refreshed.find((x) => x.maLuuTru === payload.maLuuTru);
      if (stay && stayModal) {
        setStayModal((prev) => ({ ...prev, stay }));
      }
    } catch (e) {
      toast.error(e?.message || "Thêm dịch vụ thất bại.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckout = async (payload) => {
    setActionLoading(true);
    try {
      const res = await checkoutRoom(payload);
      if (!res?.success) throw new Error(res?.message || "Checkout thất bại");
      toast.success(res.message || "Checkout thành công.");
      await refreshAndClose();
    } catch (e) {
      toast.error(e?.message || "Checkout thất bại.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleStatusChange = async (room, nextStatus) => {
    if (room.trangThaiPhong === nextStatus) return;
    setActionLoading(true);
    try {
      const res = await updateRoomStatus({
        maPhong: room.maPhong,
        trangThaiPhong: nextStatus,
      });
      if (!res?.success) throw new Error(res?.message || "Cập nhật thất bại");
      toast.success("Đã cập nhật trạng thái phòng.");
      await loadData({ silent: true });
    } catch (e) {
      toast.error(e?.message || "Không cập nhật được trạng thái phòng.");
      await loadData({ silent: true });
    } finally {
      setActionLoading(false);
    }
  };

  const openStay = (room, stay) => {
    if (!stay) return;
    setStayModal({ room, stay });
  };

  return (
    <main className="min-h-screen bg-slate-100 px-3 py-4 md:px-5 md:py-5">
      <div className="mx-auto w-full max-w-7xl space-y-4">
        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-xl font-black text-slate-800">Quản lý phòng homestay</h1>
              <p className="text-sm text-slate-500">
                Checkin thu tiền phòng ngay, checkout chỉ thu phát sinh dịch vụ.
              </p>
            </div>
            <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
              Đang ở: {grouped[ROOM_STATUS.IN_HOUSE]?.length || 0} phòng
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-[1fr_auto]">
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="Tìm theo mã phòng / tên phòng / loại phòng"
              className="rounded-xl border border-slate-200 bg-slate-50/60 px-3 py-2.5 text-sm"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
            >
              <option value="ALL">Tất cả trạng thái</option>
              {STATUS_OPTIONS.map((status) => (
                <option key={`filter-${status}`} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
        </section>

        {loading ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-slate-500 shadow-sm">
            Đang tải danh sách phòng...
          </section>
        ) : (
          <section className="space-y-5">
            {STATUS_OPTIONS.map((status) => (
              <div key={`group-${status}`} className="space-y-2">
                <SectionTitle>
                  {status} ({grouped[status]?.length || 0})
                </SectionTitle>
                {grouped[status]?.length ? (
                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {grouped[status].map((room) => (
                      <RoomCard
                        key={room.maPhong}
                        room={room}
                        stay={activeStayByRoom.get(String(room.maPhong || ""))}
                        onQuickCheckIn={setCheckinRoom}
                        onOpenStay={openStay}
                        onStatusChange={handleStatusChange}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-white px-3 py-4 text-sm text-slate-500">
                    Không có phòng ở trạng thái này.
                  </div>
                )}
              </div>
            ))}
          </section>
        )}
      </div>

      {checkinRoom && (
        <CheckinModal
          room={checkinRoom}
          onClose={() => setCheckinRoom(null)}
          onSubmit={handleCheckIn}
          onCreateBooking={handleCreateBooking}
          loading={actionLoading}
        />
      )}

      {stayModal?.room && stayModal?.stay && (
        <StayModal
          room={stayModal.room}
          stay={stayModal.stay}
          catalog={catalog}
          onClose={() => setStayModal(null)}
          onAddService={handleAddService}
          onCheckout={handleCheckout}
          loading={actionLoading}
        />
      )}
    </main>
  );
}
