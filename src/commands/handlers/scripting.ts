import { RespSerializer } from '../../protocol/serializer.ts';
import type { CommandDefinition } from '../command.interface.ts';

export const scriptingCommands: CommandDefinition[] = [
  {
    name: 'EVAL',
    minArgs: 2,
    handler: async (args, ctx) => {
      const script = args[0]!;
      const numKeys = parseInt(args[1]!, 10);
      if (isNaN(numKeys) || numKeys < 0) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }

      const rest = args.slice(2);
      if (rest.length < numKeys) {
        return RespSerializer.error('ERR Number of keys can\'t be greater than number of args');
      }

      const keys = rest.slice(0, numKeys);
      const argv = rest.slice(numKeys);

      const registry = (ctx as any).registry;
      return await ctx.luaEngine.eval(script, keys, argv, ctx, registry);
    },
  },
  {
    name: 'EVALSHA',
    minArgs: 2,
    handler: async (args, ctx) => {
      const sha = args[0]!.toLowerCase();
      const numKeys = parseInt(args[1]!, 10);
      if (isNaN(numKeys) || numKeys < 0) {
        return RespSerializer.error('ERR value is not an integer or out of range');
      }

      const script = ctx.luaEngine.getScript(sha);
      if (!script) {
        return RespSerializer.error('NOSCRIPT No matching script. Please use EVAL.');
      }

      const rest = args.slice(2);
      if (rest.length < numKeys) {
        return RespSerializer.error('ERR Number of keys can\'t be greater than number of args');
      }

      const keys = rest.slice(0, numKeys);
      const argv = rest.slice(numKeys);

      const registry = (ctx as any).registry;
      return await ctx.luaEngine.eval(script, keys, argv, ctx, registry);
    },
  },
  {
    name: 'SCRIPT',
    minArgs: 1,
    handler: (args, ctx) => {
      const sub = args[0]!.toUpperCase();

      if (sub === 'LOAD') {
        if (args.length < 2) {
          return RespSerializer.error("ERR wrong number of arguments for 'script|load' command");
        }
        const sha = ctx.luaEngine.loadScript(args[1]!);
        return RespSerializer.bulkString(sha);
      }

      if (sub === 'EXISTS') {
        const shas = args.slice(1).map((s) => s.toLowerCase());
        const exists = ctx.luaEngine.exists(shas);
        return RespSerializer.array(exists);
      }

      if (sub === 'FLUSH') {
        ctx.luaEngine.flush();
        return RespSerializer.ok();
      }

      return RespSerializer.error(`ERR unknown subcommand '${sub}' for 'SCRIPT'`);
    },
  },
];

