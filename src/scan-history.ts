import { clone, diff, patch, reversePatch } from "./patch";

export interface CachedScan {
  check?: any;
  back?: any;
  forward?: any;
  next?: CachedScan;
  prev?: CachedScan;
  timestamp: number;
  // Only the list head carries a revision; cursors reset after a replacement.
  revision?: number;
}

export interface Block {
  initial_timestamp: number;
  last_timestamp: number;
  initial_scan: string;
  last_scan: string;
}

export function readCachedScan(record: CachedScan) {
  const pending: CachedScan[] = [];
  let anchor = record;
  while (anchor && !anchor.check) {
    pending.push(anchor);
    anchor = anchor.prev;
  }
  let state = clone(anchor?.check || {});
  for (let i = pending.length - 1; i >= 0; i--) {
    state = patch(state, pending[i].forward ?? null);
  }
  return state;
}

// Prepare only the changed block. There is no replay of earlier history and
// no diagnostic round-trip validation. Snapshots anchor both block boundaries.
export async function prepareScanBlock(block: Block): Promise<CachedScan[]> {
  const timestamps = Object.keys(block)
    .filter((key) => Number.isFinite(+key) && +key > 0)
    .map(Number)
    .sort((a, b) => a - b);
  if (
    timestamps[0] !== block.initial_timestamp ||
    timestamps[timestamps.length - 1] !== block.last_timestamp
  )
    throw new Error("Scan block timestamps do not match its checkpoints");
  const initial = JSON.parse(block.initial_scan).scanning_data;
  const last = JSON.parse(block.last_scan).scanning_data;
  if (!initial || !last) throw new Error("Scan block is missing checkpoints");

  const records: CachedScan[] = [];
  let state = clone(initial);
  let sliceStart = performance.now();
  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i];
    const record: CachedScan = { timestamp };
    if (i === 0) {
      record.check = timestamps.length === 1 ? last : initial;
      record.forward = clone(record.check);
    } else if (i === timestamps.length - 1) {
      // Trust the full endpoint, including when its stored delta is damaged.
      record.check = last;
      record.forward = diff(state, last);
      record.back = diff(last, state);
    } else {
      record.forward = JSON.parse(block[timestamp])?.scanning_data ?? null;
      record.back = reversePatch(state, record.forward);
      state = patch(state, record.forward);
    }
    if (i > 0) {
      record.prev = records[i - 1];
      record.prev.next = record;
    }
    records.push(record);
    if (performance.now() - sliceStart >= 8) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      sliceStart = performance.now();
    }
  }
  return records;
}

export interface ScanCursor {
  revision: number;
  record: CachedScan;
  scan: any;
}

export function seekScan(
  head: CachedScan,
  tick: number,
  direction: "back" | "forwards",
  previousCursor?: ScanCursor,
): ScanCursor | undefined {
  if (!head?.next) return undefined;
  let cursor = previousCursor;
  if (!cursor || cursor.revision !== head.revision) {
    let record = head.next;
    if (direction === "back") while (record.next) record = record.next;
    cursor = { revision: head.revision, record, scan: readCachedScan(record) };
  }
  while (cursor.scan.tick < tick && direction === "forwards") {
    const next = cursor.record.next;
    if (!next) return undefined;
    cursor.scan = patch(cursor.scan, next.forward);
    cursor.record = next;
  }
  while (cursor.scan.tick > tick && direction === "back") {
    const prev = cursor.record.prev;
    if (!prev?.prev) return undefined; // The sentinel has no scan.
    cursor.scan = patch(cursor.scan, cursor.record.back);
    cursor.record = prev;
  }
  return cursor;
}
