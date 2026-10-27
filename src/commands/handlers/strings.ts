import { RespSerializer } from '../../protocol/serializer.ts';
import type { CommandDefinition } from '../command.interface.ts';

export const stringCommands: CommandDefinition[] = [
  {
    name: 'SET',
    minArgs: 2,
    handler: (args, ctx) => {
      const key = args[0]!;
      const value = args[1]!;

      let exSeconds: number | undefined;
      let pxMilliseconds: number | undefined;
      let exatUnixSeconds: number | undefined;
      let pxatUnixMs: number | undefined;
      let nx = false;
      let xx = false;
      let keepTtl = false;
      let get = false;

      for (let i = 2; i < args.length; i++) {
        const opt = args[i]!.toUpperCase();
        if (opt === 'EX' && i + 1 < args.length) {
          exSeconds = parseInt(args[++i]!, 10);
        } else if (opt === 'PX' && i + 1 < args.length) {
          pxMilliseconds = parseInt(args[++i]!, 10);
        } else if (opt === 'EXAT' && i + 1 < args.length) {
          exatUnixSeconds = parseInt(args[++i]!, 10);
        } else if (opt === 'PXAT' && i + 1 < args.length) {
          pxatUnixMs = parseInt(args[++i]!, 10);
        } else if (opt === 'NX') {
          nx = true;
        } else if (opt === 'XX') {
          xx = true;
        } else if (opt === 'KEEPTTL') {
          keepTtl = true;
        } else if (opt === 'GET') {
          get = true;
        }
      }

      let previousValue: string | null = null;
      if (get) {
        try {
          previousValue = ctx.currentDb.get(key);
        } catch {
          return RespSerializer.wrongType();
        }
      }

      const success = ctx.currentDb.set(key, value, {
        exSeconds,
        pxMilliseconds,
        exatUnixSeconds,
        pxatUnixMs,
        nx,
        xx,
        keepTtl,
      });

      if (get) {
        return RespSerializer.bulkString(previousValue);
      }

      return success ? RespSerializer.ok() : RespSerializer.nullBulk();
    },
  },
  {
    name: 'GET',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      try {
        const val = ctx.currentDb.get(args[0]!);
        return RespSerializer.bulkString(val);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'MGET',
    minArgs: 1,
    handler: (args, ctx) => {
      const results: (string | null)[] = [];
      for (const key of args) {
        try {
          results.push(ctx.currentDb.get(key));
        } catch {
          results.push(null);
        }
      }
      return RespSerializer.array(results);
    },
  },
  {
    name: 'MSET',
    minArgs: 2,
    handler: (args, ctx) => {
      if (args.length % 2 !== 0) {
        return RespSerializer.error("ERR wrong number of arguments for 'mset' command");
      }
      for (let i = 0; i < args.length; i += 2) {
        ctx.currentDb.set(args[i]!, args[i + 1]!);
      }
      return RespSerializer.ok();
    },
  },
  {
    name: 'MSETNX',
    minArgs: 2,
    handler: (args, ctx) => {
      if (args.length % 2 !== 0) {
        return RespSerializer.error("ERR wrong number of arguments for 'msetnx' command");
      }
      for (let i = 0; i < args.length; i += 2) {
        if (ctx.currentDb.exists(args[i]!)) {
          return RespSerializer.integer(0);
        }
      }
      for (let i = 0; i < args.length; i += 2) {
        ctx.currentDb.set(args[i]!, args[i + 1]!);
      }
      return RespSerializer.integer(1);
    },
  },
  {
    name: 'INCR',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      try {
        const res = ctx.currentDb.incrBy(args[0]!, 1);
        return RespSerializer.integer(res);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'DECR',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      try {
        const res = ctx.currentDb.incrBy(args[0]!, -1);
        return RespSerializer.integer(res);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'INCRBY',
    minArgs: 2,
    maxArgs: 2,
    handler: (args, ctx) => {
      const delta = parseInt(args[1]!, 10);
      if (isNaN(delta)) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }
      try {
        const res = ctx.currentDb.incrBy(args[0]!, delta);
        return RespSerializer.integer(res);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'DECRBY',
    minArgs: 2,
    maxArgs: 2,
    handler: (args, ctx) => {
      const delta = parseInt(args[1]!, 10);
      if (isNaN(delta)) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }
      try {
        const res = ctx.currentDb.incrBy(args[0]!, -delta);
        return RespSerializer.integer(res);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'INCRBYFLOAT',
    minArgs: 2,
    maxArgs: 2,
    handler: (args, ctx) => {
      const delta = parseFloat(args[1]!);
      if (isNaN(delta)) {
        return RespSerializer.error('ERR value is not a valid float');
      }
      try {
        const res = ctx.currentDb.incrByFloat(args[0]!, delta);
        return RespSerializer.bulkString(res.toString());
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'APPEND',
    minArgs: 2,
    maxArgs: 2,
    handler: (args, ctx) => {
      try {
        const len = ctx.currentDb.append(args[0]!, args[1]!);
        return RespSerializer.integer(len);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'STRLEN',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      try {
        return RespSerializer.integer(ctx.currentDb.strlen(args[0]!));
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'GETSET',
    minArgs: 2,
    maxArgs: 2,
    handler: (args, ctx) => {
      try {
        const old = ctx.currentDb.getSet(args[0]!, args[1]!);
        return RespSerializer.bulkString(old);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'GETDEL',
    minArgs: 1,
    maxArgs: 1,
    handler: (args, ctx) => {
      try {
        const old = ctx.currentDb.getDel(args[0]!);
        return RespSerializer.bulkString(old);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'GETRANGE',
    minArgs: 3,
    maxArgs: 3,
    handler: (args, ctx) => {
      try {
        const val = ctx.currentDb.get(args[0]!) ?? '';
        let start = parseInt(args[1]!, 10);
        let end = parseInt(args[2]!, 10);
        const len = val.length;
        if (start < 0) start = Math.max(0, len + start);
        if (end < 0) end = Math.max(0, len + end);
        if (start > end || start >= len) {
          return RespSerializer.bulkString('');
        }
        return RespSerializer.bulkString(val.substring(start, end + 1));
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
  {
    name: 'SETRANGE',
    minArgs: 3,
    maxArgs: 3,
    handler: (args, ctx) => {
      const key = args[0]!;
      const offset = parseInt(args[1]!, 10);
      const val = args[2]!;
      if (offset < 0) {
        return RespSerializer.error('ERR offset is out of range');
      }
      try {
        let current = ctx.currentDb.get(key) ?? '';
        if (current.length < offset) {
          current = current.padEnd(offset, '\0');
        }
        const updated = current.substring(0, offset) + val + current.substring(offset + val.length);
        ctx.currentDb.set(key, updated);
        return RespSerializer.integer(updated.length);
      } catch (err: any) {
        return RespSerializer.error(err.message);
      }
    },
  },
];
