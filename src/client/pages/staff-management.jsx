import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import { readCache } from "../api/localCache.js";
import { CACHE_KEYS } from "../api";
import { useCacheSync } from "../hooks/useCacheSync.js";
import {
  clearReadCacheByKeys,
  createSpaStaff,
  deleteSpaStaff,
  getSpaStaff,
  getSpaStaffLeaveRequests,
  getTreatmentHistory,
  cancelSpaStaffViolation,
  lockSpaPayrollPeriod,
  recordSpaAttendance,
  reviewSpaStaffLeaveRequest,
  saveSpaShiftChecklist,
  saveSpaStaffLeaveRequest,
  saveSpaStaffTraining,
  saveSpaStaffViolation,
  updateSpaStaff,
  updateSpaStaffSchedules,
} from "../api";
import { useCachedQuery } from "../hooks/useCachedQuery.js";
import { runOptimisticMutation } from "../utils/optimisticMutation.js";
import { StaffManagementNav } from "../components/staff/StaffManagementNav";
import { StaffAttendancePanel } from "../components/staff/StaffAttendancePanel";
import { StaffTimesheetModal } from "../components/staff/StaffTimesheetModal.jsx";
import { StaffCatalogPanel } from "../components/staff/StaffCatalogPanel";
import { StaffChecklistPanel } from "../components/staff/StaffChecklistPanel";
import { StaffKpiPanel } from "../components/staff/StaffKpiPanel";
import { StaffLeavePanel } from "../components/staff/StaffLeavePanel";
import { StaffPayrollPanel } from "../components/staff/StaffPayrollPanel";
import { StaffSchedulePanel } from "../components/staff/StaffSchedulePanel";
import { StaffTrainingPanel } from "../components/staff/StaffTrainingPanel";
import { StaffViolationPanel } from "../components/staff/StaffViolationPanel";
import {
  buildStaffLeaveStatusUpdate,
  buildStaffLeaveStatusUpdates,
} from "../components/staff/staffLeaveHelpers";
import {
  TRAINING_STATUS,
  normalizeTrainingStatus,
  resolveStaffStatusAfterTrainingComplete,
} from "../components/staff/staffTrainingHelpers";
import {
  STAFF_ROLE_OPTIONS,
  STAFF_STATUS_OPTIONS,
} from "../components/staff/staffConstants";
import { hasCachedResponse, readCachedList, shouldBlockPanelUI } from "../utils/cacheBootstrap.js";

import { CustomDropdown } from "../components/CustomDropdown";

const ROLE_FILTER_OPTIONS = [{ value: "ALL", label: "Tất cả vai trò" }, ...STAFF_ROLE_OPTIONS];

const STATUS_FILTER_OPTIONS = [
  { value: "ALL", label: "Tất cả trạng thái" },
  ...STAFF_STATUS_OPTIONS.map((status) => ({ value: status, label: status })),
];

const pad2 = (n) => String(n).padStart(2, "0");
const todayDateKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

function StaffFilterBar({ keyword, onKeywordChange, roleFilter, onRoleFilterChange, statusFilter, onStatusFilterChange }) {
  return (
    <div className="grid grid-cols-1 gap-2 rounded-2xl border border-slate-200 bg-white p-4 md:grid-cols-[1fr_180px_180px]">
      <input
        value={keyword}
        onChange={(e) => onKeywordChange(e.target.value)}
        placeholder="Tìm theo tên, mã, SĐT..."
        className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
      />
      <CustomDropdown value={roleFilter} onChange={onRoleFilterChange} options={ROLE_FILTER_OPTIONS} />
      <CustomDropdown value={statusFilter} onChange={onStatusFilterChange} options={STATUS_FILTER_OPTIONS} />
    </div>
  );
}

export default function StaffManagementPage() {
  const [activeTab, setActiveTab] = useState("catalog");
  const {
    data: staffs = [],
    setData: setStaffs,
    isLoading: staffsLoading,
  } = useCachedQuery(getSpaStaff, CACHE_KEYS.staffCatalog, {
    select: (res) => (Array.isArray(res?.data) ? res.data : []),
  });
  const [stays, setStays] = useState(() => readCachedList(CACHE_KEYS.stayHistory));
  const [staysLoading, setStaysLoading] = useState(() => !hasCachedResponse(CACHE_KEYS.stayHistory));
  const [refreshing, setRefreshing] = useState(false);
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [keyword, setKeyword] = useState("");
  const [showTimesheetModal, setShowTimesheetModal] = useState(false);

  const syncStaffLeaveStatuses = useCallback(async (staffList = []) => {
    const today = todayDateKey();
    const monthStart = `${today.slice(0, 8)}01`;
    try {
      const leaveRes = await getSpaStaffLeaveRequests({ tuNgay: monthStart, denNgay: today });
      const leaveRows = Array.isArray(leaveRes?.data) ? leaveRes.data : [];
      const updates = buildStaffLeaveStatusUpdates(staffList, leaveRows, today);
      for (const payload of updates) {
        await updateSpaStaff(payload);
      }
      if (updates.length > 0) {
        setStaffs((prev) => {
          const patchMap = new Map(
            updates.map((row) => [String(row.maNhanVien || "").trim(), row]),
          );
          return prev.map((staff) => {
            const code = String(staff.maNhanVien || "").trim();
            return patchMap.has(code) ? { ...staff, ...patchMap.get(code) } : staff;
          });
        });
      }
      return updates.length > 0;
    } catch (_) {
      return false;
    }
  }, []);

  const loading = shouldBlockPanelUI(
    staffsLoading || staysLoading,
    staffs.length > 0 || stays.length > 0,
  );

  const loadStays = useCallback(async ({ silent = false, force = false } = {}) => {
    if (!silent && !hasCachedResponse(CACHE_KEYS.stayHistory)) setStaysLoading(true);
    try {
      const stayRes = await getTreatmentHistory({ force });
      setStays(Array.isArray(stayRes?.data) ? stayRes.data : []);
    } catch (_) {
      toast.error("Không tải được dữ liệu phiên trị liệu.");
    } finally {
      if (!silent) setStaysLoading(false);
    }
  }, []);

  const loadData = useCallback(async ({ silent = false, force = false } = {}) => {
    await loadStays({ silent, force });
  }, [loadStays]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadData({ silent: true, force: true });
    } finally {
      setRefreshing(false);
    }
  }, [loadData]);

  useEffect(() => {
    void loadStays({ silent: hasCachedResponse(CACHE_KEYS.stayHistory) });
  }, [loadStays]);

  const navigateToTab = useCallback((tabId) => {
    setActiveTab(tabId);
    const nextHash =
      tabId === "catalog" ? "#staff-management" : `#staff-management?tab=${tabId}`;
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash;
    }
  }, []);

  useEffect(() => {
    const syncTabFromHash = () => {
      const raw = String(window.location.hash || "").replace(/^#\/?/, "");
      const query = raw.includes("?") ? raw.split("?")[1] : "";
      const tab = new URLSearchParams(query).get("tab");
      if (
        tab === "schedule" ||
        tab === "catalog" ||
        tab === "attendance" ||
        tab === "kpi" ||
        tab === "checklist" ||
        tab === "payroll" ||
        tab === "violations" ||
        tab === "leave" ||
        tab === "training"
      ) {
        setActiveTab(tab);
      }
    };
    syncTabFromHash();
    window.addEventListener("hashchange", syncTabFromHash);
    return () => window.removeEventListener("hashchange", syncTabFromHash);
  }, []);

  /**
   * ⚠️ REMOVED: onCacheInvalidated gọi API
   * Lý do: Gây stack overflow khi event được dispatch liên tục
   * 
   * useCachedQuery đã tự động sync data khi cache updated
   */
  useCacheSync({
    cacheKeys: [CACHE_KEYS.stayHistory],
    onCacheUpdated: (detail, cacheKey) => {
      if (cacheKey !== CACHE_KEYS.stayHistory) return;
      const data = detail?.response?.data;
      if (Array.isArray(data)) setStays(data);
    },
    // ⚠️ KHÔNG có onCacheInvalidated gọi API
  });

  const runStaffAction = async (apiCall, optimisticUpdater, rollbackUpdater) => {
    const { ok } = await runOptimisticMutation({
      optimisticUpdater,
      apiCall,
      rollback: rollbackUpdater,
      errorMessage: "Thao tác thất bại.",
    });
    return ok;
  };

  const handleCreateStaff = (payload) => {
    const staffCode = String(payload?.maNhanVien || "").trim();
    if (staffs.some((staff) => String(staff.maNhanVien || "").trim() === staffCode)) {
      toast.error(`Mã nhân viên ${staffCode} đã tồn tại.`);
      return Promise.resolve(false);
    }
    return runStaffAction(
      () => createSpaStaff(payload),
      () => setStaffs((prev) => [...prev, payload]),
      () => setStaffs((prev) => prev.filter((s) => String(s.maNhanVien) !== staffCode))
    );
  };

  const handleUpdateStaff = (payload) => {
    const targetCode = String(payload.maNhanVien || "");
    const prevStaff = staffs.find((s) => String(s.maNhanVien) === targetCode);
    return runStaffAction(
      () => updateSpaStaff(payload),
      () =>
        setStaffs((prev) =>
          prev.map((staff) =>
            String(staff.maNhanVien || "") === targetCode
              ? { ...staff, ...payload }
              : staff,
          ),
        ),
      () => {
        if (prevStaff) {
          setStaffs((prev) =>
            prev.map((staff) =>
              String(staff.maNhanVien || "") === targetCode ? prevStaff : staff,
            ),
          );
        }
      }
    );
  };

  const handleDeleteStaff = (payload) => {
    const targetCode = String(payload.maNhanVien || "");
    const prevStaff = staffs.find((s) => String(s.maNhanVien) === targetCode);
    return runStaffAction(
      () => deleteSpaStaff(payload),
      () =>
        setStaffs((prev) =>
          prev.map((staff) =>
            String(staff.maNhanVien || "") === targetCode
              ? { ...staff, trangThai: "Nghỉ việc" }
              : staff,
          ),
        ),
      () => {
        if (prevStaff) {
          setStaffs((prev) =>
            prev.map((staff) =>
              String(staff.maNhanVien || "") === targetCode
                ? { ...staff, trangThai: prevStaff.trangThai }
                : staff,
            ),
          );
        }
      },
    );
  };

  const handleSaveChecklist = async (payload) => {
    try {
      const result = await saveSpaShiftChecklist(payload);
      if (result?.success === false) {
        toast.error(result?.message || "Không lưu được checklist.");
        return false;
      }
      return true;
    } catch (_) {
      toast.error("Không lưu được checklist.");
      return false;
    }
  };

  const handleRecordAttendance = async (payload) => {
    try {
      const result = await recordSpaAttendance(payload);
      if (result?.success === false) {
        toast.error(result?.message || "Không lưu được chấm công.");
        return false;
      }
      return true;
    } catch (_) {
      toast.error("Không lưu được chấm công.");
      return false;
    }
  };

  const handleSaveViolation = async (payload) => {
    try {
      const result = await saveSpaStaffViolation(payload);
      if (result?.success === false) {
        toast.error(result?.message || "Không lưu được biên bản vi phạm.");
        return false;
      }
      return true;
    } catch (_) {
      toast.error("Không lưu được biên bản vi phạm.");
      return false;
    }
  };

  const handleSaveLeave = async (payload) => {
    try {
      const result = await saveSpaStaffLeaveRequest(payload);
      if (result?.success === false) {
        toast.error(result?.message || "Không lưu được đơn nghỉ phép.");
        return false;
      }
      return true;
    } catch (_) {
      toast.error("Không lưu được đơn nghỉ phép.");
      return false;
    }
  };

  const syncSingleStaffLeaveStatus = async (staffCode, leaveRows = null) => {
    const code = String(staffCode || "").trim();
    if (!code) return;
    const today = todayDateKey();
    const monthStart = `${today.slice(0, 8)}01`;
    let rows = leaveRows;
    if (!Array.isArray(rows)) {
      const leaveRes = await getSpaStaffLeaveRequests({ tuNgay: monthStart, denNgay: today });
      rows = Array.isArray(leaveRes?.data) ? leaveRes.data : [];
    }
    const staff = staffs.find((item) => String(item.maNhanVien || "").trim() === code);
    if (!staff) return;
    const update = buildStaffLeaveStatusUpdate(staff, rows, today);
    if (!update) return;
    const result = await updateSpaStaff(update);
    if (result?.success !== false) {
      setStaffs((prev) =>
        prev.map((item) =>
          String(item.maNhanVien || "").trim() === code
            ? { ...item, trangThai: update.trangThai }
            : item,
        ),
      );
    }
  };

  const handleReviewLeave = async (payload) => {
    try {
      const result = await reviewSpaStaffLeaveRequest({
        maDon: payload.maDon,
        trangThai: payload.trangThai,
      });
      if (result?.success === false) {
        toast.error(result?.message || "Không cập nhật được đơn nghỉ phép.");
        return false;
      }
      await syncSingleStaffLeaveStatus(payload.record?.maNhanVien);
      return true;
    } catch (_) {
      toast.error("Không cập nhật được đơn nghỉ phép.");
      return false;
    }
  };

  const handleSaveTraining = async (payload) => {
    try {
      const result = await saveSpaStaffTraining(payload);
      if (result?.success === false) {
        toast.error(result?.message || "Không lưu được lịch đào tạo.");
        return false;
      }
      if (normalizeTrainingStatus(payload?.trangThai) === TRAINING_STATUS.COMPLETED) {
        const staff = staffs.find(
          (item) =>
            String(item.maNhanVien || "").trim() === String(payload?.maNhanVien || "").trim(),
        );
        const nextStatus = resolveStaffStatusAfterTrainingComplete(staff, payload);
        if (staff && nextStatus) {
          const statusResult = await updateSpaStaff({ ...staff, trangThai: nextStatus });
          if (statusResult?.success !== false) {
            setStaffs((prev) =>
              prev.map((item) =>
                String(item.maNhanVien || "").trim() === String(staff.maNhanVien || "").trim()
                  ? { ...item, trangThai: nextStatus }
                  : item,
              ),
            );
          }
        }
      }
      return true;
    } catch (_) {
      toast.error("Không lưu được lịch đào tạo.");
      return false;
    }
  };

  const handleLockPayroll = async (payload) => {
    try {
      const result = await lockSpaPayrollPeriod(payload);
      if (result?.success === false) {
        toast.error(result?.message || "Không chốt được kỳ lương.");
        return false;
      }
      return true;
    } catch (_) {
      toast.error("Không chốt được kỳ lương.");
      return false;
    }
  };

  const handleCancelViolation = async (payload) => {
    try {
      const result = await cancelSpaStaffViolation(payload);
      if (result?.success === false) {
        toast.error(result?.message || "Không hủy được biên bản vi phạm.");
        return false;
      }
      return true;
    } catch (_) {
      toast.error("Không hủy được biên bản vi phạm.");
      return false;
    }
  };

  const handleSaveSchedule = async (payload) => {
    try {
      const result = await updateSpaStaffSchedules(payload);
      if (result?.success === false) {
        toast.error(result?.message || "Không lưu được lịch ca.");
        return false;
      }
      clearReadCacheByKeys([CACHE_KEYS.staffSchedules], { source: "staff_management_save_schedule" });
      return true;
    } catch (_) {
      toast.error("Không lưu được lịch ca.");
      return false;
    }
  };

  const staffBootstrapPending = shouldBlockPanelUI(loading, staffs.length > 0);

  return (
    <main className="mx-auto max-w-9xl space-y-4 p-4 md:p-6 min-h-[calc(100vh-120px)]">
      <header className="rounded-3xl border border-slate-200 bg-gradient-to-r from-white via-rose-50 to-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="max-w-3xl">
            <h1 className="text-2xl font-black tracking-tight text-slate-800 md:text-3xl">Quản lý nhân sự</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500 md:text-base">
              Danh sách nhân viên, vai trò, trạng thái và lịch ca theo quy trình TLC Spa.
            </p>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {refreshing ? (
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-slate-700/80 border-r-transparent" />
            ) : null}
            {refreshing ? "Đang tải..." : "Tải lại"}
          </button>
        </div>
      </header>

      <StaffManagementNav activeTab={activeTab} onNavigate={navigateToTab} />

      <div className="min-w-0 space-y-4">
      {activeTab === "catalog" ? (
        <div className="space-y-4">
          {staffBootstrapPending ? (
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-16 text-center text-sm text-slate-500">
              Đang tải dữ liệu nhân sự...
            </div>
          ) : (
            <>
              <StaffFilterBar
                keyword={keyword}
                onKeywordChange={setKeyword}
                roleFilter={roleFilter}
                onRoleFilterChange={setRoleFilter}
                statusFilter={statusFilter}
                onStatusFilterChange={setStatusFilter}
              />
              <StaffCatalogPanel
                staffs={staffs}
                stays={stays}
                onCreate={handleCreateStaff}
                onUpdate={handleUpdateStaff}
                onDelete={handleDeleteStaff}
                DropdownComponent={CustomDropdown}
                roleFilter={roleFilter}
                statusFilter={statusFilter}
                keyword={keyword}
              />
            </>
          )}
        </div>
      ) : activeTab === "schedule" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <StaffSchedulePanel
            staffs={staffs}
            onSave={handleSaveSchedule}
          />
        </div>
      ) : activeTab === "kpi" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <StaffKpiPanel staffs={staffs} stays={stays} />
        </div>
      ) : activeTab === "checklist" ? (
        <div className="space-y-4">
          <StaffFilterBar
            keyword={keyword}
            onKeywordChange={setKeyword}
            roleFilter={roleFilter}
            onRoleFilterChange={setRoleFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <StaffChecklistPanel
              staffs={staffs}
              onSave={handleSaveChecklist}
              roleFilter={roleFilter}
              statusFilter={statusFilter}
              keyword={keyword}
            />
          </div>
        </div>
      ) : activeTab === "payroll" ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6">
          <StaffPayrollPanel
            staffs={staffs}
            staffsLoading={staffsLoading}
            stays={stays}
            onLockPeriod={handleLockPayroll}
          />
        </div>
      ) : activeTab === "violations" ? (
        <div className="space-y-4">
          <StaffFilterBar
            keyword={keyword}
            onKeywordChange={setKeyword}
            roleFilter={roleFilter}
            onRoleFilterChange={setRoleFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <StaffViolationPanel
              staffs={staffs}
              onSave={handleSaveViolation}
              onCancel={handleCancelViolation}
              roleFilter={roleFilter}
              statusFilter={statusFilter}
              keyword={keyword}
            />
          </div>
        </div>
      ) : activeTab === "leave" ? (
        <div className="space-y-4">
          <StaffFilterBar
            keyword={keyword}
            onKeywordChange={setKeyword}
            roleFilter={roleFilter}
            onRoleFilterChange={setRoleFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <StaffLeavePanel
              staffs={staffs}
              onSave={handleSaveLeave}
              onReview={handleReviewLeave}
              roleFilter={roleFilter}
              statusFilter={statusFilter}
              keyword={keyword}
            />
          </div>
        </div>
      ) : activeTab === "training" ? (
        <div className="space-y-4">
          <StaffFilterBar
            keyword={keyword}
            onKeywordChange={setKeyword}
            roleFilter={roleFilter}
            onRoleFilterChange={setRoleFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
          />
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <StaffTrainingPanel
              staffs={staffs}
              onSave={handleSaveTraining}
              roleFilter={roleFilter}
              statusFilter={statusFilter}
              keyword={keyword}
            />
          </div>
        </div>
      ) : activeTab === "attendance" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StaffFilterBar
              keyword={keyword}
              onKeywordChange={setKeyword}
              roleFilter={roleFilter}
              onRoleFilterChange={setRoleFilter}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
            />
            <button
              type="button"
              onClick={() => setShowTimesheetModal(true)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Bảng công
            </button>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-6">
            <StaffAttendancePanel
              staffs={staffs}
              onRecord={handleRecordAttendance}
              roleFilter={roleFilter}
              statusFilter={statusFilter}
              keyword={keyword}
            />
          </div>
        </div>
      ) : null}

      {showTimesheetModal && (
        <StaffTimesheetModal
          isOpen={showTimesheetModal}
          onClose={() => setShowTimesheetModal(false)}
          staffs={staffs}
          stays={stays}
        />
      )}
      </div>
    </main>
  );
}
