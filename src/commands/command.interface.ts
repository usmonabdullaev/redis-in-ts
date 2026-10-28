import type { ConfigManager } from '../config/index.ts';
import type { DataStore } from '../storage/data-store.ts';
import type { MemoryStore } from '../storage/memory-store.ts';
import type { PersistenceManager } from '../storage/persistence.ts';
import type { PubSubManager } from '../pubsub/pubsub-manager.ts';
import type { ClientSession } from '../server/client-session.ts';
import type { LuaEngine } from '../scripting/lua-engine.ts';
import type { CommandRegistry } from './command-registry.ts';

export interface CommandContext {
  client: ClientSession;
  dataStore: DataStore;
  currentDb: MemoryStore;
  persistence: PersistenceManager;
  config: ConfigManager;
  pubsub: PubSubManager;
  luaEngine: LuaEngine;
  connectedClientsCount: number;
  registry?: CommandRegistry;
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
