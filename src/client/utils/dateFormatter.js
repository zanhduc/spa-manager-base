/**
 * Tiện ích định dạng thời gian cục bộ (Local Timezone Formatting)
 * Theo Rule 17: Tuyệt đối không dùng toISOString() để gửi xuống Backend.
 */

/**
 * Convert yyyy-MM-dd → dd/MM/yyyy (cho UI gửi xuống BE)
 */
export function toVnDateFromIso(dateStr) {
  if (!dateStr) return "";
  const s = String(dateStr).trim();
  if (s.length !== 10) return s;
  return s.substring(8, 10) + "/" + s.substring(5, 7) + "/" + s.substring(0, 4);
}

/**
 * Convert dd/MM/yyyy → yyyy-MM-dd (cho BE trả về UI)
 */
export function toIsoFromVnDate(dateStr) {
  if (!dateStr) return "";
  const s = String(dateStr).trim();
  // Format: "04:26 16/06/2026" hoặc "16/06/2026"
  const match = s.match(/(\d{2})\/(\d{2})\/(\d{4})$/);
  if (match) {
    return match[3] + "-" + match[2] + "-" + match[1];
  }
  return s;
}

/**
 * Trả về chuỗi ngày theo định dạng VN dd/MM/yyyy
 */
export function toVnDateString(date) {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";

  const pad = (num) => String(num).padStart(2, '0');
  const DD = pad(d.getDate());
  const MM = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();

  return `${DD}/${MM}/${yyyy}`;
}

/**
 * Trả về chuỗi ngày giờ theo định dạng YYYY-MM-DD HH:mm:ss
 * @param {Date|number|string} date
 * @returns {string} Chuỗi định dạng YYYY-MM-DD HH:mm:ss hoặc rỗng nếu không hợp lệ
 */
export function toLocalDateTimeString(date) {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";

  const pad = (num) => String(num).padStart(2, '0');
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());
  const HH = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const ss = pad(d.getSeconds());

  return `${YYYY}-${MM}-${DD} ${HH}:${mm}:${ss}`;
}

/**
 * Trả về chuỗi ngày giờ theo định dạng VN "HH:mm DD/MM/yyyy"
 * @param {Date|number|string} date
 * @returns {string} Chuỗi định dạng "HH:mm DD/MM/yyyy" hoặc rỗng nếu không hợp lệ
 */
export function toVnDateTimeString(date) {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";

  const pad = (num) => String(num).padStart(2, '0');
  const HH = pad(d.getHours());
  const mm = pad(d.getMinutes());
  const DD = pad(d.getDate());
  const MM = pad(d.getMonth() + 1);
  const yyyy = d.getFullYear();

  return `${HH}:${mm} ${DD}/${MM}/${yyyy}`;
}

/**
 * Trả về chuỗi ngày theo định dạng YYYY-MM-DD
 * @param {Date|number|string} date
 * @returns {string} Chuỗi định dạng YYYY-MM-DD hoặc rỗng nếu không hợp lệ
 */
export function toLocalDateString(date) {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";

  const pad = (num) => String(num).padStart(2, '0');
  const YYYY = d.getFullYear();
  const MM = pad(d.getMonth() + 1);
  const DD = pad(d.getDate());

  return `${YYYY}-${MM}-${DD}`;
}

/**
 * Phân tích chuỗi thời gian (cả ISO lẫn Local String) thành Date object an toàn.
 * Xử lý được các chuỗi định dạng YYYY-MM-DD HH:mm:ss ở mọi trình duyệt (kể cả Safari).
 * Hỗ trợ VN datetime "HH:mm DD/MM/YYYY"
 * @param {string} str
 * @returns {Date|null}
 */
export function parseLocalString(str) {
  if (!str) return null;
  const raw = String(str).trim();
  if (!raw) return null;

  if (raw.includes("T") || raw.includes("Z")) {
    const d = new Date(raw);
    return isNaN(d.getTime()) ? null : d;
  }

  // VN datetime format: "HH:mm DD/MM/YYYY"
  const vnMatch = raw.match(/^(\d{1,2}):(\d{2})\s+(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (vnMatch) {
    const h = parseInt(vnMatch[1], 10);
    const m = parseInt(vnMatch[2], 10);
    const d = parseInt(vnMatch[3], 10);
    const mo = parseInt(vnMatch[4], 10) - 1;
    const y = parseInt(vnMatch[5], 10);
    const date = new Date(y, mo, d, h, m);
    return isNaN(date.getTime()) ? null : date;
  }

  const safariSafeStr = raw.replace(/-/g, '/');
  let d = new Date(safariSafeStr);

  if (isNaN(d.getTime())) {
    d = new Date(raw);
  }

  return isNaN(d.getTime()) ? null : d;
}
