import toast from "react-hot-toast";
import { authLogout } from "./authLogout.js";

export async function runOptimisticMutation({
  optimisticUpdater,
  apiCall,
  rollback,
  onSuccess,
  errorMessage = "Thao tác thất bại.",
}) {
  try {
    if (typeof optimisticUpdater === "function") optimisticUpdater();
    const result = await apiCall();
    if (result?.success === false) {
      if (typeof rollback === "function") rollback();
      
      if (result?.code === "UNAUTHORIZED") {
        authLogout();
      }
      
      toast.error(result?.message || errorMessage);
      return { ok: false, result };
    }
    if (typeof onSuccess === "function") onSuccess(result);
    return { ok: true, result };
  } catch (_) {
    if (typeof rollback === "function") rollback();
    toast.error(errorMessage);
    return { ok: false, result: null };
  }
}
