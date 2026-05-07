import { buildOrderRows, buildCustomerRow } from "../../../core/core.js";

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

const MOCK_BANK_CONFIG = {
  bankCode: "mbbank",
  accountNumber: "201130122003",
  accountName: "Nguyễn Anh Đức",
};

const ROOM_STATUS = Object.freeze({
  AVAILABLE: "Trống",
  IN_HOUSE: "Đang ở",
  CLEANING: "Đang dọn",
  BOOKED: "Đã đặt trước",
  MAINTENANCE: "Bảo trì",
});

const STAY_STATUS = Object.freeze({
  BOOKED: "BOOKED",
  IN_HOUSE: "IN_HOUSE",
  CHECKED_OUT: "CHECKED_OUT",
  CANCELLED: "CANCELLED",
});

const MOCK_ROOMS = [
  {
    maPhong: "P101",
    tenPhong: "Phòng 101",
    loaiPhong: "Deluxe",
    trangThaiPhong: ROOM_STATUS.AVAILABLE,
    giaTheoDem: 650000,
    giaTheoGio: 120000,
    soKhachToiDa: 2,
    ghiChu: "",
    updatedAt: "",
  },
  {
    maPhong: "P102",
    tenPhong: "Phòng 102",
    loaiPhong: "Standard",
    trangThaiPhong: ROOM_STATUS.CLEANING,
    giaTheoDem: 520000,
    giaTheoGio: 95000,
    soKhachToiDa: 2,
    ghiChu: "",
    updatedAt: "",
  },
  {
    maPhong: "P201",
    tenPhong: "Phòng 201",
    loaiPhong: "Family",
    trangThaiPhong: ROOM_STATUS.BOOKED,
    giaTheoDem: 880000,
    giaTheoGio: 160000,
    soKhachToiDa: 4,
    ghiChu: "",
    updatedAt: "",
  },
  {
    maPhong: "P202",
    tenPhong: "Phòng 202",
    loaiPhong: "Suite",
    trangThaiPhong: ROOM_STATUS.MAINTENANCE,
    giaTheoDem: 1200000,
    giaTheoGio: 250000,
    soKhachToiDa: 3,
    ghiChu: "Đang sửa điều hòa",
    updatedAt: "",
  },
];

const MOCK_STAYS = [];
const MOCK_STAY_SERVICE_ITEMS = [];

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
const foldText = (v) =>
  String(v || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .trim();

const getTodayInputDate = () => {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().split("T")[0];
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
    group.includes("phòng") ||
    group.includes("room")
  )
    return "ROOM";
  if (
    group.includes("dịch vụ") ||
    group.includes("service")
  )
    return "DICH_VU";
  if (
    group.includes("đồ ăn") ||
    group.includes("thức uống") ||
    group.includes("nuoc") ||
    group.includes("banh")
  )
    return "MENU";
  return "VAT_TU";
};

const toIsoStringOrNow = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return new Date().toISOString();
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
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

const nextStayCode = () => {
  mockLatestStayCode = incrementOrderCode(mockLatestStayCode, "LT00001");
  return mockLatestStayCode;
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
  const serviceItems = MOCK_STAY_SERVICE_ITEMS.filter(
    (x) => String(x.maLuuTru) === String(stay.maLuuTru),
  );
  const tienDichVu = serviceItems.reduce(
    (sum, item) => sum + Number(item.thanhTien || 0),
    0,
  );
  const tongThanhToan = Number(stay.tienPhong || 0) + tienDichVu;
  const daThuCheckin = Number(stay.daThuCheckin || 0);
  const canThuCheckout = Math.max(tienDichVu, 0);
  return {
    ...stay,
    tienDichVu,
    tongThanhToan,
    daThuCheckin,
    canThuCheckout,
    serviceItems,
  };
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
  );
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
    data: [...MOCK_ROOMS].sort((a, b) =>
      String(a.maPhong || "").localeCompare(String(b.maPhong || ""), "vi"),
    ),
  };
};

const getStayHistory = async (filters = {}) => {
  await sleep(140);
  const keyword = foldText(filters?.keyword);
  const statusFilter = String(filters?.trangThai || "").trim().toUpperCase();
  const roomFilter = String(filters?.maPhong || "").trim();
  const fromDate = String(filters?.fromDate || "").trim();
  const toDate = String(filters?.toDate || "").trim();

  let list = MOCK_STAYS.map((stay) => buildStaySnapshot(stay));
  if (statusFilter) {
    list = list.filter((stay) =>
      String(stay.trangThaiLuuTru || "").toUpperCase() === statusFilter,
    );
  }
  if (roomFilter) {
    list = list.filter((stay) => String(stay.maPhong || "") === roomFilter);
  }
  if (keyword) {
    list = list.filter((stay) => {
      const source = [
        stay.maLuuTru,
        stay.maPhong,
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
        (stay) => new Date(stay.checkinAt || 0).getTime() >= fromMs,
      );
    }
  }
  if (toDate) {
    const toMs = new Date(toDate).getTime();
    if (Number.isFinite(toMs)) {
      list = list.filter(
        (stay) => new Date(stay.checkinAt || 0).getTime() <= toMs + 86400000,
      );
    }
  }

  list.sort(
    (a, b) =>
      new Date(b.checkinAt || 0).getTime() - new Date(a.checkinAt || 0).getTime(),
  );
  return { success: true, data: list };
};

const createBooking = async (payload = {}) => {
  await sleep(180);
  const maPhong = String(payload.maPhong || "").trim();
  if (!maPhong) return { success: false, message: "Thiếu mã phòng." };
  const room = MOCK_ROOMS.find((x) => String(x.maPhong) === maPhong);
  if (!room) return { success: false, message: "Không tìm thấy phòng." };
  if (room.trangThaiPhong === ROOM_STATUS.IN_HOUSE) {
    return { success: false, message: "Phòng đang có khách ở." };
  }
  room.trangThaiPhong = ROOM_STATUS.BOOKED;
  room.updatedAt = new Date().toISOString();
  return {
    success: true,
    message: `Đã đặt trước ${room.tenPhong}.`,
    data: room,
  };
};

const checkInRoom = async (payload = {}) => {
  await sleep(220);
  const maPhong = String(payload.maPhong || "").trim();
  const tenKhach = String(payload.tenKhach || "").trim();
  if (!maPhong || !tenKhach) {
    return { success: false, message: "Thiếu thông tin phòng hoặc khách." };
  }
  const room = MOCK_ROOMS.find((x) => String(x.maPhong) === maPhong);
  if (!room) return { success: false, message: "Không tìm thấy phòng." };
  if (room.trangThaiPhong === ROOM_STATUS.IN_HOUSE) {
    return { success: false, message: "Phòng đang có khách ở." };
  }
  if (room.trangThaiPhong === ROOM_STATUS.MAINTENANCE) {
    return { success: false, message: "Phòng đang bảo trì." };
  }

  const hinhThucTinhGia =
    String(payload.hinhThucTinhGia || "THEO_DEM").trim().toUpperCase() ===
    "THEO_GIO"
      ? "THEO_GIO"
      : "THEO_DEM";
  const checkinAt = toIsoStringOrNow(payload.checkinAt);
  const checkoutAtDuKien = toIsoStringOrNow(
    payload.checkoutAtDuKien || payload.checkinAt,
  );
  const donGiaPhongApDung = Math.max(
    0,
    Number(
      payload.donGiaPhongApDung ||
        (hinhThucTinhGia === "THEO_GIO" ? room.giaTheoGio : room.giaTheoDem),
    ),
  );
  const soGio =
    hinhThucTinhGia === "THEO_GIO"
      ? diffHoursRoundedUp(checkinAt, checkoutAtDuKien)
      : 0;
  const soDem =
    hinhThucTinhGia === "THEO_DEM"
      ? diffNightsRoundedUp(checkinAt, checkoutAtDuKien)
      : 0;
  const tienPhong =
    hinhThucTinhGia === "THEO_GIO"
      ? soGio * donGiaPhongApDung
      : soDem * donGiaPhongApDung;
  const maLuuTru = nextStayCode();

  const stay = {
    maLuuTru,
    maPhong,
    tenKhach,
    soDienThoai: String(payload.soDienThoai || "").trim(),
    giayTo: String(payload.giayTo || "").trim(),
    hinhThucTinhGia,
    checkinAt,
    checkoutAtDuKien,
    checkoutAtThucTe: "",
    soDem,
    soGio,
    donGiaPhongApDung,
    tienPhong,
    tienDichVu: 0,
    tongThanhToan: tienPhong,
    daThuCheckin: tienPhong,
    canThuCheckout: 0,
    trangThaiLuuTru: STAY_STATUS.IN_HOUSE,
    ghiChu: String(payload.ghiChu || "").trim(),
  };

  MOCK_STAYS.unshift(stay);
  room.trangThaiPhong = ROOM_STATUS.IN_HOUSE;
  room.updatedAt = new Date().toISOString();

  return {
    success: true,
    message: `Checkin thành công ${room.tenPhong}.`,
    data: buildStaySnapshot(stay),
  };
};

const addStayServiceItem = async (payload = {}) => {
  await sleep(200);
  const maLuuTru = String(payload.maLuuTru || "").trim();
  if (!maLuuTru) return { success: false, message: "Thiếu mã lưu trú." };

  const stay = MOCK_STAYS.find((x) => String(x.maLuuTru) === maLuuTru);
  if (!stay) return { success: false, message: "Không tìm thấy hồ sơ lưu trú." };
  if (stay.trangThaiLuuTru !== STAY_STATUS.IN_HOUSE) {
    return {
      success: false,
      message: "Chỉ có thể thêm dịch vụ cho phòng đang ở.",
    };
  }

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
  if (!found) return { success: false, message: "Không tìm thấy dịch vụ/món." };

  const soLuong = Math.max(1, Number(payload.soLuong || 1));
  const donGia = Math.max(0, Number(payload.donGia || found.donGiaBan || 0));
  const thanhTien = soLuong * donGia;
  MOCK_STAY_SERVICE_ITEMS.push({
    maLuuTru,
    thoiGian: new Date().toISOString(),
    maSanPham: found.maSanPham,
    tenSanPham: found.tenSanPham,
    nhomHang: found.nhomHang || "",
    donVi: found.donVi || "",
    soLuong,
    donGia,
    thanhTien,
    ghiChu: String(payload.ghiChu || "").trim(),
  });

  stay.tienDichVu = (Number(stay.tienDichVu || 0) + thanhTien);
  stay.tongThanhToan = Number(stay.tienPhong || 0) + Number(stay.tienDichVu || 0);
  stay.canThuCheckout = Number(stay.tienDichVu || 0);

  return {
    success: true,
    message: "Đã thêm phát sinh dịch vụ.",
    data: buildStaySnapshot(stay),
  };
};

const checkoutRoom = async (payload = {}) => {
  await sleep(220);
  const maLuuTru = String(payload.maLuuTru || "").trim();
  if (!maLuuTru) return { success: false, message: "Thiếu mã lưu trú." };
  const stay = MOCK_STAYS.find((x) => String(x.maLuuTru) === maLuuTru);
  if (!stay) return { success: false, message: "Không tìm thấy hồ sơ lưu trú." };
  if (stay.trangThaiLuuTru !== STAY_STATUS.IN_HOUSE) {
    return {
      success: false,
      message: "Hồ sơ lưu trú không ở trạng thái đang ở.",
    };
  }

  stay.checkoutAtThucTe = toIsoStringOrNow(payload.checkoutAtThucTe);
  stay.trangThaiLuuTru = STAY_STATUS.CHECKED_OUT;
  stay.ghiChu = String(payload.ghiChu || stay.ghiChu || "").trim();
  stay.canThuCheckout = Number(stay.tienDichVu || 0);

  const room = MOCK_ROOMS.find((x) => String(x.maPhong) === String(stay.maPhong));
  if (room) {
    room.trangThaiPhong = ROOM_STATUS.CLEANING;
    room.updatedAt = new Date().toISOString();
  }

  return {
    success: true,
    message: "Checkout thành công. Phòng chuyển sang Đang dọn.",
    data: buildStaySnapshot(stay),
  };
};

const updateRoomStatus = async (payload = {}) => {
  await sleep(140);
  const maPhong = String(payload.maPhong || "").trim();
  const trangThaiPhong = String(payload.trangThaiPhong || "").trim();
  if (!maPhong || !trangThaiPhong) {
    return { success: false, message: "Thiếu mã phòng hoặc trạng thái phòng." };
  }
  const room = MOCK_ROOMS.find((x) => String(x.maPhong) === maPhong);
  if (!room) return { success: false, message: "Không tìm thấy phòng." };
  room.trangThaiPhong = trangThaiPhong;
  room.updatedAt = new Date().toISOString();
  return { success: true, message: "Đã cập nhật trạng thái phòng.", data: room };
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
  const before = MOCK_PRODUCTS.length;
  for (let i = MOCK_PRODUCTS.length - 1; i >= 0; i--) {
    if (
      `${foldText(MOCK_PRODUCTS[i].tenSanPham)}||${foldText(MOCK_PRODUCTS[i].donVi)}` ===
      key
    ) {
      MOCK_PRODUCTS.splice(i, 1);
      break;
    }
  }
  if (before === MOCK_PRODUCTS.length)
    return {
      success: false,
      message: "Không tìm thấy sản phẩm để xóa (Mock)",
    };
  return { success: true, message: "Đã xóa sản phẩm! (Mock)" };
};

const getCustomerCatalog = async () => {
  await sleep(150);
  return {
    success: true,
    data: MOCK_CUSTOMERS.filter(
      (c) =>
        String(c?.tenKhach || "")
          .trim()
          .toLowerCase() !== "khách ghé thăm",
    ),
  };
};

const getOrderHistory = async () => {
  await sleep(180);
  return {
    success: true,
    data: MOCK_ORDER_HISTORY,
  };
};

const normalizeDebtStatus = (value) => {
  const key = foldText(value).replace(/\s+/g, " ");
  if (key.includes("tra mot phan") || key.includes("tra 1 phan"))
    return "Trả một phần";
  if (key === "no" || key.includes(" no ")) return "Nợ";
  return "Đã thanh toán";
};

const getPhoneByCustomerName = (tenKhach) => {
  const key = foldText(tenKhach);
  const found = MOCK_CUSTOMERS.find((c) => foldText(c.tenKhach) === key);
  return found?.soDienThoai || "";
};

const getDebtCustomers = async () => {
  await sleep(180);
  return {
    success: true,
    data: MOCK_ORDER_HISTORY.map((o, idx) => ({
      stt: idx + 1,
      tenKhach: o.tenKhach || "Khách ghé thăm",
      ngayBan: o.ngayBan || "",
      soDienThoai: o.soDienThoai || getPhoneByCustomerName(o.tenKhach),
      maPhieu: o.maPhieu,
      tienNo: Number(o.tienNo || 0),
      trangThai: o.trangThai || "Đã thanh toán",
      ghiChu: o.ghiChu || "-",
    })),
  };
};

const updateDebtCustomer = async (payload) => {
  await sleep(250);
  const p = payload || {};
  const maPhieuOriginal = String(p.maPhieuOriginal || p.maPhieu || "").trim();
  if (!maPhieuOriginal)
    return { success: false, message: "Thiếu mã phiếu gốc (Mock)" };

  const idx = MOCK_ORDER_HISTORY.findIndex(
    (o) => String(o.maPhieu || "").trim() === maPhieuOriginal,
  );
  if (idx < 0)
    return {
      success: false,
      message: "Không tìm thấy dữ liệu công nợ để cập nhật (Mock)",
    };

  const maPhieu =
    String(p.maPhieu || maPhieuOriginal).trim() || maPhieuOriginal;
  const tenKhach = String(p.tenKhach || "").trim() || "Khách ghé thăm";
  const soDienThoai = String(p.soDienThoai || "").trim();
  const ngayBan =
    String(p.ngayBan || "").trim() || MOCK_ORDER_HISTORY[idx].ngayBan;
  const tienNo = Math.max(Number(p.tienNo || 0), 0);
  const trangThai = normalizeDebtStatus(p.trangThai);
  const ghiChu = String(p.ghiChu || "-").trim() || "-";

  MOCK_ORDER_HISTORY[idx] = {
    ...MOCK_ORDER_HISTORY[idx],
    maPhieu,
    tenKhach,
    soDienThoai,
    ngayBan,
    tienNo,
    trangThai,
    ghiChu,
  };

  const cIdx = MOCK_CUSTOMERS.findIndex(
    (c) => foldText(c.tenKhach) === foldText(tenKhach),
  );
  if (cIdx >= 0) {
    MOCK_CUSTOMERS[cIdx] = {
      ...MOCK_CUSTOMERS[cIdx],
      soDienThoai: soDienThoai || MOCK_CUSTOMERS[cIdx].soDienThoai,
    };
  } else if (tenKhach && foldText(tenKhach) !== "khach ghe tham") {
    MOCK_CUSTOMERS.push({ tenKhach, soDienThoai });
  }

  return {
    success: true,
    message: "Cập nhật công nợ thành công! (Mock)",
  };
};

const settleAllDebtCustomers = async () => {
  await sleep(260);
  let affected = 0;
  for (let i = 0; i < MOCK_ORDER_HISTORY.length; i++) {
    const row = MOCK_ORDER_HISTORY[i];
    const key = foldText(row.trangThai);
    const shouldSettle =
      key.includes("no") ||
      key.includes("tra mot phan") ||
      Number(row.tienNo || 0) > 0;
    if (!shouldSettle) continue;
    MOCK_ORDER_HISTORY[i] = {
      ...row,
      trangThai: "Đã thanh toán",
      tienNo: 0,
    };
    affected++;
  }
  if (!affected) {
    return {
      success: true,
      message: "Không có khách nào đang nợ để cập nhật (Mock)",
      data: { affected: 0 },
    };
  }
  return {
    success: true,
    message: "Đã cập nhật nhanh công nợ thành công! (Mock)",
    data: { affected },
  };
};

const createOrder = async (orderData) => {
  await sleep(600);
  const orderRows = buildOrderRows(orderData);
  const customerRow = orderData.customer ? buildCustomerRow(orderData) : null;

  if (orderData?.orderInfo?.maPhieu) {
    mockLatestOrderCode = String(orderData.orderInfo.maPhieu);
  }

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
        trangThai: payload.receiptInfo.trangThai || "Đã thanh toán",
      });

      // Thêm vào công nợ NCC nếu là Nợ hoặc Trả một phần (giả lập)
      const trangThai = payload.receiptInfo.trangThai || "Đã thanh toán";
      const maPhieu = payload.receiptInfo.maPhieu || "MOCK-NP";
      const nhaCungCap = payload.receiptInfo.nhaCungCap || "NCC Mới";
      const soDienThoai = payload.receiptInfo.soDienThoai || "";
      const ngayNhap =
        payload.receiptInfo.ngayNhap || new Date().toISOString().split("T")[0];
      const tongTienPhieu = payload.receiptInfo.tongTienPhieu || 0;
      const soTienDaTra = Number(payload.receiptInfo.soTienDaTra || 0);

      let tienNo = 0;
      if (trangThai === "Nợ") tienNo = tongTienPhieu;
      else if (trangThai === "Trả một phần")
        tienNo = Math.max(tongTienPhieu - soTienDaTra, 0);

      if (tienNo > 0 || trangThai !== "Đã thanh toán") {
        MOCK_SUPPLIER_DEBTS.push({
          nhaCungCap,
          ngayNhap,
          soDienThoai,
          maPhieu,
          tienNo,
          trangThai,
          ghiChu: payload.receiptInfo.ghiChu || "-",
        });
      }

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
  const statusCode = String(orderInfo.trangThaiCode || "PAID").toUpperCase();
  const soTienDaTra = Number(orderInfo.soTienDaTra || 0);
  let tienNo = 0;
  if (statusCode === "DEBT") tienNo = tongHoaDon;
  if (statusCode === "PARTIAL")
    tienNo = Math.max(tongHoaDon - Math.max(soTienDaTra, 0), 0);

  MOCK_ORDER_HISTORY[idx] = {
    ...MOCK_ORDER_HISTORY[idx],
    maPhieu:
      String(orderInfo.maPhieu || maPhieuOriginal).trim() || maPhieuOriginal,
    ngayBan: String(orderInfo.ngayBan || MOCK_ORDER_HISTORY[idx].ngayBan),
    tenKhach:
      String(payload?.customer?.tenKhach || "").trim() || "Khách ghé thăm",
    tongHoaDon,
    tienNo,
    ghiChu: String(orderInfo.ghiChu || "-"),
    trangThai:
      statusCode === "PARTIAL"
        ? "Trả một phần"
        : statusCode === "DEBT"
          ? "Nợ"
          : "Đã thanh toán",
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
  // Merge MOCK_PRODUCTS with some random tonKho for testing
  return {
    success: true,
    data: MOCK_PRODUCTS.map((p) => ({
      ...p,
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
  if (fnName === "getUserInfo") return getUserInfo(args[0]);
  if (fnName === "getDemoAccounts") return getDemoAccounts();
  if (fnName === "getGlobalNotice") return getGlobalNotice();
  if (fnName === "getNextOrderFormDefaults") return getNextOrderFormDefaults();
  if (fnName === "getNextInventoryReceiptDefaults")
    return getNextInventoryReceiptDefaults();
  if (fnName === "getProductCatalog") return getProductCatalog();
  if (fnName === "getBankConfig") return getBankConfig();
  if (fnName === "getRooms") return getRooms();
  if (fnName === "getStayHistory") return getStayHistory(args[0]);
  if (fnName === "createBooking") return createBooking(args[0]);
  if (fnName === "checkInRoom") return checkInRoom(args[0]);
  if (fnName === "addStayServiceItem") return addStayServiceItem(args[0]);
  if (fnName === "checkoutRoom") return checkoutRoom(args[0]);
  if (fnName === "updateRoomStatus") return updateRoomStatus(args[0]);
  if (fnName === "updateProductCatalogItem")
    return updateProductCatalogItem(args[0]);
  if (fnName === "createProductCatalogItem")
    return createProductCatalogItem(args[0]);
  if (fnName === "deleteProductCatalogItem")
    return deleteProductCatalogItem(args[0]);
  if (fnName === "getCustomerCatalog") return getCustomerCatalog();
  if (fnName === "getSupplierCatalog") return getSupplierCatalog();
  if (fnName === "getDebtCustomers") return getDebtCustomers();
  if (fnName === "updateDebtCustomer") return updateDebtCustomer(args[0]);
  if (fnName === "settleAllDebtCustomers") return settleAllDebtCustomers();
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
  if (fnName === "getSupplierDebts") return getSupplierDebts();
  if (fnName === "updateSupplierDebt") return updateSupplierDebt(args[0]);
  if (fnName === "formatAllSheets")
    return { success: true, message: "Mock formatting done" };

  return { success: false, message: `Hàm ${fnName} chưa được mock.` };
};

const MOCK_SUPPLIER_DEBTS = [
  {
    nhaCungCap: "Nhà cung cấp Aqua",
    ngayNhap: "01/10/2023",
    soDienThoai: "0901234567",
    maPhieu: "NH001",
    tienNo: 5000000,
    trangThai: "Nợ",
    ghiChu: "Nợ tiền nước",
  },
  {
    nhaCungCap: "Đại lý bia",
    ngayNhap: "05/10/2023",
    soDienThoai: "0912345678",
    maPhieu: "NH002",
    tienNo: 2000000,
    trangThai: "Trả một phần",
    ghiChu: "Thanh toán trước 1 ít",
  },
];

const getSupplierDebts = async () => {
  await sleep(200);
  return { success: true, data: [...MOCK_SUPPLIER_DEBTS] };
};

const updateSupplierDebt = async (payload) => {
  await sleep(400);
  const maPhieuOriginal = String(
    payload.maPhieuOriginal || payload.maPhieu || "",
  ).trim();
  const idx = MOCK_SUPPLIER_DEBTS.findIndex(
    (d) => d.maPhieu === maPhieuOriginal,
  );
  if (idx < 0)
    return { success: false, message: "Không tìm thấy công nợ NCC (Mock)" };

  let tienNo = Number(payload.tienNo || 0);
  if (payload.trangThai === "Đã thanh toán") tienNo = 0;

  MOCK_SUPPLIER_DEBTS[idx] = {
    ...MOCK_SUPPLIER_DEBTS[idx],
    nhaCungCap: payload.nhaCungCap || MOCK_SUPPLIER_DEBTS[idx].nhaCungCap,
    ngayNhap: payload.ngayNhap || MOCK_SUPPLIER_DEBTS[idx].ngayNhap,
    soDienThoai: payload.soDienThoai || MOCK_SUPPLIER_DEBTS[idx].soDienThoai,
    maPhieu: payload.maPhieu || MOCK_SUPPLIER_DEBTS[idx].maPhieu,
    tienNo,
    trangThai: payload.trangThai || MOCK_SUPPLIER_DEBTS[idx].trangThai,
    ghiChu: payload.ghiChu || MOCK_SUPPLIER_DEBTS[idx].ghiChu,
  };

  return { success: true, message: "Cập nhật công nợ NCC thành công! (Mock)" };
};

const getSupplierCatalog = async () => {
  await sleep(150);
  return {
    success: true,
    data: [
      { tenNCC: "Nhà cung cấp Aqua", soDienThoai: "0901234567" },
      { tenNCC: "Đại lý bia", soDienThoai: "0912345678" },
    ],
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
  getUserInfo,
  getDemoAccounts,
  getGlobalNotice,
  getNextOrderFormDefaults,
  getNextInventoryReceiptDefaults,
  getProductCatalog,
  getBankConfig,
  getRooms,
  getStayHistory,
  createBooking,
  checkInRoom,
  addStayServiceItem,
  checkoutRoom,
  updateRoomStatus,
  updateProductCatalogItem,
  createProductCatalogItem,
  deleteProductCatalogItem,
  getCustomerCatalog,
  getSupplierCatalog,
  getDebtCustomers,
  updateDebtCustomer,
  settleAllDebtCustomers,
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
  getSupplierDebts,
  updateSupplierDebt,
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
