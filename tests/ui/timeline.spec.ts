import { expect, test, type Page } from "@playwright/test";

type GasState = ReturnType<typeof createSpaState>;

const AUTH_STORAGE_KEY = "soanhang.auth.user";

const pad2 = (value: number) => String(value).padStart(2, "0");

const addMinutes = (base: Date, minutes: number) =>
  new Date(base.getTime() + minutes * 60_000).toISOString();

const createServiceItem = (index: number, overrides: Record<string, unknown> = {}) => ({
  serviceItemId: `SI-E2E-${index}`,
  maSanPham: "SP001",
  tenSanPham: "Tinh dầu gừng",
  nhomHang: "Dịch vụ phát sinh",
  donVi: "chai",
  soLuong: 1,
  donGia: 120000,
  thanhTien: 120000,
  ghiChu: "",
  ...overrides,
});

function createSpaState(
  options: {
    includeDueBooking?: boolean;
    includeDirtyDelayedBooking?: boolean;
    failCheckoutSessionIds?: string[];
    failCheckinSessionIds?: string[];
    failCreateBookingForPhones?: string[];
    staleCheckoutSessionIds?: string[];
  } = {},
) {
  const now = new Date();
  const includeDueBooking = options.includeDueBooking ?? true;
  const includeDirtyDelayedBooking = options.includeDirtyDelayedBooking ?? false;
  const failCheckoutSessionIds = options.failCheckoutSessionIds ?? [];
  const failCheckinSessionIds = options.failCheckinSessionIds ?? [];
  const failCreateBookingForPhones = options.failCreateBookingForPhones ?? [];
  const staleCheckoutSessionIds = options.staleCheckoutSessionIds ?? [];
  const rooms = [
    {
      maGiuong: "TL01",
      tenGiuong: "Giường TL-01",
      loaiGiuong: "P101",
      trangThaiGiuong: "Sẵn sàng",
      soKhachToiDa: 1,
      ghiChu: "",
      updatedAt: now.toISOString(),
    },
    {
      maGiuong: "TL02",
      tenGiuong: "Giường TL-02",
      loaiGiuong: "P102",
      trangThaiGiuong: "Đã hẹn trước",
      soKhachToiDa: 1,
      ghiChu: "",
      updatedAt: now.toISOString(),
    },
    {
      maGiuong: "TL03",
      tenGiuong: "Giường TL-03",
      loaiGiuong: "P103",
      trangThaiGiuong: "Sẵn sàng",
      soKhachToiDa: 1,
      ghiChu: "",
      updatedAt: now.toISOString(),
    },
    {
      maGiuong: "TL04",
      tenGiuong: "Giường TL-04",
      loaiGiuong: "P104",
      trangThaiGiuong: "Sẵn sàng",
      soKhachToiDa: 1,
      ghiChu: "",
      updatedAt: now.toISOString(),
    },
    {
      maGiuong: "TL05",
      tenGiuong: "Giường TL-05",
      loaiGiuong: "P201",
      trangThaiGiuong: "Đang trị liệu",
      soKhachToiDa: 1,
      ghiChu: "",
      updatedAt: now.toISOString(),
    },
    {
      maGiuong: "TL06",
      tenGiuong: "Giường TL-06",
      loaiGiuong: "P202",
      trangThaiGiuong: "Sẵn sàng",
      soKhachToiDa: 1,
      ghiChu: "",
      updatedAt: now.toISOString(),
    },
    {
      maGiuong: "TL07",
      tenGiuong: "Giường TL-07",
      loaiGiuong: "P203",
      trangThaiGiuong: "Sẵn sàng",
      soKhachToiDa: 1,
      ghiChu: "",
      updatedAt: now.toISOString(),
    },
    {
      maGiuong: "TL08",
      tenGiuong: "Giường TL-08",
      loaiGiuong: "P204",
      trangThaiGiuong: "Ngưng sử dụng",
      soKhachToiDa: 1,
      ghiChu: "",
      updatedAt: now.toISOString(),
    },
    {
      maGiuong: "TL09",
      tenGiuong: "Giường TL-09",
      loaiGiuong: "P205",
      trangThaiGiuong: "Sẵn sàng",
      soKhachToiDa: 1,
      ghiChu: "",
      updatedAt: now.toISOString(),
    },
  ];

  const stays = [
    {
      maPhien: "DH-ACTIVE-OVERDUE",
      maLichHen: "",
      maGiuong: "TL05",
      tenKhach: "Mai Hương",
      soDienThoai: "0903000005",
      maNhanVien: "NV001",
      tenNhanVien: "Nguyễn Anh Đức",
      maDv: "DV001",
      tenDichVu: "Massage trị liệu",
      maGoi: "GOI60",
      tenGoi: "Gói chăm sóc 60 phút",
      batDauAt: addMinutes(now, -120),
      ketThucDuKien: addMinutes(now, -30),
      ketThucThucTe: "",
      thoiLuongPhut: 60,
      giaGoi: 299000,
      tienGoi: 299000,
      tienDichVu: 0,
      tongThanhToan: 299000,
      tongBuoiCombo: 1,
      buoiThu: 1,
      buoiConLai: 0,
      trangThaiPhien: "IN_HOUSE",
      ghiChu: "Phiên quá giờ vẫn đang làm",
      serviceItems: [],
    },
    {
      maPhien: "DH-FUTURE",
      maLichHen: "LH-FUTURE",
      maGiuong: "TL03",
      tenKhach: "Đỗ Thu Hà",
      soDienThoai: "0903000015",
      maNhanVien: "NV003",
      tenNhanVien: "Hoàng Long",
      maDv: "DV001",
      tenDichVu: "Massage trị liệu",
      maGoi: "GOI90",
      tenGoi: "Gói cổ vai gáy lẻ",
      batDauAt: addMinutes(now, 90),
      ketThucDuKien: addMinutes(now, 180),
      ketThucThucTe: "",
      thoiLuongPhut: 90,
      giaGoi: 399000,
      tienGoi: 399000,
      tienDichVu: 0,
      tongThanhToan: 399000,
      tongBuoiCombo: 1,
      buoiThu: 1,
      buoiConLai: 0,
      trangThaiPhien: "BOOKED",
      ghiChu: "",
      serviceItems: [],
    },
  ];

  if (includeDirtyDelayedBooking) {
    stays.push({
      maPhien: "DH-DELAY-PAST",
      maLichHen: "LH-DELAY-PAST",
      maGiuong: "TL06",
      tenKhach: "Khách delay cũ",
      soDienThoai: "0903000006",
      maNhanVien: "NV002",
      tenNhanVien: "Mai Hương",
      maDv: "DV001",
      tenDichVu: "Massage trị liệu",
      maGoi: "GOI60",
      tenGoi: "Gói chăm sóc 60 phút",
      batDauAt: addMinutes(now, -300),
      ketThucDuKien: addMinutes(now, -240),
      ketThucThucTe: "",
      thoiLuongPhut: 60,
      giaGoi: 299000,
      tienGoi: 299000,
      tienDichVu: 0,
      tongThanhToan: 299000,
      tongBuoiCombo: 1,
      buoiThu: 1,
      buoiConLai: 0,
      trangThaiPhien: "BOOKED",
      ghiChu: "Delay quá khứ không được kéo dài tới hiện tại",
      serviceItems: [],
    });
  }

  if (includeDueBooking) {
    stays.push({
      maPhien: "DH-DUE",
      maLichHen: "LH-DUE",
      maGiuong: "TL02",
      tenKhach: "Anh Giang - Kim Mã",
      soDienThoai: "0903000010",
      maNhanVien: "NV002",
      tenNhanVien: "Mai Hương",
      maDv: "DV001",
      tenDichVu: "Massage trị liệu",
      maGoi: "GOI60",
      tenGoi: "Gói chăm sóc 60 phút",
      batDauAt: addMinutes(now, -5),
      ketThucDuKien: addMinutes(now, 55),
      ketThucThucTe: "",
      thoiLuongPhut: 60,
      giaGoi: 299000,
      tienGoi: 299000,
      tienDichVu: 0,
      tongThanhToan: 299000,
      tongBuoiCombo: 1,
      buoiThu: 1,
      buoiConLai: 0,
      trangThaiPhien: "BOOKED",
      ghiChu: "",
      serviceItems: [],
    });
  }

  return {
    version: 1,
    rooms,
    stays,
    staffs: [
      {
        maNhanVien: "NV001",
        tenNhanVien: "Nguyễn Anh Đức",
        trangThai: "Đang làm việc",
        caLamViec: "SANG,CHIEU,TOI",
        vaiTro: "KTV",
        updatedAt: now.toISOString(),
      },
      {
        maNhanVien: "NV002",
        tenNhanVien: "Mai Hương",
        trangThai: "Đang làm việc",
        caLamViec: "CHIEU,TOI",
        vaiTro: "KTV",
        updatedAt: now.toISOString(),
      },
      {
        maNhanVien: "NV003",
        tenNhanVien: "Hoàng Long",
        trangThai: "Đang làm việc",
        caLamViec: "SANG,CHIEU",
        vaiTro: "KTV",
        updatedAt: now.toISOString(),
      },
      {
        maNhanVien: "NV004",
        tenNhanVien: "Trần Gia Bảo",
        trangThai: "Nghỉ",
        caLamViec: "TOI",
        vaiTro: "KTV",
        updatedAt: now.toISOString(),
      },
      {
        maNhanVien: "NV005",
        tenNhanVien: "Lan Nghỉ phép",
        trangThai: "Nghỉ phép",
        caLamViec: "SANG,CHIEU,TOI",
        vaiTro: "KTV",
        updatedAt: now.toISOString(),
      },
    ],
    packages: [
      {
        maGoi: "GOI60",
        tenGoi: "Gói chăm sóc 60 phút",
        maDv: "DV001",
        tenDichVu: "Massage trị liệu",
        thoiLuongPhut: 60,
        giaBanGoi: 299000,
        giaGoi: 299000,
        soBuoiQuyDoi: 1,
        active: true,
      },
      {
        maGoi: "GOI90",
        tenGoi: "Gói cổ vai gáy lẻ",
        maDv: "DV001",
        tenDichVu: "Massage trị liệu",
        thoiLuongPhut: 90,
        giaBanGoi: 399000,
        giaGoi: 399000,
        soBuoiQuyDoi: 1,
        active: true,
      },
      {
        maGoi: "COMBO3",
        tenGoi: "Combo thư giãn 3 buổi",
        maDv: "DV002",
        tenDichVu: "Combo liệu trình",
        thoiLuongPhut: 60,
        giaBanGoi: 799000,
        giaGoi: 799000,
        soBuoiQuyDoi: 3,
        active: true,
      },
    ],
    products: [
      {
        maSanPham: "SP001",
        tenSanPham: "Tinh dầu gừng",
        donVi: "chai",
        donViTinh: "chai",
        donGiaBan: 120000,
        giaBan: 120000,
        active: true,
      },
      {
        maSanPham: "SP002",
        tenSanPham: "Muối thảo dược",
        donVi: "gói",
        donViTinh: "gói",
        donGiaBan: 45000,
        giaBan: 45000,
        active: true,
      },
    ],
    customers: [
      {
        tenKhach: "Vũ Hải Yến",
        soDienThoai: "0903000016",
        maNhanVien: "NV003",
      },
      {
        tenKhach: "Anh Giang - Kim Mã",
        soDienThoai: "0903000010",
        maNhanVien: "NV002",
      },
    ],
    customerProgress: [],
    failCheckoutSessionIds,
    failCheckinSessionIds,
    failCreateBookingForPhones,
    staleCheckoutSessionIds,
  };
}

function findStay(state: GasState, identity: string) {
  return state.stays.find(
    (stay) => stay.maPhien === identity || stay.maLichHen === identity,
  );
}

function patchRoomStatus(state: GasState, roomCode: string, status: string) {
  const room = state.rooms.find((item) => item.maGiuong === roomCode);
  if (room) {
    room.trangThaiGiuong = status;
    room.updatedAt = new Date().toISOString();
  }
}

function withTotals(stay: Record<string, any>) {
  const serviceItems = Array.isArray(stay.serviceItems) ? stay.serviceItems : [];
  const tienDichVu = serviceItems.reduce(
    (sum, item) => sum + Number(item.thanhTien || Number(item.soLuong || 0) * Number(item.donGia || 0)),
    0,
  );
  const tienGoi = Number(stay.tienGoi || stay.giaGoi || 0);
  return {
    ...stay,
    tienDichVu,
    tongThanhToan: tienGoi + tienDichVu,
    serviceItems,
  };
}

const staffShiftDefinitions: Record<string, { label: string; fromMinute: number; toMinute: number }> = {
  SANG: { label: "Ca sáng", fromMinute: 10 * 60, toMinute: 14 * 60 },
  CHIEU: { label: "Ca chiều", fromMinute: 14 * 60, toMinute: 18 * 60 },
  TOI: { label: "Ca tối", fromMinute: 18 * 60, toMinute: 22 * 60 },
};

function normalizeStaffShiftCodes(raw: unknown) {
  return String(raw || "")
    .split(/[,\n;|]+/)
    .map((item) => item.trim().toUpperCase())
    .filter((item) => Boolean(staffShiftDefinitions[item]));
}

function getStaffShiftCodes(staff?: Record<string, any>) {
  const codes = normalizeStaffShiftCodes(staff?.caLamViec);
  return codes.length ? codes : ["SANG", "CHIEU", "TOI"];
}

function minuteOfDay(value: string) {
  const d = new Date(value || "");
  return d.getHours() * 60 + d.getMinutes();
}

function isSameLocalDate(a: string, b: string) {
  const da = new Date(a || "");
  const db = new Date(b || "");
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
}

function getStaffShiftError(state: GasState, payload: Record<string, any>) {
  const staffCode = String(payload.maNhanVien || "").trim();
  if (!staffCode) return "";
  const startIso = String(payload.batDauAt || "");
  const endIso = String(payload.ketThucDuKien || "");
  if (!startIso || !endIso || !isSameLocalDate(startIso, endIso)) return "";
  const staff = state.staffs.find((item) => String(item.maNhanVien) === staffCode);
  if (!staff) return "";
  const startMinute = minuteOfDay(startIso);
  const endMinute = minuteOfDay(endIso);
  const allowed = getStaffShiftCodes(staff)
    .map((code) => staffShiftDefinitions[code])
    .filter(Boolean);
  const intervals = allowed.sort((a, b) => a.fromMinute - b.fromMinute);
  let cursor = startMinute;
  for (const shift of intervals) {
    if (shift.toMinute <= cursor) continue;
    if (shift.fromMinute > cursor) return "Nhân viên không có ca làm trong khung giờ đã chọn.";
    cursor = Math.max(cursor, shift.toMinute);
    if (cursor >= endMinute) return "";
  }
  return "Nhân viên không có ca làm trong khung giờ đã chọn.";
}

async function mockGas(page: Page, state: GasState) {
  await page.route("**/gas-proxy?**", async (route) => {
    const requestUrl = new URL(route.request().url());
    const fn = requestUrl.searchParams.get("fn") || "";
    const args = JSON.parse(requestUrl.searchParams.get("args") || "[]");
    const payload = args[0] || {};
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
      case "getTreatmentBeds":
      case "getRooms":
        response = { success: true, data: state.rooms };
        break;
      case "getTreatmentHistory":
      case "getStayHistory":
        response = { success: true, data: state.stays.map((stay) => withTotals(stay)) };
        break;
      case "getProductCatalog":
        response = { success: true, data: state.products };
        break;
      case "getSpaStaff":
        response = { success: true, data: state.staffs };
        break;
      case "updateSpaStaff":
      case "updateSpaStaffSchedule": {
        const staff = state.staffs.find(
          (item) => String(item.maNhanVien) === String(payload.maNhanVien || ""),
        );
        if (!staff) {
          response = { success: false, message: "Không tìm thấy nhân viên." };
          break;
        }
        if (payload.caLamViec !== undefined) {
          const codes = normalizeStaffShiftCodes(payload.caLamViec);
          if (!codes.length) {
            response = { success: false, message: "Cần chọn ít nhất một ca làm việc." };
            break;
          }
          payload.caLamViec = codes.join(",");
        }
        Object.assign(staff, payload);
        response = success(
          staff,
          fn === "updateSpaStaff"
            ? "Đã cập nhật nhân viên."
            : "Đã cập nhật lịch làm việc nhân viên.",
        );
        break;
      }
      case "getCustomerCatalog":
        response = { success: true, data: state.customers };
        break;
      case "getCustomerProgress":
        response = { success: true, data: state.customerProgress };
        break;
      case "getTreatmentPackages":
        response = { success: true, data: state.packages };
        break;
      case "startTreatmentSessionWithItems":
      case "checkInRoomWithItems":
      case "startTreatmentSession":
      case "checkInRoom": {
        const identity = String(payload.maPhien || payload.maLichHen || "");
        if (state.failCheckinSessionIds.includes(identity)) {
          response = { success: false, message: "Giả lập lỗi mở phiên." };
          break;
        }
        const existing = identity ? findStay(state, identity) : null;
        const shiftError = existing ? "" : getStaffShiftError(state, payload);
        if (shiftError) {
          response = { success: false, message: shiftError };
          break;
        }
        const roomCode = String(payload.maGiuong || existing?.maGiuong || "");
        const nextStay = withTotals({
          ...(existing || {}),
          ...payload,
          maPhien: existing?.maPhien || `DH-E2E-${state.version}`,
          maLichHen: payload.maLichHen || existing?.maLichHen || "",
          maGiuong: roomCode,
          batDauAt: payload.batDauAt || new Date().toISOString(),
          ketThucDuKien: payload.ketThucDuKien || addMinutes(new Date(), 60),
          ketThucThucTe: "",
          trangThaiPhien: "IN_HOUSE",
        });
        if (existing) Object.assign(existing, nextStay);
        else state.stays.unshift(nextStay as any);
        patchRoomStatus(state, roomCode, "Đang trị liệu");
        response = success(nextStay, "Đã mở phiên.");
        break;
      }
      case "createSpaBookingWithItems":
      case "createBookingWithItems":
      case "createSpaBooking":
      case "createBooking": {
        if (state.failCreateBookingForPhones.includes(String(payload.soDienThoai || ""))) {
          response = { success: false, message: "Giả lập lỗi tạo lịch." };
          break;
        }
        const shiftError = getStaffShiftError(state, payload);
        if (shiftError) {
          response = { success: false, message: shiftError };
          break;
        }
        const created = withTotals({
          ...payload,
          maPhien: `DH-BOOK-${state.version}`,
          maLichHen: `LH-BOOK-${state.version}`,
          trangThaiPhien: "BOOKED",
          ketThucThucTe: "",
          serviceItems: Array.isArray(payload.serviceItems)
            ? payload.serviceItems.map((item: Record<string, unknown>, index: number) =>
                createServiceItem(index + state.version, item),
              )
            : [],
        });
        state.stays.unshift(created as any);
        patchRoomStatus(state, String(payload.maGiuong || ""), "Đã hẹn trước");
        response = success(created, "Đã tạo lịch hẹn.");
        break;
      }
      case "completeTreatmentSession":
      case "checkoutRoom": {
        const identity = String(payload.maPhien || payload.maLichHen || "");
        if (state.failCheckoutSessionIds.includes(identity)) {
          response = { success: false, message: "Giả lập lỗi kết thúc phiên." };
          break;
        }
        const stay = findStay(state, identity);
        if (!stay) {
          response = { success: false, message: "Không tìm thấy phiên." };
          break;
        }
        const completed = {
          ...stay,
          trangThaiPhien: "CHECKED_OUT",
          ketThucThucTe: payload.ketThucThucTe || new Date().toISOString(),
          diemHaiLongKhach:
            payload.diemHaiLongKhach !== undefined && payload.diemHaiLongKhach !== null
              ? payload.diemHaiLongKhach
              : stay.diemHaiLongKhach,
        };
        if (!state.staleCheckoutSessionIds.includes(identity)) {
          Object.assign(stay, completed);
          patchRoomStatus(state, stay.maGiuong, "Sẵn sàng");
        }
        response = success(withTotals(completed), "Kết thúc phiên thành công.");
        break;
      }
      case "markTreatmentNoShow":
      case "markSpaAppointmentNoShow": {
        const stay = findStay(state, String(payload.maPhien || payload.maLichHen || ""));
        if (!stay) {
          response = { success: false, message: "Không tìm thấy lịch hẹn." };
          break;
        }
        stay.trangThaiPhien = "NO_SHOW";
        patchRoomStatus(state, stay.maGiuong, "Sẵn sàng");
        response = success(withTotals(stay), "Đã huỷ đặt trước.");
        break;
      }
      case "updateTreatmentSessionTime":
      case "updateStayTime": {
        const stay = findStay(state, String(payload.maPhien || payload.maLichHen || ""));
        if (!stay) {
          response = { success: false, message: "Không tìm thấy phiên." };
          break;
        }
        Object.assign(stay, payload);
        response = success(withTotals(stay), "Đã cập nhật thời gian.");
        break;
      }
      case "addTreatmentServiceItem":
      case "addStayServiceItem": {
        const stay = findStay(state, String(payload.maPhien || ""));
        if (!stay) {
          response = { success: false, message: "Không tìm thấy phiên." };
          break;
        }
        stay.serviceItems = [
          ...(Array.isArray(stay.serviceItems) ? stay.serviceItems : []),
          createServiceItem(state.version, payload),
        ];
        response = success(withTotals(stay), "Đã thêm dòng.");
        break;
      }
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

async function loginAndOpenTimeline(page: Page, state: GasState) {
  await mockGas(page, state);
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
  await page.goto("/#/create-order");
  await expect(page.getByRole("heading", { name: "Điều phối trị liệu" })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByTestId("room-timeline-scroll")).toBeVisible();
}

async function chooseDropdownOption(page: Page, buttonName: RegExp, optionName: RegExp) {
  await page.getByRole("button", { name: buttonName }).first().click();
  await page.getByRole("button", { name: optionName }).last().click();
}

async function choosePickerValue(page: Page, testId: string, optionName: RegExp) {
  await page.getByTestId(testId).click();
  await page.getByRole("button", { name: optionName }).last().click();
}

async function setBookingTimeWindow(page: Page, startHour: number, endHour: number) {
  const today = new Date().toISOString().slice(0, 10);
  const modal = page.getByTestId("checkin-modal");
  const dateInputs = modal.locator('input[type="date"]');
  await dateInputs.nth(0).fill(today);
  await dateInputs.nth(1).fill(today);
  await choosePickerValue(page, "booking-start-picker-hour", new RegExp(`^${pad2(startHour)}h$`));
  await choosePickerValue(page, "booking-start-picker-minute", /^00 phút$/);
  await choosePickerValue(page, "booking-end-picker-hour", new RegExp(`^${pad2(endHour)}h$`));
  await choosePickerValue(page, "booking-end-picker-minute", /^00 phút$/);
}

async function fillMinimalSessionForm(
  page: Page,
  customerName: string,
  phone: string,
  staffName: RegExp | null = /Nguyễn Anh Đức/,
) {
  await page.getByPlaceholder("Nhập tên khách để gợi ý khách cũ").fill(customerName);
  await page.getByPlaceholder("Nhập SĐT để gợi ý khách cũ").fill(phone);
  if (staffName) {
    await chooseDropdownOption(page, /Nhấp vào để chọn nhân viên|Chưa gán nhân viên/, staffName);
  }
  await chooseDropdownOption(page, /Nhấp vào để chọn gói trị liệu/, /Gói chăm sóc 60 phút/);
}

test.describe("spa timeline production flows", () => {
  test.beforeEach(async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name === "mobile-chromium",
      "Timeline vận hành chính hiện được kiểm thử trên desktop; mobile cần bộ test layout riêng.",
    );
    page.on("dialog", (dialog) => dialog.accept());
  });

  test("1. timeline opens around current time and preserves stale delayed booking as booked", async ({ page }) => {
    const state = createSpaState({
      includeDueBooking: false,
      includeDirtyDelayedBooking: true,
    });
    await loginAndOpenTimeline(page, state);

    const scrollTop = await page.getByTestId("room-timeline-scroll").evaluate((el) => el.scrollTop);
    expect(scrollTop).toBeGreaterThan(0);
    await expect(page.getByTestId("timeline-now-line")).toBeVisible();
    await expect(page.getByTestId("timeline-room-block-DH-DELAY-PAST")).toHaveAttribute(
      "data-session-status",
      "BOOKED",
    );
    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
      window.dispatchEvent(new Event("pageshow"));
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(page.getByTestId("timeline-now-line")).toBeVisible();
  });

  test("1b. room header columns align with timeline body columns", async ({ page }) => {
    const state = createSpaState({
      includeDueBooking: false,
      includeDirtyDelayedBooking: false,
    });
    await loginAndOpenTimeline(page, state);

    const headerBox = await page.getByTestId("timeline-room-head-TL05").boundingBox();
    const blockBox = await page.getByTestId("timeline-room-block-DH-ACTIVE-OVERDUE").boundingBox();
    expect(headerBox).toBeTruthy();
    expect(blockBox).toBeTruthy();
    expect(blockBox!.x).toBeGreaterThanOrEqual(headerBox!.x - 2);
    expect(blockBox!.x + blockBox!.width).toBeLessThanOrEqual(headerBox!.x + headerBox!.width + 2);
  });

  test("2. due booking can be delayed without becoming active", async ({ page }) => {
    const state = createSpaState({
      includeDueBooking: true,
      includeDirtyDelayedBooking: false,
    });
    await loginAndOpenTimeline(page, state);

    await expect(page.getByText(/Đã tới giờ hẹn|Lịch hẹn đã quá giờ/i)).toBeVisible();
    await page.getByRole("button", { name: /Khách delay, mở sau/ }).click();
    await expect(page.getByText(/Đã tới giờ hẹn|Lịch hẹn đã quá giờ/i)).toBeHidden();
    await expect(page.getByTestId("timeline-room-block-DH-DUE")).toHaveAttribute(
      "data-session-status",
      "BOOKED",
    );
    expect(findStay(state, "DH-DUE")?.trangThaiPhien).toBe("BOOKED");
  });

  test("3. due booking can be opened and an overdue in-house session can always checkout", async ({ page }) => {
    const state = createSpaState({
      includeDueBooking: true,
      includeDirtyDelayedBooking: false,
    });
    await loginAndOpenTimeline(page, state);

    await page.getByRole("button", { name: /Mở giường/ }).click();
    await expect(page.getByTestId("timeline-room-block-DH-DUE")).toHaveAttribute(
      "data-session-status",
      "IN_HOUSE",
      { timeout: 10_000 },
    );

    await page.getByTestId("timeline-room-block-DH-ACTIVE-OVERDUE").click();
    await page.getByRole("button", { name: /Kết thúc phiên/ }).click();
    await page.getByRole("button", { name: /Xác nhận kết thúc phiên/ }).click();

    await expect(page.getByTestId("timeline-room-block-DH-ACTIVE-OVERDUE")).toHaveAttribute(
      "data-session-status",
      "CHECKED_OUT",
      { timeout: 10_000 },
    );
    expect(findStay(state, "DH-ACTIVE-OVERDUE")?.trangThaiPhien).toBe("CHECKED_OUT");
    expect(state.rooms.find((room) => room.maGiuong === "TL01")?.trangThaiGiuong).toBe("Sẵn sàng");
  });

  test("3a. checkout success remains checked out even if immediate reload returns stale in-house data", async ({ page }) => {
    const state = createSpaState({
      includeDueBooking: false,
      includeDirtyDelayedBooking: false,
      staleCheckoutSessionIds: ["DH-ACTIVE-OVERDUE"],
    });
    await loginAndOpenTimeline(page, state);

    const activeBlock = page.getByTestId("timeline-room-block-DH-ACTIVE-OVERDUE");
    await activeBlock.click();
    await page.getByRole("button", { name: /Kết thúc phiên/ }).click();
    await page.getByRole("button", { name: /Xác nhận kết thúc phiên/ }).click();

    await expect(activeBlock).toHaveAttribute("data-session-status", "CHECKED_OUT", {
      timeout: 10_000,
    });
    await page.waitForTimeout(1200);
    await expect(activeBlock).toHaveAttribute("data-session-status", "CHECKED_OUT");
    expect(findStay(state, "DH-ACTIVE-OVERDUE")?.trangThaiPhien).toBe("IN_HOUSE");
  });

  test("3b. failed check-in does not optimistically mutate booked or active sessions", async ({ page }) => {
    const state = createSpaState({
      includeDueBooking: true,
      includeDirtyDelayedBooking: false,
      failCheckinSessionIds: ["DH-DUE"],
    });
    await loginAndOpenTimeline(page, state);

    await page.getByRole("button", { name: /Mở giường/ }).click();

    await expect(page.getByTestId("timeline-room-block-DH-DUE")).toHaveAttribute(
      "data-session-status",
      "BOOKED",
    );
    await expect(page.getByTestId("timeline-room-block-DH-ACTIVE-OVERDUE")).toHaveAttribute(
      "data-session-status",
      "IN_HOUSE",
    );
    expect(findStay(state, "DH-DUE")?.trangThaiPhien).toBe("BOOKED");
    expect(findStay(state, "DH-ACTIVE-OVERDUE")?.trangThaiPhien).toBe("IN_HOUSE");
  });

  test("3c. failed checkout does not optimistically mutate timeline or delayed bookings", async ({ page }) => {
    const state = createSpaState({
      includeDueBooking: false,
      includeDirtyDelayedBooking: true,
      failCheckoutSessionIds: ["DH-ACTIVE-OVERDUE"],
    });
    await loginAndOpenTimeline(page, state);

    const activeBlock = page.getByTestId("timeline-room-block-DH-ACTIVE-OVERDUE");
    const delayedBlock = page.getByTestId("timeline-room-block-DH-DELAY-PAST");
    await expect(activeBlock).toHaveAttribute("data-session-status", "IN_HOUSE");
    await expect(delayedBlock).toHaveAttribute("data-session-status", "BOOKED");

    const delayPromptAction = page.getByRole("button", { name: /Khách delay, mở sau/ });
    if (await delayPromptAction.isVisible().catch(() => false)) {
      await delayPromptAction.click();
    }
    await activeBlock.click();
    await page.getByRole("button", { name: /Kết thúc phiên/ }).click();
    await page.getByRole("button", { name: /Xác nhận kết thúc phiên/ }).click();

    await expect(activeBlock).toHaveAttribute("data-session-status", "IN_HOUSE");
    await expect(delayedBlock).toHaveAttribute("data-session-status", "BOOKED");
    expect(findStay(state, "DH-ACTIVE-OVERDUE")?.trangThaiPhien).toBe("IN_HOUSE");
    expect(findStay(state, "DH-DELAY-PAST")?.trangThaiPhien).toBe("BOOKED");
  });

  test("4. due booking can be cancelled/no-show and the bed is released", async ({ page }) => {
    const state = createSpaState({
      includeDueBooking: true,
      includeDirtyDelayedBooking: false,
    });
    await loginAndOpenTimeline(page, state);

    await page.getByRole("button", { name: /Huỷ đặt trước/ }).click();
    await expect(page.getByTestId("timeline-room-block-DH-DUE")).toBeHidden({ timeout: 10_000 });
    expect(findStay(state, "DH-DUE")?.trangThaiPhien).toBe("NO_SHOW");
    expect(state.rooms.find((room) => room.maGiuong === "TL02")?.trangThaiGiuong).toBe("Sẵn sàng");
  });

  test("5. opening an immediate session from an available bed writes to timeline", async ({ page }) => {
    const state = createSpaState({
      includeDueBooking: false,
      includeDirtyDelayedBooking: false,
    });
    await loginAndOpenTimeline(page, state);

    await page.getByTestId("timeline-room-head-TL01").click();
    await page.getByRole("button", { name: /Mở ngay/ }).click();
    await fillMinimalSessionForm(page, "Khách mở ngay E2E", "0903999001", null);
    await page.getByRole("button", { name: /Mở phiên ngay/ }).click();

    const created = state.stays.find((stay) => stay.tenKhach === "Khách mở ngay E2E");
    expect(created?.trangThaiPhien).toBe("IN_HOUSE");
    await expect(page.getByText("Khách mở ngay E2E")).toBeVisible({ timeout: 10_000 });
  });

  test("5b. immediate session persists assigned KTV", async ({ page }) => {
    const state = createSpaState({
      includeDueBooking: false,
      includeDirtyDelayedBooking: false,
    });
    await loginAndOpenTimeline(page, state);

    await page.getByTestId("timeline-room-head-TL01").click();
    await page.getByRole("button", { name: /Mở ngay/ }).click();
    await fillMinimalSessionForm(page, "Khách gán KTV E2E", "0903999010", /Nguyễn Anh Đức/);
    await page.getByRole("button", { name: /Mở phiên ngay/ }).click();

    const created = state.stays.find((stay) => stay.tenKhach === "Khách gán KTV E2E");
    expect(created?.maNhanVien).toBe("NV001");
    await expect(page.getByText("Khách gán KTV E2E")).toBeVisible({ timeout: 10_000 });
  });

  test("5c. on-leave KTV is hidden from assignment dropdown", async ({ page }) => {
    const state = createSpaState({
      includeDueBooking: false,
      includeDirtyDelayedBooking: false,
    });
    await loginAndOpenTimeline(page, state);

    await page.getByTestId("timeline-room-head-TL01").click();
    await page.getByRole("button", { name: /Mở ngay/ }).click();
    await page.getByRole("button", { name: /Nhấp vào để chọn nhân viên|Chưa gán nhân viên/ }).click();
    await expect(page.getByRole("button", { name: /Lan Nghỉ phép/ })).toHaveCount(0);
    await expect(page.getByRole("button", { name: /Nguyễn Anh Đức/ }).last()).toBeVisible();
  });

  test("6. creating a booking from an available bed writes booked status to timeline", async ({ page }) => {
    const state = createSpaState({
      includeDueBooking: false,
      includeDirtyDelayedBooking: false,
    });
    await loginAndOpenTimeline(page, state);

    await page.getByTestId("timeline-room-head-TL07").click();
    await page.getByRole("button", { name: /Đặt lịch hẹn/ }).click();
    await fillMinimalSessionForm(page, "Khách đặt lịch E2E", "0903999002", null);
    await page.getByRole("button", { name: /^Tạo lịch hẹn$/ }).click();

    const created = state.stays.find((stay) => stay.tenKhach === "Khách đặt lịch E2E");
    expect(created?.trangThaiPhien).toBe("BOOKED");
    await expect(page.getByText("Khách đặt lịch E2E")).toBeVisible({ timeout: 10_000 });
  });

  test("6b. failed booking creation does not create a temporary timeline block", async ({ page }) => {
    const state = createSpaState({
      includeDueBooking: false,
      includeDirtyDelayedBooking: false,
      failCreateBookingForPhones: ["0903999099"],
    });
    await loginAndOpenTimeline(page, state);

    await page.getByTestId("timeline-room-head-TL07").click();
    await page.getByRole("button", { name: /Đặt lịch hẹn/ }).click();
    await fillMinimalSessionForm(page, "Khách lỗi đặt lịch E2E", "0903999099", null);
    await page.getByRole("button", { name: /^Tạo lịch hẹn$/ }).click();

    await expect(page.getByTestId("checkin-modal")).toBeVisible();
    expect(state.stays.some((stay) => stay.tenKhach === "Khách lỗi đặt lịch E2E")).toBe(false);
    expect(state.rooms.find((room) => room.maGiuong === "TL07")?.trangThaiGiuong).toBe("Sẵn sàng");
  });

  test("7. staff schedule blocks outside-shift booking until the shift is enabled", async ({ page }) => {
    const state = createSpaState({
      includeDueBooking: false,
      includeDirtyDelayedBooking: false,
    });
    await loginAndOpenTimeline(page, state);

    await page.getByTestId("timeline-room-head-TL07").click();
    await page.getByRole("button", { name: /Đặt lịch hẹn/ }).click();
    await fillMinimalSessionForm(page, "Khách ngoài ca E2E", "0903999003", /Hoàng Long/);
    await setBookingTimeWindow(page, 18, 19);

    await expect(
      page.getByText(/Nhân viên không có ca làm trong buổi/),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: /^Tạo lịch hẹn$/ })).toBeDisabled();
    expect(state.stays.some((stay) => stay.tenKhach === "Khách ngoài ca E2E")).toBe(false);

    await page.getByTestId("checkin-modal").getByRole("button", { name: "Đóng" }).click();
    await page.goto("/#/staff-management");
    const staffRow = page.locator("div").filter({ hasText: "NV003" }).filter({ hasText: "Hoàng Long" }).first();
    await staffRow.getByRole("button", { name: "Sửa" }).click();
    await page.getByLabel("Ca tối").check();
    await page.getByRole("button", { name: "Lưu thay đổi" }).click();
    await expect(page.getByText("Đã cập nhật nhân viên.")).toBeVisible({ timeout: 10_000 });
    await page.goto("/#/create-order");

    await page.getByTestId("timeline-room-head-TL07").click();
    await page.getByRole("button", { name: /Đặt lịch hẹn/ }).click();
    await fillMinimalSessionForm(page, "Khách sau đổi ca E2E", "0903999004", /Hoàng Long/);
    await setBookingTimeWindow(page, 18, 19);
    await page.getByRole("button", { name: /^Tạo lịch hẹn$/ }).click();

    const created = state.stays.find((stay) => stay.tenKhach === "Khách sau đổi ca E2E");
    expect(created?.trangThaiPhien).toBe("BOOKED");
    expect(state.staffs.find((staff) => staff.maNhanVien === "NV003")?.caLamViec).toContain("TOI");
    expect(state.rooms.find((room) => room.maGiuong === "TL07")?.trangThaiGiuong).toBe("Đã hẹn trước");
  });
});
