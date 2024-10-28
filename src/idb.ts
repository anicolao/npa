import { openDB } from "idb";

export async function open(dbName: string) {
  return openDB(dbName, 1, {
    upgrade(db) {
      const store = db.createObjectStore(dbName, {
        keyPath: "timestamp",
      });
      store.createIndex("timestamp", "timestamp", { unique: true });
    },
  });
}
