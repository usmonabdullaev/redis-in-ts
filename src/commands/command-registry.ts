import type { CommandDefinition, CommandContext } from './command.interface.ts';
import { RespSerializer } from '../protocol/serializer.ts';
import { connectionCommands } from './handlers/connection.ts';
import { stringCommands } from './handlers/strings.ts';
import { keyCommands } from './handlers/keys.ts';
import { hashCommands } from './handlers/hashes.ts';
import { listCommands } from './handlers/lists.ts';
import { setCommands } from './handlers/sets.ts';
import { zsetCommands } from './handlers/zsets.ts';
import { streamCommands } from './handlers/streams.ts';
import { scriptingCommands } from './handlers/scripting.ts';
import { serverCommands } from './handlers/server.ts';
import { pubsubCommands } from './handlers/pubsub.ts';

export class CommandRegistry {
  private commands: Map<string, CommandDefinition> = new Map();

  constructor() {
    this.registerAll(connectionCommands);
    this.registerAll(stringCommands);
    this.registerAll(keyCommands);
    this.registerAll(hashCommands);
    this.registerAll(listCommands);
    this.registerAll(setCommands);
    this.registerAll(zsetCommands);
    this.registerAll(streamCommands);
    this.registerAll(scriptingCommands);
    this.registerAll(serverCommands);
    this.registerAll(pubsubCommands);
  }

  public register(cmd: CommandDefinition): void {
    this.commands.set(cmd.name.toUpperCase(), cmd);
  }

  public registerAll(cmds: CommandDefinition[]): void {
    for (const cmd of cmds) {
      this.register(cmd);
    }
  }

  public async execute(rawArgs: string[], ctx: CommandContext): Promise<string> {
    if (rawArgs.length === 0) {
      return '';
    }

    ctx.registry = this;
    const commandName = rawArgs[0]!.toUpperCase();
    const args = rawArgs.slice(1);
    const cmd = this.commands.get(commandName);

    if (!cmd) {
      return RespSerializer.error(`unknown command '${commandName}', with args beginning with: ${args.slice(0, 3).map(a => `'${a}'`).join(' ')}`);
    }

    // Check Authentication
    const requiresAuth = cmd.requiresAuth !== false;
    const serverPassword = ctx.config.getProperty('requirepass');
    if (requiresAuth && serverPassword && !ctx.client.authenticated) {
      return RespSerializer.error('NOAUTH Authentication required.');
    }

    // Check Subscribed Mode constraints
    if (ctx.client.isSubscribed && !cmd.allowedInSubscribed) {
      return RespSerializer.error(`Can't execute '${commandName}': only (P)SUBSCRIBE / (P)UNSUBSCRIBE / PING / QUIT / RESET are allowed in this context`);
    }

    // Check Arity
    if (cmd.minArgs !== undefined && args.length < cmd.minArgs) {
      return RespSerializer.error(`wrong number of arguments for '${commandName.toLowerCase()}' command`);
    }
    if (cmd.maxArgs !== undefined && args.length > cmd.maxArgs) {
      return RespSerializer.error(`wrong number of arguments for '${commandName.toLowerCase()}' command`);
    }

    try {
      const response = await cmd.handler(args, ctx);
      return response ?? '';
    } catch (err: any) {
      return RespSerializer.error(err.message || 'unknown error');
    }
  }

  /**
   * Synchronous execution used by Lua redis.call / redis.pcall
   */
  public executeSync(rawArgs: string[], ctx: CommandContext): string {
    if (rawArgs.length === 0) {
      return '';
    }

    ctx.registry = this;
    const commandName = rawArgs[0]!.toUpperCase();
    const args = rawArgs.slice(1);
    const cmd = this.commands.get(commandName);

    if (!cmd) {
      return RespSerializer.error(`ERR unknown command '${commandName}'`);
    }

    if (cmd.minArgs !== undefined && args.length < cmd.minArgs) {
      return RespSerializer.error(`ERR wrong number of arguments for '${commandName.toLowerCase()}' command`);
    }
    if (cmd.maxArgs !== undefined && args.length > cmd.maxArgs) {
      return RespSerializer.error(`ERR wrong number of arguments for '${commandName.toLowerCase()}' command`);
    }

    try {
      const response = cmd.handler(args, ctx);
      if (response instanceof Promise) {
        throw new Error('Asynchronous command not supported inside Lua script');
      }
      return response ?? '';
    } catch (err: any) {
      return RespSerializer.error(err.message || 'unknown error');
    }
  }
}
