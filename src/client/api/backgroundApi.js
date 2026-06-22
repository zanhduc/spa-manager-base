import { logAction } from "./index.js";
import { authLogout } from "../utils/authLogout.js";
/**
 * Run a write API call in the background with optimistic UI.
 *
 * Flow:
 * 1. Show success toast immediately
 * 2. Run API call in background (non-blocking)
 * 3. Log result (SUCCESS/ERROR) to "Log" sheet — NO rollback, NO error toast
 *
 * @param {Object} options
 * @param {() => Promise} options.apiCall        - The API function to call
 * @param {string}        options.successMessage  - Toast message shown immediately
 * @param {string}        options.changeDescription - Description for Log sheet col C
 * @param {string}        options.userName        - User name for Log sheet col B
 * @param {(result) => void} [options.onComplete] - Optional callback after API finishes
 */
let isRunning = false;
const backgroundQueue = [];

async function processQueue() {
  if (isRunning || backgroundQueue.length === 0) return;
  isRunning = true;

  while (backgroundQueue.length > 0) {
    const task = backgroundQueue.shift();
    try {
      const result = await task.apiCall();
      const isSuccess = result?.success !== false;
      
      if (result?.code === "UNAUTHORIZED") {
        authLogout();
      }
      
      logAction({
        userName: task.userName || "unknown",
        changeDescription: task.changeDescription || "",
        status: isSuccess ? "SUCCESS" : "ERROR",
        errorMessage: isSuccess ? "" : (result?.message || "API trả về lỗi"),
      }).catch(() => {});

      if (task.onComplete) task.onComplete(result);
    } catch (err) {
      logAction({
        userName: task.userName || "unknown",
        changeDescription: task.changeDescription || "",
        status: "ERROR",
        errorMessage: err?.message || String(err) || "Lỗi không xác định",
      }).catch(() => {});

      if (task.onComplete) task.onComplete({ success: false, message: err?.message });
    }

    // Debounce / Throttling delay to prevent GAS Rate Limit (Rule 16)
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  isRunning = false;
}

export function runInBackground({
  apiCall,
  successMessage,
  changeDescription,
  userName,
  onComplete,
}) {
  backgroundQueue.push({ apiCall, changeDescription, userName, onComplete });
  processQueue();
}

