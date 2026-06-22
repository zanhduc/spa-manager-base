export const normalizeProductKeyPart = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");

export const foldCatalogGroup = (value = "") =>
  String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export const isStockTrackedServiceItem = (item = {}) => {
  if (item?.theoDoiTonKho === false) return false;
  const group = foldCatalogGroup(item.nhomHang || "");
  if (group.includes("dich vu")) return false;
  if (group.includes("goi") || group.includes("the tai khoan")) return false;
  return true;
};

export const isServiceItemAlreadyDeducted = (item = {}) => {
  const raw = item?.daTruTonKho;
  if (raw === true) return true;
  return String(raw || "").trim().toUpperCase() === "TRUE";
};

export const findCatalogProductIndex = (products = [], item = {}) => {
  const itemCode = String(item.maSanPham || "").trim();
  const itemNameKey = normalizeProductKeyPart(item.tenSanPham);
  return products.findIndex((product) => {
    const code = String(product?.maSanPham || "").trim();
    if (itemCode && code && code === itemCode) return true;
    const nameKey = normalizeProductKeyPart(product?.tenSanPham);
    return Boolean(itemNameKey && nameKey && nameKey === itemNameKey);
  });
};

export const computeCheckoutStockDelta = (product = {}, item = {}) => {
  const qty = Math.max(Number(item.soLuong || 0), 0);
  if (!qty) return 0;
  const itemUnit = normalizeProductKeyPart(item.donVi);
  const bulkUnit = normalizeProductKeyPart(product.donViLon || product.donViChan);
  const retailUnit = normalizeProductKeyPart(product.donViNho || product.donViLe || product.donVi);
  const conversion = Math.max(Number(product.quyCach || product.quyDoi || 1), 1);
  if (itemUnit && bulkUnit && itemUnit === bulkUnit) return qty * conversion;
  if (itemUnit && retailUnit && itemUnit === retailUnit) return qty;
  return qty;
};

export const applyStockDeltaToProduct = (product = {}, delta = 0) => {
  if (!delta) return product;
  const current = Math.max(Number(product.tonKho ?? 0), 0);
  return {
    ...product,
    tonKho: current - delta,
  };
};

export const patchStayServiceItemsAfterStockDeduction = (stay = {}, maPhien = "") => {
  const stayCode = String(maPhien || stay.maPhien || "").trim();
  const serviceItems = Array.isArray(stay.serviceItems) ? stay.serviceItems : [];
  if (!stayCode || !serviceItems.length) return stay;
  return {
    ...stay,
    serviceItems: serviceItems.map((item) => {
      if (String(item.maPhien || "").trim() !== stayCode) return item;
      if (!isStockTrackedServiceItem(item)) {
        return { ...item, daTruTonKho: true };
      }
      if (isServiceItemAlreadyDeducted(item)) return item;
      return { ...item, daTruTonKho: true };
    }),
  };
};

export const buildCheckoutInventoryPatch = ({
  stay = null,
  inventoryProducts = [],
  catalogProducts = [],
} = {}) => {
  const maPhien = String(stay?.maPhien || "").trim();
  const serviceItems = Array.isArray(stay?.serviceItems) ? stay.serviceItems : [];
  if (!maPhien || !serviceItems.length) {
    return {
      inventoryProducts,
      catalogProducts,
      deductedCount: 0,
      patchedStay: stay,
    };
  }

  let inventory = [...inventoryProducts];
  let catalog = [...catalogProducts];
  let deductedCount = 0;

  for (const item of serviceItems) {
    if (String(item.maPhien || "").trim() !== maPhien) continue;
    if (isServiceItemAlreadyDeducted(item)) continue;
    if (!isStockTrackedServiceItem(item)) continue;

    const inventoryIndex = findCatalogProductIndex(inventory, item);
    const catalogIndex = findCatalogProductIndex(catalog, item);
    const product = inventoryIndex >= 0 ? inventory[inventoryIndex] : catalog[catalogIndex];
    if (!product) continue;

    const delta = computeCheckoutStockDelta(product, item);
    if (inventoryIndex >= 0) {
      inventory[inventoryIndex] = applyStockDeltaToProduct(inventory[inventoryIndex], delta);
    }
    if (catalogIndex >= 0) {
      catalog[catalogIndex] = applyStockDeltaToProduct(catalog[catalogIndex], delta);
    }
    deductedCount += 1;
  }

  return {
    inventoryProducts: inventory,
    catalogProducts: catalog,
    deductedCount,
    patchedStay: patchStayServiceItemsAfterStockDeduction(stay, maPhien),
  };
};

export const TREATMENT_SESSION_PRESERVE_IF_EMPTY_FIELDS = [
  "maPhien",
  "maLichHen",
  "maGiuong",
  "tenKhach",
  "soDienThoai",
  "maNhanVien",
  "tenNhanVien",
  "maGoi",
  "tenGoi",
  "maDv",
  "tenDichVu",
  "batDauAt",
  "ketThucDuKien",
];

export const mergeTreatmentSessionPatch = (base = {}, patch = {}) => {
  const result = { ...base };
  Object.entries(patch || {}).forEach(([field, value]) => {
    if (field === "serviceItems") {
      const nextItems = Array.isArray(value) ? value : null;
      const currentItems = Array.isArray(result.serviceItems) ? result.serviceItems : [];
      if (nextItems && nextItems.length > 0) {
        result.serviceItems = nextItems;
      } else if (!currentItems.length && nextItems) {
        result.serviceItems = nextItems;
      }
      return;
    }
    if (TREATMENT_SESSION_PRESERVE_IF_EMPTY_FIELDS.includes(field)) {
      if (String(value ?? "").trim()) result[field] = value;
      return;
    }
    if (value !== undefined) result[field] = value;
  });
  return result;
};

export const findCachedStayByMaPhien = (stayHistoryResponse, maPhien = "") => {
  const code = String(maPhien || "").trim();
  if (!code || !stayHistoryResponse?.success || !Array.isArray(stayHistoryResponse.data)) {
    return null;
  }
  return (
    stayHistoryResponse.data.find((row) => String(row?.maPhien || "").trim() === code) || null
  );
};
