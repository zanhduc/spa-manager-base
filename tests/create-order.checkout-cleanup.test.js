import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const createOrderSource = readFileSync(
  resolve(process.cwd(), "src/client/pages/create-order.jsx"),
  "utf8",
);

describe("create-order checkout cleanup", () => {
  it("does not call pushCheckoutSuccessToOxu from checkout flow", () => {
    expect(createOrderSource).not.toContain("pushCheckoutSuccessToOxu");
  });

  it("does not auto-open print page after checkout", () => {
    expect(createOrderSource).not.toMatch(/window\.open\([^)]*print/i);
    expect(createOrderSource).not.toContain("In biên nhận");
  });

  it("keeps optimistic checkout bed release to Sẵn sàng", () => {
    const checkoutBlock = createOrderSource.slice(
      createOrderSource.indexOf("const handleCheckout"),
      createOrderSource.indexOf("const handleStatusChange"),
    );
    expect(checkoutBlock).toContain("patchRoomStatusInState(roomCode, ROOM_STATUS.AVAILABLE)");
    expect(checkoutBlock).not.toContain("ROOM_STATUS.CLEANING");
  });
});
