import { RespSerializer } from '../../protocol/serializer.ts';
import type { CommandDefinition } from '../command.interface.ts';

export const serverCommands: CommandDefinition[] = [
  {
    name: 'INFO',
    minArgs: 0,
    maxArgs: 1,
    handler: (_args, ctx) => {
      const uptime = Math.floor(Date.now() / 1000) - ctx.dataStore.startTime;
      const mem = process.memoryUsage();

      const sections = [
        '# Server',
        'redis_version:7.2.0',
        'redis_mode:standalone',
        `os:${process.platform}`,
        `process_id:${process.pid}`,
        `tcp_port:${ctx.config.getProperty('port')}`,
        `uptime_in_seconds:${uptime}`,
        `uptime_in_days:${Math.floor(uptime / 86400)}`,
        '',
        '# Clients',
        `connected_clients:${ctx.connectedClientsCount}`,
        `maxclients:${ctx.config.getProperty('maxClients')}`,
        '',
        '# Memory',
        `used_memory:${mem.rss}`,
        `used_memory_human:${(mem.rss / 1024 / 1024).toFixed(2)}M`,
        `used_memory_rss:${mem.rss}`,
        `used_memory_heap:${mem.heapUsed}`,
        '',
        '# Persistence',
        'loading:0',
        `rdb_last_save_time:${ctx.persistence.lastSaveTime}`,
        'rdb_last_bgsave_status:ok',
        `persistence_type:json`,
        `data_directory:${ctx.config.getDataDir()}`,
        `data_file:${ctx.config.getProperty('dataFile')}`,
        '',
        '# Stats',
        `total_connections_received:${ctx.dataStore.totalConnectionsReceived}`,
        `total_commands_processed:${ctx.dataStore.totalCommandsProcessed}`,
        '',
        '# Keyspace',
      ];

      for (const db of ctx.dataStore.getAllDatabases()) {
        const size = db.dbsize();
        if (size > 0) {
          sections.push(`db${db.id}:keys=${size},expires=0,avg_ttl=0`);
        }
      }

      const infoText = sections.join('\r\n') + '\r\n';
      return RespSerializer.bulkString(infoText);
    },
  },
  {
    name: 'TIME',
    minArgs: 0,
    maxArgs: 0,
    handler: () => {
      const now = Date.now();
      const sec = Math.floor(now / 1000);
      const micro = (now % 1000) * 1000;
      return RespSerializer.array([sec.toString(), micro.toString()]);
    },
  },
  {
    name: 'SAVE',
    minArgs: 0,
    maxArgs: 0,
    handler: async (_args, ctx) => {
      try {
        await ctx.persistence.save();
        return RespSerializer.ok();
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'BGSAVE',
    minArgs: 0,
    maxArgs: 0,
    handler: (_args, ctx) => {
      ctx.persistence.bgSave();
      return RespSerializer.simpleString('Background saving started');
    },
  },
  {
    name: 'LASTSAVE',
    minArgs: 0,
    maxArgs: 0,
    handler: (_args, ctx) => {
      return RespSerializer.integer(ctx.persistence.lastSaveTime);
    },
  },
  {
    name: 'CONFIG',
    minArgs: 1,
    handler: async (args, ctx) => {
      const sub = args[0]!.toUpperCase();

      if (sub === 'GET') {
        const pattern = args[1]?.toLowerCase() ?? '*';
        const pairs = ctx.config.getAllConfigPairs();
        const matched: string[] = [];

        for (const [k, v] of pairs) {
          if (pattern === '*' || pattern === k) {
            matched.push(k, v);
          }
        }
        return RespSerializer.array(matched);
      }

      if (sub === 'SET') {
        if (args.length < 3) {
          return RespSerializer.error("ERR wrong number of arguments for 'config|set' command");
        }
        const param = args[1]!;
        const val = args[2]!;
        const ok = ctx.config.setProperty(param, val);
        if (ok) {
          // If save interval was changed, restart timer in persistence
          if (param.toLowerCase() === 'save' || param.toLowerCase() === 'save-interval' || param.toLowerCase() === 'saveintervalms') {
            const interval = ctx.config.getProperty('saveIntervalMs');
            if (interval > 0) {
              ctx.persistence.startAutoSave(interval);
            } else {
              ctx.persistence.stopAutoSave();
            }
          }
          return RespSerializer.ok();
        }
        return RespSerializer.error(`ERR Unsupported CONFIG parameter: ${param}`);
      }

      if (sub === 'REWRITE') {
        try {
          await ctx.config.rewriteConfig();
          return RespSerializer.ok();
        } catch (err: any) {
          return RespSerializer.error(`ERR Failed to rewrite config: ${err.message}`);
        }
      }

      if (sub === 'RESETSTAT') {
        ctx.dataStore.totalCommandsProcessed = 0;
        return RespSerializer.ok();
      }

      return RespSerializer.error(`ERR unknown subcommand '${sub}' for 'CONFIG'`);
    },
  },
  {
    name: 'SHUTDOWN',
    minArgs: 0,
    maxArgs: 1,
    handler: async (args, ctx) => {
      const noSave = args[0]?.toUpperCase() === 'NOSAVE';
      if (!noSave) {
        await ctx.persistence.save();
      }
      setTimeout(() => process.exit(0), 50);
      return RespSerializer.ok();
    },
  },
];
