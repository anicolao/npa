import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clone, diff, patch } from "../src/patch";
import { readCachedScan, seekScan } from "../src/scan-history";

const mocks = vi.hoisted(() => ({
  read: vi.fn(),
  put: vi.fn(),
  snapshot: vi.fn(),
  unsubscribe: vi.fn(),
}));
vi.mock("../src/intel", () => ({ getGameNumber: () => 8582 }));
vi.mock("../src/firestore", () => ({ firestore: {} }));
vi.mock("../src/idb", () => ({
  scanDatabase: () => ({
    run: (fn: any) => fn({ getAllFromIndex: mocks.read, put: mocks.put }),
  }),
}));
vi.mock("firebase/firestore", () => ({
  collection: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: mocks.snapshot,
}));

function scan(tick: number) {
  return { tick, playerUid: 1, stars: { 1: { st: tick } } };
}
function block(first: number, last: number) {
  const result: any = {
    initial_timestamp: first,
    last_timestamp: last,
    initial_scan: JSON.stringify({ scanning_data: scan(first) }),
    last_scan: JSON.stringify({ scanning_data: scan(last) }),
  };
  for (let tick = first; tick <= last; tick++)
    result[tick] = JSON.stringify({
      scanning_data: diff(tick === first ? {} : scan(tick - 1), scan(tick)),
    });
  return result;
}
function deliver(blocks: any[]) {
  const callback = mocks.snapshot.mock.calls.at(-1)?.[1];
  callback({
    docChanges: () =>
      blocks.map((b) => ({ type: "modified", doc: { data: () => b } })),
  });
}
function records(head: any) {
  const result = [];
  let state = {};
  for (let n = head.next; n; n = n.next) {
    state = patch(state, n.forward);
    result.push({ timestamp: n.timestamp, state: clone(state) });
  }
  return result;
}
beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.read.mockResolvedValue([]);
  mocks.put.mockResolvedValue(undefined);
  mocks.snapshot.mockReturnValue(mocks.unsubscribe);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("scan history recovery", () => {
  it("subscribes and receives scans when local history cannot be read", async () => {
    const m = await import("../src/timemachine");
    mocks.read.mockRejectedValue(new Error("storage unavailable"));
    await m.watchForBlocks("test");
    expect(mocks.snapshot).toHaveBeenCalledOnce();
    deliver([block(10, 12)]);
    await m.loadBlocks(8582, "test");
    expect(records(m.getCacheForKey("test")).at(-1)?.state).toEqual(scan(12));
    mocks.read.mockResolvedValue([block(10, 12)]);
    await m.loadBlocks(8582, "test");
    expect(m.scanInfo.test.lastTick).toBe(12);
  });

  it("isolates checkpoints from time-travel mutations and keeps forward/backward replay valid", async () => {
    const m = await import("../src/timemachine");
    mocks.read.mockResolvedValue([block(10, 12)]);
    await m.loadBlocks(8582, "test");
    const node = m.getCacheForKey("test").next;
    const mutableScan = readCachedScan(node);
    mutableScan.stars[1].st = 999;
    expect(node.check.stars[1].st).toBe(10);
    expect(console.warn).not.toHaveBeenCalled();
    expect(records(m.getCacheForKey("test")).map((r) => r.state)).toEqual([
      scan(10),
      scan(11),
      scan(12),
    ]);
    let tail = node;
    while (tail.next) tail = tail.next;
    let state = scan(12);
    while (tail.prev?.prev) {
      state = patch(state, tail.back) as any;
      tail = tail.prev;
      expect(state).toEqual(scan(tail.timestamp));
    }
  });

  it("repairs a bad checkpoint without deleting storage or repeatedly failing validation", async () => {
    const m = await import("../src/timemachine");
    const broken = block(10, 12);
    broken[12] = JSON.stringify({
      scanning_data: { tick: 12, stars: { 1: { st: 999 } } },
    });
    mocks.read.mockResolvedValue([broken]);
    await m.loadBlocks(8582, "test");
    expect(records(m.getCacheForKey("test")).at(-1)?.state).toEqual(scan(12));
    expect(console.warn).not.toHaveBeenCalled();
    await m.watchForBlocks("test");
    deliver([block(13, 14)]);
    await m.loadBlocks(8582, "test");
    expect(records(m.getCacheForKey("test")).at(-1)?.state).toEqual(scan(14));
  });

  it("keeps later history when an earlier block is updated and sorts numeric timestamps", async () => {
    const m = await import("../src/timemachine");
    mocks.read.mockResolvedValue([block(9, 10), block(11, 12)]);
    await m.watchForBlocks("test");
    deliver([block(9, 10)]);
    await m.loadBlocks(8582, "test");
    expect(records(m.getCacheForKey("test")).map((r) => r.timestamp)).toEqual([
      9, 10, 11, 12,
    ]);
    expect(records(m.getCacheForKey("test")).map((r) => r.state)).toEqual([
      scan(9),
      scan(10),
      scan(11),
      scan(12),
    ]);
  });

  it("serializes snapshots, continues after a failed write, and subscribes once", async () => {
    const m = await import("../src/timemachine");
    await Promise.all([m.watchForBlocks("test"), m.watchForBlocks("test")]);
    expect(mocks.snapshot).toHaveBeenCalledOnce();
    let finish: () => void;
    mocks.put
      .mockImplementationOnce(
        () =>
          new Promise<void>((r) => {
            finish = r;
          }),
      )
      .mockRejectedValueOnce(new Error("disk full"));
    deliver([block(10, 11)]);
    deliver([block(12, 13)]);
    await vi.waitFor(() => expect(mocks.put).toHaveBeenCalledTimes(1));
    expect(records(m.getCacheForKey("test")).map((r) => r.timestamp)).toEqual([
      10, 11,
    ]);
    finish?.();
    await m.loadBlocks(8582, "test");
    expect(records(m.getCacheForKey("test")).map((r) => r.timestamp)).toEqual([
      10, 11, 12, 13,
    ]);
    expect(console.error).toHaveBeenCalledWith(
      "Could not persist scan history",
      expect.any(Error),
    );
    m.unloadServerScans();
    await Promise.resolve();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });

  it("rejects malformed input without damaging existing history or poisoning the queue", async () => {
    const m = await import("../src/timemachine");
    mocks.read.mockResolvedValue([block(10, 11)]);
    await m.watchForBlocks("test");
    deliver([{ ...block(12, 13), initial_scan: "not json" }]);
    await m.loadBlocks(8582, "test");
    expect(records(m.getCacheForKey("test")).at(-1)?.state).toEqual(scan(11));
    deliver([block(12, 13)]);
    await m.loadBlocks(8582, "test");
    expect(records(m.getCacheForKey("test")).at(-1)?.state).toEqual(scan(13));
  });
  it("does not replay old history or rebuild identical snapshots on refresh", async () => {
    const m = await import("../src/timemachine");
    const old = block(10, 12);
    mocks.read.mockResolvedValue([old, block(13, 15)]);
    await m.watchForBlocks("test");
    const head = m.getCacheForKey("test");
    const revision = head.revision;
    const oldRecord = head.next;
    Object.defineProperty(oldRecord, "forward", {
      get() {
        throw new Error("old history replayed");
      },
    });
    deliver([old]);
    await m.loadBlocks(8582, "test");
    expect(head.revision).toBe(revision);
    deliver([block(16, 18)]);
    await m.loadBlocks(8582, "test");
    expect(head.next).toBe(oldRecord);
    expect(m.scanInfo.test.lastTick).toBe(18);
    expect((await m.getLastRecord(8582, "test")).check).toEqual(scan(18));
  });

  it("keeps forward/backward time travel correct across block boundaries and replacement", async () => {
    const m = await import("../src/timemachine");
    mocks.read.mockResolvedValue([block(10, 12), block(13, 15)]);
    await m.watchForBlocks("test");
    const head = m.getCacheForKey("test");
    let cursor: ReturnType<typeof seekScan>;
    for (let tick = 10; tick <= 15; tick++) {
      cursor = seekScan(head, tick, "forwards", cursor);
      expect(cursor?.scan).toEqual(scan(tick));
    }
    for (let tick = 15; tick >= 10; tick--) {
      cursor = seekScan(head, tick, "back", cursor);
      expect(cursor?.scan).toEqual(scan(tick));
    }
    const changed = block(10, 12);
    const corrected = { ...scan(10), stars: { 1: { st: 500 } } };
    changed.initial_scan = JSON.stringify({ scanning_data: corrected });
    changed[11] = JSON.stringify({ scanning_data: diff(corrected, scan(11)) });
    deliver([changed]);
    await m.loadBlocks(8582, "test");
    cursor = seekScan(head, 10, "forwards", cursor);
    expect(cursor?.scan).toEqual(corrected);
    expect(seekScan(head, 15, "forwards", cursor)?.scan).toEqual(scan(15));
    expect(seekScan(head, 10, "back")?.scan).toEqual(corrected);
  });
});
