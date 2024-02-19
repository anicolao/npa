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
import { type ScanningData } from "./galaxy";
import { clone, diff, patch as patchR, type Patch }  from "./patch";
import { getVersion } from "./version";

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
    console.error(`nulls before`)
  }
  const ret = patchR(a, p);
  if (containsNulls(ret)) {
    console.error(`nulls after`, before)
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
export const scanCache: { [k: string]: any[] } = {};
const diffCache: { [k: string]: any[] } = {};
function validateDiffCache(gameid: number, apikey: string) {
  function match(a: any, b: any) {
    const d = diff(a, b);
    if (d === null) {
      return d;
    }
    const as = JSON.stringify(a);
    const bs = JSON.stringify(b);
    if (as != bs) {
      return d;
    }
    return null;
  }
  function logCount(s: string) {
    //console.error(`Disabled logCount ${s}`);
  }
  function validateEntry(entry: any, i: number, skipCached?: boolean): void {
    const scanCacheEntry = scanCache[apikey][i];
    if (entry === undefined) {
      console.error(`Missing entry for ${apikey}:${i}`);
      return;
    }
    if (scanCacheEntry === undefined) {
      console.error(`Missing scanCacheEntry for ${apikey}:${i}`);
      return;
    }
    if (entry.timestamp !== scanCacheEntry.timestamp) {
      if (i === 0) {
        console.log(
          `Expected Timestamp mismatch for ${i}: ${entry.timestamp} vs ${scanCacheEntry.timestamp}`,
          entry,
          scanCacheEntry,
        );
      } else {
        logCount(
          `error_timestamps_${gameid}:${apikey}_${i}_${entry.timestamp}_v_${scanCacheEntry.timestamp}`,
        );
        console.error(
          `Timestamp mismatch for ${i}: ${entry.timestamp} vs ${scanCacheEntry.timestamp}`,
          entry,
          scanCacheEntry,
        );
      }
    } else {
      //console.log(`Matching timestamps for ${entry.timestamp} index ${i}`)
    }
    if (entry.forward) {
      const nullDiff = match(entry.forward, scanCacheEntry.forward);
      if (nullDiff !== null) {
        logCount(`error_forward_${gameid}:${apikey}`);
        console.error(`Index ${i} doesn't match on forward`, {
          nullDiff,
          df: entry.forward,
          sf: scanCacheEntry.forward,
        });
      }
    }
    if (entry.back) {
      const nullDiff = match(entry.back, scanCacheEntry.back);
      if (nullDiff !== null) {
        logCount(`error_back_${gameid}:${apikey}`);
        console.error(
          `Index ${i} doesn't match on back`,
          nullDiff,
          entry.back,
          scanCacheEntry.back,
        );
      }
    }
    if (entry.cached && !skipCached) {
      let scanCachedOrComputed = scanCacheEntry.cached;
      if (scanCachedOrComputed === undefined) {
        scanCachedOrComputed = window.structuredClone(
          scanCache[apikey][0].cached,
        );
        for (let index = 0; index < i; ++index) {
          const forward = scanCache[apikey][index].forward;
          scanCachedOrComputed = patch(scanCachedOrComputed, forward);
        }
      }
      const nullDiff = match(entry.cached, scanCachedOrComputed);
      if (nullDiff !== null) {
        logCount(`error_cached_${gameid}:${apikey}`);
        console.error(
          `Index ${i} doesn't match on cached or computed `,
          nullDiff,
        );
      } else {
        console.log(`Index ${i} matches on cached!`);
      }
    }
  }
  console.log(`Validating diff cache for ${apikey}...`)
  diffCache[apikey]?.forEach((entry, i) => validateEntry(entry, i));
  console.log(`Validating diff cache for ${apikey}...completed`)
}

export function countScans(apikey: string) {
  //if (scanCache[apikey] && diffCache[apikey]) {
  //return Math.min(scanCache[apikey].length, diffCache[apikey].length);
  //}
  console.log(`Count scans for key ${apikey}`);
  if (apikey === undefined) {
    console.error("undefined key");
  }
  return scanCache[apikey]?.length || 0;
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
      tx.store.put(persist);
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
  const db = await open(dbName);
  const keys = await db.getAllKeys(dbName);
  console.log({ k0: keys[0], kl: keys.slice(-1)[0] });
  const lastKey = keys.slice(-1)[0];
  if (lastKey) return db.getFromIndex(dbName, "timestamp", lastKey);
  return undefined;
  //const all = await db.getAllFromIndex(dbName, "timestamp");
  //return all.slice(-1)[0];
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
  if (!scanCache[apikey] || scanCache[apikey].length === 0) {
    try {
      diffCache[apikey] = await restore(gameId, apikey, "diffCache");
      console.log(`Restored diff cache from db: ${diffCache[apikey]?.length}`);
      scanCache[apikey] = await restore(gameId, apikey, "scanCache");
      console.log(`Restored scan cache from db: ${scanCache[apikey].length}`);
      //validateDiffCache(gameId, apikey);
      console.log("Done restores.");
    } catch (err) {
      logCount(err);
      console.error(err);
    }
  }
}

export function registerForScans(apikey: string, notifications?: string) {
  const gameid = NeptunesPride.gameNumber;
  const store = collection(firestore, `newkey`);
  if (notifications) {
    addDoc(store, { game_id: gameid, api_key: apikey, notifications });
  } else {
    addDoc(store, { game_id: gameid, api_key: apikey });
  }
}

function trimInvalidEntries(apikey: string) {
  const len = scanCache[apikey].length;
  let trim = len - 1;
  while (trim >= 0 && makeScan(apikey, trim)?.tick === undefined) {
    trim--;
  }
  if (trim + 1 < len) {
    trim++;
    scanCache[apikey] = scanCache[apikey].slice(0, trim);
    console.log(`trimInvalidEntries: ${apikey} ${len} -> ${trim}`);
    if (trim > 0) {
      scanCache[apikey][trim - 1].eof = true;
    }
  }
}
export function unloadServerScans() {
  for (const k in scanCache) {
    delete scanCache[k];
  }
  for (const k in diffCache) {
    delete diffCache[k];
  }
}
export async function getServerScans(apikey: string) {
  if (scanCache[apikey] !== undefined) {
    console.log(`Already watching ${apikey}`);
    return;
  }
  const gameid = NeptunesPride.gameNumber;
  await restoreFromDB(gameid, apikey);
  const len = scanCache[apikey]?.length || 0;
  console.log(`Fetched ${len} entries from ${apikey}`);
  let timestamp = 0;
  if (len > 0) {
    const validEntry = (x: number) => {
      const scan = scanCache[apikey][x];
      if (x === 0)
        return (
          (scan.apis !== undefined || scan.cached !== undefined) && scan.forward
        );
      if (scan.apis || scan.error) return true;
      if (scan.cached && scan.back) return true;
      return scan.back && scan.forward;
    };
    let offset = 0;
    for (offset = 0; offset < len; ++offset) {
      if (!validEntry(offset)) {
        break;
      }
    }
    offset -= 1;
    if (offset >= 0) {
      if (offset < len - 1) {
        console.error(`Valid entries ${offset}/${len} for ${apikey}`);
        scanCache[apikey] = scanCache[apikey].slice(0, offset + 1);
      } else {
        console.log(`All valid entries ${offset}/${len} for ${apikey}`);
        if (len > 0) {
          if (scanCache[apikey][0].apis || scanCache[apikey][0].cached) {
            console.log(
              "Valid: 0th entry has an apis or cached state",
              scanCache[apikey][0],
            );
          } else {
            console.error(
              "Invalid: 0th entry missing an apis string",
              scanCache[apikey][0],
            );
          }
          console.log(`Validating ${len} entries...`);
          let apis = "";
          let cached = {};
          if (len > 0) {
            apis = scanCache[apikey][0].apis;
            cached = scanCache[apikey][0].cached;
          }
          let endOfKeyData = false;
          let end = -1;
          for (let i = 0; i < len; ++i) {
            if (i > 0) {
              scanCache[apikey][i].prev = scanCache[apikey][i - 1];
            }
            const scanExists = makeScan(apikey, i);
            if (!scanExists || scanExists?.tick === undefined) {
              if (scanCache[apikey][i].error) {
                if (!endOfKeyData) {
                  endOfKeyData = true;
                  end = i;
                  console.log(`Valid: End of ${apikey} @ ${end}`);
                }
              } else {
                console.error(
                  `Invalid: cannot find good scan data @ index ${i} for ${apikey}`,
                );
              }
            } else if (endOfKeyData) {
              console.error(
                `Invalid: found good scan data @ index ${i} for ${apikey} after endOfKeyData @ ${end}`,
              );
            }
          }
          console.log(`Validated ${len} entries for ${apikey}`);
          console.log(`Reverse validating ${apikey}...`);
          let lastTick = -1;
          let firstTick = -1;
          let last = end >= 0 ? end : len - 1;
          for (let i = last; i >= 0; --i) {
            if (i < len) {
              scanCache[apikey][i].next = scanCache[apikey][i + 1];
            }
            const scanExists = makeScan(apikey, i);
            if (!scanExists || scanExists?.tick === undefined) {
              console.error(
                `Invalid: cannot find good scan data @ index ${i} for ${apikey}`,
              );
            } else if (scanExists.tick > lastTick) {
              lastTick = scanExists.tick;
            }
            if (i === 0) {
              firstTick = scanExists?.tick;
              scanInfo[apikey] = {
                puid: scanExists.player_uid,
                firstTick: firstTick,
                lastTick: lastTick,
              };
              const check = cached !== undefined ? cached : JSON.parse(apis);
              const d = diff(check, scanExists);
              if (d !== null) {
                logCount(`error_invalidindex_${i}_${gameid}:${apikey}`);
                console.error(`Invalid: index ${i} doesn't match ${apis}`);
              } else {
                console.log(`Valid: index ${i} matches!`);
              }
            }
          }
        }
      }
      timestamp = scanCache[apikey][offset].timestamp;
    } else {
      console.error(`No valid entries found for ${apikey}`);
      scanCache[apikey] = [];
    }
  } else {
    scanCache[apikey] = [];
  }
  const computedDiffs: any[] = [];
  scanCache[apikey].forEach((scan, i) => {
    if (scan.apis) {
      parseScan(scan);
    }
    const last = i - 1;
    if (last >= 0 && scan.error === undefined && scan.back === undefined) {
      const lastCache = scanCache[apikey][last].cached;
      compressDeltas(scanCache[apikey][last], scan);
      if (lastCache !== scanCache[apikey][last].cached) {
        computedDiffs.push(scanCache[apikey][last]);
      }
    }
    if (last >= 0 && scan.prev === undefined) {
      scan.prev = scanCache[apikey][last];
      scanCache[apikey][last].next = scan;
    }
  });
  if (computedDiffs.length) {
    console.log(`Storing ${computedDiffs.length} freshly computed diffs`);
    store(computedDiffs, gameid, apikey, "scanCache");
  }
  console.log(`getServerScans: ${timestamp} ${apikey} ${len}`);
  trimInvalidEntries(apikey);
  const diffskey = `scandiffblocks/${gameid}/${apikey}`;
  const diffTimestamp = diffCache[apikey]?.slice(-1)[0]?.timestamp || 0;
  console.log(
    `Reading diff database for ${gameid}:${apikey} from time ${diffTimestamp}`,
  );
  const unsubDiffs = onSnapshot(
    query(
      collection(firestore, diffskey),
      where("last_timestamp", ">", diffTimestamp),
      orderBy("last_timestamp"),
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
        // this only works properly when validating all blocks initially
        // validateBlock(patches);
        const knownKeys: { [k: string]: boolean } = {};
        diffCache[apikey]?.forEach(
          (diff) => (knownKeys[diff.timestamp] = true),
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
            console.error(`impossible skip on missing ${mi}`)
            mi++;
            continue;
          }
          if (missing[mi] > all[ai]) {
            ai++;
            console.log(`skip all @ ${ai}`)
            continue;
          }
          console.error("not reached");
        }
        console.log(`remaining in missing: ${missing.length - mi}`)
        console.log(`remaining in all: ${all.length - ai}`)
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
            `After discarding gap-making diff len ${diffCache[apikey].length} => ${last}`,
          );
          diffCache[apikey] = diffCache[apikey].slice(0, last);
        }
        const timestamps: number[] = Object.keys(patches)
          .filter((x) => +x > latestCachedTime)
          .map((x) => +x)
          .sort();
        console.log(
          `Timestamp count ${timestamps.length} vs missing ${missing.length}`,
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
          const origLast = last;
          let holeFound = false;

          while (scanCache[apikey].length > last) {
            const nextEntry = scanCache[apikey][last + 1];
            if (timestamp <= nextEntry.timestamp) {
              break;
            }
            console.log(`last ${last} < len ${scanCache[apikey].length}`)
            console.log(`Timestamp index ${i} @ ${timestamp} after ${nextEntry.timestamp}`)
            holeFound = true;
            /*
            const forward = scanCache[apikey][last].forward;
            diffCache[apikey][last] = {
              ...diffCache[apikey][last],
              forward: forward,
            };
            const priorCache = window.structuredClone(
              diffCache[apikey][last].cached,
            );
            console.log(`Prior tick ${priorCache?.tick}`);
            const cached = patch(priorCache, forward);
            console.log(` forward tick ${cached.tick}`);
            const back = diff(cached, diffCache[apikey][last].cached);
            diffCache[apikey].push({
              cached,
              back,
              timestamp: nextEntry.timestamp,
            });
            if (last > 0) {
              diffCache[apikey][last].cached = undefined;
            }
            */
            last++;
          }
          if (holeFound) {
            console.error(`Patched hole of size ${last - origLast}`);
            logCount(`error_patch_holesize_${last - origLast}`);
          }

          let entry = { ...diffCache[apikey][last], forward };
          diffCache[apikey][last] = entry;
          const scanCacheEntry = scanCache[apikey][last];
          if (entry.timestamp !== scanCacheEntry.timestamp) {
            logCount(`error_inproc_ts_${gameid}:${apikey}`);
            console.error(
              `inproc TS mismatch for ${apikey}:${last}: ${entry.timestamp} vs ${scanCacheEntry.timestamp}`,
              entry,
              scanCacheEntry,
            );
          } else {
            //console.log(`inproc timestamp match! for ${apikey}:${last}`)
          }

          if (entry.forward) {
            //try {
            //const a = JSON.stringify(entry.forward);
            //const b = JSON.stringify(scanCacheEntry.forward);
            const nullDiff = diff(entry.forward, scanCacheEntry.forward);
            //const nullDiff = diff(a, b);
            if (nullDiff !== null) {
              logCount(`error_inproc_forward_${gameid}:${apikey}`);
              console.error(
                `inproc Index ${apikey}:${last} doesn't match on forward`,
                { df: entry.forward, sf: scanCacheEntry.forward },
              );
            } else {
              //console.log(`inproc forward match for ${apikey}:${last}`)
            }
            //} catch (err) {
            //console.log(`inproc match exeption on ${last}`)
            //}
          }
          const priorCache = window.structuredClone(
            diffCache[apikey][last].cached,
          );
          const cached = patch(priorCache, forward);
          const back = diff(cached, diffCache[apikey][last].cached);
          diffCache[apikey].push({
            cached,
            back,
            timestamp,
          });
          if (last > 0) {
            diffCache[apikey][last].cached = undefined;
          }
        });

        const incoming = diffCache[apikey].slice(
          Math.max(originalLength - 1, 0),
        );
        store(incoming, gameid, apikey, "diffCache");

        console.log("Diff update received: ", change, diffCache, scanCache);
        validateDiffCache(gameid, apikey);
      });
    },
    (error) => {
      logCount(`error_scandiffs_query_${gameid}:${apikey} ${error}`);
      console.log(`scandiffs query ${diffskey} failing: `);
      console.error(error);
    },
  );
  const gamekey = `scans/${gameid}/${gameid}:${apikey}`;
  const scans = collection(firestore, gamekey);
  return onSnapshot(
    query(scans, where("timestamp", ">", timestamp), orderBy("timestamp")),
    (querySnapshot) => {
      const incoming: any[] = [];
      querySnapshot.docChanges().forEach((change) => {
        if (
          change.type === "added" ||
          (change.type === "modified" && change.doc)
        ) {
          let doc = change.doc;
          let scan = doc.data() as any;
          parseScan(scan);
          const last = incoming.length - 1;
          incoming.push(scan);
          if (last >= 0 && scan.error === undefined) {
            compressDeltas(incoming[last], scan);
          } else if (last === -1 && scan.error === undefined) {
            const cachedLast = scanCache[apikey].length - 1;
            if (cachedLast >= 0) {
              compressDeltas(scanCache[apikey][cachedLast], scan);
              store(scanCache[apikey].slice(-1), gameid, apikey, "scanCache");
            }
          }
        }
      });
      store(incoming, gameid, apikey, "scanCache");
      console.log(`Added ${incoming.length} scans for ${gameid}:${apikey}`);
      scanCache[apikey] = scanCache[apikey].concat(incoming);
      trimInvalidEntries(apikey);
    },
    (error) => {
      logCount(`scans query ${gameid}:${apikey} failing: ${error}`);
      console.log(`scans query ${gameid}:${apikey} failing: `);
      console.error(error);
    },
  );
}

function compressDeltas(older: any, newer: any) {
  const oldScan = parseScan(older);
  const newScan = parseScan(newer);
  const pForward = diff(oldScan, newScan);
  const pBackward = diff(newScan, oldScan);
  newer.prev = older;
  older.next = newer;
  newer.back = pBackward;
  older.forward = pForward;
  if (older.back !== undefined) {
    older.cached = undefined;
  }
}
function parseScan(scan: any) {
  if (scan.cached === undefined && scan.error === undefined) {
    if (scan.apis !== undefined) {
      const parse = JSON.parse(scan.apis);
      if (parse.error) {
        scan.error = parse.error;
      }
      scan.cached = JSON.parse(scan.apis).scanning_data;
      scan.apis = undefined;
    } else {
      if (scan?.next?.cached) {
        let scanContent = scan.next.cached;
        if (scan.next.next) {
          scan.next.cached = undefined;
        } else {
          scanContent = window.structuredClone(scanContent);
        }
        if (scan.next.back === undefined) {
          logCount(`error_undefined_back__old`);
          console.error("Patching with undefined back");
        }
        scan.cached = patch(scanContent, scan.next.back);
      } else if (scan?.prev?.cached) {
        let scanContent = scan.prev.cached;
        if (scan.prev.prev) {
          scan.prev.cached = undefined;
        } else {
          scanContent = window.structuredClone(scanContent);
        }
        if (scan.prev.forward === undefined) {
          logCount(`error_undefined_forward_old`);
          console.error("Patching with undefined forward");
        }
        scan.cached = patch(scanContent, scan.prev.forward);
      } else {
        logCount(`error_multijump_old`);
        console.error("multi jump NIY");
      }
    }
  }
  if (scan.cached === undefined && scan.error === undefined) {
    console.error(`parseScans returning undefined for`, scan);
  }
  return scan.cached;
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
export function makeScan(
  apikey: string,
  index: number,
): ScanningData & { eof?: boolean } {
  const scans = scanCache[apikey];
  return parseScan(scans[index]);
  //return getScan(apikey, index);
}
export function getScan(
  apikey: string,
  index: number,
): ScanningData & { eof?: boolean } {
  const scans = scanCache[apikey];
  const oldRet = parseScan(scans[index]);
  try {
    if (diffCache[apikey]) {
      if (diffCache[apikey].length > index) {
        const newRet = walkToScan(apikey, index);
        const nullDiff = diff(oldRet, newRet);
        if (nullDiff !== null) {
          console.error(
            `getScan return values won't match ${oldRet.tick} vs ${newRet.tick}`,
            oldRet,
            newRet,
          );
          logCount(`getScan_failure_api_${apikey}`);
          if (oldRet === undefined) {
            console.error(`getScan returning newRet`);
            return newRet;
          }
        } else {
          console.log(`Success on ${apikey} @ ${index}!`);
        }
      } else {
        console.error(
          `Position ${index} is off the end of diffCache ${diffCache[apikey].length}`,
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
  return oldRet;
}

export function logError(e: any) {
  const gameid = NeptunesPride.gameNumber || NeptunesPride.gameId;
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
    addDoc(store, { gameid, stack, message, version, timestamp }).catch(e => {
      console.error(`Failed to write error for game ${gameid}`)
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
  setDoc(d, data, { merge: true }).catch(e => {
    console.error(`Error trying to increment ${key}`, {e, d, data});
  });
}
