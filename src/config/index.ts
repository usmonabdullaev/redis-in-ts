import type { LogLevel } from '../utils/logger.ts';
import { resolve } from 'node:path';

export interface ServerConfig {
  host: string;
  port: number;
  requirepass: string | null;
  databases: number;
  dataDir: string;
  dataFile: string;
  saveIntervalMs: number;
  maxClients: number;
  timeout: number; // in seconds, 0 means no timeout
  logLevel: LogLevel;
}

export const DEFAULT_CONFIG: ServerConfig = {
  host: '0.0.0.0',
  port: 6379,
  requirepass: null,
  databases: 16,
  dataDir: './data',
  dataFile: 'dump.json',
  saveIntervalMs: 15000, // Autosave every 15 seconds
  maxClients: 10000,
  timeout: 0,
  logLevel: 'info',
};

export class ConfigManager {
  private config: ServerConfig;

  constructor(initialConfig: Partial<ServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...initialConfig };
  }

  public get(): ServerConfig {
    return { ...this.config };
  }

  public getPathToDataFile(): string {
    return resolve(process.cwd(), this.config.dataDir, this.config.dataFile);
  }

  public getDataDir(): string {
    return resolve(process.cwd(), this.config.dataDir);
  }

  public getProperty<K extends keyof ServerConfig>(key: K): ServerConfig[K] {
    return this.config[key];
  }

  public setProperty(key: string, value: string): boolean {
    const k = key.toLowerCase();
    switch (k) {
      case 'requirepass':
        this.config.requirepass = value === '' ? null : value;
        return true;
      case 'timeout':
        this.config.timeout = parseInt(value, 10) || 0;
        return true;
      case 'saveintervalms':
      case 'save-interval':
        this.config.saveIntervalMs = parseInt(value, 10) || 0;
        return true;
      case 'maxclients':
        this.config.maxClients = parseInt(value, 10) || 10000;
        return true;
      case 'loglevel':
        if (['debug', 'info', 'warn', 'error', 'silent'].includes(value)) {
          this.config.logLevel = value as LogLevel;
          return true;
        }
        return false;
      default:
        return false;
    }
  }

  public getAllConfigPairs(): [string, string][] {
    return [
      ['bind', this.config.host],
      ['port', this.config.port.toString()],
      ['requirepass', this.config.requirepass || ''],
      ['databases', this.config.databases.toString()],
      ['dir', this.config.dataDir],
      ['dbfilename', this.config.dataFile],
      ['save', `${this.config.saveIntervalMs} 1`],
      ['maxclients', this.config.maxClients.toString()],
      ['timeout', this.config.timeout.toString()],
      ['loglevel', this.config.logLevel],
    ];
  }

  public static fromEnvironmentAndArgs(): ConfigManager {
    const env = process.env;
    const args = process.argv.slice(2);

    const config: Partial<ServerConfig> = {};

    // Read environment variables
    if (env.REDIS_HOST) config.host = env.REDIS_HOST;
    if (env.REDIS_PORT) config.port = parseInt(env.REDIS_PORT, 10);
    if (env.REDIS_PASSWORD) config.requirepass = env.REDIS_PASSWORD;
    if (env.REDIS_DATADIR) config.dataDir = env.REDIS_DATADIR;
    if (env.REDIS_DATAFILE) config.dataFile = env.REDIS_DATAFILE;
    if (env.REDIS_SAVE_INTERVAL) config.saveIntervalMs = parseInt(env.REDIS_SAVE_INTERVAL, 10);
    if (env.REDIS_LOG_LEVEL) config.logLevel = env.REDIS_LOG_LEVEL as LogLevel;

    // Read command line arguments: e.g. --port 6380 or -p 6380
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const next = args[i + 1];

      if ((arg === '--port' || arg === '-p') && next) {
        config.port = parseInt(next, 10);
        i++;
      } else if ((arg === '--host' || arg === '-h') && next) {
        config.host = next;
        i++;
      } else if (arg === '--requirepass' && next) {
        config.requirepass = next;
        i++;
      } else if (arg === '--data-dir' && next) {
        config.dataDir = next;
        i++;
      } else if (arg === '--data-file' && next) {
        config.dataFile = next;
        i++;
      } else if (arg === '--save-interval' && next) {
        config.saveIntervalMs = parseInt(next, 10);
        i++;
      } else if (arg === '--log-level' && next) {
        config.logLevel = next as LogLevel;
        i++;
      }
    }

    return new ConfigManager(config);
  }
}
