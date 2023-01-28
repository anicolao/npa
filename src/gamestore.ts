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
    console.log("GameStore.get", { key });
    return (await this.dbPromise).get(this.storename, key).then((v) => {
      console.log("GameStore.get resolved", { key, v });
      return v;
    });
  }
  async set(key: string, val: any) {
    console.log("GameStore.set", { key, val });
    return (await this.dbPromise).put(this.storename, val, key);
  }
  async del(key: string) {
    console.log("GameStore.del", { key });
    return (await this.dbPromise).delete(this.storename, key);
  }
  async clear() {
    return (await this.dbPromise).clear(this.storename);
  }
  async keys() {
    return (await this.dbPromise).getAllKeys(this.storename);
  }

  newSetting<T>(
    name: string,
    defaultValue: T,
  ): asserts this is GameStore & Record<string, T> {
    let _cached: T | null = null;
    this.get(name).then((v) => {
      if (v !== undefined) _cached = v;
      else _cached = defaultValue;
    });
    const propDesc = {
      get: function (): T {
        if (_cached === null) {
          console.error(`Getter retuning ${_cached} for ${name}`);
        }
        return _cached;
      },
      set: function (value: T) {
        _cached = value;
        this.set(name, value);
        return _cached;
      },
    };
    Object.defineProperty(this, name, propDesc);
  }
}
