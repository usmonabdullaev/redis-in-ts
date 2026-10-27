import { matchGlob } from '../utils/glob.ts';
import { RespSerializer } from '../protocol/serializer.ts';

export interface ClientSubscriber {
  id: number;
  send(data: string): void;
}

export class PubSubManager {
  // channelName -> Set of subscriber clients
  private channels: Map<string, Set<ClientSubscriber>> = new Map();
  // patternString -> Set of subscriber clients
  private patterns: Map<string, Set<ClientSubscriber>> = new Map();

  public subscribe(client: ClientSubscriber, channel: string): number {
    let clients = this.channels.get(channel);
    if (!clients) {
      clients = new Set();
      this.channels.set(channel, clients);
    }
    clients.add(client);
    return this.getClientSubscriptionCount(client);
  }

  public unsubscribe(client: ClientSubscriber, channel: string): number {
    const clients = this.channels.get(channel);
    if (clients) {
      clients.delete(client);
      if (clients.size === 0) {
        this.channels.delete(channel);
      }
    }
    return this.getClientSubscriptionCount(client);
  }

  public psubscribe(client: ClientSubscriber, pattern: string): number {
    let clients = this.patterns.get(pattern);
    if (!clients) {
      clients = new Set();
      this.patterns.set(pattern, clients);
    }
    clients.add(client);
    return this.getClientSubscriptionCount(client);
  }

  public punsubscribe(client: ClientSubscriber, pattern: string): number {
    const clients = this.patterns.get(pattern);
    if (clients) {
      clients.delete(client);
      if (clients.size === 0) {
        this.patterns.delete(pattern);
      }
    }
    return this.getClientSubscriptionCount(client);
  }

  public unsubscribeAll(client: ClientSubscriber): void {
    for (const [channel, clients] of this.channels.entries()) {
      if (clients.delete(client) && clients.size === 0) {
        this.channels.delete(channel);
      }
    }
    for (const [pattern, clients] of this.patterns.entries()) {
      if (clients.delete(client) && clients.size === 0) {
        this.patterns.delete(pattern);
      }
    }
  }

  public publish(channel: string, message: string): number {
    let receiversCount = 0;
    const notifiedClients = new Set<number>();

    // Direct channel subscribers
    const directClients = this.channels.get(channel);
    if (directClients) {
      const resp = RespSerializer.array(['message', channel, message]);
      for (const client of directClients) {
        client.send(resp);
        notifiedClients.add(client.id);
        receiversCount++;
      }
    }

    // Pattern subscribers
    for (const [pattern, clients] of this.patterns.entries()) {
      if (matchGlob(pattern, channel)) {
        const resp = RespSerializer.array(['pmessage', pattern, channel, message]);
        for (const client of clients) {
          client.send(resp);
          if (!notifiedClients.has(client.id)) {
            receiversCount++;
          }
        }
      }
    }

    return receiversCount;
  }

  public getClientSubscriptionCount(client: ClientSubscriber): number {
    let count = 0;
    for (const clients of this.channels.values()) {
      if (clients.has(client)) count++;
    }
    for (const clients of this.patterns.values()) {
      if (clients.has(client)) count++;
    }
    return count;
  }
}
