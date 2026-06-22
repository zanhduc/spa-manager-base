import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useConfirm } from "../ConfirmDialog";
import {
  CACHE_KEYS,
  buildStaffAttendanceCacheKey,
  buildStaffPayrollCacheKey,
  buildStaffViolationsCacheKey,
  getSpaAttendance,
  getSpaPayrollRecords,
  getSpaStaffSchedules,
  getSpaStaffViolations,
  readCachedAttendanceRowsForRange,
} from "../../api";
import { readCache, setManualRefreshAt } from "../../api/localCache.js";
import { hasCachedResponse, readCachedList, shouldBlockPanelUI } from "../../utils/cacheBootstrap.js";
import { CustomDropdown } from "../CustomDropdown";
import { STAFF_ROLE_OPTIONS, getStaffRoleLabel } from "./staffConstants";
import { buildStaffPayrollRows } from "./staffPayrollHelpers";
import { resolveStaffKpiDateRange, dateToNumber } from "./staffKpiHelpers";
import {
  filterPayrollLockRows,
  isPayrollPeriodLocked,
  validatePayrollLock,
} from "./staffPayrollLockHelpers";

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

// Format tháng: "Tháng 01/2026"
const formatMonthLabel = (year, month) => {
  return `Tháng ${pad2(month)}/${year}`;
};

// Parse YYYY-MM-DD to year, month
const parseYearMonth = (dateStr) => {
  if (!dateStr) return { year: 0, month: 0 };
  const [y, m] = dateStr.split("-").map(Number);
  return { year: y, month: m };
};

const PAYROLL_RELATED_CACHE_KEYS = [
  CACHE_KEYS.staffPayroll,
  CACHE_KEYS.staffAttendance,
  CACHE_KEYS.staffViolations,
  CACHE_KEYS.staffSchedules,
];

const readCachedAttendanceRange = (tuNgay, denNgay) =>
  readCachedAttendanceRowsForRange(tuNgay, denNgay);

const readCachedViolationRange = (tuNgay, denNgay) => {
  const cached = readCache(buildStaffViolationsCacheKey({ tuNgay, denNgay }))?.response;
  return Array.isArray(cached?.data) ? cached.data : [];
};

const readCachedPayrollLocks = (tuNgay, denNgay) => {
  const cached = readCache(buildStaffPayrollCacheKey({ tuNgay, denNgay }))?.response;
  return Array.isArray(cached?.data) ? cached.data : [];
};

const hasPayrollBootstrap = (tuNgay, denNgay) =>
  hasCachedResponse(CACHE_KEYS.staffCatalog) ||
  hasCachedResponse(buildStaffAttendanceCacheKey({ tuNgay, denNgay })) ||
  hasCachedResponse(CACHE_KEYS.staffSchedules) ||
  hasCachedResponse(buildStaffViolationsCacheKey({ tuNgay, denNgay })) ||
  hasCachedResponse(buildStaffPayrollCacheKey({ tuNgay, denNgay }));

// Kiểm tra ca hoàn thành (hỗ trợ cả tiếng Anh và tiếng Việt)
const isCompletedAttendanceStatus = (status) => {
  if (!status) return false;
  return (
    status === "Đang làm" ||
    status === "Đã ra ca" ||
    status === "Hoàn thành" ||
    status === "COMPLETED" ||
    status === "IN_PROGRESS"
  );
};

// Tính số ngày công từ CHAM_CONG
// Mỗi ca hoàn thành = 0.5 ngày công
// 2 ca (S+C hoặc C+T) = 1 ngày công
const countWorkingDays = (attendanceRows, staffCode, tuNgay, denNgay) => {
  let completedShifts = 0;
  const fromNum = dateToNumber(tuNgay);
  const toNum = dateToNumber(denNgay);
  
  attendanceRows.forEach((row) => {
    if (row.maNhanVien === staffCode) {
      const ngayNum = dateToNumber(row.ngay);
      if (ngayNum >= fromNum && ngayNum <= toNum) {
        if (isCompletedAttendanceStatus(row.trangThai)) {
          completedShifts++;
        }
      }
    }
  });
  return completedShifts / 2;
};

export function StaffPayrollPanel({ staffs = [], staffsLoading = false, stays = [], onLockPeriod }) {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const initialRange = resolveStaffKpiDateRange({});
  const [tuNgay, setTuNgay] = useState(initialRange.tuNgay);
  const [denNgay, setDenNgay] = useState(initialRange.denNgay);
  const [selectedYearMonth, setSelectedYearMonth] = useState("current");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [attendanceRows, setAttendanceRows] = useState(() =>
    readCachedAttendanceRange(initialRange.tuNgay, initialRange.denNgay),
  );
  const [scheduleRows, setScheduleRows] = useState(() => readCachedList(CACHE_KEYS.staffSchedules));
  const [violationRows, setViolationRows] = useState(() =>
    readCachedViolationRange(initialRange.tuNgay, initialRange.denNgay),
  );
  const [lockRows, setLockRows] = useState(() =>
    readCachedPayrollLocks(initialRange.tuNgay, initialRange.denNgay),
  );
  const [loading, setLoading] = useState(
    () => !hasPayrollBootstrap(initialRange.tuNgay, initialRange.denNgay),
  );
  const [initialStaffsLoad, setInitialStaffsLoad] = useState(staffsLoading);

  // Lưu trữ danh sách các kỳ lương đã chốt (history)
  const [lockedPeriods, setLockedPeriods] = useState([]);

  // Editable overrides (keyed by maNhanVien)
  const [editedOverrides, setEditedOverrides] = useState({});

  // Sync when staffs prop updates from [] → real data
  useEffect(() => {
    setInitialStaffsLoad(false);
  }, [staffsLoading]);

  // Read staffs from cache if prop is empty
  const effectiveStaffs = staffs.length > 0 ? staffs : readCachedList(CACHE_KEYS.staffCatalog);

  // Load danh sách các kỳ lương đã chốt
  useEffect(() => {
    const loadLockedPeriods = async () => {
      try {
        const res = await getSpaPayrollRecords({});
        const rows = Array.isArray(res?.data) ? res.data : [];
        const periodsMap = {};
        rows.forEach((row) => {
          const key = `${row.tuNgay}_${row.denNgay}`;
          if (!periodsMap[key]) {
            const { year, month } = parseYearMonth(row.tuNgay);
            periodsMap[key] = {
              key,
              tuNgay: row.tuNgay,
              denNgay: row.denNgay,
              year,
              month,
              label: formatMonthLabel(year, month),
            };
          }
        });
        const periods = Object.values(periodsMap).sort((a, b) =>
          b.tuNgay.localeCompare(a.tuNgay)
        );
        setLockedPeriods(periods);
      } catch (_) {
        // Silently fail
      }
    };
    loadLockedPeriods();
  }, []);

  // Handle doanh số edit
  const handleDoanhSoChange = (maNhanVien, value) => {
    const numValue = Math.max(0, Number(value) || 0);
    setEditedOverrides((prev) => ({
      ...prev,
      [maNhanVien]: { ...prev[maNhanVien], doanhSoDichVu: numValue },
    }));
  };

  // Handle thưởng edit
  const handleThuongChange = (maNhanVien, value) => {
    const numValue = Math.max(0, Number(value) || 0);
    setEditedOverrides((prev) => ({
      ...prev,
      [maNhanVien]: { ...prev[maNhanVien], thuong: numValue },
    }));
  };

  // Handle vi phạm edit (thủ công)
  const handleViPhamChange = (maNhanVien, value) => {
    const numValue = Math.max(0, Number(value) || 0);
    setEditedOverrides((prev) => ({
      ...prev,
      [maNhanVien]: { ...prev[maNhanVien], truViPham: numValue },
    }));
  };

  // Apply edited overrides to computed rows
  const applyOverridesToRow = (row) => {
    const override = editedOverrides[row.maNhanVien];
    if (!override) return row;

    const newRow = { ...row };
    if (override.doanhSoDichVu !== undefined) {
      newRow.doanhSoDichVu = override.doanhSoDichVu;
      if (row.tyLeThuong > 0) {
        newRow.thuong = Math.round(newRow.doanhSoDichVu * row.tyLeThuong / 100);
      }
    }
    if (override.thuong !== undefined) {
      newRow.thuong = override.thuong;
    }
    if (override.truViPham !== undefined) {
      newRow.truViPham = override.truViPham;
    }
    newRow.tongLuong = Math.max(0, row.luongCoBan + newRow.thuong - newRow.truViPham);
    return newRow;
  };

  const loadPayrollData = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!silent && !hasPayrollBootstrap(tuNgay, denNgay)) setLoading(true);
    try {
      const [attendanceRes, scheduleRes, violationRes, payrollRes] = await Promise.all([
        getSpaAttendance({ tuNgay, denNgay, force }),
        getSpaStaffSchedules({ force }),
        getSpaStaffViolations({ tuNgay, denNgay, force }),
        getSpaPayrollRecords({ tuNgay, denNgay, force }),
      ]);
      setAttendanceRows(Array.isArray(attendanceRes?.data) ? attendanceRes.data : []);
      setScheduleRows(Array.isArray(scheduleRes?.data) ? scheduleRes.data : []);
      setViolationRows(Array.isArray(violationRes?.data) ? violationRes.data : []);
      setLockRows(Array.isArray(payrollRes?.data) ? payrollRes.data : []);
    } catch (_) {
      toast.error("Không tải được dữ liệu bảng lương.");
    } finally {
      setLoading(false);
    }
  }, [denNgay, tuNgay]);

  useEffect(() => {
    setAttendanceRows(readCachedAttendanceRange(tuNgay, denNgay));
    setScheduleRows(readCachedList(CACHE_KEYS.staffSchedules));
    setViolationRows(readCachedViolationRange(tuNgay, denNgay));
    setLockRows(readCachedPayrollLocks(tuNgay, denNgay));
    void loadPayrollData({ silent: hasPayrollBootstrap(tuNgay, denNgay) });
  }, [loadPayrollData, tuNgay, denNgay]);

  const periodLocked = useMemo(
    () => isPayrollPeriodLocked(lockRows, tuNgay, denNgay),
    [denNgay, lockRows, tuNgay],
  );

  const computedRows = useMemo(() => {
    const rows = buildStaffPayrollRows(effectiveStaffs, stays, attendanceRows, scheduleRows, violationRows, {
      tuNgay,
      denNgay,
      chucVu: roleFilter,
    });
    return rows.map(applyOverridesToRow);
  }, [attendanceRows, denNgay, effectiveStaffs, roleFilter, scheduleRows, stays, tuNgay, violationRows]);

  const lockedDisplayRows = useMemo(() => {
    const locked = filterPayrollLockRows(lockRows, tuNgay, denNgay);
    if (roleFilter === "ALL") return locked;
    return locked.filter((row) => String(row.chucVu || "").trim() === roleFilter);
  }, [denNgay, lockRows, roleFilter, tuNgay]);

  const rows = periodLocked ? lockedDisplayRows : computedRows;

  const summary = useMemo(() => {
    let luongCoBan = 0;
    let thuong = 0;
    let tong = 0;
    let missingSchedule = 0;
    rows.forEach((row) => {
      luongCoBan += row.luongCoBan;
      thuong += row.thuong;
      tong += row.tongLuong;
      if (row.missingSchedule) missingSchedule += 1;
    });
    return { luongCoBan, thuong, tong, missingSchedule, count: rows.length };
  }, [rows]);

  // Chọn tháng
  const handleSelectMonth = (yearMonth) => {
    if (yearMonth === "current") {
      const now = new Date();
      setTuNgay(toDateInputValue(startOfMonth(now)));
      setDenNgay(toDateInputValue(endOfMonth(now)));
      setSelectedYearMonth("current");
    } else {
      const [y, m] = yearMonth.split("-").map(Number);
      const start = new Date(y, m - 1, 1);
      const end = new Date(y, m, 0);
      setTuNgay(toDateInputValue(start));
      setDenNgay(toDateInputValue(end));
      setSelectedYearMonth(yearMonth);
    }
  };

  // Build month options
  const monthOptions = useMemo(() => {
    const options = [{ value: "current", label: "Tháng hiện tại" }];
    lockedPeriods.forEach((p) => {
      options.push({ value: `${p.year}-${pad2(p.month)}`, label: p.label });
    });
    return options;
  }, [lockedPeriods]);

  const rangeLabel = resolveStaffKpiDateRange({ tuNgay, denNgay });

  const lockPeriod = async () => {
    const validation = validatePayrollLock(computedRows, tuNgay, denNgay, lockRows);
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    const confirmed = await confirm({
      message: `Chốt lương kỳ ${validation.tuNgay} → ${validation.denNgay}?`,
      yesLabel: "Chốt lương",
      yesStyle: "primary",
    });
    if (!confirmed) return;
    const ok = await onLockPeriod?.({
      tuNgay: validation.tuNgay,
      denNgay: validation.denNgay,
      rows: validation.rows,
    });
    if (ok !== false) await loadPayrollData({ silent: true });
  };

  const blockPanel = shouldBlockPanelUI(
    loading || staffsLoading,
    computedRows.length > 0 || hasPayrollBootstrap(tuNgay, denNgay),
  );

  // Tính số ngày công cho mỗi nhân viên từ CHAM_CONG
  const getWorkingDays = (staffCode) => {
    return countWorkingDays(attendanceRows, staffCode, tuNgay, denNgay);
  };

  return (
    <div className="space-y-4">
      {confirmDialog}
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <div className="text-sm font-semibold text-slate-700">Bảng lương kỳ</div>
          <div className="text-xs text-slate-500">
            Tổng lương = Lương cơ bản + Thưởng dịch vụ − Trừ vi phạm (tối thiểu 0).
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <CustomDropdown
            value={selectedYearMonth}
            onChange={handleSelectMonth}
            options={monthOptions}
            buttonClassName="py-1.5 min-w-[160px]"
          />
          <input
            type="date"
            value={tuNgay}
            onChange={(e) => {
              setTuNgay(e.target.value);
              setSelectedYearMonth("");
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
          <span className="text-sm text-slate-400">→</span>
          <input
            type="date"
            value={denNgay}
            onChange={(e) => {
              setDenNgay(e.target.value);
              setSelectedYearMonth("");
            }}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
          />
          <CustomDropdown
            value={roleFilter}
            onChange={setRoleFilter}
            options={[
              { value: "ALL", label: "Tất cả vai trò" },
              ...STAFF_ROLE_OPTIONS,
            ]}
            buttonClassName="py-1.5"
          />
          <button
            type="button"
            onClick={() => loadPayrollData({ force: true })}
            disabled={loading}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Tải lại
          </button>
          {!periodLocked ? (
            <button
              type="button"
              disabled={loading || computedRows.length === 0}
              onClick={lockPeriod}
              className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-semibold text-rose-700 disabled:opacity-50"
            >
              Chốt kỳ lương
            </button>
          ) : (
            <span className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-700">
              Đã chốt kỳ
            </span>
          )}
        </div>
      </div>

      {periodLocked ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Kỳ {rangeLabel.tuNgay} → {rangeLabel.denNgay} đã chốt. Dữ liệu lấy từ sheet BANG_LUONG — không tự tính lại.
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {[
          { label: "Lương cơ bản", value: fmtMoney(summary.luongCoBan) },
          { label: "Thưởng dịch vụ", value: fmtMoney(summary.thuong) },
          { label: "Tổng lương", value: fmtMoney(summary.tong) },
          { label: "Nhân viên", value: summary.count },
        ].map((item) => (
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

      {summary.missingSchedule > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {summary.missingSchedule} nhân viên có chấm công nhưng chưa có lịch ca trong kỳ{" "}
          {rangeLabel.tuNgay} → {rangeLabel.denNgay}. Hệ thống tạm tính full lương cơ bản tháng.
        </div>
      ) : null}

      {blockPanel ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-500">
          Đang tải dữ liệu lương...
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
            <table className="min-w-[900px] w-full">
              <thead className="bg-slate-50">
                <tr className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  <th className="border-b border-slate-200 px-3 py-2 text-left whitespace-nowrap">Nhân viên</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-center whitespace-nowrap">Ngày công</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-right whitespace-nowrap">Lương cơ bản</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-right whitespace-nowrap">Thưởng Doanh số</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-center whitespace-nowrap">% thưởng</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-right whitespace-nowrap">Thưởng thêm</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-right whitespace-nowrap">Trừ vi phạm</th>
                  <th className="border-b border-slate-200 px-2 py-2 text-right whitespace-nowrap">Tổng</th>
                </tr>
              </thead>
              <tbody className="max-h-[68vh] overflow-y-auto">
                {effectiveStaffs.length === 0 && !staffsLoading ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">
                      Chưa có danh sách nhân viên. Vui lòng chờ dữ liệu tải xong hoặc kiểm tra sheet NHAN_VIEN.
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-500">
                      Không có nhân viên phù hợp trong kỳ đã chọn.
                    </td>
                  </tr>
                ) : (
                  rows.map((row) => {
                    const workingDays = getWorkingDays(row.maNhanVien);
                    return (
                      <tr key={row.maBangLuong || row.maNhanVien} className="border-b border-slate-100 hover:bg-slate-50">
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-800">{row.tenNhanVien}</div>
                          <div className="text-xs text-slate-500">
                            {row.maNhanVien} • {getStaffRoleLabel(row.chucVu)}
                            {row.luongCoBanThang > 0
                              ? ` • CB ${fmtMoney(row.luongCoBanThang)}`
                              : " • Chưa cấu hình lương"}
                          </div>
                        </td>
                        {/* Ngày công - đếm số ca từ CHAM_CONG, mỗi ca = 0.5 ngày công */}
                        <td className="px-2 py-3 text-center whitespace-nowrap">
                          <span className={`font-bold ${workingDays > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                            {workingDays % 1 === 0 ? workingDays : workingDays.toFixed(1)}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-right font-semibold text-slate-800 whitespace-nowrap">
                          {fmtMoney(row.luongCoBan)}
                        </td>
                        {/* Doanh số - editable input căn phải */}
                        <td className="px-2 py-3 whitespace-nowrap">
                          <input
                            type="number"
                            min="0"
                            value={editedOverrides[row.maNhanVien]?.doanhSoDichVu ?? row.doanhSoDichVu}
                            onChange={(e) => handleDoanhSoChange(row.maNhanVien, e.target.value)}
                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-right text-sm text-slate-700 focus:border-sky-400 focus:outline-none"
                            disabled={periodLocked}
                          />
                        </td>
                        <td className="px-2 py-3 text-center text-slate-600 whitespace-nowrap">{row.tyLeThuong}%</td>
                        {/* Thưởng - editable input căn phải */}
                        <td className="px-2 py-3 whitespace-nowrap">
                          <input
                            type="number"
                            min="0"
                            value={editedOverrides[row.maNhanVien]?.thuong ?? row.thuong}
                            onChange={(e) => handleThuongChange(row.maNhanVien, e.target.value)}
                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-right text-sm text-emerald-700 focus:border-sky-400 focus:outline-none"
                            disabled={periodLocked}
                          />
                        </td>
                        {/* Trừ vi phạm - editable input căn phải */}
                        <td className="px-2 py-3 whitespace-nowrap">
                          <input
                            type="number"
                            min="0"
                            value={editedOverrides[row.maNhanVien]?.truViPham ?? row.truViPham}
                            onChange={(e) => handleViPhamChange(row.maNhanVien, e.target.value)}
                            className="w-full rounded border border-slate-200 bg-white px-2 py-1 text-right text-sm text-rose-700 focus:border-sky-400 focus:outline-none"
                            disabled={periodLocked}
                          />
                        </td>
                        <td className="px-2 py-3 text-right font-black text-rose-700 whitespace-nowrap">
                          {fmtMoney(row.tongLuong)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Mobile view */}
          <div className="space-y-2 md:hidden">
            {effectiveStaffs.length === 0 && !staffsLoading ? (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-8 text-sm text-slate-500">
                Chưa có danh sách nhân viên.
              </div>
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-8 text-sm text-slate-500">
                Không có nhân viên phù hợp.
              </div>
            ) : (
              rows.map((row) => {
                const workingDays = getWorkingDays(row.maNhanVien);
                return (
                  <div
                    key={`payroll-card-${row.maBangLuong || row.maNhanVien}`}
                    className="rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-slate-800">{row.tenNhanVien}</div>
                        <div className="text-center">
                        <div className={`text-lg font-bold ${workingDays > 0 ? "text-emerald-600" : "text-slate-400"}`}>
                          {workingDays % 1 === 0 ? workingDays : workingDays.toFixed(1)}
                        </div>
                        <div className="text-[10px] text-slate-500">ngày công</div>
                      </div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {row.maNhanVien} • {getStaffRoleLabel(row.chucVu)}
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                      <div>Lương CB: {fmtMoney(row.luongCoBan)}</div>
                      <div>Doanh số: {fmtMoney(row.doanhSoDichVu)}</div>
                      <div>Thưởng ({row.tyLeThuong}%): {fmtMoney(row.thuong)}</div>
                      <div>Trừ VP: {fmtMoney(row.truViPham)}</div>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                      <span className="text-xs font-semibold text-slate-500">Tổng lương</span>
                      <span className="font-black text-rose-700">{fmtMoney(row.tongLuong)}</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}
