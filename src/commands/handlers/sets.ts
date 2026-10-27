import { RespSerializer } from '../../protocol/serializer.ts';
import type { CommandDefinition } from '../command.interface.ts';

export const setCommands: CommandDefinition[] = [
  {
    name: 'SADD',
    minArgs: 2,
    handler: (args, ctx) => {
      const key = args[0]!;
      const members = args.slice(1);
      try {
        const added = ctx.currentDb.sadd(key, members);
        return RespSerializer.integer(added);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'SMEMBERS',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      try {
        const members = ctx.currentDb.smembers(args[0]!);
        return RespSerializer.array(members);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'SREM',
    minArgs: 2,
    handler: (args, ctx) => {
      const key = args[0]!;
      const members = args.slice(1);
      try {
        const removed = ctx.currentDb.srem(key, members);
        return RespSerializer.integer(removed);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'SISMEMBER',
    minArgs: 2,
    maxArgs: 2,
    handler: (args, ctx) => {
      try {
        const exists = ctx.currentDb.sismember(args[0]!, args[1]!);
        return RespSerializer.integer(exists ? 1 : 0);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'SCARD',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      try {
        const card = ctx.currentDb.scard(args[0]!);
        return RespSerializer.integer(card);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'SPOP',
    minArgs: 1,
    maxArgs: 2,
    handler: (args, ctx) => {
      const key = args[0]!;
      const count = args[1] !== undefined ? parseInt(args[1], 10) : 1;
      if (isNaN(count) || count < 0) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }
      try {
        const popped = ctx.currentDb.spop(key, count);
        if (popped === null) return RespSerializer.nullBulk();
        if (Array.isArray(popped)) return RespSerializer.array(popped);
        return RespSerializer.bulkString(popped);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
];
