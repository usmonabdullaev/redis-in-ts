export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  silent: 100,
};

export class Logger {
  private level: LogLevel;

  constructor(level: LogLevel = 'info') {
    this.level = level;
  }

  public setLevel(level: LogLevel): void {
    this.level = level;
  }

  public getLevel(): LogLevel {
    return this.level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.level];
  }

  private formatMessage(level: string, message: string): string {
    const time = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const pid = process.pid;
    return `[${pid}] ${time} * ${message}`;
  }

  public debug(message: string, ...args: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.debug(`\x1b[90m${this.formatMessage('DEBUG', message)}\x1b[0m`, ...args);
    }
  }

  public info(message: string, ...args: unknown[]): void {
    if (this.shouldLog('info')) {
      console.log(`\x1b[32m${this.formatMessage('INFO', message)}\x1b[0m`, ...args);
    }
  }

  public warn(message: string, ...args: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`\x1b[33m${this.formatMessage('WARN', message)}\x1b[0m`, ...args);
    }
  }

  public error(message: string, ...args: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(`\x1b[31m${this.formatMessage('ERROR', message)}\x1b[0m`, ...args);
    }
  }
}

export const logger = new Logger('info');
