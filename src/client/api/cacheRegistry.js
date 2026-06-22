/**
 * Bản đồ cache ↔ trang ↔ luồng chéo.
 * Dùng khi mutation cần biết cache nào phải prime và màn nào cần nghe sự kiện.
 */

export const CACHE_KEY_IDS = Object.freeze({
  staffCatalog: "staff_catalog",
  staffSchedules: "staff_schedules",
  staffAttendance: "staff_attendance",
  staffChecklists: "staff_checklists",
  staffViolations: "staff_violations",
  staffLeaves: "staff_leaves",
  staffTrainings: "staff_trainings",
  staffPayroll: "staff_payroll",
  stayHistory: "stay_history",
  rooms: "rooms",
  customerProgress: "customer_progress",
  ctBanHistory: "ct_ban_history",
  productCatalog: "product_catalog",
  inventory: "inventory",
  inventorySuggestions: "inventory_suggestions",
  orderHistory: "order_history",
  receiptHistory: "receipt_history",
  customerCatalog: "customer_catalog",
  supplierCatalog: "supplier_catalog",
  treatmentCatalogs: "treatment_catalogs",
  treatmentPackages: "treatment_packages",
  bankConfig: "bank_config",
});

/** Trang / panel đang đọc cache key này */
export const CACHE_CONSUMERS = Object.freeze({
  [CACHE_KEY_IDS.staffCatalog]: [
    "staff-management",
    "create-order",
    "StaffSchedulePanel",
    "StaffAttendancePanel",
  ],
  [CACHE_KEY_IDS.staffSchedules]: [
    "staff-management",
    "StaffSchedulePanel",
    "StaffAttendancePanel",
    "create-order",
    "create-order.timeline",
  ],
  [CACHE_KEY_IDS.staffAttendance]: [
    "staff-management",
    "StaffAttendancePanel",
    "StaffKpiPanel",
    "StaffPayrollPanel",
  ],
  [CACHE_KEY_IDS.staffChecklists]: ["staff-management", "StaffChecklistPanel"],
  [CACHE_KEY_IDS.staffViolations]: ["staff-management", "StaffViolationPanel"],
  [CACHE_KEY_IDS.staffLeaves]: ["staff-management", "StaffLeavePanel"],
  [CACHE_KEY_IDS.staffTrainings]: ["staff-management", "StaffTrainingPanel"],
  [CACHE_KEY_IDS.staffPayroll]: ["staff-management", "StaffPayrollPanel"],
  [CACHE_KEY_IDS.stayHistory]: [
    "create-order",
    "create-order.timeline",
    "history",
    "customer-progress",
    "staff-management",
  ],
  [CACHE_KEY_IDS.rooms]: ["create-order", "create-order.timeline"],
  [CACHE_KEY_IDS.customerProgress]: ["customer-progress", "create-order"],
  [CACHE_KEY_IDS.ctBanHistory]: ["stats"],
  [CACHE_KEY_IDS.productCatalog]: [
    "products",
    "inventory",
    "receipt",
    "create-order",
    "stock",
  ],
  [CACHE_KEY_IDS.inventory]: ["stock", "receipt", "create-order"],
  [CACHE_KEY_IDS.inventorySuggestions]: ["inventory", "receipt", "stock"],
  [CACHE_KEY_IDS.orderHistory]: ["history", "stats"],
  [CACHE_KEY_IDS.receiptHistory]: ["receipt"],
  [CACHE_KEY_IDS.customerCatalog]: ["history", "create-order"],
  [CACHE_KEY_IDS.supplierCatalog]: ["receipt"],
  [CACHE_KEY_IDS.treatmentCatalogs]: ["treatment-catalogs", "create-order"],
  [CACHE_KEY_IDS.treatmentPackages]: ["treatment-catalogs", "create-order"],
  [CACHE_KEY_IDS.bankConfig]: ["create-order", "qr-oxu-test"],
});

/**
 * Cache bổ sung cần invalidate / prime khi mutation chạy (ngoài invalidation cơ bản).
 * Ví dụ: đổi lịch → chấm công phải thấy ngay.
 */
export const MUTATION_CROSS_SYNC = Object.freeze({
  createSpaStaff: [CACHE_KEY_IDS.staffSchedules],
  updateSpaStaff: [CACHE_KEY_IDS.staffSchedules, CACHE_KEY_IDS.staffAttendance],
  deleteSpaStaff: [
    CACHE_KEY_IDS.staffAttendance,
    CACHE_KEY_IDS.staffChecklists,
    CACHE_KEY_IDS.staffViolations,
    CACHE_KEY_IDS.staffLeaves,
    CACHE_KEY_IDS.staffTrainings,
    CACHE_KEY_IDS.staffPayroll,
  ],
  updateSpaStaffSchedules: [CACHE_KEY_IDS.staffAttendance],
  recordSpaAttendance: [CACHE_KEY_IDS.staffPayroll],
  reviewSpaStaffLeaveRequest: [CACHE_KEY_IDS.staffCatalog],
  saveSpaStaffTraining: [CACHE_KEY_IDS.staffCatalog],
  checkoutRoom: [
    CACHE_KEY_IDS.productCatalog,
    CACHE_KEY_IDS.inventory,
    CACHE_KEY_IDS.inventorySuggestions,
  ],
  createBooking: [CACHE_KEY_IDS.rooms],
  checkInRoom: [CACHE_KEY_IDS.rooms, CACHE_KEY_IDS.customerProgress],
  addStayServiceItem: [CACHE_KEY_IDS.inventory, CACHE_KEY_IDS.productCatalog],
  saveTreatmentCatalogs: [CACHE_KEY_IDS.treatmentPackages],
  updateProductCatalogItem: [CACHE_KEY_IDS.inventory, CACHE_KEY_IDS.inventorySuggestions],
  createProductCatalogItem: [CACHE_KEY_IDS.inventory, CACHE_KEY_IDS.inventorySuggestions],
  deleteProductCatalogItem: [CACHE_KEY_IDS.inventory, CACHE_KEY_IDS.inventorySuggestions],
  createOrder: [CACHE_KEY_IDS.inventory, CACHE_KEY_IDS.customerCatalog],
  createInventoryReceipt: [
    CACHE_KEY_IDS.productCatalog,
    CACHE_KEY_IDS.inventorySuggestions,
  ],
  createBookingWithItems: [
    CACHE_KEY_IDS.rooms,
    CACHE_KEY_IDS.customerProgress,
    CACHE_KEY_IDS.stayHistory,
  ],
  checkInRoomWithItems: [
    CACHE_KEY_IDS.rooms,
    CACHE_KEY_IDS.customerProgress,
    CACHE_KEY_IDS.stayHistory,
  ],
  markTreatmentNoShow: [CACHE_KEY_IDS.rooms, CACHE_KEY_IDS.customerProgress],
  updateStayTime: [CACHE_KEY_IDS.stayHistory, CACHE_KEY_IDS.customerProgress],
  updateStayServiceItem: [
    CACHE_KEY_IDS.inventory,
    CACHE_KEY_IDS.productCatalog,
    CACHE_KEY_IDS.stayHistory,
  ],
  deleteStayServiceItem: [
    CACHE_KEY_IDS.inventory,
    CACHE_KEY_IDS.productCatalog,
    CACHE_KEY_IDS.stayHistory,
  ],
  createTreatmentBed: [CACHE_KEY_IDS.stayHistory],
  updateTreatmentBed: [CACHE_KEY_IDS.stayHistory],
  deleteTreatmentBed: [CACHE_KEY_IDS.stayHistory],
  saveSpaShiftChecklist: [CACHE_KEY_IDS.staffAttendance],
  saveSpaStaffViolation: [CACHE_KEY_IDS.staffPayroll],
  cancelSpaStaffViolation: [CACHE_KEY_IDS.staffPayroll],
  saveSpaStaffLeaveRequest: [CACHE_KEY_IDS.staffCatalog],
  lockSpaPayrollPeriod: [CACHE_KEY_IDS.staffPayroll],
  updateOrder: [CACHE_KEY_IDS.customerCatalog, CACHE_KEY_IDS.inventory],
  deleteOrder: [CACHE_KEY_IDS.inventory, CACHE_KEY_IDS.customerCatalog],
  issueEasyInvoice: [CACHE_KEY_IDS.ctBanHistory],
  cancelEasyInvoice: [CACHE_KEY_IDS.ctBanHistory],
  replaceEasyInvoice: [CACHE_KEY_IDS.ctBanHistory],
});

export function mergeInvalidationKeys(mutationName = "", baseKeys = []) {
  const base = (Array.isArray(baseKeys) ? baseKeys : [])
    .map((key) => String(key || "").trim())
    .filter(Boolean);
  const extra = (MUTATION_CROSS_SYNC[String(mutationName || "").trim()] || [])
    .map((key) => String(key || "").trim())
    .filter(Boolean);
  return [...new Set([...base, ...extra])];
}

export function getCacheConsumers(cacheKey = "") {
  const key = String(cacheKey || "").trim();
  return CACHE_CONSUMERS[key] ? [...CACHE_CONSUMERS[key]] : [];
}
