import { useEffect, useMemo, useState } from "react";
import {
  CACHE_INVALIDATED_EVENT,
  CACHE_KEYS,
  getOrderHistory,
  getStayHistory,
} from "../api";
import toast from "react-hot-toast";
import { getPreviewDataByKey } from "../utils/printStrategy";
import { fireAndForgetPrintLog } from "../utils/printLogger";

const fmt = (n) => Number(n || 0).toLocaleString("vi-VN");
const toNum = (v) => Number(String(v ?? "").replace(/[^\d.-]/g, "")) || 0;

const formatDisplayDate = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "-";
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return `${raw.slice(8, 10)}/${raw.slice(5, 7)}/${raw.slice(0, 4)}`;
  }
  return raw;
};

const getPaperWidth = (size) => {
  if (size === "58") return "58mm";
  if (size === "pdf") return "210mm";
  return "80mm";
};

const getPaperMargin = (size) => {
  if (size === "pdf") return "6mm";
  if (size === "58") return "2mm";
  return "2.5mm";
};

export default function ReceiptPage({
  code,
  size,
  isPreview,
  previewDataStr,
  previewDataKey,
  autoPrint = false,
  autoBack = false,
  dryRun = false,
}) {
  const [loading, setLoading] = useState(true);
  const [order, setOrder] = useState(null);
  const [currentSize, setCurrentSize] = useState(size || "58");
  const [didAutoPrint, setDidAutoPrint] = useState(false);
  const mapStayToReceiptOrder = (stay) => {
    if (!stay) return null;
    const status = String(stay?.trangThaiLuuTru || "").toUpperCase();
    const statusText =
      status === "BOOKED"
        ? "Đã đặt trước"
        : status === "IN_HOUSE"
          ? "Đang ở"
          : status === "CHECKED_OUT"
            ? "Đã checkout"
            : status === "CANCELLED"
              ? "Đã hủy"
              : stay?.trangThaiLuuTru || "-";
    const serviceRows = Array.isArray(stay.serviceItems) ? stay.serviceItems : [];
    const roomUnit = stay.hinhThucTinhGia === "THEO_GIO" ? "Giờ" : "Đêm";
    const roomQty =
      stay.hinhThucTinhGia === "THEO_GIO"
        ? Number(stay.soGio || 0)
        : Number(stay.soDem || 0);
    const products = [
      {
        tenSanPham: `Tiền phòng ${stay.maPhong || ""}`.trim(),
        donVi: roomUnit,
        soLuong: Math.max(1, roomQty || 1),
        giaVon: 0,
        donGiaBan: Number(stay.donGiaPhongApDung || 0),
        thanhTien: Number(stay.tienPhong || 0),
      },
      ...serviceRows.map((item) => ({
        tenSanPham: item.tenSanPham,
        donVi: item.donVi || "",
        soLuong: Number(item.soLuong || 0),
        giaVon: 0,
        donGiaBan: Number(item.donGia || 0),
        thanhTien: Number(item.thanhTien || 0),
      })),
    ];
    return {
      maPhieu: stay.maLuuTru,
      ngayBan: stay.checkinAt || "",
      tenKhach: stay.tenKhach || "Khách ghé thăm",
      soDienThoai: stay.soDienThoai || "",
      ghiChu: stay.ghiChu || "-",
      trangThai: statusText,
      tongHoaDon: Number(stay.tongThanhToan || 0),
      tienNo: Math.max(Number(stay.canThuCheckout || 0), 0),
      products,
    };
  };

  const loadReceiptData = async (retryCount = 0) => {
    setLoading(true);

    if (isPreview) {
      const parsedPreview = tryParsePreviewData();
      if (
        parsedPreview &&
        String(parsedPreview.maPhieu || "").trim() === String(code || "").trim()
      ) {
        setOrder(parsedPreview);
        fireAndForgetPrintLog({
          event: "receipt_data_loaded_preview",
          code,
          size: size || "58",
          mode: "browser",
        });
        setLoading(false);
        return;
      }
    }

    try {
      const res = await getOrderHistory();
      if (res?.success && Array.isArray(res.data)) {
        const found = res.data.find(
          (o) => String(o.maPhieu || "").trim() === String(code || "").trim(),
        );
        if (found) {
          setOrder(found);
          fireAndForgetPrintLog({
            event: "receipt_data_loaded_history",
            code,
            size: size || "58",
            mode: "browser",
          });
          setLoading(false);
        } else {
          const stayRes = await getStayHistory({ keyword: String(code || "") });
          if (stayRes?.success && Array.isArray(stayRes.data)) {
            const foundStay = stayRes.data.find(
              (s) =>
                String(s.maLuuTru || "").trim() === String(code || "").trim(),
            );
            if (foundStay) {
              const mapped = mapStayToReceiptOrder(foundStay);
              setOrder(mapped);
              setLoading(false);
              return;
            }
          }
          if (retryCount < 3) {
            setTimeout(() => loadReceiptData(retryCount + 1), 2000);
            return;
          }
          setOrder(null);
          fireAndForgetPrintLog({
            event: "receipt_not_found_after_retry",
            code,
            size: size || "58",
            mode: "browser",
            status: "ERROR",
            message: "Không tìm thấy hóa đơn trong lịch sử sau khi retry",
          });
          setLoading(false);
          toast.error("Không tìm thấy hóa đơn cần in.");
        }
      } else {
        if (retryCount < 2) {
          setTimeout(() => loadReceiptData(retryCount + 1), 2000);
          return;
        }
        setOrder(null);
        fireAndForgetPrintLog({
          event: "receipt_load_failed_response",
          code,
          size: size || "58",
          mode: "browser",
          status: "ERROR",
          message: res?.message || "getOrderHistory response lỗi",
        });
        setLoading(false);
        toast.error(res?.message || "Không tải được hóa đơn.");
      }
    } catch (e) {
      if (retryCount < 2) {
        setTimeout(() => loadReceiptData(retryCount + 1), 2000);
        return;
      }
      setOrder(null);
      fireAndForgetPrintLog({
        event: "receipt_load_failed_exception",
        code,
        size: size || "58",
        mode: "browser",
        status: "ERROR",
        message: String(e?.message || e || "Lỗi tải hóa đơn"),
      });
      setLoading(false);
      toast.error("Không tải được hóa đơn.");
    }
  };

  const tryParsePreviewData = () => {
    const candidates = [
      String(previewDataStr || ""),
      getPreviewDataByKey(previewDataKey),
    ].filter(Boolean);
    for (const raw of candidates) {
      try {
        return JSON.parse(raw);
      } catch (e) {
        try {
          return JSON.parse(decodeURIComponent(raw));
        } catch (inner) {
          // try next candidate
        }
      }
    }
    return null;
  };

  useEffect(() => {
    if (code) loadReceiptData();
  }, [code, isPreview, previewDataStr, previewDataKey]);

  useEffect(() => {
    const onInvalidated = (event) => {
      const keys = event?.detail?.keys;
      if (!Array.isArray(keys)) return;
      if (!keys.includes(CACHE_KEYS.orderHistory)) return;
      if (!code) return;
      loadReceiptData();
    };
    window.addEventListener(CACHE_INVALIDATED_EVENT, onInvalidated);
    return () =>
      window.removeEventListener(CACHE_INVALIDATED_EVENT, onInvalidated);
  }, [code, isPreview, previewDataStr, previewDataKey]);

  const view = useMemo(() => {
    if (!order) return null;
    const totalFromItems = (order.products || []).reduce(
      (sum, p) => sum + toNum(p.soLuong) * toNum(p.donGiaBan),
      0,
    );
    const total = toNum(order.tongHoaDon) || totalFromItems;
    const tienNo = Math.max(toNum(order.tienNo), 0);
    const daTra = Math.max(total - tienNo, 0);
    return {
      total,
      tienNo,
      daTra,
      createdAt: formatDisplayDate(order.ngayBan),
      customerName: order.tenKhach || "Khách ghé thăm",
      phone: order.soDienThoai || "",
      note: order.ghiChu || "-",
      statusText: String(order.trangThai || "Đã thanh toán"),
    };
  }, [order]);

  const paperWidth = getPaperWidth(currentSize);
  const paperMargin = getPaperMargin(currentSize);
  const paperLabel =
    currentSize === "58" ? "58mm" : currentSize === "pdf" ? "PDF/A4" : "80mm";
  const isCompact = currentSize === "58";
  const isPdf = currentSize === "pdf";
  const isThermal = !isPdf;

  useEffect(() => {
    if (!autoPrint || dryRun || loading || !order || didAutoPrint) return;
    const timer = setTimeout(() => {
      setDidAutoPrint(true);
      fireAndForgetPrintLog({
        event: "receipt_autoprint_triggered",
        code,
        size: currentSize || "58",
        mode: "browser",
      });
      window.print();
      if (autoBack) {
        setTimeout(() => {
          if (window.history.length > 1) {
            window.history.back();
            return;
          }
          window.close();
        }, 180);
      }
    }, 180);
    return () => clearTimeout(timer);
  }, [autoPrint, dryRun, loading, order, didAutoPrint, autoBack]);

  useEffect(() => {
    if (!autoPrint || dryRun || !autoBack) return;
    const afterPrintHandler = () => {
      fireAndForgetPrintLog({
        event: "receipt_afterprint_autoback",
        code,
        size: currentSize || "58",
        mode: "browser",
      });
      setTimeout(() => {
        if (window.history.length > 1) {
          window.history.back();
          return;
        }
        window.close();
      }, 120);
    };
    window.addEventListener("afterprint", afterPrintHandler);
    return () => window.removeEventListener("afterprint", afterPrintHandler);
  }, [autoPrint, dryRun, autoBack]);

  const handleClose = () => {
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    window.close();
  };

  const handleManualPrint = () => {
    fireAndForgetPrintLog({
      event: "receipt_manual_print_click",
      code,
      size: currentSize || "58",
      mode: "browser",
    });
    window.print();
  };

  return (
    <main className="min-h-screen bg-slate-100 py-6">
      <style>{`
        @page { size: ${paperWidth} auto; margin: ${paperMargin}; }
        .thermal-receipt {
          font-family: "Courier New", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          line-height: 1.25;
          letter-spacing: 0;
          color: #111827;
        }
        .thermal-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
          align-items: flex-start;
        }
        .thermal-left {
          min-width: 0;
          flex: 1;
          overflow-wrap: anywhere;
        }
        .thermal-right {
          flex-shrink: 0;
          text-align: right;
          white-space: nowrap;
        }
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
          main { padding: 0 !important; background: white !important; }
          .thermal-shell {
            box-shadow: none !important;
            border-radius: 0 !important;
            border: none !important;
            padding: 0 !important;
          }
        }
      `}</style>

      <div className="no-print mx-auto mb-4 flex w-full max-w-[520px] items-center justify-between px-4">
        <div className="flex flex-col gap-1.5">
          <div className="text-sm font-bold text-slate-800">
            In phiếu: <span className="text-rose-600">{code || "-"}</span>
          </div>
          {dryRun && (
            <div className="text-[11px] font-semibold text-amber-700">
              Chế độ test khô: không gọi hộp thoại in
            </div>
          )}
          <select
            className="text-[11px] bg-white border border-slate-200 rounded-md px-2 py-1 outline-none focus:border-rose-400 font-semibold text-slate-600 cursor-pointer shadow-sm"
            value={currentSize}
            onChange={(e) => setCurrentSize(e.target.value)}
          >
            <option value="58">Máy in nhiệt 58mm</option>
            <option value="80">Máy in nhiệt 80mm</option>
            <option value="pdf">Lưu File PDF / A4</option>
          </select>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleManualPrint}
            className="rounded-xl bg-gradient-to-r from-rose-700 to-rose-500 px-4 py-2.5 text-[11px] font-bold text-white hover:shadow-lg hover:shadow-rose-700/30 transition-all"
          >
            In ngay
          </button>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[11px] font-bold text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
          >
            Đóng
          </button>
        </div>
      </div>

      <div className={`mx-auto w-full ${isThermal ? "px-0" : "px-4"}`} style={{ maxWidth: paperWidth }}>
        <div
          className={`thermal-shell bg-white ${isPdf ? "shadow-lg rounded-none p-8" : isCompact ? "rounded-none p-2" : "rounded-none p-2.5"}`}
        >
          {loading && (
            <p className="text-center text-sm text-slate-500">
              Đang tải hóa đơn...
            </p>
          )}
          {!loading && !order && (
            <p className="text-center text-sm text-slate-500">
              Không có dữ liệu hóa đơn.
            </p>
          )}
          {!loading && order && view && !isPdf && (
            <div className={`thermal-receipt space-y-2.5 ${isCompact ? "text-[11px]" : "text-[12px]"}`}>
              <div className="text-center">
                <div
                  className={`font-black tracking-wide ${isCompact ? "text-sm" : "text-base"}`}
                >
                  HÓA ĐƠN BÁN LẺ
                </div>
                <div
                  className={`text-slate-500 ${isCompact ? "text-[10px]" : "text-xs"}`}
                >
                  Mã phiếu: <strong>{order.maPhieu}</strong>
                </div>
                <div
                  className={`text-slate-500 ${isCompact ? "text-[10px]" : "text-xs"}`}
                >
                  Ngày bán: {view.createdAt}
                </div>
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
                <div className="thermal-row">
                  <span className="text-slate-500">Khách</span>
                  <strong className="thermal-right leading-tight">
                    {view.customerName}
                  </strong>
                </div>
                {view.phone && (
                  <div className="thermal-row">
                    <span className="text-slate-500">SĐT</span>
                    <strong className="thermal-right leading-tight">
                      {view.phone}
                    </strong>
                  </div>
                )}
                <div className="thermal-row">
                  <span className="text-slate-500">TT</span>
                  <strong className="thermal-right leading-tight">
                    {view.statusText}
                  </strong>
                </div>
                <div className="thermal-row">
                  <span className="text-slate-500">Ghi chú</span>
                  <strong className="thermal-right leading-tight">
                    {view.note}
                  </strong>
                </div>
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 space-y-2">
                {(order.products || []).map((p, idx) => (
                  <div key={`${order.maPhieu}-r-${idx}`}>
                    <div className={`thermal-left font-semibold ${isCompact ? "text-[11px]" : "text-[12px]"}`}>
                      {p.tenSanPham}{" "}
                      {p.donVi ? (
                        <span className="text-slate-400">({p.donVi})</span>
                      ) : null}
                    </div>
                    <div className={`thermal-row text-slate-600 ${isCompact ? "text-[10px]" : "text-[11px]"}`}>
                      <span className="thermal-left">
                        SL {fmt(p.soLuong)} x {fmt(p.donGiaBan)}
                      </span>
                      <span className="thermal-right font-semibold text-slate-900">
                        {fmt(toNum(p.soLuong) * toNum(p.donGiaBan))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 space-y-1">
                <div className={`thermal-row font-bold ${isCompact ? "text-[12px]" : "text-[13px]"}`}>
                  <span>Tổng cộng</span>
                  <span className="thermal-right">{fmt(view.total)}</span>
                </div>
                <div className="thermal-row">
                  <span>Phải trả</span>
                  <strong className="thermal-right">{fmt(view.daTra)}</strong>
                </div>
                {view.tienNo > 0 && (
                  <div className="thermal-row">
                    <span>Còn nợ</span>
                    <strong className="thermal-right">{fmt(view.tienNo)}</strong>
                  </div>
                )}
              </div>

              <div className="border-t border-dashed border-slate-300 pt-2 text-center text-[10.5px] text-slate-500">
                Hóa đơn được tạo bởi{" "}
                <span className="font-extrabold text-rose-600">DULIA</span>
              </div>
            </div>
          )}
          {!loading && order && view && isPdf && (
            <div className="text-slate-900">
              <div className="rounded-2xl border border-rose-200 bg-gradient-to-r from-rose-50 to-white p-5">
                <div className="flex items-start justify-between gap-6">
                  <div>
                    <div className="text-2xl font-black tracking-wide text-rose-700">
                      DULIA
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Hóa đơn bán lẻ chuyên nghiệp
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-semibold uppercase tracking-wide text-rose-500">
                      Mã phiếu
                    </div>
                    <div className="text-2xl font-black text-slate-900">
                      {order.maPhieu}
                    </div>
                    <div className="text-xs text-slate-500 mt-1">
                      Ngày bán: {view.createdAt}
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid grid-cols-2 gap-6 text-sm">
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                    Thông tin khách hàng
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-slate-500">Tên</span>
                      <strong>{view.customerName}</strong>
                    </div>
                    {view.phone && (
                      <div className="flex justify-between">
                        <span className="text-slate-500">SĐT</span>
                        <strong>{view.phone}</strong>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-slate-500">Trạng thái</span>
                      <strong>{view.statusText}</strong>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-rose-600">
                    Ghi chú đơn hàng
                  </div>
                  <div className="mt-2 text-sm text-slate-700 min-h-[72px]">
                    {view.note}
                  </div>
                </div>
              </div>

              <div className="mt-6 rounded-xl border border-slate-200 overflow-hidden">
                <table className="w-full text-sm">
                  <colgroup>
                    <col style={{ width: "40%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "10%" }} />
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "18%" }} />
                  </colgroup>
                  <thead className="bg-rose-100 text-rose-700">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide border-b border-rose-200">
                        Sản phẩm
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-wide border-b border-rose-200">
                        Đơn vị
                      </th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide border-b border-rose-200">
                        SL
                      </th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide border-b border-rose-200">
                        Đơn giá
                      </th>
                      <th className="px-4 py-2.5 text-right text-[11px] font-bold uppercase tracking-wide border-b border-rose-200">
                        Thành tiền
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {(order.products || []).map((p, idx) => (
                      <tr
                        key={`${order.maPhieu}-pdf-${idx}`}
                        className="border-t border-slate-100"
                      >
                        <td className="px-4 py-2.5 text-slate-800 font-semibold">
                          {p.tenSanPham}
                        </td>
                        <td className="px-4 py-2.5 text-slate-600">
                          {p.donVi || "-"}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-700">
                          {fmt(p.soLuong)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-slate-700">
                          {fmt(p.donGiaBan)}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-rose-700">
                          {fmt(toNum(p.soLuong) * toNum(p.donGiaBan))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="mt-6 flex justify-end">
                <div className="w-full max-w-sm rounded-xl border border-rose-200 bg-rose-50/50 p-4">
                  <div className="flex justify-between text-sm">
                    <span className="text-slate-500">Tổng cộng</span>
                    <strong className="text-rose-700">{fmt(view.total)}</strong>
                  </div>
                  <div className="flex justify-between text-sm mt-2">
                    <span className="text-slate-500">Đã trả</span>
                    <strong>{fmt(view.daTra)}</strong>
                  </div>
                  {view.tienNo > 0 && (
                    <div className="flex justify-between text-sm mt-2">
                      <span className="text-slate-500">Còn nợ</span>
                      <strong>{fmt(view.tienNo)}</strong>
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-8 flex items-center justify-between text-xs text-slate-400">
                <div>
                  Hóa đơn được tạo bởi{" "}
                  <span className="font-bold text-rose-600">DULIA</span>
                </div>
                <div>In từ hệ thống bán hàng</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
