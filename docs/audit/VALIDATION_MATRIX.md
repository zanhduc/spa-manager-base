# Ma trận validation FE ↔ BE

Rule: [`SPA_BUSINESS_RULES.md`](../SPA_BUSINESS_RULES.md) §7 — nghiệp vụ spa validate ở UI/FE; BE chỉ persistence.

## Phân loại guard BE

| Loại | Xử lý | Ví dụ |
|------|--------|-------|
| A — Persistence | Giữ BE | Thiếu ID, không tìm thấy row, lỗi sheet |
| B — Rule spa | Chỉ FE | Trùng lịch, giường tạm dừng, trạng thái phiên |
| C — Catalog format | FE shared module | Tên SP, đơn vị, giá |
| D — Dead code | Xóa | `findScheduleConflict_` không gọi |

## Map mutation

| Mutation | FE validator | Test | BE handler | Trạng thái |
|----------|--------------|------|------------|------------|
| recordSpaAttendance | `staffConstants.validateAttendanceAction` | staffAttendance.test | localAdapter | aligned |
| saveSpaShiftChecklist | `staffChecklistHelpers` | staffChecklist.test | localAdapter | aligned |
| saveSpaStaffViolation | `staffViolationHelpers` | staffViolation.test | localAdapter | aligned |
| saveSpaStaffLeaveRequest | `staffLeaveHelpers` | staffLeave.test | localAdapter | aligned |
| saveSpaStaffTraining | `staffTrainingHelpers` | staffTraining.test | localAdapter | aligned |
| lockSpaPayrollPeriod | `staffPayrollLockHelpers` | staffPayrollLock.test | idempotent nếu đã chốt | aligned |
| create/update Product | `productValidators.validateProductRow` | validationMatrix.test | persistence only | aligned |
| createInventoryReceipt | `inventoryValidators` | validationMatrix.test | localAdapter | aligned |
| saveTreatmentCatalogs | `treatmentCatalogValidators` | validationMatrix.test | gasAdapter | aligned |
| createBooking/checkIn | `sessionScheduleValidators` | create-order.timeline.test | persistence only | aligned |
| deleteSpaStaff | UI confirm + open sessions | spa-flow.test | persistence guard | aligned |

## Module FE validators

- `src/client/utils/productValidators.js`
- `src/client/utils/inventoryValidators.js`
- `src/client/utils/treatmentCatalogValidators.js`
- `src/client/utils/sessionScheduleValidators.js`
- `src/client/components/staff/*Helpers.js`
