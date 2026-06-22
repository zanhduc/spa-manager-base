/**
 * Graceful logout utility - thelper xử lý đăng xuất không reload trang.
 * Theo Rule 4: TUYỆT ĐỐI loại bỏ window.location.reload().
 *
 * Flow:
 * 1. Clear auth tokens from localStorage
 * 2. Dispatch auth:logout event để các component listen và cập nhật state
 * 3. Navigate to login page (hash-based routing)
 */
const AUTH_KEY = "soanhang.auth.user";
const AUTH_LOGOUT_EVENT = "auth:logout";

export function authLogout() {
  // 1. Clear auth tokens
  try {
    localStorage.removeItem(AUTH_KEY);
  } catch (_) {}

  // 2. Dispatch logout event để UI tự cập nhật
  window.dispatchEvent(new CustomEvent(AUTH_LOGOUT_EVENT));

  // 3. Navigate to login page (không reload)
  // App.jsx sẽ tự detect user=null và hiển thị LoginPage
  const currentHash = window.location.hash.replace(/^#\/?/, "");
  if (currentHash !== "login") {
    window.location.hash = "login";
  }
}

/**
 * Helper để component listen logout event và xử lý cleanup nếu cần.
 * @param {() => void} callback - Function được gọi khi auth:logout event fire
 * @returns {() => void} Unsubscribe function
 */
export function onAuthLogout(callback) {
  const handler = () => callback();
  window.addEventListener(AUTH_LOGOUT_EVENT, handler);
  return () => window.removeEventListener(AUTH_LOGOUT_EVENT, handler);
}
