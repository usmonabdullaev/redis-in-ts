import { mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import type { ConfigManager } from '../config/index.ts';
import type { DataStore } from './data-store.ts';
import type { DatabaseDump } from './types.ts';
import { logger } from '../utils/logger.ts';

export class PersistenceManager {
  private configManager: ConfigManager;
  private dataStore: DataStore;
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  public lastSaveTime: number = Math.floor(Date.now() / 1000);
  private isSaving = false;

  constructor(configManager: ConfigManager, dataStore: DataStore) {
    this.configManager = configManager;
    this.dataStore = dataStore;
  }

  public async init(): Promise<void> {
    const dataDir = this.configManager.getDataDir();
    try {
      await mkdir(dataDir, { recursive: true });
    } catch (err) {
      logger.error(`Failed to create data directory ${dataDir}:`, err);
    }

    // Load existing data if file exists
    await this.load();

    // Start auto-save if enabled
    const interval = this.configManager.getProperty('saveIntervalMs');
    if (interval > 0) {
      this.startAutoSave(interval);
    }
  }

  public async load(): Promise<boolean> {
    const filePath = this.configManager.getPathToDataFile();
    const file = Bun.file(filePath);

    const exists = await file.exists();
    if (!exists) {
      logger.info(`No existing JSON database file found at ${filePath}. Starting fresh.`);
      return false;
    }

    try {
      logger.info(`Loading database from JSON file: ${filePath}`);
      const text = await file.text();
      const dump: DatabaseDump = JSON.parse(text);

      let loadedKeys = 0;
      if (dump.databases && typeof dump.databases === 'object') {
        for (const [dbIndexStr, dbData] of Object.entries(dump.databases)) {
          const dbIndex = parseInt(dbIndexStr, 10);
          if (dbIndex >= 0 && dbIndex < this.dataStore.dbCount) {
            const db = this.dataStore.getDb(dbIndex);
            db.importData(dbData);
            loadedKeys += Object.keys(dbData).length;
          }
        }
      }

      logger.info(`DB loaded from disk: ${loadedKeys} keys loaded from ${filePath}`);
      return true;
    } catch (err) {
      logger.error(`Error loading database from JSON file (${filePath}):`, err);
      return false;
    }
  }

  public async save(): Promise<void> {
    if (this.isSaving) {
      logger.warn('Save already in progress, skipping concurrent save.');
      return;
    }

    this.isSaving = true;
    const filePath = this.configManager.getPathToDataFile();
    const tmpPath = `${filePath}.tmp`;

    try {
      await mkdir(dirname(filePath), { recursive: true });

      const dbs = this.dataStore.getAllDatabases();
      const databasesDump: Record<string, ReturnType<typeof dbs[0]['exportData']>> = {};

      for (let i = 0; i < dbs.length; i++) {
        const db = dbs[i]!;
        const exported = db.exportData();
        if (Object.keys(exported).length > 0) {
          databasesDump[i.toString()] = exported;
        }
      }

      const dump: DatabaseDump = {
        version: 1,
        savedAt: new Date().toISOString(),
        databases: databasesDump,
      };

      const jsonString = JSON.stringify(dump, null, 2);

      // Write atomically via Bun.write
      await Bun.write(tmpPath, jsonString);

      // Rename temp file to final file
      const { rename } = await import('node:fs/promises');
      await rename(tmpPath, filePath);

      this.lastSaveTime = Math.floor(Date.now() / 1000);
      logger.info(`DB saved on disk to ${filePath} (${jsonString.length} bytes)`);
    } catch (err) {
      logger.error(`Failed to save database to JSON file (${filePath}):`, err);
      throw err;
    } finally {
      this.isSaving = false;
    }
  }

  public bgSave(): Promise<void> {
    // Bun executes the asynchronous save in background
    return this.save().catch((err) => {
      logger.error('Background save error:', err);
    });
  }

  public startAutoSave(intervalMs: number): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    this.autoSaveTimer = setInterval(() => {
      this.bgSave();
    }, intervalMs);
    logger.info(`Periodic JSON persistence enabled: autosaving every ${intervalMs / 1000}s`);
  }

  public stopAutoSave(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }
}
