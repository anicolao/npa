import { DatabaseConnection } from "./idb";

export interface TypedProperty {
  name: string;
  displayName: string;
  type: string;
  allowableValues?: any[];
}
export class GameStore {
  private database: DatabaseConnection;
  storename: string;
  properties: TypedProperty[] = [];

  constructor(storename: string) {
    this.storename = storename;
    this.database = new DatabaseConnection(storename, (db) => {
      db.createObjectStore(storename);
    });
  }

  async get(key: string) {
    return this.database.run((db) => db.get(this.storename, key));
  }
  async set(key: string, val: any) {
    return this.database.run((db) => db.put(this.storename, val, key));
  }
  async del(key: string) {
    return this.database.run((db) => db.delete(this.storename, key));
  }
  async clear() {
    return this.database.run((db) => db.clear(this.storename));
  }
  async keys() {
    return this.database.run((db) => db.getAllKeys(this.storename));
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
