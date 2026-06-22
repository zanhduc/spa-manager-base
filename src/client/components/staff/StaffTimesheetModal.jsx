import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { CACHE_KEYS, getSpaAttendance, getSpaStaffSchedules, recordSpaAttendance } from "../../api";
import { readCache } from "../../api/localCache.js";
import { readCachedList } from "../../utils/cacheBootstrap.js";

const pad2 = (n) => String(n).padStart(2, "0");

const toDateInputValue = (date) =>
  `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;

const DAYS_OF_WEEK = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

// Map caDuKien thành label hiển thị
const SHIFT_LABELS = {
  SANG: "S",
  CHIEU: "C",
  TOI: "T",
};

// Map caDuKien thành số để sắp xếp
const SHIFT_ORDER = { SANG: 1, CHIEU: 2, TOI: 3 };

function getDayOfWeek(dateStr) {
  if (!dateStr) return "?";
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return DAYS_OF_WEEK[date.getDay()];
}

// Lấy ca hiển thị (S/C/T)
function getShiftLabel(caDuKien) {
  if (!caDuKien) return null;
  const normalized = String(caDuKien).toUpperCase().trim();
  if (normalized.includes("SANG")) return "S";
  if (normalized.includes("CHIEU")) return "C";
  if (normalized.includes("TOI")) return "T";
  return null;
}

// Kiểm tra xem có phải ca hoàn thành không
function isCompletedAttendance(att) {
  if (!att) return false;
  const status = att.trangThai || "";
  return (
    status === "Đang làm" ||
    status === "Đã ra ca" ||
    status === "Hoàn thành" ||
    status === "COMPLETED" ||
    status === "IN_PROGRESS"
  );
}

export function StaffTimesheetModal({ isOpen, onClose, staffs = [], stays = [] }) {
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const [tuNgay, setTuNgay] = useState(toDateInputValue(firstDayOfMonth));
  const [denNgay, setDenNgay] = useState(toDateInputValue(lastDayOfMonth));
  const [attendanceRows, setAttendanceRows] = useState([]);
  const [scheduleRows, setScheduleRows] = useState(() => readCachedList(CACHE_KEYS.staffSchedules));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const effectiveStaffs = staffs.length > 0 ? staffs : readCachedList(CACHE_KEYS.staffCatalog);

  // Load data when modal opens or date range changes
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    Promise.all([
      getSpaAttendance({ tuNgay, denNgay }),
      getSpaStaffSchedules({}),
    ])
      .then(([attRes, schedRes]) => {
        setAttendanceRows(Array.isArray(attRes?.data) ? attRes.data : []);
        setScheduleRows(Array.isArray(schedRes?.data) ? schedRes.data : []);
      })
      .catch(() => toast.error("Không tải được dữ liệu chấm công."))
      .finally(() => setLoading(false));
  }, [isOpen, tuNgay, denNgay]);

  // Generate date range
  const dateRange = useMemo(() => {
    const dates = [];
    const start = new Date(tuNgay);
    const end = new Date(denNgay);
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = toDateInputValue(d);
      dates.push(dateStr);
    }
    return dates;
  }, [tuNgay, denNgay]);

  // Map attendance by staff, date, and shift
  const attendanceByStaffDateShift = useMemo(() => {
    const map = {};
    attendanceRows.forEach((row) => {
      const staffCode = row.maNhanVien;
      const date = row.ngay;
      const shift = String(row.caDuKien || "").toUpperCase().trim();
      const key = `${staffCode}_${date}_${shift}`;
      map[key] = row;
    });
    return map;
  }, [attendanceRows]);

  // Tính ngày công cho mỗi nhân viên
  // Mỗi ca hoàn thành = 0.5 ngày công
  const calculateWorkingDays = (staffCode) => {
    let shiftCount = 0;
    dateRange.forEach((date) => {
      // Kiểm tra cả 3 ca
      ["SANG", "CHIEU", "TOI"].forEach((shift) => {
        const key = `${staffCode}_${date}_${shift}`;
        const att = attendanceByStaffDateShift[key];
        if (att && isCompletedAttendance(att)) {
          shiftCount += 1;
        }
      });
    });
    // Mỗi 2 ca = 1 ngày công
    return shiftCount / 2;
  };

  // Lấy các ca đã làm trong ngày
  const getShiftsForStaffDate = (staffCode, date) => {
    const shifts = [];
    ["SANG", "CHIEU", "TOI"].forEach((shift) => {
      const key = `${staffCode}_${date}_${shift}`;
      const att = attendanceByStaffDateShift[key];
      if (att && isCompletedAttendance(att)) {
        shifts.push(getShiftLabel(att.caDuKien) || shift.charAt(0));
      }
    });
    return shifts;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[90vh] w-full max-w-[95vw] rounded-2xl bg-white shadow-2xl flex flex-col relative">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4 rounded-t-2xl shrink-0">
          <div>
            <h2 className="text-xl font-black text-slate-800">Bảng công</h2>
            <p className="text-sm text-slate-500">1 ca = 0.5 ngày công • 2 ca (S+C hoặc C+T) = 1 ngày công</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Filter bar */}
        <div className="border-b border-slate-200 bg-slate-50 px-6 py-3 shrink-0">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-slate-600">Từ ngày:</label>
              <input
                type="date"
                value={tuNgay}
                onChange={(e) => setTuNgay(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-semibold text-slate-600">Đến ngày:</label>
              <input
                type="date"
                value={denNgay}
                onChange={(e) => setDenNgay(e.target.value)}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm"
              />
            </div>
            <button
              type="button"
              onClick={() => {
                setLoading(true);
                Promise.all([
                  getSpaAttendance({ tuNgay, denNgay, force: true }),
                  getSpaStaffSchedules({ force: true }),
                ])
                  .then(([attRes, schedRes]) => {
                    setAttendanceRows(Array.isArray(attRes?.data) ? attRes.data : []);
                    setScheduleRows(Array.isArray(schedRes?.data) ? schedRes.data : []);
                  })
                  .catch(() => toast.error("Không tải được dữ liệu chấm công."))
                  .finally(() => setLoading(false));
              }}
              disabled={loading}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {loading ? "Đang tải..." : "Tải lại"}
            </button>
            <span className="text-sm text-slate-500">({dateRange.length} ngày)</span>
            <span className="text-xs text-slate-400">
              {attendanceRows.length} bản ghi chấm công
            </span>
            <span className="text-xs text-slate-500">
              •{" "}
              <span className="font-bold text-emerald-700">S</span>=
              <span className="text-emerald-700">Sáng</span>,{" "}
              <span className="font-bold text-amber-700">C</span>=
              <span className="text-amber-700">Chiều</span>,{" "}
              <span className="font-bold text-purple-700">T</span>=
              <span className="text-purple-700">Tối</span>{" "}
              • 2 ca = 1 ngày công
            </span>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-auto p-4 flex-1 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <span className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-rose-600 border-r-transparent" />
              <span className="ml-3 text-slate-600">Đang tải dữ liệu chấm công...</span>
            </div>
          ) : effectiveStaffs.length === 0 ? (
            <div className="py-12 text-center text-slate-500">Chưa có danh sách nhân viên.</div>
          ) : (
            <table className="min-w-full border-separate border-spacing-0 text-xs">
              <thead className="sticky top-0 z-10 bg-slate-100">
                <tr>
                  <th className="border border-slate-200 bg-slate-100 px-3 py-2 text-left font-bold text-slate-700 whitespace-nowrap">
                    Nhân viên
                  </th>
                  <th className="border border-slate-200 bg-slate-100 px-2 py-2 text-center font-bold text-slate-700 whitespace-nowrap">
                    Ngày công
                  </th>
                  {dateRange.map((date) => (
                    <th
                      key={date}
                      className={`border border-slate-200 px-1 py-2 text-center font-bold min-w-[60px] ${
                        getDayOfWeek(date) === "CN"
                          ? "bg-rose-100 text-rose-700"
                          : "bg-slate-50 text-slate-600"
                      }`}
                    >
                      <div className="leading-none">{getDayOfWeek(date)}</div>
                      <div className="mt-0.5 text-[10px] font-normal">{date.slice(5)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {effectiveStaffs.map((staff) => {
                  const staffCode = String(staff.maNhanVien || "").trim();
                  const workingDays = calculateWorkingDays(staffCode);

                  return (
                    <tr key={staffCode} className="hover:bg-slate-50">
                      <td className="border border-slate-200 bg-white px-3 py-2 whitespace-nowrap">
                        <div className="font-semibold text-slate-800">{staff.tenNhanVien}</div>
                        <div className="text-[10px] text-slate-500">{staffCode}</div>
                      </td>
                      <td className="border border-slate-200 bg-white px-2 py-2 text-center">
                        <span className="font-bold text-emerald-700">{workingDays}</span>
                      </td>
                      {dateRange.map((date) => {
                        const isSunday = getDayOfWeek(date) === "CN";
                        const shifts = getShiftsForStaffDate(staffCode, date);
                        const hasShifts = shifts.length > 0;

                        return (
                          <td
                            key={date}
                            className={`border border-slate-200 px-1 py-1 text-center min-w-[60px] ${
                              isSunday
                                ? "bg-rose-50/50"
                                : hasShifts
                                  ? "bg-emerald-50/30"
                                  : "bg-white"
                            }`}
                          >
                            {hasShifts ? (
                              <div className="flex justify-center gap-0.5">
                                {shifts.map((shift, idx) => (
                                  <span
                                    key={idx}
                                    className={`inline-block w-5 rounded text-[10px] font-bold ${
                                      shift === "S"
                                        ? "bg-emerald-200 text-emerald-800"
                                        : shift === "C"
                                          ? "bg-amber-200 text-amber-800"
                                          : "bg-purple-200 text-purple-800"
                                    }`}
                                  >
                                    {shift}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
