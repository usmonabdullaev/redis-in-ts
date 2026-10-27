import { RespSerializer } from '../../protocol/serializer.ts';
import type { CommandDefinition } from '../command.interface.ts';

export const keyCommands: CommandDefinition[] = [
  {
    name: 'DEL',
    minArgs: 1,
    handler: (args, ctx) => {
      const count = ctx.currentDb.deleteMultiple(args);
      return RespSerializer.integer(count);
    },
  },
  {
    name: 'EXISTS',
    minArgs: 1,
    handler: (args, ctx) => {
      let count = 0;
      for (const k of args) {
        if (ctx.currentDb.exists(k)) {
          count++;
        }
      }
      return RespSerializer.integer(count);
    },
  },
  {
    name: 'TYPE',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      const t = ctx.currentDb.type(args[0]!);
      return RespSerializer.simpleString(t);
    },
  },
  {
    name: 'KEYS',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      const keys = ctx.currentDb.keys(args[0]!);
      return RespSerializer.array(keys);
    },
  },
  {
    name: 'EXPIRE',
    minArgs: 2,
    maxArgs: 3,
    handler: (args, ctx) => {
      const seconds = parseInt(args[1]!, 10);
      if (isNaN(seconds)) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }
      const ok = ctx.currentDb.expire(args[0]!, seconds);
      return RespSerializer.integer(ok ? 1 : 0);
    },
  },
  {
    name: 'PEXPIRE',
    minArgs: 2,
    maxArgs: 3,
    handler: (args, ctx) => {
      const ms = parseInt(args[1]!, 10);
      if (isNaN(ms)) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }
      const ok = ctx.currentDb.pexpire(args[0]!, ms);
      return RespSerializer.integer(ok ? 1 : 0);
    },
  },
  {
    name: 'EXPIREAT',
    minArgs: 2,
    maxArgs: 3,
    handler: (args, ctx) => {
      const ts = parseInt(args[1]!, 10);
      if (isNaN(ts)) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }
      const ok = ctx.currentDb.expireAt(args[0]!, ts);
      return RespSerializer.integer(ok ? 1 : 0);
    },
  },
  {
    name: 'PEXPIREAT',
    minArgs: 2,
    maxArgs: 3,
    handler: (args, ctx) => {
      const ts = parseInt(args[1]!, 10);
      if (isNaN(ts)) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }
      const ok = ctx.currentDb.pexpireAt(args[0]!, ts);
      return RespSerializer.integer(ok ? 1 : 0);
    },
  },
  {
    name: 'TTL',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      const ttl = ctx.currentDb.ttl(args[0]!);
      return RespSerializer.integer(ttl);
    },
  },
  {
    name: 'PTTL',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      const pttl = ctx.currentDb.pttl(args[0]!);
      return RespSerializer.integer(pttl);
    },
  },
  {
    name: 'PERSIST',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      const ok = ctx.currentDb.persist(args[0]!);
      return RespSerializer.integer(ok ? 1 : 0);
    },
  },
  {
    name: 'RENAME',
    minArgs: 2,
    maxArgs: 2,
    handler: (args, ctx) => {
      const src = args[0]!;
      const dst = args[1]!;
      if (!ctx.currentDb.exists(src)) {
        return RespSerializer.error('ERR no such key');
      }
      ctx.currentDb.rename(src, dst);
      return RespSerializer.ok();
    },
  },
  {
    name: 'RENAMENX',
    minArgs: 2,
    maxArgs: 2,
    handler: (args, ctx) => {
      const src = args[0]!;
      const dst = args[1]!;
      if (!ctx.currentDb.exists(src)) {
        return RespSerializer.error('ERR no such key');
      }
      const ok = ctx.currentDb.renamenx(src, dst);
      return RespSerializer.integer(ok ? 1 : 0);
    },
  },
  {
    name: 'RANDOMKEY',
    minArgs: 0,
    maxArgs: 0,
    handler: (_args, ctx) => {
      const k = ctx.currentDb.randomKey();
      return RespSerializer.bulkString(k);
    },
  },
  {
    name: 'DBSIZE',
    minArgs: 0,
    maxArgs: 0,
    handler: (_args, ctx) => {
      return RespSerializer.integer(ctx.currentDb.dbsize());
    },
  },
  {
    name: 'FLUSHDB',
    minArgs: 0,
    maxArgs: 1,
    handler: (_args, ctx) => {
      ctx.currentDb.flush();
      return RespSerializer.ok();
    },
  },
  {
    name: 'FLUSHALL',
    minArgs: 0,
    maxArgs: 1,
    handler: (_args, ctx) => {
      ctx.dataStore.flushAll();
      return RespSerializer.ok();
    },
  },
  {
    name: 'SCAN',
    minArgs: 1,
    handler: (args, ctx) => {
      const cursor = parseInt(args[0]!, 10) || 0;
      let pattern = '*';
      let count = 10;

      for (let i = 1; i < args.length; i++) {
        const opt = args[i]!.toUpperCase();
        if (opt === 'MATCH' && i + 1 < args.length) {
          pattern = args[++i]!;
        } else if (opt === 'COUNT' && i + 1 < args.length) {
          count = parseInt(args[++i]!, 10) || 10;
        }
      }

      const allKeys = ctx.currentDb.keys(pattern);
      const nextCursor = cursor + count >= allKeys.length ? 0 : cursor + count;
      const slicedKeys = allKeys.slice(cursor, cursor + count);

      return RespSerializer.array([nextCursor.toString(), slicedKeys]);
    },
  },
];
