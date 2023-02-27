import { initializeApp } from "firebase/app";
import {
  addDoc,
  collection,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { openDB } from "idb";
import { type ScanningData } from "./galaxy";
import { diff2 as diff, patch2 as patch } from "./patch";

export const scanCache: { [k: string]: any[] } = {};

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

async function store(incoming: any[], gameId: number, apikey: string) {
  const dbName = `${gameId}:${apikey}`;
  const db = await open(dbName);

  const tx = db.transaction(dbName, "readwrite");
  await Promise.all([...incoming.map((x) => tx.store.put(x)), tx.done]);
}

async function restore(gameId: number, apikey: string) {
  const dbName = `${gameId}:${apikey}`;
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
const firestore = getFirestore();

export async function restoreFromDB(gameId: number, apikey: string) {
  if (!scanCache[apikey] || scanCache[apikey].length === 0) {
    try {
      scanCache[apikey] = await restore(gameId, apikey);
      console.log(`Restored scan cache from db: ${scanCache[apikey].length}`);
    } catch (err) {
      console.error(err);
    }
  }
}

export function registerForScans(apikey: string) {
  const gameid = NeptunesPride.gameNumber;
  const store = collection(firestore, `newkey`);
  addDoc(store, { game_id: gameid, api_key: apikey });
}

function trimInvalidEntries(apikey: string) {
  const len = scanCache[apikey].length;
  let trim = len - 1;
  while (trim >= 0 && getScan(scanCache[apikey], trim)?.tick === undefined) {
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
  scanCache[apikey].forEach((scan, i) => {
    parseScan(scan);
    const last = i - 1;
    if (last >= 0 && scan.error === undefined) {
      compressDeltas(scanCache[apikey][last], scan);
    }
  });
  let timestamp = 0;
  if (len > 0) {
    timestamp = scanCache[apikey][len - 1].timestamp;
  } else {
    scanCache[apikey] = [];
  }
  console.log(`getServerScans: ${timestamp} ${apikey} ${len}`);
  trimInvalidEntries(apikey);
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
          }
        }
      });
      store(incoming, gameid, apikey);
      console.log(`Added ${incoming.length} scans for ${gameid}:${apikey}`);
      scanCache[apikey] = scanCache[apikey].concat(incoming);
      trimInvalidEntries(apikey);
    },
    (error) => {
      console.log("scans query failing: ");
      console.error(error);
    },
  );
}

let count = 0;
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
        scan.cached = patch(scanContent, scan.next.back);
      } else if (scan?.prev?.cached) {
        let scanContent = scan.prev.cached;
        if (scan.prev.prev) {
          scan.prev.cached = undefined;
        } else {
          scanContent = window.structuredClone(scanContent);
        }
        scan.cached = patch(scanContent, scan.prev.forward);
      } else {
        console.error("multi jump NIY");
      }
    }
  }
  return scan.cached;
}
export function getScan(scans: any[], index: number): ScanningData {
  return parseScan(scans[index]);
}
