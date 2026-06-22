import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildCheckoutOxuCommand,
  buildCheckoutQrAddInfo,
  buildCheckoutQrPresentation,
  buildOxuPopupCheckoutPayload,
  formatCheckoutBankLabel,
  prepareCheckoutQrExperience,
  pushCheckoutQrToOxu,
  pushCheckoutSuccessToOxu,
  resolveCheckoutBankConfig,
  syncCheckoutQrToOxuPopup,
} from "../src/client/utils/checkoutQrOxu";
import { buildOxuCompleteCommand } from "../src/client/utils/vietqr";
import { VIETQR_CREDENTIALS_STORAGE, writeVietQrBankSettings } from "../src/client/utils/vietqr";

describe("checkoutQrOxu helpers", () => {
  beforeEach(() => {
    window.localStorage.removeItem(VIETQR_CREDENTIALS_STORAGE.bankCode);
    window.localStorage.removeItem(VIETQR_CREDENTIALS_STORAGE.accountNumber);
    window.localStorage.removeItem(VIETQR_CREDENTIALS_STORAGE.accountName);
    window.localStorage.removeItem("spa.checkout_qr_cache.v1");
  });

  it("formats OXU bank label as ASCII without Vietnamese diacritics", () => {
    expect(formatCheckoutBankLabel("mbbank (quân đội)")).toBe("MB BANK");
    expect(formatCheckoutBankLabel("mbbank")).toBe("MB BANK");
    expect(formatCheckoutBankLabel("agribank")).toBe("AGRIBANK");
  });

  it("prefers sheet BANK config over localStorage", async () => {
    const getBankConfig = vi.fn(async () => ({
      success: true,
      data: {
        bankCode: "agribank",
        accountNumber: "112002951883",
        accountName: "NGUYEN VAN A",
      },
    }));

    const config = await resolveCheckoutBankConfig(getBankConfig);
    expect(config.source).toBe("sheet");
    expect(config.bankCode).toBe("agribank");
    expect(config.accountNumber).toBe("112002951883");
  });

  it("uses saved BANK config from localStorage before hitting the sheet", async () => {
    writeVietQrBankSettings({
      bankCode: "mbbank",
      accountNumber: "201130122033",
      accountName: "SPA",
    });
    const getBankConfig = vi.fn(async () => ({
      success: true,
      data: {
        bankCode: "agribank",
        accountNumber: "112002951883",
      },
    }));

    const config = await resolveCheckoutBankConfig(getBankConfig);

    expect(getBankConfig).not.toHaveBeenCalled();
    expect(config.source).toBe("localStorage");
    expect(config.bankCode).toBe("mbbank");
    expect(config.accountNumber).toBe("201130122033");
  });

  it("force-refreshes BANK config from sheet and stores it locally", async () => {
    writeVietQrBankSettings({
      bankCode: "mbbank",
      accountNumber: "201130122033",
    });
    const getBankConfig = vi.fn(async () => ({
      success: true,
      data: {
        bankCode: "agribank",
        accountNumber: "112002951883",
        accountName: "NGUYEN VAN A",
      },
    }));

    const config = await resolveCheckoutBankConfig(getBankConfig, { forceRefresh: true });

    expect(getBankConfig).toHaveBeenCalledTimes(1);
    expect(config.source).toBe("sheet");
    expect(config.bankCode).toBe("agribank");
    expect(window.localStorage.getItem(VIETQR_CREDENTIALS_STORAGE.bankCode)).toBe("agribank");
  });

  it("builds addInfo from session code", () => {
    expect(buildCheckoutQrAddInfo({ maPhien: "LT000123" })).toBe("TT LT000123");
  });

  it("skips optimistic TEMP code and uses booking code", () => {
    expect(
      buildCheckoutQrAddInfo({
        maPhien: "TEMP-1730000000000",
        maLichHen: "BK00012",
      }),
    ).toBe("TT BK00012");
  });

  it("falls back to customer phone when session codes are temp", () => {
    expect(
      buildCheckoutQrAddInfo({
        maPhien: "TEMP-1730000000000",
        soDienThoai: "0912345678",
      }),
    ).toBe("TT 0912345678");
  });

  it("uses API qrDataURL when available", () => {
    const result = buildCheckoutQrPresentation({
      bankConfig: {
        bankCode: "agribank",
        accountNumber: "112002951883",
        accountName: "NGUYEN VAN A",
      },
      stay: { maPhien: "PH000123", tongThanhToan: 500000 },
      generateResult: {
        ok: true,
        qrCode: "000201010212",
        qrDataURL: "https://example.com/qr.png",
      },
    });

    expect(result.ok).toBe(true);
    expect(result.mode).toBe("api");
    expect(result.qrImageUrl).toBe("https://example.com/qr.png");
  });

  it("pushes COM command to OXU when serial is available", async () => {
    const originalSerial = globalThis.navigator?.serial;
    Object.defineProperty(globalThis.navigator, "serial", {
      configurable: true,
      value: {
        getPorts: async () => [{ readable: {}, writable: { getWriter: () => ({ write: async () => {}, releaseLock: () => {} }) } }],
      },
    });

    const sendImpl = vi.fn(async () => {});
    const result = await pushCheckoutQrToOxu({
      bankConfig: {
        bankCode: "agribank",
        accountNumber: "112002951883",
      },
      stay: { tongThanhToan: 1200000 },
      qrCode: "0002010102123856",
      sendImpl,
    });

    expect(result.ok).toBe(true);
    expect(sendImpl).toHaveBeenCalledTimes(1);
    expect(String(sendImpl.mock.calls[0][0])).toContain("QBAR(0,0002010102123856);");

    if (originalSerial === undefined) {
      delete globalThis.navigator.serial;
    } else {
      Object.defineProperty(globalThis.navigator, "serial", {
        configurable: true,
        value: originalSerial,
      });
    }
  });

  it("pushes success screen to OXU after checkout", async () => {
    const originalSerial = globalThis.navigator?.serial;
    Object.defineProperty(globalThis.navigator, "serial", {
      configurable: true,
      value: {
        getPorts: async () => [{ readable: {}, writable: { getWriter: () => ({ write: async () => {}, releaseLock: () => {} }) } }],
      },
    });

    const sendImpl = vi.fn(async () => {});
    const result = await pushCheckoutSuccessToOxu({
      stay: { maPhien: "PH000123", tongThanhToan: 850000, tenKhach: "Lan Nguyen" },
      sendImpl,
    });

    expect(result.ok).toBe(true);
    expect(sendImpl).toHaveBeenCalledTimes(1);
    const command = String(sendImpl.mock.calls[0][0]);
    expect(command).toContain("SET_TXT(0,THANH TOAN THANH CONG);");
    expect(command).toContain("SET_TXT(1,Phien PH000123);");
    expect(command).toContain("SET_TXT(2,850.000);");
    expect(command).toContain("JUMP(2)");
    expect(command).not.toContain("QBAR(");

    if (originalSerial === undefined) {
      delete globalThis.navigator.serial;
    } else {
      Object.defineProperty(globalThis.navigator, "serial", {
        configurable: true,
        value: originalSerial,
      });
    }
  });

  it("builds checkout OXU command with JUMP(1) for QR screen", () => {
    const command = buildCheckoutOxuCommand({
      bankConfig: { bankCode: "agribank", accountNumber: "112002951883" },
      stay: { tongThanhToan: 500000 },
      qrCode: "0002010102123856",
    });
    expect(command).toContain("JUMP(1)");
    expect(command).toContain("QBAR(0,0002010102123856)");
  });

  it("builds popup complete command with JUMP(2)", () => {
    expect(buildOxuCompleteCommand()).toBe("JUMP(2);");
  });

  it("builds popup checkout payload for QR-first UI", () => {
    const payload = buildOxuPopupCheckoutPayload({
      bankConfig: { bankCode: "mbbank", accountNumber: "201130122033" },
      stay: { tongThanhToan: 1200000 },
      presentation: {
        qrImageUrl: "https://example.com/qr.png",
        qrCode: "0002010102123856",
      },
    });
    expect(payload.qrImageUrl).toBe("https://example.com/qr.png");
    expect(payload.command).toContain("JUMP(1)");
    expect(payload.amountLabel).toContain("1.200.000");
    expect(payload.bankLabel).toBe("MB BANK");
  });

  it("syncCheckoutQrToOxuPopup posts QR payload to inline popup", async () => {
    const inlinePopup = {
      closed: false,
      postMessage: vi.fn(),
      document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
    };
    vi.spyOn(window, "open").mockReturnValue(inlinePopup);

    const result = await syncCheckoutQrToOxuPopup({
      bankConfig: { bankCode: "agribank", accountNumber: "112002951883" },
      stay: { tongThanhToan: 500000 },
      presentation: {
        qrImageUrl: "https://example.com/qr.png",
        qrCode: "0002010102123856",
      },
    });

    expect(result.ok).toBe(true);
    expect(inlinePopup.postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "OXU_SET_QR",
        command: expect.stringContaining("JUMP(1)"),
        qrImageUrl: "https://example.com/qr.png",
      }),
      expect.any(String),
    );
  });

  it("prepareCheckoutQrExperience orchestrates generate and OXU push", async () => {
    const getBankConfig = vi.fn(async () => ({
      success: true,
      data: {
        bankCode: "agribank",
        accountNumber: "112002951883",
        accountName: "NGUYEN VAN A",
      },
    }));
    const generateImpl = vi.fn(async () => ({
      ok: true,
      qrCode: "0002010102123856",
      qrDataURL: "https://example.com/qr.png",
    }));
    const pushOxuImpl = vi.fn(async () => ({ ok: true, command: "JUMP(1);" }));

    const result = await prepareCheckoutQrExperience({
      stay: { maPhien: "PH000123", tongThanhToan: 500000 },
      getBankConfigFn: getBankConfig,
      generateImpl,
      pushOxuImpl,
      autoPushOxu: false,
    });

    expect(result.ok).toBe(true);
    expect(generateImpl).toHaveBeenCalledTimes(1);
    expect(pushOxuImpl).not.toHaveBeenCalled();
    expect(result.presentation.qrImageUrl).toBe("https://example.com/qr.png");
  });

  it("reuses cached VietQR payload for the same checkout request", async () => {
    writeVietQrBankSettings({
      bankCode: "agribank",
      accountNumber: "112002951883",
      accountName: "NGUYEN VAN A",
    });
    const generateImpl = vi.fn(async () => ({
      ok: true,
      qrCode: "0002010102123856",
      qrDataURL: "https://example.com/qr.png",
    }));

    const first = await prepareCheckoutQrExperience({
      stay: { maPhien: "PH000123", tongThanhToan: 500000 },
      generateImpl,
      autoPushOxu: false,
    });
    const second = await prepareCheckoutQrExperience({
      stay: { maPhien: "PH000123", tongThanhToan: 500000 },
      generateImpl,
      autoPushOxu: false,
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    expect(generateImpl).toHaveBeenCalledTimes(1);
    expect(second.generateResult.cached).toBe(true);
  });
});
