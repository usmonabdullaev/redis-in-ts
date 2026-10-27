import { RespSerializer } from '../../protocol/serializer.ts';
import type { CommandDefinition } from '../command.interface.ts';

export const connectionCommands: CommandDefinition[] = [
  {
    name: 'PING',
    minArgs: 0,
    maxArgs: 1,
    requiresAuth: true,
    allowedInSubscribed: true,
    handler: (args, ctx) => {
      if (args.length === 0) {
        return RespSerializer.pong();
      }
      return RespSerializer.bulkString(args[0]!);
    },
  },
  {
    name: 'ECHO',
    minArgs: 1,
    maxArgs: 1,
    handler: (args) => {
      return RespSerializer.bulkString(args[0]!);
    },
  },
  {
    name: 'AUTH',
    minArgs: 1,
    maxArgs: 2,
    requiresAuth: false,
    allowedInSubscribed: true,
    handler: (args, ctx) => {
      const serverPassword = ctx.config.getProperty('requirepass');
      if (!serverPassword) {
        return RespSerializer.error('ERR Client sent AUTH, but no password is set');
      }

      const inputPassword = args.length === 1 ? args[0] : args[1];
      if (inputPassword === serverPassword) {
        ctx.client.authenticated = true;
        return RespSerializer.ok();
      }

      return RespSerializer.error('WRONGPASS invalid username-password pair or user is disabled.');
    },
  },
  {
    name: 'SELECT',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      const index = parseInt(args[0]!, 10);
      if (isNaN(index)) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }
      try {
        ctx.dataStore.getDb(index); // validates index
        ctx.client.currentDbIndex = index;
        return RespSerializer.ok();
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'QUIT',
    minArgs: 0,
    maxArgs: 0,
    requiresAuth: false,
    allowedInSubscribed: true,
    handler: (_args, ctx) => {
      setTimeout(() => ctx.client.close(), 10);
      return RespSerializer.ok();
    },
  },
  {
    name: 'CLIENT',
    minArgs: 1,
    handler: (args, ctx) => {
      const sub = args[0]!.toUpperCase();
      if (sub === 'SETNAME' && args[1]) {
        ctx.client.name = args[1];
        return RespSerializer.ok();
      }
      if (sub === 'GETNAME') {
        return RespSerializer.bulkString(ctx.client.name);
      }
      if (sub === 'ID') {
        return RespSerializer.integer(ctx.client.id);
      }
      if (sub === 'LIST') {
        const info = `id=${ctx.client.id} addr=${ctx.client.remoteAddress} fd=1 name=${ctx.client.name ?? ''} db=${ctx.client.currentDbIndex} sub=${ctx.client.subscriptions.size} psub=${ctx.client.patternSubscriptions.size}\n`;
        return RespSerializer.bulkString(info);
      }
      return RespSerializer.ok();
    },
  },
  {
    name: 'COMMAND',
    minArgs: 0,
    requiresAuth: false,
    handler: (args) => {
      if (args[0]?.toUpperCase() === 'DOCS') {
        return RespSerializer.array([]);
      }
      if (args[0]?.toUpperCase() === 'COUNT') {
        return RespSerializer.integer(100);
      }
      return RespSerializer.array([]);
    },
  },
  {
    name: 'HELLO',
    minArgs: 0,
    requiresAuth: false,
    handler: (args, ctx) => {
      const serverPassword = ctx.config.getProperty('requirepass');

      // HELLO [protover [AUTH username password] [SETNAME clientname]]
      if (args.length >= 3 && args[1]?.toUpperCase() === 'AUTH') {
        const authPass = args.length >= 4 ? args[3] : args[2];
        if (serverPassword && authPass !== serverPassword) {
          return RespSerializer.error('WRONGPASS invalid username-password pair');
        }
        ctx.client.authenticated = true;
      }

      return RespSerializer.array([
        'server',
        'redis-bun-emulator',
        'version',
        '7.2.0',
        'proto',
        2,
        'id',
        ctx.client.id,
        'mode',
        'standalone',
        'role',
        'master',
        'modules',
        [],
      ]);
    },
  },
  {
    name: 'RESET',
    minArgs: 0,
    maxArgs: 0,
    requiresAuth: false,
    handler: (_args, ctx) => {
      ctx.client.currentDbIndex = 0;
      ctx.client.name = null;
      ctx.pubsub.unsubscribeAll(ctx.client);
      ctx.client.subscriptions.clear();
      ctx.client.patternSubscriptions.clear();
      return RespSerializer.simpleString('RESET');
    },
  },
];
