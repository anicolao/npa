import { type IDBPDatabase, openDB } from "idb";

// Operations must be safe to retry once (get/put/delete/clear, not add).
export class DatabaseConnection {
  private connection?: Promise<IDBPDatabase>;

  constructor(
    private name: string,
    private upgrade: (db: IDBPDatabase) => void,
  ) {}

  private connect() {
    if (!this.connection) {
      const connection = openDB(this.name, 1, {
        upgrade: this.upgrade,
        blocking: () => {
          this.invalidate(connection);
        },
        terminated: () => {
          this.invalidate(connection);
        },
      });
      this.connection = connection;
      void connection.catch(() => {
        if (this.connection === connection) this.connection = undefined;
      });
    }
    return this.connection;
  }

  private invalidate(connection: Promise<IDBPDatabase>) {
    if (this.connection === connection) this.connection = undefined;
    void connection.then((db) => db.close()).catch(() => {});
  }

  async run<T>(operation: (db: IDBPDatabase) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      const connection = this.connect();
      try {
        return await operation(await connection);
      } catch (error) {
        if (error?.name !== "InvalidStateError") throw error;
        this.invalidate(connection);
        if (attempt > 0) throw error;
      }
    }
  }
}

export function scanDatabase(dbName: string) {
  return new DatabaseConnection(dbName, (db) => {
    const store = db.createObjectStore(dbName, {
      keyPath: "initial_timestamp",
    });
    store.createIndex("initial_timestamp", "initial_timestamp", {
      unique: true,
    });
  });
}
