import { initializeApp } from "firebase/app";
import {
  addDoc,
  collection,
  doc,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { openDB } from "idb";

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

function moveData() {
  const db = firestore;
  const query = collection(db, "private/metadata/active");
  let grandTotal = 0;
  onSnapshot(query, function (snapshot) {
    snapshot.docChanges().forEach(function (change) {
      const key = change.doc.data();
      console.log(`Processing game ${key.game_id} ${key.api_key}`);
      const game = key.game_id;
      const apiKey = key.api_key;
      const query = collection(db, `${game}:${apiKey}`);
      const store = collection(db, `scans/${game}/${game}:${apiKey}`);
      onSnapshot(query, function (snapshot) {
        let count = 0;
        const batch = writeBatch(db);
        console.log(`Read ${snapshot.docChanges().length} records`);
        snapshot.docChanges().forEach(function (change) {
          const d = change.doc.data();
          if (d.timestamp) {
            //batch.set(doc(store, `${d.timestamp}`), d);
            setDoc(doc(store, `${d.timestamp}`), d);
            count++;
            console.log(`commit ${count}`);
          } else {
            console.log(`rejected ${JSON.stringify(d)}`);
          }
        });
        console.log(`committed ${count} total`);
        grandTotal += count;
        batch.commit();
      });
    });
    console.log(`wrote ${grandTotal} records.`);
  });
}

export function registerForScans(apikey: string) {
  const gameid = NeptunesPride.gameNumber;
  const store = collection(firestore, `newkey`);
  addDoc(store, { game_id: gameid, api_key: apikey });
}

export async function getServerScans(apikey: string) {
  const gameid = NeptunesPride.gameNumber;
  await restoreFromDB(gameid, apikey);
  const len = scanCache[apikey]?.length || 0;
  console.log(`Fetched ${len} entries from ${apikey}`);
  let timestamp = 0;
  if (len > 0) {
    timestamp = scanCache[apikey][len - 1].timestamp;
  } else {
    scanCache[apikey] = [];
  }
  console.log(`getServerScans: ${timestamp} ${apikey}`);
  const gamekey = `scans/${gameid}/${gameid}:${apikey}`;
  const scans = collection(firestore, gamekey);
  /* OWN the server 
  //moveData();
  onSnapshot(collection(firestore, "active"), (querySnapshot) => {
    querySnapshot.docChanges().forEach((change) => {
      if (
        change.type === "added" ||
        (change.type === "modified" && change.doc)
      ) {
        let doc = change.doc;
        let scan = doc.data() as any;
        console.log(doc.id);
        console.log(scan);
      }
    });
  });
  */
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
          incoming.push(scan);
        }
      });
      store(incoming, gameid, apikey);
      console.log(`Added ${incoming.length} scans`);
      scanCache[apikey] = scanCache[apikey].concat(incoming);
    },
    (error) => {
      console.log("scans query failing: ");
      console.error(error);
    },
  );
}
