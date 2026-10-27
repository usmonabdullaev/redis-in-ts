import { RespSerializer } from '../../protocol/serializer.ts';
import type { CommandDefinition } from '../command.interface.ts';

export const hashCommands: CommandDefinition[] = [
  {
    name: 'HSET',
    minArgs: 3,
    handler: (args, ctx) => {
      const key = args[0]!;
      if ((args.length - 1) % 2 !== 0) {
        return RespSerializer.error("ERR wrong number of arguments for 'hset' command");
      }
      const pairs: [string, string][] = [];
      for (let i = 1; i < args.length; i += 2) {
        pairs.push([args[i]!, args[i + 1]!]);
      }
      try {
        const added = ctx.currentDb.hmset(key, pairs);
        return RespSerializer.integer(added);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'HGET',
    minArgs: 2,
    maxArgs: 2,
    handler: (args, ctx) => {
      try {
        const val = ctx.currentDb.hget(args[0]!, args[1]!);
        return RespSerializer.bulkString(val);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'HDEL',
    minArgs: 2,
    handler: (args, ctx) => {
      const key = args[0]!;
      const fields = args.slice(1);
      try {
        const removed = ctx.currentDb.hdel(key, fields);
        return RespSerializer.integer(removed);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'HEXISTS',
    minArgs: 2,
    maxArgs: 2,
    handler: (args, ctx) => {
      try {
        const exists = ctx.currentDb.hexists(args[0]!, args[1]!);
        return RespSerializer.integer(exists ? 1 : 0);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'HGETALL',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      try {
        const pairs = ctx.currentDb.hgetall(args[0]!);
        const flat: string[] = [];
        for (const [k, v] of pairs) {
          flat.push(k, v);
        }
        return RespSerializer.array(flat);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'HKEYS',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      try {
        const keys = ctx.currentDb.hkeys(args[0]!);
        return RespSerializer.array(keys);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'HVALS',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      try {
        const vals = ctx.currentDb.hvals(args[0]!);
        return RespSerializer.array(vals);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'HLEN',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      try {
        const len = ctx.currentDb.hlen(args[0]!);
        return RespSerializer.integer(len);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'HMSET',
    minArgs: 3,
    handler: (args, ctx) => {
      const key = args[0]!;
      if ((args.length - 1) % 2 !== 0) {
        return RespSerializer.error("ERR wrong number of arguments for 'hmset' command");
      }
      const pairs: [string, string][] = [];
      for (let i = 1; i < args.length; i += 2) {
        pairs.push([args[i]!, args[i + 1]!]);
      }
      try {
        ctx.currentDb.hmset(key, pairs);
        return RespSerializer.ok();
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'HMGET',
    minArgs: 2,
    handler: (args, ctx) => {
      const key = args[0]!;
      const fields = args.slice(1);
      const results: (string | null)[] = [];
      try {
        for (const f of fields) {
          results.push(ctx.currentDb.hget(key, f));
        }
        return RespSerializer.array(results);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'HINCRBY',
    minArgs: 3,
    maxArgs: 3,
    handler: (args, ctx) => {
      const key = args[0]!;
      const field = args[1]!;
      const inc = parseInt(args[2]!, 10);
      if (isNaN(inc)) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }
      try {
        const res = ctx.currentDb.hincrby(key, field, inc);
        return RespSerializer.integer(res);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'HSETNX',
    minArgs: 3,
    maxArgs: 3,
    handler: (args, ctx) => {
      const key = args[0]!;
      const field = args[1]!;
      const value = args[2]!;
      try {
        if (ctx.currentDb.hexists(key, field)) {
          return RespSerializer.integer(0);
        }
        ctx.currentDb.hset(key, field, value);
        return RespSerializer.integer(1);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
];
