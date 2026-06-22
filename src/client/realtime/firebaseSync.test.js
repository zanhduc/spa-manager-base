import { buildSignalId, isSignalIdAfter } from "./firebaseSync";

describe("firebase realtime signal cursor", () => {
  it("builds signal ids with timestamp-first ordering", () => {
    expect(
      buildSignalId({
        nonce: "session-1",
        updatedAtMs: 1760000000000,
      }),
    ).toBe("1760000000000:session-1");
  });

  it("compares new timestamp-first signal ids correctly", () => {
    expect(
      isSignalIdAfter("1760000001000:session-b", "1760000000000:session-a"),
    ).toBe(true);
    expect(
      isSignalIdAfter("1760000000000:session-a", "1760000001000:session-b"),
    ).toBe(false);
  });

  it("still compares against legacy nonce-first persisted ids", () => {
    expect(
      isSignalIdAfter("1760000001000:session-b", "session-a:1760000000000"),
    ).toBe(true);
    expect(
      isSignalIdAfter("1760000000000:session-a", "session-b:1760000001000"),
    ).toBe(false);
  });
});
