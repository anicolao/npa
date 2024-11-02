import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { firestore } from "./firestore";
import { deleteDB, open } from "./idb";
import { getGameNumber } from "./intel";
import { logCount } from "./logging";
import { clone, diff, patch } from "./patch";

export interface ApiInfo {
  firstTick: number;
  lastTick: number;
  puid: number;
}

export interface CachedScan {
  cached?: any;
  check?: any;
  back?: any;
  forward?: any;
  next?: CachedScan;
  prev?: CachedScan;
  timestamp: number;
}
export const scanInfo: { [k: string]: ApiInfo } = {};

export interface Block {
  initial_timestamp: number;
  last_timestamp: number;
  initial_scan: string;
  last_scan: string;
  // also contains timestamp: string for timestamps in range
}

const cached: { [k: string]: CachedScan } = {};

export function unloadServerScans() {
  //cached = {};
}

export function getCacheForKey(apikey: string): CachedScan {
  return cached[apikey];
}
export function scansExist(apikey: string): boolean {
  return cached[apikey]?.next !== undefined && cached[apikey].next !== null;
}
export async function getLastRecord(gameid: number, apikey: string) {
  await loadBlocks(gameid, apikey);
  let cache = getCacheForKey(apikey);
  if (!cache) {
    await subscribe(gameid, apikey);
  }
  cache = getCacheForKey(apikey);
  while (cache?.next) {
    cache = cache.next;
  }
  return cache;
}
function validateCache(apikey: string): number {
  if (!cached[apikey]) {
    console.error("Cached data not found");
    logCount("error_missing_cache");
    return 0;
  }
  let state = {};
  let count = 0;
  let prev = null;
  for (let next = cached[apikey]; next !== undefined; next = next.next) {
    const previous = clone(state);
    state = patch(state, next.forward);
    next.back = diff(state, previous);
    next.prev = prev;
    prev = next;
    if (next.check) {
      const d = diff(next.check, state);
      if (d !== null) {
        console.error(
          `Invalid patch at timestamp ${next.timestamp} for ${apikey}`,
        );
        prev.next = null;
        logCount("error_invalid_patch");
        return prev.timestamp;
      }
    }
    count++;
  }
  const lastTimestamp = prev.timestamp;
  if (prev.next) {
    console.error(`Unexpected next at end of chain.`);
  } else {
    for (; prev !== null; prev = prev.prev) {
      state = patch(state, prev.back);
      if (prev.prev?.check) {
        const d = diff(prev.prev.check, state);
        if (d !== null) {
          console.error(`Invalid backlink at ${prev.timestamp} for ${apikey}`);
          logCount("error_bad_backlink");
          return 0;
        }
      }
    }
  }
  console.log(`Validated ${count} patches for ${apikey}`);
  return lastTimestamp;
}

function updateCache(gameid: number, apikey: string, patches: Block) {
  const timestamps = Object.keys(patches)
    .filter((x) => +x)
    .map((x) => +x)
    .sort();
  console.log(
    `Update cache for ${gameid}:${apikey}; ${timestamps.length} patches found`,
  );
  cached[apikey] = cached[apikey] || { timestamp: patches.initial_timestamp };
  let next = cached[apikey];
  while (next.next) {
    if (next.next.timestamp === patches.initial_timestamp) {
      console.log(
        `Found this block in cache; discard it: ${patches.initial_timestamp}`,
      );
      next.next = null;
      break;
    }
    next = next.next;
  }
  next.next = {
    timestamp: patches.initial_timestamp,
    check: JSON.parse(patches.initial_scan).scanning_data,
  };
  next = next.next;
  if (cached[apikey] === undefined) {
    cached[apikey] = {
      timestamp: patches.initial_timestamp,
    };
  }
  let lastCheck = undefined;
  let last = undefined;
  for (let ti = 0; ti < timestamps.length; ++ti) {
    const timestamp = timestamps[ti];
    const nextTime = timestamps[ti + 1];
    const patch = JSON.parse(patches[timestamp]).scanning_data;
    if (timestamp !== next.timestamp) {
      console.error(
        `? not on the right timestamp ${timestamp} vs ${next.timestamp}`,
      );
    }
    next.forward = patch;
    if (nextTime) {
      next.next = { timestamp: nextTime };
    } else {
      next.check = JSON.parse(patches.last_scan).scanning_data;
      last = next;
      lastCheck = next.check;
    }
    next = next.next;
  }
  if (lastCheck.tick === NeptunesPride.universe.galaxy.tick) {
    const lastValidTimestamp = validateCache(apikey);
    if (lastValidTimestamp < last.timestamp) {
      console.error(
        `${lastValidTimestamp} < ${last.timestamp}; delete db for ${apikey}`,
      );
      const dbName = `${gameid}:${apikey}:scandiffblocks`;
      logCount("error_invalid_db_deleted");
      deleteDB(dbName);
    }
  }
}

function updateScanInfo(apikey: string) {
  if (!cached[apikey]) {
    console.error("Cached data not found");
    logCount("error_missing_cache_on_rebuild");
    return;
  }
  let firstTick = undefined;
  let lastTick = undefined;
  let puid = undefined;
  for (let next = cached[apikey]; next; next = next.next) {
    if (next.check) {
      if (firstTick === undefined) {
        firstTick = next.check?.tick;
      }
      next.cached = next.check;
      lastTick = next.check?.tick;
      puid = next.cached.playerUid;
    }
  }
  console.log(
    `Update scan info for ${apikey} from tick ${firstTick} to ${lastTick} for [[${puid}]]`,
  );
  scanInfo[apikey] = {
    firstTick,
    lastTick,
    puid,
  };
}

async function store(dbName: string, db: any, persist: any): Promise<void> {
  const tx = db.transaction(dbName, "readwrite");
  tx.store.put(persist);
  return tx.done;
}

export async function loadBlocks(gameid: number, apikey: string) {
  const dbName = `${gameid}:${apikey}:scandiffblocks`;
  const db = await open(dbName, "initial_timestamp");
  console.log(`OPEN DB: ${dbName}`, db);
  const storedData = await db.getAllFromIndex(dbName, "initial_timestamp");
  console.log(`IndexDB cache for ${apikey}:`, storedData);
  for (const block of storedData) {
    updateCache(gameid, apikey, block);
  }
  if (storedData.length) {
    updateScanInfo(apikey);
  }
  return scanInfo[apikey];
}
export async function watchForBlocks(apikey: string) {
  if (cached[apikey] !== undefined) {
    console.log(`Already watching ${apikey}`);
    return;
  }
  const gameid = getGameNumber();
  await loadBlocks(gameid, apikey);
  return subscribe(gameid, apikey);
}
async function subscribe(gameid: number, apikey: string) {
  const dbName = `${gameid}:${apikey}:scandiffblocks`;
  const db = await open(dbName, "initial_timestamp");
  let diffTimestamp = 0;
  for (let next = cached[apikey]; next; next = next.next) {
    diffTimestamp = next.timestamp || diffTimestamp;
  }
  const lastValidTime = validateCache(apikey);
  if (lastValidTime < diffTimestamp) {
    console.error(`Using ${lastValidTime} instead of ${diffTimestamp}`);
    logCount("error_heal_bad_diffcache");
    diffTimestamp = lastValidTime;
  }
  console.log(`Query for ${gameid}:${apikey} later than ${diffTimestamp}`);
  const diffskey = `scandiffblocks/${gameid}/${apikey}`;
  return onSnapshot(
    query(
      collection(firestore, diffskey),
      where("last_timestamp", ">", diffTimestamp),
      orderBy("last_timestamp"),
    ),
    (querySnapshot) => {
      const changedBlocks = querySnapshot.docChanges();
      for (const change of changedBlocks) {
        const doc = change.doc;
        const patches = doc.data() as any;
        store(dbName, db, patches);
        updateCache(gameid, apikey, patches);
        updateScanInfo(apikey);
      }
    },
    (error) => {
      logCount(`error_scandiffs_query_${gameid}:${apikey} ${error}`);
      console.log(`scandiffs query ${diffskey} failing: `);
      console.error(error);
    },
  );
}
