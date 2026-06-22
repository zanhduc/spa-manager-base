import { gasAdapter } from "./adapters/gasAdapter.js";
import { localAdapter } from "./adapters/localAdapter.js";
import { toLocalDateTimeString } from "../utils/dateFormatter";
import {
  CACHE_INVALIDATED_EVENT,
  CACHE_UPDATED_EVENT,

  createLocalFirstReader,
  createMutationWithInvalidation,
  clearCacheByKeys,
  readCache,
  setMutationSuccessHook,
  writeCache,
  isLocalMutationSource,
} from "./localCache.js";
import { TempIdResolver } from "../utils/tempIdResolver.js";
import {
  readCachedDataList,
  upsertCachedListItem,
  removeCachedListItem,
  writeCachedListResponse,
} from "./cacheListHelpers.js";
import {
  CACHE_CONSUMERS,
  CACHE_KEY_IDS,
  MUTATION_CROSS_SYNC,
  getCacheConsumers,
  mergeInvalidationKeys,
} from "./cacheRegistry.js";
import { readCachedAttendanceRowsForRange } from "./staffCacheHelpers.js";
import { LOCAL_MUTATION_CACHE_META } from "../utils/cacheToastPolicy.js";
import { publishRealtimeMutationSignal } from "../realtime/firebaseSync.js";
import toast from "react-hot-toast";
import {
  buildCheckoutInventoryPatch,
  findCachedStayByMaPhien,
  mergeTreatmentSessionPatch,
} from "./spaCheckoutCacheHelpers.js";
import { normalizeChecklistType } from "../components/staff/staffChecklistHelpers.js";
import {
  normalizeAttendanceShiftCode,
  formatStaffDateStorage,
} from "../components/staff/staffConstants.js";
import {
  normalizeLeaveStatus,
} from "../components/staff/staffLeaveHelpers.js";
import {
  normalizeTrainingStatus,
  normalizeTrainingType,
} from "../components/staff/staffTrainingHelpers.js";
import {
  normalizePayrollLockStatus,
} from "../components/staff/staffPayrollLockHelpers.js";
import {
  normalizeViolationLevel,
  normalizeViolationStatus,
} from "../components/staff/staffViolationHelpers.js";

const IS_DEV = import.meta.env.DEV;
const USE_GAS_ADAPTER =
  import.meta.env.VITE_E2E_MOCK_GAS === "1" || !IS_DEV;
const adapter = USE_GAS_ADAPTER ? gasAdapter : localAdapter;

export const api = adapter;

const normalizeTreatmentBed = (room = {}) => ({
  ...room,
  maGiuong: String(room.maGiuong || "").trim(),
  tenGiuong: String(room.tenGiuong || "").trim(),
  loaiGiuong: String(room.loaiGiuong || "").trim(),
  trangThaiGiuong: String(room.trangThaiGiuong || "").trim(),
  soKhachToiDa: Math.max(Number(room.soKhachToiDa || 0), 0),
  ghiChu: String(room.ghiChu || "").trim(),
  updatedAt: String(room.updatedAt || "").trim(),
});

const normalizeSpaStaff = (staff = {}) => ({
  ...staff,
  maNhanVien: String(staff.maNhanVien || "").trim(),
  tenNhanVien: String(staff.tenNhanVien || "").trim(),
  chucVu: String(staff.chucVu || "").trim(),
  soDienThoai: String(staff.soDienThoai || "").trim(),
  ngayVaoLam: formatStaffDateStorage(staff.ngayVaoLam) || "",
  trangThai: String(staff.trangThai || "Đang làm việc").trim(),
  caLamViec: String(staff.caLamViec || "").trim(),
  ghiChu: String(staff.ghiChu || "").trim(),
  luongCoBanThang: Math.max(Number(staff.luongCoBanThang || 0), 0),
  tyLeThuongDichVu:
    staff.tyLeThuongDichVu === "" || staff.tyLeThuongDichVu === undefined
      ? ""
      : Math.min(Math.max(Number(staff.tyLeThuongDichVu || 0), 0), 100),
  updatedAt: String(staff.updatedAt || "").trim(),
});

const normalizeTreatmentPackage = (item = {}) => ({
  ...item,
  maGoi: String(item.maGoi || "").trim(),
  tenGoi: String(item.tenGoi || "").trim(),
  maDv: String(item.maDv || "").trim(),
  tenDichVu: String(item.tenDichVu || item.lop2DichVu || item.tenDv || "").trim(),
  loaiGoi: String(item.loaiGoi || "").trim(),
  soBuoiMua: Math.max(Number(item.soBuoiMua || 0), 0),
  soBuoiTang: Math.max(Number(item.soBuoiTang || 0), 0),
  soBuoiQuyDoi: Math.max(Number(item.soBuoiQuyDoi || 0), 0),
  giaBanGoi: Math.max(Number(item.giaBanGoi || item.giaGoi || 0), 0),
  giaGoi: Math.max(Number(item.giaGoi || item.giaBanGoi || 0), 0),
  giaVonChuanGoi: Math.max(Number(item.giaVonChuanGoi || 0), 0),
  thoiLuongPhut: Math.max(Number(item.thoiLuongPhut || 0), 0),
  active: item.active !== false,
});

const normalizeTreatmentService = (item = {}) => ({
  ...item,
  serviceItemId: String(item.serviceItemId || "").trim(),
  maPhien: String(item.maPhien || "").trim(),
  thoiGian: String(item.thoiGian || "").trim(),
  maSanPham: String(item.maSanPham || "").trim(),
  tenSanPham: String(item.tenSanPham || "").trim(),
  nhomHang: String(item.nhomHang || "").trim(),
  donVi: String(item.donVi || "").trim(),
  soLuong: Number(item.soLuong || 0),
  donGia: Number(item.donGia || 0),
  thanhTien: Number(item.thanhTien || 0),
  ghiChu: String(item.ghiChu || "").trim(),
});

const normalizeTreatmentSession = (stay = {}) => {
  const serviceItems = Array.isArray(stay.serviceItems)
    ? stay.serviceItems.map((item) => normalizeTreatmentService(item))
    : [];
  const tienGoi = Math.max(Number(stay.tienGoi ?? 0), 0);
  const tienDichVu = Math.max(Number(stay.tienDichVu || 0), 0);
  return {
    ...stay,
    maPhien: String(stay.maPhien || "").trim(),
    maLichHen: String(stay.maLichHen || "").trim(),
    maTienTrinh: String(stay.maTienTrinh || "").trim(),
    maGiuong: String(stay.maGiuong || "").trim(),
    tenKhach: String(stay.tenKhach || "").trim(),
    soDienThoai: String(stay.soDienThoai || "").trim(),
    maNhanVien: String(stay.maNhanVien || "").trim(),
    tenNhanVien: String(stay.tenNhanVien || "").trim(),
    maDv: String(stay.maDv || "").trim(),
    tenDichVu: String(stay.tenDichVu || "").trim(),
    maGoi: String(stay.maGoi || "").trim(),
    tenGoi: String(stay.tenGoi || "").trim(),
    batDauAt: String(stay.batDauAt || "").trim(),
    ketThucDuKien: String(stay.ketThucDuKien || "").trim(),
    ketThucThucTe: String(stay.ketThucThucTe || "").trim(),
    thoiLuongPhut: Math.max(Number(stay.thoiLuongPhut || 0), 0),
    giaGoi: Math.max(Number(stay.giaGoi || 0), 0),
    tienGoi,
    tienDichVu,
    tongBuoiCombo: Math.max(Number(stay.tongBuoiCombo || 1), 1),
    buoiThu: Math.max(Number(stay.buoiThu || 1), 1),
    buoiConLai: Math.max(
      Number(
        stay.buoiConLai ??
          Math.max(Number(stay.tongBuoiCombo || 1), 1) -
            Math.max(Number(stay.buoiThu || 1), 1),
      ),
      0,
    ),
    tongThanhToan: Math.max(
      Number(stay.tongThanhToan || tienGoi + tienDichVu || 0),
      0,
    ),
    diemHaiLongKhach: (() => {
      const score = Math.round(Number(stay.diemHaiLongKhach));
      if (!Number.isFinite(score) || score < 1 || score > 5) return "";
      return score;
    })(),
    phuongThucThanhToan: ["TIEN_MAT", "CHUYEN_KHOAN", "QR"].includes(
      String(stay.phuongThucThanhToan || "").trim().toUpperCase(),
    )
      ? String(stay.phuongThucThanhToan).trim().toUpperCase()
      : "",
    trangThaiPhien: String(stay.trangThaiPhien || "").trim(),
    ghiChu: String(stay.ghiChu || "").trim(),
    serviceItems,
  };
};

const normalizeListResult = (result, normalizeItem) => {
  if (!result || result.success !== true || !Array.isArray(result.data)) return result;
  return {
    ...result,
    data: result.data.map((item) => normalizeItem(item)),
  };
};

const getSessionIdentity = (session = {}) => ({
  maPhien: String(session.maPhien || "").trim(),
  maLichHen: String(session.maLichHen || "").trim(),
});

const upsertCachedTreatmentSession = (session = {}) => {
  const identity = getSessionIdentity(session);
  if (!identity.maPhien && !identity.maLichHen) return;
  const cached = readCache(CACHE_KEYS.stayHistory)?.response;
  if (!cached?.success || !Array.isArray(cached.data)) return;
  const isOptimistic = identity.maPhien.startsWith("TEMP-");
  let workingData = cached.data;
  if (!isOptimistic) {
    workingData = workingData.filter(item => !String(item.maPhien || "").startsWith("TEMP-"));
  }

  let found = false;
  const data = workingData.map((item) => {
    const current = getSessionIdentity(item);
    const sameSession =
      (identity.maPhien && current.maPhien === identity.maPhien) ||
      (identity.maLichHen && current.maLichHen === identity.maLichHen);
    if (!sameSession) return item;
    found = true;
    return normalizeTreatmentSession(mergeTreatmentSessionPatch(item, session));
  });
  if (!found) data.unshift(normalizeTreatmentSession(session));
  writeCache(CACHE_KEYS.stayHistory, { ...cached, data });
};

const patchCachedTreatmentRoom = (session = {}, nextRoomStatus = "") => {
  const maGiuong = String(session.maGiuong || "").trim();
  const roomStatus = String(nextRoomStatus || "").trim();
  if (!maGiuong || !roomStatus) return;
  const cached = readCache(CACHE_KEYS.rooms)?.response;
  if (!cached?.success || !Array.isArray(cached.data)) return;
  let changed = false;
  const data = cached.data.map((room) => {
    if (String(room.maGiuong || "").trim() !== maGiuong) return room;
    changed = true;
    return normalizeTreatmentBed({
      ...room,
      trangThaiGiuong: roomStatus,
      updatedAt: toLocalDateTimeString(new Date()),
    });
  });
  if (changed) writeCache(CACHE_KEYS.rooms, { ...cached, data });
};

const primeSpaMutationCache = (result, options = {}) => {
  if (!result?.success) return;
  const items = Array.isArray(result.data) ? result.data : [result.data];
  items.filter(Boolean).forEach((item) => {
    if (!item?.maPhien && !item?.maLichHen) return;
    upsertCachedTreatmentSession(item);
    patchCachedTreatmentRoom(item, options.roomStatus);
  });
};

const patchCachedInventoryForCheckout = (payload = {}, result = {}) => {
  const maPhien = String(
    payload?.maPhien || result?.data?.maPhien || "",
  ).trim();
  if (!maPhien) return;

  const stayCached = readCache(CACHE_KEYS.stayHistory)?.response;
  const stay =
    findCachedStayByMaPhien(stayCached, maPhien) ||
    (result?.data && !Array.isArray(result.data) ? result.data : null);
  if (!stay) return;

  const inventoryCached = readCache(CACHE_KEYS.inventory)?.response;
  const catalogCached = readCache(CACHE_KEYS.productCatalog)?.response;
  const inventoryProducts =
    inventoryCached?.success && Array.isArray(inventoryCached.data)
      ? inventoryCached.data
      : [];
  const catalogProducts =
    catalogCached?.success && Array.isArray(catalogCached.data)
      ? catalogCached.data
      : [];

  const patch = buildCheckoutInventoryPatch({
    stay,
    inventoryProducts,
    catalogProducts,
  });
  if (patch.deductedCount > 0 && inventoryCached?.success) {
    writeCache(CACHE_KEYS.inventory, {
      ...inventoryCached,
      data: patch.inventoryProducts,
    });
  }
  if (patch.deductedCount > 0 && catalogCached?.success) {
    writeCache(CACHE_KEYS.productCatalog, {
      ...catalogCached,
      data: patch.catalogProducts,
    });
  }
  if (patch.patchedStay?.serviceItems?.length) {
    upsertCachedTreatmentSession(patch.patchedStay);
  }
};

const primeCheckoutMutationCache = (result, args = [], options = {}) => {
  primeSpaMutationCache(result, options);
  patchCachedInventoryForCheckout(args[0] || {}, result);
};

const normalizeScheduleDateKey = (value) => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const vn = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (vn) {
    const d = Number(vn[1]);
    const m = Number(vn[2]);
    const y = Number(vn[3]);
    if (!d || !m || !y) return "";
    return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}`;
  }
  return "";
};

const normalizeAttendanceResult = (result) => {
  if (!result?.success || !Array.isArray(result.data)) return result;
  return {
    ...result,
    data: result.data
      .map((row) => ({
        maNhanVien: String(row?.maNhanVien || "").trim(),
        ngay: normalizeScheduleDateKey(row?.ngay),
        checkInAt: String(row?.checkInAt || "").trim(),
        checkOutAt: String(row?.checkOutAt || "").trim(),
        caDuKien: normalizeAttendanceShiftCode(row?.caDuKien),
        trangThai: String(row?.trangThai || "").trim(),
        ghiChu: String(row?.ghiChu || "").trim(),
        updatedAt: String(row?.updatedAt || "").trim(),
      }))
      .filter((row) => row.maNhanVien && row.ngay),
  };
};

const normalizeLeaveResult = (result) => {
  if (!result?.success || !Array.isArray(result.data)) return result;
  return {
    ...result,
    data: result.data
      .map((row) => ({
        maDon: String(row?.maDon || "").trim(),
        maNhanVien: String(row?.maNhanVien || "").trim(),
        tuNgay: normalizeScheduleDateKey(row?.tuNgay),
        denNgay: normalizeScheduleDateKey(row?.denNgay),
        lyDo: String(row?.lyDo || "").trim(),
        trangThai: normalizeLeaveStatus(row?.trangThai),
        ghiChu: String(row?.ghiChu || "").trim(),
        updatedAt: String(row?.updatedAt || "").trim(),
      }))
      .filter((row) => row.maDon && row.maNhanVien && row.tuNgay && row.denNgay),
  };
};

const normalizeTrainingResult = (result) => {
  if (!result?.success || !Array.isArray(result.data)) return result;
  return {
    ...result,
    data: result.data
      .map((row) => ({
        maDaoTao: String(row?.maDaoTao || "").trim(),
        maNhanVien: String(row?.maNhanVien || "").trim(),
        loaiDaoTao: normalizeTrainingType(row?.loaiDaoTao),
        tuNgay: normalizeScheduleDateKey(row?.tuNgay),
        denNgay: normalizeScheduleDateKey(row?.denNgay),
        noiDung: String(row?.noiDung || "").trim(),
        trangThai: normalizeTrainingStatus(row?.trangThai),
        ghiChu: String(row?.ghiChu || "").trim(),
        updatedAt: String(row?.updatedAt || "").trim(),
      }))
      .filter((row) => row.maDaoTao && row.maNhanVien && row.tuNgay && row.denNgay),
  };
};

const normalizePayrollResult = (result) => {
  if (!result?.success || !Array.isArray(result.data)) return result;
  return {
    ...result,
    data: result.data
      .map((row) => ({
        maBangLuong: String(row?.maBangLuong || "").trim(),
        maKyLuong: String(row?.maKyLuong || "").trim(),
        tuNgay: normalizeScheduleDateKey(row?.tuNgay),
        denNgay: normalizeScheduleDateKey(row?.denNgay),
        maNhanVien: String(row?.maNhanVien || "").trim(),
        tenNhanVien: String(row?.tenNhanVien || "").trim(),
        chucVu: String(row?.chucVu || "").trim(),
        caHoanThanh: Math.max(Number(row?.caHoanThanh || 0), 0),
        caKeHoach: Math.max(Number(row?.caKeHoach || 0), 0),
        luongCoBan: Math.max(Number(row?.luongCoBan || 0), 0),
        doanhSoDichVu: Math.max(Number(row?.doanhSoDichVu || 0), 0),
        tyLeThuong: Math.max(Number(row?.tyLeThuong || 0), 0),
        thuong: Math.max(Number(row?.thuong || 0), 0),
        truViPham: Math.max(Number(row?.truViPham || 0), 0),
        tongLuong: Math.max(Number(row?.tongLuong || 0), 0),
        trangThai: normalizePayrollLockStatus(row?.trangThai),
        ghiChu: String(row?.ghiChu || "").trim(),
        updatedAt: String(row?.updatedAt || "").trim(),
      }))
      .filter((row) => row.maBangLuong && row.maNhanVien),
  };
};

const normalizeViolationResult = (result) => {
  if (!result?.success || !Array.isArray(result.data)) return result;
  return {
    ...result,
    data: result.data
      .map((row) => ({
        maViPham: String(row?.maViPham || "").trim(),
        maNhanVien: String(row?.maNhanVien || "").trim(),
        ngay: normalizeScheduleDateKey(row?.ngay),
        capDo: normalizeViolationLevel(row?.capDo),
        noiDung: String(row?.noiDung || "").trim(),
        mucTru: Math.max(Number(row?.mucTru || 0), 0),
        trangThai: normalizeViolationStatus(row?.trangThai),
        ghiChu: String(row?.ghiChu || "").trim(),
        updatedAt: String(row?.updatedAt || "").trim(),
      }))
      .filter((row) => row.maViPham && row.maNhanVien && row.ngay),
  };
};

const normalizeChecklistResult = (result) => {
  if (!result?.success || !Array.isArray(result.data)) return result;
  return {
    ...result,
    data: result.data
      .map((row) => ({
        maNhanVien: String(row?.maNhanVien || "").trim(),
        ngay: normalizeScheduleDateKey(row?.ngay),
        caDuKien: normalizeAttendanceShiftCode(row?.caDuKien),
        loaiChecklist: normalizeChecklistType(row?.loaiChecklist),
        chucVu: String(row?.chucVu || "").trim(),
        itemsJson: String(row?.itemsJson || "").trim(),
        ghiChu: String(row?.ghiChu || "").trim(),
        updatedAt: String(row?.updatedAt || "").trim(),
      }))
      .filter((row) => row.maNhanVien && row.ngay && row.loaiChecklist),
  };
};

const normalizeStaffScheduleResult = (result) => {
  if (!result?.success || !Array.isArray(result.data)) return result;
  return {
    ...result,
    data: result.data
      .map((row) => ({
        ...row,
        ngay: normalizeScheduleDateKey(row?.ngay),
        caSang: String(row?.caSang || "").trim(),
        caChieu: String(row?.caChieu || "").trim(),
        caToi: String(row?.caToi || "").trim(),
      }))
      .filter((row) => row.ngay),
  };
};

const patchCachedStaffSchedules = (payload = {}) => {
  const updates = Array.isArray(payload?.updates) ? payload.updates : [];
  if (!updates.length) return { success: true, data: [] };
  const cached = readCache(CACHE_KEYS.staffSchedules)?.response;
  const existing = cached?.success && Array.isArray(cached.data) ? cached.data : [];
  const byDate = new Map();
  existing.forEach((row) => {
    const ngay = normalizeScheduleDateKey(row?.ngay);
    if (!ngay) return;
    byDate.set(ngay, {
      ngay,
      caSang: String(row?.caSang || "").trim(),
      caChieu: String(row?.caChieu || "").trim(),
      caToi: String(row?.caToi || "").trim(),
    });
  });
  updates.forEach((up) => {
    const ngay = normalizeScheduleDateKey(up?.ngay);
    if (!ngay) return;
    byDate.set(ngay, {
      ngay,
      caSang: String(up?.caSang || "").trim(),
      caChieu: String(up?.caChieu || "").trim(),
      caToi: String(up?.caToi || "").trim(),
    });
  });
  const data = Array.from(byDate.values()).sort((a, b) =>
    String(a.ngay).localeCompare(String(b.ngay)),
  );
  return { success: true, data };
};

const patchCachedComboSchedule = (payload = {}) => {
  const maTienTrinh = String(payload.maTienTrinh || "").trim();
  const lichTrinhChiTiet = String(payload.lichTrinhChiTiet || "").trim();
  if (!maTienTrinh) return { success: true, isOptimistic: true };

  const patchRows = (rows) => {
    if (!Array.isArray(rows)) return rows;
    let changed = false;
    const next = rows.map((row) => {
      if (String(row?.maTienTrinh || "").trim() !== maTienTrinh) return row;
      changed = true;
      return { ...row, lichTrinhChiTiet };
    });
    return changed ? next : rows;
  };

  const stayCached = readCache(CACHE_KEYS.stayHistory)?.response;
  if (stayCached?.success && Array.isArray(stayCached.data)) {
    writeCachedListResponse(
      CACHE_KEYS.stayHistory,
      patchRows(stayCached.data),
      LOCAL_MUTATION_CACHE_META,
    );
  }

  const progressCached = readCache(CACHE_KEYS.customerProgress)?.response;
  if (progressCached?.success && Array.isArray(progressCached.data)) {
    writeCachedListResponse(
      CACHE_KEYS.customerProgress,
      patchRows(progressCached.data),
      LOCAL_MUTATION_CACHE_META,
    );
  }

  return {
    success: true,
    isOptimistic: true,
    data: { maTienTrinh, lichTrinhChiTiet },
  };
};

const globalBackgroundErrorHandler = (result, args) => {
  const message = String(result?.message || "Không lưu được dữ liệu lên server. Vui lòng thử lại.").trim();
  console.error("Background mutation error:", result, args);
  toast.error(message, { id: "background-mutation-error" });
  try {
    if (typeof adapter.logAction === "function") {
      adapter
        .logAction({
          hanhDong: "CLIENT_BACKGROUND_ERROR",
          noiDung: message,
          payload: args,
        })
        .catch(() => {});
    }
  } catch (_) {}
};

export { readCachedAttendanceRowsForRange } from "./staffCacheHelpers.js";

const createNamedMutation = (fn, mutationName, baseKeys, options = {}) => {
  const name = String(mutationName || fn?.name || "mutation").trim();
  return createMutationWithInvalidation(fn, mergeInvalidationKeys(name, baseKeys), {
    ...options,
    mutationName: name,
  });
};

const createSpaMutation = (
  adapterFn,
  mutationName,
  invalidationKeys,
  normalizeData,
  options = {},
) => {
  const name = String(mutationName || adapterFn?.name || "mutation").trim();
  const mergedKeys = mergeInvalidationKeys(name, invalidationKeys);
  return createMutationWithInvalidation(async (payload = {}) => {
    const resolvedPayload = await TempIdResolver.resolvePayload(payload || {});
    const result = await adapterFn(resolvedPayload);
    
    // Register TEMP mappings on success
    if (result && result.success === true && payload) {
      if (typeof payload.maPhien === "string" && payload.maPhien.startsWith("TEMP-") && result.data?.maPhien && !result.data.maPhien.startsWith("TEMP-")) {
        TempIdResolver.resolve(payload.maPhien, result.data.maPhien);
      }
      if (typeof payload.maLichHen === "string" && payload.maLichHen.startsWith("TEMP-") && result.data?.maLichHen && !result.data.maLichHen.startsWith("TEMP-")) {
        TempIdResolver.resolve(payload.maLichHen, result.data.maLichHen);
      }
      if (typeof payload.maDon === "string" && payload.maDon.startsWith("TEMP-") && result.data?.maDon && !result.data.maDon.startsWith("TEMP-")) {
        TempIdResolver.resolve(payload.maDon, result.data.maDon);
      }
      if (typeof payload.maDaoTao === "string" && payload.maDaoTao.startsWith("TEMP-") && result.data?.maDaoTao && !result.data.maDaoTao.startsWith("TEMP-")) {
        TempIdResolver.resolve(payload.maDaoTao, result.data.maDaoTao);
      }
    }

    if (!normalizeData || !result || result.success !== true) return result;
    const data = Array.isArray(result.data)
      ? result.data.map((item) => normalizeData(item))
      : normalizeData(result.data || {});
    return { ...result, data };
  }, mergedKeys, {
    mutationName: name,
    deferEvent: Boolean(options.primeSessionCache),
    preserveCacheKeys: options.preserveCacheKeys,
    optimisticCacheTtlMs: options.optimisticCacheTtlMs,
    afterSuccess: (result, args) => {
      if (typeof options.afterSuccess === "function") {
        try {
          options.afterSuccess(result, args);
        } catch (_) {
          // Cache priming is best-effort.
        }
      }
      if (!options.primeSessionCache) return;
      if (options.patchInventoryOnCheckout) {
        primeCheckoutMutationCache(result, args, options);
        return;
      }
      primeSpaMutationCache(result, options);
    },
    optimisticFn: options.optimisticFn,
    onBackgroundError: options.onBackgroundError || globalBackgroundErrorHandler,
  });
};

export const CACHE_KEYS = {
  productCatalog: "product_catalog",
  bankConfig: "bank_config",
  rooms: "rooms",
  stayHistory: "stay_history",
  customerCatalog: "customer_catalog",
  customerProgress: "customer_progress",
  staffCatalog: "staff_catalog",
  staffSchedules: "staff_schedules",
  staffAttendance: "staff_attendance",
  staffChecklists: "staff_checklists",
  staffViolations: "staff_violations",
  staffLeaves: "staff_leaves",
  staffTrainings: "staff_trainings",
  staffPayroll: "staff_payroll",
  treatmentPackages: "treatment_packages",
  treatmentCatalogs: "treatment_catalogs",
  supplierCatalog: "supplier_catalog",
  orderHistory: "order_history",
  ctBanHistory: "ct_ban_history",
  ctBanKpiData: "ct_ban_kpi_data",
  inventory: "inventory",
  receiptHistory: "receipt_history",
  inventorySuggestions: "inventory_suggestions",
  appSetting: "app_setting",
  nextOrderFormDefaults: "next_order_form_defaults",
  nextInventoryReceiptDefaults: "next_inventory_receipt_defaults",
};

const CHECKOUT_PRESERVED_CACHE_KEYS = [
  CACHE_KEYS.stayHistory,
  CACHE_KEYS.rooms,
  CACHE_KEYS.inventory,
  CACHE_KEYS.productCatalog,
];

const STAFF_CATALOG_PRESERVE_KEYS = [CACHE_KEYS.staffCatalog];

const primeStaffCatalogCache = (result, args = []) => {
  const payload = args[0] || {};
  const staff = result?.data;
  const meta = { ...LOCAL_MUTATION_CACHE_META };
  if (staff && staff.maNhanVien) {
    upsertCachedListItem(
      CACHE_KEYS.staffCatalog,
      staff,
      "maNhanVien",
      meta,
    );
    return;
  }
  const code = String(payload?.maNhanVien || "").trim();
  if (code) {
    removeCachedListItem(CACHE_KEYS.staffCatalog, "maNhanVien", code, meta);
  }
};

const READ_KEYS = Object.values(CACHE_KEYS);
export { CACHE_INVALIDATED_EVENT, CACHE_UPDATED_EVENT, isLocalMutationSource };


const INVALIDATION_KEYS = Object.freeze({
  updateProductCatalogItem: [
    CACHE_KEYS.productCatalog,
    CACHE_KEYS.inventory,
    CACHE_KEYS.inventorySuggestions,
  ],
  createProductCatalogItem: [
    CACHE_KEYS.productCatalog,
    CACHE_KEYS.inventory,
    CACHE_KEYS.inventorySuggestions,
  ],
  deleteProductCatalogItem: [
    CACHE_KEYS.productCatalog,
    CACHE_KEYS.inventory,
    CACHE_KEYS.inventorySuggestions,
  ],
  createOrder: [
    CACHE_KEYS.orderHistory,
    CACHE_KEYS.inventory,
    CACHE_KEYS.productCatalog,
    CACHE_KEYS.inventorySuggestions,
    CACHE_KEYS.customerCatalog,
  ],
  createInventoryReceipt: [
    CACHE_KEYS.inventory,
    CACHE_KEYS.receiptHistory,
    CACHE_KEYS.supplierCatalog,
    CACHE_KEYS.productCatalog,
    CACHE_KEYS.inventorySuggestions,
  ],
  createBooking: [CACHE_KEYS.rooms, CACHE_KEYS.stayHistory, CACHE_KEYS.customerProgress],
  createBookingWithItems: [CACHE_KEYS.rooms, CACHE_KEYS.stayHistory, CACHE_KEYS.customerProgress],
  checkInRoom: [CACHE_KEYS.rooms, CACHE_KEYS.stayHistory, CACHE_KEYS.customerProgress],
  checkInRoomWithItems: [CACHE_KEYS.rooms, CACHE_KEYS.stayHistory, CACHE_KEYS.customerProgress],
  addStayServiceItem: [
    CACHE_KEYS.stayHistory,
    CACHE_KEYS.customerProgress,
    CACHE_KEYS.inventory,
    CACHE_KEYS.productCatalog,
  ],
  updateStayServiceItem: [
    CACHE_KEYS.stayHistory,
    CACHE_KEYS.customerProgress,
    CACHE_KEYS.inventory,
    CACHE_KEYS.productCatalog,
  ],
  deleteStayServiceItem: [
    CACHE_KEYS.stayHistory,
    CACHE_KEYS.customerProgress,
    CACHE_KEYS.inventory,
    CACHE_KEYS.productCatalog,
  ],
  updateStayTime: [CACHE_KEYS.stayHistory, CACHE_KEYS.customerProgress, CACHE_KEYS.rooms],
  checkoutRoom: [
    CACHE_KEYS.rooms,
    CACHE_KEYS.stayHistory,
    CACHE_KEYS.customerProgress,
    CACHE_KEYS.ctBanHistory,
    CACHE_KEYS.ctBanKpiData,
    CACHE_KEYS.productCatalog,
    CACHE_KEYS.inventory,
    CACHE_KEYS.inventorySuggestions,
  ],
  markTreatmentNoShow: [CACHE_KEYS.rooms, CACHE_KEYS.stayHistory, CACHE_KEYS.customerProgress],
  updateRoomStatus: [CACHE_KEYS.rooms],
  createTreatmentBed: [CACHE_KEYS.rooms, CACHE_KEYS.stayHistory],
  updateTreatmentBed: [CACHE_KEYS.rooms, CACHE_KEYS.stayHistory],
  deleteTreatmentBed: [CACHE_KEYS.rooms, CACHE_KEYS.stayHistory],
  saveTreatmentCatalogs: [CACHE_KEYS.treatmentCatalogs, CACHE_KEYS.treatmentPackages],
  updateSpaStaffSchedule: [CACHE_KEYS.staffSchedules],
  updateSpaStaffSchedules: [
    CACHE_KEYS.staffSchedules,
    CACHE_KEYS.staffAttendance,
  ],
  recordSpaAttendance: [CACHE_KEYS.staffAttendance, CACHE_KEYS.staffPayroll],
  updateSpaStaff: [
    CACHE_KEYS.staffCatalog,
    CACHE_KEYS.staffSchedules,
    CACHE_KEYS.staffAttendance,
  ],
  saveSpaShiftChecklist: [CACHE_KEYS.staffChecklists, CACHE_KEYS.staffAttendance],
  saveSpaStaffViolation: [CACHE_KEYS.staffViolations, CACHE_KEYS.staffPayroll],
  cancelSpaStaffViolation: [CACHE_KEYS.staffViolations, CACHE_KEYS.staffPayroll],
  saveSpaStaffLeaveRequest: [CACHE_KEYS.staffLeaves],
  reviewSpaStaffLeaveRequest: [CACHE_KEYS.staffLeaves, CACHE_KEYS.staffCatalog],
  saveSpaStaffTraining: [CACHE_KEYS.staffTrainings],
  lockSpaPayrollPeriod: [CACHE_KEYS.staffPayroll],
  createSpaStaff: [CACHE_KEYS.staffCatalog, CACHE_KEYS.staffSchedules],
  deleteSpaStaff: [
    CACHE_KEYS.staffCatalog,
    CACHE_KEYS.staffSchedules,
    CACHE_KEYS.staffAttendance,
    CACHE_KEYS.staffChecklists,
    CACHE_KEYS.staffViolations,
    CACHE_KEYS.staffLeaves,
    CACHE_KEYS.staffTrainings,
    CACHE_KEYS.staffPayroll,
  ],
  updateComboSchedule: [CACHE_KEYS.stayHistory, CACHE_KEYS.customerProgress],
  updateOrder: [
    CACHE_KEYS.orderHistory,
    CACHE_KEYS.inventory,
    CACHE_KEYS.productCatalog,
    CACHE_KEYS.inventorySuggestions,
    CACHE_KEYS.customerCatalog,
  ],
  deleteOrder: [
    CACHE_KEYS.orderHistory,
    CACHE_KEYS.inventory,
    CACHE_KEYS.customerCatalog,
  ],
  issueEasyInvoice: [CACHE_KEYS.orderHistory],
  cancelEasyInvoice: [CACHE_KEYS.orderHistory],
  replaceEasyInvoice: [CACHE_KEYS.orderHistory],
  setAppSetting: [CACHE_KEYS.appSetting],
});

export function getInvalidationKeysForMutation(mutationName) {
  const key = String(mutationName || "").trim();
  const keys = INVALIDATION_KEYS[key];
  return mergeInvalidationKeys(key, Array.isArray(keys) ? keys : []);
}

export {
  CACHE_CONSUMERS,
  CACHE_KEY_IDS,
  MUTATION_CROSS_SYNC,
  getCacheConsumers,
  mergeInvalidationKeys,
};
const BG_SPARSE_15M = {
  backgroundMode: "stale-only",
  refreshAfterMs: 15 * 60 * 1000,
  refreshCooldownMs: 15 * 60 * 1000,
};
const BG_SPARSE_30M = {
  backgroundMode: "stale-only",
  refreshAfterMs: 30 * 60 * 1000,
  refreshCooldownMs: 30 * 60 * 1000,
};
const BG_SPARSE_60M = {
  backgroundMode: "stale-only",
  refreshAfterMs: 60 * 60 * 1000,
  refreshCooldownMs: 60 * 60 * 1000,
};

const publishRealtimeSignal = async ({ mutation, invalidateKeys } = {}) => {
  return publishRealtimeMutationSignal({
    mutation,
    invalidateKeys,
  });
};

const withRealtimeSignal = (fn, mutationName) => {
  return async (...args) => {
    const result = await fn(...args);
    if (result?.success) {
      publishRealtimeSignal({
        mutation: mutationName,
        invalidateKeys: getInvalidationKeysForMutation(mutationName),
      }).catch(() => {
        // Silent publish failure so mutation UX stays smooth.
      });
    }
    return result;
  };
};

setMutationSuccessHook(({ mutationName, invalidateKeys }) => {
  return publishRealtimeSignal({
    mutation: mutationName,
    invalidateKeys: Array.isArray(invalidateKeys)
      ? invalidateKeys
      : getInvalidationKeysForMutation(mutationName),
  });
});

export const call = adapter.call;
export const helloServer = adapter.helloServer;
export const login = (email, password, appScope = "") =>
  adapter.login(email, password, appScope);
export const loginWithDeviceToken = (deviceToken, appScope = "") =>
  typeof adapter.loginWithDeviceToken === "function"
    ? adapter.loginWithDeviceToken(deviceToken, appScope)
    : Promise.resolve({ success: false, message: "not_supported" });
export const loginWithSessionKey = (appScope = "") =>
  typeof adapter.loginWithSessionKey === "function"
    ? adapter.loginWithSessionKey(appScope)
    : Promise.resolve({ success: false, message: "not_supported" });
export const loginWithHostAssertion = (
  assertion,
  appScope = "",
  nonce = "",
  ts = 0,
) =>
  typeof adapter.loginWithHostAssertion === "function"
    ? adapter.loginWithHostAssertion(assertion, appScope, nonce, ts)
    : Promise.resolve({ success: false, message: "not_supported" });
export const revokeDeviceToken = (deviceToken, appScope = "") =>
  typeof adapter.revokeDeviceToken === "function"
    ? adapter.revokeDeviceToken(deviceToken, appScope)
    : Promise.resolve({ success: true });
export const revokeSessionLogin = (appScope = "") =>
  typeof adapter.revokeSessionLogin === "function"
    ? adapter.revokeSessionLogin(appScope)
    : Promise.resolve({ success: true });
export const getUserInfo = adapter.getUserInfo;
export const getDemoAccounts = adapter.getDemoAccounts;
export const getGlobalNotice = adapter.getGlobalNotice;
export const getSyncVersion =
  adapter.getSyncVersion ||
  (async () => ({ success: true, data: { version: "1" } }));
export const getNextOrderFormDefaults = createLocalFirstReader(
  CACHE_KEYS.nextOrderFormDefaults,
  adapter.getNextOrderFormDefaults,
  BG_SPARSE_60M
);
export const getNextInventoryReceiptDefaults = createLocalFirstReader(
  CACHE_KEYS.nextInventoryReceiptDefaults,
  adapter.getNextInventoryReceiptDefaults,
  BG_SPARSE_60M
);
export const getProductCatalog = createLocalFirstReader(
  CACHE_KEYS.productCatalog,
  adapter.getProductCatalog,
  BG_SPARSE_30M,
);
export const getBankConfig = createLocalFirstReader(
  CACHE_KEYS.bankConfig,
  adapter.getBankConfig,
  BG_SPARSE_60M,
);
export const initSpaSheets =
  typeof adapter.initSpaSheets === "function"
    ? adapter.initSpaSheets
    : async () => ({ success: false, message: "not_supported" });
export const upgradeCtBanHeaders =
  typeof adapter.upgradeCtBanHeaders === "function"
    ? adapter.upgradeCtBanHeaders
    : async () => ({ success: false, message: "not_supported" });
export const simplifySpaSheets =
  typeof adapter.simplifySpaSheets === "function"
    ? adapter.simplifySpaSheets
    : async () => ({ success: false, message: "not_supported" });
export const getSpaKpiReport =
  typeof adapter.getSpaKpiReport === "function"
    ? adapter.getSpaKpiReport
    : async () => ({ success: false, message: "not_supported" });
export const loadSpaPresetTlcData =
  typeof adapter.loadSpaPresetTlcData === "function"
    ? adapter.loadSpaPresetTlcData
    : async () => ({ success: false, message: "not_supported" });
export const getRooms = createLocalFirstReader(
  CACHE_KEYS.rooms,
  async () => {
    const result = await adapter.getRooms();
    return normalizeListResult(result, normalizeTreatmentBed);
  },
  BG_SPARSE_15M,
);
export const getSpaStaff =
  typeof adapter.getSpaStaff === "function"
    ? createLocalFirstReader(
        CACHE_KEYS.staffCatalog,
        async () => normalizeListResult(await adapter.getSpaStaff(), normalizeSpaStaff),
        BG_SPARSE_15M,
      )
    : async () => ({ success: true, data: [] });
export const getSpaStaffSchedules =
  typeof adapter.getSpaStaffSchedules === "function"
    ? createLocalFirstReader(
        CACHE_KEYS.staffSchedules,
        async () => normalizeStaffScheduleResult(await adapter.getSpaStaffSchedules()),
        { backgroundMode: "stale-only", refreshAfterMs: 5 * 60 * 1000, refreshCooldownMs: 5 * 60 * 1000 },
      )
    : async () => ({ success: true, data: [] });

export const updateSpaStaffSchedules =
  typeof adapter.updateSpaStaffSchedules === "function"
    ? createNamedMutation(
        adapter.updateSpaStaffSchedules,
        "updateSpaStaffSchedules",
        INVALIDATION_KEYS.updateSpaStaffSchedules,
        {
          optimisticFn: (payload) => patchCachedStaffSchedules(payload),
          afterSuccess: (result) => {
            if (!result?.success || !Array.isArray(result.data)) return;
            writeCache(
              CACHE_KEYS.staffSchedules,
              normalizeStaffScheduleResult(result),
              LOCAL_MUTATION_CACHE_META,
            );
          },
          onBackgroundError: globalBackgroundErrorHandler,
        },
      )
    : async () => ({ success: false, message: "not_supported" });
export function buildStaffScopedCacheKey(baseKey, filters = {}) {
  const root = String(baseKey || "").trim();
  if (!root) return "";
  const ngay = String(filters?.ngay || "").trim();
  if (ngay) return `${root}:${ngay}`;
  const tuNgay = String(filters?.tuNgay || "").trim();
  const denNgay = String(filters?.denNgay || "").trim();
  if (tuNgay && denNgay) return `${root}:${tuNgay}:${denNgay}`;
  return root;
}

export function buildStaffAttendanceCacheKey(filters = {}) {
  return buildStaffScopedCacheKey(CACHE_KEYS.staffAttendance, filters);
}

export function buildStaffViolationsCacheKey(filters = {}) {
  return buildStaffScopedCacheKey(CACHE_KEYS.staffViolations, filters);
}

export function buildStaffLeavesCacheKey(filters = {}) {
  return buildStaffScopedCacheKey(CACHE_KEYS.staffLeaves, filters);
}

export function buildStaffTrainingsCacheKey(filters = {}) {
  return buildStaffScopedCacheKey(CACHE_KEYS.staffTrainings, filters);
}

export function buildStaffChecklistsCacheKey(filters = {}) {
  return buildStaffScopedCacheKey(CACHE_KEYS.staffChecklists, filters);
}

export function buildStaffPayrollCacheKey(filters = {}) {
  return buildStaffScopedCacheKey(CACHE_KEYS.staffPayroll, filters);
}

const primeStaffLeaveRowCache = (result, args = []) => {
  const payload = args[0] || {};
  const row = result?.data && !Array.isArray(result.data)
    ? result.data
    : Array.isArray(result?.data) && result.data.length
      ? result.data[0]
      : payload;
  const tuNgay = normalizeScheduleDateKey(row?.tuNgay || payload?.tuNgay);
  const denNgay = normalizeScheduleDateKey(row?.denNgay || payload?.denNgay);
  if (!tuNgay || !denNgay || !String(row?.maNhanVien || payload?.maNhanVien || "").trim()) return;
  const normalized = {
    maDon: String(row?.maDon || payload?.maDon || `TEMP-${Date.now()}`).trim(),
    maNhanVien: String(row?.maNhanVien || payload?.maNhanVien || "").trim(),
    tuNgay,
    denNgay,
    lyDo: String(row?.lyDo || payload?.lyDo || "").trim(),
    trangThai: normalizeLeaveStatus(row?.trangThai || payload?.trangThai),
    ghiChu: String(row?.ghiChu || payload?.ghiChu || "").trim(),
  };
  upsertCachedListItem(
    buildStaffLeavesCacheKey({ tuNgay, denNgay }),
    normalized,
    "maDon",
    LOCAL_MUTATION_CACHE_META,
  );
};

const upsertCachedAttendanceRow = (row = {}, meta = {}) => {
  const ngay = normalizeScheduleDateKey(row?.ngay);
  const maNhanVien = String(row?.maNhanVien || "").trim();
  if (!ngay || !maNhanVien) return null;
  const cacheKey = buildStaffAttendanceCacheKey({ ngay });
  const caDuKien = normalizeAttendanceShiftCode(row?.caDuKien);
  const recordKey = `${maNhanVien}|${ngay}|${caDuKien}`;
  const existing = readCachedDataList(cacheKey);
  let found = false;
  const data = existing.map((item) => {
    const itemKey = `${String(item?.maNhanVien || "").trim()}|${normalizeScheduleDateKey(item?.ngay)}|${normalizeAttendanceShiftCode(item?.caDuKien)}`;
    if (itemKey !== recordKey) return item;
    found = true;
    return {
      ...item,
      ...row,
      maNhanVien,
      ngay,
      caDuKien,
    };
  });
  if (!found) {
    data.push({
      maNhanVien,
      ngay,
      caDuKien,
      checkInAt: String(row?.checkInAt || "").trim(),
      checkOutAt: String(row?.checkOutAt || "").trim(),
      trangThai: String(row?.trangThai || "").trim(),
      ghiChu: String(row?.ghiChu || "").trim(),
      updatedAt: String(row?.updatedAt || toLocalDateTimeString(new Date())).trim(),
    });
  }
  return writeCachedListResponse(cacheKey, data, meta);
};

const primeAttendanceRowCache = (result, args = []) => {
  const payload = args[0] || {};
  const row = result?.data && !Array.isArray(result.data) ? result.data : payload;
  const ngay = normalizeScheduleDateKey(row?.ngay || payload?.ngay);
  if (!ngay || !String(row?.maNhanVien || payload?.maNhanVien || "").trim()) return;
  upsertCachedAttendanceRow(
    {
      maNhanVien: String(row?.maNhanVien || payload?.maNhanVien || "").trim(),
      ngay,
      caDuKien: normalizeAttendanceShiftCode(row?.caDuKien || payload?.caDuKien),
      checkInAt: String(row?.checkInAt || payload?.checkInAt || "").trim(),
      checkOutAt: String(row?.checkOutAt || payload?.checkOutAt || "").trim(),
      trangThai: String(row?.trangThai || payload?.trangThai || "").trim(),
      ghiChu: String(row?.ghiChu || payload?.ghiChu || "").trim(),
      updatedAt: String(row?.updatedAt || toLocalDateTimeString(new Date())).trim(),
    },
    LOCAL_MUTATION_CACHE_META,
  );
};

const primeStaffTrainingRowCache = (result, args = []) => {
  const payload = args[0] || {};
  const row = result?.data && !Array.isArray(result.data)
    ? result.data
    : Array.isArray(result?.data) && result.data.length
      ? result.data[0]
      : payload;
  const tuNgay = normalizeScheduleDateKey(row?.tuNgay || payload?.tuNgay);
  const denNgay = normalizeScheduleDateKey(row?.denNgay || payload?.denNgay);
  if (!tuNgay || !denNgay || !String(row?.maNhanVien || payload?.maNhanVien || "").trim()) return;
  const normalized = {
    maDaoTao: String(row?.maDaoTao || payload?.maDaoTao || `TEMP-${Date.now()}`).trim(),
    maNhanVien: String(row?.maNhanVien || payload?.maNhanVien || "").trim(),
    loaiDaoTao: normalizeTrainingType(row?.loaiDaoTao || payload?.loaiDaoTao),
    tuNgay,
    denNgay,
    noiDung: String(row?.noiDung || payload?.noiDung || "").trim(),
    trangThai: normalizeTrainingStatus(row?.trangThai || payload?.trangThai),
    ghiChu: String(row?.ghiChu || payload?.ghiChu || "").trim(),
  };
  upsertCachedListItem(
    buildStaffTrainingsCacheKey({ tuNgay, denNgay }),
    normalized,
    "maDaoTao",
    LOCAL_MUTATION_CACHE_META,
  );
};

function createStaffScopedReader(baseKey, normalizer, fetchFn, readerOptions = BG_SPARSE_15M) {
  // Sử dụng trực tiếp createLocalFirstReader với cache key bao gồm filters
  return async (filters = {}) => {
    const cacheKey = buildStaffScopedCacheKey(baseKey, filters);
    
    // Nếu force: true, gọi trực tiếp adapter bỏ qua cache
    if (filters?.force === true) {
      try {
        const result = await fetchFn({ ...filters, force: undefined });
        return normalizer(result);
      } catch (e) {
        return { success: false, message: e.message, data: [] };
      }
    }
    
    // Dùng createLocalFirstReader với đúng cache key
    const reader = createLocalFirstReader(
      cacheKey,
      async () => {
        const result = await fetchFn(filters);
        return normalizer(result);
      },
      readerOptions,
    );
    
    return reader();
  };
}

export const getSpaAttendance =
  typeof adapter.getSpaAttendance === "function"
    ? createStaffScopedReader(
        CACHE_KEYS.staffAttendance,
        normalizeAttendanceResult,
        adapter.getSpaAttendance.bind(adapter),
        { backgroundMode: "stale-only", refreshAfterMs: 5 * 60 * 1000, refreshCooldownMs: 5 * 60 * 1000 },
      )
    : async () => ({ success: true, data: [] });
export const recordSpaAttendance =
  typeof adapter.recordSpaAttendance === "function"
    ? createNamedMutation(
        adapter.recordSpaAttendance,
        "recordSpaAttendance",
        INVALIDATION_KEYS.recordSpaAttendance,
        {
          preserveCacheKeys: [CACHE_KEYS.staffAttendance],
          optimisticFn: (payload) => {
            primeAttendanceRowCache({ success: true, data: payload }, [payload]);
            return { success: true, isOptimistic: true, data: payload };
          },
          afterSuccess: primeAttendanceRowCache,
          onBackgroundError: globalBackgroundErrorHandler,
        },
      )
    : async () => ({ success: false, message: "not_supported" });
export const getSpaShiftChecklists =
  typeof adapter.getSpaShiftChecklists === "function"
    ? createStaffScopedReader(
        CACHE_KEYS.staffChecklists,
        normalizeChecklistResult,
        adapter.getSpaShiftChecklists.bind(adapter),
      )
    : async () => ({ success: true, data: [] });
export const saveSpaShiftChecklist =
  typeof adapter.saveSpaShiftChecklist === "function"
    ? createNamedMutation(
        adapter.saveSpaShiftChecklist,
        "saveSpaShiftChecklist",
        INVALIDATION_KEYS.saveSpaShiftChecklist,
        {
          optimisticFn: (payload) => ({ success: true, isOptimistic: true, data: payload }),
          onBackgroundError: globalBackgroundErrorHandler,
        },
      )
    : async () => ({ success: false, message: "not_supported" });
export const getSpaStaffViolations =
  typeof adapter.getSpaStaffViolations === "function"
    ? createStaffScopedReader(
        CACHE_KEYS.staffViolations,
        normalizeViolationResult,
        adapter.getSpaStaffViolations.bind(adapter),
      )
    : async () => ({ success: true, data: [] });
export const saveSpaStaffViolation =
  typeof adapter.saveSpaStaffViolation === "function"
    ? createNamedMutation(
        adapter.saveSpaStaffViolation,
        "saveSpaStaffViolation",
        INVALIDATION_KEYS.saveSpaStaffViolation,
        {
          optimisticFn: (payload) => ({ success: true, isOptimistic: true, data: payload }),
          onBackgroundError: globalBackgroundErrorHandler,
        },
      )
    : async () => ({ success: false, message: "not_supported" });
export const cancelSpaStaffViolation =
  typeof adapter.cancelSpaStaffViolation === "function"
    ? createNamedMutation(
        adapter.cancelSpaStaffViolation,
        "cancelSpaStaffViolation",
        INVALIDATION_KEYS.cancelSpaStaffViolation,
        {
          optimisticFn: (payload) => ({ success: true, isOptimistic: true, data: payload }),
          onBackgroundError: globalBackgroundErrorHandler,
        },
      )
    : async () => ({ success: false, message: "not_supported" });
export const getSpaStaffLeaveRequests =
  typeof adapter.getSpaStaffLeaveRequests === "function"
    ? createStaffScopedReader(
        CACHE_KEYS.staffLeaves,
        normalizeLeaveResult,
        adapter.getSpaStaffLeaveRequests.bind(adapter),
      )
    : async () => ({ success: true, data: [] });
export const saveSpaStaffLeaveRequest =
  typeof adapter.saveSpaStaffLeaveRequest === "function"
    ? createNamedMutation(
        adapter.saveSpaStaffLeaveRequest,
        "saveSpaStaffLeaveRequest",
        INVALIDATION_KEYS.saveSpaStaffLeaveRequest,
        {
          preserveCacheKeys: [CACHE_KEYS.staffLeaves],
          optimisticFn: (payload) => ({ success: true, isOptimistic: true, data: payload }),
          afterSuccess: primeStaffLeaveRowCache,
          onBackgroundError: globalBackgroundErrorHandler,
        },
      )
    : async () => ({ success: false, message: "not_supported" });
export const reviewSpaStaffLeaveRequest =
  typeof adapter.reviewSpaStaffLeaveRequest === "function"
    ? createNamedMutation(
        adapter.reviewSpaStaffLeaveRequest,
        "reviewSpaStaffLeaveRequest",
        INVALIDATION_KEYS.reviewSpaStaffLeaveRequest,
        {
          preserveCacheKeys: [CACHE_KEYS.staffLeaves],
          optimisticFn: (payload) => ({ success: true, isOptimistic: true, data: payload }),
          afterSuccess: primeStaffLeaveRowCache,
          onBackgroundError: globalBackgroundErrorHandler,
        },
      )
    : async () => ({ success: false, message: "not_supported" });
export const getSpaStaffTrainings =
  typeof adapter.getSpaStaffTrainings === "function"
    ? createStaffScopedReader(
        CACHE_KEYS.staffTrainings,
        normalizeTrainingResult,
        adapter.getSpaStaffTrainings.bind(adapter),
      )
    : async () => ({ success: true, data: [] });
export const saveSpaStaffTraining =
  typeof adapter.saveSpaStaffTraining === "function"
    ? createNamedMutation(
        adapter.saveSpaStaffTraining,
        "saveSpaStaffTraining",
        INVALIDATION_KEYS.saveSpaStaffTraining,
        {
          preserveCacheKeys: [CACHE_KEYS.staffTrainings],
          optimisticFn: (payload) => ({ success: true, isOptimistic: true, data: payload }),
          afterSuccess: primeStaffTrainingRowCache,
          onBackgroundError: globalBackgroundErrorHandler,
        },
      )
    : async () => ({ success: false, message: "not_supported" });
export const getSpaPayrollRecords =
  typeof adapter.getSpaPayrollRecords === "function"
    ? createStaffScopedReader(
        CACHE_KEYS.staffPayroll,
        normalizePayrollResult,
        adapter.getSpaPayrollRecords.bind(adapter),
      )
    : async () => ({ success: true, data: [] });
export const lockSpaPayrollPeriod =
  typeof adapter.lockSpaPayrollPeriod === "function"
    ? createNamedMutation(
        adapter.lockSpaPayrollPeriod,
        "lockSpaPayrollPeriod",
        INVALIDATION_KEYS.lockSpaPayrollPeriod,
        {
          // Lock payroll should only update after BE confirms - no optimistic UI
          onBackgroundError: globalBackgroundErrorHandler,
        },
      )
    : async () => ({ success: false, message: "not_supported" });
export const createSpaStaff =
  typeof adapter.createSpaStaff === "function"
    ? createSpaMutation(adapter.createSpaStaff, "createSpaStaff", INVALIDATION_KEYS.createSpaStaff, normalizeSpaStaff, {
        optimisticFn: (payload) => ({
          success: true,
          isOptimistic: true,
          data: normalizeSpaStaff(payload),
        }),
        afterSuccess: primeStaffCatalogCache,
        preserveCacheKeys: STAFF_CATALOG_PRESERVE_KEYS,
      })
    : async () => ({ success: false, message: "not_supported" });
export const updateSpaStaff =
  typeof adapter.updateSpaStaff === "function"
    ? createSpaMutation(adapter.updateSpaStaff, "updateSpaStaff", INVALIDATION_KEYS.updateSpaStaff, normalizeSpaStaff, {
        optimisticFn: (payload) => ({
          success: true,
          isOptimistic: true,
          data: normalizeSpaStaff(payload),
        }),
        afterSuccess: primeStaffCatalogCache,
        preserveCacheKeys: STAFF_CATALOG_PRESERVE_KEYS,
      })
    : async () => ({ success: false, message: "not_supported" });
export const deleteSpaStaff =
  typeof adapter.deleteSpaStaff === "function"
    ? createSpaMutation(adapter.deleteSpaStaff, "deleteSpaStaff", INVALIDATION_KEYS.deleteSpaStaff, normalizeSpaStaff, {
        optimisticFn: () => ({ success: true, isOptimistic: true }),
        afterSuccess: (result, args) => {
          const code = String(args[0]?.maNhanVien || result?.data?.maNhanVien || "").trim();
          if (!code) return;
          removeCachedListItem(CACHE_KEYS.staffCatalog, "maNhanVien", code, LOCAL_MUTATION_CACHE_META);
        },
        preserveCacheKeys: STAFF_CATALOG_PRESERVE_KEYS,
      })
    : async () => ({ success: false, message: "not_supported" });
export const getTreatmentBeds = getRooms;
export const getTreatmentPackages =
  typeof adapter.getTreatmentPackages === "function"
    ? createLocalFirstReader(
        CACHE_KEYS.treatmentPackages,
        async () => {
          const result = await adapter.getTreatmentPackages();
          return normalizeListResult(result, normalizeTreatmentPackage);
        },
        BG_SPARSE_30M,
      )
    : async () => ({ success: true, data: [] });
export const getTreatmentCatalogs =
  typeof adapter.getTreatmentCatalogs === "function"
    ? createLocalFirstReader(
        CACHE_KEYS.treatmentCatalogs,
        adapter.getTreatmentCatalogs,
        BG_SPARSE_15M,
      )
    : async () => ({ success: true, data: { phacDo: [], dichVu: [], goiDieuTri: [] } });
export const saveTreatmentCatalogs =
  typeof adapter.saveTreatmentCatalogs === "function"
    ? createNamedMutation(
        adapter.saveTreatmentCatalogs,
        "saveTreatmentCatalogs",
        INVALIDATION_KEYS.saveTreatmentCatalogs,
        {
          optimisticFn: (payload) => ({ success: true, isOptimistic: true, data: payload }),
          afterSuccess: async () => {
            // Always fetch fresh treatment catalogs data after mutation
            try {
              const catalogsResult = await adapter.getTreatmentCatalogs();
              if (catalogsResult?.success) {
                writeCache(
                  CACHE_KEYS.treatmentCatalogs,
                  { success: true, data: catalogsResult.data },
                  LOCAL_MUTATION_CACHE_META,
                );
              }
            } catch (_) {
              // Silent failure - catalogs will be refreshed on next read
            }
            // Always fetch fresh treatment packages data after mutation
            // This ensures create-order page sees the new package immediately
            try {
              const packagesResult = await adapter.getTreatmentPackages();
              if (packagesResult?.success) {
                writeCache(
                  CACHE_KEYS.treatmentPackages,
                  packagesResult,
                  LOCAL_MUTATION_CACHE_META,
                );
              }
            } catch (_) {
              // Silent failure - packages will be refreshed on next read
            }
          },
          preserveCacheKeys: [CACHE_KEYS.treatmentCatalogs],
          onBackgroundError: globalBackgroundErrorHandler,
        },
      )
    : async () => ({ success: false, message: "not_supported" });
export const getStayHistory = createLocalFirstReader(
  CACHE_KEYS.stayHistory,
  async (filters = {}) => {
    const result = await adapter.getStayHistory(filters || {});
    return normalizeListResult(result, normalizeTreatmentSession);
  },
  BG_SPARSE_15M,
);
export const getTreatmentHistory = getStayHistory;
export const createBooking = createSpaMutation(
  adapter.createBooking,
  "createBooking",
  INVALIDATION_KEYS.createBooking,
  normalizeTreatmentSession,
  { 
    primeSessionCache: true,
    optimisticFn: (payload) => ({
      success: true,
      data: {
        ...payload,
        maPhien: `TEMP-${Date.now()}`,
        trangThaiPhien: "BOOKED",
        batDauAt: payload?.batDauAt || toLocalDateTimeString(new Date())
      }
    })
  },
);
export const createBookingWithItems =
  typeof adapter.createBookingWithItems === "function"
    ? createSpaMutation(
        adapter.createBookingWithItems,
        "createBookingWithItems",
        INVALIDATION_KEYS.createBookingWithItems,
        normalizeTreatmentSession,
        { 
          primeSessionCache: true,
          optimisticFn: (payload) => ({
            success: true,
            data: {
              ...payload,
              maPhien: 'TEMP-' + Date.now(),
              trangThaiPhien: "BOOKED",
              batDauAt: payload?.batDauAt || toLocalDateTimeString(new Date())
            }
          })
        },
      )
    : createBooking;
export const createSpaBooking = createBooking;
export const createSpaBookingWithItems = createBookingWithItems;
export const checkInRoom = createSpaMutation(
  adapter.checkInRoom,
  "checkInRoom",
  INVALIDATION_KEYS.checkInRoom,
  normalizeTreatmentSession,
  { 
    primeSessionCache: true, 
    roomStatus: "Đang trị liệu",
    optimisticFn: (payload) => ({
      success: true,
      data: {
        ...payload,
        maPhien: payload?.maPhien || 'TEMP-' + Date.now(),
        trangThaiPhien: "IN_HOUSE",
        batDauAt: payload?.batDauAt || toLocalDateTimeString(new Date())
      }
    })
  },
);
export const checkInRoomWithItems =
  typeof adapter.checkInRoomWithItems === "function"
    ? createSpaMutation(
        adapter.checkInRoomWithItems,
        "checkInRoomWithItems",
        INVALIDATION_KEYS.checkInRoomWithItems,
        normalizeTreatmentSession,
        { 
          primeSessionCache: true, 
          roomStatus: "Đang trị liệu",
          optimisticFn: (payload) => ({
            success: true,
            data: {
              ...payload,
              maPhien: payload?.maPhien || 'TEMP-' + Date.now(),
              trangThaiPhien: "IN_HOUSE",
              batDauAt: payload?.batDauAt || toLocalDateTimeString(new Date())
            }
          })
        },
      )
    : checkInRoom;
export const startTreatmentSession = checkInRoom;
export const startTreatmentSessionWithItems = checkInRoomWithItems;
export const addStayServiceItem = createSpaMutation(
  adapter.addStayServiceItem,
  "addStayServiceItem",
  INVALIDATION_KEYS.addStayServiceItem,
  normalizeTreatmentSession,
  { primeSessionCache: true },
);
export const addTreatmentServiceItem = addStayServiceItem;
export const checkoutRoom = createSpaMutation(
  adapter.checkoutRoom,
  "checkoutRoom",
  INVALIDATION_KEYS.checkoutRoom,
  normalizeTreatmentSession,
  { 
    primeSessionCache: true,
    patchInventoryOnCheckout: true,
    preserveCacheKeys: CHECKOUT_PRESERVED_CACHE_KEYS,
    roomStatus: "Sẵn sàng",
  },
);
export const completeTreatmentSession = checkoutRoom;
export const markTreatmentNoShow = createSpaMutation(
  adapter.markTreatmentNoShow,
  "markTreatmentNoShow",
  INVALIDATION_KEYS.markTreatmentNoShow,
  normalizeTreatmentSession,
  { primeSessionCache: true },
);
export const markSpaAppointmentNoShow = markTreatmentNoShow;
export const updateStayServiceItem = createSpaMutation(
  adapter.updateStayServiceItem,
  "updateStayServiceItem",
  INVALIDATION_KEYS.updateStayServiceItem,
  normalizeTreatmentSession,
  { primeSessionCache: true },
);
export const updateTreatmentServiceItem = updateStayServiceItem;
export const deleteStayServiceItem = createSpaMutation(
  adapter.deleteStayServiceItem,
  "deleteStayServiceItem",
  INVALIDATION_KEYS.deleteStayServiceItem,
  normalizeTreatmentSession,
  { primeSessionCache: true },
);
export const deleteTreatmentServiceItem = deleteStayServiceItem;
export const updateStayTime = createSpaMutation(
  adapter.updateStayTime,
  "updateStayTime",
  INVALIDATION_KEYS.updateStayTime,
  normalizeTreatmentSession,
  { primeSessionCache: true },
);
export const updateStayStaff = createSpaMutation(
  adapter.updateStayStaff,
  "updateStayStaff",
  [CACHE_KEYS.stayHistory],
);
export const updateTreatmentSessionTime = updateStayTime;
export const updateRoomStatus = createSpaMutation(
  adapter.updateRoomStatus,
  "updateRoomStatus",
  INVALIDATION_KEYS.updateRoomStatus,
  normalizeTreatmentBed,
  {
    optimisticFn: (payload) => ({
      success: true,
      data: {
        maGiuong: payload?.maGiuong || payload?.roomId,
        trangThaiGiuong: payload?.status || payload?.trangThaiGiuong
      }
    })
  }
);
export const createTreatmentBed = createSpaMutation(
  adapter.createTreatmentBed,
  "createTreatmentBed",
  INVALIDATION_KEYS.createTreatmentBed,
  normalizeTreatmentBed,
);
export const logClientError = (payload) => api.logClientError(payload);

export const updateTreatmentBed = createSpaMutation(
  adapter.updateTreatmentBed,
  "updateTreatmentBed",
  INVALIDATION_KEYS.updateTreatmentBed,
  normalizeTreatmentBed,
);
export const deleteTreatmentBed = createSpaMutation(
  adapter.deleteTreatmentBed,
  "deleteTreatmentBed",
  INVALIDATION_KEYS.deleteTreatmentBed,
  normalizeTreatmentBed,
);
export const updateProductCatalogItem = createNamedMutation(
  adapter.updateProductCatalogItem,
  "updateProductCatalogItem",
  INVALIDATION_KEYS.updateProductCatalogItem,
);
export const createProductCatalogItem = createNamedMutation(
  adapter.createProductCatalogItem,
  "createProductCatalogItem",
  INVALIDATION_KEYS.createProductCatalogItem,
);
export const deleteProductCatalogItem = createNamedMutation(
  adapter.deleteProductCatalogItem,
  "deleteProductCatalogItem",
  INVALIDATION_KEYS.deleteProductCatalogItem,
);
export const getCustomerCatalog = createLocalFirstReader(
  CACHE_KEYS.customerCatalog,
  adapter.getCustomerCatalog,
  BG_SPARSE_30M,
);
export const getCustomerProgress =
  typeof adapter.getCustomerProgress === "function"
    ? createLocalFirstReader(
        CACHE_KEYS.customerProgress,
        adapter.getCustomerProgress,
        BG_SPARSE_15M,
      )
    : async () => ({ success: true, data: [] });
export const getCtBanHistory = typeof adapter.getCtBanHistory === "function"
  ? createLocalFirstReader(
      CACHE_KEYS.ctBanHistory,
      adapter.getCtBanHistory,
      { ttlMs: 900000, refreshAfterMs: 900000, refreshCooldownMs: 300000 },
    )
  : async () => ({ success: true, data: [] });

// CT_BAN KPI - dùng cache với date range key
export const getCtBanKpiData = (filters = {}) => {
  if (typeof adapter.getCtBanKpiData !== "function") {
    return Promise.resolve({ success: true, data: [] });
  }
  
  const { tuNgay, denNgay } = filters || {};
  // Cache key theo date range để reuse khi cùng khoảng date
  const cacheKey = tuNgay && denNgay 
    ? `${CACHE_KEYS.ctBanKpiData}:${tuNgay}:${denNgay}`
    : CACHE_KEYS.ctBanKpiData;
  
  // Thử đọc từ cache trước
  const cached = readCache(cacheKey);
  if (cached?.response?.success && Array.isArray(cached.response.data)) {
    console.log("[getCtBanKpiData] Cache hit for:", cacheKey);
    return Promise.resolve(cached.response);
  }
  
  // Gọi API và cache kết quả
  return adapter.getCtBanKpiData(filters || {}).then((result) => {
    if (result.success && Array.isArray(result.data)) {
      writeCache(cacheKey, result, 15 * 60 * 1000); // Cache 15 phút
      console.log("[getCtBanKpiData] Cached:", cacheKey, result.data.length, "rows");
    }
    return result;
  });
};
export const getSupplierCatalog = createLocalFirstReader(
  CACHE_KEYS.supplierCatalog,
  adapter.getSupplierCatalog,
  BG_SPARSE_30M,
);
export const getOrderHistory = createLocalFirstReader(
  CACHE_KEYS.orderHistory,
  adapter.getOrderHistory,
  BG_SPARSE_15M,
);
export const createReceiptPdf = adapter.createReceiptPdf;
export const createOrder = createNamedMutation(
  adapter.createOrder,
  "createOrder",
  INVALIDATION_KEYS.createOrder,
);
export const createInventoryReceipt = createNamedMutation(
  adapter.createInventoryReceipt,
  "createInventoryReceipt",
  INVALIDATION_KEYS.createInventoryReceipt,
);
export const getInventorySuggestions = createLocalFirstReader(
  CACHE_KEYS.inventorySuggestions,
  adapter.getInventorySuggestions,
  BG_SPARSE_30M,
);
export const updateOrder = createNamedMutation(
  adapter.updateOrder,
  "updateOrder",
  INVALIDATION_KEYS.updateOrder,
);
export const deleteOrder = createNamedMutation(
  adapter.deleteOrder,
  "deleteOrder",
  INVALIDATION_KEYS.deleteOrder,
);
export const getInventory = createLocalFirstReader(
  CACHE_KEYS.inventory,
  adapter.getInventory,
  BG_SPARSE_15M,
);
export const getReceiptHistory = createLocalFirstReader(
  CACHE_KEYS.receiptHistory,
  adapter.getReceiptHistory,
  BG_SPARSE_15M,
);
export const getAppSetting = createLocalFirstReader(
  CACHE_KEYS.appSetting,
  adapter.getAppSetting,
  BG_SPARSE_60M
);
export const setAppSetting = withRealtimeSignal(
  adapter.setAppSetting,
  "setAppSetting",
);
export const formatAllSheets = adapter.formatAllSheets;
export const uploadImageToImgBB = adapter.uploadImageToImgBB;
export const issueEasyInvoice = withRealtimeSignal(
  adapter.issueEasyInvoice,
  "issueEasyInvoice",
);
export const cancelEasyInvoice = withRealtimeSignal(
  adapter.cancelEasyInvoice,
  "cancelEasyInvoice",
);
export const replaceEasyInvoice = withRealtimeSignal(
  adapter.replaceEasyInvoice,
  "replaceEasyInvoice",
);
export const downloadInvoicePDF = adapter.downloadInvoicePDF;
export const logAction = adapter.logAction;
export const clearAllReadCache = (meta = {}) => {
  clearCacheByKeys(READ_KEYS, { source: "manual_clear_all", ...meta });
};
export const clearReadCacheByKeys = (keys = [], meta = {}) => {
  clearCacheByKeys(keys, meta);
};

export const updateComboSchedule = createNamedMutation(
  adapter.updateComboSchedule,
  "updateComboSchedule",
  INVALIDATION_KEYS.updateComboSchedule,
  {
    preserveCacheKeys: [CACHE_KEYS.stayHistory, CACHE_KEYS.customerProgress],
    optimisticFn: (payload) => patchCachedComboSchedule(payload),
    onBackgroundError: globalBackgroundErrorHandler,
  },
);








