import { describe, expect, it } from "vitest";
import {
  OXU_COMPLETE_COMMAND,
  buildOxuSerialPopupHTML,
} from "../src/client/utils/OxuSerialPopup.js";

describe("OxuSerialPopup QR-first UI", () => {
  it("renders QR-first layout with push and complete actions", () => {
    const html = buildOxuSerialPopupHTML();
    expect(html).toContain("QR thanh toán OXU");
    expect(html).toContain('id="qrImg"');
    expect(html).toContain("Gửi lên màn hình");
    expect(html).toContain("Hoàn thành");
    expect(html).toContain("OXU_SET_QR");
    expect(html).toContain("Chọn cổng COM");
  });

  it("uses JUMP(2) for complete action", () => {
    expect(OXU_COMPLETE_COMMAND).toBe("JUMP(2);");
    const html = buildOxuSerialPopupHTML();
    expect(html).toContain("JUMP(2)");
  });
});
