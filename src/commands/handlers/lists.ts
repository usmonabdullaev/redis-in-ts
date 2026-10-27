import { RespSerializer } from '../../protocol/serializer.ts';
import type { CommandDefinition } from '../command.interface.ts';

export const listCommands: CommandDefinition[] = [
  {
    name: 'LPUSH',
    minArgs: 2,
    handler: (args, ctx) => {
      const key = args[0]!;
      const values = args.slice(1);
      try {
        const len = ctx.currentDb.lpush(key, values);
        return RespSerializer.integer(len);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'RPUSH',
    minArgs: 2,
    handler: (args, ctx) => {
      const key = args[0]!;
      const values = args.slice(1);
      try {
        const len = ctx.currentDb.rpush(key, values);
        return RespSerializer.integer(len);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'LPOP',
    minArgs: 1,
    maxArgs: 2,
    handler: (args, ctx) => {
      const key = args[0]!;
      const count = args[1] !== undefined ? parseInt(args[1], 10) : 1;
      if (isNaN(count) || count < 0) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }
      try {
        const popped = ctx.currentDb.lpop(key, count);
        if (popped === null) return RespSerializer.nullBulk();
        if (Array.isArray(popped)) return RespSerializer.array(popped);
        return RespSerializer.bulkString(popped);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'RPOP',
    minArgs: 1,
    maxArgs: 2,
    handler: (args, ctx) => {
      const key = args[0]!;
      const count = args[1] !== undefined ? parseInt(args[1], 10) : 1;
      if (isNaN(count) || count < 0) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }
      try {
        const popped = ctx.currentDb.rpop(key, count);
        if (popped === null) return RespSerializer.nullBulk();
        if (Array.isArray(popped)) return RespSerializer.array(popped);
        return RespSerializer.bulkString(popped);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'LRANGE',
    minArgs: 3,
    maxArgs: 3,
    handler: (args, ctx) => {
      const key = args[0]!;
      const start = parseInt(args[1]!, 10);
      const stop = parseInt(args[2]!, 10);
      if (isNaN(start) || isNaN(stop)) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }
      try {
        const items = ctx.currentDb.lrange(key, start, stop);
        return RespSerializer.array(items);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'LLEN',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      try {
        const len = ctx.currentDb.llen(args[0]!);
        return RespSerializer.integer(len);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'LINDEX',
    minArgs: 2,
    maxArgs: 2,
    handler: (args, ctx) => {
      const idx = parseInt(args[1]!, 10);
      if (isNaN(idx)) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }
      try {
        const item = ctx.currentDb.lindex(args[0]!, idx);
        return RespSerializer.bulkString(item);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'LREM',
    minArgs: 3,
    maxArgs: 3,
    handler: (args, ctx) => {
      const key = args[0]!;
      const count = parseInt(args[1]!, 10);
      const element = args[2]!;
      if (isNaN(count)) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }
      try {
        const removed = ctx.currentDb.lrem(key, count, element);
        return RespSerializer.integer(removed);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
];
