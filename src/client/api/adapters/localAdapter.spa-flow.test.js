import { describe, expect, it, vi } from "vitest";

const loadFreshLocalAdapter = async () => {
  vi.resetModules();
  const mod = await import("./localAdapter.js");
  return mod.localAdapter;
};

// Adapter tests cover persistence behavior only. Business validation lives in UI/React.
describe("localAdapter spa core flows", () => {
  const localDateAt = (hour, minute = 0) => {
    const now = new Date();
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      hour,
      minute,
      0,
      0,
    ).toISOString();
  };

  it("persists immediate check-in even when bed is temporarily paused", async () => {
    const adapter = await loadFreshLocalAdapter();
    const status = await adapter.updateRoomStatus({
      maGiuong: "P102",
      trangThaiGiuong: "Đang tạm dừng",
    });
    expect(status.success).toBe(true);
    const res = await adapter.checkInRoom({
      maGiuong: "P102",
      tenKhach: "Test Customer",
    });
    expect(res.success).toBe(true);
    expect(res.data?.maPhien).toBe("LT00001");
  });

  it("normalizes invalid checkout time to a valid duration on check-in", async () => {
    const adapter = await loadFreshLocalAdapter();
    const now = new Date();
    const past = new Date(now.getTime() - 60 * 60 * 1000);

    const res = await adapter.checkInRoom({
      maGiuong: "P101",
      tenKhach: "Walk-in",
      batDauAt: now.toISOString(),
      ketThucDuKien: past.toISOString(),
    });

    expect(res.success).toBe(true);
    expect(new Date(res.data?.ketThucDuKien).getTime()).toBeGreaterThan(
      new Date(res.data?.batDauAt).getTime(),
    );
  });

  it("reuses booking code on check-in for the same booking", async () => {
    const adapter = await loadFreshLocalAdapter();
    const now = new Date();
    const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const booking = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Booked Customer",
      batDauAt: now.toISOString(),
      ketThucDuKien: end.toISOString(),
    });
    expect(booking.success).toBe(true);
    expect(booking.data?.maPhien).toBeTruthy();

    const checkin = await adapter.checkInRoom({
      maGiuong: "P101",
      maPhien: booking.data.maPhien,
      batDauAt: now.toISOString(),
      ketThucDuKien: end.toISOString(),
    });

    expect(checkin.success).toBe(true);
    expect(checkin.data?.maPhien).toBe(booking.data.maPhien);
  });

  it("allows adding planned service items to a future booking", async () => {
    const adapter = await loadFreshLocalAdapter();
    const now = new Date();
    const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const booking = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Future Customer",
      batDauAt: now.toISOString(),
      ketThucDuKien: end.toISOString(),
    });
    expect(booking.success).toBe(true);

    const addService = await adapter.addStayServiceItem({
      maPhien: booking.data?.maPhien,
      maSanPham: "SP0001",
      soLuong: 2,
      donGia: 120000,
    });
    expect(addService.success).toBe(true);
    expect(addService.data?.serviceItems?.length).toBeGreaterThan(0);
  });

  it("creates booking with initial service items atomically", async () => {
    const adapter = await loadFreshLocalAdapter();
    const now = new Date();
    const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const booking = await adapter.createBookingWithItems({
      maGiuong: "P101",
      tenKhach: "Atomic Booking",
      batDauAt: now.toISOString(),
      ketThucDuKien: end.toISOString(),
      serviceItems: [
        { maSanPham: "SP0001", soLuong: 1, donGia: 120000 },
        { maSanPham: "SP0002", soLuong: 2, donGia: 45000 },
      ],
    });

    expect(booking.success).toBe(true);
    expect(booking.data?.serviceItems?.length).toBe(2);
    expect(booking.data?.tongThanhToan).toBeGreaterThan(booking.data?.tienGoi || 0);
  });

  it("persists booking with service payload even when catalog code is unknown", async () => {
    const adapter = await loadFreshLocalAdapter();
    const now = new Date();
    const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const booking = await adapter.createBookingWithItems({
      maGiuong: "P101",
      tenKhach: "Broken Booking",
      batDauAt: now.toISOString(),
      ketThucDuKien: end.toISOString(),
      serviceItems: [{ maSanPham: "SP-INVALID", tenSanPham: "Custom Item", soLuong: 1, donGia: 120000 }],
    });
    expect(booking.success).toBe(true);
    expect(booking.data?.serviceItems?.length).toBe(1);
  });

  it("allows updating a future booking time without converting it to in-house", async () => {
    const adapter = await loadFreshLocalAdapter();
    const now = new Date();
    const start = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const end = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const movedEnd = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    const booking = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Future Customer",
      batDauAt: start.toISOString(),
      ketThucDuKien: end.toISOString(),
    });
    expect(booking.success).toBe(true);

    const updated = await adapter.updateStayTime({
      maPhien: booking.data?.maPhien,
      batDauAt: start.toISOString(),
      ketThucDuKien: movedEnd.toISOString(),
    });
    expect(updated.success).toBe(true);
    expect(updated.data?.trangThaiPhien).toBe("BOOKED");
    const updatedEndMs = new Date(updated.data?.ketThucDuKien).getTime();
    expect(Math.abs(updatedEndMs - movedEnd.getTime())).toBeLessThanOrEqual(1000);
  });

  it("blocks service line writes after checkout when adapter is called directly", async () => {
    const adapter = await loadFreshLocalAdapter();
    const now = new Date();
    const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const checkin = await adapter.checkInRoom({
      maGiuong: "P101",
      tenKhach: "Session Customer",
      batDauAt: now.toISOString(),
      ketThucDuKien: end.toISOString(),
    });
    expect(checkin.success).toBe(true);
    const maPhien = checkin.data?.maPhien;

    const addService = await adapter.addStayServiceItem({
      maPhien,
      maSanPham: "SP0001",
      soLuong: 1,
    });
    expect(addService.success).toBe(true);

    const complete = await adapter.checkoutRoom({
      maPhien,
      ketThucThucTe: end.toISOString(),
    });
    expect(complete.success).toBe(true);

    const addAfterCheckout = await adapter.addStayServiceItem({
      maPhien,
      maSanPham: "SP0001",
      soLuong: 1,
    });
    expect(addAfterCheckout.success).toBe(false);
    expect(addAfterCheckout.message).toContain("hoàn tất");
  });

  it("allows direct checkout of an overdue booked session to avoid blocking state-drift edge cases", async () => {
    const adapter = await loadFreshLocalAdapter();
    const now = new Date();
    const start = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const end = new Date(now.getTime() - 60 * 60 * 1000);

    const booking = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Booked Checkout Customer",
      batDauAt: start.toISOString(),
      ketThucDuKien: end.toISOString(),
    });
    expect(booking.success).toBe(true);

    const complete = await adapter.checkoutRoom({
      maPhien: booking.data?.maPhien,
      ketThucThucTe: end.toISOString(),
    });
    expect(complete.success).toBe(true);
    expect(complete.data?.trangThaiPhien).toBe("CHECKED_OUT");
  });

  it("allows direct checkout of a future booked session when the user explicitly ends it", async () => {
    const adapter = await loadFreshLocalAdapter();
    const start = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const end = new Date(start.getTime() + 60 * 60 * 1000);

    const booking = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Future Booked Checkout Customer",
      batDauAt: start.toISOString(),
      ketThucDuKien: end.toISOString(),
    });
    expect(booking.success).toBe(true);

    const complete = await adapter.checkoutRoom({
      maPhien: booking.data?.maPhien,
      ketThucThucTe: end.toISOString(),
    });
    expect(complete.success).toBe(true);
    expect(complete.data?.trangThaiPhien).toBe("CHECKED_OUT");
  });

  it("updates and deletes service items by stable serviceItemId", async () => {
    const adapter = await loadFreshLocalAdapter();
    const now = new Date();
    const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);

    const checkin = await adapter.checkInRoom({
      maGiuong: "P101",
      tenKhach: "Stable Id Customer",
      batDauAt: now.toISOString(),
      ketThucDuKien: end.toISOString(),
    });
    expect(checkin.success).toBe(true);

    const addService = await adapter.addStayServiceItem({
      maPhien: checkin.data?.maPhien,
      maSanPham: "SP0001",
      soLuong: 1,
      donGia: 120000,
    });
    expect(addService.success).toBe(true);

    const serviceItemId = addService.data?.serviceItems?.[0]?.serviceItemId;
    expect(serviceItemId).toBeTruthy();

    const updated = await adapter.updateStayServiceItem({
      maPhien: checkin.data?.maPhien,
      serviceItemId,
      soLuong: 2,
      donGia: 125000,
    });
    expect(updated.success).toBe(true);
    expect(updated.data?.serviceItems?.[0]?.soLuong).toBe(2);

    const removed = await adapter.deleteStayServiceItem({
      maPhien: checkin.data?.maPhien,
      serviceItemId,
    });
    expect(removed.success).toBe(true);
    expect(removed.data?.serviceItems?.length).toBe(0);
  });

  it("persists bed status updates even while an active session exists", async () => {
    const adapter = await loadFreshLocalAdapter();
    const now = new Date();
    const end = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const checkin = await adapter.checkInRoom({
      maGiuong: "P101",
      tenKhach: "Active Customer",
      batDauAt: now.toISOString(),
      ketThucDuKien: end.toISOString(),
    });
    expect(checkin.success).toBe(true);

    const updateStatus = await adapter.updateRoomStatus({
      maGiuong: "P101",
      trangThaiGiuong: "Sẵn sàng",
    });
    expect(updateStatus.success).toBe(true);
  });

  it("persists bed status to IN_HOUSE even when no active session exists", async () => {
    const adapter = await loadFreshLocalAdapter();
    const updateStatus = await adapter.updateRoomStatus({
      maGiuong: "P101",
      trangThaiGiuong: "Đang trị liệu",
    });
    expect(updateStatus.success).toBe(true);
  });

  it("allows setting bed to AVAILABLE even when there is only a future booking", async () => {
    const adapter = await loadFreshLocalAdapter();
    const end = new Date(Date.now() + 2 * 60 * 60 * 1000);

    const booking = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Future Booking",
      ketThucDuKien: end.toISOString(),
    });
    expect(booking.success).toBe(true);

    const updateStatus = await adapter.updateRoomStatus({
      maGiuong: "P101",
      trangThaiGiuong: "Sẵn sàng",
    });
    expect(updateStatus.success).toBe(true);
  });

  it("requires explicit booking selection when multiple bookings overlap check-in window", async () => {
    const adapter = await loadFreshLocalAdapter();
    const base = new Date();
    const b1Start = new Date(base.getTime() + 2 * 60 * 60 * 1000);
    const b1End = new Date(base.getTime() + 3 * 60 * 60 * 1000);
    const b2Start = new Date(base.getTime() + 4 * 60 * 60 * 1000);
    const b2End = new Date(base.getTime() + 5 * 60 * 60 * 1000);
    const ambiguousStart = new Date(base.getTime() + 2.5 * 60 * 60 * 1000);
    const ambiguousEnd = new Date(base.getTime() + 4.5 * 60 * 60 * 1000);

    const b1 = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Customer A",
      soDienThoai: "0901000001",
      batDauAt: b1Start.toISOString(),
      ketThucDuKien: b1End.toISOString(),
    });
    const b2 = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Customer B",
      soDienThoai: "0901000002",
      batDauAt: b2Start.toISOString(),
      ketThucDuKien: b2End.toISOString(),
    });
    expect(b1.success).toBe(true);
    expect(b2.success).toBe(true);

    const ambiguousCheckin = await adapter.checkInRoom({
      maGiuong: "P101",
      tenKhach: "Walk-in",
      batDauAt: ambiguousStart.toISOString(),
      ketThucDuKien: ambiguousEnd.toISOString(),
    });
    expect(ambiguousCheckin.success).toBe(true);
    expect(ambiguousCheckin.data?.maPhien).toBeTruthy();
    expect(ambiguousCheckin.data?.maPhien).not.toBe(b1.data.maPhien);
    expect(ambiguousCheckin.data?.maPhien).not.toBe(b2.data.maPhien);

    const exactCheckin = await adapter.checkInRoom({
      maGiuong: "P101",
      maPhien: b2.data.maPhien,
      batDauAt: b2Start.toISOString(),
      ketThucDuKien: b2End.toISOString(),
    });
    expect(exactCheckin.success).toBe(true);
    expect(exactCheckin.data?.maPhien).toBe(b2.data.maPhien);
  });

  it("persists overlapping bookings by the same staff across different beds", async () => {
    const adapter = await loadFreshLocalAdapter();
    const start = localDateAt(10, 30);
    const end = localDateAt(11, 30);

    const first = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Customer 1",
      maNhanVien: "NV000001",
      batDauAt: start,
      ketThucDuKien: end,
    });
    expect(first.success).toBe(true);

    const second = await adapter.createBooking({
      maGiuong: "P103",
      tenKhach: "Customer 2",
      maNhanVien: "NV000001",
      batDauAt: start,
      ketThucDuKien: end,
    });
    expect(second.success).toBe(true);
  });

  it("persists booking outside the selected staff default shift when adapter is called directly", async () => {
    const adapter = await loadFreshLocalAdapter();

    const booking = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Outside Shift Booking",
      maNhanVien: "NV000002",
      batDauAt: localDateAt(19),
      ketThucDuKien: localDateAt(20),
    });

    expect(booking.success).toBe(true);
  });

  it("allows booking after the staff schedule is updated to include the requested shift", async () => {
    const adapter = await loadFreshLocalAdapter();

    const updated = await adapter.updateSpaStaffSchedule({
      maNhanVien: "NV000002",
      caLamViec: "SANG,CHIEU,TOI",
    });
    expect(updated.success).toBe(true);

    const booking = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Updated Shift Booking",
      maNhanVien: "NV000002",
      batDauAt: localDateAt(19),
      ketThucDuKien: localDateAt(20),
    });

    expect(booking.success).toBe(true);
    const history = await adapter.getStayHistory({});
    const created = history.data.find((stay) => stay.tenKhach === "Updated Shift Booking");
    expect(created?.trangThaiPhien).toBe("BOOKED");
  });

  it("does not reuse treatment progress for single-session packages bought multiple times", async () => {
    const adapter = await loadFreshLocalAdapter();
    const firstStart = localDateAt(10, 30);
    const firstEnd = localDateAt(11, 30);
    const secondStart = localDateAt(14, 30);
    const secondEnd = localDateAt(15, 30);

    const first = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Repeat Single Package",
      soDienThoai: "0903555001",
      maGoi: "GOI-COVAI-499",
      batDauAt: firstStart,
      ketThucDuKien: firstEnd,
    });
    const second = await adapter.createBooking({
      maGiuong: "P103",
      tenKhach: "Repeat Single Package",
      soDienThoai: "0903555001",
      maGoi: "GOI-COVAI-499",
      batDauAt: secondStart,
      ketThucDuKien: secondEnd,
    });

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    const history = await adapter.getStayHistory({});
    const rows = history.data.filter((stay) => stay.tenKhach === "Repeat Single Package");
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((stay) => stay.maTienTrinh)).size).toBe(2);
    expect(rows.every((stay) => Number(stay.tongBuoiCombo) === 1 && Number(stay.buoiThu) === 1)).toBe(true);
  });

  it("keeps customer progress numeric and separate for repeat single-session packages", async () => {
    const adapter = await loadFreshLocalAdapter();
    const firstStart = localDateAt(10, 30);
    const firstEnd = localDateAt(11, 30);
    const secondStart = localDateAt(14, 30);
    const secondEnd = localDateAt(15, 30);

    await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Repeat Progress Single",
      soDienThoai: "0903555002",
      maGoi: "GOI-COVAI-499",
      batDauAt: firstStart,
      ketThucDuKien: firstEnd,
    });
    await adapter.createBooking({
      maGiuong: "P103",
      tenKhach: "Repeat Progress Single",
      soDienThoai: "0903555002",
      maGoi: "GOI-COVAI-499",
      batDauAt: secondStart,
      ketThucDuKien: secondEnd,
    });

    const progress = await adapter.getCustomerProgress();
    const rows = progress.data.filter((row) => row.tenKhach === "Repeat Progress Single");
    expect(rows).toHaveLength(2);
    expect(new Set(rows.map((row) => row.maTienTrinh)).size).toBe(2);
    expect(rows.every((row) => row.goiCombo === "Dưỡng sinh cổ vai gáy")).toBe(true);
    expect(rows.every((row) => Number(row.soBuoiCuaCombo) === 1)).toBe(true);
    expect(rows.every((row) => Number(row.buoiThu) === 1)).toBe(true);
    expect(rows.every((row) => Number(row.soBuoiConLai) === 0)).toBe(true);
  });

  it("respects forceNewProgress when customer still has an unfinished combo", async () => {
    const adapter = await loadFreshLocalAdapter();
    const first = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Combo Continue Or New",
      soDienThoai: "0903555010",
      maGoi: "GOI-THANG-COVAI-4B",
      batDauAt: localDateAt(10),
      ketThucDuKien: localDateAt(11, 30),
    });
    expect(first.success).toBe(true);
    const historyAfterFirst = await adapter.getStayHistory({});
    const firstRow = historyAfterFirst.data.find(
      (stay) =>
        stay.tenKhach === "Combo Continue Or New" &&
        stay.maGiuong === "P101",
    );
    expect(firstRow?.maTienTrinh).toBeTruthy();

    const continueOld = await adapter.createBooking({
      maGiuong: "P102",
      tenKhach: "Combo Continue Or New",
      soDienThoai: "0903555010",
      maGoi: "GOI-THANG-COVAI-4B",
      maTienTrinh: firstRow?.maTienTrinh,
      batDauAt: localDateAt(14),
      ketThucDuKien: localDateAt(15, 30),
    });
    expect(continueOld.success).toBe(true);
    const historyAfterContinue = await adapter.getStayHistory({});
    const continuedRow = historyAfterContinue.data.find(
      (stay) =>
        stay.tenKhach === "Combo Continue Or New" &&
        stay.maGiuong === "P102",
    );
    expect(continuedRow?.maTienTrinh).toBe(firstRow?.maTienTrinh);
    expect(Number(continuedRow?.buoiThu)).toBe(2);

    const openFresh = await adapter.createBooking({
      maGiuong: "P103",
      tenKhach: "Combo Continue Or New",
      soDienThoai: "0903555010",
      maGoi: "GOI-THANG-COVAI-4B",
      forceNewProgress: true,
      batDauAt: localDateAt(16),
      ketThucDuKien: localDateAt(17, 30),
    });
    expect(openFresh.success).toBe(true);
    const historyAfterNew = await adapter.getStayHistory({});
    const freshRow = historyAfterNew.data.find(
      (stay) =>
        stay.tenKhach === "Combo Continue Or New" &&
        stay.maGiuong === "P103",
    );
    expect(freshRow?.maTienTrinh).toBeTruthy();
    expect(freshRow?.maTienTrinh).not.toBe(firstRow?.maTienTrinh);
    expect(Number(freshRow?.buoiThu)).toBe(1);
  });

  it("allows early morning booking when staff is assigned to the morning shift", async () => {
    const adapter = await loadFreshLocalAdapter();
    const booking = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Early Morning Shift",
      maNhanVien: "NV000002",
      batDauAt: localDateAt(6, 29),
      ketThucDuKien: localDateAt(8, 0),
    });

    expect(booking.success).toBe(true);
  });

  it("persists immediate check-in outside the selected staff default shift when adapter is called directly", async () => {
    const adapter = await loadFreshLocalAdapter();

    const checkin = await adapter.checkInRoom({
      maGiuong: "P101",
      tenKhach: "Outside Shift Checkin",
      maNhanVien: "NV000002",
      batDauAt: localDateAt(19),
      ketThucDuKien: localDateAt(20),
    });

    expect(checkin.success).toBe(true);
  });

  it("allows a future booking on an in-use bed when the requested time does not overlap", async () => {
    const adapter = await loadFreshLocalAdapter();
    const now = new Date();
    const currentEnd = new Date(now.getTime() + 60 * 60 * 1000);
    const futureStart = new Date(now.getTime() + 3 * 60 * 60 * 1000);
    const futureEnd = new Date(now.getTime() + 4 * 60 * 60 * 1000);

    const active = await adapter.checkInRoom({
      maGiuong: "P101",
      tenKhach: "Active Customer",
      batDauAt: now.toISOString(),
      ketThucDuKien: currentEnd.toISOString(),
    });
    expect(active.success).toBe(true);

    const booking = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Future Customer",
      batDauAt: futureStart.toISOString(),
      ketThucDuKien: futureEnd.toISOString(),
    });
    expect(booking.success).toBe(true);
  });

  it("persists a booking that overlaps an active treatment session on the same bed", async () => {
    const adapter = await loadFreshLocalAdapter();
    const now = new Date();
    const activeEnd = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const overlapStart = new Date(now.getTime() + 60 * 60 * 1000);
    const overlapEnd = new Date(now.getTime() + 3 * 60 * 60 * 1000);

    const active = await adapter.checkInRoom({
      maGiuong: "P101",
      tenKhach: "Active Customer",
      batDauAt: now.toISOString(),
      ketThucDuKien: activeEnd.toISOString(),
    });
    expect(active.success).toBe(true);

    const booking = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Overlap Customer",
      batDauAt: overlapStart.toISOString(),
      ketThucDuKien: overlapEnd.toISOString(),
    });
    expect(booking.success).toBe(true);
  });

  it("deducts product inventory exactly once when the treatment session is checked out", async () => {
    const adapter = await loadFreshLocalAdapter();
    const beforeInventory = await adapter.getInventory();
    const beforeProduct = beforeInventory.data.find(
      (p) => p.tenSanPham === "Nước suối Aquafina 500ml",
    );
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);

    const checkin = await adapter.checkInRoom({
      maGiuong: "P101",
      tenKhach: "Retail Customer",
      batDauAt: now.toISOString(),
      ketThucDuKien: end.toISOString(),
    });
    expect(checkin.success).toBe(true);

    const addProduct = await adapter.addStayServiceItem({
      maPhien: checkin.data.maPhien,
      maSanPham: "SP0001",
      soLuong: 2,
    });
    expect(addProduct.success).toBe(true);

    const checkout = await adapter.checkoutRoom({
      maPhien: checkin.data.maPhien,
      ketThucThucTe: end.toISOString(),
    });
    expect(checkout.success).toBe(true);

    const afterInventory = await adapter.getInventory();
    const afterProduct = afterInventory.data.find(
      (p) => p.tenSanPham === "Nước suối Aquafina 500ml",
    );
    expect(afterProduct.tonKho).toBe(Number(beforeProduct.tonKho || 0) - 2);

    const secondCheckout = await adapter.checkoutRoom({
      maPhien: checkin.data.maPhien,
      ketThucThucTe: end.toISOString(),
    });
    expect(secondCheckout.success).toBe(true);

    const finalInventory = await adapter.getInventory();
    const finalProduct = finalInventory.data.find(
      (p) => p.tenSanPham === "Nước suối Aquafina 500ml",
    );
    expect(finalProduct.tonKho).toBe(afterProduct.tonKho);
  });

  it("does not deduct stock for service-only add-ons", async () => {
    const adapter = await loadFreshLocalAdapter();
    const created = await adapter.createProductCatalogItem({
      tenSanPham: "Massage cổ vai 30 phút",
      nhomHang: "Dịch vụ",
      donVi: "Buổi",
      donGiaBan: 180000,
      giaVon: 0,
      theoDoiTonKho: false,
    });
    expect(created.success).toBe(true);

    const catalog = await adapter.getProductCatalog();
    const service = catalog.data.find((p) => p.tenSanPham === "Massage cổ vai 30 phút");
    const beforeInventory = await adapter.getInventory();
    const beforeService = beforeInventory.data.find(
      (p) => p.tenSanPham === "Massage cổ vai 30 phút",
    );
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);

    const checkin = await adapter.checkInRoom({
      maGiuong: "P101",
      tenKhach: "Service Customer",
      batDauAt: now.toISOString(),
      ketThucDuKien: end.toISOString(),
    });
    expect(checkin.success).toBe(true);

    const addService = await adapter.addStayServiceItem({
      maPhien: checkin.data.maPhien,
      maSanPham: service.maSanPham,
      soLuong: 1,
    });
    expect(addService.success).toBe(true);

    const checkout = await adapter.checkoutRoom({
      maPhien: checkin.data.maPhien,
      ketThucThucTe: end.toISOString(),
    });
    expect(checkout.success).toBe(true);

    const afterInventory = await adapter.getInventory();
    const afterService = afterInventory.data.find(
      (p) => p.tenSanPham === "Massage cổ vai 30 phút",
    );
    expect(afterService.tonKho).toBe(beforeService.tonKho);
  });

  it("marks a booked appointment as no-show so its slot no longer blocks scheduling", async () => {
    const adapter = await loadFreshLocalAdapter();
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);

    const booking = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "No Show Customer",
      batDauAt: now.toISOString(),
      ketThucDuKien: end.toISOString(),
    });
    expect(booking.success).toBe(true);

    const noShow = await adapter.markTreatmentNoShow({
      maPhien: booking.data.maPhien,
    });
    expect(noShow.success).toBe(true);

    const replacement = await adapter.createBooking({
      maGiuong: "P101",
      tenKhach: "Replacement Customer",
      batDauAt: now.toISOString(),
      ketThucDuKien: end.toISOString(),
    });
    expect(replacement.success).toBe(true);
  });

  it("records staff attendance check-in and check-out for a day", async () => {
    const adapter = await loadFreshLocalAdapter();
    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const ngay = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;

    const staffRes = await adapter.getSpaStaff();
    const staff = staffRes.data[0];
    expect(staff?.maNhanVien).toBeTruthy();

    const checkIn = await adapter.recordSpaAttendance({
      action: "CHECK_IN",
      maNhanVien: staff.maNhanVien,
      ngay,
      caDuKien: "SANG",
    });
    expect(checkIn.success).toBe(true);
    expect(checkIn.data.trangThai).toBe("Đang làm");
    expect(checkIn.data.caDuKien).toBe("SANG");

    const checkInToi = await adapter.recordSpaAttendance({
      action: "CHECK_IN",
      maNhanVien: staff.maNhanVien,
      ngay,
      caDuKien: "TOI",
    });
    expect(checkInToi.success).toBe(true);

    const listed = await adapter.getSpaAttendance({ ngay, maNhanVien: staff.maNhanVien });
    expect(listed.data).toHaveLength(2);

    const checkOut = await adapter.recordSpaAttendance({
      action: "CHECK_OUT",
      maNhanVien: staff.maNhanVien,
      ngay,
      caDuKien: "SANG",
    });
    expect(checkOut.success).toBe(true);
    expect(checkOut.data.trangThai).toBe("Đã ra ca");
    expect(checkOut.data.checkOutAt).toBeTruthy();
  });

  it("marks staff absent without check-in times", async () => {
    const adapter = await loadFreshLocalAdapter();
    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const ngay = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const staffRes = await adapter.getSpaStaff();
    const staff = staffRes.data[1] || staffRes.data[0];

    const absent = await adapter.recordSpaAttendance({
      action: "MARK_ABSENT",
      maNhanVien: staff.maNhanVien,
      ngay,
      caDuKien: "CHIEU",
    });
    expect(absent.success).toBe(true);
    expect(absent.data.trangThai).toBe("Vắng");
    expect(absent.data.checkInAt).toBe("");

    const cleared = await adapter.recordSpaAttendance({
      action: "CLEAR_ABSENT",
      maNhanVien: staff.maNhanVien,
      ngay,
      caDuKien: "CHIEU",
    });
    expect(cleared.success).toBe(true);

    const afterClear = await adapter.getSpaAttendance({
      ngay,
      maNhanVien: staff.maNhanVien,
    });
    expect(afterClear.data).toHaveLength(0);
  });

  it("persists payroll fields when creating staff", async () => {
    const adapter = await loadFreshLocalAdapter();
    const created = await adapter.createSpaStaff({
      maNhanVien: "NV999901",
      tenNhanVien: "Payroll Create Staff",
      chucVu: "KTV",
      caLamViec: "SANG",
      luongCoBanThang: 8500000,
      tyLeThuongDichVu: 12,
    });
    expect(created.success).toBe(true);
    expect(created.data.luongCoBanThang).toBe(8500000);
    expect(created.data.tyLeThuongDichVu).toBe(12);

    const listed = await adapter.getSpaStaff();
    const saved = listed.data.find((row) => row.maNhanVien === "NV999901");
    expect(saved?.luongCoBanThang).toBe(8500000);
    expect(saved?.tyLeThuongDichVu).toBe(12);
  });

  it("rejects duplicate staff codes on create", async () => {
    const adapter = await loadFreshLocalAdapter();
    const staffRes = await adapter.getSpaStaff();
    const existing = staffRes.data[0];

    const duplicate = await adapter.createSpaStaff({
      maNhanVien: existing.maNhanVien,
      tenNhanVien: "Duplicate Staff",
      chucVu: "KTV",
      caLamViec: "SANG",
    });
    expect(duplicate.success).toBe(false);
    expect(duplicate.message).toContain("đã tồn tại");
  });

  it("blocks deleting staff with open sessions and keeps attendance history on soft delete", async () => {
    const adapter = await loadFreshLocalAdapter();
    const staffRes = await adapter.getSpaStaff();
    const staff = staffRes.data[0];
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    const ngay = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

    const checkin = await adapter.checkInRoom({
      maGiuong: "P101",
      tenKhach: "Staff Delete Guard",
      maNhanVien: staff.maNhanVien,
      batDauAt: now.toISOString(),
      ketThucDuKien: end.toISOString(),
    });
    expect(checkin.success).toBe(true);

    const blocked = await adapter.deleteSpaStaff({ maNhanVien: staff.maNhanVien });
    expect(blocked.success).toBe(false);
    expect(blocked.message).toContain("phiên mở");

    await adapter.checkoutRoom({
      maPhien: checkin.data.maPhien,
      ketThucThucTe: end.toISOString(),
    });

    await adapter.recordSpaAttendance({
      action: "MARK_ABSENT",
      maNhanVien: staff.maNhanVien,
      ngay,
      caDuKien: "SANG",
    });

    await adapter.saveSpaShiftChecklist({
      maNhanVien: staff.maNhanVien,
      ngay,
      caDuKien: "SANG",
      loaiChecklist: "DAU_CA",
      chucVu: staff.chucVu || "KTV",
      itemsJson: JSON.stringify([{ code: "CHUAN_BI_KHAN", checked: true, required: true }]),
    });

    const deleted = await adapter.deleteSpaStaff({ maNhanVien: staff.maNhanVien });
    expect(deleted.success).toBe(true);

    const attendance = await adapter.getSpaAttendance({ ngay, maNhanVien: staff.maNhanVien });
    expect(attendance.data.length).toBeGreaterThan(0);

    const checklists = await adapter.getSpaShiftChecklists({
      ngay,
      maNhanVien: staff.maNhanVien,
    });
    expect(checklists.data.length).toBeGreaterThan(0);
  });

  it("saves and lists shift checklists by staff/day/shift/type", async () => {
    const adapter = await loadFreshLocalAdapter();
    const staffRes = await adapter.getSpaStaff();
    const staff = staffRes.data.find((item) => item.chucVu === "KTV") || staffRes.data[0];
    const today = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const ngay = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
    const items = [
      { code: "CHUAN_BI_KHAN", label: "Khăn", checked: true, required: true },
      { code: "CHUAN_BI_TINH_DAU", label: "Tinh dầu", checked: true, required: true },
      { code: "KIEM_TRA_PHONG", label: "Phòng", checked: true, required: true },
      { code: "KIEM_TRA_MAY", label: "Máy", checked: true, required: true },
    ];

    const saved = await adapter.saveSpaShiftChecklist({
      maNhanVien: staff.maNhanVien,
      ngay,
      caDuKien: "SANG",
      loaiChecklist: "DAU_CA",
      chucVu: staff.chucVu || "KTV",
      itemsJson: JSON.stringify(items),
      ghiChu: "Sẵn sàng mở ca",
    });
    expect(saved.success).toBe(true);
    expect(saved.data.loaiChecklist).toBe("DAU_CA");

    const listed = await adapter.getSpaShiftChecklists({ ngay, maNhanVien: staff.maNhanVien });
    expect(listed.data).toHaveLength(1);
    expect(listed.data[0].ghiChu).toContain("Sẵn sàng");
  });

  it("moves the bed to available after checkout", async () => {
    const adapter = await loadFreshLocalAdapter();
    const now = new Date();
    const end = new Date(now.getTime() + 60 * 60 * 1000);

    const checkin = await adapter.checkInRoom({
      maGiuong: "P101",
      tenKhach: "Checkout Room Status",
      batDauAt: now.toISOString(),
      ketThucDuKien: end.toISOString(),
    });
    expect(checkin.success).toBe(true);

    const checkout = await adapter.checkoutRoom({
      maPhien: checkin.data.maPhien,
      ketThucThucTe: end.toISOString(),
    });
    expect(checkout.success).toBe(true);
    expect(checkout.message).toContain("Sẵn sàng");

    const rooms = await adapter.getRooms();
    const bed = rooms.data.find((room) => room.maGiuong === "P101");
    expect(bed?.trangThaiGiuong).toBe("Sẵn sàng");
  });
});

