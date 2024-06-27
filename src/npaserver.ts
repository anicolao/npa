import { initializeApp } from "firebase/app";
import { isSafari } from "./useragent";

import {
  addDoc,
  collection,
  doc,
  increment,
  initializeFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
} from "firebase/firestore";
import { openDB } from "idb";
import { type ScanningData, getPlayerUid } from "./galaxy";
import { getGameNumber } from "./intel";
import { type Patch, clone, diff, patch as patchR } from "./patch";
import { getVersion } from "./version";

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
  console.log(`Count scans for key ${apikey} ${diffCache[apikey]?.length}`);
  return diffCache[apikey]?.length || 0;
}

async function open(dbName: string) {
  return openDB(dbName, 1, {
    upgrade(db) {
      const store = db.createObjectStore(dbName, {
        keyPath: "timestamp",
      });
      store.createIndex("timestamp", "timestamp", { unique: true });
    },
  });
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

const firebaseConfig = {
  apiKey: "AIzaSyCzwCKesO-Me1dVpo-5jZxoo559SoGGstk",
  authDomain: "npaserver.firebaseapp.com",
  projectId: "npaserver",
  storageBucket: "npaserver.appspot.com",
  messagingSenderId: "560331767449",
  appId: "1:560331767449:web:5595a4f5c3e02ed49bc208",
};

const app = initializeApp(firebaseConfig);
const firestore = initializeFirestore(app, {
  experimentalForceLongPolling: isSafari(),
});

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

export function registerForScans(apikey: string, notifications?: string) {
  const gameid = getGameNumber();
  const store = collection(firestore, `newkey`);
  if (notifications) {
    addDoc(store, { game_id: gameid, api_key: apikey, notifications });
  } else {
    addDoc(store, { game_id: gameid, api_key: apikey });
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
  const gameid = getGameNumber();
  await restoreFromDB(gameid, apikey);
  const len = diffCache[apikey]?.length || 0;
  console.log(`Fetched ${len} entries from ${apikey}`);
  const timestamp = 0;
  if (len > 0) {
    const first = 0;
    const last = len - 1;
    const puid = getPlayerUid(diffCache[apikey][first].cached);
    const firstTick = diffCache[apikey][first].cached.tick;
    const lastTick = diffCache[apikey][last].cached.tick;
    for (let i = 0; i < diffCache[apikey].length; ++i) {
      const prevI = i - 1;
      if (prevI >= 0) {
        diffCache[apikey][prevI].next = diffCache[apikey][i];
        diffCache[apikey][i].prev = diffCache[apikey][prevI];
      }
    }
    scanInfo[apikey] = {
      puid,
      firstTick,
      lastTick,
    };
    console.log(
      `Ticks for ${apikey}:${puid}: ${firstTick} - ${lastTick} (${diffCache[apikey].length})`,
    );
  }
  console.log(`getServerScans: ${timestamp} ${apikey} ${len}`);
  const diffskey = `scandiffblocks/${gameid}/${apikey}`;
  const diffTimestamp = diffCache[apikey]?.slice(-1)[0]?.timestamp || 0;
  console.log(
    `Reading diff database for ${gameid}:${apikey} from time ${diffTimestamp}`,
  );
  return onSnapshot(
    query(
      collection(firestore, diffskey),
      where("last_timestamp", ">", 0 * diffTimestamp),
      orderBy("last_timestamp"),
    ),
    (querySnapshot) => {
      const changedBlocks = querySnapshot.docChanges();
      changedBlocks.forEach((change, i) => {
        const doc = change.doc;
        const patches = doc.data() as any;
        const size = Math.round(JSON.stringify(doc.data()).length / 1024);
        console.log(`Block ${i}: `, {
          i,
          last_timestamp: patches.last_timestamp,
          diffTimestamp,
          truth: patches.last_timestamp > diffTimestamp,
          startTick: JSON.parse(patches.initial_scan).scanning_data.tick,
          size,
        });
      });
      const lastValidationBlock: { [k: string]: any } = {};
      function validateBlock(patches: any, initial_scan: any) {
        const timestamps: number[] = Object.keys(patches)
          .map((x) => +x)
          .filter((x) => !!x)
          .sort();
        if (lastValidationBlock[apikey] === undefined) {
          lastValidationBlock[apikey] = {};
        }
        let scan = lastValidationBlock[apikey];
        for (let i = 0; i < timestamps.length; ++i) {
          const timestamp = timestamps[i];
          scan = patch(scan, JSON.parse(patches[timestamp]));
          if (i === 0) {
            const initial = JSON.parse(initial_scan);
            const nullDiff = diff(scan, initial);
            if (nullDiff !== null) {
              console.error("Initial scan mismatch");
              scan = window.structuredClone(initial);
            } else {
              console.log("Initial scan good");
            }
          } else if (i === timestamps.length - 1) {
            if (timestamp !== patches.last_timestamp) {
              console.error(`last timestamp mismatch`);
            } else {
              console.log(`last timestamp good`);
            }
            const last = JSON.parse(patches.last_scan);
            const nullDiff = diff(scan, last);
            if (nullDiff !== null) {
              console.error("Last scan mismatch: ", {
                scan,
                last: patches.last_scan,
                nullDiff,
              });
              lastValidationBlock[apikey] = last;
            } else {
              console.log("Last Scan good");
              lastValidationBlock[apikey] = scan;
            }
          }
        }
      }
      changedBlocks.forEach((change, i) => {
        const doc = change.doc;
        console.log(`Processing ${i} (${doc.id}) for ${apikey}`);
        const patches = doc.data() as any;
        validateBlock(patches, patches.initial_scan);
        console.log(`Validated ${i} (${doc.id}) for ${apikey}`);
        const knownKeys: { [k: string]: boolean } = {};
        for (const diff of diffCache[apikey]) {
          knownKeys[diff.timestamp] = true;
        }
        const all: number[] = Object.keys(patches)
          .map((x) => +x)
          .sort();
        const missing: number[] = Object.keys(patches)
          .filter((x) => !knownKeys[x] && +x)
          .map((x) => +x)
          .sort();
        console.log(
          `Missing count: ${missing.length} vs ${all.length} (vs ${
            diffCache[apikey].length
          } == ${Object.keys(knownKeys).length})`,
        );
        let mi = 0;
        let ai = 0;
        while (mi < missing.length && ai < all.length) {
          if (missing[mi] === all[ai]) {
            console.log(`match: ${mi} == ${ai}`);
            mi++;
            ai++;
            continue;
          }
          if (missing[mi] < all[ai]) {
            console.error(`impossible skip on missing ${mi}`);
            mi++;
            continue;
          }
          if (missing[mi] > all[ai]) {
            console.log(`skip all @ ${ai}`);
            ai++;
            continue;
          }
          console.error("not reached");
        }
        console.log(`remaining in missing: ${missing.length - mi}`);
        console.log(`remaining in all: ${all.length - ai}`);
        let last = diffCache[apikey]?.length - 1;
        const latestDiff = missing[0] || diffCache[apikey][last].timestamp;
        while (last > 0 && diffCache[apikey][last].timestamp > latestDiff) {
          last--;
          console.error(`Discarding gap-making diff @ ${last}`);
        }
        last++;
        if (last !== diffCache[apikey]?.length) {
          console.error(
            `After discarding gap-making diff len ${diffCache[apikey].length} => ${last}`,
          );
          console.log({ apikey: diffCache[apikey] });
          lastScan[apikey] = 0;
          walkToScan(apikey, last - 1);
          diffCache[apikey] = diffCache[apikey].slice(0, last);
          console.log({
            apikey: diffCache[apikey],
            cached: diffCache[apikey][last - 1].cached,
          });
        }
        const latestCachedTime = diffCache[apikey][last - 1]?.timestamp || 0;
        const timestamps: number[] = Object.keys(patches)
          .filter((x) => +x > latestCachedTime)
          .map((x) => +x)
          .sort();
        console.log(`Timestamp count ${timestamps.length}`);
        const originalLength = diffCache[apikey] ? diffCache[apikey].length : 0;
        if (diffCache[apikey] === undefined || diffCache[apikey].length === 0) {
          const cached = JSON.parse(patches.initial_scan).scanning_data;
          diffCache[apikey] = [
            {
              cached,
              timestamp: patches?.initial_timestamp || cached.start_time,
            },
          ];
        }
        timestamps.forEach((timestamp, i) => {
          const forward = JSON.parse(patches[timestamp]).scanning_data;
          if (
            diffCache[apikey].length === 1 &&
            i === 0 &&
            forward.now === diffCache[apikey][0].cached.now
          ) {
            const check = {};
            const checkPatch = patchR(forward, check);
            console.log("Skip initial {} -> state patch", {
              cached: diffCache[apikey][0].cached,
              forward,
              checkPatch,
            });
            const nullDiff = diff(checkPatch, diffCache[apikey][0].cached);
            if (nullDiff !== null) {
              console.error(`bad skip?!`);
            } else {
              console.error("...checks out");
            }
            return;
          }
          const last = diffCache[apikey].length - 1;

          const priorCache = window.structuredClone(
            diffCache[apikey][last].cached,
          );
          console.log({ priorCache });
          const cached = patch(priorCache, forward);
          const back = diff(cached, diffCache[apikey][last].cached);
          const prev = diffCache[apikey][last - 1];
          diffCache[apikey].push({
            cached,
            back,
            prev,
            timestamp,
          });
          const next = diffCache[apikey][last + 1];
          const entry = { ...diffCache[apikey][last], forward, next };
          diffCache[apikey][last] = entry;
          if (last > 0) {
            diffCache[apikey][last].cached = undefined;
          }
        });

        const incoming = diffCache[apikey].slice(
          Math.max(originalLength - 1, 0),
        );
        store(incoming, gameid, apikey, "diffCache");

        console.log("Diff update received: ", change, diffCache);
      });
    },
    (error) => {
      logCount(`error_scandiffs_query_${gameid}:${apikey} ${error}`);
      console.log(`scandiffs query ${diffskey} failing: `);
      console.error(error);
    },
  );
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

export function logError(e: any) {
  const gameid = getGameNumber();
  const store = collection(firestore, `error`);
  const stack = e?.error?.stack || e?.reason?.stack || "no stack trace";
  const message =
    e?.error?.message || e?.reason?.message || e?.reason?.code || "no message";
  const version = getVersion();
  const timestamp = new Date().getTime();
  if (stack === "no stack trace") {
    console.error("No stack", e);
    if (e?.isTrusted !== true) {
      logCount(`${message}`);
      logCount(`${message}:${JSON.stringify(e)}`);
    }
  } else {
    addDoc(store, { gameid, stack, message, version, timestamp }).catch(
      (_e) => {
        console.error(`Failed to write error for game ${gameid}`);
      },
    );
  }
}

export function logCount(c: any) {
  const store = collection(firestore, `info`);
  const d = doc(store, "counters");
  const data: any = {};
  const fullVersion = getVersion();
  const caution = "⚠";
  const version =
    fullVersion.match(/v[0-9]\.[^ ]*/) +
    (fullVersion.indexOf(caution) !== -1 ? "-dev" : "");
  const key = `${version}_${c}`;
  console.log(`INCREMENT ${key}`);
  data[key] = increment(1);
  setDoc(d, data, { merge: true }).catch((e) => {
    console.error(`Error trying to increment ${key}`, { e, d, data });
  });
}
