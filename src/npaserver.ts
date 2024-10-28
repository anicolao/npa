import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { firestore } from "./firestore";
import { type ScanningData, getPlayerUid } from "./galaxy";
import { open } from "./idb";
import { getGameNumber } from "./intel";
import { logCount } from "./logging";
import { type Patch, clone, diff, patch as patchR } from "./patch";
import { watchForBlocks } from "./timemachine";

function containsNulls(a: Patch) {
  if (typeof a !== "object") return false;
  if (a === null) return true;
  for (const k in a) {
    if (containsNulls(a[k])) {
      console.log(`k: ${k}`);
      return true;
    }
  }
  return false;
}
export function patch(a: Patch, p: Patch): Patch {
  const before = clone(a);
  if (containsNulls(before)) {
    console.error(`nulls before`);
  }
  const ret = patchR(a, p);
  if (containsNulls(ret)) {
    console.error(`nulls after`, before, ret);
    throw "nulls";
  }
  return ret;
}

export interface ApiInfo {
  firstTick: number;
  lastTick: number;
  puid: number;
}
export const scanInfo: { [k: string]: ApiInfo } = {};

export interface CachedScan {
  apis?: string;
  cached?: any;
  back?: any;
  forward?: any;
  next?: CachedScan;
  prev?: CachedScan;
  notifications?: string;
  timestamp: number;
}
export const diffCache: { [k: string]: any[] } = {};

export function countScans(apikey: string) {
  if (apikey === undefined) {
    console.error("Count scans: undefined key");
  }
  //console.log(`Count scans for key ${apikey} ${diffCache[apikey]?.length}`);
  return diffCache[apikey]?.length || 0;
}

async function store(
  incoming: any[],
  gameId: number,
  apikey: string,
  version: "diffCache" | "scanCache",
) {
  const suffix = version === "diffCache" ? ":diffcache" : "";
  const dbName = `${gameId}:${apikey}${suffix}`;
  const db = await open(dbName);

  const tx = db.transaction(dbName, "readwrite");
  await Promise.all([
    ...incoming.map((x) => {
      const persist = { ...x };
      persist.prev = undefined;
      persist.next = undefined;
      return tx.store.put(persist);
    }),
    tx.done,
  ]);
}

async function restore(
  gameId: number,
  apikey: string,
  version: "diffCache" | "scanCache",
) {
  const suffix = version === "diffCache" ? ":diffcache" : "";
  const dbName = `${gameId}:${apikey}${suffix}`;
  const db = await open(dbName);
  return db.getAllFromIndex(dbName, "timestamp");
}

export async function getLastRecord(
  gameId: number,
  apikey: string,
  version: "diffCache" | "scanCache",
) {
  const suffix = version === "diffCache" ? ":diffcache" : "";
  const dbName = `${gameId}:${apikey}${suffix}`;
  console.log(`getLastScan ${dbName}`);
  const db = await open(dbName);
  const keys = await db.getAllKeys(dbName);
  console.log({ k0: keys[0], kl: keys.slice(-1)[0] });
  const lastKey = keys.slice(-1)[0];
  if (lastKey) return db.getFromIndex(dbName, "timestamp", lastKey);
  return undefined;
}

export async function restoreFromDB(gameId: number, apikey: string) {
  if (!diffCache[apikey] || diffCache[apikey].length === 0) {
    try {
      diffCache[apikey] = await restore(gameId, apikey, "diffCache");
      console.log(`Restored diff cache from db: ${diffCache[apikey]?.length}`);
      console.log("Done restores.");
    } catch (err) {
      logCount(err);
      console.error(err);
    }
  }
}

export function unloadServerScans() {
  for (const k in diffCache) {
    delete diffCache[k];
  }
}
export async function getServerScans(apikey: string) {
  if (diffCache[apikey] !== undefined) {
    console.log(`Already watching ${apikey}`);
    return;
  }
  watchForBlocks(apikey);
}

const lastScan: { [k: string]: number } = {};
function walkToScan(apikey: string, index: number) {
  let last = lastScan[apikey] || 0;
  lastScan[apikey] = index;
  if (diffCache[apikey][index].cached) {
    return diffCache[apikey][index].cached;
  }
  while (index > last) {
    let scanContent = diffCache[apikey][last].cached;
    const forward = diffCache[apikey][last].forward;
    if (last === 0) {
      scanContent = window.structuredClone(scanContent);
    } else {
      diffCache[apikey][last].cached = undefined;
    }
    if (!forward) {
      console.error("Patching with undefined forward");
      logCount(`error_undefined_forward`);
    }
    diffCache[apikey][++last].cached = patch(scanContent, forward);
  }
  while (index < last) {
    let scanContent = diffCache[apikey][last].cached;
    const back = diffCache[apikey][last].back;
    if (last === diffCache[apikey].length - 1) {
      scanContent = window.structuredClone(scanContent);
    } else {
      diffCache[apikey][last].cached = undefined;
    }
    if (!back) {
      console.error("Patching with undefined back");
      logCount(`error_undefined_back`);
    }
    diffCache[apikey][--last].cached = patch(scanContent, back);
  }
  return diffCache[apikey][index].cached;
}

export function getScan(
  apikey: string,
  index: number,
): ScanningData & { eof?: boolean } {
  try {
    if (diffCache[apikey]) {
      if (diffCache[apikey].length > index) {
        return walkToScan(apikey, index);
      }
      console.error(
        `Position ${index} is off the end of diffCache ${diffCache[apikey].length}`,
      );
    } else {
      logCount(`error_missing_diffcache_${apikey}`);
      console.error(`No diffcache yet fetching ${apikey} @ ${index}`);
    }
  } catch (err) {
    console.error(err);
    logCount(err);
  }
}
