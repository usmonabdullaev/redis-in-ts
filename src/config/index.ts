import type { LogLevel } from '../utils/logger.ts';
import { resolve } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';

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

export type ConfigChangeListener = (key: string, value: unknown, oldConfig: ServerConfig) => void;

export class ConfigManager {
  private config: ServerConfig;
  public configFilePath: string | null = null;
  private changeListeners: ConfigChangeListener[] = [];

  constructor(initialConfig: Partial<ServerConfig> = {}, configFilePath: string | null = null) {
    this.config = { ...DEFAULT_CONFIG, ...initialConfig };
    this.configFilePath = configFilePath;
  }

  public onChange(listener: ConfigChangeListener): void {
    this.changeListeners.push(listener);
  }

  private emitChange(key: string, value: unknown, oldConfig: ServerConfig): void {
    for (const listener of this.changeListeners) {
      try {
        listener(key, value, oldConfig);
      } catch (err) {
        console.error('Error in config change listener:', err);
      }
    }
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
    const oldConfig = { ...this.config };
    let changed = false;

    switch (k) {
      case 'requirepass':
        this.config.requirepass = value === '' || value === '""' ? null : value;
        changed = true;
        break;
      case 'port': {
        const port = parseInt(value, 10);
        if (!isNaN(port) && port > 0 && port <= 65535) {
          this.config.port = port;
          changed = true;
        } else {
          return false;
        }
        break;
      }
      case 'bind':
      case 'host':
        this.config.host = value;
        changed = true;
        break;
      case 'databases': {
        const dbs = parseInt(value, 10);
        if (!isNaN(dbs) && dbs > 0) {
          this.config.databases = dbs;
          changed = true;
        } else {
          return false;
        }
        break;
      }
      case 'dir':
      case 'datadir':
      case 'data-dir':
        this.config.dataDir = value;
        changed = true;
        break;
      case 'dbfilename':
      case 'datafile':
      case 'data-file':
        this.config.dataFile = value;
        changed = true;
        break;
      case 'timeout':
        this.config.timeout = parseInt(value, 10) || 0;
        changed = true;
        break;
      case 'save': {
        // Redis format: save "900 1" or save ""
        if (value.trim() === '' || value.trim() === '""') {
          this.config.saveIntervalMs = 0; // disable
        } else {
          const parts = value.trim().split(/\s+/);
          const seconds = parseInt(parts[0]!, 10);
          if (!isNaN(seconds)) {
            this.config.saveIntervalMs = seconds * 1000;
          }
        }
        changed = true;
        break;
      }
      case 'saveintervalms':
      case 'save-interval':
        this.config.saveIntervalMs = parseInt(value, 10) || 0;
        changed = true;
        break;
      case 'maxclients':
        this.config.maxClients = parseInt(value, 10) || 10000;
        changed = true;
        break;
      case 'loglevel':
        if (['debug', 'info', 'warn', 'error', 'silent'].includes(value)) {
          this.config.logLevel = value as LogLevel;
          changed = true;
        } else {
          return false;
        }
        break;
      default:
        return false;
    }

    if (changed) {
      this.emitChange(k, (this.config as any)[k] ?? value, oldConfig);
      return true;
    }
    return false;
  }

  public getAllConfigPairs(): [string, string][] {
    return [
      ['bind', this.config.host],
      ['port', this.config.port.toString()],
      ['requirepass', this.config.requirepass || ''],
      ['databases', this.config.databases.toString()],
      ['dir', this.config.dataDir],
      ['dbfilename', this.config.dataFile],
      ['save', this.config.saveIntervalMs > 0 ? `${Math.floor(this.config.saveIntervalMs / 1000)} 1` : ''],
      ['save-interval', this.config.saveIntervalMs.toString()],
      ['maxclients', this.config.maxClients.toString()],
      ['timeout', this.config.timeout.toString()],
      ['loglevel', this.config.logLevel],
    ];
  }

  public async rewriteConfig(): Promise<string> {
    const targetFile = this.configFilePath || resolve(process.cwd(), 'redis.conf');
    const content = [
      '# Redis Configuration File (Rewritten dynamically)',
      `bind ${this.config.host}`,
      `port ${this.config.port}`,
      `requirepass ${this.config.requirepass ? `"${this.config.requirepass}"` : '""'}`,
      `databases ${this.config.databases}`,
      `dir "${this.config.dataDir}"`,
      `dbfilename "${this.config.dataFile}"`,
      `save ${this.config.saveIntervalMs > 0 ? `${Math.floor(this.config.saveIntervalMs / 1000)} 1` : '""'}`,
      `maxclients ${this.config.maxClients}`,
      `timeout ${this.config.timeout}`,
      `loglevel ${this.config.logLevel}`,
      '',
    ].join('\n');

    await Bun.write(targetFile, content);
    this.configFilePath = targetFile;
    return targetFile;
  }

  public static parseConfigFile(filePath: string): Partial<ServerConfig> {
    const absPath = resolve(process.cwd(), filePath);
    if (!existsSync(absPath)) return {};

    const content = readFileSync(absPath, 'utf8');

    if (filePath.endsWith('.json')) {
      try {
        return JSON.parse(content);
      } catch {
        return {};
      }
    }

    // Standard redis.conf parser
    const parsed: Partial<ServerConfig> = {};
    const lines = content.split('\n');

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const [key, ...rest] = line.split(/\s+/);
      if (!key) continue;
      const rawVal = rest.join(' ').replace(/^["']|["']$/g, '');

      switch (key.toLowerCase()) {
        case 'bind':
          parsed.host = rawVal;
          break;
        case 'port':
          parsed.port = parseInt(rawVal, 10);
          break;
        case 'requirepass':
          parsed.requirepass = rawVal === '' ? null : rawVal;
          break;
        case 'databases':
          parsed.databases = parseInt(rawVal, 10);
          break;
        case 'dir':
          parsed.dataDir = rawVal;
          break;
        case 'dbfilename':
          parsed.dataFile = rawVal;
          break;
        case 'save': {
          if (rawVal === '""' || rawVal === '') {
            parsed.saveIntervalMs = 0;
          } else {
            const parts = rawVal.split(/\s+/);
            const sec = parseInt(parts[0]!, 10);
            if (!isNaN(sec)) parsed.saveIntervalMs = sec * 1000;
          }
          break;
        }
        case 'maxclients':
          parsed.maxClients = parseInt(rawVal, 10);
          break;
        case 'timeout':
          parsed.timeout = parseInt(rawVal, 10);
          break;
        case 'loglevel':
          if (['debug', 'info', 'warn', 'error', 'silent'].includes(rawVal)) {
            parsed.logLevel = rawVal as LogLevel;
          }
          break;
      }
    }

    return parsed;
  }

  public static fromEnvironmentAndArgs(): ConfigManager {
    const env = process.env;
    const args = process.argv.slice(2);

    let configFilePath: string | null = null;
    let fileConfig: Partial<ServerConfig> = {};

    // 1. Check if config file was specified via CLI: --config redis.conf or -c redis.conf
    for (let i = 0; i < args.length; i++) {
      if ((args[i] === '--config' || args[i] === '-c') && args[i + 1]) {
        configFilePath = args[i + 1]!;
        fileConfig = ConfigManager.parseConfigFile(configFilePath);
        break;
      }
    }

    // If not specified via CLI, check default redis.conf in cwd
    if (!configFilePath && existsSync(resolve(process.cwd(), 'redis.conf'))) {
      configFilePath = resolve(process.cwd(), 'redis.conf');
      fileConfig = ConfigManager.parseConfigFile(configFilePath);
    }

    const config: Partial<ServerConfig> = { ...fileConfig };

    // 2. Read environment variables (overrides config file)
    if (env.REDIS_HOST) config.host = env.REDIS_HOST;
    if (env.REDIS_PORT) config.port = parseInt(env.REDIS_PORT, 10);
    if (env.REDIS_PASSWORD) config.requirepass = env.REDIS_PASSWORD;
    if (env.REDIS_DATABASES) config.databases = parseInt(env.REDIS_DATABASES, 10);
    if (env.REDIS_DATADIR) config.dataDir = env.REDIS_DATADIR;
    if (env.REDIS_DATAFILE) config.dataFile = env.REDIS_DATAFILE;
    if (env.REDIS_SAVE_INTERVAL) config.saveIntervalMs = parseInt(env.REDIS_SAVE_INTERVAL, 10);
    if (env.REDIS_MAX_CLIENTS) config.maxClients = parseInt(env.REDIS_MAX_CLIENTS, 10);
    if (env.REDIS_TIMEOUT) config.timeout = parseInt(env.REDIS_TIMEOUT, 10);
    if (env.REDIS_LOG_LEVEL) config.logLevel = env.REDIS_LOG_LEVEL as LogLevel;

    // 3. Read command line arguments (highest priority)
    for (let i = 0; i < args.length; i++) {
      const arg = args[i];
      const next = args[i + 1];

      if ((arg === '--port' || arg === '-p') && next) {
        config.port = parseInt(next, 10);
        i++;
      } else if ((arg === '--host' || arg === '-h') && next) {
        config.host = next;
        i++;
      } else if ((arg === '--requirepass' || arg === '-a' || arg === '--password') && next) {
        config.requirepass = next;
        i++;
      } else if ((arg === '--databases' || arg === '-db') && next) {
        config.databases = parseInt(next, 10);
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
      } else if (arg === '--maxclients' && next) {
        config.maxClients = parseInt(next, 10);
        i++;
      } else if (arg === '--timeout' && next) {
        config.timeout = parseInt(next, 10);
        i++;
      } else if (arg === '--log-level' && next) {
        config.logLevel = next as LogLevel;
        i++;
      }
    }

    return new ConfigManager(config, configFilePath);
  }
}
