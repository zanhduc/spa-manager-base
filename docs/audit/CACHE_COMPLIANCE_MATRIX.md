# Ma trận tuân thủ cache (audit)

Cập nhật: triển khai plan Audit Cache FE-BE.

## Tiêu chí

| Cột | Pass |
|-----|------|
| Mount hydrate | `useState(() => readCache/readCachedList)` |
| Background fetch | `createLocalFirstReader` hoặc `loadData` silent khi đã có cache |
| Event listener | `useCacheSync` / `useCachedQuery` |
| Toast | Không toast `local_mutation*` / `manual_refresh*` |
| Validation | Rule nghiệp vụ ở FE helpers |

## Ma trận surface × cache key

| Surface | Keys đọc | Mount | Listener | Manual refresh | Draft | Ghi chú |
|---------|----------|-------|----------|----------------|-------|---------|
| create-order | rooms, stays, staff, catalogs, bank | PASS | manual → migrate | Có | booking | Phức tạp, nhiều keys |
| history | stayHistory, ctBanHistory | PASS | useCacheSync | Có | — | Mẫu chuẩn |
| products | productCatalog | PASS | useCacheSync | Có | productEditor | mergeRowsWithDraft |
| treatment-catalogs | treatmentCatalogs, packages | PASS | manual | Có | catalog+tab | |
| inventory | productCatalog, suggestions, supplier | PASS | useCacheSync | Có | — | Không đọc `inventory` (form nhập) |
| stock | inventory | PASS | useCacheSync | Có | — | |
| stats | orderHistory, ctBanHistory, stays | PASS | useCacheSync | Có | — | |
| staff-management | staffCatalog, stays | PASS | mixed | Có | — | |
| customer-progress | customerProgress | PASS | useCacheSync | Có | — | Hydrate trước refetch |
| receipt | orderHistory | PASS | useCacheSync | — | — | Cache-first mount |
| StaffAttendancePanel | staffAttendance (ngày) | PASS | prefix | — | — | |
| StaffSchedulePanel | staffSchedules | PASS | useCachedQuery+manual | — | schedule | |
| StaffPayrollPanel | attendance range, payroll | PASS | prefix | — | — | |
| StaffLeave/Training/Violation | range keys | PASS | prefix | — | — | |
| StaffChecklistPanel | checklists | PASS | manual | — | — | |
| StaffCatalogPanel | staffCatalog | PASS | parent query | — | catalog | |
| StaffKpiPanel | — | N/A | parent props | — | — | Derived từ parent |

## Gap đã xử lý

- `receipt.jsx`: mount cache-first, fetch nền silent
- `customer-progress.jsx`: hydrate cache trước khi refetch stayHistory
- `inventory.jsx`: enrich suggestions từ catalog khi apply cache
- `useCacheSync`: hỗ trợ `cacheKeyPrefixes` cho staff date-scoped keys
- `CACHE_CONSUMERS.inventory`: ghi chú trang nhập kho dùng catalog/suggestions, `stock` đọc tồn

## Invalidation cross-sync

Xem [`cacheRegistry.js`](../src/client/api/cacheRegistry.js) `MUTATION_CROSS_SYNC` — wire qua `mergeInvalidationKeys` trong `index.js`.
