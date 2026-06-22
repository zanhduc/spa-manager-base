import { normalizeAttendanceDateKey } from "./staffConstants";

export const PAYROLL_LOCK_STATUS = {
  LOCKED: "DA_CHOT",
};

export const normalizePayrollLockStatus = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw || raw.includes("CHOT") || raw.includes("LOCK")) return PAYROLL_LOCK_STATUS.LOCKED;
  return PAYROLL_LOCK_STATUS.LOCKED;
};

export const buildPayrollPeriodKey = (tuNgay = "", denNgay = "") => {
  const from = normalizeAttendanceDateKey(tuNgay);
  const to = normalizeAttendanceDateKey(denNgay);
  if (!from || !to) return "";
  return `${from}_${to}`;
};

export const suggestPayrollLockCode = (tuNgay = "", denNgay = "") => {
  const from = normalizeAttendanceDateKey(tuNgay);
  const to = normalizeAttendanceDateKey(denNgay);
  if (!from || !to) return "";
  return `KL${from.replace(/-/g, "")}${to.replace(/-/g, "")}`;
};

export const suggestNextPayrollRowCode = (records = [], maKyLuong = "") => {
  const prefix = String(maKyLuong || "").trim();
  let max = 0;
  records.forEach((record) => {
    if (prefix && String(record?.maKyLuong || "").trim() !== prefix) return;
    const match = String(record?.maBangLuong || "").match(/BL(\d+)/i);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return `BL${String(max + 1).padStart(6, "0")}`;
};

export const isPayrollPeriodLocked = (records = [], tuNgay = "", denNgay = "") => {
  const periodKey = buildPayrollPeriodKey(tuNgay, denNgay);
  if (!periodKey) return false;
  return records.some((row) => {
    const rowKey = buildPayrollPeriodKey(row?.tuNgay, row?.denNgay);
    return (
      rowKey === periodKey &&
      normalizePayrollLockStatus(row?.trangThai) === PAYROLL_LOCK_STATUS.LOCKED
    );
  });
};

export const filterPayrollLockRows = (records = [], tuNgay = "", denNgay = "") => {
  const periodKey = buildPayrollPeriodKey(tuNgay, denNgay);
  if (!periodKey) return [];
  return records
    .filter((row) => buildPayrollPeriodKey(row?.tuNgay, row?.denNgay) === periodKey)
    .sort((a, b) => String(a.tenNhanVien || "").localeCompare(String(b.tenNhanVien || ""), "vi"));
};

export const mapPayrollRowsToLockPayload = (payrollRows = [], tuNgay = "", denNgay = "") => {
  const maKyLuong = suggestPayrollLockCode(tuNgay, denNgay);
  return payrollRows.map((row, index) => ({
    maBangLuong: `BL${String(index + 1).padStart(6, "0")}`,
    maKyLuong,
    tuNgay: normalizeAttendanceDateKey(tuNgay),
    denNgay: normalizeAttendanceDateKey(denNgay),
    maNhanVien: String(row.maNhanVien || "").trim(),
    tenNhanVien: String(row.tenNhanVien || "").trim(),
    chucVu: String(row.chucVu || "").trim(),
    caHoanThanh: Math.max(Number(row.caHoanThanh || 0), 0),
    caKeHoach: Math.max(Number(row.caKeHoach || 0), 0),
    luongCoBan: Math.max(Number(row.luongCoBan || 0), 0),
    doanhSoDichVu: Math.max(Number(row.doanhSoDichVu || 0), 0),
    tyLeThuong: Math.max(Number(row.tyLeThuong || 0), 0),
    thuong: Math.max(Number(row.thuong || 0), 0),
    truViPham: Math.max(Number(row.truViPham || 0), 0),
    tongLuong: Math.max(Number(row.tongLuong || 0), 0),
    trangThai: PAYROLL_LOCK_STATUS.LOCKED,
    ghiChu: "",
  }));
};

export const validatePayrollLock = (payrollRows = [], tuNgay = "", denNgay = "", existingLocks = []) => {
  const from = normalizeAttendanceDateKey(tuNgay);
  const to = normalizeAttendanceDateKey(denNgay);
  if (!from || !to) return { ok: false, message: "Kỳ lương không hợp lệ." };
  if (from > to) return { ok: false, message: "Ngày bắt đầu kỳ phải trước ngày kết thúc." };
  if (!Array.isArray(payrollRows) || payrollRows.length === 0) {
    return { ok: false, message: "Không có dữ liệu lương để chốt." };
  }
  if (isPayrollPeriodLocked(existingLocks, from, to)) {
    return { ok: false, message: "Kỳ lương này đã được chốt." };
  }
  return { ok: true, tuNgay: from, denNgay: to, rows: mapPayrollRowsToLockPayload(payrollRows, from, to) };
};

const fmtMoney = (value) =>
  new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND" }).format(
    Math.max(Number(value || 0), 0),
  );

export const buildPayslipHtml = (row = {}, shopName = "TLC Spa & Dưỡng Sinh") => {
  const tuNgay = normalizeAttendanceDateKey(row?.tuNgay);
  const denNgay = normalizeAttendanceDateKey(row?.denNgay);
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <title>Phiếu lương ${row?.maNhanVien || ""}</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 24px; color: #1e293b; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .muted { color: #64748b; font-size: 13px; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    td { padding: 8px 0; border-bottom: 1px solid #e2e8f0; }
    td:last-child { text-align: right; font-weight: 600; }
    .total td { border-top: 2px solid #0f172a; font-size: 18px; font-weight: 800; }
  </style>
</head>
<body>
  <h1>${shopName}</h1>
  <div class="muted">Phiếu lương kỳ ${tuNgay} → ${denNgay}</div>
  <div style="margin-top:16px">
    <div><strong>${row?.tenNhanVien || ""}</strong> (${row?.maNhanVien || ""})</div>
    <div class="muted">Mã chốt: ${row?.maKyLuong || ""} • ${row?.maBangLuong || ""}</div>
  </div>
  <table>
    <tr><td>Ca hoàn thành / kế hoạch</td><td>${row?.caHoanThanh || 0} / ${row?.caKeHoach || 0}</td></tr>
    <tr><td>Lương cơ bản</td><td>${fmtMoney(row?.luongCoBan)}</td></tr>
    <tr><td>Doanh số dịch vụ</td><td>${fmtMoney(row?.doanhSoDichVu)}</td></tr>
    <tr><td>Thưởng (${row?.tyLeThuong || 0}%)</td><td>${fmtMoney(row?.thuong)}</td></tr>
    <tr><td>Trừ vi phạm</td><td>−${fmtMoney(row?.truViPham)}</td></tr>
    <tr class="total"><td>Tổng lương</td><td>${fmtMoney(row?.tongLuong)}</td></tr>
  </table>
  <p class="muted" style="margin-top:24px">In ngày ${new Date().toLocaleString("vi-VN")}</p>
</body>
</html>`;
};

export const openPayslipPrint = (row = {}) => {
  const html = buildPayslipHtml(row);
  const win = window.open("", "_blank", "noopener,noreferrer,width=720,height=900");
  if (!win) return false;
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  return true;
};
