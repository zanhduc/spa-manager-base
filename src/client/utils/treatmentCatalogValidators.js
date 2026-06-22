const normalizeCode = (value) => String(value || "").trim().toUpperCase();

/** Validate payload danh mục trị liệu trước khi lưu. */
export function validateTreatmentCatalogPayload(payload = {}) {
  const sections = [
    { key: "phacDo", codeField: "maPhacDo", nameField: "tenPhacDo", label: "phác đồ" },
    { key: "dichVu", codeField: "maDv", nameField: "lop2DichVu", label: "dịch vụ" },
    { key: "goiDieuTri", codeField: "maGoi", nameField: "tenGoi", label: "gói trị liệu" },
  ];

  for (const section of sections) {
    const seen = new Set();
    for (const item of payload[section.key] || []) {
      const code = normalizeCode(item?.[section.codeField]);
      const name = String(item?.[section.nameField] || "").trim();
      if (!code) return `Thiếu mã ${section.label}.`;
      if (!name) return `Thiếu tên ${section.label}.`;
      if (seen.has(code)) return `Trùng mã ${section.label}: ${code}.`;
      seen.add(code);
    }
  }
  return "";
}
