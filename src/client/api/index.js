import { localAdapter } from "./adapters/localAdapter.js";
import { gasAdapter } from "./adapters/gasAdapter.js";
import {
  CACHE_INVALIDATED_EVENT,
  createLocalFirstReader,
  createMutationWithInvalidation,
  clearCacheByKeys,
  setMutationSuccessHook,
} from "./localCache.js";
import { publishRealtimeMutationSignal } from "../realtime/firebaseSync.js";

const adapter = import.meta.env.DEV ? localAdapter : gasAdapter;

export const api = adapter;

export const CACHE_KEYS = {
  productCatalog: "product_catalog",
  bankConfig: "bank_config",
  rooms: "rooms",
  stayHistory: "stay_history",
  customerCatalog: "customer_catalog",
  supplierCatalog: "supplier_catalog",
  debtCustomers: "debt_customers",
  orderHistory: "order_history",
  inventory: "inventory",
  receiptHistory: "receipt_history",
  inventorySuggestions: "inventory_suggestions",
  supplierDebts: "supplier_debts",
};

const READ_KEYS = Object.values(CACHE_KEYS);
export { CACHE_INVALIDATED_EVENT };

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
  updateDebtCustomer: [
    CACHE_KEYS.debtCustomers,
    CACHE_KEYS.orderHistory,
    CACHE_KEYS.customerCatalog,
  ],
  settleAllDebtCustomers: [CACHE_KEYS.debtCustomers, CACHE_KEYS.orderHistory],
  createOrder: [
    CACHE_KEYS.orderHistory,
    CACHE_KEYS.inventory,
    CACHE_KEYS.debtCustomers,
    CACHE_KEYS.productCatalog,
    CACHE_KEYS.inventorySuggestions,
    CACHE_KEYS.customerCatalog,
  ],
  createInventoryReceipt: [
    CACHE_KEYS.inventory,
    CACHE_KEYS.receiptHistory,
    CACHE_KEYS.supplierDebts,
    CACHE_KEYS.supplierCatalog,
    CACHE_KEYS.productCatalog,
    CACHE_KEYS.inventorySuggestions,
  ],
  createBooking: [CACHE_KEYS.rooms, CACHE_KEYS.stayHistory],
  checkInRoom: [CACHE_KEYS.rooms, CACHE_KEYS.stayHistory],
  addStayServiceItem: [CACHE_KEYS.stayHistory],
  checkoutRoom: [CACHE_KEYS.rooms, CACHE_KEYS.stayHistory],
  updateRoomStatus: [CACHE_KEYS.rooms],
  updateOrder: [
    CACHE_KEYS.orderHistory,
    CACHE_KEYS.inventory,
    CACHE_KEYS.debtCustomers,
    CACHE_KEYS.productCatalog,
    CACHE_KEYS.inventorySuggestions,
    CACHE_KEYS.customerCatalog,
  ],
  deleteOrder: [
    CACHE_KEYS.orderHistory,
    CACHE_KEYS.inventory,
    CACHE_KEYS.debtCustomers,
    CACHE_KEYS.customerCatalog,
  ],
  updateSupplierDebt: [CACHE_KEYS.supplierDebts, CACHE_KEYS.supplierCatalog],
  issueEasyInvoice: [CACHE_KEYS.orderHistory],
  cancelEasyInvoice: [CACHE_KEYS.orderHistory],
  replaceEasyInvoice: [CACHE_KEYS.orderHistory],
  setAppSetting: [...READ_KEYS],
});

export function getInvalidationKeysForMutation(mutationName) {
  const key = String(mutationName || "").trim();
  const keys = INVALIDATION_KEYS[key];
  return Array.isArray(keys) ? [...keys] : [];
}
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
export const revokeDeviceToken = (deviceToken, appScope = "") =>
  typeof adapter.revokeDeviceToken === "function"
    ? adapter.revokeDeviceToken(deviceToken, appScope)
    : Promise.resolve({ success: true });
export const getUserInfo = adapter.getUserInfo;
export const getDemoAccounts = adapter.getDemoAccounts;
export const getGlobalNotice = adapter.getGlobalNotice;
export const getSyncVersion =
  adapter.getSyncVersion ||
  (async () => ({ success: true, data: { version: "1" } }));
export const getNextOrderFormDefaults = adapter.getNextOrderFormDefaults;
export const getNextInventoryReceiptDefaults =
  adapter.getNextInventoryReceiptDefaults;
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
export const getRooms = createLocalFirstReader(
  CACHE_KEYS.rooms,
  adapter.getRooms,
  BG_SPARSE_15M,
);
export const getStayHistory = createLocalFirstReader(
  CACHE_KEYS.stayHistory,
  adapter.getStayHistory,
  BG_SPARSE_15M,
);
export const createBooking = createMutationWithInvalidation(
  adapter.createBooking,
  INVALIDATION_KEYS.createBooking,
);
export const checkInRoom = createMutationWithInvalidation(
  adapter.checkInRoom,
  INVALIDATION_KEYS.checkInRoom,
);
export const addStayServiceItem = createMutationWithInvalidation(
  adapter.addStayServiceItem,
  INVALIDATION_KEYS.addStayServiceItem,
);
export const checkoutRoom = createMutationWithInvalidation(
  adapter.checkoutRoom,
  INVALIDATION_KEYS.checkoutRoom,
);
export const updateRoomStatus = createMutationWithInvalidation(
  adapter.updateRoomStatus,
  INVALIDATION_KEYS.updateRoomStatus,
);
export const updateProductCatalogItem = createMutationWithInvalidation(
  adapter.updateProductCatalogItem,
  INVALIDATION_KEYS.updateProductCatalogItem,
);
export const createProductCatalogItem = createMutationWithInvalidation(
  adapter.createProductCatalogItem,
  INVALIDATION_KEYS.createProductCatalogItem,
);
export const deleteProductCatalogItem = createMutationWithInvalidation(
  adapter.deleteProductCatalogItem,
  INVALIDATION_KEYS.deleteProductCatalogItem,
);
export const getCustomerCatalog = createLocalFirstReader(
  CACHE_KEYS.customerCatalog,
  adapter.getCustomerCatalog,
  BG_SPARSE_30M,
);
export const getSupplierCatalog = createLocalFirstReader(
  CACHE_KEYS.supplierCatalog,
  adapter.getSupplierCatalog,
  BG_SPARSE_30M,
);
export const getDebtCustomers = createLocalFirstReader(
  CACHE_KEYS.debtCustomers,
  adapter.getDebtCustomers,
  BG_SPARSE_15M,
);
export const updateDebtCustomer = createMutationWithInvalidation(
  adapter.updateDebtCustomer,
  INVALIDATION_KEYS.updateDebtCustomer,
);
export const settleAllDebtCustomers = createMutationWithInvalidation(
  adapter.settleAllDebtCustomers,
  INVALIDATION_KEYS.settleAllDebtCustomers,
);
export const getOrderHistory = createLocalFirstReader(
  CACHE_KEYS.orderHistory,
  adapter.getOrderHistory,
  BG_SPARSE_15M,
);
export const createReceiptPdf = adapter.createReceiptPdf;
export const createOrder = createMutationWithInvalidation(
  adapter.createOrder,
  INVALIDATION_KEYS.createOrder,
);
export const createInventoryReceipt = createMutationWithInvalidation(
  adapter.createInventoryReceipt,
  INVALIDATION_KEYS.createInventoryReceipt,
);
export const getInventorySuggestions = createLocalFirstReader(
  CACHE_KEYS.inventorySuggestions,
  adapter.getInventorySuggestions,
  BG_SPARSE_30M,
);
export const updateOrder = createMutationWithInvalidation(
  adapter.updateOrder,
  INVALIDATION_KEYS.updateOrder,
);
export const deleteOrder = createMutationWithInvalidation(
  adapter.deleteOrder,
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
export const getAppSetting = adapter.getAppSetting;
export const setAppSetting = withRealtimeSignal(
  adapter.setAppSetting,
  "setAppSetting",
);
export const getSupplierDebts = createLocalFirstReader(
  CACHE_KEYS.supplierDebts,
  adapter.getSupplierDebts,
  BG_SPARSE_15M,
);
export const updateSupplierDebt = createMutationWithInvalidation(
  adapter.updateSupplierDebt,
  INVALIDATION_KEYS.updateSupplierDebt,
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
