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
import { getPlayerUid, type ScanningData } from "./galaxy";
import { clone, diff, patch as patchR, type Patch } from "./patch";
import { getVersion } from "./version";
import { getGameNumber } from "./intel";

function containsNulls(a: Patch) {
  if (typeof a !== "object") return false;
  if (a === null) return true;
  for (const k in a) {
    if (containsNulls(a[k])) return true;
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
    console.error(`nulls after`, before);
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
  version: "diffCache" | "scanCache"
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
  version: "diffCache" | "scanCache"
) {
  const suffix = version === "diffCache" ? ":diffcache" : "";
  const dbName = `${gameId}:${apikey}${suffix}`;
  const db = await open(dbName);
  return db.getAllFromIndex(dbName, "timestamp");
}

export async function getLastRecord(
  gameId: number,
  apikey: string,
  version: "diffCache" | "scanCache"
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
  let timestamp = 0;
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
    console.log(`Ticks for ${apikey}:${puid}: ${firstTick} - ${lastTick} (${diffCache[apikey].length})`);
  }
  console.log(`getServerScans: ${timestamp} ${apikey} ${len}`);
  const diffskey = `scandiffblocks/${gameid}/${apikey}`;
  const diffTimestamp = diffCache[apikey]?.slice(-1)[0]?.timestamp || 0;
  console.log(
    `Reading diff database for ${gameid}:${apikey} from time ${diffTimestamp}`
  );
  return onSnapshot(
    query(
      collection(firestore, diffskey),
      where("last_timestamp", ">", diffTimestamp),
      orderBy("last_timestamp")
    ),
    (querySnapshot) => {
      const changedBlocks = querySnapshot.docChanges();
      changedBlocks.forEach((change, i) => {
        let doc = change.doc;
        let patches = doc.data() as any;
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
      const validatedAlready: { [k: string]: boolean } = {};
      const lastValidationBlock: { [k: string]: any } = {};
      function validateBlock(patches: any) {
        const timestamps: number[] = Object.keys(patches)
          .map((x) => +x)
          .filter((x) => !!x)
          .sort();
        console.log(`${timestamps.length} patches found`);
        const denudedPatch = { ...patches };
        if (lastValidationBlock[apikey] === undefined) {
          lastValidationBlock[apikey] = {};
        }
        let last = lastValidationBlock[apikey];
        timestamps.forEach((t, i) => {
          delete denudedPatch[t];
          last = patch(last, JSON.parse(patches[t]));
          if (i === 0 && !validatedAlready[patches.initial_scan]) {
            validatedAlready[patches.initial_scan] = true;
            let nullDiff = diff(JSON.parse(patches.initial_scan), last);
            if (nullDiff !== null) {
              console.error(`First patch mismatch ${apikey}: `, nullDiff);
              console.error(`Last was ${apikey}: `, last);
              console.log("First patch INvalid: ", patches.initial_scan);
            } else {
              console.log("First patch valid");
            }
          }
        });
        if (patches.last_scan) {
          let nullDiff = diff(JSON.parse(patches.last_scan), last);
          if (nullDiff !== null) {
            console.error("Last patch mismatch", nullDiff);
          } else {
            console.log("Last patch valid");
          }
          lastValidationBlock[apikey] = last;
        } else {
          console.error("latest scan missing");
        }
        console.log("Denuded: ", denudedPatch);
      }
      changedBlocks.forEach((change, i) => {
        console.log(`Processing block #${i} for ${apikey}`);
        let doc = change.doc;
        let patches = doc.data() as any;
        const knownKeys: { [k: string]: boolean } = {};
        diffCache[apikey]?.forEach(
          (diff) => (knownKeys[diff.timestamp] = true)
        );
        const all: number[] = Object.keys(patches)
          .map((x) => +x)
          .sort();
        const missing: number[] = Object.keys(patches)
          .filter((x) => !knownKeys[x] && +x)
          .map((x) => +x)
          .sort();
        console.log(`Missing count: ${missing.length} vs ${all.length}`);
        let mi = 0;
        let ai = 0;
        while (mi < missing.length && ai < all.length) {
          if (missing[mi] === all[ai]) {
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
            ai++;
            console.log(`skip all @ ${ai}`);
            continue;
          }
          console.error("not reached");
        }
        console.log(`remaining in missing: ${missing.length - mi}`);
        console.log(`remaining in all: ${all.length - ai}`);
        const latestDiff = missing[0] || 0;
        let last = diffCache[apikey]?.length - 1;
        const latestCachedTime = diffCache[apikey][last]?.timestamp || 0;
        while (last > 0 && diffCache[apikey][last].timestamp > latestDiff) {
          last--;
          console.error(`Discarding gap-making diff @ ${last}`);
        }
        last++;
        if (last !== diffCache[apikey]?.length) {
          console.error(
            `After discarding gap-making diff len ${diffCache[apikey].length} => ${last}`
          );
          diffCache[apikey] = diffCache[apikey].slice(0, last);
        }
        const timestamps: number[] = Object.keys(patches)
          .filter((x) => +x > latestCachedTime)
          .map((x) => +x)
          .sort();
        console.log(
          `Timestamp count ${timestamps.length} vs missing ${missing.length}`
        );
        const originalLength = diffCache[apikey] ? diffCache[apikey].length : 0;
        if (diffCache[apikey] === undefined || diffCache[apikey].length === 0) {
          const cached = JSON.parse(patches["initial_scan"]).scanning_data;
          diffCache[apikey] = [
            {
              cached,
              timestamp: patches?.initial_timestamp || cached.start_time,
            },
          ];
        }
        timestamps.forEach((timestamp, i) => {
          if (diffCache[apikey].length === 1 && i === 0) {
            console.log("Skip initial {} -> state patch");
            return;
          }
          const forward = JSON.parse(patches[timestamp]).scanning_data;
          let last = diffCache[apikey].length - 1;


          const priorCache = window.structuredClone(
            diffCache[apikey][last].cached
          );
          const cached = patch(priorCache, forward);
          const back = diff(cached, diffCache[apikey][last].cached);
          const prev = diffCache[apikey][last-1];
          diffCache[apikey].push({
            cached,
            back,
            prev,
            timestamp,
          });
          const next = diffCache[apikey][last+1];
          let entry = { ...diffCache[apikey][last], forward, next };
          diffCache[apikey][last] = entry;
          if (last > 0) {
            diffCache[apikey][last].cached = undefined;
          }
        });

        const incoming = diffCache[apikey].slice(
          Math.max(originalLength - 1, 0)
        );
        store(incoming, gameid, apikey, "diffCache");

        console.log("Diff update received: ", change, diffCache);
      });
    },
    (error) => {
      logCount(`error_scandiffs_query_${gameid}:${apikey} ${error}`);
      console.log(`scandiffs query ${diffskey} failing: `);
      console.error(error);
    }
  );
}

let lastScan: { [k: string]: number } = {};
function walkToScan(apikey: string, index: number) {
  let last = lastScan[apikey] || 0;
  lastScan[apikey] = index;
  if (diffCache[apikey][index].cached) {
    return diffCache[apikey][index].cached;
  }
  while (index > last) {
    let scanContent = diffCache[apikey][last].cached;
    let forward = diffCache[apikey][last].forward;
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
    let back = diffCache[apikey][last].back;
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
  index: number
): ScanningData & { eof?: boolean } {
  try {
    if (diffCache[apikey]) {
      if (diffCache[apikey].length > index) {
        return walkToScan(apikey, index);
      } else {
        console.error(
          `Position ${index} is off the end of diffCache ${diffCache[apikey].length}`
        );
      }
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
    logCount(`${message}`);
    logCount(`${message}:${JSON.stringify(e)}`);
  } else {
    addDoc(store, { gameid, stack, message, version, timestamp }).catch((e) => {
      console.error(`Failed to write error for game ${gameid}`);
    });
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
