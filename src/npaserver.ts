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
import { diff, patch } from "./patch";
import { getVersion } from "./version";

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
const scanCache: { [k: string]: any[] } = {};
const diffCache: { [k: string]: any[] } = {};

export function countScans(apikey: string) {
  if (scanCache[apikey] && diffCache[apikey])
    return Math.min(scanCache[apikey].length, diffCache[apikey].length);
  return 0;
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

async function store(incoming: any[], gameId: number, apikey: string, version: "diffCache" | "scanCache") {
  const suffix = version === "diffCache" ? ":diffs" : "";
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

async function restore(gameId: number, apikey: string, version: "diffCache" | "scanCache") {
  const suffix = version === "diffCache" ? ":diffs" : "";
  const dbName = `${gameId}:${apikey}${suffix}`;
  const db = await open(dbName);
  return db.getAllFromIndex(dbName, "timestamp");
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
      scanCache[apikey] = await restore(gameId, apikey, "scanCache");
      console.log(`Restored scan cache from db: ${scanCache[apikey].length}`);
    } catch (err) {
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
  while (trim >= 0 && getScan(apikey, trim)?.tick === undefined) {
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
  const diffskey = `scandiffs/${gameid}/${apikey}`;
  const unsubDiffs = onSnapshot(
    query(
      collection(firestore, diffskey),
      where("latest", ">", timestamp * 0),
      orderBy("latest"),
    ),
    (querySnapshot) => {
      querySnapshot.docChanges().forEach((change) => {
        let doc = change.doc;
        let patches = doc.data() as any;
        const timestamps: number[] = Object.keys(patches).filter(x => +x > 0).map(x => +x).sort();
        const originalLength = diffCache[apikey] ? diffCache[apikey].length : 0;
        if (diffCache[apikey] === undefined) {
          const cached = JSON.parse(patches["initial_scan"]).scanning_data;
          diffCache[apikey] = [
            {
              cached, timestamp: cached.start_time
            }
          ];
        }
        timestamps.forEach(timestamp => {
          const forward = JSON.parse(patches[timestamp]).scanning_data;
          const last = diffCache[apikey].length - 1;
          diffCache[apikey][last] = { ...diffCache[apikey][last], forward };
          const priorCache = window.structuredClone(diffCache[apikey][last].cached);
          const cached = patch(priorCache, forward);
          const back = diff(cached, diffCache[apikey][last].cached);
          diffCache[apikey].push({
            cached, back, timestamp
          });
          if (last > 0) {
            diffCache[apikey][last].cached = undefined;
          }
        });

        const incoming = diffCache.slice()
        
        console.log("Diff update received: ", change, diffCache, scanCache);
        diffCache[apikey].forEach((entry, i) => {
          const scanCacheEntry = scanCache[apikey][i];
          if (entry.timestamp !== scanCacheEntry.timestamp) {
            console.error(`Timestamp mismatch for ${i}: ${entry.timestamp} vs ${scanCacheEntry.timestamp}`, entry, scanCacheEntry)
          }
          if (entry.forward) {
            const nullDiff = diff(entry.forward, scanCacheEntry.forward);
            if (nullDiff !== null) {
              console.error(`Index ${i} doesn't match`, nullDiff);
            }
          }
          if (entry.back) {
            const nullDiff = diff(entry.back, scanCacheEntry.back);
            if (nullDiff !== null) {
              console.error(`Index ${i} doesn't match on back`, nullDiff);
            } 
          }
          if (entry.cached) {
            const nullDiff = diff(entry.cached, scanCacheEntry.cached);
            if (nullDiff !== null) {
              console.error(`Index ${i} doesn't match on cached`, nullDiff);
            } else {
              console.error(`Index ${i} matches on cached!`);
            }
          }
        })
      });
    },
    (error) => {
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
          console.error("Patching with undefined forward");
        }
        scan.cached = patch(scanContent, scan.prev.forward);
      } else {
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
export function makeScan(apikey: string, index: number): ScanningData & { eof?: boolean } {
  const scans = scanCache[apikey];
  //return parseScan(scans[index]);
  return getScan(apikey, index);
}
export function getScan(apikey: string, index: number): ScanningData & { eof?: boolean } {
  const scans = scanCache[apikey];
  const oldRet = parseScan(scans[index]);
  try {
    if (diffCache[apikey]) {
      const newRet = walkToScan(apikey, index);
      const nullDiff = diff(oldRet, newRet);
      if (nullDiff !== null) {
        console.error(`getScan return values won't match `, oldRet, newRet);
        logCount(`getScan_failure_api_${apikey}`)
      } else {
        console.log(`Success on ${apikey} @ ${index}!`)
      }
    } else {
      console.error(`No diffcache yet fetching ${apikey} @ ${index}`)
    }
  } catch (err) {
    console.error(err);
    logCount(err);
  }
  return oldRet;
}

export function logError(e: any) {
  const gameid = NeptunesPride.gameNumber;
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
    addDoc(store, { gameid, stack, message, version, timestamp });
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
  setDoc(d, data, { merge: true });
}
