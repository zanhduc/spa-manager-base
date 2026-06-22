import { useCallback, useEffect, useMemo, useState } from "react";
import { CustomDropdown } from "../CustomDropdown";
import { STAFF_ROLE_OPTIONS, getStaffRoleLabel, inferStaffRole } from "./staffConstants";
import { resolveStaffKpiDateRange, dateToNumber } from "./staffKpiHelpers";
import { CACHE_KEYS, getCtBanKpiData, getSpaStaff } from "../../api";
import { readCache } from "../../api/localCache.js";
import { readCachedList } from "../../utils/cacheBootstrap.js";

const pad2 = (n) => String(n).padStart(2, "0");

const toDateInputValue = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const startOfMonth = (base = new Date()) =>
  new Date(base.getFullYear(), base.getMonth(), 1);

const endOfMonth = (base = new Date()) =>
  new Date(base.getFullYear(), base.getMonth() + 1, 0);

const fmtMoney = (value) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    Math.max(Number(value || 0), 0),
  );

const fmtPercent = (value) => `${Number(value || 0).toFixed(1)}%`;

const rankTone = (hang) => {
  if (hang === 1) return "border-amber-200 bg-amber-50 text-amber-800";
  if (hang === 2) return "border-slate-300 bg-slate-100 text-slate-700";
  if (hang === 3) return "border-orange-200 bg-orange-50 text-orange-800";
  return "border-slate-200 bg-white text-slate-600";
};

const MOBILE_LAYOUT_MQ = "(max-width: 767px)";

function useMobileStaffLayout() {
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== "undefined" && window.matchMedia(MOBILE_LAYOUT_MQ).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(MOBILE_LAYOUT_MQ);
    const onChange = () => setIsMobile(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  return isMobile;
}

// ─── KPI Profile Metadata ─────────────────────────────────────────────────────

const KPI_PROFILE_META = {
  KTV: {
    subtitle:
      "Dữ liệu từ CT_BAN theo ngày thanh toán; hài lòng khách lấy từ điểm 1–5 khi kết thúc phiên.",
    summary: (rows) => {
      let doanhSo = 0;
      let phien = 0;
      let khach = 0;
      let quayLai = 0;
      let haiLongTong = 0;
      let haiLongPhieu = 0;
      let haiLongDat = 0;

      rows.forEach((row) => {
        doanhSo += row.doanhSoDichVu;
        phien += row.phienHoanThanh;
        khach += row.khachPhucVu;
        quayLai += row.khachQuayLai;
        haiLongTong += Number(row.diemHaiLongTrungBinh || 0) * Number(row.soPhieuHaiLong || 0);
        haiLongPhieu += Number(row.soPhieuHaiLong || 0);
        haiLongDat += Math.round(
          (Number(row.tyLeHaiLongKhach || 0) / 100) * Number(row.soPhieuHaiLong || 0),
        );
      });

      return [
        { label: "Doanh số dịch vụ", value: fmtMoney(doanhSo) },
        { label: "Phiên hoàn thành", value: phien },
        { label: "Khách phục vụ", value: khach },
        {
          label: "Điểm hài lòng TB",
          value: haiLongPhieu > 0 ? `${(haiLongTong / haiLongPhieu).toFixed(1)}/5` : "—",
        },
        {
          label: "Tỷ lệ hài lòng",
          value: fmtPercent(haiLongPhieu > 0 ? (haiLongDat / haiLongPhieu) * 100 : 0),
        },
        { label: "Khách quay lại", value: quayLai },
        { label: "Tỷ lệ quay lại", value: fmtPercent(khach > 0 ? (quayLai / khach) * 100 : 0) },
      ];
    },
    headerClass:
      "grid-cols-[56px_minmax(0,1fr)_120px_80px_90px_90px_80px_80px_90px]",
    rowClass:
      "grid-cols-[56px_minmax(0,1fr)_120px_80px_90px_90px_80px_80px_90px]",
    headers: [
      "Hạng",
      "Nhân viên",
      "Doanh số DV",
      "Phiên HT",
      "Khách",
      "Điểm HL TB",
      "Tỷ lệ HL",
      "Quay lại",
      "Tỷ lệ KH",
    ],
    renderRow: (row) => (
      <>
        <div className="text-right font-semibold text-slate-800">
          {fmtMoney(row.doanhSoDichVu)}
        </div>
        <div className="text-right text-slate-700">{row.phienHoanThanh}</div>
        <div className="text-right text-slate-700">{row.khachPhucVu}</div>
        <div className="text-right font-semibold text-amber-700">
          {row.soPhieuHaiLong > 0 ? `${row.diemHaiLongTrungBinh.toFixed(1)}/5` : "—"}
        </div>
        <div className="text-right font-semibold text-emerald-700">
          {row.soPhieuHaiLong > 0 ? fmtPercent(row.tyLeHaiLongKhach) : "—"}
        </div>
        <div className="text-right text-slate-700">{row.khachQuayLai}</div>
        <div className="text-right font-semibold text-rose-700">
          {fmtPercent(row.tyLeKhachQuayLai)}
        </div>
      </>
    ),
    mobileMetrics: (row) => [
      { label: "Doanh số DV", value: fmtMoney(row.doanhSoDichVu) },
      { label: "Phiên hoàn thành", value: row.phienHoanThanh },
      { label: "Khách phục vụ", value: row.khachPhucVu },
      {
        label: "Điểm HL TB",
        value: row.soPhieuHaiLong > 0 ? `${row.diemHaiLongTrungBinh.toFixed(1)}/5` : "—",
      },
      {
        label: "Tỷ lệ hài lòng",
        value: row.soPhieuHaiLong > 0 ? fmtPercent(row.tyLeHaiLongKhach) : "—",
      },
      { label: "Khách quay lại", value: row.khachQuayLai },
      { label: "Tỷ lệ quay lại", value: fmtPercent(row.tyLeKhachQuayLai) },
    ],
  },

  LE_TAN: {
    subtitle:
      "Đặt lịch / đến hẹn theo phiên BOOKED–CHECKED_OUT–NO_SHOW; khách quay lại tính trên phiên hoàn thành.",
    summary: (rows) => {
      let datLich = 0;
      let denHen = 0;
      let noShow = 0;
      let khach = 0;
      let quayLai = 0;

      rows.forEach((row) => {
        datLich += row.soDatLich;
        denHen += row.phienDenHen;
        noShow += row.phienNoShow;
        khach += row.khachPhucVu;
        quayLai += row.khachQuayLai;
      });

      return [
        { label: "Lượt đặt lịch", value: datLich },
        { label: "Đến hẹn", value: denHen },
        { label: "No-show", value: noShow },
        { label: "Khách phục vụ", value: khach },
        {
          label: "Tỷ lệ đến hẹn",
          value: fmtPercent(denHen + noShow > 0 ? (denHen / (denHen + noShow)) * 100 : 0),
        },
        { label: "Khách quay lại", value: quayLai },
        {
          label: "Tỷ lệ KH quay lại",
          value: fmtPercent(khach > 0 ? (quayLai / khach) * 100 : 0),
        },
      ];
    },
    headerClass:
      "grid-cols-[56px_minmax(0,1fr)_100px_80px_80px_80px_80px_110px]",
    rowClass:
      "grid-cols-[56px_minmax(0,1fr)_100px_80px_80px_80px_80px_110px]",
    headers: [
      "Hạng",
      "Nhân viên",
      "Đặt lịch",
      "Đến hẹn",
      "No-show",
      "Khách",
      "Quay lại",
      "Tỷ lệ KH",
    ],
    renderRow: (row) => (
      <>
        <div className="text-right text-slate-700">{row.soDatLich}</div>
        <div className="text-right text-slate-700">{row.phienDenHen}</div>
        <div className="text-right text-slate-700">{row.phienNoShow}</div>
        <div className="text-right text-slate-700">{row.khachPhucVu}</div>
        <div className="text-right text-slate-700">{row.khachQuayLai}</div>
        <div className="text-right font-semibold text-rose-700">
          {fmtPercent(row.tyLeKhachQuayLai)}
        </div>
      </>
    ),
    mobileMetrics: (row) => [
      { label: "Đặt lịch", value: row.soDatLich },
      { label: "Đến hẹn", value: row.phienDenHen },
      { label: "No-show", value: row.phienNoShow },
      { label: "Khách", value: row.khachPhucVu },
      { label: "Quay lại", value: row.khachQuayLai },
      { label: "Tỷ lệ KH", value: fmtPercent(row.tyLeKhachQuayLai) },
    ],
  },

  QUAN_LY: {
    subtitle: "Doanh thu spa và tỷ lệ giữ chân nhân sự (không tính nghỉ việc / tạm ngưng).",
    summary: (rows) => {
      const first = rows[0];
      if (!first) {
        return [
          { label: "Doanh thu spa", value: fmtMoney(0) },
          { label: "NS đang làm", value: 0 },
          { label: "NS tổng", value: 0 },
          { label: "Tỷ lệ giữ chân", value: fmtPercent(0) },
        ];
      }
      return [
        { label: "Doanh thu spa", value: fmtMoney(first.doanhThu) },
        { label: "NS đang làm", value: first.nsDangLam },
        { label: "NS tổng", value: first.nsTong },
        { label: "Tỷ lệ giữ chân", value: fmtPercent(first.tyLeGiuChanNs) },
      ];
    },
    headerClass: "grid-cols-[56px_minmax(0,1fr)_140px_90px_90px_110px]",
    rowClass: "grid-cols-[56px_minmax(0,1fr)_140px_90px_90px_110px]",
    headers: ["Hạng", "Nhân viên", "Doanh thu", "NS làm", "NS tổng", "Giữ chân"],
    renderRow: (row) => (
      <>
        <div className="text-right font-semibold text-slate-800">{fmtMoney(row.doanhThu)}</div>
        <div className="text-right text-slate-700">{row.nsDangLam}</div>
        <div className="text-right text-slate-700">{row.nsTong}</div>
        <div className="text-right font-semibold text-emerald-700">
          {fmtPercent(row.tyLeGiuChanNs)}
        </div>
      </>
    ),
    mobileMetrics: (row) => [
      { label: "Doanh thu", value: fmtMoney(row.doanhThu) },
      { label: "NS làm", value: row.nsDangLam },
      { label: "NS tổng", value: row.nsTong },
      { label: "Giữ chân", value: fmtPercent(row.tyLeGiuChanNs) },
    ],
  },
};

// ─── Build KPI Rows from CT_BAN ────────────────────────────────────────────────

const buildStayCustomerKey = (item = {}) => {
  const phone = String(item.soDienThoai || "").replace(/\D/g, "");
  if (phone.length >= 9) return `phone:${phone}`;
  const name = String(item.tenKhach || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
  if (name) return `name:${name}`;
  return "";
};

const isCompletedStatus = (status) => {
  return String(status || "").trim().toUpperCase() === "CHECKED_OUT";
};

export const buildKtvKpiRowsFromCtBan = (staffs = [], ctBanData = [], filters = {}) => {
  const { tuNgay, denNgay } = resolveStaffKpiDateRange(filters);
  const roleFilter = String(filters.chucVu || "KTV").trim().toUpperCase();

  const eligibleStaffs = staffs.filter((staff) => {
    if (roleFilter === "ALL") return true;
    return inferStaffRole(staff) === roleFilter;
  });

  const rowMap = new Map();
  eligibleStaffs.forEach((staff) => {
    const code = String(staff.maNhanVien || "").trim();
    if (!code) return;
    rowMap.set(code, {
      maNhanVien: code,
      tenNhanVien: String(staff.tenNhanVien || "").trim() || code,
      chucVu: inferStaffRole(staff),
      doanhSoDichVu: 0,
      phienHoanThanh: 0,
      haiLongTongDiem: 0,
      haiLongSoPhieu: 0,
      haiLongDat: 0,
      customerVisits: new Map(),
    });
  });

  const eligibleCodes = new Set(rowMap.keys());

  ctBanData.forEach((item) => {
    if (!isCompletedStatus(item.trangThaiPhien)) return;
    const code = String(item.maNhanVien || "").trim();
    if (!eligibleCodes.has(code)) return;
    const ngay = item.ngay;
    if (!ngay) return;
    // Hỗ trợ cả dd/MM/yyyy và yyyy-MM-dd → convert to YYYYMMDD number
    const ngayNum = dateToNumber(ngay);
    const fromNum = dateToNumber(tuNgay);
    const toNum = dateToNumber(denNgay);
    if (ngayNum < fromNum || ngayNum > toNum) return;

    const row = rowMap.get(code);
    
    // Tính doanh số: nếu là combo (tongBuoiCombo > 1) thì lấy doanhThu cuối, dịch vụ lẻ thì sum
    const isCombo = item.tongBuoiCombo > 1;
    const doanhSoItem = isCombo
      ? Number(item.doanhThu || 0)
      : Number(item.doanhThu || 0);
    
    row.doanhSoDichVu += doanhSoItem;
    row.phienHoanThanh += 1;
    
    const satisfactionScore = item.diemHaiLongKhach;
    if (satisfactionScore !== null && satisfactionScore !== undefined) {
      row.haiLongTongDiem += satisfactionScore;
      row.haiLongSoPhieu += 1;
      if (satisfactionScore >= 4) row.haiLongDat += 1;
    }
    
    const customerKey = buildStayCustomerKey(item);
    if (customerKey) {
      row.customerVisits.set(customerKey, (row.customerVisits.get(customerKey) || 0) + 1);
    }
  });

  const rows = [...rowMap.values()].map((row) => {
    const khachPhucVu = row.customerVisits.size;
    let khachQuayLai = 0;
    row.customerVisits.forEach((count) => {
      if (count >= 2) khachQuayLai += 1;
    });
    const tyLeKhachQuayLai = khachPhucVu > 0 ? (khachQuayLai / khachPhucVu) * 100 : 0;
    const diemHaiLongTrungBinh =
      row.haiLongSoPhieu > 0 ? row.haiLongTongDiem / row.haiLongSoPhieu : 0;
    const tyLeHaiLongKhach =
      row.haiLongSoPhieu > 0 ? (row.haiLongDat / row.haiLongSoPhieu) * 100 : 0;
    return {
      maNhanVien: row.maNhanVien,
      tenNhanVien: row.tenNhanVien,
      chucVu: row.chucVu,
      kpiProfile: "KTV",
      doanhSoDichVu: row.doanhSoDichVu,
      phienHoanThanh: row.phienHoanThanh,
      soPhieuHaiLong: row.haiLongSoPhieu,
      diemHaiLongTrungBinh,
      tyLeHaiLongKhach,
      khachPhucVu,
      khachQuayLai,
      tyLeKhachQuayLai,
      tuNgay,
      denNgay,
    };
  });

  // Sort by doanhSoDichVu desc
  rows.sort((a, b) => {
    if (b.doanhSoDichVu !== a.doanhSoDichVu) return b.doanhSoDichVu - a.doanhSoDichVu;
    if (b.phienHoanThanh !== a.phienHoanThanh) return b.phienHoanThanh - a.phienHoanThanh;
    return String(a.tenNhanVien).localeCompare(String(b.tenNhanVien), "vi");
  });
  return rows.map((row, index) => ({ ...row, hang: index + 1 }));
};

// ─── StaffKpiPanel Component ──────────────────────────────────────────────────

export function StaffKpiPanel({ staffs = [], stays = [] }) {
  const isMobileLayout = useMobileStaffLayout();

  const initialRange = resolveStaffKpiDateRange({});

  const [tuNgay, setTuNgay] = useState(initialRange.tuNgay);
  const [denNgay, setDenNgay] = useState(initialRange.denNgay);
  const [roleFilter, setRoleFilter] = useState("KTV");
  const [ctBanData, setCtBanData] = useState([]);
  const [loading, setLoading] = useState(true);

  const effectiveStaffs = staffs.length > 0 ? staffs : readCachedList(CACHE_KEYS.staffCatalog);

  // Load CT_BAN data
  const loadCtBanData = useCallback(async () => {
    setLoading(true);
    try {
      // Convert yyyy-MM-dd → dd/MM/yyyy để so sánh với data VN
      const tuNgayVn = tuNgay ? tuNgay.substring(8,10) + "/" + tuNgay.substring(5,7) + "/" + tuNgay.substring(0,4) : "";
      const denNgayVn = denNgay ? denNgay.substring(8,10) + "/" + denNgay.substring(5,7) + "/" + denNgay.substring(0,4) : "";
      console.log("[StaffKpi] Loading CT_BAN data:", { tuNgay, tuNgayVn, denNgay, denNgayVn });
      const res = await getCtBanKpiData({ tuNgay: tuNgayVn, denNgay: denNgayVn });
      console.log("[StaffKpi] getCtBanKpiData result:", res);
      if (res.success && Array.isArray(res.data)) {
        console.log("[StaffKpi] Set ctBanData:", res.data.length, "rows");
        setCtBanData(res.data);
      } else {
        console.log("[StaffKpi] No data or error:", res.message);
        setCtBanData([]);
      }
    } catch (e) {
      console.error("[StaffKpi] Error:", e);
      setCtBanData([]);
    }
    setLoading(false);
  }, [tuNgay, denNgay]);

  useEffect(() => {
    loadCtBanData();
  }, [loadCtBanData]);

  const rows = useMemo(() => {
    return buildKtvKpiRowsFromCtBan(effectiveStaffs, ctBanData, {
      tuNgay,
      denNgay,
      chucVu: roleFilter,
    });
  }, [ctBanData, denNgay, effectiveStaffs, roleFilter, tuNgay]);

  const profile =
    roleFilter === "LE_TAN" ? "LE_TAN" : roleFilter === "QUAN_LY" ? "QUAN_LY" : "KTV";
  const meta = KPI_PROFILE_META[profile];
  const summaryItems = useMemo(() => meta.summary(rows), [meta, rows]);

  // Nút preset: giống bên lương - dùng date range picker
  const applyPreset = (preset) => {
    const now = new Date();
    if (preset === "month") {
      setTuNgay(toDateInputValue(startOfMonth(now)));
      setDenNgay(toDateInputValue(endOfMonth(now)));
      return;
    }
    if (preset === "last30") {
      const end = toDateInputValue(now);
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 29);
      const start = toDateInputValue(startDate);
      setTuNgay(start);
      setDenNgay(end);
      return;
    }
    if (preset === "last7") {
      const end = toDateInputValue(now);
      const startDate = new Date(now);
      startDate.setDate(startDate.getDate() - 6);
      const start = toDateInputValue(startDate);
      setTuNgay(start);
      setDenNgay(end);
      return;
    }
  };

  return (
    <div className="space-y-4">
      {/* Header với filter */}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">Báo cáo KPI nhân viên</div>
          <div className="text-xs text-slate-500">{meta.subtitle}</div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Preset buttons giống bên lương */}
          <button
            type="button"
            onClick={() => applyPreset("last7")}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            7 ngày
          </button>
          <button
            type="button"
            onClick={() => applyPreset("month")}
            className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-sm font-semibold text-sky-700"
          >
            Tháng này
          </button>
          <button
            type="button"
            onClick={() => applyPreset("last30")}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            30 ngày
          </button>

          <input
            type="date"
            value={tuNgay}
            onChange={(e) => setTuNgay(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
          <span className="text-sm text-slate-400">→</span>
          <input
            type="date"
            value={denNgay}
            onChange={(e) => setDenNgay(e.target.value)}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />

          <CustomDropdown
            value={roleFilter}
            onChange={setRoleFilter}
            buttonClassName="py-1.5"
            options={[
              { value: "KTV", label: "Kỹ thuật viên" },
              { value: "LE_TAN", label: "Lễ tân" },
              { value: "QUAN_LY", label: "Quản lý" },
              { value: "ALL", label: "Tất cả vai trò (KTV)" },
              ...STAFF_ROLE_OPTIONS.filter(
                (item) => !["KTV", "LE_TAN", "QUAN_LY"].includes(item.value),
              ),
            ]}
          />
        </div>
      </div>

      {/* Summary cards */}
      <div className={`grid gap-2 ${summaryItems.length >= 6 ? "grid-cols-2 md:grid-cols-3 lg:grid-cols-6" : "grid-cols-2 md:grid-cols-4"}`}>
        {summaryItems.map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-center"
          >
            <div className="text-lg font-black text-slate-800">{item.value}</div>
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {item.label}
            </div>
          </div>
        ))}
      </div>

      {/* Loading state */}
      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white px-3 py-8 text-center text-sm text-slate-500">
          Đang tải dữ liệu KPI...
        </div>
      )}

      {/* Mobile layout */}
      {!loading && isMobileLayout ? (
        <div className="space-y-2">
          {rows.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-8 text-sm text-slate-500">
              Không có dữ liệu KPI trong khoảng thời gian đã chọn.
            </div>
          ) : (
            rows.map((row) => (
              <div
                key={`kpi-card-${row.maNhanVien}`}
                className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm"
              >
                <div className="flex items-start gap-3">
                  <span
                    className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-black ${rankTone(row.hang)}`}
                  >
                    {row.hang}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-800">{row.tenNhanVien}</div>
                    <div className="text-xs text-slate-500">
                      {row.maNhanVien} • {getStaffRoleLabel(row.chucVu)}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {meta.mobileMetrics(row).map((metric) => (
                    <div
                      key={`${row.maNhanVien}-${metric.label}`}
                      className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1.5"
                    >
                      <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        {metric.label}
                      </div>
                      <div className="font-semibold text-slate-800">{metric.value}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}

      {/* Desktop layout */}
      {!loading && !isMobileLayout && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div
            className={`grid gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold uppercase tracking-wide text-slate-500 ${meta.headerClass}`}
          >
            {meta.headers.map((label, index) => (
              <span key={label} className={index >= 2 ? "text-right" : undefined}>
                {label}
              </span>
            ))}
          </div>

          <div className="max-h-[68vh] overflow-y-auto">
            {rows.length === 0 ? (
              <div className="px-3 py-8 text-sm text-slate-500">
                Không có dữ liệu KPI trong khoảng thời gian đã chọn.
              </div>
            ) : (
              rows.map((row) => (
                <div
                  key={row.maNhanVien}
                  className={`grid items-center gap-2 border-b border-slate-100 px-3 py-3 text-sm ${meta.rowClass}`}
                >
                  <span
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full border text-xs font-black ${rankTone(row.hang)}`}
                  >
                    {row.hang}
                  </span>
                  <div>
                    <div className="font-semibold text-slate-800">{row.tenNhanVien}</div>
                    <div className="text-xs text-slate-500">
                      {row.maNhanVien} • {getStaffRoleLabel(row.chucVu)}
                    </div>
                  </div>
                  {meta.renderRow(row)}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
