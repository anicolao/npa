import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { addDoc } = vi.hoisted(() => ({ addDoc: vi.fn() }));
vi.mock("firebase/firestore", () => ({
  addDoc,
  collection: vi.fn(),
  doc: vi.fn(),
  increment: vi.fn(),
  setDoc: vi.fn(),
}));
vi.mock("../src/firestore", () => ({ firestore: {} }));
vi.mock("../src/intel", () => ({ getGameNumber: () => 8582 }));
vi.mock("../src/version", () => ({ getVersion: () => "test" }));
beforeEach(() => {
  vi.resetModules();
  addDoc.mockReset();
  vi.useFakeTimers();
  vi.setSystemTime(100000);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("error reporting backpressure", () => {
  it("allows one outstanding write and deduplicates repeated errors", async () => {
    const { logError } = await import("../src/logging");
    let finish: () => void;
    addDoc
      .mockImplementationOnce(
        () =>
          new Promise<void>((r) => {
            finish = r;
          }),
      )
      .mockResolvedValue(undefined);
    const error = { reason: new Error("database closed") };
    logError(error);
    logError(error);
    logError({ reason: new Error("another error") });
    expect(addDoc).toHaveBeenCalledOnce();
    finish?.();
    await vi.runAllTimersAsync();
    logError(error);
    expect(addDoc).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60000);
    logError(error);
    expect(addDoc).toHaveBeenCalledTimes(2);
  });

  it("backs off after a failed reporting request without an unhandled rejection", async () => {
    const { logError } = await import("../src/logging");
    addDoc
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(undefined);
    logError({ reason: new Error("first") });
    await vi.runAllTimersAsync();
    logError({ reason: new Error("second") });
    expect(addDoc).toHaveBeenCalledOnce();
    expect(console.warn).toHaveBeenCalledOnce();
    vi.advanceTimersByTime(60000);
    logError({ reason: new Error("third") });
    expect(addDoc).toHaveBeenCalledTimes(2);
  });
});
