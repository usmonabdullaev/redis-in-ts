import { RespSerializer } from '../../protocol/serializer.ts';
import type { CommandDefinition } from '../command.interface.ts';

export const zsetCommands: CommandDefinition[] = [
  {
    name: 'ZADD',
    minArgs: 3,
    handler: (args, ctx) => {
      const key = args[0]!;
      let idx = 1;

      // Skip options if any
      while (idx < args.length && isNaN(Number(args[idx]))) {
        idx++;
      }

      const pairs = args.slice(idx);
      if (pairs.length < 2 || pairs.length % 2 !== 0) {
        return RespSerializer.error("ERR syntax error in 'zadd'");
      }

      const nodes: { member: string; score: number }[] = [];
      for (let i = 0; i < pairs.length; i += 2) {
        const score = parseFloat(pairs[i]!);
        const member = pairs[i + 1]!;
        if (isNaN(score)) {
          return RespSerializer.error('ERR value is not a valid float');
        }
        nodes.push({ member, score });
      }

      try {
        const added = ctx.currentDb.zadd(key, nodes);
        return RespSerializer.integer(added);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'ZSCORE',
    minArgs: 2,
    maxArgs: 2,
    handler: (args, ctx) => {
      try {
        const score = ctx.currentDb.zscore(args[0]!, args[1]!);
        if (score === null) return RespSerializer.nullBulk();
        return RespSerializer.bulkString(score.toString());
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'ZRANGE',
    minArgs: 3,
    handler: (args, ctx) => {
      const key = args[0]!;
      const start = parseInt(args[1]!, 10);
      const stop = parseInt(args[2]!, 10);
      if (isNaN(start) || isNaN(stop)) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }
      const withScores = args.length > 3 && args[3]!.toUpperCase() === 'WITHSCORES';
      try {
        const items = ctx.currentDb.zrange(key, start, stop, withScores);
        return RespSerializer.array(items);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'ZREVRANGE',
    minArgs: 3,
    handler: (args, ctx) => {
      const key = args[0]!;
      const start = parseInt(args[1]!, 10);
      const stop = parseInt(args[2]!, 10);
      if (isNaN(start) || isNaN(stop)) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }
      const withScores = args.length > 3 && args[3]!.toUpperCase() === 'WITHSCORES';
      try {
        const items = ctx.currentDb.zrevrange(key, start, stop, withScores);
        return RespSerializer.array(items);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'ZREM',
    minArgs: 2,
    handler: (args, ctx) => {
      const key = args[0]!;
      const members = args.slice(1);
      try {
        const removed = ctx.currentDb.zrem(key, members);
        return RespSerializer.integer(removed);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'ZCARD',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      try {
        const count = ctx.currentDb.zcard(args[0]!);
        return RespSerializer.integer(count);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'ZCOUNT',
    minArgs: 3,
    maxArgs: 3,
    handler: (args, ctx) => {
      const min = args[1] === '-inf' ? -Infinity : parseFloat(args[1]!);
      const max = args[2] === '+inf' ? Infinity : parseFloat(args[2]!);
      if (isNaN(min) || isNaN(max)) {
        return RespSerializer.error('ERR min or max is not a float');
      }
      try {
        const count = ctx.currentDb.zcount(args[0]!, min, max);
        return RespSerializer.integer(count);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'ZINCRBY',
    minArgs: 3,
    maxArgs: 3,
    handler: (args, ctx) => {
      const key = args[0]!;
      const inc = parseFloat(args[1]!);
      const member = args[2]!;
      if (isNaN(inc)) {
        return RespSerializer.error('ERR value is not a valid float');
      }
      try {
        const newScore = ctx.currentDb.zincrby(key, inc, member);
        return RespSerializer.bulkString(newScore.toString());
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'ZRANK',
    minArgs: 2,
    maxArgs: 2,
    handler: (args, ctx) => {
      try {
        const rank = ctx.currentDb.zrank(args[0]!, args[1]!);
        if (rank === null) return RespSerializer.nullBulk();
        return RespSerializer.integer(rank);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'ZREVRANK',
    minArgs: 2,
    maxArgs: 2,
    handler: (args, ctx) => {
      try {
        const rank = ctx.currentDb.zrevrank(args[0]!, args[1]!);
        if (rank === null) return RespSerializer.nullBulk();
        return RespSerializer.integer(rank);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
];
