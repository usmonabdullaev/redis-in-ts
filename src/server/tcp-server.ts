import type { ConfigManager } from '../config/index.ts';
import type { DataStore } from '../storage/data-store.ts';
import type { PersistenceManager } from '../storage/persistence.ts';
import type { PubSubManager } from '../pubsub/pubsub-manager.ts';
import { LuaEngine } from '../scripting/lua-engine.ts';
import { CommandRegistry } from '../commands/command-registry.ts';
import { ClientSession } from './client-session.ts';
import { logger } from '../utils/logger.ts';

export class TcpServer {
  private config: ConfigManager;
  private dataStore: DataStore;
  private persistence: PersistenceManager;
  private pubsub: PubSubManager;
  private luaEngine: LuaEngine = new LuaEngine();
  private commandRegistry: CommandRegistry;

  private server: any = null;
  private clients: Map<any, ClientSession> = new Map();
  private nextClientId = 1;
  private expirationSweepTimer: ReturnType<typeof setInterval> | null = null;
  private isStopping = false;

  constructor(
    config: ConfigManager,
    dataStore: DataStore,
    persistence: PersistenceManager,
    pubsub: PubSubManager
  ) {
    this.config = config;
    this.dataStore = dataStore;
    this.persistence = persistence;
    this.pubsub = pubsub;
    this.commandRegistry = new CommandRegistry();
  }

  public get connectedClientsCount(): number {
    return this.clients.size;
  }

  public start(): void {
    const port = this.config.getProperty('port');
    const host = this.config.getProperty('host');
    const maxClients = this.config.getProperty('maxClients');
    const requiresAuth = Boolean(this.config.getProperty('requirepass'));

    this.server = Bun.listen({
      hostname: host,
      port: port,
      socket: {
        open: (socket) => {
          if (this.clients.size >= maxClients) {
            logger.warn(`Max clients reached (${maxClients}), rejecting connection.`);
            socket.write('-ERR max number of clients reached\r\n');
            socket.end();
            return;
          }

          const clientId = this.nextClientId++;
          const session = new ClientSession(clientId, socket, requiresAuth);
          this.clients.set(socket, session);
          this.dataStore.totalConnectionsReceived++;
          logger.debug(`Client connected [id=${clientId}] from ${session.remoteAddress}`);
        },

        data: async (socket, data) => {
          const session = this.clients.get(socket);
          if (!session) return;

          session.lastActivity = Date.now();
          session.parser.append(data);

          // Loop while there are complete commands in the buffer
          while (true) {
            let commandArgs: string[] | null = null;
            try {
              commandArgs = session.parser.parseNext();
            } catch (err: any) {
              logger.error(`Parser error from client [id=${session.id}]:`, err);
              session.send(`-ERR Protocol error: ${err.message}\r\n`);
              session.close();
              break;
            }

            if (!commandArgs) {
              // No complete command ready yet
              break;
            }

            this.dataStore.totalCommandsProcessed++;

            const ctx = {
              client: session,
              dataStore: this.dataStore,
              currentDb: this.dataStore.getDb(session.currentDbIndex),
              persistence: this.persistence,
              config: this.config,
              pubsub: this.pubsub,
              luaEngine: this.luaEngine,
              connectedClientsCount: this.clients.size,
              registry: this.commandRegistry,
            };

            const response = await this.commandRegistry.execute(commandArgs, ctx);
            if (response && response.length > 0) {
              session.send(response);
            }
          }
        },

        close: (socket) => {
          const session = this.clients.get(socket);
          if (session) {
            this.pubsub.unsubscribeAll(session);
            this.clients.delete(socket);
            logger.debug(`Client disconnected [id=${session.id}]`);
          }
        },

        error: (socket, error) => {
          logger.error(`Socket error:`, error);
          const session = this.clients.get(socket);
          if (session) {
            this.pubsub.unsubscribeAll(session);
            this.clients.delete(socket);
          }
        },
      },
    });

    // Start background key expiration sweeper (every 100ms)
    this.expirationSweepTimer = setInterval(() => {
      this.dataStore.sweepExpiredKeys();
    }, 100);

    logger.info(`Redis Server emulation started on ${host}:${port}`);
    logger.info(`Ready to accept connections (databases: ${this.dataStore.dbCount}, maxclients: ${maxClients})`);
  }

  public async stop(): Promise<void> {
    if (this.isStopping) return;
    this.isStopping = true;

    logger.info('Shutting down Redis server...');

    if (this.expirationSweepTimer) {
      clearInterval(this.expirationSweepTimer);
      this.expirationSweepTimer = null;
    }

    // Close all client connections
    for (const session of this.clients.values()) {
      session.close();
    }
    this.clients.clear();

    // Stop Bun listener
    if (this.server) {
      this.server.stop();
      this.server = null;
    }

    // Persist data to JSON file before exit
    try {
      await this.persistence.save();
      logger.info('Database state successfully saved to JSON on shutdown.');
    } catch (err) {
      logger.error('Failed to save database during shutdown:', err);
    }
  }
}
