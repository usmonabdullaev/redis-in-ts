import { RespParser } from '../protocol/parser.ts';
import type { ClientSubscriber } from '../pubsub/pubsub-manager.ts';

export class ClientSession implements ClientSubscriber {
  public readonly id: number;
  public readonly socket: any;
  public readonly parser: RespParser;
  public authenticated: boolean;
  public currentDbIndex: number = 0;
  public name: string | null = null;
  public subscriptions: Set<string> = new Set();
  public patternSubscriptions: Set<string> = new Set();
  public readonly connectedAt: number;
  public lastActivity: number;
  public isClosed = false;

  constructor(id: number, socket: any, requiresAuth: boolean) {
    this.id = id;
    this.socket = socket;
    this.parser = new RespParser();
    this.authenticated = !requiresAuth;
    this.connectedAt = Date.now();
    this.lastActivity = Date.now();
  }

  public get isSubscribed(): boolean {
    return this.subscriptions.size > 0 || this.patternSubscriptions.size > 0;
  }

  public get remoteAddress(): string {
    return this.socket.remoteAddress || '127.0.0.1';
  }

  public send(data: string): void {
    if (this.isClosed) return;
    try {
      this.socket.write(data);
    } catch {
      this.isClosed = true;
    }
  }

  public close(): void {
    if (this.isClosed) return;
    this.isClosed = true;
    try {
      this.socket.end();
    } catch {
      // socket already closed
    }
  }
}
