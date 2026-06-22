import { type Page } from "@playwright/test";

export const AUTH_STORAGE_KEY = "soanhang.auth.user";

export type StaffE2eState = {
  version: number;
  staffs: Record<string, unknown>[];
  stays: Record<string, unknown>[];
  schedules: Record<string, unknown>[];
  attendance: Record<string, unknown>[];
  checklists: Record<string, unknown>[];
  violations: Record<string, unknown>[];
  leaves: Record<string, unknown>[];
  trainings: Record<string, unknown>[];
  payroll: Record<string, unknown>[];
};

const pad2 = (n: number) => String(n).padStart(2, "0");

const todayKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
};

const monthStartKey = () => `${todayKey().slice(0, 8)}01`;

export const addDaysToDateKey = (dateKey: string, days: number) => {
  const date = new Date(`${dateKey}T12:00:00`);
  date.setDate(date.getDate() + days);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
};

export function createStaffE2eState(): StaffE2eState {
  const today = todayKey();
  const monthStart = monthStartKey();
  return {
    version: 1,
    staffs: [
      {
        maNhanVien: "NV000001",
        tenNhanVien: "Lan KTV",
        chucVu: "KTV",
        trangThai: "Đang làm việc",
        caLamViec: "SANG,CHIEU",
        luongCoBanThang: 8000000,
        tyLeThuongDichVu: 5,
      },
      {
        maNhanVien: "NV000002",
        tenNhanVien: "Minh Lễ tân",
        chucVu: "LE_TAN",
        trangThai: "Đang làm việc",
        caLamViec: "SANG,CHIEU,TOI",
      },
      {
        maNhanVien: "NV000003",
        tenNhanVien: "An Quản lý",
        chucVu: "QUAN_LY",
        trangThai: "Đang làm việc",
        caLamViec: "SANG,CHIEU,TOI",
      },
    ],
    stays: [
      {
        maPhien: "DH-KPI-001",
        maNhanVien: "NV000001",
        tenNhanVien: "Lan KTV",
        trangThaiPhien: "CHECKED_OUT",
        ketThucThucTe: `${today}T10:00:00.000Z`,
        tienDichVu: 300000,
        diemHaiLongKhach: 5,
        tenKhach: "Khách KPI A",
        soDienThoai: "0909111222",
      },
      {
        maPhien: "DH-KPI-002",
        maNhanVien: "NV000001",
        tenNhanVien: "Lan KTV",
        trangThaiPhien: "CHECKED_OUT",
        ketThucThucTe: `${today}T12:00:00.000Z`,
        tienDichVu: 200000,
        diemHaiLongKhach: 4,
        tenKhach: "Khách KPI B",
        soDienThoai: "0909333444",
      },
    ],
    schedules: [
      {
        ngay: today,
        caSang: "NV000001,NV000002",
        caChieu: "NV000001",
        caToi: "NV000003",
      },
    ],
    attendance: [
      {
        maNhanVien: "NV000001",
        ngay: today,
        caDuKien: "SANG",
        checkInAt: `${today}T03:00:00.000Z`,
        checkOutAt: "",
        trangThai: "Đang làm",
        ghiChu: "",
      },
    ],
    checklists: [
      {
        maNhanVien: "NV000002",
        ngay: today,
        caDuKien: "SANG",
        loaiChecklist: "DAU_CA",
        chucVu: "LE_TAN",
        itemsJson: "[]",
        ghiChu: "E2E checklist",
      },
    ],
    violations: [
      {
        maViPham: "VP000001",
        maNhanVien: "NV000001",
        ngay: today,
        capDo: "NHAC_NHO",
        noiDung: "Đi muộn 5 phút",
        mucTru: 0,
        trangThai: "AP_DUNG",
        ghiChu: "",
      },
    ],
    leaves: [
      {
        maDon: "NP000001",
        maNhanVien: "NV000002",
        tuNgay: monthStart,
        denNgay: today,
        lyDo: "Việc riêng",
        trangThai: "CHO_DUYET",
        ghiChu: "",
      },
    ],
    trainings: [
      {
        maDaoTao: "DT000001",
        maNhanVien: "NV000001",
        loaiDaoTao: "HOI_NHAP",
        tuNgay: monthStart,
        denNgay: today,
        noiDung: "Hội nhập TLC",
        trangThai: "HOAN_THANH",
        ghiChu: "",
      },
    ],
    payroll: [],
  };
}

/** Đơn nghỉ hôm nay — chờ duyệt (flow duyệt → Nghỉ phép). */
export function createLeaveApprovalState(): StaffE2eState {
  const today = todayKey();
  const state = createStaffE2eState();
  state.leaves = [
    {
      maDon: "NP000001",
      maNhanVien: "NV000002",
      tuNgay: today,
      denNgay: today,
      lyDo: "Việc riêng",
      trangThai: "CHO_DUYET",
      ghiChu: "",
    },
  ];
  return state;
}

/** Đơn đã duyệt, hết hạn hôm qua — NV vẫn Nghỉ phép, sync khi load → Đang làm việc. */
export function createLeaveReturnState(): StaffE2eState {
  const today = todayKey();
  const yesterday = addDaysToDateKey(today, -1);
  const monthStart = monthStartKey();
  const state = createStaffE2eState();
  state.staffs = state.staffs.map((staff) =>
    String(staff.maNhanVien) === "NV000002"
      ? { ...staff, trangThai: "Nghỉ phép" }
      : staff,
  );
  state.leaves = [
    {
      maDon: "NP000001",
      maNhanVien: "NV000002",
      tuNgay: monthStart,
      denNgay: yesterday,
      lyDo: "Nghỉ phép",
      trangThai: "DA_DUYET",
      ghiChu: "",
    },
  ];
  return state;
}

/** Đào tạo chuyên môn đang lên lịch — hoàn thành → Đang làm việc. */
export function createTrainingCompleteState(): StaffE2eState {
  const today = todayKey();
  const monthStart = monthStartKey();
  const state = createStaffE2eState();
  state.staffs.push({
    maNhanVien: "NV000004",
    tenNhanVien: "Hoa KTV",
    chucVu: "KTV",
    trangThai: "Đào tạo",
    caLamViec: "SANG,CHIEU",
    luongCoBanThang: 6000000,
    tyLeThuongDichVu: 5,
  });
  state.trainings = [
    {
      maDaoTao: "DT000002",
      maNhanVien: "NV000004",
      loaiDaoTao: "CHUYEN_MON",
      tuNgay: monthStart,
      denNgay: today,
      noiDung: "Chuyên môn massage",
      trangThai: "DA_LEN_LICH",
      ghiChu: "",
    },
  ];
  return state;
}

function inDateRange(value: string, tuNgay: string, denNgay: string) {
  if (tuNgay && value < tuNgay) return false;
  if (denNgay && value > denNgay) return false;
  return true;
}

export async function mockGasApi(page: Page, state: StaffE2eState) {
  await page.route("**/gas-proxy?**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const fn = requestUrl.searchParams.get("fn") || "";
    const args = JSON.parse(requestUrl.searchParams.get("args") || "[]");
    const payload = (args[0] || {}) as Record<string, unknown>;
    let response: Record<string, unknown>;

    const success = (data: unknown = null, message = "") => {
      state.version += 1;
      return { success: true, data, message };
    };

    switch (fn) {
      case "loginWithSessionKey":
      case "loginWithDeviceToken":
      case "loginWithHostAssertion":
        response = {
          success: true,
          data: {
            email: "e2e@spa.test",
            name: "E2E Admin",
            role: "admin",
            department: "spa",
            deviceToken: "e2e-token",
          },
        };
        break;
      case "getSyncVersion":
        response = { success: true, data: { version: String(state.version) } };
        break;
      case "getGlobalNotice":
      case "getAppSetting":
        response = { success: true, data: null };
        break;
      case "getSpaStaff":
        response = { success: true, data: state.staffs };
        break;
      case "getTreatmentHistory":
      case "getStayHistory":
        response = { success: true, data: state.stays };
        break;
      case "getSpaStaffSchedules":
        response = { success: true, data: state.schedules };
        break;
      case "updateSpaStaffSchedules":
        response = success(null, "Đã lưu lịch ca.");
        break;
      case "getSpaAttendance": {
        const ngay = String(payload.ngay || "").trim();
        const tuNgay = String(payload.tuNgay || "").trim();
        const denNgay = String(payload.denNgay || "").trim();
        response = {
          success: true,
          data: state.attendance.filter((row) => {
            const rowNgay = String(row.ngay || "");
            if (ngay) return rowNgay === ngay;
            return inDateRange(rowNgay, tuNgay, denNgay);
          }),
        };
        break;
      }
      case "recordSpaAttendance":
        response = success(payload, "Đã lưu chấm công.");
        break;
      case "getSpaShiftChecklists": {
        const ngay = String(payload.ngay || "").trim();
        response = {
          success: true,
          data: state.checklists.filter((row) => String(row.ngay || "") === ngay),
        };
        break;
      }
      case "saveSpaShiftChecklist":
        response = success(payload, "Đã lưu checklist ca.");
        break;
      case "getSpaStaffViolations": {
        const tuNgay = String(payload.tuNgay || "").trim();
        const denNgay = String(payload.denNgay || "").trim();
        response = {
          success: true,
          data: state.violations.filter((row) =>
            inDateRange(String(row.ngay || ""), tuNgay, denNgay),
          ),
        };
        break;
      }
      case "saveSpaStaffViolation":
        response = success(payload, "Đã lưu biên bản vi phạm.");
        break;
      case "cancelSpaStaffViolation":
        response = success(null, "Đã hủy biên bản vi phạm.");
        break;
      case "getSpaStaffLeaveRequests": {
        const tuNgay = String(payload.tuNgay || "").trim();
        const denNgay = String(payload.denNgay || "").trim();
        response = {
          success: true,
          data: state.leaves.filter((row) => {
            const from = String(row.tuNgay || "");
            const to = String(row.denNgay || "");
            if (denNgay && from > denNgay) return false;
            if (tuNgay && to < tuNgay) return false;
            return true;
          }),
        };
        break;
      }
      case "saveSpaStaffLeaveRequest":
        response = success(payload, "Đã lưu đơn nghỉ phép.");
        break;
      case "reviewSpaStaffLeaveRequest": {
        const maDon = String(payload.maDon || "").trim();
        const trangThai = String(payload.trangThai || "").trim();
        const leave = state.leaves.find((row) => String(row.maDon || "") === maDon);
        if (leave) leave.trangThai = trangThai;
        response = success(leave || null, "Đã cập nhật đơn nghỉ phép.");
        break;
      }
      case "getSpaStaffTrainings":
        response = { success: true, data: state.trainings };
        break;
      case "saveSpaStaffTraining": {
        const maDaoTao = String(payload.maDaoTao || "").trim();
        const existingIndex = state.trainings.findIndex(
          (row) => String(row.maDaoTao || "") === maDaoTao,
        );
        if (existingIndex >= 0) {
          state.trainings[existingIndex] = { ...state.trainings[existingIndex], ...payload };
          response = success(state.trainings[existingIndex], "Đã lưu lịch đào tạo.");
        } else {
          state.trainings.push(payload);
          response = success(payload, "Đã lưu lịch đào tạo.");
        }
        break;
      }
      case "getSpaPayrollRecords": {
        const tuNgay = String(payload.tuNgay || "").trim();
        const denNgay = String(payload.denNgay || "").trim();
        response = {
          success: true,
          data: state.payroll.filter((row) =>
            inDateRange(String(row.denNgay || row.tuNgay || ""), tuNgay, denNgay),
          ),
        };
        break;
      }
      case "lockSpaPayrollPeriod": {
        const rows = Array.isArray(payload.rows) ? payload.rows : [];
        state.payroll.push(...rows);
        response = success(rows, "Đã chốt kỳ lương.");
        break;
      }
      case "createSpaStaff":
        state.staffs.push(payload);
        response = success(payload, "OK");
        break;
      case "updateSpaStaff": {
        const code = String(payload.maNhanVien || "").trim();
        const index = state.staffs.findIndex((row) => String(row.maNhanVien || "") === code);
        if (index >= 0) {
          state.staffs[index] = { ...state.staffs[index], ...payload };
          response = success(state.staffs[index], "OK");
        } else {
          response = { success: false, message: "Không tìm thấy nhân viên." };
        }
        break;
      }
      case "deleteSpaStaff":
        response = success(payload, "OK");
        break;
      default:
        response = { success: true, data: [] };
        break;
    }

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(response),
    });
  });
}

export async function loginAndOpenStaffManagement(page: Page, state: StaffE2eState) {
  await mockGasApi(page, state);
  await page.addInitScript((storageKey) => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        user: {
          email: "e2e@spa.test",
          name: "E2E Admin",
          role: "admin",
          department: "spa",
        },
      }),
    );
  }, AUTH_STORAGE_KEY);
  await page.goto("/#/staff-management");
  await page.getByRole("heading", { name: "Quản lý nhân sự" }).waitFor({ timeout: 20_000 });
}
