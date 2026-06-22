import { describe, expect, it, vi } from "vitest";
import {
  buildOxuComCommand,
  buildOxuCompleteCommand,
  buildOxuSuccessCommand,
  formatOxuAmountDisplay,
  generateVietQrPayload,
  getVietQrGenerateUrl,
  normalizeVietQrText,
  resolveVietQrBankBin,
} from "../src/client/utils/vietqr";

describe("vietqr helpers", () => {
  it("resolves agribank BIN", () => {
    expect(resolveVietQrBankBin("agribank")).toBe("970405");
  });

  it("normalizes addInfo without diacritics", () => {
    expect(normalizeVietQrText("Thanh toán VP", 25)).toBe("THANH TOAN VP");
  });

  it("formats amount for OXU SET_TXT(2)", () => {
    expect(formatOxuAmountDisplay(1200000)).toBe("1.200.000");
  });

  it("builds OXU success command without QR payload", () => {
    const command = buildOxuSuccessCommand({
      title: "THANH TOAN THANH CONG",
      subtitle: "Phien PH000123",
      amountDisplay: "850.000",
    });
    expect(command).toBe(
      "JUMP(2);SET_TXT(0,THANH TOAN THANH CONG);SET_TXT(1,Phien PH000123);SET_TXT(2,850.000);",
    );
  });

  it("builds OXU complete command for popup Hoàn thành", () => {
    expect(buildOxuCompleteCommand()).toBe("JUMP(2);");
  });

  it("builds OXU COM command per QRVIEW doc", () => {
    const command = buildOxuComCommand({
      bankLabel: "AGRIBANK",
      accountDisplay: "STK: 112002951883",
      amountDisplay: "1.200.000",
      qrCode: "00020101021238560010A00000072763040D13",
      brightness: 20,
    });
    expect(command).toContain("JUMP(1);");
    expect(command).toContain("SET_TXT(0,AGRIBANK);");
    expect(command).toContain("SET_TXT(1,STK: 112002951883);");
    expect(command).toContain("SET_TXT(2,1.200.000);");
    expect(command).toContain("BL(20);");
    expect(command).toContain("QBAR(0,00020101021238560010A00000072763040D13);");
  });

  it("uses vietqr proxy in dev for generate URL", () => {
    const url = getVietQrGenerateUrl();
    expect(url.includes("/v2/generate")).toBe(true);
  });

  it("generateVietQrPayload returns qrCode from API", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        code: "00",
        desc: "Gen VietQR successful!",
        data: {
          qrCode:
            "00020101021238560010A0000007270126000697040501121120029518830208QRIBFTTA530370454061200005802VN62150811THANHTOAN6304ABCD",
          qrDataURL: "data:image/png;base64,abc",
        },
      }),
    }));

    const result = await generateVietQrPayload({
      bankCode: "agribank",
      accountNumber: "112002951883",
      accountName: "NGUYEN VAN A",
      amount: 1200000,
      addInfo: "THANHTOAN",
      clientId: "test-client",
      apiKey: "test-key",
      fetchImpl,
    });

    expect(result.ok).toBe(true);
    expect(result.qrCode).toContain("000201");
    expect(result.qrCode).toContain("6304");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [, options] = fetchImpl.mock.calls[0];
    expect(options.headers["x-client-id"]).toBe("test-client");
    expect(options.headers["x-api-key"]).toBe("test-key");
    const body = JSON.parse(options.body);
    expect(body.accountNo).toBe("112002951883");
    expect(body.acqId).toBe(970405);
    expect(body.amount).toBe("1200000");
    expect(body.format).toBe("text");
  });

  it("generateVietQrPayload validates missing credentials", async () => {
    vi.stubEnv("VITE_VIETQR_CLIENT_ID", "");
    vi.stubEnv("VITE_VIETQR_API_KEY", "");
    const fetchImpl = vi.fn();

    const result = await generateVietQrPayload({
      bankCode: "agribank",
      accountNumber: "123",
      clientId: "",
      apiKey: "",
      fetchImpl,
    });

    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/Client ID/i);
    expect(fetchImpl).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
