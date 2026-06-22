import { buildOrderRows, buildCustomerRow } from "../../../core/core.js";
import { nextSessionCodeFromRows, nextTreatmentProgressCodeFromRows } from "../spaSessionCodeHelpers.js";

const toLocalDateTimeString_ = (date) => {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";

  const pad = (num) => String(num).length < 2 ? '0' + num : num;
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const HH = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());

  return YYYY + "-" + MM + "-" + DD + " " + HH + ":" + mm + ":" + ss;
};

// Time only format "HH:mm"
const toLocalTimeString_ = (date) => {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const pad = (num) => String(num).length < 2 ? '0' + num : num;
  return pad(d.getHours()) + ":" + pad(d.getMinutes());
};

// VN datetime format "HH:mm DD/MM/YYYY"
const toVnDateTimeString_ = (date) => {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";

  const pad = (num) => String(num).length < 2 ? '0' + num : num;
  const HH = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const DD = pad(d.getDate());
  const MM = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();

  return HH + ":" + mm + " " + DD + "/" + MM + "/" + yyyy;
};

// Parse VN datetime to ms
const parseVnDateTimeToMs_ = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return 0;
  const m = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return new Date(parseInt(m[5]), parseInt(m[4]) - 1, parseInt(m[3]), parseInt(m[1]), parseInt(m[2])).getTime();
  }
  const d = new Date(raw);
  return isFinite(d.getTime()) ? d.getTime() : 0;
};

const MOCK_ACCOUNTS = [
  {
    email: "admin@demo.com",
    password: "admin123",
    name: "Admin Demo",
    role: "admin",
    department: "IT",
  },
  {
    email: "user@demo.com",
    password: "user123",
    name: "User Demo",
    role: "user",
    department: "Sales",
  },
  {
    email: "testapi@demo.com",
    password: "testapi",
    name: "dev",
    role: "admin",
    department: "dev",
  },
];

const MOCK_PRODUCTS = [
  {
    tenSanPham: "Nước suối Aquafina 500ml",
    anhSanPham: "",
    nhomHang: "Nước",
    donVi: "Chai",
    donGiaBan: 10000,
    giaVon: 6000,
    donViLon: "Thùng",
    quyCach: 24,
    tonKho: 240,
  },
  {
    tenSanPham: "Mì gói Hảo Hảo",
    anhSanPham: "",
    nhomHang: "Đồ đóng gói",
    donVi: "Gói",
    donGiaBan: 5000,
    giaVon: 3500,
    donViLon: "Thùng",
    quyCach: 30,
    tonKho: 150,
  },
  {
    tenSanPham: "Bánh Oreo",
    anhSanPham: "",
    nhomHang: "Bánh kẹo",
    donVi: "Gói",
    donGiaBan: 15000,
    giaVon: 10000,
    donViLon: "Hộp",
    quyCach: 12,
    tonKho: 60,
  },
  {
    tenSanPham: "Sữa tươi Vinamilk 180ml",
    anhSanPham: "",
    nhomHang: "Nước",
    donVi: "Hộp",
    donGiaBan: 8000,
    giaVon: 5500,
    donViLon: "Lốc",
    quyCach: 4,
    tonKho: 40,
  },
  {
    tenSanPham: "Coca Cola lon 330ml",
    anhSanPham: "",
    nhomHang: "Nước",
    donVi: "Lon",
    donGiaBan: 12000,
    giaVon: 8000,
    donViLon: "Thùng",
    quyCach: 24,
    tonKho: 48,
  },
];

const MOCK_CUSTOMERS = [
  { tenKhach: "Nguyễn Văn A", soDienThoai: "0908123456" },
  { tenKhach: "Trần Thị Lan", soDienThoai: "0912345678" },
  { tenKhach: "Lê Hoàng Nam", soDienThoai: "0934567891" },
  { tenKhach: "Khách ghé thăm", soDienThoai: "" },
];

const upsertLocalCustomer = (customer = {}) => {
  const tenKhach = String(customer?.tenKhach || "").trim();
  const soDienThoai = String(customer?.soDienThoai || "").trim();
  if (!tenKhach || foldText(tenKhach) === "khach ghe tham") return;
  const key = `${foldText(tenKhach)}||${String(soDienThoai).replace(/[^\d]/g, "")}`;
  const idx = MOCK_CUSTOMERS.findIndex((item) => {
    const itemKey = `${foldText(String(item?.tenKhach || "").trim())}||${String(item?.soDienThoai || "").replace(/[^\d]/g, "")}`;
    return itemKey === key;
  });
  const next = { tenKhach, soDienThoai };
  if (idx >= 0) MOCK_CUSTOMERS[idx] = { ...MOCK_CUSTOMERS[idx], ...next };
  else MOCK_CUSTOMERS.push(next);
};

const MOCK_STAFF = [
  {
    maNhanVien: "NV000001",
    tenNhanVien: "Nguyễn Anh Đức",
    chucVu: "KTV",
    soDienThoai: "",
    ngayVaoLam: "",
    trangThai: "Đang làm việc",
    caLamViec: "SANG,CHIEU,TOI",
    ghiChu: "KTV chính",
  },
  {
    maNhanVien: "NV000002",
    tenNhanVien: "Hoàng Long",
    chucVu: "TU_VAN",
    soDienThoai: "",
    ngayVaoLam: "",
    trangThai: "Đang làm việc",
    caLamViec: "SANG,CHIEU",
    ghiChu: "Tư vấn",
  },
  {
    maNhanVien: "NV000003",
    tenNhanVien: "Mai Hương",
    chucVu: "KTV",
    soDienThoai: "",
    ngayVaoLam: "",
    trangThai: "Đang làm việc",
    caLamViec: "CHIEU,TOI",
    ghiChu: "KTV",
  },
];

const MOCK_TREATMENT_PROTOCOLS = [
  {
    maPhacDo: "PD-TLC-COVAI",
    tenPhacDo: "Cổ vai gáy - vùng đầu - an thần mất ngủ",
    nhomBenh: "Cổ vai gáy / vùng đầu",
    capDoBenh: "Chuyên sâu",
    moTa: "Giảm đau cổ vai gáy, an thần, giảm stress, hỗ trợ ngủ sâu.",
    active: true,
    updatedAt: "",
  },
  {
    maPhacDo: "PD-TLC-DUONGSINH",
    tenPhacDo: "Dưỡng sinh chuyên sâu",
    nhomBenh: "Dưỡng sinh phục hồi",
    capDoBenh: "Toàn diện",
    moTa: "Phục hồi từ gốc, tái tạo toàn diện, khai thông khí huyết.",
    active: true,
    updatedAt: "",
  },
  {
    maPhacDo: "PD-TLC-PHUCHOI",
    tenPhacDo: "Phục hồi chuyên sâu TLC",
    nhomBenh: "Phục hồi chuyên sâu",
    capDoBenh: "Cá nhân hóa",
    moTa: "Tê bì tay chân, viêm khớp vai, thoát vị đĩa đệm, ôn ấm tử cung, thanh lọc tiêu hóa.",
    active: true,
    updatedAt: "",
  },
  {
    maPhacDo: "PD-TLC-GOIDAU",
    tenPhacDo: "Gội đầu dưỡng sinh an thần",
    nhomBenh: "Da đầu / tóc / thư giãn",
    capDoBenh: "Thư giãn",
    moTa: "Làm sạch sâu, thư giãn vùng đầu, giảm stress, ngủ ngon.",
    active: true,
    updatedAt: "",
  },
];

const MOCK_BANK_CONFIG = {
  bankCode: "mbbank",
  accountNumber: "201130122003",
  accountName: "Nguyễn Anh Đức",
};

const ROOM_STATUS = Object.freeze({
  AVAILABLE: "Sẵn sàng",
  IN_HOUSE: "Đang trị liệu",
  CLEANING: "Đang tạm dừng",
  MAINTENANCE: "Ngưng sử dụng",
});

const STAY_STATUS = Object.freeze({
  BOOKED: "BOOKED",
  IN_HOUSE: "IN_HOUSE",
  CHECKED_OUT: "CHECKED_OUT",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
});

const normalizeRoomStatusInput = (value) => {
  const raw = foldText(value);
  if (!raw) return null;
  if (raw === "in_house" || raw.includes("dang tri lieu") || raw.includes("dang o"))
    return ROOM_STATUS.IN_HOUSE;
  if (
    raw === "booked" ||
    raw.includes("da hen truoc") ||
    raw.includes("da dat")
  )
    return ROOM_STATUS.AVAILABLE;
  if (
    raw === "maintenance" ||
    raw === "ngung_su_dung" ||
    raw.includes("bao tri") ||
    raw.includes("ngung su dung") ||
    raw.includes("ngung hoat dong")
  )
    return ROOM_STATUS.MAINTENANCE;
  if (
    raw === "cleaning" ||
    raw.includes("tam dung") ||
    raw.includes("ve sinh")
  )
    return ROOM_STATUS.CLEANING;
  if (raw === "available" || raw.includes("san sang") || raw.includes("trong"))
    return ROOM_STATUS.AVAILABLE;
  return null;
};

const isActiveStaffStatus = (value) => {
  const raw = foldText(value || "dang lam viec");
  if (!raw) return true;
  return (
    raw === "dang lam viec" ||
    raw === "dang hoat dong" ||
    raw.includes("dang lam") ||
    raw.includes("hoat dong") ||
    raw.includes("san sang")
  );
};
const isBlockingStaffStatus = (value) => {
  const raw = foldText(value || "");
  if (!raw) return false;
  return (
    raw === "offline" ||
    raw.includes("tam ngung") ||
    raw.includes("nghi") ||
    raw.includes("off")
  );
};
const STAFF_SHIFT_DEFINITIONS = [
  { code: "SANG", label: "Ca sáng", fromMinute: 10 * 60, toMinute: 14 * 60 },
  { code: "CHIEU", label: "Ca chiều", fromMinute: 14 * 60, toMinute: 18 * 60 },
  { code: "TOI", label: "Ca tối", fromMinute: 18 * 60, toMinute: 22 * 60 },
];
const getStaffShiftDefinition = (code) =>
  STAFF_SHIFT_DEFINITIONS.find((shift) => shift.code === String(code || "").trim().toUpperCase()) ||
  null;
const normalizeStaffShiftCodes = (value) => {
  const rawItems = Array.isArray(value) ? value : String(value || "").split(/[,\n;|]+/g);
  const seen = new Set();
  rawItems.forEach((item) => {
    const raw = foldText(item);
    let code = String(item || "").trim().toUpperCase();
    if (raw.includes("sang") || raw === "morning") code = "SANG";
    if (raw.includes("chieu") || raw === "afternoon") code = "CHIEU";
    if (raw.includes("toi") || raw.includes("dem") || raw === "evening") code = "TOI";
    if (getStaffShiftDefinition(code)) seen.add(code);
  });
  return Array.from(seen);
};
const getStaffShiftCodes = (staff = {}) => {
  const codes = normalizeStaffShiftCodes(staff?.caLamViec);
  return codes.length ? codes : ["SANG", "CHIEU", "TOI"];
};
const buildStaffShiftLabel = (codes = []) =>
  codes
    .map(getStaffShiftDefinition)
    .filter(Boolean)
    .map(
      (shift) =>
        `${shift.label} ${String(Math.floor(shift.fromMinute / 60)).padStart(2, "0")}:00-${String(Math.floor(shift.toMinute / 60)).padStart(2, "0")}:00`,
    )
    .join(", ");
// Parse VN datetime to Date object
const parseVnDateTimeToDate = (value) => {
  const ms = parseVnDateTimeToMs_(value);
  if (!ms) return null;
  return new Date(ms);
};

const getMinuteOfDay = (value) => {
  const d = parseVnDateTimeToDate(value);
  if (!d) return null;
  return d.getHours() * 60 + d.getMinutes();
};
const isSameLocalDate = (a, b) => {
  const da = parseVnDateTimeToDate(a);
  const db = parseVnDateTimeToDate(b);
  if (!da || !db) return false;
  return (
    da.getFullYear() === db.getFullYear() &&
    da.getMonth() === db.getMonth() &&
    da.getDate() === db.getDate()
  );
};
const getShiftCodeByMinuteOfDay = (minute) => {
  if (!Number.isFinite(minute) || minute < 0) return null;
  if (minute < 14 * 60) return "SANG";
  if (minute < 18 * 60) return "CHIEU";
  return "TOI";
};
const getStaffShiftViolation = (staff, startIso, endIso) => {
  if (!staff || !String(staff.maNhanVien || "").trim()) return null;
  const startMinute = getMinuteOfDay(startIso);
  const endMinute = getMinuteOfDay(endIso);
  if (startMinute == null || endMinute == null || endMinute <= startMinute) return null;
  const codes = getStaffShiftCodes(staff);
  if (!isSameLocalDate(startIso, endIso)) {
    return {
      message: "Lịch làm việc nhân viên không hỗ trợ phiên qua ngày.",
      allowedLabel: buildStaffShiftLabel(codes),
    };
  }
  const activeShiftCode = getShiftCodeByMinuteOfDay(startMinute);
  if (activeShiftCode && codes.includes(activeShiftCode)) return null;
  return {
    message: `Nhân viên không có ca làm trong buổi ${getStaffShiftDefinition(activeShiftCode)?.label?.toLowerCase() || "đã chọn"}.`,
    allowedLabel: buildStaffShiftLabel(codes),
  };
};

const MOCK_ROOMS = [
  {
    maGiuong: "P101",
    tenGiuong: "Giường trị liệu 01",
    loaiGiuong: "Trị liệu",
    trangThaiGiuong: ROOM_STATUS.AVAILABLE,
    soKhachToiDa: 1,
    ghiChu: "",
    updatedAt: "",
  },
  {
    maGiuong: "P102",
    tenGiuong: "Giường trị liệu 02",
    loaiGiuong: "Trị liệu",
    trangThaiGiuong: ROOM_STATUS.AVAILABLE,
    soKhachToiDa: 1,
    ghiChu: "",
    updatedAt: "",
  },
  {
    maGiuong: "P103",
    tenGiuong: "Giường trị liệu 03",
    loaiGiuong: "Trị liệu",
    trangThaiGiuong: ROOM_STATUS.AVAILABLE,
    soKhachToiDa: 1,
    ghiChu: "",
    updatedAt: "",
  },
  {
    maGiuong: "P104",
    tenGiuong: "Giường trị liệu 04",
    loaiGiuong: "Trị liệu",
    trangThaiGiuong: ROOM_STATUS.AVAILABLE,
    soKhachToiDa: 1,
    ghiChu: "",
    updatedAt: "",
  },
  { maGiuong: "P105", tenGiuong: "Giường trị liệu 05", loaiGiuong: "Trị liệu", trangThaiGiuong: ROOM_STATUS.AVAILABLE, soKhachToiDa: 1, ghiChu: "", updatedAt: "" },
  { maGiuong: "P106", tenGiuong: "Giường trị liệu 06", loaiGiuong: "Trị liệu", trangThaiGiuong: ROOM_STATUS.AVAILABLE, soKhachToiDa: 1, ghiChu: "", updatedAt: "" },
  { maGiuong: "P107", tenGiuong: "Giường trị liệu 07", loaiGiuong: "Trị liệu", trangThaiGiuong: ROOM_STATUS.AVAILABLE, soKhachToiDa: 1, ghiChu: "", updatedAt: "" },
  { maGiuong: "P108", tenGiuong: "Giường trị liệu 08", loaiGiuong: "Trị liệu", trangThaiGiuong: ROOM_STATUS.AVAILABLE, soKhachToiDa: 1, ghiChu: "", updatedAt: "" },
  { maGiuong: "P109", tenGiuong: "Giường trị liệu 09", loaiGiuong: "Trị liệu", trangThaiGiuong: ROOM_STATUS.AVAILABLE, soKhachToiDa: 1, ghiChu: "", updatedAt: "" },
  { maGiuong: "G201", tenGiuong: "Giường gội 01", loaiGiuong: "Gội đầu", trangThaiGiuong: ROOM_STATUS.AVAILABLE, soKhachToiDa: 1, ghiChu: "", updatedAt: "" },
  { maGiuong: "G202", tenGiuong: "Giường gội 02", loaiGiuong: "Gội đầu", trangThaiGiuong: ROOM_STATUS.AVAILABLE, soKhachToiDa: 1, ghiChu: "", updatedAt: "" },
];

const MOCK_TREATMENT_SERVICES = [
  {
    maDv: "DV-TRAINGHIEM-0D",
    maPhacDo: "PD-TLC-COVAI",
    lop1NhomDv: "Trải nghiệm",
    lop2DichVu: "Trải nghiệm 0đ - test điểm đau",
    vungTriLieu: "Cổ vai gáy / vùng đầu",
    thoiLuongPhut: 30,
    active: true,
  },
  {
    maDv: "DV-GOI-ANTHAN-199",
    maPhacDo: "PD-TLC-GOIDAU",
    lop1NhomDv: "Gội đầu dưỡng sinh",
    lop2DichVu: "Gội đầu dưỡng sinh an thần",
    vungTriLieu: "Da đầu / tóc / vùng đầu",
    thoiLuongPhut: 75,
    active: true,
  },
  {
    maDv: "DV-COVAI-499",
    maPhacDo: "PD-TLC-COVAI",
    lop1NhomDv: "Dưỡng sinh chuyên sâu",
    lop2DichVu: "Dưỡng sinh cổ vai gáy",
    vungTriLieu: "Cổ vai gáy",
    thoiLuongPhut: 60,
    active: true,
  },
  {
    maDv: "DV-DAU-ANTHAN-599",
    maPhacDo: "PD-TLC-COVAI",
    lop1NhomDv: "Dưỡng sinh chuyên sâu",
    lop2DichVu: "Dưỡng sinh vùng đầu an thần",
    vungTriLieu: "Vùng đầu / cổ",
    thoiLuongPhut: 70,
    active: true,
  },
  {
    maDv: "DV-LUNGEO-599",
    maPhacDo: "PD-TLC-DUONGSINH",
    lop1NhomDv: "Dưỡng sinh chuyên sâu",
    lop2DichVu: "Dưỡng sinh lưng eo",
    vungTriLieu: "Lưng eo",
    thoiLuongPhut: 70,
    active: true,
  },
  {
    maDv: "DV-TOANTHAN-899",
    maPhacDo: "PD-TLC-DUONGSINH",
    lop1NhomDv: "Dưỡng sinh chuyên sâu",
    lop2DichVu: "Dưỡng sinh toàn thân",
    vungTriLieu: "Toàn thân",
    thoiLuongPhut: 90,
    active: true,
  },
  {
    maDv: "DV-DIADEM-999",
    maPhacDo: "PD-TLC-PHUCHOI",
    lop1NhomDv: "Phục hồi chuyên sâu TLC",
    lop2DichVu: "Chăm sóc đĩa đệm / thoát vị đĩa đệm",
    vungTriLieu: "Lưng / cột sống",
    thoiLuongPhut: 120,
    active: true,
  },
];

const MOCK_TREATMENT_PACKAGES = [
  {
    maGoi: "GOI-TRAINGHIEM-0D",
    maDv: "DV-TRAINGHIEM-0D",
    tenGoi: "Trải nghiệm 0đ 30 phút",
    loaiGoi: "KHUYEN_MAI",
    soBuoiMua: 1,
    soBuoiTang: 0,
    soBuoiQuyDoi: 1,
    giaBanGoi: 0,
    giaVonChuanGoi: 0,
    active: true,
  },
  {
    maGoi: "GOI-GOI-ANTHAN-199",
    maDv: "DV-GOI-ANTHAN-199",
    tenGoi: "Gội đầu dưỡng sinh an thần",
    loaiGoi: "LE",
    soBuoiMua: 1,
    soBuoiTang: 0,
    soBuoiQuyDoi: 1,
    giaBanGoi: 199000,
    giaVonChuanGoi: 0,
    active: true,
  },
  {
    maGoi: "GOI-COVAI-499",
    maDv: "DV-COVAI-499",
    tenGoi: "Dưỡng sinh cổ vai gáy",
    loaiGoi: "LE",
    soBuoiMua: 1,
    soBuoiTang: 0,
    soBuoiQuyDoi: 1,
    giaBanGoi: 499000,
    giaVonChuanGoi: 0,
    active: true,
  },
  {
    maGoi: "GOI-LUNGEO-599",
    maDv: "DV-LUNGEO-599",
    tenGoi: "Dưỡng sinh lưng eo",
    loaiGoi: "LE",
    soBuoiMua: 1,
    soBuoiTang: 0,
    soBuoiQuyDoi: 1,
    giaBanGoi: 599000,
    giaVonChuanGoi: 0,
    active: true,
  },
  {
    maGoi: "GOI-THANG-COVAI-4B",
    maDv: "DV-COVAI-499",
    tenGoi: "Gói chăm sóc cổ vai gáy tháng",
    loaiGoi: "THANG",
    soBuoiMua: 4,
    soBuoiTang: 0,
    soBuoiQuyDoi: 4,
    giaBanGoi: 1990000,
    giaVonChuanGoi: 0,
    active: true,
  },
  {
    maGoi: "GOI-THANG-ANTHAN-6B",
    maDv: "DV-DAU-ANTHAN-599",
    tenGoi: "Gói an thần ngủ sâu tháng",
    loaiGoi: "THANG",
    soBuoiMua: 6,
    soBuoiTang: 0,
    soBuoiQuyDoi: 6,
    giaBanGoi: 2990000,
    giaVonChuanGoi: 0,
    active: true,
  },
  {
    maGoi: "GOI-THANG-VIP-12B",
    maDv: "DV-TOANTHAN-899",
    tenGoi: "Gói phục hồi chuyên sâu VIP tháng",
    loaiGoi: "THANG",
    soBuoiMua: 12,
    soBuoiTang: 0,
    soBuoiQuyDoi: 12,
    giaBanGoi: 5990000,
    giaVonChuanGoi: 0,
    active: true,
  },
];

const MOCK_STAYS = [];
const MOCK_STAY_SERVICE_ITEMS = [];
const MOCK_CT_BAN = [];

const LOCAL_SYNC_VERSION_KEY = "soanhang_local_sync_version";

const MOCK_ORDER_HISTORY = [
  {
    maPhieu: "DH012",
    ngayBan: "2026-03-09",
    tenKhach: "Nguyễn Văn A",
    tienNo: 0,
    tongHoaDon: 45000,
    ghiChu: "Khách quen",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Mì gói Hảo Hảo",
        donVi: "Gói",
        soLuong: 3,
        giaVon: 3500,
        donGiaBan: 5000,
        thanhTien: 15000,
      },
      {
        tenSanPham: "Bánh Oreo",
        donVi: "Gói",
        soLuong: 2,
        giaVon: 10000,
        donGiaBan: 15000,
        thanhTien: 30000,
      },
    ],
  },
  {
    maPhieu: "DH011",
    ngayBan: "2026-03-08",
    tenKhach: "Trần Thị Lan",
    tienNo: 9000,
    tongHoaDon: 24000,
    ghiChu: "-",
    trangThai: "Trả một phần",
    products: [
      {
        tenSanPham: "Coca Cola lon 330ml",
        donVi: "Lon",
        soLuong: 2,
        giaVon: 8000,
        donGiaBan: 12000,
        thanhTien: 24000,
      },
    ],
  },
  {
    maPhieu: "DH010",
    ngayBan: "2026-03-07",
    tenKhach: "Lê Hoàng Nam",
    tienNo: 0,
    tongHoaDon: 30000,
    ghiChu: "Bán sỉ",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Nước suối Aquafina 500ml",
        donVi: "Chai",
        soLuong: 3,
        giaVon: 6000,
        donGiaBan: 10000,
        thanhTien: 30000,
      },
    ],
  },
  {
    maPhieu: "DH009",
    ngayBan: "2026-03-06",
    tenKhach: "Nguyễn Thị Hoa",
    tienNo: 5000,
    tongHoaDon: 20000,
    ghiChu: "-",
    trangThai: "Trả một phần",
    products: [
      {
        tenSanPham: "Mì gói Hảo Hảo",
        donVi: "Gói",
        soLuong: 4,
        giaVon: 3500,
        donGiaBan: 5000,
        thanhTien: 20000,
      },
    ],
  },
  {
    maPhieu: "DH008",
    ngayBan: "2026-03-05",
    tenKhach: "Phạm Thị Mai",
    tienNo: 0,
    tongHoaDon: 12000,
    ghiChu: "Khách quen",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Coca Cola lon 330ml",
        donVi: "Lon",
        soLuong: 1,
        giaVon: 8000,
        donGiaBan: 12000,
        thanhTien: 12000,
      },
    ],
  },
  {
    maPhieu: "DH007",
    ngayBan: "2026-03-04",
    tenKhach: "Bùi Văn Khánh",
    tienNo: 0,
    tongHoaDon: 45000,
    ghiChu: "-",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Bánh Oreo",
        donVi: "Gói",
        soLuong: 3,
        giaVon: 10000,
        donGiaBan: 15000,
        thanhTien: 45000,
      },
    ],
  },
  {
    maPhieu: "DH006",
    ngayBan: "2026-03-03",
    tenKhach: "Vũ Thị Hạnh",
    tienNo: 0,
    tongHoaDon: 36000,
    ghiChu: "-",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Coca Cola lon 330ml",
        donVi: "Lon",
        soLuong: 3,
        giaVon: 8000,
        donGiaBan: 12000,
        thanhTien: 36000,
      },
    ],
  },
  {
    maPhieu: "DH005",
    ngayBan: "2026-03-02",
    tenKhach: "Nguyễn Minh Tuấn",
    tienNo: 0,
    tongHoaDon: 20000,
    ghiChu: "Bán lẻ",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Nước suối Aquafina 500ml",
        donVi: "Chai",
        soLuong: 2,
        giaVon: 6000,
        donGiaBan: 10000,
        thanhTien: 20000,
      },
    ],
  },
  {
    maPhieu: "DH004",
    ngayBan: "2026-03-01",
    tenKhach: "Trần Quốc Bảo",
    tienNo: 10000,
    tongHoaDon: 30000,
    ghiChu: "Khách mới",
    trangThai: "Trả một phần",
    products: [
      {
        tenSanPham: "Bánh Oreo",
        donVi: "Gói",
        soLuong: 2,
        giaVon: 10000,
        donGiaBan: 15000,
        thanhTien: 30000,
      },
    ],
  },
  {
    maPhieu: "DH003",
    ngayBan: "2026-02-28",
    tenKhach: "Phạm Thị Mai",
    tienNo: 0,
    tongHoaDon: 55000,
    ghiChu: "-",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Sữa tươi Vinamilk 180ml",
        donVi: "Hộp",
        soLuong: 5,
        giaVon: 5500,
        donGiaBan: 8000,
        thanhTien: 40000,
      },
      {
        tenSanPham: "Mì gói Hảo Hảo",
        donVi: "Gói",
        soLuong: 3,
        giaVon: 3500,
        donGiaBan: 5000,
        thanhTien: 15000,
      },
    ],
  },
  {
    maPhieu: "DH002",
    ngayBan: "2026-02-27",
    tenKhach: "Lê Hoàng Nam",
    tienNo: 0,
    tongHoaDon: 12000,
    ghiChu: "Bán nhanh",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Mì gói Hảo Hảo",
        donVi: "Gói",
        soLuong: 2,
        giaVon: 3500,
        donGiaBan: 5000,
        thanhTien: 10000,
      },
      {
        tenSanPham: "Nước suối Aquafina 500ml",
        donVi: "Chai",
        soLuong: 1,
        giaVon: 6000,
        donGiaBan: 10000,
        thanhTien: 10000,
      },
    ],
  },
  {
    maPhieu: "DH001",
    ngayBan: "2026-02-26",
    tenKhach: "Nguyễn Thị Hoa",
    tienNo: 0,
    tongHoaDon: 18000,
    ghiChu: "-",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Coca Cola lon 330ml",
        donVi: "Lon",
        soLuong: 1,
        giaVon: 8000,
        donGiaBan: 12000,
        thanhTien: 12000,
      },
      {
        tenSanPham: "Mì gói Hảo Hảo",
        donVi: "Gói",
        soLuong: 2,
        giaVon: 3500,
        donGiaBan: 5000,
        thanhTien: 10000,
      },
    ],
  },
  {
    maPhieu: "DH000",
    ngayBan: "2026-02-15",
    tenKhach: "Trần Thị Lan",
    tienNo: 0,
    tongHoaDon: 30000,
    ghiChu: "-",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Bánh Oreo",
        donVi: "Gói",
        soLuong: 2,
        giaVon: 10000,
        donGiaBan: 15000,
        thanhTien: 30000,
      },
    ],
  },
  {
    maPhieu: "DH-2026-01",
    ngayBan: "2026-01-20",
    tenKhach: "Nguyễn Văn A",
    tienNo: 0,
    tongHoaDon: 40000,
    ghiChu: "Đầu năm",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Sữa tươi Vinamilk 180ml",
        donVi: "Hộp",
        soLuong: 5,
        giaVon: 5500,
        donGiaBan: 8000,
        thanhTien: 40000,
      },
    ],
  },
  {
    maPhieu: "DH-2025-12",
    ngayBan: "2025-12-18",
    tenKhach: "Bùi Văn Khánh",
    tienNo: 0,
    tongHoaDon: 36000,
    ghiChu: "-",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Coca Cola lon 330ml",
        donVi: "Lon",
        soLuong: 3,
        giaVon: 8000,
        donGiaBan: 12000,
        thanhTien: 36000,
      },
    ],
  },
  {
    maPhieu: "DH-2025-11",
    ngayBan: "2025-11-22",
    tenKhach: "Phạm Thị Mai",
    tienNo: 0,
    tongHoaDon: 25000,
    ghiChu: "-",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Mì gói Hảo Hảo",
        donVi: "Gói",
        soLuong: 5,
        giaVon: 3500,
        donGiaBan: 5000,
        thanhTien: 25000,
      },
    ],
  },
  {
    maPhieu: "DH-2025-10",
    ngayBan: "2025-10-14",
    tenKhach: "Vũ Thị Hạnh",
    tienNo: 0,
    tongHoaDon: 20000,
    ghiChu: "Tháng 10",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Nước suối Aquafina 500ml",
        donVi: "Chai",
        soLuong: 2,
        giaVon: 6000,
        donGiaBan: 10000,
        thanhTien: 20000,
      },
    ],
  },
  {
    maPhieu: "DH-2025-09",
    ngayBan: "2025-09-05",
    tenKhach: "Nguyễn Thị Hoa",
    tienNo: 0,
    tongHoaDon: 60000,
    ghiChu: "Tháng 9",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Bánh Oreo",
        donVi: "Gói",
        soLuong: 4,
        giaVon: 10000,
        donGiaBan: 15000,
        thanhTien: 60000,
      },
    ],
  },
  {
    maPhieu: "DH-2025-08",
    ngayBan: "2025-08-19",
    tenKhach: "Lê Hoàng Nam",
    tienNo: 0,
    tongHoaDon: 28000,
    ghiChu: "-",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Coca Cola lon 330ml",
        donVi: "Lon",
        soLuong: 2,
        giaVon: 8000,
        donGiaBan: 12000,
        thanhTien: 24000,
      },
      {
        tenSanPham: "Mì gói Hảo Hảo",
        donVi: "Gói",
        soLuong: 1,
        giaVon: 3500,
        donGiaBan: 5000,
        thanhTien: 5000,
      },
    ],
  },
  {
    maPhieu: "DH-2025-07",
    ngayBan: "2025-07-11",
    tenKhach: "Trần Quốc Bảo",
    tienNo: 0,
    tongHoaDon: 32000,
    ghiChu: "-",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Sữa tươi Vinamilk 180ml",
        donVi: "Hộp",
        soLuong: 4,
        giaVon: 5500,
        donGiaBan: 8000,
        thanhTien: 32000,
      },
    ],
  },
  {
    maPhieu: "DH-2025-06",
    ngayBan: "2025-06-27",
    tenKhach: "Nguyễn Minh Tuấn",
    tienNo: 0,
    tongHoaDon: 18000,
    ghiChu: "-",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Nước suối Aquafina 500ml",
        donVi: "Chai",
        soLuong: 1,
        giaVon: 6000,
        donGiaBan: 10000,
        thanhTien: 10000,
      },
      {
        tenSanPham: "Mì gói Hảo Hảo",
        donVi: "Gói",
        soLuong: 2,
        giaVon: 3500,
        donGiaBan: 5000,
        thanhTien: 10000,
      },
    ],
  },
  {
    maPhieu: "DH-2025-05",
    ngayBan: "2025-05-16",
    tenKhach: "Phạm Thị Mai",
    tienNo: 0,
    tongHoaDon: 24000,
    ghiChu: "-",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Coca Cola lon 330ml",
        donVi: "Lon",
        soLuong: 2,
        giaVon: 8000,
        donGiaBan: 12000,
        thanhTien: 24000,
      },
    ],
  },
  {
    maPhieu: "DH-2025-04",
    ngayBan: "2025-04-09",
    tenKhach: "Trần Thị Lan",
    tienNo: 0,
    tongHoaDon: 15000,
    ghiChu: "-",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Mì gói Hảo Hảo",
        donVi: "Gói",
        soLuong: 3,
        giaVon: 3500,
        donGiaBan: 5000,
        thanhTien: 15000,
      },
    ],
  },
  {
    maPhieu: "DH-2025-03",
    ngayBan: "2025-03-02",
    tenKhach: "Nguyễn Văn A",
    tienNo: 0,
    tongHoaDon: 20000,
    ghiChu: "-",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Nước suối Aquafina 500ml",
        donVi: "Chai",
        soLuong: 2,
        giaVon: 6000,
        donGiaBan: 10000,
        thanhTien: 20000,
      },
    ],
  },
  {
    maPhieu: "DH-2025-02",
    ngayBan: "2025-02-08",
    tenKhach: "Vũ Thị Hạnh",
    tienNo: 0,
    tongHoaDon: 10000,
    ghiChu: "-",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Mì gói Hảo Hảo",
        donVi: "Gói",
        soLuong: 2,
        giaVon: 3500,
        donGiaBan: 5000,
        thanhTien: 10000,
      },
    ],
  },
  {
    maPhieu: "DH-2025-01",
    ngayBan: "2025-01-12",
    tenKhach: "Lê Hoàng Nam",
    tienNo: 0,
    tongHoaDon: 30000,
    ghiChu: "-",
    trangThai: "Đã thanh toán",
    products: [
      {
        tenSanPham: "Bánh Oreo",
        donVi: "Gói",
        soLuong: 2,
        giaVon: 10000,
        donGiaBan: 15000,
        thanhTien: 30000,
      },
    ],
  },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let mockLatestOrderCode = "DH001";
let mockLatestReceiptCode = "NK001";
let mockLatestStayCode = "LT00000";
let mockLatestBookingCode = "BK00000";
const foldText = (v) =>
  String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();

const getTodayInputDate = () => {
  return toLocalDateTimeString_(new Date()).split(" ")[0];
};

const incrementOrderCode = (value, defaultVal) => {
  const raw = String(value ?? "").trim();
  if (!raw) return defaultVal || "01";

  const m = raw.match(/^(.*?)(\d+)$/);
  if (!m) return raw + "1";

  const prefix = m[1];
  const digits = m[2];
  const next = String(parseInt(digits, 10) + 1).padStart(digits.length, "0");
  return prefix + next;
};

const normalizeProductType = (item) => {
  const rawType = String(item?.loai || "").trim().toUpperCase();
  if (rawType) return rawType;
  const group = foldText(item?.nhomHang);
  if (
    group.includes("phong") ||
    group.includes("room")
  )
    return "ROOM";
  if (
    group.includes("dich vu") ||
    group.includes("service")
  )
    return "DICH_VU";
  if (group.includes("goi") || group.includes("the tai khoan"))
    return "GOI_DICH_VU";
  if (
    group.includes("do an") ||
    group.includes("thuc uong") ||
    group.includes("nuoc") ||
    group.includes("banh")
  )
    return "MENU";
  return "VAT_TU";
};

const toIsoStringOrNow = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return toLocalDateTimeString_(new Date());
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return toLocalDateTimeString_(new Date());
  return toLocalDateTimeString_(parsed);
};

const isImmutableSession = (status) => {
  const s = String(status || "").trim().toUpperCase();
  return s === "CHECKED_OUT" || s === "CANCELLED";
};

const diffHoursRoundedUp = (startAt, endAt) => {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
  return Math.max(1, Math.ceil((end - start) / (60 * 60 * 1000)));
};

const diffNightsRoundedUp = (startAt, endAt) => {
  const start = new Date(startAt).getTime();
  const end = new Date(endAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 1;
  return Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000)));
};

const parseIsoStringOrNull = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return null;

  if (raw.indexOf("T") > -1 || raw.indexOf("Z") > -1) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : toVnDateTimeString_(d);
  }

  const safariSafeStr = raw.replace(/-/g, '/');
  let d2 = new Date(safariSafeStr);
  if (isNaN(d2.getTime())) {
    d2 = new Date(raw);
  }

  return isNaN(d2.getTime()) ? null : toVnDateTimeString_(d2);
};

const toMsOrNaN = (value) => {
  const ms = new Date(value || "").getTime();
  return Number.isFinite(ms) ? ms : Number.NaN;
};

const isActiveStayForSchedule = (stay) => {
  const status = String(stay?.trangThaiPhien || "").trim().toUpperCase();
  return status === STAY_STATUS.BOOKED || status === STAY_STATUS.IN_HOUSE;
};

const getStayStartAt = (stay) => stay?.batDauAt || "";
const getStayExpectedEndAt = (stay) => stay?.ketThucDuKien || "";
const getStayActualEndAt = (stay) => stay?.ketThucThucTe || "";

const normalizeBedRecord = (room = {}) => {
  room.maGiuong = String(room.maGiuong || "").trim();
  room.tenGiuong = String(room.tenGiuong || "").trim();
  room.loaiGiuong = String(room.loaiGiuong || "").trim();
  room.trangThaiGiuong = String(room.trangThaiGiuong || "").trim();
  room.soKhachToiDa = Math.max(Number(room.soKhachToiDa || 1), 1);
  room.updatedAt = String(room.updatedAt || "");
  return room;
};

const normalizeSessionRecord = (stay = {}) => {
  stay.maPhien = String(stay.maPhien || "").trim();
  stay.maLichHen = String(stay.maLichHen || "").trim();
  stay.maTienTrinh = String(stay.maTienTrinh || "").trim();
  stay.maGiuong = String(stay.maGiuong || "").trim();
  stay.batDauAt = String(stay.batDauAt || "").trim();
  stay.ketThucDuKien = String(stay.ketThucDuKien || "").trim();
  stay.ketThucThucTe = String(stay.ketThucThucTe || "").trim();
  stay.trangThaiPhien = String(stay.trangThaiPhien || "").trim();
  stay.giaGoi = Math.max(
    Number(
      stay.giaGoi || stay.giaBanGoi || 0,
    ),
    0,
  );
  stay.tienGoi = Math.max(Number(stay.tienGoi ?? 0), 0);
  if (!stay.thoiLuongPhut) {
    const startMs = parseVnDateTimeToMs_(stay.batDauAt);
    const endMs = parseVnDateTimeToMs_(stay.ketThucDuKien || stay.ketThucThucTe || "");
    if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
      stay.thoiLuongPhut = Math.max(15, Math.round((endMs - startMs) / 60000));
    } else {
      stay.thoiLuongPhut = Math.max(Number(stay.thoiLuongPhut || 0), 0);
    }
  }
  stay.tienDichVu = Math.max(Number(stay.tienDichVu || 0), 0);
  stay.tongBuoiCombo = Math.max(Number(stay.tongBuoiCombo || 1), 1);
  stay.buoiThu = Math.max(Number(stay.buoiThu || 1), 1);
  stay.tongThanhToan = Math.max(
    Number(stay.tongThanhToan || stay.tienGoi + stay.tienDichVu || 0),
    0,
  );
  const satisfactionScore = Math.round(Number(stay.diemHaiLongKhach));
  stay.diemHaiLongKhach =
    Number.isFinite(satisfactionScore) && satisfactionScore >= 1 && satisfactionScore <= 5
      ? satisfactionScore
      : "";
  return stay;
};

const getTreatmentPackageCatalog = () =>
  MOCK_TREATMENT_PACKAGES.filter((item) => item?.active !== false).map((item) => {
    const service =
      MOCK_TREATMENT_SERVICES.find(
        (svc) => String(svc.maDv || "").trim() === String(item.maDv || "").trim(),
      ) || {};
    return {
      ...item,
      tenDichVu: String(service.lop2DichVu || "").trim(),
      thoiLuongPhut: Math.max(Number(service.thoiLuongPhut || 0), 0),
      vungTriLieu: String(service.vungTriLieu || "").trim(),
      giaGoi: Math.max(Number(item.giaBanGoi || item.giaGoi || 0), 0),
    };
  });

const resolveTreatmentPackage = (payload = {}, fallbackStay = null) => {
  const list = getTreatmentPackageCatalog();
  const requestedMaGoi = String(
    payload.maGoi || fallbackStay?.maGoi || "",
  ).trim();
  if (!requestedMaGoi) return list[0] || null;
  return (
    list.find((item) => String(item.maGoi || "").trim() === requestedMaGoi) ||
    list[0] ||
    null
  );
};

const resolveStayTimeRange = (stay) => {
  const startMs = toMsOrNaN(getStayStartAt(stay));
  if (!Number.isFinite(startMs)) return null;
  const rawEndMs = toMsOrNaN(getStayExpectedEndAt(stay) || getStayActualEndAt(stay));
  const endMs = Number.isFinite(rawEndMs) && rawEndMs > startMs
    ? rawEndMs
    : startMs + 30 * 60 * 1000;
  return { startMs, endMs };
};

const hasTimeOverlap = (startA, endA, startB, endB) =>
  Number.isFinite(startA) &&
  Number.isFinite(endA) &&
  Number.isFinite(startB) &&
  Number.isFinite(endB) &&
  startA < endB &&
  endA > startB;

const findScheduleConflict = ({
  stays = [],
  maGiuong = "",
  maNhanVien = "",
  startMs,
  endMs,
  ignoreMaPhien = "",
}) => {
  const bedCode = String(maGiuong || "").trim();
  const staffCode = String(maNhanVien || "").trim();
  const ignoreCode = String(ignoreMaPhien || "").trim();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) return null;

  for (const stay of stays) {
    if (!isActiveStayForSchedule(stay)) continue;
    const stayCode = String(stay.maPhien || "").trim();
    if (ignoreCode && stayCode === ignoreCode) continue;
    const range = resolveStayTimeRange(stay);
    if (!range) continue;
    if (!hasTimeOverlap(startMs, endMs, range.startMs, range.endMs)) continue;

    const stayRoom = String(stay.maGiuong || "").trim();
    const stayStaff = String(stay.maNhanVien || "").trim();
    if (bedCode && stayRoom && stayRoom === bedCode) {
      return {
        type: "ROOM",
        stay,
      };
    }
    if (staffCode && stayStaff && stayStaff === staffCode) {
      return {
        type: "STAFF",
        stay,
      };
    }
  }
  return null;
};

const buildScheduleConflictMessage = (conflict) => {
  if (!conflict?.stay) return "Khung giờ đang bị trùng lịch.";
  const stayCode = String(conflict.stay.maPhien || "").trim() || "(không mã)";
  const customer = String(conflict.stay.tenKhach || "").trim() || "khách khác";
  if (conflict.type === "STAFF") {
    return `Nhân viên đã có lịch trùng khung giờ với phiên ${stayCode} (${customer}).`;
  }
  return `Giường đã có lịch trùng khung giờ với phiên ${stayCode} (${customer}).`;
};

const nextStayCode = () => {
  const next = nextSessionCodeFromRows(MOCK_STAYS, "maPhien", "LT", "LT00001");
  mockLatestStayCode = next;
  return next;
};

const nextBookingCode = () => {
  const next = nextSessionCodeFromRows(MOCK_STAYS, "maLichHen", "BK", "BK00001");
  mockLatestBookingCode = next;
  return next;
};

const getPackageSessionTotal = (pkg = {}) =>
  Math.max(
    Number(pkg?.soBuoiQuyDoi || 0) ||
      Number(pkg?.soBuoiMua || 0) + Number(pkg?.soBuoiTang || 0) ||
      1,
    1,
  );

const buildProgressKey = ({ tenKhach = "", soDienThoai = "", maGoi = "" } = {}) => {
  const phone = String(soDienThoai || "").replace(/[^\d]/g, "");
  const name = foldText(tenKhach || "");
  const pkg = String(maGoi || "").trim();
  return `${phone || name}||${pkg}`;
};

const nextProgressCode = () =>
  nextTreatmentProgressCodeFromRows(MOCK_STAYS);

const getProgressTrackedStatuses = () =>
  [STAY_STATUS.BOOKED, STAY_STATUS.IN_HOUSE, STAY_STATUS.CHECKED_OUT];

const resolveProgressMeta = ({
  payload = {},
  selectedPackage = null,
  existingStay = null,
}) => {
  const totalSessions = getPackageSessionTotal(selectedPackage);
  const forceNewProgress = payload?.forceNewProgress === true;
  if (forceNewProgress) {
    return {
      maTienTrinh: nextProgressCode(),
      tongBuoiCombo: Math.max(totalSessions, 1),
      buoiThu: 1,
      isFirstCharge: true,
    };
  }
  const explicitProgressCode = String(
    payload.maTienTrinh || existingStay?.maTienTrinh || "",
  ).trim();
  if (explicitProgressCode) {
    const related = MOCK_STAYS.filter(
      (stay) => String(stay.maTienTrinh || "").trim() === explicitProgressCode,
    );
    const counted = related.filter((stay) =>
      getProgressTrackedStatuses().includes(String(stay.trangThaiPhien || "").trim().toUpperCase()),
    );
    return {
      maTienTrinh: explicitProgressCode,
      tongBuoiCombo: Math.max(Number(existingStay?.tongBuoiCombo || totalSessions || 1), 1),
      buoiThu: existingStay?.buoiThu
        ? Math.max(Number(existingStay.buoiThu || 1), 1)
        : counted.length + 1,
      isFirstCharge: counted.length === 0,
    };
  }

  if (totalSessions <= 1) {
    return {
      maTienTrinh: nextProgressCode(),
      tongBuoiCombo: 1,
      buoiThu: 1,
      isFirstCharge: true,
    };
  }

  const progressKey = buildProgressKey({
    tenKhach: payload.tenKhach,
    soDienThoai: payload.soDienThoai,
    maGoi: selectedPackage?.maGoi,
  });
  const candidates = MOCK_STAYS
    .filter((stay) => {
      if (String(stay.maGoi || "").trim() !== String(selectedPackage?.maGoi || "").trim()) return false;
      if (buildProgressKey(stay) !== progressKey) return false;
      if (!String(stay.maTienTrinh || "").trim()) return false;
      return true;
    })
    .sort(
      (a, b) =>
        parseVnDateTimeToMs_(getStayStartAt(b)) - parseVnDateTimeToMs_(getStayStartAt(a)),
    );
  for (const stay of candidates) {
    const progressCode = String(stay.maTienTrinh || "").trim();
    const related = MOCK_STAYS.filter(
      (item) => String(item.maTienTrinh || "").trim() === progressCode,
    );
    const counted = related.filter((item) =>
      getProgressTrackedStatuses().includes(String(item.trangThaiPhien || "").trim().toUpperCase()),
    );
    const targetTotal = Math.max(Number(stay.tongBuoiCombo || totalSessions || 1), 1);
    if (counted.length < targetTotal) {
      return {
        maTienTrinh: progressCode,
        tongBuoiCombo: targetTotal,
        buoiThu: counted.length + 1,
        isFirstCharge: counted.length === 0,
      };
    }
  }
  return {
    maTienTrinh: nextProgressCode(),
    tongBuoiCombo: totalSessions,
    buoiThu: 1,
    isFirstCharge: true,
  };
};

const ensureCatalogItemIdentity = (item, idx) => {
  const tenSanPham = String(item?.tenSanPham || "").trim();
  const donVi = String(item?.donVi || "").trim();
  const maSanPham =
    String(item?.maSanPham || "").trim() ||
    `SP${String(idx + 1).padStart(4, "0")}`;
  return {
    ...item,
    maSanPham,
    tenSanPham,
    donVi,
    loai: normalizeProductType(item),
    theoDoiTonKho: item?.theoDoiTonKho !== false,
    active: item?.active !== false,
  };
};

const buildStaySnapshot = (stay) => {
  const rawTienGoi = Math.max(Number(stay?.tienGoi ?? 0), 0);
  normalizeSessionRecord(stay);
  stay.tienGoi = rawTienGoi;
  const serviceItems = MOCK_STAY_SERVICE_ITEMS.filter(
    (x) => String(x.maPhien) === String(stay.maPhien),
  );
  const tienDichVu = serviceItems.reduce(
    (sum, item) => sum + Number(item.thanhTien || 0),
    0,
  );
  const tongThanhToan = rawTienGoi + tienDichVu;
  return {
    ...stay,
    maPhien: String(stay.maPhien || "").trim(),
    maLichHen: String(stay.maLichHen || "").trim(),
    maTienTrinh: String(stay.maTienTrinh || "").trim(),
    maGiuong: String(stay.maGiuong || "").trim(),
    trangThaiPhien: String(stay.trangThaiPhien || "").trim(),
    batDauAt: getStayStartAt(stay),
    ketThucDuKien: getStayExpectedEndAt(stay),
    ketThucThucTe: getStayActualEndAt(stay),
    maGoi: String(stay.maGoi || "").trim(),
    tenGoi: String(stay.tenGoi || "").trim(),
    tongBuoiCombo: Math.max(Number(stay.tongBuoiCombo || 1), 1),
    buoiThu: Math.max(Number(stay.buoiThu || 1), 1),
    buoiConLai: Math.max(
      Math.max(Number(stay.tongBuoiCombo || 1), 1) - Math.max(Number(stay.buoiThu || 1), 1),
      0,
    ),
    maDv: String(stay.maDv || "").trim(),
    tenDichVu: String(stay.tenDichVu || "").trim(),
    thoiLuongPhut: Math.max(Number(stay.thoiLuongPhut || 0), 0),
    giaGoi: Math.max(Number(stay.giaGoi || 0), 0),
    tienGoi: Math.max(Number(stay.tienGoi || 0), 0),
    tienDichVu,
    tongThanhToan,
    serviceItems: serviceItems.map((item) =>
      attachServiceItemIdentity({
        ...item,
        maPhien: String(item.maPhien || "").trim(),
      }),
    ),
  };
};

const cloneMockValue = (value) => JSON.parse(JSON.stringify(value));

const buildServiceItemIdentity = (item = {}) => {
  const maPhien = String(item.maPhien || "").trim();
  const thoiGian = String(item.thoiGian || "").trim();
  const maSanPham = String(item.maSanPham || "").trim();
  const tenSanPham = foldText(item.tenSanPham || "");
  return `svc|${maPhien}|${thoiGian}|${maSanPham || tenSanPham}`;
};

const attachServiceItemIdentity = (item = {}) => ({
  ...item,
  serviceItemId: buildServiceItemIdentity(item),
});

const snapshotLocalSpaState = () => ({
  rooms: cloneMockValue(MOCK_ROOMS),
  stays: cloneMockValue(MOCK_STAYS),
  serviceItems: cloneMockValue(MOCK_STAY_SERVICE_ITEMS),
  latestStayCode: mockLatestStayCode,
  latestBookingCode: mockLatestBookingCode,
});

const restoreLocalSpaState = (snapshot) => {
  if (!snapshot) return;
  MOCK_ROOMS.splice(0, MOCK_ROOMS.length, ...(snapshot.rooms || []));
  MOCK_STAYS.splice(0, MOCK_STAYS.length, ...(snapshot.stays || []));
  MOCK_STAY_SERVICE_ITEMS.splice(
    0,
    MOCK_STAY_SERVICE_ITEMS.length,
    ...(snapshot.serviceItems || []),
  );
  mockLatestStayCode = String(snapshot.latestStayCode || mockLatestStayCode);
  mockLatestBookingCode = String(
    snapshot.latestBookingCode || mockLatestBookingCode,
  );
};

const resolveServiceItemTarget = (serviceItems, payload = {}) => {
  const serviceItemId = String(payload.serviceItemId || "").trim();
  if (serviceItemId) {
    return (
      serviceItems.find(
        (item) => buildServiceItemIdentity(item) === serviceItemId,
      ) || null
    );
  }
  const index = Number(payload.index);
  if (!Number.isFinite(index) || index < 0 || index >= serviceItems.length) {
    return null;
  }
  return serviceItems[index] || null;
};

const helloServer = async () => {
  await sleep(300);
  return "Hello from Local MOCK Server! Sheet: account";
};

const login = async (email, password) => {
  await sleep(500);
  const user = MOCK_ACCOUNTS.find(
    (u) => u.email === email && u.password === password,
  );
  if (user) {
    const { password: _, ...data } = user;
    return {
      success: true,
      data,
      message: "Đăng nhập thành công! (Mock)",
    };
  }
  return {
    success: false,
    data: null,
    message: "Email hoặc mật khẩu không đúng! (Mock)",
  };
};

const getUserInfo = async (email) => {
  await sleep(300);
  const user = MOCK_ACCOUNTS.find((u) => u.email === email);
  if (user) return { success: true, data: user };
  return { success: false, message: "Không tìm thấy tài khoản (Mock)" };
};

const getDemoAccounts = async () => {
  await sleep(300);
  return {
    success: true,
    data: MOCK_ACCOUNTS.map((a) => ({
      email: a.email,
      password: a.password,
      role: a.role,
      name: a.name,
    })),
  };
};

const getGlobalNotice = async () => {
  await sleep(200);
  return [
    {
      base: "",
      message: "Hệ thống sẽ có bản cập nhật mới 1.2",
      level: "info",
      version: "1.0",
      changelog:
        "• Thêm chức năng thông báo toàn hệ thống\n• Sửa lỗi đăng nhập\n• Cải thiện hiệu suất tải trang",
    },
  ];
};

const initSpaSheets = async () => {
  await sleep(120);
  return {
    success: true,
    message: "Mock đã khởi tạo đầy đủ sheet spa.",
    data: {
      sheets: [
        "DON_HANG",
        "NHAP_HANG",
        "TIEN_TRINH_KHACH",
        "SAN_PHAM",
        "QUAN_LY_KHO",
        "BANK",
        "QUEUE",
        "DM_PHAC_DO",
        "DM_DICH_VU",
        "DM_GOI_DIEU_TRI",
        "DM_SAN_PHAM_DUOC_LIEU",
        "CT_BAN",
        "THEO_DOI_SU_DUNG_GOI",
        "BAO_CAO_NGAY_THANG_NAM",
        "GIUONG_TRI_LIEU",
        "PHIEN_DICH_VU",
        "NHAN_VIEN",
        "CHI_TIET_DICH_VU",
      ],
    },
  };
};

const simplifySpaSheets = async () => {
  await sleep(80);
  return {
    success: true,
    message: "Mock đã dọn sheet thừa.",
    data: { removedSheets: [] },
  };
};

const loadSpaPresetTlcData = async () => {
  await sleep(120);
  return {
    success: true,
    message: "Mock đã nạp preset TLC.",
  };
};

const getSpaKpiReport = async (_filters = {}) => {
  await sleep(150);
  return {
    success: true,
    data: {
      summary: {
        doanhThuThuan: 0,
        thuChi: 0,
        khachMoi: 0,
        khachQuayLai: 0,
      },
      charts: {
        luongKhachTheoGio: [],
        doanhThuTheoGio: [],
        doanhThuTheoNgay: [],
        doanhThuTheoThu: [],
      },
      topBanNhieu: {
        dichVu: [],
        goiDichVu: [],
        theTaiKhoan: [],
      },
    },
  };
};

const getNextOrderFormDefaults = async () => {
  await sleep(150);
  return {
    success: true,
    data: {
      maPhieu: incrementOrderCode(mockLatestOrderCode, "DH00001"),
      ngayBan: getTodayInputDate(),
    },
  };
};

const getNextInventoryReceiptDefaults = async () => {
  await sleep(150);
  return {
    success: true,
    data: {
      maPhieu: incrementOrderCode(mockLatestReceiptCode, "PN00001"),
      ngayNhap: getTodayInputDate(),
    },
  };
};

const getProductCatalog = async () => {
  await sleep(150);
  const data = MOCK_PRODUCTS.map((item, idx) =>
    ensureCatalogItemIdentity(item, idx),
  ).filter(item => String(item.active || "").trim() !== "0" && String(item.active || "").trim().toUpperCase() !== "FALSE" && String(item.active || "").trim().toUpperCase() !== "INACTIVE");
  data.forEach((item, idx) => {
    MOCK_PRODUCTS[idx] = item;
  });
  return {
    success: true,
    data,
  };
};

const getBankConfig = async () => {
  await sleep(120);
  return {
    success: true,
    data: MOCK_BANK_CONFIG,
  };
};

const getRooms = async () => {
  await sleep(120);
  return {
    success: true,
    data: [...MOCK_ROOMS]
      .sort((a, b) =>
        String(a.maGiuong || "").localeCompare(String(b.maGiuong || ""), "vi"),
      )
      .map((room) => normalizeBedRecord({ ...room })),
  };
};

const loginWithDeviceToken = async (_deviceToken, appScope = "") => {
  await sleep(180);
  return {
    success: true,
    data: {
      email: MOCK_ACCOUNTS[0].email,
      name: MOCK_ACCOUNTS[0].name,
      role: MOCK_ACCOUNTS[0].role,
      department: MOCK_ACCOUNTS[0].department,
      appScope: appScope || "spa",
      deviceToken: "mock-device-token",
    },
    message: "Đăng nhập bằng token (Mock)",
  };
};

const revokeDeviceToken = async (_deviceToken, _appScope = "") => {
  await sleep(120);
  return { success: true, message: "Thu hồi token thành công (Mock)" };
};

const getSpaStaff = async () => {
  await sleep(120);
  return {
    success: true,
    data: MOCK_STAFF.filter(staff => String(staff.trangThai || "").trim() !== "Nghỉ việc").map((staff) => ({ ...staff })),
  };
};

const normalizeStaffRecord = (staff = {}) => ({
  maNhanVien: String(staff.maNhanVien || "").trim(),
  tenNhanVien: String(staff.tenNhanVien || "").trim(),
  chucVu: String(staff.chucVu || "").trim(),
  soDienThoai: String(staff.soDienThoai || "").trim(),
  ngayVaoLam: String(staff.ngayVaoLam || "").trim(),
  trangThai: String(staff.trangThai || "Đang làm việc").trim(),
  caLamViec: String(staff.caLamViec || "SANG,CHIEU,TOI").trim(),
  ghiChu: String(staff.ghiChu || "").trim(),
  luongCoBanThang: Math.max(Number(staff.luongCoBanThang || 0), 0),
  tyLeThuongDichVu:
    staff.tyLeThuongDichVu === "" || staff.tyLeThuongDichVu === undefined
      ? ""
      : Math.min(Math.max(Number(staff.tyLeThuongDichVu || 0), 0), 100),
});

const suggestNextStaffCode = (staffs = []) => {
  let max = 0;
  staffs.forEach((staff) => {
    const match = String(staff.maNhanVien || "").match(/NV(\d+)/i);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return `NV${String(max + 1).padStart(6, "0")}`;
};

const removeStaffCodeFromScheduleList = (csv, staffCode) => {
  if (!staffCode) return String(csv || "").trim();
  return String(csv || "")
    .split(",")
    .map((x) => String(x || "").trim())
    .filter((x) => x && x !== staffCode)
    .join(",");
};

const purgeStaffFromSchedules = (staffCode) => {
  MOCK_STAFF_SCHEDULES = MOCK_STAFF_SCHEDULES.map((row) => ({
    ...row,
    caSang: removeStaffCodeFromScheduleList(row.caSang, staffCode),
    caChieu: removeStaffCodeFromScheduleList(row.caChieu, staffCode),
    caToi: removeStaffCodeFromScheduleList(row.caToi, staffCode),
  }));
};

const purgeStaffFromAttendance = (staffCode) => {
  for (let i = MOCK_STAFF_ATTENDANCE.length - 1; i >= 0; i -= 1) {
    if (String(MOCK_STAFF_ATTENDANCE[i]?.maNhanVien || "").trim() === staffCode) {
      MOCK_STAFF_ATTENDANCE.splice(i, 1);
    }
  }
};

const purgeStaffFromChecklists = (staffCode) => {
  for (let i = MOCK_STAFF_CHECKLISTS.length - 1; i >= 0; i -= 1) {
    if (String(MOCK_STAFF_CHECKLISTS[i]?.maNhanVien || "").trim() === staffCode) {
      MOCK_STAFF_CHECKLISTS.splice(i, 1);
    }
  }
};

const purgeStaffFromViolations = (staffCode) => {
  for (let i = MOCK_STAFF_VIOLATIONS.length - 1; i >= 0; i -= 1) {
    if (String(MOCK_STAFF_VIOLATIONS[i]?.maNhanVien || "").trim() === staffCode) {
      MOCK_STAFF_VIOLATIONS.splice(i, 1);
    }
  }
};

const purgeStaffFromLeaves = (staffCode) => {
  for (let i = MOCK_STAFF_LEAVES.length - 1; i >= 0; i -= 1) {
    if (String(MOCK_STAFF_LEAVES[i]?.maNhanVien || "").trim() === staffCode) {
      MOCK_STAFF_LEAVES.splice(i, 1);
    }
  }
};

const purgeStaffFromTrainings = (staffCode) => {
  for (let i = MOCK_STAFF_TRAININGS.length - 1; i >= 0; i -= 1) {
    if (String(MOCK_STAFF_TRAININGS[i]?.maNhanVien || "").trim() === staffCode) {
      MOCK_STAFF_TRAININGS.splice(i, 1);
    }
  }
};

const purgeStaffFromPayroll = (staffCode) => {
  for (let i = MOCK_STAFF_PAYROLL.length - 1; i >= 0; i -= 1) {
    if (String(MOCK_STAFF_PAYROLL[i]?.maNhanVien || "").trim() === staffCode) {
      MOCK_STAFF_PAYROLL.splice(i, 1);
    }
  }
};

const countActiveStaysForStaff = (staffCode) =>
  MOCK_STAYS.filter((stay) => {
    if (String(stay.maNhanVien || "").trim() !== staffCode) return false;
    const status = String(stay.trangThaiPhien || "").trim().toUpperCase();
    return status === STAY_STATUS.BOOKED || status === STAY_STATUS.IN_HOUSE;
  }).length;

const createSpaStaff = async (payload = {}) => {
  await sleep(140);
  const maNhanVien = String(payload.maNhanVien || "").trim() || suggestNextStaffCode(MOCK_STAFF);
  if (MOCK_STAFF.some((item) => String(item.maNhanVien || "").trim() === maNhanVien)) {
    return { success: false, message: `Mã nhân viên ${maNhanVien} đã tồn tại.` };
  }
  const nextStaff = normalizeStaffRecord({
    maNhanVien,
    tenNhanVien: String(payload.tenNhanVien || "").trim(),
    chucVu: payload.chucVu,
    soDienThoai: payload.soDienThoai,
    ngayVaoLam: payload.ngayVaoLam,
    trangThai: payload.trangThai,
    caLamViec: payload.caLamViec,
    ghiChu: payload.ghiChu,
    luongCoBanThang: payload.luongCoBanThang,
    tyLeThuongDichVu: payload.tyLeThuongDichVu,
  });
  MOCK_STAFF.push(nextStaff);
  bumpLocalSyncVersion();
  return { success: true, message: "Đã thêm nhân viên.", data: nextStaff };
};

const updateSpaStaff = async (payload = {}) => {
  await sleep(140);
  const maNhanVien = String(payload.maNhanVien || "").trim();
  if (!maNhanVien) return { success: false, message: "Không tìm thấy nhân viên." };
  const staff = MOCK_STAFF.find((x) => String(x.maNhanVien || "").trim() === maNhanVien);
  if (!staff) return { success: false, message: "Không tìm thấy nhân viên." };
  if (payload.tenNhanVien !== undefined) {
    staff.tenNhanVien = String(payload.tenNhanVien || "").trim();
  }
  if (payload.chucVu !== undefined) staff.chucVu = String(payload.chucVu || "").trim();
  if (payload.soDienThoai !== undefined) staff.soDienThoai = String(payload.soDienThoai || "").trim();
  if (payload.ngayVaoLam !== undefined) staff.ngayVaoLam = String(payload.ngayVaoLam || "").trim();
  staff.trangThai = String(payload.trangThai || staff.trangThai || "Đang làm việc").trim();
  if (payload.caLamViec !== undefined) {
    staff.caLamViec = String(payload.caLamViec || "").trim();
  }
  if (payload.ghiChu !== undefined) {
    staff.ghiChu = String(payload.ghiChu || "").trim();
  }
  if (payload.luongCoBanThang !== undefined) {
    staff.luongCoBanThang = Math.max(Number(payload.luongCoBanThang || 0), 0);
  }
  if (payload.tyLeThuongDichVu !== undefined) {
    staff.tyLeThuongDichVu =
      payload.tyLeThuongDichVu === "" || payload.tyLeThuongDichVu === undefined
        ? ""
        : Math.min(Math.max(Number(payload.tyLeThuongDichVu || 0), 0), 100);
  }
  bumpLocalSyncVersion();
  return { success: true, message: "Đã cập nhật nhân viên.", data: normalizeStaffRecord(staff) };
};

const deleteSpaStaff = async (payload = {}) => {
  await sleep(140);
  const maNhanVien = String(payload.maNhanVien || "").trim();
  if (!maNhanVien) return { success: false, message: "Không tìm thấy nhân viên." };
  const idx = MOCK_STAFF.findIndex((x) => String(x.maNhanVien || "").trim() === maNhanVien);
  if (idx < 0) return { success: false, message: "Không tìm thấy nhân viên." };
  if (countActiveStaysForStaff(maNhanVien) > 0) {
    return {
      success: false,
      message: "Nhân viên đang có lịch hẹn hoặc phiên mở, không thể xóa.",
    };
  }
  MOCK_STAFF[idx].trangThai = "Nghỉ việc";
  bumpLocalSyncVersion();
  return { success: true, message: "Đã xóa nhân viên." };
};

let MOCK_STAFF_SCHEDULES = [];
let MOCK_STAFF_ATTENDANCE = [];
let MOCK_STAFF_CHECKLISTS = [];
let MOCK_STAFF_VIOLATIONS = [];
let MOCK_STAFF_LEAVES = [];
let MOCK_STAFF_TRAININGS = [];
let MOCK_STAFF_PAYROLL = [];

const normalizeLocalAttendanceDateKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
};

const normalizeLocalAttendanceShiftCode = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "SANG" || raw.includes("SANG")) return "SANG";
  if (raw === "CHIEU" || raw.includes("CHIEU")) return "CHIEU";
  if (raw === "TOI" || raw.includes("TOI")) return "TOI";
  return "";
};

const mapLocalAttendanceRow = (row = {}) => ({
  maNhanVien: String(row.maNhanVien || "").trim(),
  ngay: normalizeLocalAttendanceDateKey(row.ngay),
  checkInAt: String(row.checkInAt || "").trim(),
  checkOutAt: String(row.checkOutAt || "").trim(),
  caDuKien: normalizeLocalAttendanceShiftCode(row.caDuKien),
  trangThai: String(row.trangThai || "").trim(),
  ghiChu: String(row.ghiChu || "").trim(),
  updatedAt: String(row.updatedAt || "").trim(),
});

const findLocalAttendanceIndex = (maNhanVien, ngay, caDuKien) =>
  MOCK_STAFF_ATTENDANCE.findIndex(
    (row) =>
      String(row.maNhanVien || "").trim() === String(maNhanVien || "").trim() &&
      normalizeLocalAttendanceDateKey(row.ngay) === normalizeLocalAttendanceDateKey(ngay) &&
      normalizeLocalAttendanceShiftCode(row.caDuKien) === normalizeLocalAttendanceShiftCode(caDuKien),
  );

const getSpaStaffSchedules = async () => {
  await sleep(120);
  return {
    success: true,
    data: MOCK_STAFF_SCHEDULES.map((row) => ({ ...row })),
  };
};

const updateSpaStaffSchedules = async (payload = {}) => {
  await sleep(200);
  const updates = Array.isArray(payload?.updates) ? payload.updates : [];
  const byDate = new Map(
    MOCK_STAFF_SCHEDULES.map((row) => [String(row.ngay || "").trim(), { ...row }]),
  );
  updates.forEach((up) => {
    const ngay = String(up?.ngay || "").trim();
    if (!ngay) return;
    byDate.set(ngay, {
      ngay,
      caSang: String(up?.caSang || "").trim(),
      caChieu: String(up?.caChieu || "").trim(),
      caToi: String(up?.caToi || "").trim(),
    });
  });
  MOCK_STAFF_SCHEDULES = Array.from(byDate.values()).sort((a, b) =>
    String(a.ngay).localeCompare(String(b.ngay)),
  );
  return {
    success: true,
    data: MOCK_STAFF_SCHEDULES.map((row) => ({ ...row })),
  };
};

const getSpaAttendance = async (filters = {}) => {
  await sleep(120);
  const ngayKey = normalizeLocalAttendanceDateKey(filters.ngay);
  const fromKey = normalizeLocalAttendanceDateKey(filters.tuNgay || filters.fromDate);
  const toKey = normalizeLocalAttendanceDateKey(filters.denNgay || filters.toDate);
  const staffCode = String(filters.maNhanVien || "").trim();
  const data = MOCK_STAFF_ATTENDANCE.map(mapLocalAttendanceRow)
    .filter((row) => {
      if (!row.maNhanVien || !row.ngay) return false;
      if (ngayKey && row.ngay !== ngayKey) return false;
      if (fromKey && row.ngay < fromKey) return false;
      if (toKey && row.ngay > toKey) return false;
      if (staffCode && row.maNhanVien !== staffCode) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.ngay !== b.ngay) return String(a.ngay).localeCompare(String(b.ngay));
      if (a.maNhanVien !== b.maNhanVien) {
        return String(a.maNhanVien).localeCompare(String(b.maNhanVien), "vi");
      }
      const order = { SANG: 1, CHIEU: 2, TOI: 3 };
      return (order[a.caDuKien] || 99) - (order[b.caDuKien] || 99);
    });
  return { success: true, data };
};

const recordSpaAttendance = async (payload = {}) => {
  await sleep(180);
  const action = String(payload.action || "").trim().toUpperCase();
  const maNhanVien = String(payload.maNhanVien || "").trim();
  const ngay = normalizeLocalAttendanceDateKey(payload.ngay || new Date());
  if (!maNhanVien) return { success: false, message: "Thiếu mã nhân viên." };
  if (!ngay) return { success: false, message: "Ngày chấm công không hợp lệ." };

  const caDuKien = normalizeLocalAttendanceShiftCode(payload.caDuKien);
  const nowIso = toLocalDateTimeString_(new Date());
  const nowTime = toLocalTimeString_(new Date());
  const index = findLocalAttendanceIndex(maNhanVien, ngay, caDuKien);
  let record =
    index >= 0
      ? { ...MOCK_STAFF_ATTENDANCE[index] }
      : {
          maNhanVien,
          ngay,
          checkInAt: "",
          checkOutAt: "",
          caDuKien,
          trangThai: "",
          ghiChu: "",
          updatedAt: nowIso,
        };

  if (action === "CHECK_IN") {
    record.checkInAt = String(payload.checkInAt || record.checkInAt || nowTime).trim();
    record.checkOutAt = "";
    record.caDuKien = caDuKien || normalizeLocalAttendanceShiftCode(record.caDuKien);
    record.trangThai = String(payload.trangThai || "Đang làm").trim();
    record.ghiChu = String(payload.ghiChu || record.ghiChu || "").trim();
  } else if (action === "CHECK_OUT") {
    record.checkOutAt = String(payload.checkOutAt || nowTime).trim();
    record.trangThai = String(payload.trangThai || "Đã ra ca").trim();
    if (payload.checkInAt) record.checkInAt = String(payload.checkInAt).trim();
    record.caDuKien = caDuKien || normalizeLocalAttendanceShiftCode(record.caDuKien);
    record.ghiChu = String(payload.ghiChu || record.ghiChu || "").trim();
  } else if (action === "MARK_ABSENT") {
    record.checkInAt = "";
    record.checkOutAt = "";
    record.caDuKien = caDuKien || normalizeLocalAttendanceShiftCode(record.caDuKien);
    record.trangThai = String(payload.trangThai || "Vắng").trim();
    record.ghiChu = String(payload.ghiChu || record.ghiChu || "").trim();
  } else if (action === "UPDATE_NOTE") {
    record.caDuKien = caDuKien || normalizeLocalAttendanceShiftCode(record.caDuKien);
    record.ghiChu = String(payload.ghiChu || "").trim();
  } else if (action === "UPDATE_TIMES") {
    record.caDuKien = caDuKien || normalizeLocalAttendanceShiftCode(record.caDuKien);
    if (payload.checkInAt !== undefined) record.checkInAt = String(payload.checkInAt).trim();
    if (payload.checkOutAt !== undefined) record.checkOutAt = String(payload.checkOutAt).trim();
    if (payload.trangThai !== undefined) record.trangThai = String(payload.trangThai).trim();
    if (payload.ghiChu !== undefined) record.ghiChu = String(payload.ghiChu).trim();
  } else if (action === "CLEAR_ABSENT") {
    if (index < 0) return { success: false, message: "Không tìm thấy bản ghi chấm công." };
    MOCK_STAFF_ATTENDANCE.splice(index, 1);
    bumpLocalSyncVersion();
    return { success: true, message: "Đã hủy đánh dấu vắng.", data: null };
  } else {
    return { success: false, message: "Thao tác chấm công không hợp lệ." };
  }

  record.updatedAt = nowIso;
  if (index >= 0) MOCK_STAFF_ATTENDANCE[index] = record;
  else MOCK_STAFF_ATTENDANCE.push(record);
  bumpLocalSyncVersion();
  return {
    success: true,
    message: action === "UPDATE_NOTE" ? "Đã lưu ghi chú." : "Đã lưu chấm công.",
    data: mapLocalAttendanceRow(record),
  };
};

const normalizeLocalChecklistType = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "DAU_CA" || raw.includes("DAU")) return "DAU_CA";
  if (raw === "CUOI_CA" || raw.includes("CUOI")) return "CUOI_CA";
  return "";
};

const mapLocalChecklistRow = (row = {}) => ({
  maNhanVien: String(row.maNhanVien || "").trim(),
  ngay: normalizeLocalAttendanceDateKey(row.ngay),
  caDuKien: normalizeLocalAttendanceShiftCode(row.caDuKien),
  loaiChecklist: normalizeLocalChecklistType(row.loaiChecklist),
  chucVu: String(row.chucVu || "").trim(),
  itemsJson: String(row.itemsJson || "").trim(),
  ghiChu: String(row.ghiChu || "").trim(),
  updatedAt: String(row.updatedAt || "").trim(),
});

const findLocalChecklistIndex = (maNhanVien, ngay, caDuKien, loaiChecklist) =>
  MOCK_STAFF_CHECKLISTS.findIndex(
    (row) =>
      String(row.maNhanVien || "").trim() === String(maNhanVien || "").trim() &&
      normalizeLocalAttendanceDateKey(row.ngay) === normalizeLocalAttendanceDateKey(ngay) &&
      normalizeLocalAttendanceShiftCode(row.caDuKien) ===
        normalizeLocalAttendanceShiftCode(caDuKien) &&
      normalizeLocalChecklistType(row.loaiChecklist) === normalizeLocalChecklistType(loaiChecklist),
  );

const getSpaShiftChecklists = async (filters = {}) => {
  await sleep(120);
  const ngayKey = normalizeLocalAttendanceDateKey(filters.ngay);
  const fromKey = normalizeLocalAttendanceDateKey(filters.tuNgay || filters.fromDate);
  const toKey = normalizeLocalAttendanceDateKey(filters.denNgay || filters.toDate);
  const staffCode = String(filters.maNhanVien || "").trim();
  const data = MOCK_STAFF_CHECKLISTS.map(mapLocalChecklistRow)
    .filter((row) => {
      if (!row.maNhanVien || !row.ngay) return false;
      if (ngayKey && row.ngay !== ngayKey) return false;
      if (fromKey && row.ngay < fromKey) return false;
      if (toKey && row.ngay > toKey) return false;
      if (staffCode && row.maNhanVien !== staffCode) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.ngay !== b.ngay) return String(a.ngay).localeCompare(String(b.ngay));
      if (a.maNhanVien !== b.maNhanVien) {
        return String(a.maNhanVien).localeCompare(String(b.maNhanVien), "vi");
      }
      const order = { SANG: 1, CHIEU: 2, TOI: 3 };
      const shiftDiff =
        (order[a.caDuKien] || 99) - (order[b.caDuKien] || 99);
      if (shiftDiff !== 0) return shiftDiff;
      return String(a.loaiChecklist).localeCompare(String(b.loaiChecklist));
    });
  return { success: true, data };
};

const saveSpaShiftChecklist = async (payload = {}) => {
  await sleep(180);
  const maNhanVien = String(payload.maNhanVien || "").trim();
  const ngay = normalizeLocalAttendanceDateKey(payload.ngay || new Date());
  const caDuKien = normalizeLocalAttendanceShiftCode(payload.caDuKien);
  const loaiChecklist = normalizeLocalChecklistType(payload.loaiChecklist);
  if (!maNhanVien) return { success: false, message: "Thiếu mã nhân viên." };
  if (!ngay) return { success: false, message: "Ngày checklist không hợp lệ." };
  if (!caDuKien) return { success: false, message: "Thiếu ca làm việc." };
  if (!loaiChecklist) return { success: false, message: "Thiếu loại checklist." };

  const nowIso = toLocalDateTimeString_(new Date());
  let itemsJson = String(payload.itemsJson || "").trim();
  if (!itemsJson && Array.isArray(payload.items)) {
    itemsJson = JSON.stringify(payload.items);
  }
  const index = findLocalChecklistIndex(maNhanVien, ngay, caDuKien, loaiChecklist);
  const record = {
    maNhanVien,
    ngay,
    caDuKien,
    loaiChecklist,
    chucVu: String(payload.chucVu || "").trim(),
    itemsJson,
    ghiChu: String(payload.ghiChu || "").trim(),
    updatedAt: nowIso,
  };
  if (index >= 0) MOCK_STAFF_CHECKLISTS[index] = record;
  else MOCK_STAFF_CHECKLISTS.push(record);
  bumpLocalSyncVersion();
  return {
    success: true,
    message: "Đã lưu checklist ca.",
    data: mapLocalChecklistRow(record),
  };
};

const normalizeLocalViolationLevel = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw === "NHAC_NHO" || raw.includes("NHAC")) return "NHAC_NHO";
  if (raw === "KHIEN_TRACH" || raw.includes("KHIEN")) return "KHIEN_TRACH";
  if (raw === "TRU_THUONG" || raw.includes("TRU")) return "TRU_THUONG";
  if (raw === "DINH_CHI" || raw.includes("DINH")) return "DINH_CHI";
  return "";
};

const normalizeLocalViolationStatus = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw || raw === "AP_DUNG" || raw.includes("AP_DUNG")) return "AP_DUNG";
  if (raw === "DA_HUY" || raw.includes("HUY")) return "DA_HUY";
  return "AP_DUNG";
};

const mapLocalViolationRow = (row = {}) => ({
  maViPham: String(row.maViPham || "").trim(),
  maNhanVien: String(row.maNhanVien || "").trim(),
  ngay: normalizeLocalAttendanceDateKey(row.ngay),
  capDo: normalizeLocalViolationLevel(row.capDo),
  noiDung: String(row.noiDung || "").trim(),
  mucTru: Math.max(Number(row.mucTru || 0), 0),
  trangThai: normalizeLocalViolationStatus(row.trangThai),
  ghiChu: String(row.ghiChu || "").trim(),
  updatedAt: String(row.updatedAt || "").trim(),
});

const findLocalViolationIndex = (maViPham) =>
  MOCK_STAFF_VIOLATIONS.findIndex(
    (row) => String(row.maViPham || "").trim() === String(maViPham || "").trim(),
  );

const suggestNextLocalViolationCode = () => {
  let max = 0;
  MOCK_STAFF_VIOLATIONS.forEach((row) => {
    const match = String(row.maViPham || "").match(/VP(\d+)/i);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return `VP${String(max + 1).padStart(6, "0")}`;
};

const getSpaStaffViolations = async (filters = {}) => {
  await sleep(120);
  const ngayKey = normalizeLocalAttendanceDateKey(filters.ngay);
  const fromKey = normalizeLocalAttendanceDateKey(filters.tuNgay || filters.fromDate);
  const toKey = normalizeLocalAttendanceDateKey(filters.denNgay || filters.toDate);
  const staffCode = String(filters.maNhanVien || "").trim();
  const data = MOCK_STAFF_VIOLATIONS.map(mapLocalViolationRow)
    .filter((row) => {
      if (!row.maViPham || !row.maNhanVien || !row.ngay) return false;
      if (ngayKey && row.ngay !== ngayKey) return false;
      if (fromKey && row.ngay < fromKey) return false;
      if (toKey && row.ngay > toKey) return false;
      if (staffCode && row.maNhanVien !== staffCode) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.ngay !== b.ngay) return String(b.ngay).localeCompare(String(a.ngay));
      return String(b.maViPham).localeCompare(String(a.maViPham));
    });
  return { success: true, data };
};

const saveSpaStaffViolation = async (payload = {}) => {
  await sleep(180);
  const maViPham = String(payload.maViPham || "").trim() || suggestNextLocalViolationCode();
  const maNhanVien = String(payload.maNhanVien || "").trim();
  const ngay = normalizeLocalAttendanceDateKey(payload.ngay || new Date());
  const capDo = normalizeLocalViolationLevel(payload.capDo);
  if (!maNhanVien) return { success: false, message: "Thiếu mã nhân viên." };
  if (!ngay) return { success: false, message: "Ngày vi phạm không hợp lệ." };
  if (!capDo) return { success: false, message: "Thiếu mức xử lý vi phạm." };

  const nowIso = toLocalDateTimeString_(new Date());
  const index = findLocalViolationIndex(maViPham);
  const record = {
    maViPham,
    maNhanVien,
    ngay,
    capDo,
    noiDung: String(payload.noiDung || "").trim(),
    mucTru: Math.max(Number(payload.mucTru || 0), 0),
    trangThai: normalizeLocalViolationStatus(payload.trangThai || "AP_DUNG"),
    ghiChu: String(payload.ghiChu || "").trim(),
    updatedAt: nowIso,
  };
  if (index >= 0) MOCK_STAFF_VIOLATIONS[index] = record;
  else MOCK_STAFF_VIOLATIONS.push(record);
  bumpLocalSyncVersion();
  return {
    success: true,
    message: "Đã lưu biên bản vi phạm.",
    data: mapLocalViolationRow(record),
  };
};

const cancelSpaStaffViolation = async (payload = {}) => {
  await sleep(140);
  const maViPham = String(payload.maViPham || "").trim();
  if (!maViPham) return { success: false, message: "Không tìm thấy biên bản vi phạm." };
  const index = findLocalViolationIndex(maViPham);
  if (index < 0) return { success: false, message: "Không tìm thấy biên bản vi phạm." };
  MOCK_STAFF_VIOLATIONS[index] = {
    ...MOCK_STAFF_VIOLATIONS[index],
    trangThai: "DA_HUY",
    updatedAt: toLocalDateTimeString_(new Date()),
  };
  bumpLocalSyncVersion();
  return {
    success: true,
    message: "Đã hủy biên bản vi phạm.",
    data: mapLocalViolationRow(MOCK_STAFF_VIOLATIONS[index]),
  };
};

const normalizeLocalLeaveStatus = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw || raw.includes("CHO")) return "CHO_DUYET";
  if (raw.includes("DUYET") || raw.includes("APPROV")) return "DA_DUYET";
  if (raw.includes("TU_CHOI") || raw.includes("REJECT")) return "TU_CHOI";
  if (raw.includes("HUY") || raw.includes("CANCEL")) return "DA_HUY";
  return "CHO_DUYET";
};

const mapLocalLeaveRow = (row = {}) => ({
  maDon: String(row.maDon || "").trim(),
  maNhanVien: String(row.maNhanVien || "").trim(),
  tuNgay: normalizeLocalAttendanceDateKey(row.tuNgay),
  denNgay: normalizeLocalAttendanceDateKey(row.denNgay),
  lyDo: String(row.lyDo || "").trim(),
  trangThai: normalizeLocalLeaveStatus(row.trangThai),
  ghiChu: String(row.ghiChu || "").trim(),
  updatedAt: String(row.updatedAt || "").trim(),
});

const leaveOverlapsLocalRange = (row, fromKey, toKey) => {
  const start = normalizeLocalAttendanceDateKey(row.tuNgay);
  const end = normalizeLocalAttendanceDateKey(row.denNgay);
  if (!start || !end) return false;
  if (fromKey && end < fromKey) return false;
  if (toKey && start > toKey) return false;
  return true;
};

const findLocalLeaveIndex = (maDon) =>
  MOCK_STAFF_LEAVES.findIndex((row) => String(row.maDon || "").trim() === String(maDon || "").trim());

const suggestNextLocalLeaveCode = () => {
  let max = 0;
  MOCK_STAFF_LEAVES.forEach((row) => {
    const match = String(row.maDon || "").match(/NP(\d+)/i);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return `NP${String(max + 1).padStart(6, "0")}`;
};

const getSpaStaffLeaveRequests = async (filters = {}) => {
  await sleep(120);
  const fromKey = normalizeLocalAttendanceDateKey(filters.tuNgay || filters.fromDate);
  const toKey = normalizeLocalAttendanceDateKey(filters.denNgay || filters.toDate);
  const staffCode = String(filters.maNhanVien || "").trim();
  const data = MOCK_STAFF_LEAVES.map(mapLocalLeaveRow)
    .filter((row) => {
      if (!row.maDon || !row.maNhanVien) return false;
      if (!leaveOverlapsLocalRange(row, fromKey, toKey)) return false;
      if (staffCode && row.maNhanVien !== staffCode) return false;
      return true;
    })
    .sort((a, b) => String(b.tuNgay).localeCompare(String(a.tuNgay)));
  return { success: true, data };
};

const saveSpaStaffLeaveRequest = async (payload = {}) => {
  await sleep(160);
  const maDon = String(payload.maDon || "").trim() || suggestNextLocalLeaveCode();
  const maNhanVien = String(payload.maNhanVien || "").trim();
  const tuNgay = normalizeLocalAttendanceDateKey(payload.tuNgay);
  const denNgay = normalizeLocalAttendanceDateKey(payload.denNgay);
  if (!maNhanVien) return { success: false, message: "Thiếu mã nhân viên." };
  if (!tuNgay || !denNgay) return { success: false, message: "Ngày nghỉ không hợp lệ." };
  const index = findLocalLeaveIndex(maDon);
  const record = {
    maDon,
    maNhanVien,
    tuNgay,
    denNgay,
    lyDo: String(payload.lyDo || "").trim(),
    trangThai: normalizeLocalLeaveStatus(payload.trangThai || "CHO_DUYET"),
    ghiChu: String(payload.ghiChu || "").trim(),
    updatedAt: toLocalDateTimeString_(new Date()),
  };
  if (index >= 0) MOCK_STAFF_LEAVES[index] = record;
  else MOCK_STAFF_LEAVES.push(record);
  bumpLocalSyncVersion();
  return { success: true, message: "Đã lưu đơn nghỉ phép.", data: mapLocalLeaveRow(record) };
};

const reviewSpaStaffLeaveRequest = async (payload = {}) => {
  await sleep(140);
  const maDon = String(payload.maDon || "").trim();
  const trangThai = normalizeLocalLeaveStatus(payload.trangThai);
  const index = findLocalLeaveIndex(maDon);
  if (index < 0) return { success: false, message: "Không tìm thấy đơn nghỉ phép." };
  MOCK_STAFF_LEAVES[index] = {
    ...MOCK_STAFF_LEAVES[index],
    trangThai,
    updatedAt: toLocalDateTimeString_(new Date()),
  };
  bumpLocalSyncVersion();
  return {
    success: true,
    message: "Đã cập nhật đơn nghỉ phép.",
    data: mapLocalLeaveRow(MOCK_STAFF_LEAVES[index]),
  };
};

const normalizeLocalTrainingType = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "";
  if (raw.includes("HOI") || raw.includes("NHAP")) return "HOI_NHAP";
  if (raw.includes("CHUYEN") || raw.includes("MON")) return "CHUYEN_MON";
  return "";
};

const normalizeLocalTrainingStatus = (value) => {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw) return "DA_LEN_LICH";
  if (raw.includes("HOAN")) return "HOAN_THANH";
  if (raw.includes("HUY")) return "HUY";
  return "DA_LEN_LICH";
};

const mapLocalTrainingRow = (row = {}) => ({
  maDaoTao: String(row.maDaoTao || "").trim(),
  maNhanVien: String(row.maNhanVien || "").trim(),
  loaiDaoTao: normalizeLocalTrainingType(row.loaiDaoTao),
  tuNgay: normalizeLocalAttendanceDateKey(row.tuNgay),
  denNgay: normalizeLocalAttendanceDateKey(row.denNgay),
  noiDung: String(row.noiDung || "").trim(),
  trangThai: normalizeLocalTrainingStatus(row.trangThai),
  ghiChu: String(row.ghiChu || "").trim(),
  updatedAt: String(row.updatedAt || "").trim(),
});

const findLocalTrainingIndex = (maDaoTao) =>
  MOCK_STAFF_TRAININGS.findIndex(
    (row) => String(row.maDaoTao || "").trim() === String(maDaoTao || "").trim(),
  );

const suggestNextLocalTrainingCode = () => {
  let max = 0;
  MOCK_STAFF_TRAININGS.forEach((row) => {
    const match = String(row.maDaoTao || "").match(/DT(\d+)/i);
    if (match) max = Math.max(max, Number(match[1]));
  });
  return `DT${String(max + 1).padStart(6, "0")}`;
};

const getSpaStaffTrainings = async (filters = {}) => {
  await sleep(120);
  const fromKey = normalizeLocalAttendanceDateKey(filters.tuNgay || filters.fromDate);
  const toKey = normalizeLocalAttendanceDateKey(filters.denNgay || filters.toDate);
  const staffCode = String(filters.maNhanVien || "").trim();
  const data = MOCK_STAFF_TRAININGS.map(mapLocalTrainingRow)
    .filter((row) => {
      if (!row.maDaoTao || !row.maNhanVien) return false;
      if (!leaveOverlapsLocalRange(row, fromKey, toKey)) return false;
      if (staffCode && row.maNhanVien !== staffCode) return false;
      return true;
    })
    .sort((a, b) => String(b.tuNgay).localeCompare(String(a.tuNgay)));
  return { success: true, data };
};

const saveSpaStaffTraining = async (payload = {}) => {
  await sleep(160);
  const maDaoTao = String(payload.maDaoTao || "").trim() || suggestNextLocalTrainingCode();
  const maNhanVien = String(payload.maNhanVien || "").trim();
  const loaiDaoTao = normalizeLocalTrainingType(payload.loaiDaoTao);
  const tuNgay = normalizeLocalAttendanceDateKey(payload.tuNgay);
  const denNgay = normalizeLocalAttendanceDateKey(payload.denNgay);
  if (!maNhanVien) return { success: false, message: "Thiếu mã nhân viên." };
  if (!loaiDaoTao) return { success: false, message: "Thiếu loại đào tạo." };
  if (!tuNgay || !denNgay) return { success: false, message: "Ngày đào tạo không hợp lệ." };
  const index = findLocalTrainingIndex(maDaoTao);
  const record = {
    maDaoTao,
    maNhanVien,
    loaiDaoTao,
    tuNgay,
    denNgay,
    noiDung: String(payload.noiDung || "").trim(),
    trangThai: normalizeLocalTrainingStatus(payload.trangThai || "DA_LEN_LICH"),
    ghiChu: String(payload.ghiChu || "").trim(),
    updatedAt: toLocalDateTimeString_(new Date()),
  };
  if (index >= 0) MOCK_STAFF_TRAININGS[index] = record;
  else MOCK_STAFF_TRAININGS.push(record);
  bumpLocalSyncVersion();
  return { success: true, message: "Đã lưu lịch đào tạo.", data: mapLocalTrainingRow(record) };
};

const mapLocalPayrollRow = (row = {}) => ({
  maBangLuong: String(row.maBangLuong || "").trim(),
  maKyLuong: String(row.maKyLuong || "").trim(),
  tuNgay: normalizeLocalAttendanceDateKey(row.tuNgay),
  denNgay: normalizeLocalAttendanceDateKey(row.denNgay),
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
  trangThai: "DA_CHOT",
  ghiChu: String(row.ghiChu || "").trim(),
  updatedAt: String(row.updatedAt || "").trim(),
});

const payrollMatchesLocalPeriod = (row, fromKey, toKey) => {
  const start = normalizeLocalAttendanceDateKey(row.tuNgay);
  const end = normalizeLocalAttendanceDateKey(row.denNgay);
  return start === fromKey && end === toKey;
};

const getSpaPayrollRecords = async (filters = {}) => {
  await sleep(120);
  const fromKey = normalizeLocalAttendanceDateKey(filters.tuNgay || filters.fromDate);
  const toKey = normalizeLocalAttendanceDateKey(filters.denNgay || filters.toDate);
  const maKyLuong = String(filters.maKyLuong || "").trim();
  const staffCode = String(filters.maNhanVien || "").trim();
  const data = MOCK_STAFF_PAYROLL.map(mapLocalPayrollRow)
    .filter((row) => {
      if (!row.maBangLuong || !row.maNhanVien) return false;
      if (maKyLuong && row.maKyLuong !== maKyLuong) return false;
      if ((fromKey || toKey) && !payrollMatchesLocalPeriod(row, fromKey, toKey)) return false;
      if (staffCode && row.maNhanVien !== staffCode) return false;
      return true;
    })
    .sort((a, b) => String(a.tenNhanVien).localeCompare(String(b.tenNhanVien), "vi"));
  return { success: true, data };
};

const lockSpaPayrollPeriod = async (payload = {}) => {
  await sleep(200);
  const fromKey = normalizeLocalAttendanceDateKey(payload.tuNgay);
  const toKey = normalizeLocalAttendanceDateKey(payload.denNgay);
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  if (!fromKey || !toKey) return { success: false, message: "Kỳ lương không hợp lệ." };
  if (!rows.length) return { success: false, message: "Không có dữ liệu lương để chốt." };
  if (MOCK_STAFF_PAYROLL.some((row) => payrollMatchesLocalPeriod(row, fromKey, toKey))) {
    const existing = MOCK_STAFF_PAYROLL.filter((row) =>
      payrollMatchesLocalPeriod(row, fromKey, toKey),
    ).map(mapLocalPayrollRow);
    return { success: true, message: "Kỳ lương đã được chốt trước đó.", data: existing };
  }
  const nowIso = toLocalDateTimeString_(new Date());
  const saved = rows.map((row, index) => {
    const record = {
      ...row,
      tuNgay: fromKey,
      denNgay: toKey,
      maBangLuong: String(row.maBangLuong || `BL${String(index + 1).padStart(6, "0")}`).trim(),
      maKyLuong:
        String(row.maKyLuong || `KL${fromKey.replace(/-/g, "")}${toKey.replace(/-/g, "")}`).trim(),
      trangThai: "DA_CHOT",
      updatedAt: nowIso,
    };
    MOCK_STAFF_PAYROLL.push(record);
    return mapLocalPayrollRow(record);
  });
  bumpLocalSyncVersion();
  return { success: true, message: "Đã chốt kỳ lương.", data: saved };
};

const updateSpaStaffSchedule = async (payload = {}) => {
  await sleep(120);
  const maNhanVien = String(payload.maNhanVien || "").trim();
  if (!maNhanVien) return { success: false, message: "Không tìm thấy nhân viên." };
  const codes = normalizeStaffShiftCodes(payload.caLamViec);
  const staff = MOCK_STAFF.find(
    (item) => String(item.maNhanVien || "").trim() === maNhanVien,
  );
  if (!staff) return { success: false, message: "Không tìm thấy nhân viên." };
  staff.caLamViec = codes.join(",");
  return {
    success: true,
    message: "Đã cập nhật lịch làm việc nhân viên.",
    data: { ...staff },
  };
};

const getTreatmentPackages = async () => {
  await sleep(120);
  return {
    success: true,
    data: getTreatmentPackageCatalog(),
  };
};

const getTreatmentCatalogs = async () => {
  await sleep(120);
  return {
    success: true,
    data: {
      phacDo: MOCK_TREATMENT_PROTOCOLS.map((item) => ({ ...item })),
      dichVu: MOCK_TREATMENT_SERVICES.map((item) => ({ ...item })),
      goiDieuTri: MOCK_TREATMENT_PACKAGES.map((item) => ({ ...item })),
    },
  };
};

const saveTreatmentCatalogs = async (payload = {}) => {
  await sleep(180);
  const nextProtocols = Array.isArray(payload.phacDo) ? payload.phacDo : [];
  const nextServices = Array.isArray(payload.dichVu) ? payload.dichVu : [];
  const nextPackages = Array.isArray(payload.goiDieuTri) ? payload.goiDieuTri : [];
  MOCK_TREATMENT_PROTOCOLS.splice(
    0,
    MOCK_TREATMENT_PROTOCOLS.length,
    ...nextProtocols.map((item, index) => ({
      maPhacDo: String(item.maPhacDo || `PD-${String(index + 1).padStart(4, "0")}`).trim(),
      tenPhacDo: String(item.tenPhacDo || "").trim(),
      nhomBenh: String(item.nhomBenh || "").trim(),
      capDoBenh: String(item.capDoBenh || "").trim(),
      moTa: String(item.moTa || "").trim(),
      active: item.active !== false,
      updatedAt: String(item.updatedAt || "").trim(),
    })),
  );
  MOCK_TREATMENT_SERVICES.splice(
    0,
    MOCK_TREATMENT_SERVICES.length,
    ...nextServices.map((item, index) => ({
      maDv: String(item.maDv || `DV-${String(index + 1).padStart(4, "0")}`).trim(),
      maPhacDo: String(item.maPhacDo || "").trim(),
      lop1NhomDv: String(item.lop1NhomDv || "").trim(),
      lop2DichVu: String(item.lop2DichVu || "").trim(),
      vungTriLieu: String(item.vungTriLieu || "").trim(),
      thoiLuongPhut: Math.max(Number(item.thoiLuongPhut || 0), 0),
      active: item.active !== false,
      updatedAt: String(item.updatedAt || "").trim(),
    })),
  );
  MOCK_TREATMENT_PACKAGES.splice(
    0,
    MOCK_TREATMENT_PACKAGES.length,
    ...nextPackages.map((item, index) => ({
      maGoi: String(item.maGoi || `GOI-${String(index + 1).padStart(4, "0")}`).trim(),
      maDv: String(item.maDv || "").trim(),
      tenGoi: String(item.tenGoi || "").trim(),
      loaiGoi: String(item.loaiGoi || "LE").trim(),
      soBuoiMua: Math.max(Number(item.soBuoiMua || 0), 0),
      soBuoiTang: Math.max(Number(item.soBuoiTang || 0), 0),
      soBuoiQuyDoi: Math.max(Number(item.soBuoiQuyDoi || 0), 0),
      giaBanGoi: Math.max(Number(item.giaBanGoi || 0), 0),
      giaVonChuanGoi: Math.max(Number(item.giaVonChuanGoi || 0), 0),
      active: item.active !== false,
      updatedAt: String(item.updatedAt || "").trim(),
    })),
  );
  return { success: true, message: "Đã lưu danh mục điều trị.", data: true };
};

const getStayHistory = async (filters = {}) => {
  await sleep(140);
  const keyword = foldText(filters?.keyword);
  const statusFilter = String(filters?.trangThai || "").trim().toUpperCase();
  const roomFilter = String(filters?.maGiuong || "").trim();
  const staffFilter = String(filters?.maNhanVien || "").trim();
  const fromDate = String(filters?.fromDate || "").trim();
  const toDate = String(filters?.toDate || "").trim();

  let list = MOCK_STAYS.map((stay) => buildStaySnapshot(stay));
  if (statusFilter) {
    list = list.filter((stay) =>
      String(stay.trangThaiPhien || "").toUpperCase() === statusFilter,
    );
  }
  if (roomFilter) {
    list = list.filter((stay) => String(stay.maGiuong || "") === roomFilter);
  }
  if (staffFilter) {
    list = list.filter((stay) => String(stay.maNhanVien || "") === staffFilter);
  }
  if (keyword) {
    list = list.filter((stay) => {
      const source = [
        stay.maPhien,
        stay.maLichHen,
        stay.maGiuong,
        stay.tenKhach,
        stay.soDienThoai,
      ]
        .map((x) => foldText(x))
        .join(" ");
      return source.includes(keyword);
    });
  }
  if (fromDate) {
    const fromMs = new Date(fromDate).getTime();
    if (Number.isFinite(fromMs)) {
      list = list.filter(
        (stay) => new Date(getStayStartAt(stay) || 0).getTime() >= fromMs,
      );
    }
  }
  if (toDate) {
    const toMs = new Date(toDate).getTime();
    if (Number.isFinite(toMs)) {
      list = list.filter(
        (stay) => new Date(getStayStartAt(stay) || 0).getTime() <= toMs + 86400000,
      );
    }
  }

  list.sort(
    (a, b) =>
      new Date(getStayStartAt(b) || 0).getTime() - new Date(getStayStartAt(a) || 0).getTime(),
  );
  return { success: true, data: list };
};

const buildTreatmentPackageFromPayload = (payload = {}, existingStay = null) =>
  resolveTreatmentPackage(payload, existingStay) || {
    maDv: String(payload.maDv || "").trim(),
    tenDichVu: String(payload.tenDichVu || "").trim(),
    maGoi: String(payload.maGoi || "").trim(),
    tenGoi: String(payload.tenGoi || "").trim(),
    thoiLuongPhut: Math.max(Number(payload.thoiLuongPhut || 60), 15),
    giaGoi: Number(payload.giaGoi || 0),
    giaBanGoi: Number(payload.giaBanGoi || payload.giaGoi || 0),
  };

const resolveStayTimeRangeFromPayload = (payload = {}, selectedPackage = {}) => {
  const durationMinutes = Math.max(Number(selectedPackage.thoiLuongPhut || 60), 15);
  const batDauInput = payload.batDauAt;
  const ketThucInput = payload.ketThucDuKien;
  let batDauAt = batDauInput ? parseIsoStringOrNull(batDauInput) : toVnDateTimeString_(new Date());
  if (batDauInput && !batDauAt) batDauAt = toVnDateTimeString_(new Date());
  let ketThucDuKien = ketThucInput
    ? parseIsoStringOrNull(ketThucInput)
    : toVnDateTimeString_(new Date(parseVnDateTimeToMs_(batDauAt) + durationMinutes * 60000));
  if (ketThucInput && !ketThucDuKien) {
    ketThucDuKien = toVnDateTimeString_(new Date(parseVnDateTimeToMs_(batDauAt) + durationMinutes * 60000));
  }
  let batDauMs = parseVnDateTimeToMs_(batDauAt);
  let ketThucMs = parseVnDateTimeToMs_(ketThucDuKien);
  if (!Number.isFinite(batDauMs) || !Number.isFinite(ketThucMs) || ketThucMs <= batDauMs) {
    ketThucDuKien = toVnDateTimeString_(new Date(batDauMs + durationMinutes * 60000));
    ketThucMs = parseVnDateTimeToMs_(ketThucDuKien);
  }
  return {
    batDauAt,
    ketThucDuKien,
    batDauMs,
    ketThucMs,
    durationMinutes: Math.max(15, Math.round((ketThucMs - batDauMs) / 60000)),
  };
};

const createBooking = async (payload = {}) => {
  await sleep(180);
  const maGiuong = String(payload.maGiuong || "").trim();
  const tenKhach = String(payload.tenKhach || "").trim();
  const room = MOCK_ROOMS.find((x) => String(x.maGiuong) === maGiuong);
  const maPhien = nextStayCode();
  const maLichHen = nextBookingCode();
  const selectedPackage = buildTreatmentPackageFromPayload(payload);
  const timeRange = resolveStayTimeRangeFromPayload(payload, selectedPackage);
  const { batDauAt, ketThucDuKien, batDauMs, ketThucMs } = timeRange;
  const staff =
    MOCK_STAFF.find(
      (x) =>
        String(x.maNhanVien || "").trim() ===
        String(payload.maNhanVien || "").trim(),
    ) ||
    MOCK_STAFF.find(
      (x) => foldText(x.tenNhanVien) === foldText(payload.tenNhanVien),
    ) ||
    null;
  const maNhanVien = String(staff?.maNhanVien || payload.maNhanVien || "").trim();
  const progress = resolveProgressMeta({
    payload,
    selectedPackage,
  });
  const packageCharge = progress.isFirstCharge
    ? Number(selectedPackage.giaGoi || selectedPackage.giaBanGoi || 0)
    : 0;

  const customerPayload = {
    tenKhach,
    soDienThoai: String(payload.soDienThoai || "").trim(),
  };
  upsertLocalCustomer(customerPayload);
  MOCK_STAYS.unshift({
    maPhien,
    maLichHen,
    maTienTrinh: progress.maTienTrinh,
    maGiuong,
    tenKhach,
    soDienThoai: customerPayload.soDienThoai,
    maNhanVien,
    tenNhanVien: String(staff?.tenNhanVien || "").trim(),
    maGoi: selectedPackage.maGoi,
    tenGoi: selectedPackage.tenGoi,
    maDv: selectedPackage.maDv,
    tenDichVu: selectedPackage.tenDichVu,
    batDauAt,
    ketThucDuKien,
    ketThucThucTe: "",
    tongBuoiCombo: progress.tongBuoiCombo,
    buoiThu: progress.buoiThu,
    thoiLuongPhut: timeRange.durationMinutes,
    giaGoi: Number(selectedPackage.giaGoi || selectedPackage.giaBanGoi || 0),
    tienGoi: packageCharge,
    tienDichVu: 0,
    tongThanhToan: packageCharge,
    trangThaiPhien: STAY_STATUS.BOOKED,
    ghiChu: String(payload.ghiChu || "").trim(),
    tienCoc: Number(payload.tienCoc || 0),
    lichTrinhChiTiet: Array.isArray(payload.lichTrinhChiTiet) ? JSON.stringify(payload.lichTrinhChiTiet) : "",
  });
  return {
    success: true,
    message: `Đã tạo lịch hẹn cho ${room?.tenGiuong || maGiuong || "giường"}.`,
    data: {
      ...normalizeBedRecord({ ...room }),
      maLichHen,
      maPhien,
    },
  };
};

const checkInRoom = async (payload = {}) => {
  await sleep(220);
  const maGiuong = String(payload.maGiuong || "").trim();
  let tenKhach = String(payload.tenKhach || "").trim();
  const requestedMaPhien = String(payload.maPhien || "").trim();
  const requestedMaLichHen = String(payload.maLichHen || "").trim();
  const room = MOCK_ROOMS.find((x) => String(x.maGiuong) === maGiuong);
  const initialPackage = buildTreatmentPackageFromPayload(payload);
  const timeRange = resolveStayTimeRangeFromPayload(payload, initialPackage);
  const { batDauAt, ketThucDuKien, batDauMs, ketThucMs } = timeRange;
  const bookedCandidates = MOCK_STAYS.filter(
    (x) =>
      String(x.maGiuong || "").trim() === maGiuong &&
      String(x.trangThaiPhien || "").toUpperCase() === STAY_STATUS.BOOKED,
  ).sort(
    (a, b) =>
      new Date(getStayStartAt(a) || 0).getTime() - new Date(getStayStartAt(b) || 0).getTime(),
  );
  const requestedPhone = String(payload.soDienThoai || "").trim();
  const requestedCustomerKey = foldText(payload.tenKhach);
  let bookedStay = null;
  if (requestedMaPhien) {
    bookedStay =
      bookedCandidates.find(
        (x) => String(x.maPhien || "").trim() === requestedMaPhien,
      ) ||
      MOCK_STAYS.find((x) => String(x.maPhien || "").trim() === requestedMaPhien) ||
      null;
  } else if (requestedMaLichHen) {
    bookedStay =
      bookedCandidates.find(
        (x) => String(x.maLichHen || "").trim() === requestedMaLichHen,
      ) ||
      MOCK_STAYS.find((x) => String(x.maLichHen || "").trim() === requestedMaLichHen) ||
      null;
  } else if (requestedPhone || requestedCustomerKey) {
    const matchedByIdentity = bookedCandidates.filter((x) => {
      const stayPhone = String(x.soDienThoai || "").trim();
      const stayCustomerKey = foldText(x.tenKhach);
      if (requestedPhone && stayPhone && stayPhone === requestedPhone) return true;
      if (requestedCustomerKey && stayCustomerKey && stayCustomerKey === requestedCustomerKey)
        return true;
      return false;
    });
    if (matchedByIdentity.length === 1) bookedStay = matchedByIdentity[0];
  }
  if (!bookedStay && bookedCandidates.length > 1) {
    const matchedByWindow = bookedCandidates.filter((x) => {
      const range = resolveStayTimeRange(x);
      if (!range) return false;
      return hasTimeOverlap(batDauMs, ketThucMs, range.startMs, range.endMs);
    });
    if (matchedByWindow.length === 1) bookedStay = matchedByWindow[0];
  }
  if (!tenKhach && bookedStay) {
    tenKhach = String(bookedStay.tenKhach || "").trim();
  }
  const selectedPackage = buildTreatmentPackageFromPayload(payload, bookedStay);
  const staff =
    MOCK_STAFF.find(
      (x) =>
        String(x.maNhanVien || "").trim() ===
        String(payload.maNhanVien || "").trim(),
    ) ||
    MOCK_STAFF.find(
      (x) => foldText(x.tenNhanVien) === foldText(payload.tenNhanVien),
    ) ||
    null;
  const maNhanVien = String(
    payload.maNhanVien ||
      bookedStay?.maNhanVien ||
      staff?.maNhanVien ||
      "",
  ).trim();
  const progress = resolveProgressMeta({
    payload: {
      ...payload,
      tenKhach,
      soDienThoai: String(payload.soDienThoai || bookedStay?.soDienThoai || "").trim(),
    },
    selectedPackage,
    existingStay: bookedStay,
  });
  const packageCharge = bookedStay
    ? Number(bookedStay.tienGoi || 0)
    : progress.isFirstCharge
      ? Number(selectedPackage.giaGoi || selectedPackage.giaBanGoi || 0)
      : 0;
  const maPhien = bookedStay?.maPhien || nextStayCode();
  const maLichHen = bookedStay?.maLichHen || "";
  const stay = {
    maPhien,
    maLichHen,
    maTienTrinh: bookedStay?.maTienTrinh || progress.maTienTrinh,
    maGiuong,
    tenKhach,
    soDienThoai: String(
      payload.soDienThoai ||
        bookedStay?.soDienThoai ||
        "",
    ).trim(),
    maNhanVien,
    tenNhanVien: String(payload.tenNhanVien || bookedStay?.tenNhanVien || staff?.tenNhanVien || "").trim(),
    maGoi: selectedPackage.maGoi,
    tenGoi: selectedPackage.tenGoi,
    maDv: selectedPackage.maDv,
    tenDichVu: selectedPackage.tenDichVu,
    batDauAt,
    ketThucDuKien,
    ketThucThucTe: "",
    tongBuoiCombo: Math.max(Number(bookedStay?.tongBuoiCombo || progress.tongBuoiCombo || 1), 1),
    buoiThu: Math.max(Number(bookedStay?.buoiThu || progress.buoiThu || 1), 1),
    thoiLuongPhut: timeRange.durationMinutes,
    giaGoi: Number(selectedPackage.giaGoi || selectedPackage.giaBanGoi || 0),
    tienGoi: packageCharge,
    tienDichVu: Number(bookedStay?.tienDichVu || 0),
    tongThanhToan:
      packageCharge +
      Number(bookedStay?.tienDichVu || 0),
    trangThaiPhien: STAY_STATUS.IN_HOUSE,
    ghiChu: String(payload.ghiChu || bookedStay?.ghiChu || "").trim(),
    tienCoc: Number(payload.tienCoc || 0),
    lichTrinhChiTiet: Array.isArray(payload.lichTrinhChiTiet) ? JSON.stringify(payload.lichTrinhChiTiet) : "",
  };
  if (bookedStay) {
    Object.assign(bookedStay, stay);
  } else {
    MOCK_STAYS.unshift(stay);
  }
  syncCustomerAndDerivedScaleData(stay);
  if (room) {
    room.trangThaiGiuong = ROOM_STATUS.IN_HOUSE;
    room.updatedAt = toLocalDateTimeString_(new Date());
  }

  return {
    success: true,
    message: `Mở phiên trị liệu thành công ${room?.tenGiuong || maGiuong || "giường"}.`,
    data: buildStaySnapshot(stay),
  };
};

const addStayServiceItem = async (payload = {}) => {
  await sleep(200);
  const maPhien = String(payload.maPhien || "").trim();
  if (!maPhien) return { success: false, message: "Thiếu mã phiên trị liệu." };

  const stay = MOCK_STAYS.find((x) => String(x.maPhien) === maPhien);
  if (!stay) return { success: false, message: "Không tìm thấy phiên trị liệu." };
  if (isImmutableSession(stay.trangThaiPhien)) return { success: false, message: "Không thể thay đổi dữ liệu. Đơn hàng này đã hoàn tất hoặc bị hủy." };

  const catalog = MOCK_PRODUCTS.map((item, idx) =>
    ensureCatalogItemIdentity(item, idx),
  );
  catalog.forEach((item, idx) => {
    MOCK_PRODUCTS[idx] = item;
  });
  const maSanPham = String(payload.maSanPham || "").trim();
  const tenSanPham = String(payload.tenSanPham || "").trim();
  const found = catalog.find(
    (x) =>
      String(x.maSanPham || "").trim() === maSanPham ||
      (tenSanPham && String(x.tenSanPham || "").trim() === tenSanPham),
  );
  const product = found || {
    maSanPham,
    tenSanPham,
    nhomHang: String(payload.nhomHang || "").trim(),
    donVi: String(payload.donVi || "").trim(),
    donGiaBan: Math.max(0, Number(payload.donGia || 0)),
  };

  const soLuong = Math.max(1, Number(payload.soLuong || 1));
  const donGia = Math.max(0, Number(payload.donGia || product.donGiaBan || 0));
  const thanhTien = soLuong * donGia;
  const thoiGian =
    parseIsoStringOrNull(payload.thoiGian) ||
    toLocalDateTimeString_(new Date(Date.now() + MOCK_STAY_SERVICE_ITEMS.length));
  MOCK_STAY_SERVICE_ITEMS.push({
    maPhien,
    thoiGian,
    maSanPham: product.maSanPham,
    tenSanPham: product.tenSanPham,
    nhomHang: product.nhomHang || "",
    donVi: product.donVi || "",
    soLuong,
    donGia,
    thanhTien,
    ghiChu: String(payload.ghiChu || "").trim(),
  });

  stay.tienDichVu = (Number(stay.tienDichVu || 0) + thanhTien);
  stay.tongThanhToan = Number(stay.tienGoi || 0) + Number(stay.tienDichVu || 0);

  return {
    success: true,
    message: "Đã thêm dịch vụ/sản phẩm phát sinh.",
    data: buildStaySnapshot(stay),
  };
};

const normalizeProductKeyPart = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

const isStockTrackedTreatmentItem = (catalogItem) => {
  if (!catalogItem) return false;
  if (catalogItem.theoDoiTonKho === false) return false;
  const type = normalizeProductType(catalogItem);
  return !["DICH_VU", "ROOM", "GOI_DICH_VU"].includes(type);
};

const deductStockForStayServices = (maPhien) => {
  const stayCode = String(maPhien || "").trim();
  if (!stayCode) return;
  const catalog = MOCK_PRODUCTS.map((item, idx) => ensureCatalogItemIdentity(item, idx));
  catalog.forEach((item, idx) => {
    MOCK_PRODUCTS[idx] = item;
  });

  const items = MOCK_STAY_SERVICE_ITEMS.filter(
    (item) => String(item.maPhien || "").trim() === stayCode && item.daTruTonKho !== true,
  );
  // Pass 1: Validation
  for (const item of items) {
    const itemCode = String(item.maSanPham || "").trim();
    const itemNameKey = normalizeProductKeyPart(item.tenSanPham);
    const productIndex = MOCK_PRODUCTS.findIndex((product) => {
      const code = String(product.maSanPham || "").trim();
      if (itemCode && code === itemCode) return true;
      return itemNameKey && normalizeProductKeyPart(product.tenSanPham) === itemNameKey;
    });
    if (productIndex < 0) continue;
    
    const product = ensureCatalogItemIdentity(MOCK_PRODUCTS[productIndex], productIndex);
    MOCK_PRODUCTS[productIndex] = product;
    if (!isStockTrackedTreatmentItem(product)) continue;
    
    const qty = Math.max(0, Number(item.soLuong || 0));
    product._pendingDeduct = (product._pendingDeduct || 0) + qty;
    const currentStock = Math.max(0, Number(product.tonKho || 0));
    if (currentStock < product._pendingDeduct) {
      throw new Error(`Số lượng tồn kho của [${item.tenSanPham || "Sản phẩm"}] không đủ để thanh toán (Còn: ${currentStock}, Cần: ${product._pendingDeduct}). Vui lòng nhập thêm hàng vào kho.`);
    }
  }

  // Pass 2: Execution
  for (const item of items) {
    const itemCode = String(item.maSanPham || "").trim();
    const itemNameKey = normalizeProductKeyPart(item.tenSanPham);
    const productIndex = MOCK_PRODUCTS.findIndex((product) => {
      const code = String(product.maSanPham || "").trim();
      if (itemCode && code === itemCode) return true;
      return itemNameKey && normalizeProductKeyPart(product.tenSanPham) === itemNameKey;
    });
    if (productIndex < 0) continue;
    
    const product = MOCK_PRODUCTS[productIndex];
    if (!isStockTrackedTreatmentItem(product)) {
      item.daTruTonKho = true;
      continue;
    }
    
    const qty = Math.max(0, Number(item.soLuong || 0));
    const currentStock = Math.max(0, Number(product.tonKho || 0));
    MOCK_PRODUCTS[productIndex] = {
      ...product,
      tonKho: currentStock - qty,
    };
    item.daTruTonKho = true;
  }
};

const formatCheckoutDateVn = (isoOrDate) => {
  const d = isoOrDate ? new Date(isoOrDate) : new Date();
  const safe = Number.isFinite(d.getTime()) ? d : new Date();
  const day = String(safe.getDate()).padStart(2, "0");
  const month = String(safe.getMonth() + 1).padStart(2, "0");
  const year = safe.getFullYear();
  return `${day}/${month}/${year}`;
};

const appendLocalCtBanFromCheckout = (stay, serviceItems = []) => {
  const maPhien = String(stay?.maPhien || "").trim();
  if (!maPhien) return;
  if (MOCK_CT_BAN.some((row) => String(row.maPhieu || "").trim() === maPhien)) return;

  const ngayThuTien = formatCheckoutDateVn(stay.ketThucThucTe);
  const tenKhach = String(stay.tenKhach || "").trim() || "Khách vãng lai";
  const soDienThoai = String(stay.soDienThoai || "").trim();
  const maDv = String(stay.maDv || "").trim();
  const maGoi = String(stay.maGoi || "").trim();
  const tenGoi = String(stay.tenGoi || "").trim();
  const tenDichVu = String(stay.tenDichVu || "").trim();
  const tongBuoiCombo = Math.max(Number(stay.tongBuoiCombo || 1), 1);
  const buoiThu = Math.max(Number(stay.buoiThu || 1), 1);
  const tienGoi = Math.max(Number(stay.tienGoi ?? 0), 0);
  const tienDichVu = serviceItems.reduce(
    (sum, item) => sum + Math.max(Number(item.thanhTien || 0), 0),
    0,
  );
  const expectedSessionRevenue = tienGoi + tienDichVu;
  const rowsToAppend = [];

  if (tienGoi > 0 || maGoi || tenGoi || tenDichVu) {
    const giaBanGoi = Math.max(Number(stay.giaGoi || 0), 0);
    const doanhThuGoi = tienGoi;
    rowsToAppend.push({
      ngayThuTien,
      maPhieu: maPhien,
      tenKhach,
      soDienThoai,
      nguonThu: "GOI_DIEU_TRI",
      tenSanPham: tenGoi || tenDichVu,
      tenGoi: tenGoi || tenDichVu,
      soLuong: 1,
      giaBan: giaBanGoi,
      doanhThu: doanhThuGoi,
      loiNhuan: doanhThuGoi,
      ghiChu: `Checkout phiên ${maPhien} - buổi ${buoiThu}/${tongBuoiCombo}`,
      tienCoc: Number(stay.tienCoc || 0),
      lichTrinhChiTiet: String(stay.lichTrinhChiTiet || "").trim(),
    });
  }

  serviceItems.forEach((item) => {
    const qty = Math.max(Number(item.soLuong || 0), 1);
    const giaBan = Math.max(Number(item.donGia || 0), 0);
    const doanhThu = Math.max(Number(item.thanhTien || 0), giaBan * qty);
    if (doanhThu <= 0) return;
    rowsToAppend.push({
      ngayThuTien,
      maPhieu: maPhien,
      tenKhach,
      soDienThoai,
      nguonThu: "SAN_PHAM_DUOC_LIEU",
      tenSanPham: String(item.tenSanPham || "").trim(),
      tenGoi: "",
      soLuong: qty,
      giaBan,
      doanhThu,
      loiNhuan: doanhThu,
      ghiChu: String(item.ghiChu || "").trim() || "Sản phẩm trong phiên",
    });
  });

  if (!rowsToAppend.length) {
    rowsToAppend.push({
      ngayThuTien,
      maPhieu: maPhien,
      tenKhach,
      soDienThoai,
      nguonThu: "GOI_DIEU_TRI",
      tenSanPham: tenGoi || tenDichVu || "Phiên trị liệu",
      tenGoi: tenGoi || tenDichVu || "Phiên trị liệu",
      soLuong: 1,
      giaBan: 0,
      doanhThu: 0,
      loiNhuan: 0,
      ghiChu: `Checkout phiên ${maPhien}`,
      tienCoc: Number(stay.tienCoc || 0),
      lichTrinhChiTiet: String(stay.lichTrinhChiTiet || "").trim(),
    });
  }

  const actualRevenue = rowsToAppend.reduce(
    (sum, row) => sum + Math.max(Number(row.doanhThu || 0), 0),
    0,
  );
  if (actualRevenue > expectedSessionRevenue + 1) {
    const goiRow = rowsToAppend.find((row) => row.nguonThu === "GOI_DIEU_TRI");
    if (goiRow) {
      const productRevenue = rowsToAppend.reduce((sum, row) => {
        if (row.nguonThu === "GOI_DIEU_TRI") return sum;
        return sum + Math.max(Number(row.doanhThu || 0), 0);
      }, 0);
      const cappedGoiRevenue = Math.max(expectedSessionRevenue - productRevenue, 0);
      goiRow.doanhThu = cappedGoiRevenue;
      goiRow.loiNhuan = cappedGoiRevenue;
    }
  }

  MOCK_CT_BAN.push(...rowsToAppend);
};

const updateComboSchedule = async (payload = {}) => {
  await delay(600);
  const maTienTrinh = String(payload.maTienTrinh || "").trim();
  const lichTrinhChiTiet = String(payload.lichTrinhChiTiet || "").trim();
  if (!maTienTrinh) throw new Error("Thiếu mã tiến trình.");
  
  let updatedCount = 0;
  const stayCodes = {};
  
  for (const stay of MOCK_STAYS) {
    if (String(stay.maTienTrinh || "").trim() === maTienTrinh) {
      stay.lichTrinhChiTiet = lichTrinhChiTiet;
      stayCodes[String(stay.maPhien || "").trim()] = true;
      updatedCount++;
    }
  }
  
  if (updatedCount === 0) {
    throw new Error("Không tìm thấy tiến trình.");
  }
  
  for (const ct of MOCK_CT_BAN) {
    const maPhieu = String(ct.maPhieu || "").trim();
    if (maPhieu && stayCodes[maPhieu]) {
      ct.lichTrinhChiTiet = lichTrinhChiTiet;
    }
  }
  
  return { success: true, message: "Đã cập nhật lịch trình." };
};

const checkoutRoom = async (payload = {}) => {
  await sleep(220);
  const maPhien = String(payload.maPhien || "").trim();
  if (!maPhien) return { success: false, message: "Thiếu mã phiên trị liệu." };
  const stay = MOCK_STAYS.find((x) => String(x.maPhien) === maPhien);
  if (!stay) return { success: false, message: "Không tìm thấy phiên trị liệu." };
  const currentStatus = String(stay.trangThaiPhien || "").trim().toUpperCase();
  if (currentStatus === STAY_STATUS.CANCELLED) {
    return { success: false, message: "Không thể thay đổi dữ liệu. Đơn hàng này đã hoàn tất hoặc bị hủy." };
  }
  if (currentStatus === STAY_STATUS.CHECKED_OUT) {
    const serviceItems = MOCK_STAY_SERVICE_ITEMS.filter(
      (x) => String(x.maPhien) === maPhien,
    );
    appendLocalCtBanFromCheckout(stay, serviceItems);
    return {
      success: true,
      message: "Phiên đã được kết thúc trước đó.",
      data: buildStaySnapshot(stay),
    };
  }

  if (payload.ketThucThucTe) {
    stay.ketThucThucTe = parseIsoStringOrNull(payload.ketThucThucTe) || toLocalDateTimeString_(new Date());
  } else {
    stay.ketThucThucTe = toLocalDateTimeString_(new Date());
  }
  try {
    deductStockForStayServices(maPhien);
  } catch (e) {
    return { success: false, message: e?.message || "Không cập nhật được tồn kho." };
  }
  stay.trangThaiPhien = STAY_STATUS.CHECKED_OUT;
  stay.ghiChu = String(payload.ghiChu || stay.ghiChu || "").trim();
  if (payload.diemHaiLongKhach !== undefined && payload.diemHaiLongKhach !== null && payload.diemHaiLongKhach !== "") {
    const score = Math.round(Number(payload.diemHaiLongKhach));
    if (Number.isFinite(score) && score >= 1 && score <= 5) {
      stay.diemHaiLongKhach = score;
    }
  }
  const serviceItems = MOCK_STAY_SERVICE_ITEMS.filter(
    (x) => String(x.maPhien) === maPhien,
  );
  appendLocalCtBanFromCheckout(stay, serviceItems);

  const room = MOCK_ROOMS.find((x) => String(x.maGiuong) === String(stay.maGiuong));
  if (room) {
    room.trangThaiGiuong = ROOM_STATUS.AVAILABLE;
    room.updatedAt = toLocalDateTimeString_(new Date());
  }

  return {
    success: true,
    message: "Kết thúc phiên thành công. Giường chuyển sang Sẵn sàng.",
    data: buildStaySnapshot(stay),
  };
};

const markTreatmentNoShow = async (payload = {}) => {
  await sleep(160);
  const code = String(payload.maPhien || payload.maLichHen || "").trim();
  if (!code) return { success: false, message: "Thiếu mã lịch hẹn." };
  const stay = MOCK_STAYS.find(
    (x) =>
      String(x.maPhien || "").trim() === code ||
      String(x.maLichHen || "").trim() === code,
  );
  if (!stay) return { success: false, message: "Không tìm thấy lịch hẹn." };
  if (isImmutableSession(stay.trangThaiPhien)) return { success: false, message: "Không thể thay đổi dữ liệu. Đơn hàng này đã hoàn tất hoặc bị hủy." };
  stay.trangThaiPhien = STAY_STATUS.NO_SHOW;
  stay.ketThucThucTe = toLocalDateTimeString_(new Date());
  stay.ghiChu = [String(stay.ghiChu || "").trim(), String(payload.ghiChu || "").trim()]
    .filter(Boolean)
    .join(" • ");
  return {
    success: true,
    message: "Đã đánh dấu khách không đến.",
    data: buildStaySnapshot(stay),
  };
};

const updateStayServiceItem = async (payload = {}) => {
  await sleep(180);
  const maPhien = String(payload.maPhien || "").trim();
  if (!maPhien) {
    return { success: false, message: "Thiếu mã phiên trị liệu." };
  }
  
  const stay = MOCK_STAYS.find((x) => String(x.maPhien) === maPhien);
  if (!stay) return { success: false, message: "Không tìm thấy phiên trị liệu." };
  if (isImmutableSession(stay.trangThaiPhien)) return { success: false, message: "Không thể thay đổi dữ liệu. Đơn hàng này đã hoàn tất hoặc bị hủy." };

  const serviceItems = MOCK_STAY_SERVICE_ITEMS.filter(
    (x) => String(x.maPhien) === maPhien
  );
  const targetService = resolveServiceItemTarget(serviceItems, payload);
  if (!targetService) {
    return { success: false, message: "Không tìm thấy dòng dịch vụ cần cập nhật." };
  }
  const soLuong = Math.max(1, Number(payload.soLuong || targetService.soLuong || 1));
  const donGia = Math.max(0, Number(payload.donGia || targetService.donGia || 0));
  const thanhTien = soLuong * donGia;
  
  targetService.soLuong = soLuong;
  targetService.donGia = donGia;
  targetService.thanhTien = thanhTien;
  targetService.ghiChu = String(payload.ghiChu || targetService.ghiChu || "").trim();
  
  // Tính lại tổng
  const allServices = MOCK_STAY_SERVICE_ITEMS.filter(
    (x) => String(x.maPhien) === maPhien
  );
  const tienDichVu = allServices.reduce((sum, s) => sum + Number(s.thanhTien || 0), 0);
  stay.tienDichVu = tienDichVu;
  stay.tongThanhToan = Number(stay.tienGoi || 0) + tienDichVu;
  
  return {
    success: true,
    message: "Đã cập nhật dịch vụ.",
    data: buildStaySnapshot(stay),
  };
};

const deleteStayServiceItem = async (payload = {}) => {
  await sleep(180);
  const maPhien = String(payload.maPhien || "").trim();
  if (!maPhien) {
    return { success: false, message: "Thiếu mã phiên trị liệu." };
  }
  
  const stay = MOCK_STAYS.find((x) => String(x.maPhien) === maPhien);
  if (!stay) return { success: false, message: "Không tìm thấy phiên trị liệu." };
  if (isImmutableSession(stay.trangThaiPhien)) return { success: false, message: "Không thể thay đổi dữ liệu. Đơn hàng này đã hoàn tất hoặc bị hủy." };

  const serviceItems = MOCK_STAY_SERVICE_ITEMS.filter(
    (x) => String(x.maPhien) === maPhien
  );
  const targetService = resolveServiceItemTarget(serviceItems, payload);
  if (!targetService) {
    return { success: false, message: "Không tìm thấy dòng dịch vụ cần xóa." };
  }

  const globalIndex = MOCK_STAY_SERVICE_ITEMS.indexOf(targetService);
  if (globalIndex >= 0) {
    MOCK_STAY_SERVICE_ITEMS.splice(globalIndex, 1);
  }
  
  // Tính lại tổng
  const allServices = MOCK_STAY_SERVICE_ITEMS.filter(
    (x) => String(x.maPhien) === maPhien
  );
  const tienDichVu = allServices.reduce((sum, s) => sum + Number(s.thanhTien || 0), 0);
  stay.tienDichVu = tienDichVu;
  stay.tongThanhToan = Number(stay.tienGoi || 0) + tienDichVu;
  
  return {
    success: true,
    message: "Đã xóa dịch vụ.",
    data: buildStaySnapshot(stay),
  };
};

const logClientError = async (payload = {}) => {
  console.log("[DEV_MOCK_API] Logged UI error:", payload);
  return { success: true };
};

const updateStayTime = async (payload = {}) => {
  await sleep(200);
  const maPhien = String(payload.maPhien || "").trim();
  if (!maPhien) return { success: false, message: "Thiếu mã phiên trị liệu." };
  
  const stay = MOCK_STAYS.find((x) => String(x.maPhien) === maPhien);
  if (!stay) return { success: false, message: "Không tìm thấy phiên trị liệu." };
  if (isImmutableSession(stay.trangThaiPhien)) return { success: false, message: "Không thể thay đổi dữ liệu. Đơn hàng này đã hoàn tất hoặc bị hủy." };

  const timeRange = resolveStayTimeRangeFromPayload(
    {
      batDauAt: payload.batDauAt || stay.batDauAt,
      ketThucDuKien: payload.ketThucDuKien || stay.ketThucDuKien,
      thoiLuongPhut: stay.thoiLuongPhut,
    },
    { thoiLuongPhut: stay.thoiLuongPhut || 60 },
  );

  stay.batDauAt = timeRange.batDauAt;
  stay.ketThucDuKien = timeRange.ketThucDuKien;
  stay.thoiLuongPhut = timeRange.durationMinutes;

  if (payload.maNhanVien !== undefined) {
    stay.maNhanVien = String(payload.maNhanVien || "").trim();
    if (stay.maNhanVien) {
      const staffInfo = MOCK_STAFFS.find((s) => s.maNhanVien === stay.maNhanVien);
      stay.tenNhanVien = staffInfo ? String(staffInfo.tenNhanVien || "").trim() : stay.maNhanVien;
    } else {
      stay.tenNhanVien = "";
    }
  }

  stay.tongThanhToan = Number(stay.tienGoi || 0) + Number(stay.tienDichVu || 0);
  
  return {
    success: true,
    message: "Đã cập nhật thời gian.",
    data: buildStaySnapshot(stay),
  };
};

const createBookingWithItems = async (payload = {}) => {
  const snapshot = snapshotLocalSpaState();
  try {
    const { serviceItems = [], ...bookingPayload } = payload || {};
    const booking = await createBooking(bookingPayload);
    if (!booking?.success) return booking;
    const maPhien = String(booking.data?.maPhien || "").trim();
    for (let index = 0; index < serviceItems.length; index += 1) {
      const item = serviceItems[index] || {};
      const addResult = await addStayServiceItem({
        maPhien,
        maSanPham: item.maSanPham,
        tenSanPham: item.tenSanPham,
        soLuong: item.soLuong,
        donGia: item.donGia,
        ghiChu: item.ghiChu,
        thoiGian: toLocalDateTimeString_(new Date(Date.now() + index)),
      });
      if (!addResult?.success) {
        throw new Error(addResult?.message || "Không thêm được dòng phát sinh.");
      }
    }
    const stay = MOCK_STAYS.find((item) => String(item.maPhien || "") === maPhien);
    return {
      success: true,
      message: booking.message || "Đã tạo lịch hẹn trị liệu.",
      data: stay ? buildStaySnapshot(stay) : booking.data,
    };
  } catch (error) {
    restoreLocalSpaState(snapshot);
    return {
      success: false,
      message: error?.message || "Tạo lịch hẹn trị liệu thất bại.",
    };
  }
};

const syncCustomerAndDerivedScaleData = (stay = {}) => {
  upsertLocalCustomer({
    tenKhach: stay?.tenKhach,
    soDienThoai: stay?.soDienThoai,
  });
};

const checkInRoomWithItems = async (payload = {}) => {
  const snapshot = snapshotLocalSpaState();
  try {
    const { serviceItems = [], ...sessionPayload } = payload || {};
    const checkin = await checkInRoom(sessionPayload);
    if (!checkin?.success) return checkin;
    const maPhien = String(
      checkin.data?.maPhien || sessionPayload.maPhien || payload.maPhien || "",
    ).trim();
    for (let index = 0; index < serviceItems.length; index += 1) {
      const item = serviceItems[index] || {};
      const addResult = await addStayServiceItem({
        maPhien,
        maSanPham: item.maSanPham,
        tenSanPham: item.tenSanPham,
        soLuong: item.soLuong,
        donGia: item.donGia,
        ghiChu: item.ghiChu,
        thoiGian: toLocalDateTimeString_(new Date(Date.now() + index)),
      });
      if (!addResult?.success) {
        throw new Error(addResult?.message || "Không thêm được dòng phát sinh.");
      }
    }
    const stay = MOCK_STAYS.find((item) => String(item.maPhien || "") === maPhien);
    return {
      success: true,
      message: checkin.message || "Mở phiên trị liệu thành công.",
      data: stay ? buildStaySnapshot(stay) : checkin.data,
    };
  } catch (error) {
    restoreLocalSpaState(snapshot);
    return {
      success: false,
      message: error?.message || "Mở phiên trị liệu thất bại.",
    };
  }
};

const updateRoomStatus = async (payload = {}) => {
  await sleep(140);
  const maGiuong = String(payload.maGiuong || "").trim();
  const rawTrangThai = payload.trangThaiGiuong;
  const trangThaiGiuong =
    normalizeRoomStatusInput(rawTrangThai) || String(rawTrangThai || "").trim();
  if (!maGiuong) return { success: false, message: "Không tìm thấy giường trị liệu." };
  const room = MOCK_ROOMS.find((x) => String(x.maGiuong) === maGiuong);
  if (!room) return { success: false, message: "Không tìm thấy giường trị liệu." };
  room.trangThaiGiuong = trangThaiGiuong;
  room.updatedAt = toLocalDateTimeString_(new Date());
  return { success: true, message: "Đã cập nhật trạng thái giường.", data: normalizeBedRecord(room) };
};

const createTreatmentBed = async (payload = {}) => {
  await sleep(140);
  const maGiuong = String(payload.maGiuong || "").trim();
  const tenGiuong = String(payload.tenGiuong || "").trim();
  const loaiGiuong = String(payload.loaiGiuong || "").trim();
  const trangThaiGiuong = normalizeRoomStatusInput(payload.trangThaiGiuong) || ROOM_STATUS.AVAILABLE;
  const soKhachToiDa = Math.max(Number(payload.soKhachToiDa || 1), 1);
  const ghiChu = String(payload.ghiChu || "").trim();
  const nextRoom = normalizeBedRecord({
    maGiuong,
    tenGiuong,
    loaiGiuong,
    trangThaiGiuong: trangThaiGiuong === ROOM_STATUS.IN_HOUSE ? ROOM_STATUS.AVAILABLE : trangThaiGiuong,
    soKhachToiDa,
    ghiChu,
    updatedAt: toLocalDateTimeString_(new Date()),
  });
  MOCK_ROOMS.push(nextRoom);
  bumpLocalSyncVersion();
  return { success: true, message: "Đã thêm giường trị liệu.", data: nextRoom };
};

const updateTreatmentBed = async (payload = {}) => {
  await sleep(140);
  const maGiuong = String(payload.maGiuong || "").trim();
  if (!maGiuong) return { success: false, message: "Không tìm thấy giường trị liệu." };
  const room = MOCK_ROOMS.find((x) => String(x.maGiuong || "").trim() === maGiuong);
  if (!room) return { success: false, message: "Không tìm thấy giường trị liệu." };
  const loaiGiuong = String(payload.loaiGiuong || "").trim();
  const ghiChu = String(payload.ghiChu || "").trim();
  const nextStatus = String(payload.trangThaiGiuong || "").trim()
    ? normalizeRoomStatusInput(payload.trangThaiGiuong) || String(payload.trangThaiGiuong || "").trim()
    : room.trangThaiGiuong;
  if (payload.tenGiuong !== undefined) {
    room.tenGiuong = String(payload.tenGiuong || "").trim();
  }
  room.loaiGiuong = loaiGiuong;
  room.soKhachToiDa = Math.max(Number(payload.soKhachToiDa ?? room.soKhachToiDa), 1);
  room.ghiChu = ghiChu;
  room.trangThaiGiuong = nextStatus || room.trangThaiGiuong;
  room.updatedAt = toLocalDateTimeString_(new Date());
  bumpLocalSyncVersion();
  return { success: true, message: "Đã cập nhật giường trị liệu.", data: normalizeBedRecord(room) };
};

const deleteTreatmentBed = async (payload = {}) => {
  await sleep(140);
  const maGiuong = String(payload.maGiuong || "").trim();
  if (!maGiuong) return { success: false, message: "Không tìm thấy giường trị liệu." };
  const idx = MOCK_ROOMS.findIndex((x) => String(x.maGiuong || "").trim() === maGiuong);
  if (idx < 0) return { success: false, message: "Không tìm thấy giường trị liệu." };
  MOCK_ROOMS[idx].trangThaiGiuong = "Bảo trì";
  bumpLocalSyncVersion();
  return { success: true, message: "Đã xóa giường trị liệu." };
};

const updateProductCatalogItem = async (payload) => {
  await sleep(180);
  const p = payload || {};
  const originalTenSanPham = String(p.originalTenSanPham || "").trim();
  const originalDonVi = String(p.originalDonVi || "").trim();
  const tenSanPham = String(p.tenSanPham || "").trim();
  const nhomHang = String(p.nhomHang || "").trim();
  const donVi = String(p.donVi || "").trim();
  const donGiaBan = Math.max(Number(p.donGiaBan || 0), 0);
  const giaVon = Math.max(Number(p.giaVon || 0), 0);
  const donViLon = String(p.donViLon || "").trim();
  const quyCach = Math.max(Number(p.quyCach || 1), 1);

  if (!originalTenSanPham || !originalDonVi) {
    return {
      success: false,
      message: "Thiếu thông tin sản phẩm gốc (Mock)",
    };
  }
  if (!tenSanPham)
    return {
      success: false,
      message: "Tên sản phẩm không được để trống (Mock)",
    };
  if (!donVi)
    return {
      success: false,
      message: "Đơn vị không được để trống (Mock)",
    };
  if (donGiaBan <= 0)
    return {
      success: false,
      message: "Đơn giá bán phải lớn hơn 0 (Mock)",
    };

  const oldKey = `${foldText(originalTenSanPham)}||${foldText(originalDonVi)}`;
  const newKey = `${foldText(tenSanPham)}||${foldText(donVi)}`;
  const sourceIdx = MOCK_PRODUCTS.findIndex(
    (x) => `${foldText(x.tenSanPham)}||${foldText(x.donVi)}` === oldKey,
  );
  if (sourceIdx < 0)
    return {
      success: false,
      message: "Không tìm thấy sản phẩm để cập nhật (Mock)",
    };

  const targetIdx = MOCK_PRODUCTS.findIndex(
    (x) => `${foldText(x.tenSanPham)}||${foldText(x.donVi)}` === newKey,
  );
  if (targetIdx >= 0 && targetIdx !== sourceIdx) {
    MOCK_PRODUCTS[targetIdx] = {
      ...MOCK_PRODUCTS[targetIdx],
      tenSanPham,
      anhSanPham: String(
        p.anhSanPham ?? MOCK_PRODUCTS[targetIdx].anhSanPham ?? "",
      ),
      nhomHang,
      donVi,
      donGiaBan,
      giaVon,
      donViLon,
      quyCach,
    };
    MOCK_PRODUCTS.splice(sourceIdx, 1);
  } else {
    MOCK_PRODUCTS[sourceIdx] = {
      ...MOCK_PRODUCTS[sourceIdx],
      tenSanPham,
      anhSanPham: String(
        p.anhSanPham ?? MOCK_PRODUCTS[sourceIdx].anhSanPham ?? "",
      ),
      nhomHang,
      donVi,
      donGiaBan,
      giaVon,
      donViLon,
      quyCach,
    };
  }
  return {
    success: true,
    message: "Cập nhật sản phẩm thành công! (Mock)",
  };
};

const createProductCatalogItem = async (payload) => {
  await sleep(180);
  const p = payload || {};
  const tenSanPham = String(p.tenSanPham || "").trim();
  const nhomHang = String(p.nhomHang || "").trim();
  const donVi = String(p.donVi || "").trim();
  const donGiaBan = Math.max(Number(p.donGiaBan || 0), 0);
  const giaVon = Math.max(Number(p.giaVon || 0), 0);
  const donViLon = String(p.donViLon || "").trim();
  const quyCach = Math.max(Number(p.quyCach || 1), 1);

  if (!tenSanPham)
    return {
      success: false,
      message: "Tên sản phẩm không được để trống (Mock)",
    };
  if (!donVi)
    return {
      success: false,
      message: "Đơn vị không được để trống (Mock)",
    };
  if (donGiaBan <= 0)
    return {
      success: false,
      message: "Đơn giá bán phải lớn hơn 0 (Mock)",
    };
  const key = `${foldText(tenSanPham)}||${foldText(donVi)}`;
  const existed = MOCK_PRODUCTS.some(
    (x) => `${foldText(x.tenSanPham)}||${foldText(x.donVi)}` === key,
  );
  if (existed)
    return {
      success: false,
      message: "Sản phẩm với đơn vị này đã tồn tại (Mock)",
    };

  MOCK_PRODUCTS.push({
    tenSanPham,
    anhSanPham: String(p.anhSanPham || ""),
    nhomHang,
    donVi,
    donGiaBan,
    giaVon,
    donViLon,
    quyCach,
    loai: normalizeProductType(p),
    theoDoiTonKho: p.theoDoiTonKho !== false,
    tonKho: 0,
  });
  return {
    success: true,
    message: "Đã thêm sản phẩm thành công! (Mock)",
  };
};

const deleteProductCatalogItem = async (payload) => {
  await sleep(180);
  const p = payload || {};
  const tenSanPham = String(p.tenSanPham || "").trim();
  const donVi = String(p.donVi || "").trim();
  if (!tenSanPham || !donVi)
    return {
      success: false,
      message: "Thiếu tên sản phẩm hoặc đơn vị (Mock)",
    };
  const key = `${foldText(tenSanPham)}||${foldText(donVi)}`;
  let deleted = false;
  for (let i = MOCK_PRODUCTS.length - 1; i >= 0; i--) {
    if (
      `${foldText(MOCK_PRODUCTS[i].tenSanPham)}||${foldText(MOCK_PRODUCTS[i].donVi)}` ===
      key
    ) {
      MOCK_PRODUCTS[i].active = 0;
      deleted = true;
      break;
    }
  }
  if (!deleted)
    return {
      success: false,
      message: "Không tìm thấy sản phẩm để xóa (Mock)",
    };
  return { success: true, message: "Đã xóa (mềm) sản phẩm! (Mock)" };
};

const getCustomerCatalog = async () => {
  await sleep(150);
  const seen = new Set();
  const data = [];
  [...MOCK_CUSTOMERS, ...MOCK_STAYS].forEach((item) => {
    const tenKhach = String(item?.tenKhach || "").trim();
    if (!tenKhach || foldText(tenKhach) === "khach ghe tham") return;
    const soDienThoai = String(item?.soDienThoai || "").trim();
    const key = `${foldText(tenKhach)}||${String(soDienThoai).replace(/[^\d]/g, "")}`;
    if (seen.has(key)) return;
    seen.add(key);
    data.push({ tenKhach, soDienThoai });
  });
  return {
    success: true,
    data,
  };
};

const getCustomerProgress = async () => {
  await sleep(150);
  const trackedStatuses = getProgressTrackedStatuses();
  const rows = MOCK_STAYS
    .filter((stay) => trackedStatuses.includes(String(stay.trangThaiPhien || "").trim().toUpperCase()))
    .map((stay) => buildStaySnapshot(stay))
    .sort(
      (a, b) =>
        parseVnDateTimeToMs_(getStayStartAt(a)) - parseVnDateTimeToMs_(getStayStartAt(b)),
    );
  const grouped = new Map();
  rows.forEach((stay) => {
    const totalSessions = Math.max(Number(stay.tongBuoiCombo || 1), 1);
    const baseProgressCode = String(stay.maTienTrinh || "").trim() || String(stay.maPhien || "").trim();
    const progressCode =
      totalSessions <= 1
        ? [baseProgressCode, stay.maPhien, getStayStartAt(stay)].filter(Boolean).join("::")
        : baseProgressCode;
    const current = grouped.get(progressCode) || [];
    current.push(stay);
    grouped.set(progressCode, current);
  });
  const out = [];
  grouped.forEach((sessions, maTienTrinh) => {
    const sortedSessions = [...sessions].sort((a, b) => Number(a.buoiThu || 0) - Number(b.buoiThu || 0));
    const totalSessions = Math.max(Number(sortedSessions[0]?.tongBuoiCombo || 1), 1);
    sortedSessions.forEach((stay) => {
      const currentSessionNumber = Math.max(Number(stay.buoiThu || 1), 1);
      const batDauMs = parseVnDateTimeToMs_(getStayStartAt(stay));
      out.push({
        maTienTrinh: String(stay.maTienTrinh || maTienTrinh).trim(),
        tenKhach: String(stay.tenKhach || "").trim(),
        ngay: String(getStayStartAt(stay) || "").trim(),
        _sortMs: batDauMs,
        soDienThoai: String(stay.soDienThoai || "").trim(),
        maPhien: String(stay.maPhien || "").trim(),
        maGoi: String(stay.maGoi || "").trim(),
        goiCombo: String(stay.tenGoi || stay.tenDichVu || "").trim(),
        soBuoiCuaCombo: totalSessions,
        soBuoiConLai: Math.max(totalSessions - currentSessionNumber, 0),
        buoiThu: currentSessionNumber,
        trangThai: String(stay.trangThaiPhien || "").trim(),
        ghiChu: String(stay.ghiChu || "").trim(),
      });
    });
  });
  out.sort((a, b) => (b._sortMs || 0) - (a._sortMs || 0));
  out.forEach(r => delete r._sortMs);
  return { success: true, data: out };
};

const backfillLocalCtBanFromCheckedOutSessions = () => {
  MOCK_STAYS.forEach((stay) => {
    if (String(stay.trangThaiPhien || "").trim().toUpperCase() !== STAY_STATUS.CHECKED_OUT) {
      return;
    }
    const serviceItems = MOCK_STAY_SERVICE_ITEMS.filter(
      (x) => String(x.maPhien) === String(stay.maPhien),
    );
    appendLocalCtBanFromCheckout(stay, serviceItems);
  });
};

const getCtBanHistory = async () => {
  await sleep(120);
  backfillLocalCtBanFromCheckedOutSessions();
  return {
    success: true,
    data: MOCK_CT_BAN.map((row) => ({
      ngayThuTien: String(row.ngayThuTien || ""),
      maPhieu: String(row.maPhieu || "").trim(),
      tenKhach: String(row.tenKhach || "").trim(),
      soDienThoai: String(row.soDienThoai || "").trim(),
      nguonThu: String(row.nguonThu || "").trim().toUpperCase(),
      tenSanPham: String(row.tenSanPham || "").trim(),
      tenGoi: String(row.tenGoi || "").trim(),
      soLuong: Number(row.soLuong || 0),
      doanhThu: Number(row.doanhThu || 0),
      giaBan: Number(row.giaBan || 0),
      giaVon: Number(row.giaVon || 0),
      loiNhuan: Number(row.loiNhuan || 0),
    })),
  };
};

const getOrderHistory = async () => {
  await sleep(180);
  return {
    success: true,
    data: MOCK_ORDER_HISTORY.map((order) => ({
      ...order,
      tienNo: 0,
      trangThai: "Đã thanh toán",
    })),
  };
};

const createOrder = async (orderData) => {
  await sleep(600);
  const orderRows = buildOrderRows(orderData);
  const customerRow = orderData.customer ? buildCustomerRow(orderData) : null;
  const products = Array.isArray(orderData?.products) ? orderData.products : [];
  const totalAmount = products.reduce(
    (sum, product) => sum + Number(product.soLuong || 0) * Number(product.donGiaBan || 0),
    0,
  );
  const orderCode = String(orderData?.orderInfo?.maPhieu || "").trim() || `DH${Date.now()}`;
  const customerName = String(orderData?.customer?.tenKhach || "").trim() || "Khách ghé thăm";
  const customerPhone = String(orderData?.customer?.soDienThoai || "").trim();
  const orderDate = String(orderData?.orderInfo?.ngayBan || "").trim();
  const note = String(orderData?.orderInfo?.ghiChu || "-").trim() || "-";

  if (orderData?.orderInfo?.maPhieu) {
    mockLatestOrderCode = String(orderData.orderInfo.maPhieu);
  }

  MOCK_ORDER_HISTORY.unshift({
    maPhieu: orderCode,
    ngayBan: orderDate,
    tenKhach: customerName,
    soDienThoai: customerPhone,
    tongHoaDon: totalAmount,
    tienNo: totalAmount - Number(orderData?.orderInfo?.tienCoc || 0),
    tienCoc: Number(orderData?.orderInfo?.tienCoc || 0),
    lichTrinhChiTiet: String(orderData?.orderInfo?.lichTrinhChiTiet || ""),
    ghiChu: note,
    trangThai: "Đã thanh toán",
    products: products.map((product) => ({
      tenSanPham: product.tenSanPham,
      donVi: product.donVi,
      soLuong: Number(product.soLuong || 0),
      giaVon: Number(product.giaVon || 0),
      donGiaBan: Number(product.donGiaBan || 0),
      thanhTien: Number(product.soLuong || 0) * Number(product.donGiaBan || 0),
    })),
  });

  console.log("[Mock] DON_HANG rows:", orderRows);
  if (customerRow) console.log("[Mock] KHACH row:", customerRow);
  return {
    success: true,
    message: "Đơn hàng đã được tạo thành công! (Mock)",
  };
};

const createInventoryReceipt = async (payload) => {
  await sleep(600);
  console.log("[Mock] Nhập Kho Payload:", payload);

  if (payload?.receiptInfo?.maPhieu) {
    mockLatestReceiptCode = String(payload.receiptInfo.maPhieu).trim();
  }

  if (payload && payload.products && payload.receiptInfo) {
    payload.products.forEach((p) => {
      const normalizedReceiptStatus = "Đã thanh toán";
      // Giả lập lịch sử nhập (Cấu trúc 12 cột mới: Ngày, NCC, Phiếu, TênSP, Nhóm, SL, ĐV, Giá, Thành tiền, Tổng, Ghi chú, Trạng thái)
      MOCK_RECEIPT_HISTORY.unshift({
        maPhieu: payload.receiptInfo.maPhieu,
        ngayNhap: payload.receiptInfo.ngayNhap,
        nhaCungCap: payload.receiptInfo.nhaCungCap,
        tenSanPham: p.tenSanPham,
        nhomHang: p.nhomHang || "",
        soLuong: Number(p.soLuong || 0),
        donVi: p.donViChan,
        giaNhap: Number(p.giaNhapChan || 0),
        thanhTien: Number(p.soLuong || 0) * Number(p.giaNhapChan || 0),
        tongTienPhieu: payload.receiptInfo.tongTienPhieu || 0,
        ghiChu: payload.receiptInfo.ghiChu || "",
        trangThai: normalizedReceiptStatus,
      });

      // Tìm sản phẩm lẻ trong catalog để cập nhật tồn lẻ và giá vốn lẻ
      const prodIdx = MOCK_PRODUCTS.findIndex(
        (mp) =>
          foldText(mp.tenSanPham) === foldText(p.tenSanPham) &&
          foldText(mp.donVi) === foldText(p.donViLe),
      );

      const quyDoi = Number(p.quyDoi || 1);
      const slLeThem = Number(p.soLuong || 0) * quyDoi;
      const giaVonLe = Number(p.giaNhapChan || 0) / quyDoi;

      if (prodIdx >= 0) {
        MOCK_PRODUCTS[prodIdx].tonKho =
          (MOCK_PRODUCTS[prodIdx].tonKho || 0) + slLeThem;
        MOCK_PRODUCTS[prodIdx].giaVon = giaVonLe;
        MOCK_PRODUCTS[prodIdx].donViLon = p.donViChan;
        MOCK_PRODUCTS[prodIdx].quyCach = quyDoi;
      } else {
        // Tự tạo mới nếu chưa có (như logic syncProductCatalog_ của GAS)
        MOCK_PRODUCTS.push({
          tenSanPham: p.tenSanPham,
          nhomHang: p.nhomHang,
          donVi: p.donViLe,
          donGiaBan: 0,
          giaVon: giaVonLe,
          donViLon: p.donViChan,
          quyCach: quyDoi,
          tonKho: slLeThem,
        });
      }
    });
  }

  return { success: true, message: "Nhập kho thành công! (Mock)" };
};

const updateOrder = async (payload) => {
  await sleep(450);
  const maPhieuOriginal = String(payload?.maPhieuOriginal || "").trim();
  const orderInfo = payload?.orderInfo || {};
  const products = Array.isArray(payload?.products) ? payload.products : [];
  if (!maPhieuOriginal)
    return { success: false, message: "Thiếu mã phiếu gốc (Mock)" };
  if (!products.length)
    return {
      success: false,
      message: "Đơn hàng phải có sản phẩm (Mock)",
    };

  const idx = MOCK_ORDER_HISTORY.findIndex(
    (o) => o.maPhieu === maPhieuOriginal,
  );
  if (idx < 0)
    return {
      success: false,
      message: "Không tìm thấy hóa đơn để sửa (Mock)",
    };

  const tongHoaDon = products.reduce(
    (sum, p) => sum + Number(p.soLuong || 0) * Number(p.donGiaBan || 0),
    0,
  );

  MOCK_ORDER_HISTORY[idx] = {
    ...MOCK_ORDER_HISTORY[idx],
    maPhieu:
      String(orderInfo.maPhieu || maPhieuOriginal).trim() || maPhieuOriginal,
    ngayBan: String(orderInfo.ngayBan || MOCK_ORDER_HISTORY[idx].ngayBan),
    tenKhach:
      String(payload?.customer?.tenKhach || "").trim() || "Khách ghé thăm",
    soDienThoai:
      String(payload?.customer?.soDienThoai || "").trim() ||
      String(MOCK_ORDER_HISTORY[idx].soDienThoai || "").trim(),
    tongHoaDon,
    tienNo: 0,
    ghiChu: String(orderInfo.ghiChu || "-"),
    trangThai: "Đã thanh toán",
    products: products.map((p) => ({
      tenSanPham: p.tenSanPham,
      donVi: p.donVi,
      soLuong: Number(p.soLuong || 0),
      giaVon: Number(p.giaVon || 0),
      donGiaBan: Number(p.donGiaBan || 0),
      thanhTien: Number(p.soLuong || 0) * Number(p.donGiaBan || 0),
    })),
  };

  return {
    success: true,
    message: "Cập nhật hóa đơn thành công! (Mock)",
  };
};

const deleteOrder = async (maPhieu) => {
  await sleep(300);
  const key = String(maPhieu || "").trim();
  if (!key) return { success: false, message: "Thiếu mã phiếu (Mock)" };
  const before = MOCK_ORDER_HISTORY.length;
  for (let i = MOCK_ORDER_HISTORY.length - 1; i >= 0; i--) {
    if (String(MOCK_ORDER_HISTORY[i]?.maPhieu || "").trim() === key) {
      MOCK_ORDER_HISTORY.splice(i, 1);
    }
  }
  if (before === MOCK_ORDER_HISTORY.length) {
    return {
      success: false,
      message: "Không tìm thấy hóa đơn để xóa (Mock)",
    };
  }
  return { success: true, message: "Xóa hóa đơn thành công! (Mock)" };
};

const createReceiptPdf = async (maPhieu) => {
  await sleep(400);
  const key = String(maPhieu || "").trim();
  if (!key) return { success: false, message: "Thiếu mã phiếu. (Mock)" };
  return {
    success: true,
    url: "#",
    downloadUrl: "#",
    name: `Hoa-don-${key}.pdf`,
  };
};

const getInventory = async () => {
  await sleep(150);
  return {
    success: true,
    data: MOCK_PRODUCTS.map((p, idx) => ({
      ...ensureCatalogItemIdentity(p, idx),
      tonKho:
        p.tonKho !== undefined ? p.tonKho : Math.floor(Math.random() * 50) + 10,
    })),
  };
};

const MOCK_RECEIPT_HISTORY = [
  {
    maPhieu: "NH001",
    ngayNhap: "2023-10-01",
    nhaCungCap: "NCC A",
    tenSanPham: "Sản phẩm 1",
    donVi: "Cái",
    soLuong: 100,
    donGiaNhap: 50000,
    thanhTien: 5000000,
    tongTienPhieu: 15000000,
    ghiChu: "",
  },
  {
    maPhieu: "NH001",
    ngayNhap: "2023-10-01",
    nhaCungCap: "NCC A",
    tenSanPham: "Sản phẩm 2",
    donVi: "Hộp",
    soLuong: 50,
    donGiaNhap: 200000,
    thanhTien: 10000000,
    tongTienPhieu: 15000000,
    ghiChu: "",
  },
];

const getReceiptHistory = async () => {
  await sleep(150);
  return {
    success: true,
    data: MOCK_RECEIPT_HISTORY,
  };
};

const getAppSetting = async (key) => {
  await sleep(150);
  const val = localStorage.getItem("app_setting_" + key);
  return { success: true, data: val };
};

const bumpLocalSyncVersion = () => {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    const next = String(Number(readLocalSyncVersion() || "0") + 1);
    window.localStorage.setItem(LOCAL_SYNC_VERSION_KEY, next);
  } catch (_) {
    // Ignore storage failures in mock mode.
  }
};

const readLocalSyncVersion = () => {
  if (typeof window === "undefined" || !window.localStorage) return "1";
  try {
    const raw = window.localStorage.getItem(LOCAL_SYNC_VERSION_KEY);
    if (raw) return String(raw);
    window.localStorage.setItem(LOCAL_SYNC_VERSION_KEY, "1");
  } catch (_) {
    // Keep default when localStorage is unavailable.
  }
  return "1";
};

const getSyncVersion = async () => {
  await sleep(80);
  return {
    success: true,
    data: {
      version: readLocalSyncVersion(),
    },
  };
};

const setAppSetting = async (payload) => {
  await sleep(150);
  if (!payload || !payload.key)
    return { success: false, message: "Missing key" };
  localStorage.setItem("app_setting_" + payload.key, String(payload.value));
  return { success: true, message: "Đã lưu cài đặt (Mock)" };
};

const call = async (fnName, ...args) => {
  console.log(`[Local Mock API] call: ${fnName}`, args);
  if (fnName === "helloServer") return helloServer();
  if (fnName === "login") return login(args[0], args[1]);
  if (fnName === "loginWithDeviceToken")
    return loginWithDeviceToken(args[0], args[1]);
  if (fnName === "revokeDeviceToken")
    return revokeDeviceToken(args[0], args[1]);
  if (fnName === "getUserInfo") return getUserInfo(args[0]);
  if (fnName === "getDemoAccounts") return getDemoAccounts();
  if (fnName === "getGlobalNotice") return getGlobalNotice();
  if (fnName === "initSpaSheets") return initSpaSheets();
  if (fnName === "simplifySpaSheets") return simplifySpaSheets();
  if (fnName === "loadSpaPresetTlcData") return loadSpaPresetTlcData();
  if (fnName === "getSpaKpiReport") return getSpaKpiReport(args[0]);
  if (fnName === "getNextOrderFormDefaults") return getNextOrderFormDefaults();
  if (fnName === "getNextInventoryReceiptDefaults")
    return getNextInventoryReceiptDefaults();
  if (fnName === "getProductCatalog") return getProductCatalog();
  if (fnName === "getBankConfig") return getBankConfig();
  if (fnName === "getRooms") return getRooms();
  if (fnName === "getSpaStaff") return getSpaStaff();
  if (fnName === "createSpaStaff") return createSpaStaff(args[0]);
  if (fnName === "updateSpaStaff") return updateSpaStaff(args[0]);
  if (fnName === "deleteSpaStaff") return deleteSpaStaff(args[0]);
  if (fnName === "updateSpaStaffSchedule")
    return updateSpaStaffSchedule(args[0]);
  if (fnName === "getSpaStaffSchedules") return getSpaStaffSchedules();
  if (fnName === "updateSpaStaffSchedules") return updateSpaStaffSchedules(args[0]);
  if (fnName === "getSpaAttendance") return getSpaAttendance(args[0] || {});
  if (fnName === "recordSpaAttendance") return recordSpaAttendance(args[0]);
  if (fnName === "getSpaShiftChecklists") return getSpaShiftChecklists(args[0] || {});
  if (fnName === "saveSpaShiftChecklist") return saveSpaShiftChecklist(args[0]);
  if (fnName === "getSpaStaffViolations") return getSpaStaffViolations(args[0] || {});
  if (fnName === "saveSpaStaffViolation") return saveSpaStaffViolation(args[0]);
  if (fnName === "cancelSpaStaffViolation") return cancelSpaStaffViolation(args[0]);
  if (fnName === "getSpaStaffLeaveRequests") return getSpaStaffLeaveRequests(args[0] || {});
  if (fnName === "saveSpaStaffLeaveRequest") return saveSpaStaffLeaveRequest(args[0]);
  if (fnName === "reviewSpaStaffLeaveRequest") return reviewSpaStaffLeaveRequest(args[0]);
  if (fnName === "getSpaStaffTrainings") return getSpaStaffTrainings(args[0] || {});
  if (fnName === "saveSpaStaffTraining") return saveSpaStaffTraining(args[0]);
  if (fnName === "getSpaPayrollRecords") return getSpaPayrollRecords(args[0] || {});
  if (fnName === "lockSpaPayrollPeriod") return lockSpaPayrollPeriod(args[0]);
  if (fnName === "getTreatmentPackages") return getTreatmentPackages();
  if (fnName === "getTreatmentCatalogs") return getTreatmentCatalogs();
  if (fnName === "saveTreatmentCatalogs") return saveTreatmentCatalogs(args[0]);
  if (fnName === "getTreatmentBeds") return getTreatmentBeds();
  if (fnName === "getStayHistory") return getStayHistory(args[0]);
  if (fnName === "getTreatmentHistory") return getTreatmentHistory(args[0]);
  if (fnName === "createBooking") return createBooking(args[0]);
  if (fnName === "createBookingWithItems") return createBookingWithItems(args[0]);
  if (fnName === "createSpaBooking") return createSpaBooking(args[0]);
  if (fnName === "createSpaBookingWithItems")
    return createSpaBookingWithItems(args[0]);
  if (fnName === "checkInRoom") return checkInRoom(args[0]);
  if (fnName === "checkInRoomWithItems") return checkInRoomWithItems(args[0]);
  if (fnName === "startTreatmentSession") return startTreatmentSession(args[0]);
  if (fnName === "startTreatmentSessionWithItems")
    return startTreatmentSessionWithItems(args[0]);
  if (fnName === "addStayServiceItem") return addStayServiceItem(args[0]);
  if (fnName === "addTreatmentServiceItem")
    return addTreatmentServiceItem(args[0]);
  if (fnName === "updateComboSchedule" || fnName === "updateComboSchedule_")
    return updateComboSchedule(args[0]);
  if (fnName === "checkoutRoom") return checkoutRoom(args[0]);
  if (fnName === "completeTreatmentSession")
    return completeTreatmentSession(args[0]);
  if (fnName === "markTreatmentNoShow") return markTreatmentNoShow(args[0]);
  if (fnName === "updateRoomStatus") return updateRoomStatus(args[0]);
  if (fnName === "createTreatmentBed") return createTreatmentBed(args[0]);
  if (fnName === "updateTreatmentBed") return updateTreatmentBed(args[0]);
  if (fnName === "deleteTreatmentBed") return deleteTreatmentBed(args[0]);
  if (fnName === "updateTreatmentServiceItem")
    return updateTreatmentServiceItem(args[0]);
  if (fnName === "deleteTreatmentServiceItem")
    return deleteTreatmentServiceItem(args[0]);
  if (fnName === "updateTreatmentSessionTime")
    return updateTreatmentSessionTime(args[0]);
  if (fnName === "updateProductCatalogItem")
    return updateProductCatalogItem(args[0]);
  if (fnName === "createProductCatalogItem")
    return createProductCatalogItem(args[0]);
  if (fnName === "deleteProductCatalogItem")
    return deleteProductCatalogItem(args[0]);
  if (fnName === "getCustomerCatalog") return getCustomerCatalog();
  if (fnName === "getSupplierCatalog") return getSupplierCatalog();
  if (fnName === "getOrderHistory") return getOrderHistory();
  if (fnName === "createReceiptPdf") return createReceiptPdf(args[0]);
  if (fnName === "createOrder") return createOrder(args[0]);
  if (fnName === "createInventoryReceipt")
    return createInventoryReceipt(args[0]);
  if (fnName === "updateOrder") return updateOrder(args[0]);
  if (fnName === "deleteOrder") return deleteOrder(args[0]);
  if (fnName === "getInventory") return getInventory();
  if (fnName === "getReceiptHistory") return getReceiptHistory();
  if (fnName === "getSyncVersion") return getSyncVersion();
  if (fnName === "getAppSetting") return getAppSetting(args[0]);
  if (fnName === "setAppSetting") return setAppSetting(args[0]);
  if (fnName === "getInventorySuggestions") return getInventorySuggestions();
  if (fnName === "formatAllSheets")
    return { success: true, message: "Mock formatting done" };

  return { success: false, message: `Hàm ${fnName} chưa được mock.` };
};

const getTreatmentBeds = async () => getRooms();
const getSpaStaffCatalog = async () => getSpaStaff();
const getTreatmentHistory = async (filters = {}) => getStayHistory(filters);
const createSpaBooking = async (payload = {}) => createBooking(payload);
const createSpaBookingWithItems = async (payload = {}) =>
  createBookingWithItems(payload);
const startTreatmentSession = async (payload = {}) => checkInRoom(payload);
const startTreatmentSessionWithItems = async (payload = {}) =>
  checkInRoomWithItems(payload);
const addTreatmentServiceItem = async (payload = {}) =>
  addStayServiceItem(payload);
const completeTreatmentSession = async (payload = {}) => checkoutRoom(payload);
const markSpaAppointmentNoShow = async (payload = {}) => markTreatmentNoShow(payload);
const updateTreatmentServiceItem = async (payload = {}) =>
  updateStayServiceItem(payload);
const deleteTreatmentServiceItem = async (payload = {}) =>
  deleteStayServiceItem(payload);
const updateTreatmentSessionTime = async (payload = {}) =>
  updateStayTime(payload);

const getSupplierCatalog = async () => {
  await sleep(150);
  const seen = new Set();
  const data = [];
  MOCK_RECEIPT_HISTORY.forEach((item) => {
    const tenNCC = String(item?.nhaCungCap || "").trim();
    if (!tenNCC) return;
    const key = foldText(tenNCC);
    if (seen.has(key)) return;
    seen.add(key);
    data.push({ tenNCC, soDienThoai: "" });
  });
  return {
    success: true,
    data,
  };
};

const getInventorySuggestions = async () => {
  await sleep(150);
  // Mô phỏng lấy dữ liệu từ MOCK_PRODUCTS và MOCK_RECEIPT_HISTORY
  const suggestionsMap = {};

  // Từ Products (Master)
  MOCK_PRODUCTS.forEach((p) => {
    const key = `${foldText(p.tenSanPham)}||${foldText(p.donVi)}`;
    suggestionsMap[key] = {
      tenSanPham: p.tenSanPham,
      nhomHang: p.nhomHang,
      donViChan: p.donViLon || p.donVi,
      donViLe: p.donVi,
      quyDoi: p.quyCach || 1,
      giaNhapChan: (p.giaVon || 0) * (p.quyCach || 1),
      source: "MASTER",
    };
  });

  // Từ Lịch sử nhập (có thể có giá nhập khác hoặc đơn vị khác)
  MOCK_RECEIPT_HISTORY.forEach((r) => {
    const key = `${foldText(r.tenSanPham)}||${foldText(r.donVi)}`;
    if (!suggestionsMap[key] || suggestionsMap[key].source === "MASTER") {
      suggestionsMap[key] = {
        tenSanPham: r.tenSanPham,
        nhomHang: r.nhomHang,
        donViChan: r.donVi,
        donViLe: suggestionsMap[key]?.donViLe || "",
        quyDoi: suggestionsMap[key]?.quyDoi || 1,
        giaNhapChan: r.donGiaNhap || r.giaNhap || 0,
        source: "HISTORY",
      };
    }
  });

  return { success: true, data: Object.values(suggestionsMap) };
};

const uploadImageToImgBB = async (base64Data) => {
  await sleep(300);
  if (!base64Data)
    return { success: false, message: "Dữ liệu ảnh trống (Mock)" };
  // Mock: trả về chính base64 data làm URL (hoạt động với <img src>)
  return {
    success: true,
    data: {
      url: base64Data,
      thumb: base64Data,
    },
  };
};

const logAction = async (payload) => {
  await sleep(100);
  const p = payload || {};
  console.log(
    `[LOG] ${p.status || "SUCCESS"} | ${p.userName || "unknown"} | ${p.changeDescription || ""} ${p.errorMessage ? "| " + p.errorMessage : ""}`,
  );
  return { success: true };
};

const issueEasyInvoice = async (payload) => {
  await sleep(1500);
  const orderData = payload?.orderData || {};
  const maPhieu = orderData.maPhieu || "UNKNOWN";
  
  const invNo = "INV-" + maPhieu;
  const lCode = "ABCDEF1234";
  const stText = "Đã phát hành";

  // Cập nhật vào mockOrders để khi load lại list trên localhost sẽ thấy
  const orderIndex = MOCK_ORDER_HISTORY.findIndex(o => o.maPhieu === maPhieu);
  if (orderIndex !== -1) {
    MOCK_ORDER_HISTORY[orderIndex].invoiceNo = invNo;
    MOCK_ORDER_HISTORY[orderIndex].lookupCode = lCode;
    MOCK_ORDER_HISTORY[orderIndex].statusText = stText;
  }

  return {
    success: true,
    message: "Phát hành hóa đơn thành công (Mock)!",
    invoiceNo: invNo,
    lookupCode: lCode,
    statusText: stText
  };
};

const cancelEasyInvoice = async (payload) => {
  await sleep(1500);
  const maPhieu = String(payload?.maPhieu || "").trim();
  
  const orderIndex = MOCK_ORDER_HISTORY.findIndex(o => o.maPhieu === maPhieu);
  if (orderIndex !== -1) {
    MOCK_ORDER_HISTORY[orderIndex].statusText = "Đã hủy";
  }

  return {
    success: true,
    message: "Hủy hóa đơn thành công (Mock)!",
  };
};

const replaceEasyInvoice = async (payload) => {
  await sleep(1500);
  const maPhieu = String(payload?.maPhieu || "").trim();
  
  const invNo = "INV-" + maPhieu + "-R1";
  const lCode = "ABCDEF1234|IKEY:mock-uuid";
  const stText = "Đã thay thế";

  const orderIndex = MOCK_ORDER_HISTORY.findIndex(o => o.maPhieu === maPhieu);
  if (orderIndex !== -1) {
    MOCK_ORDER_HISTORY[orderIndex].invoiceNo = invNo;
    MOCK_ORDER_HISTORY[orderIndex].lookupCode = lCode;
    MOCK_ORDER_HISTORY[orderIndex].statusText = stText;
  }

  return {
    success: true,
    message: "Thay thế hóa đơn thành công (Mock)!",
    invoiceNo: invNo,
    lookupCode: lCode,
    statusText: stText
  };
};

const downloadInvoicePDF = async (payload) => {
  await sleep(1000);
  return {
    success: true,
    message: "Tải file PDF thành công (Mock)",
    base64: "JVBERi0xLjQKJ..." // Mock PDF content
  };
};

export const localAdapter = {
  call,
  helloServer,
  login,
  loginWithDeviceToken,
  revokeDeviceToken,
  getUserInfo,
  getDemoAccounts,
  getGlobalNotice,
  initSpaSheets,
  simplifySpaSheets,
  loadSpaPresetTlcData,
  getSpaKpiReport,
  getNextOrderFormDefaults,
  getNextInventoryReceiptDefaults,
  getProductCatalog,
  getBankConfig,
  getRooms,
  getSpaStaff: getSpaStaffCatalog,
  getSpaStaffSchedules,
  updateSpaStaffSchedules,
  getSpaAttendance,
  recordSpaAttendance,
  getSpaShiftChecklists,
  saveSpaShiftChecklist,
  getSpaStaffViolations,
  saveSpaStaffViolation,
  cancelSpaStaffViolation,
  getSpaStaffLeaveRequests,
  saveSpaStaffLeaveRequest,
  reviewSpaStaffLeaveRequest,
  getSpaStaffTrainings,
  saveSpaStaffTraining,
  getSpaPayrollRecords,
  lockSpaPayrollPeriod,
  updateSpaStaffSchedule,
  createSpaStaff,
  updateSpaStaff,
  deleteSpaStaff,
  getTreatmentPackages,
  getTreatmentCatalogs,
  saveTreatmentCatalogs,
  getTreatmentBeds,
  getStayHistory,
  getTreatmentHistory,
  createBooking,
  createBookingWithItems,
  createSpaBooking,
  createSpaBookingWithItems,
  checkInRoom,
  checkInRoomWithItems,
  startTreatmentSession,
  startTreatmentSessionWithItems,
  addStayServiceItem,
  addTreatmentServiceItem,
  updateComboSchedule,
  checkoutRoom,
  completeTreatmentSession,
  markTreatmentNoShow,
  markSpaAppointmentNoShow,
  updateRoomStatus,
  createTreatmentBed,
  updateTreatmentBed,
  deleteTreatmentBed,
  logClientError,
  updateStayServiceItem,
  updateTreatmentServiceItem,
  deleteStayServiceItem,
  deleteTreatmentServiceItem,
  updateStayTime,
  updateTreatmentSessionTime,
  updateProductCatalogItem,
  createProductCatalogItem,
  deleteProductCatalogItem,
  getCustomerCatalog,
  getCustomerProgress,
  getCtBanHistory,
  getSupplierCatalog,
  getOrderHistory,
  createReceiptPdf,
  createOrder,
  createInventoryReceipt,
  updateOrder,
  deleteOrder,
  getInventory,
  getReceiptHistory,
  getSyncVersion,
  getInventorySuggestions,
  getAppSetting,
  setAppSetting,
  uploadImageToImgBB,
  logAction,
  issueEasyInvoice,
  cancelEasyInvoice,
  replaceEasyInvoice,
  downloadInvoicePDF,
  formatAllSheets: async () => call("formatAllSheets"),
};


