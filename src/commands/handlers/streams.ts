import { RespSerializer } from '../../protocol/serializer.ts';
import type { CommandDefinition } from '../command.interface.ts';

export const streamCommands: CommandDefinition[] = [
  {
    name: 'XADD',
    minArgs: 4,
    handler: (args, ctx) => {
      const key = args[0]!;
      let idx = 1;
      let maxLen: number | undefined;

      // Handle optional [MAXLEN [~] count]
      if (args[idx]?.toUpperCase() === 'MAXLEN') {
        idx++;
        if (args[idx] === '~' || args[idx] === '=') {
          idx++;
        }
        maxLen = parseInt(args[idx++]!, 10);
      }

      // Handle optional [NOMKSTREAM]
      if (args[idx]?.toUpperCase() === 'NOMKSTREAM') {
        idx++;
        if (!ctx.currentDb.exists(key)) {
          return RespSerializer.nullBulk();
        }
      }

      if (idx >= args.length) {
        return RespSerializer.error("ERR wrong number of arguments for 'xadd' command");
      }

      const id = args[idx++]!;
      const fieldPairs: [string, string][] = [];

      for (let i = idx; i < args.length; i += 2) {
        if (i + 1 >= args.length) {
          return RespSerializer.error("ERR wrong number of arguments for 'xadd' command");
        }
        fieldPairs.push([args[i]!, args[i + 1]!]);
      }

      try {
        const addedId = ctx.currentDb.xadd(key, id, fieldPairs, maxLen);
        return RespSerializer.bulkString(addedId);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'XLEN',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      try {
        const len = ctx.currentDb.xlen(args[0]!);
        return RespSerializer.integer(len);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'XRANGE',
    minArgs: 3,
    handler: (args, ctx) => {
      const key = args[0]!;
      const start = args[1]!;
      const end = args[2]!;
      let count: number | undefined;

      if (args[3]?.toUpperCase() === 'COUNT' && args[4]) {
        count = parseInt(args[4], 10);
      }

      try {
        const entries = ctx.currentDb.xrange(key, start, end, count);
        const serialized = entries.map((e) => [
          e.id,
          e.fields.flat(),
        ]);
        return RespSerializer.array(serialized);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'XREVRANGE',
    minArgs: 3,
    handler: (args, ctx) => {
      const key = args[0]!;
      const end = args[1]!;
      const start = args[2]!;
      let count: number | undefined;

      if (args[3]?.toUpperCase() === 'COUNT' && args[4]) {
        count = parseInt(args[4], 10);
      }

      try {
        const entries = ctx.currentDb.xrevrange(key, end, start, count);
        const serialized = entries.map((e) => [
          e.id,
          e.fields.flat(),
        ]);
        return RespSerializer.array(serialized);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'XREAD',
    minArgs: 3,
    handler: (args, ctx) => {
      let count: number | undefined;
      let streamsIdx = 0;

      for (let i = 0; i < args.length; i++) {
        if (args[i]!.toUpperCase() === 'COUNT' && i + 1 < args.length) {
          count = parseInt(args[++i]!, 10);
        } else if (args[i]!.toUpperCase() === 'BLOCK' && i + 1 < args.length) {
          i++; // Block is non-blocking in this sync emulation pass
        } else if (args[i]!.toUpperCase() === 'STREAMS') {
          streamsIdx = i + 1;
          break;
        }
      }

      if (streamsIdx === 0 || streamsIdx >= args.length) {
        return RespSerializer.error("ERR syntax error, 'STREAMS' keyword missing or misplaced");
      }

      const streamArgs = args.slice(streamsIdx);
      if (streamArgs.length % 2 !== 0) {
        return RespSerializer.error("ERR number of keys does not match number of stream IDs");
      }

      const numKeys = streamArgs.length / 2;
      const keys = streamArgs.slice(0, numKeys);
      const ids = streamArgs.slice(numKeys);

      const results: [string, [string, string[]][]][] = [];

      for (let i = 0; i < numKeys; i++) {
        const key = keys[i]!;
        const id = ids[i]!;
        try {
          const entries = ctx.currentDb.xread(key, id, count);
          if (entries.length > 0) {
            results.push([
              key,
              entries.map((e) => [e.id, e.fields.flat()]),
            ]);
          }
        } catch {
          // ignore wrong type or missing
        }
      }

      if (results.length === 0) {
        return RespSerializer.nullBulk();
      }

      return RespSerializer.array(results);
    },
  },
  {
    name: 'XDEL',
    minArgs: 2,
    handler: (args, ctx) => {
      const key = args[0]!;
      const ids = args.slice(1);
      try {
        const deleted = ctx.currentDb.xdel(key, ids);
        return RespSerializer.integer(deleted);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'XTRIM',
    minArgs: 3,
    handler: (args, ctx) => {
      const key = args[0]!;
      let idx = 1;
      if (args[idx]?.toUpperCase() !== 'MAXLEN') {
        return RespSerializer.error("ERR syntax error in 'xtrim'");
      }
      idx++;
      if (args[idx] === '~' || args[idx] === '=') {
        idx++;
      }
      const maxLen = parseInt(args[idx]!, 10);
      if (isNaN(maxLen)) {
        return RespSerializer.error("ERR value is not an integer or out of range");
      }
      try {
        const trimmed = ctx.currentDb.xtrim(key, maxLen);
        return RespSerializer.integer(trimmed);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'XACK',
    minArgs: 3,
    handler: (args) => {
      // Returns number of acknowledged messages
      return RespSerializer.integer(args.length - 2);
    },
  },
  {
    name: 'XGROUP',
    minArgs: 2,
    handler: (args, ctx) => {
      const sub = args[0]!.toUpperCase();
      if (sub === 'CREATE') {
        const key = args[1]!;
        if (!ctx.currentDb.exists(key)) {
          // Create empty stream if MKSTREAM is used
          ctx.currentDb.xadd(key, '0-1', [['dummy', 'init']]);
          ctx.currentDb.xdel(key, ['0-1']);
        }
        return RespSerializer.ok();
      }
      if (sub === 'DESTROY') {
        return RespSerializer.integer(1);
      }
      return RespSerializer.ok();
    },
  },
  {
    name: 'XINFO',
    minArgs: 1,
    handler: (_args) => {
      return RespSerializer.array([]);
    },
  },
];

