/**
 * ImageUploader – Reusable image upload component with camera capture support.
 *
 * Supports:
 * - Camera capture via popup (bypasses iframe sandbox)
 * - File picker (gallery)
 * - Image preview, delete, and replace
 *
 * Usage:
 *   import ImageUploader from '../components/ImageUploader';
 *   <ImageUploader
 *     currentUrl={imageUrl}
 *     onUploaded={(url) => setImageUrl(url)}
 *     uploading={uploading}
 *     setUploading={setUploading}
 *   />
 */

import { useEffect, useRef, useState } from "react";
import toast from "react-hot-toast";
import { uploadImageToImgBB } from "../api";
import { openCameraPopup } from "./CameraPopup";

/* ── Resize ảnh trước khi upload ── */
function resizeImage(file, maxSize = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxSize || h > maxSize) {
          if (w > h) {
            h = Math.round((h * maxSize) / w);
            w = maxSize;
          } else {
            w = Math.round((w * maxSize) / h);
            h = maxSize;
          }
        }
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export default function ImageUploader({
  currentUrl,
  onUploaded,
  uploading,
  setUploading,
  cameraTitle = "Chụp ảnh sản phẩm",
}) {
  const [preview, setPreview] = useState(null);
  const popupRef = useRef(null);

  // Shared handler to process captured base64 image
  const processCapturedImage = async (base64) => {
    if (!base64 || uploading) return;
    setPreview(base64);
    setUploading(true);
    const toastId = toast.loading("Đang upload ảnh...");
    try {
      const res = await uploadImageToImgBB(base64);
      if (!res?.success) throw new Error(res?.message || "Upload thất bại");
      onUploaded(res.data.url);
      setPreview(null);
      toast.success("Upload ảnh thành công!", { id: toastId });
    } catch (err) {
      toast.error(err.message || "Upload ảnh thất bại", { id: toastId });
      setPreview(null);
    } finally {
      setUploading(false);
      // Cleanup localStorage
      try {
        localStorage.removeItem("__camera_capture__");
        localStorage.removeItem("__camera_capture_ts__");
      } catch (e) {}
    }
  };

  // Listen for camera data via multiple channels
  useEffect(() => {
    let lastTs = "";
    let pollTimer = null;

    // Channel 1: postMessage (works if same origin)
    const handleMessage = (e) => {
      if (e.data?.type === "CAMERA_CAPTURE" && e.data?.data) {
        processCapturedImage(e.data.data);
      }
    };

    // Channel 2: storage event (fires when OTHER tab writes localStorage)
    const handleStorage = (e) => {
      if (e.key === "__camera_capture_ts__" && e.newValue) {
        const data = localStorage.getItem("__camera_capture__");
        if (data) processCapturedImage(data);
      }
    };

    // Channel 3: polling (fallback for when storage event doesn't fire,
    // e.g. blob: URL same-origin issues on some browsers)
    const startPolling = () => {
      lastTs = localStorage.getItem("__camera_capture_ts__") || "";
      pollTimer = setInterval(() => {
        try {
          const ts = localStorage.getItem("__camera_capture_ts__") || "";
          if (ts && ts !== lastTs) {
            lastTs = ts;
            const data = localStorage.getItem("__camera_capture__");
            if (data) processCapturedImage(data);
          }
        } catch (e) {}
      }, 500);
    };

    window.addEventListener("message", handleMessage);
    window.addEventListener("storage", handleStorage);
    startPolling();

    return () => {
      window.removeEventListener("message", handleMessage);
      window.removeEventListener("storage", handleStorage);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [onUploaded, setUploading]);

  const handleOpenCamera = () => {
    if (uploading) return;
    try {
      popupRef.current = openCameraPopup({ title: cameraTitle });
      if (!popupRef.current) {
        toast.error(
          "Trình duyệt đã chặn popup. Vui lòng cho phép popup và thử lại.",
        );
      }
    } catch (err) {
      toast.error("Không thể mở camera: " + err.message);
    }
  };

  const handleFile = async (e) => {
    const target = e.target;
    const file = target.files?.[0];
    if (!file) {
      target.value = "";
      return;
    }
    if (!file.type.startsWith("image/")) {
      toast.error("Vui lòng chọn file ảnh");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error("Ảnh quá lớn (tối đa 10MB)");
      return;
    }

    setUploading(true);
    const toastId = toast.loading("Đang xử lý & upload ảnh...");
    try {
      const base64 = await resizeImage(file, 800, 0.7);
      setPreview(base64);

      const res = await uploadImageToImgBB(base64);
      if (!res?.success) {
        throw new Error(res?.message || "Upload thất bại");
      }
      onUploaded(res.data.url);
      setPreview(null);
      toast.success("Upload ảnh thành công!", { id: toastId });
    } catch (err) {
      toast.error(err.message || "Upload ảnh thất bại", { id: toastId });
      setPreview(null);
    } finally {
      setUploading(false);
      target.value = "";
    }
  };

  useEffect(() => {
    if (!uploading) {
      setPreview(null);
    }
  }, [currentUrl]);

  const displayUrl = preview || currentUrl;

  return (
    <div className="flex items-center gap-3">
      {displayUrl ? (
        <div className="relative group">
          <img
            src={displayUrl}
            alt="Ảnh sản phẩm"
            className="w-20 h-20 rounded-xl object-cover border border-slate-200 shadow-sm"
            onError={(e) => {
              e.target.style.display = "none";
            }}
          />
          <button
            type="button"
            onClick={() => {
              onUploaded("");
              setPreview(null);
            }}
            className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-rose-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity shadow"
            title="Xóa ảnh"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="w-20 h-20 rounded-xl border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            className="w-8 h-8"
          >
            <path
              d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0022.5 18.75V5.25A2.25 2.25 0 0020.25 3H3.75A2.25 2.25 0 001.5 5.25v13.5A2.25 2.25 0 003.75 21z"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      )}
      <div className="flex flex-col gap-2 justify-center">
        <button
          type="button"
          onClick={handleOpenCamera}
          disabled={uploading}
          className={`rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition-colors text-center shadow-sm ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        >
          {uploading ? "Đang xử lý..." : "📷 Chụp ảnh Camera"}
        </button>
        <label
          className={`cursor-pointer rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700 hover:bg-blue-100 transition-colors text-center shadow-sm ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        >
          {uploading ? "Đang xử lý..." : "🖼️ Chọn Từ Thư Viện"}
          <input
            type="file"
            accept="image/*"
            onChange={handleFile}
            disabled={uploading}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
}
