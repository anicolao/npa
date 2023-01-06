import { openDB } from "idb";

export class GameStore {
  dbPromise;
  storename: string;

  constructor(storename: string) {
    this.storename = storename;
    this.dbPromise = openDB(storename, 1, {
      upgrade(db) {
        db.createObjectStore(storename);
      },
    });
  }

  async get(key: string) {
    return (await this.dbPromise).get(this.storename, key);
  }
  async set(key: string, val: any) {
    console.log({ key, val });
    return (await this.dbPromise).put(this.storename, val, key);
  }
  async del(key: string) {
    return (await this.dbPromise).delete(this.storename, key);
  }
  async clear() {
    return (await this.dbPromise).clear(this.storename);
  }
  async keys() {
    return (await this.dbPromise).getAllKeys(this.storename);
  }
}
