import { describe, expect, it } from "vitest";

const productRowKey = (tenSanPham, donVi) =>
  `${String(tenSanPham || "").trim().toLowerCase()}::${String(donVi || "").trim().toLowerCase()}`;

const toViewRowId = (p, idx) => {
  const tenSanPham = String(p.tenSanPham || "");
  const donVi = String(p.donVi || "");
  const stableKey = productRowKey(tenSanPham, donVi);
  return stableKey ? `sp-${stableKey}` : `sp-idx-${idx}`;
};

describe("products stable row id", () => {
  it("keeps the same id for the same product identity", () => {
    const product = { tenSanPham: "Serum A", donVi: "Chai" };
    expect(toViewRowId(product, 0)).toBe(toViewRowId(product, 99));
  });

  it("changes id when product name or unit changes", () => {
    const a = toViewRowId({ tenSanPham: "Serum A", donVi: "Chai" }, 0);
    const b = toViewRowId({ tenSanPham: "Serum B", donVi: "Chai" }, 0);
    expect(a).not.toBe(b);
  });
});
