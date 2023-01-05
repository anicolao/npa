import { openDB } from "idb";

const dbPromise = openDB("kv-store", 1, {
  upgrade(db) {
    db.createObjectStore(NeptunesPride.gameNumber);
  },
});

export async function get(key: string) {
  return (await dbPromise).get(NeptunesPride.gameNumber, key);
}
export async function set(key: string, val: any) {
  console.log({ key, val });
  return (await dbPromise).put(NeptunesPride.gameNumber, val, key);
}
export async function del(key: string) {
  return (await dbPromise).delete(NeptunesPride.gameNumber, key);
}
export async function clear() {
  return (await dbPromise).clear(NeptunesPride.gameNumber);
}
export async function keys() {
  return (await dbPromise).getAllKeys(NeptunesPride.gameNumber);
}
