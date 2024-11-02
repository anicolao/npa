import { deleteDB as deleteDatabase, openDB } from "idb";

export async function deleteDB(dbName: string) {
  return deleteDatabase(dbName);
}
export async function open(dbName: string, opt_key?: string) {
  const keyPath = opt_key ? opt_key : "timestamp";
  return openDB(dbName, 1, {
    upgrade(db) {
      const store = db.createObjectStore(dbName, {
        keyPath,
      });
      store.createIndex(keyPath, keyPath, { unique: true });
    },
  });
}
