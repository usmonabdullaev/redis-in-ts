import type { ConfigManager } from '../config/index.ts';
import type { DataStore } from '../storage/data-store.ts';
import type { MemoryStore } from '../storage/memory-store.ts';
import type { PersistenceManager } from '../storage/persistence.ts';
import type { PubSubManager } from '../pubsub/pubsub-manager.ts';
import type { ClientSession } from '../server/client-session.ts';

export interface CommandContext {
  client: ClientSession;
  dataStore: DataStore;
  currentDb: MemoryStore;
  persistence: PersistenceManager;
  config: ConfigManager;
  pubsub: PubSubManager;
  connectedClientsCount: number;
}

export type CommandHandler = (
  args: string[],
  ctx: CommandContext
) => Promise<string | void> | string | void;

export interface CommandDefinition {
  name: string;
  minArgs?: number;
  maxArgs?: number;
  handler: CommandHandler;
  requiresAuth?: boolean;
  allowedInSubscribed?: boolean;
  description?: string;
}
