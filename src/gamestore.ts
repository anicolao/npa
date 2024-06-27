import { openDB } from "idb";

export interface TypedProperty {
  name: string;
  displayName: string;
  type: string;
  allowableValues?: any[];
}
export class GameStore {
  dbPromise;
  storename: string;
  properties: TypedProperty[] = [];

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

  newSetting<L extends string, T>(
    displayName: string,
    name: L,
    defaultValue: T,
    allowableValues?: T[],
  ): asserts this is GameStore & Record<L, T> {
    let _cached: T | null = null;
    this.get(name).then((v) => {
      if (v !== undefined) _cached = v;
      else _cached = defaultValue;
    });
    const propDesc = {
      get: (): T => {
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
    this.properties.push({
      name,
      displayName,
      type: typeof defaultValue,
      allowableValues,
    });
  }

  getProperties(): TypedProperty[] {
    return this.properties;
  }
}
