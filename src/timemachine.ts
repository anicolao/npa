import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { firestore } from "./firestore";
import { scanDatabase } from "./idb";
import { getGameNumber } from "./intel";
import { diff } from "./patch";
import {
  type Block,
  type CachedScan,
  prepareScanBlock,
  readCachedScan,
} from "./scan-history";
export type { Block, CachedScan } from "./scan-history";

export interface ApiInfo {
  firstTick: number;
  lastTick: number;
  puid: number;
}

export const scanInfo: { [k: string]: ApiInfo } = {};
const tails = new Map<string, CachedScan>();
const receivedBlocks = new Map<string, Map<number, Block>>();

const cached: { [k: string]: CachedScan } = {};

export function unloadServerScans() {
  for (const watcher of watchers.values()) {
    void watcher.then((unsubscribe) => unsubscribe()).catch(() => {});
  }
  watchers.clear();
}

export function getCacheForKey(apikey: string): CachedScan {
  return cached[apikey];
}
export function scansExist(apikey: string): boolean {
  return cached[apikey]?.next !== undefined && cached[apikey].next !== null;
}
export async function getLastRecord(gameid: number, apikey: string) {
  await loadBlocks(gameid, apikey);
  const cache = getCacheForKey(apikey);
  if (!cache) {
    await watchForBlocks(apikey, gameid);
  }
  return tails.get(apikey);
}

async function updateCache(apikey: string, block: Block) {
  let blocks = receivedBlocks.get(apikey);
  const prior = blocks?.get(block.initial_timestamp);
  if (
    prior &&
    Object.keys(prior).length === Object.keys(block).length &&
    Object.keys(block).every((key) => prior[key] === block[key])
  )
    return;

  const records = await prepareScanBlock(block);
  const head = cached[apikey] || { timestamp: block.initial_timestamp };
  let before = head;
  // Appends can jump directly to the tail; changed blocks scan only metadata.
  const tail = tails.get(apikey);
  if (tail && tail.timestamp < block.initial_timestamp) before = tail;
  else
    while (before.next && before.next.timestamp < block.initial_timestamp) {
      before = before.next;
    }
  let after = before.next;
  while (after && after.timestamp <= block.last_timestamp) after = after.next;
  const previousState = before === head ? {} : readCachedScan(before);
  const first = records[0];
  const last = records[records.length - 1];
  first.forward = diff(previousState, first.check);
  first.back = diff(first.check, previousState);
  // Reconnect an unchanged suffix to the new endpoint without replaying it.
  if (after) {
    const followingState = readCachedScan(after);
    after.forward = diff(last.check, followingState);
    after.back = diff(followingState, last.check);
    after.prev = last;
  } else tails.set(apikey, last);
  first.prev = before;
  last.next = after;
  before.next = first;
  head.revision = (head.revision || 0) + 1;
  cached[apikey] = head;
  if (!blocks) {
    blocks = new Map();
    receivedBlocks.set(apikey, blocks);
  }
  blocks.set(block.initial_timestamp, { ...block });
  const firstScan = head.next.check;
  const lastScan = tails.get(apikey).check;
  scanInfo[apikey] = {
    firstTick: firstScan.tick,
    lastTick: lastScan.tick,
    puid: lastScan.playerUid ?? lastScan.player_uid,
  };
}

const databases = new Map<string, ReturnType<typeof scanDatabase>>();
const queues = new Map<string, Promise<unknown>>();
const loaded = new Set<string>();
const watchers = new Map<string, Promise<() => void>>();

function databaseFor(gameid: number, apikey: string) {
  const name = `${gameid}:${apikey}:scandiffblocks`;
  if (!databases.has(name)) databases.set(name, scanDatabase(name));
  return { name, database: databases.get(name) };
}

function serial<T>(name: string, task: () => Promise<T>): Promise<T> {
  const next = (queues.get(name) || Promise.resolve()).then(task);
  // A failed write must not poison all subsequent snapshot processing.
  const settled = next.catch(() => {});
  queues.set(name, settled);
  void settled.then(() => {
    if (queues.get(name) === settled) queues.delete(name);
  });
  return next;
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function loadBlocks(gameid: number, apikey: string) {
  const { name, database } = databaseFor(gameid, apikey);
  return serial(name, async () => {
    if (!loaded.has(name)) {
      let blocks: Block[];
      try {
        blocks = await database.run((db) =>
          db.getAllFromIndex(name, "initial_timestamp"),
        );
      } catch (error) {
        // Local storage is an optimization; a failed read must not prevent
        // subscribing to the server and rebuilding history in memory.
        console.error("Could not read local scan history", error);
        return scanInfo[apikey];
      }
      for (const block of blocks) {
        try {
          await updateCache(apikey, block);
        } catch (error) {
          console.error("Could not load scan block", error);
        }
        await delay(0);
      }
      loaded.add(name);
    }
    return scanInfo[apikey];
  });
}

export function watchForBlocks(apikey: string, gameid = getGameNumber()) {
  const name = `${gameid}:${apikey}`;
  if (!watchers.has(name)) {
    const watching = loadBlocks(gameid, apikey).then(() =>
      subscribe(gameid, apikey),
    );
    watchers.set(name, watching);
    void watching.catch(() => {
      if (watchers.get(name) === watching) watchers.delete(name);
    });
  }
  return watchers.get(name);
}

async function subscribe(gameid: number, apikey: string) {
  const { name, database } = databaseFor(gameid, apikey);
  const lastTimestamp = await serial(
    name,
    async () => tails.get(apikey)?.timestamp || 0,
  );
  const diffskey = `scandiffblocks/${gameid}/${apikey}`;
  return onSnapshot(
    query(
      collection(firestore, diffskey),
      where("last_timestamp", ">", lastTimestamp),
      orderBy("last_timestamp"),
    ),
    (querySnapshot) => {
      const blocks = querySnapshot
        .docChanges()
        .filter((change) => change.type !== "removed")
        .map((change) => change.doc.data() as Block);
      void serial(name, async () => {
        for (const block of blocks) {
          try {
            await updateCache(apikey, block);
          } catch (error) {
            console.error("Could not update scan block", error);
            continue;
          }
          // Keep receiving scans even if local persistence is unavailable.
          try {
            await database.run((db) => db.put(name, block));
          } catch (error) {
            console.error("Could not persist scan history", error);
          }
        }
      }).catch((error) =>
        console.error("Could not update scan history", error),
      );
    },
    (error) => {
      watchers.delete(`${gameid}:${apikey}`);
      console.error(`Scan subscription failed for game ${gameid}`, error);
    },
  );
}
