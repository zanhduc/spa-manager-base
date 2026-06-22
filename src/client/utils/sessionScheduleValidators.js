import { formatTimeOnly } from "../pages/create-order.timeline.js";
import { parseLocalString } from "../utils/dateFormatter";

const SESSION_STATUS = {
  BOOKED: "BOOKED",
  IN_HOUSE: "IN_HOUSE",
};

const getStayStartAt = (stay) => stay?.batDauAt || "";
const getStayExpectedEndAt = (stay) => stay?.ketThucDuKien || "";
const getStayStatus = (stay) => String(stay?.trangThaiPhien || "").trim().toUpperCase();
const isStayPlannable = (stay) =>
  [SESSION_STATUS.BOOKED, SESSION_STATUS.IN_HOUSE].includes(getStayStatus(stay));
const getStayIdentityKey = (stay = {}) =>
  String(stay?.maPhien || stay?.maLichHen || "").trim();

const calculateDuration = (checkinIso, checkoutIso) => {
  const checkinDate = parseLocalString(checkinIso);
  const checkoutDate = parseLocalString(checkoutIso);
  const checkinMs = checkinDate?.getTime();
  const checkoutMs = checkoutDate?.getTime();
  if (!Number.isFinite(checkinMs) || !Number.isFinite(checkoutMs)) {
    return { isValid: false, error: "Thời gian không hợp lệ" };
  }
  if (checkoutMs <= checkinMs) {
    return { isValid: false, error: "Giờ kết thúc phải sau giờ bắt đầu" };
  }
  return { isValid: true, error: null };
};

const isScheduleOverlap = ({ startA, endA, startB, endB }) => {
  const startADate = parseLocalString(startA);
  const endADate = parseLocalString(endA);
  const startBDate = parseLocalString(startB);
  const endBDate = parseLocalString(endB);
  const startAMs = startADate?.getTime();
  const endAMs = endADate?.getTime();
  const startBMs = startBDate?.getTime();
  const endBMs = endBDate?.getTime();
  if (
    !Number.isFinite(startAMs) ||
    !Number.isFinite(endAMs) ||
    !Number.isFinite(startBMs) ||
    !Number.isFinite(endBMs)
  ) {
    return false;
  }
  return startAMs < endBMs && endAMs > startBMs;
};

/** Chặn trùng lịch giường / nhân viên — rule nghiệp vụ spa, chỉ validate ở FE. */
export function validateSessionScheduleConflicts(
  stays,
  { maGiuong, maNhanVien, batDauAt, ketThucDuKien, excludeStayKey = "" } = {},
) {
  const duration = calculateDuration(batDauAt, ketThucDuKien);
  if (!duration.isValid) {
    return { ok: false, message: duration.error || "Thời gian không hợp lệ" };
  }

  const excludeKey = String(excludeStayKey || "").trim();
  const roomCode = String(maGiuong || "").trim();
  if (roomCode) {
    const roomConflict = (Array.isArray(stays) ? stays : []).find((stay) => {
      if (!isStayPlannable(stay)) return false;
      if (String(stay.maGiuong || "").trim() !== roomCode) return false;
      if (excludeKey && getStayIdentityKey(stay) === excludeKey) return false;
      return isScheduleOverlap({
        startA: batDauAt,
        endA: ketThucDuKien,
        startB: getStayStartAt(stay),
        endB: getStayExpectedEndAt(stay),
      });
    });
    if (roomConflict) {
      return {
        ok: false,
        message: `Trùng lịch với ${roomConflict.tenKhach || roomConflict.maPhien || "lịch đã có"} (${formatTimeOnly(getStayStartAt(roomConflict))} - ${formatTimeOnly(getStayExpectedEndAt(roomConflict))}).`,
      };
    }
  }

  const staffCode = String(maNhanVien || "").trim();
  if (staffCode) {
    const staffConflict = (Array.isArray(stays) ? stays : []).find((stay) => {
      if (!isStayPlannable(stay)) return false;
      if (String(stay.maNhanVien || "").trim() !== staffCode) return false;
      if (excludeKey && getStayIdentityKey(stay) === excludeKey) return false;
      return isScheduleOverlap({
        startA: batDauAt,
        endA: ketThucDuKien,
        startB: getStayStartAt(stay),
        endB: getStayExpectedEndAt(stay),
      });
    });
    if (staffConflict) {
      return {
        ok: false,
        message: `Nhân viên trùng lịch với ${staffConflict.tenKhach || staffConflict.maPhien || "lịch đã có"} (${formatTimeOnly(getStayStartAt(staffConflict))} - ${formatTimeOnly(getStayExpectedEndAt(staffConflict))}) ở ${staffConflict.maGiuong || "giường khác"}.`,
      };
    }
  }

  return { ok: true };
}
