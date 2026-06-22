import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { buildOxuComCommand } from "../src/client/utils/vietqr";
import {
  isOxuComGrantedLocally,
  isWebSerialSupported,
  markOxuComGranted,
  mustUseOxuHostBridge,
  OXU_BAUD_RATE,
  sendOxuComCommand,
  splitOxuComCommands,
} from "../src/client/utils/oxuSerial";
describe("oxu COM helpers", () => {
  it("documents baud rate 115200", () => {
    expect(OXU_BAUD_RATE).toBe(115200);
  });

  it("detects Web Serial support in jsdom", () => {
    expect(isWebSerialSupported()).toBe(false);
  });

  it("builds doc example QBAR link command", () => {
    expect(buildOxuComCommand({ qrCode: "oxu.vn", jumpToQrScreen: true })).toBe(
      "JUMP(1);QBAR(0,oxu.vn);",
    );
  });

  it("tracks granted COM port in localStorage", () => {
    markOxuComGranted(false);
    expect(isOxuComGrantedLocally()).toBe(false);
    markOxuComGranted(true);
    expect(isOxuComGrantedLocally()).toBe(true);
    markOxuComGranted(false);
    expect(isOxuComGrantedLocally()).toBe(false);
  });

  it("splits combined COM string into individual commands", () => {
    const command = buildOxuComCommand({
      bankLabel: "MB",
      accountDisplay: "STK: 201130122033",
      amountDisplay: "499.000",
      qrCode: "0002010102123856",
      jumpToQrScreen: true,
    });
    expect(splitOxuComCommands(command)).toEqual([
      "JUMP(1)",
      "SET_TXT(0,MB)",
      "SET_TXT(1,STK: 201130122033)",
      "SET_TXT(2,499.000)",
      "QBAR(0,0002010102123856)",
    ]);
  });

  describe("bridge send routing", () => {
    let originalSerial;
    let parentPostMessage;

    beforeEach(() => {
      markOxuComGranted(false);
      parentPostMessage = vi.fn((payload) => {
        if (payload?.type === "OXU_RELAY" && payload?.payload?.type === "OXU_PING") {
          queueMicrotask(() => {
            window.dispatchEvent(
              new MessageEvent("message", {
                data: {
                  type: "OXU_PONG",
                  ready: true,
                  requestId: payload.payload.requestId,
                },
              }),
            );
          });
        }
        if (payload?.type === "OXU_RELAY" && payload?.payload?.type === "OXU_SEND") {
          queueMicrotask(() => {
            window.dispatchEvent(
              new MessageEvent("message", {
                data: {
                  type: "OXU_SEND_RESULT",
                  ok: true,
                  requestId: payload.payload.requestId,
                },
              }),
            );
          });
        }
        if (
          payload?.type === "OXU_RELAY" &&
          payload?.payload?.type === "OXU_POPUP_SEND" &&
          payload?.payload?.inner?.type === "OXU_SEND"
        ) {
          queueMicrotask(() => {
            window.dispatchEvent(
              new MessageEvent("message", {
                data: {
                  type: "OXU_SEND_RESULT",
                  ok: true,
                  requestId: payload.payload.inner.requestId,
                },
              }),
            );
          });
        }
      });

      originalSerial = globalThis.navigator?.serial;
      Object.defineProperty(globalThis.navigator, "serial", {
        configurable: true,
        value: {
          getPorts: async () => {
            throw new Error('Failed to execute "getPorts" on "Serial": permissions policy');
          },
        },
      });

      Object.defineProperty(window, "parent", {
        configurable: true,
        value: { postMessage: parentPostMessage },
      });
      Object.defineProperty(window, "top", {
        configurable: true,
        value: {
          postMessage: parentPostMessage,
          location: { href: "https://dulia.io.vn/host.html" },
        },
      });
      Object.defineProperty(window, "location", {
        configurable: true,
        value: {
          hostname: "script.google.com",
          origin: "https://script.google.com",
          href: "https://script.google.com/macros/s/test/exec",
        },
      });
    });

    afterEach(() => {
      markOxuComGranted(false);
      vi.restoreAllMocks();
      if (originalSerial === undefined) {
        delete globalThis.navigator.serial;
      } else {
        Object.defineProperty(globalThis.navigator, "serial", {
          configurable: true,
          value: originalSerial,
        });
      }
    });

    it("skips direct serial probe on GAS host bridge mode", () => {
      expect(mustUseOxuHostBridge()).toBe(true);
    });

    it("sends QR straight to the inline OXU popup when COM was granted before", async () => {
      markOxuComGranted(true);
      const inlinePopup = {
        closed: false,
        postMessage: vi.fn((payload, origin) => {
          if (payload?.type === "OXU_SEND") {
            queueMicrotask(() => {
              window.dispatchEvent(
                new MessageEvent("message", {
                  origin,
                  source: inlinePopup,
                  data: {
                    type: "OXU_SEND_RESULT",
                    ok: true,
                    requestId: payload.requestId,
                  },
                }),
              );
            });
          }
        }),
        document: {
          open: vi.fn(),
          write: vi.fn(),
          close: vi.fn(),
        },
      };
      vi.spyOn(window, "open").mockReturnValue(inlinePopup);

      await sendOxuComCommand("JUMP(1);QBAR(0,test);");

      const pingRelay = parentPostMessage.mock.calls.find(
        ([msg]) => msg?.type === "OXU_RELAY" && msg?.payload?.type === "OXU_PING",
      );
      const popupSendRelay = parentPostMessage.mock.calls.find(
        ([msg]) => msg?.type === "OXU_RELAY" && msg?.payload?.type === "OXU_POPUP_SEND",
      );
      expect(pingRelay).toBeFalsy();
      expect(popupSendRelay).toBeFalsy();
      expect(inlinePopup.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "OXU_SEND", command: "JUMP(1);QBAR(0,test);" }),
        "https://script.google.com",
      );
    });

    it("ignores spoofed OXU popup messages from the wrong origin", async () => {
      vi.resetModules();
      const mod = await import("../src/client/utils/oxuSerial");
      mod.markOxuComGranted(true);
      const inlinePopup = {
        closed: false,
        postMessage: vi.fn((payload, origin) => {
          if (payload?.type === "OXU_SEND") {
            queueMicrotask(() => {
              window.dispatchEvent(
                new MessageEvent("message", {
                  origin: "https://evil.example",
                  source: inlinePopup,
                  data: {
                    type: "OXU_SEND_RESULT",
                    ok: true,
                    requestId: payload.requestId,
                  },
                }),
              );
              window.dispatchEvent(
                new MessageEvent("message", {
                  origin,
                  source: inlinePopup,
                  data: {
                    type: "OXU_SEND_RESULT",
                    ok: true,
                    requestId: payload.requestId,
                  },
                }),
              );
            });
          }
        }),
        document: {
          open: vi.fn(),
          write: vi.fn(),
          close: vi.fn(),
        },
      };
      vi.spyOn(window, "open").mockReturnValue(inlinePopup);

      await expect(mod.sendOxuComCommand("JUMP(1);QBAR(0,test);")).resolves.toBeUndefined();
      expect(inlinePopup.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: "OXU_SEND", command: "JUMP(1);QBAR(0,test);" }),
        "https://script.google.com",
      );
    });

    it("walks nested iframe ancestors when relaying OXU messages", async () => {
      const relayCalls = [];
      const grandParentPostMessage = vi.fn((payload, origin) => {
        relayCalls.push({ target: "grandParent", origin, payload });
      });
      const directParentPostMessage = vi.fn((payload, origin) => {
        relayCalls.push({ target: "parent", origin, payload });
      });

      Object.defineProperty(window, "parent", {
        configurable: true,
        value: {
          postMessage: directParentPostMessage,
          parent: { postMessage: grandParentPostMessage },
        },
      });
      Object.defineProperty(window, "top", {
        configurable: true,
        value: {
          postMessage: grandParentPostMessage,
          location: { href: "https://dulia.io.vn/host.html" },
        },
      });

      markOxuComGranted(true);
      vi.spyOn(window, "open").mockReturnValue({
        closed: false,
        postMessage: vi.fn((payload) => {
          if (payload?.type === "OXU_SEND") {
            queueMicrotask(() => {
              window.dispatchEvent(
                new MessageEvent("message", {
                  data: {
                    type: "OXU_SEND_RESULT",
                    ok: true,
                    requestId: payload.requestId,
                  },
                }),
              );
            });
          }
        }),
        document: {
          open: vi.fn(),
          write: vi.fn(),
          close: vi.fn(),
        },
      });
      await sendOxuComCommand("JUMP(1);QBAR(0,test);");

      expect(directParentPostMessage).not.toHaveBeenCalled();
      expect(relayCalls).toHaveLength(0);
    });

    it("relays OXU host-bridge messages without wildcard targetOrigin when parent origin is known", async () => {
      vi.resetModules();
      const relaySpy = vi.fn((payload, origin) => {
        if (payload?.type === "OXU_RELAY" && payload?.payload?.type === "OXU_PING") {
          queueMicrotask(() => {
            window.dispatchEvent(
              new MessageEvent("message", {
                origin: "https://dulia.io.vn",
                data: {
                  type: "OXU_PONG",
                  ready: true,
                  requestId: payload.payload.requestId,
                },
              }),
            );
          });
        }
      });

      Object.defineProperty(window, "parent", {
        configurable: true,
        value: {
          postMessage: relaySpy,
          location: { href: "https://dulia.io.vn/host.html" },
        },
      });
      Object.defineProperty(window, "top", {
        configurable: true,
        value: {
          postMessage: relaySpy,
          location: { href: "https://dulia.io.vn/host.html" },
        },
      });

      const mod = await import("../src/client/utils/oxuSerial");
      expect(await mod.connectOxuSerialPort()).toEqual({ bridge: true });
      expect(relaySpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: "OXU_RELAY" }),
        "https://dulia.io.vn",
      );
      expect(relaySpy.mock.calls.some(([, origin]) => origin === "*")).toBe(false);
    });
  });

  describe("production iframe host relay contract", () => {
    const iframeGasRoot = path.resolve(__dirname, "../..", "iframe-gas");

    it("allows Apps Script sandbox subdomains to relay OXU messages", () => {
      const hostHtml = fs.readFileSync(path.join(iframeGasRoot, "host.html"), "utf8");

      expect(hostHtml).toContain("isGoogleAppsScriptOrigin");
      expect(hostHtml).toContain('.endsWith(".googleusercontent.com")');
    });

    it("accepts nested Apps Script OXU relay messages", () => {
      const indexHtml = fs.readFileSync(path.join(iframeGasRoot, "index.html"), "utf8");

      expect(indexHtml).toContain("lastFrameMessageOrigin");
      expect(indexHtml).toContain("isGoogleAppsScriptOrigin");
      expect(indexHtml).toContain('msg.type !== "OXU_RELAY"');
      expect(indexHtml).toContain("Không forward OXU");
      expect(indexHtml).not.toContain('postMessage(hostMsg, "*")');
    });

    it("does not let the hidden OXU embed grab the serial port on load", () => {
      const bridgeHtml = fs.readFileSync(path.join(iframeGasRoot, "oxu-serial.html"), "utf8");

      expect(bridgeHtml).toContain("if (isEmbed)");
      expect(bridgeHtml).toContain("notifyNeedGesture(NEED_GESTURE_MSG);");
      expect(bridgeHtml).toContain("formatOpenPortError");
    });

    it("retries popup delivery so QR commands are not lost while the bridge loads", () => {
      const hostHtml = fs.readFileSync(path.join(iframeGasRoot, "host.html"), "utf8");

      expect(hostHtml).toContain("postToOxuPopupWithRetry");
      expect(hostHtml).toContain("payload.type === \"OXU_POPUP_SEND\"");
    });

    it("does not render the old OXU gesture bar or forward OXU replies into GAS", () => {
      const hostHtml = fs.readFileSync(path.join(iframeGasRoot, "host.html"), "utf8");

      expect(hostHtml).not.toContain("oxu-gesture-bar");
      expect(hostHtml).not.toContain("OXU_SHOW_GESTURE_BAR");
      expect(hostHtml).not.toContain("forwardOxuPayloadToApp(popupMsg)");
      expect(hostHtml).not.toContain("forwardOxuPayloadToApp(bridgeMsg)");
    });
  });
});
