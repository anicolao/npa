import { beforeEach, describe, expect, it, vi } from "vitest";
import { GameStore } from "../src/gamestore";
import { DatabaseConnection } from "../src/idb";

const { openDB } = vi.hoisted(() => ({ openDB: vi.fn() }));
vi.mock("idb", () => ({ openDB }));
const closing = () =>
  Object.assign(new Error("connection is closing"), {
    name: "InvalidStateError",
  });
const database = () => ({
  close: vi.fn(),
  get: vi.fn(),
  put: vi.fn(),
  getAllKeys: vi.fn(),
});

beforeEach(() => openDB.mockReset());

describe("database connection recovery", () => {
  it("reopens a closed GameStore connection and preserves the requested operation", async () => {
    const old = database();
    const fresh = database();
    old.get.mockRejectedValueOnce(closing());
    fresh.get.mockResolvedValue("saved value");
    openDB.mockResolvedValueOnce(old).mockResolvedValueOnce(fresh);
    const store = new GameStore("test-game");
    expect(await store.get("setting")).toBe("saved value");
    expect(fresh.get).toHaveBeenCalledWith("test-game", "setting");
    await store.set("setting", "new value");
    expect(fresh.put).toHaveBeenCalledWith("test-game", "new value", "setting");
    expect(openDB).toHaveBeenCalledTimes(2);
    expect(old.close).toHaveBeenCalledOnce();
  });

  it("shares the replacement connection between concurrent failures", async () => {
    const old = database();
    const fresh = database();
    old.get.mockRejectedValue(closing());
    fresh.get.mockResolvedValue(12);
    openDB.mockResolvedValueOnce(old).mockResolvedValueOnce(fresh);
    const db = new DatabaseConnection("history", vi.fn());
    expect(
      await Promise.all([
        db.run((d) => d.get("a", 1)),
        db.run((d) => d.get("a", 2)),
      ]),
    ).toEqual([12, 12]);
    expect(openDB).toHaveBeenCalledTimes(2);
  });

  it("closes a blocking connection and reopens after browser termination", async () => {
    const old = database();
    const fresh = database();
    const third = database();
    openDB
      .mockResolvedValueOnce(old)
      .mockResolvedValueOnce(fresh)
      .mockResolvedValueOnce(third);
    const db = new DatabaseConnection("history", vi.fn());
    await db.run((d) => d.get("a", 1));
    openDB.mock.calls[0][2].blocking();
    await db.run((d) => d.get("a", 1));
    expect(old.close).toHaveBeenCalled();
    openDB.mock.calls[1][2].terminated();
    await db.run((d) => d.get("a", 1));
    expect(openDB).toHaveBeenCalledTimes(3);
  });

  it("bounds retries and does not retry quota failures", async () => {
    const old = database();
    const fresh = database();
    old.put.mockRejectedValue(closing());
    fresh.put.mockRejectedValue(closing());
    openDB.mockResolvedValueOnce(old).mockResolvedValueOnce(fresh);
    const db = new DatabaseConnection("history", vi.fn());
    await expect(db.run((d) => d.put("a", 1))).rejects.toMatchObject({
      name: "InvalidStateError",
    });
    expect(openDB).toHaveBeenCalledTimes(2);
    openDB.mockReset();
    const quota = Object.assign(new Error("full"), {
      name: "QuotaExceededError",
    });
    old.put.mockRejectedValue(quota);
    openDB.mockResolvedValue(old);
    await expect(
      new DatabaseConnection("history", vi.fn()).run((d) => d.put("a", 1)),
    ).rejects.toBe(quota);
    expect(openDB).toHaveBeenCalledOnce();
  });

  it("can try again after opening the database fails", async () => {
    openDB
      .mockRejectedValueOnce(new Error("open failed"))
      .mockResolvedValueOnce(database());
    const db = new DatabaseConnection("history", vi.fn());
    await expect(db.run((d) => d.get("a", 1))).rejects.toThrow("open failed");
    await db.run((d) => d.get("a", 1));
    expect(openDB).toHaveBeenCalledTimes(2);
  });
});
