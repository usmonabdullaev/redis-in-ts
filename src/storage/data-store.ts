import { MemoryStore } from './memory-store.ts';

export class DataStore {
  private databases: MemoryStore[] = [];
  public readonly dbCount: number;
  public readonly startTime: number;
  public totalCommandsProcessed = 0;
  public totalConnectionsReceived = 0;

  constructor(dbCount = 16) {
    this.dbCount = dbCount;
    this.startTime = Math.floor(Date.now() / 1000);
    for (let i = 0; i < dbCount; i++) {
      this.databases.push(new MemoryStore(i));
    }
  }

  public getDb(index: number): MemoryStore {
    if (index < 0 || index >= this.dbCount) {
      throw new Error(`ERR DB index is out of range (0..${this.dbCount - 1})`);
    }
    return this.databases[index]!;
  }

  public getAllDatabases(): MemoryStore[] {
    return this.databases;
  }

  public flushAll(): void {
    for (const db of this.databases) {
      db.flush();
    }
  }

  public sweepExpiredKeys(): number {
    let totalCleaned = 0;
    for (const db of this.databases) {
      totalCleaned += db.sweepExpiredKeys();
    }
    return totalCleaned;
  }

  public getTotalKeysCount(): number {
    return this.databases.reduce((sum, db) => sum + db.dbsize(), 0);
  }
}
