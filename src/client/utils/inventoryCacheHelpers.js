import { normalizeText as foldText } from "../../core/core.js";

/** Gắn ảnh sản phẩm từ catalog vào danh sách gợi ý nhập kho. */
export function enrichInventorySuggestions(catalog = [], suggestions = []) {
  if (!Array.isArray(suggestions)) return [];
  const catalogRows = Array.isArray(catalog) ? catalog : [];
  return suggestions.map((item) => {
    const match = catalogRows.find(
      (row) => foldText(row.tenSanPham) === foldText(item.tenSanPham),
    );
    return { ...item, anhSanPham: match ? match.anhSanPham : "" };
  });
}
