import { RespSerializer } from '../../protocol/serializer.ts';
import type { CommandDefinition } from '../command.interface.ts';

export const pubsubCommands: CommandDefinition[] = [
  {
    name: 'PUBLISH',
    minArgs: 2,
    maxArgs: 2,
    handler: (args, ctx) => {
      const channel = args[0]!;
      const message = args[1]!;
      const receivers = ctx.pubsub.publish(channel, message);
      return RespSerializer.integer(receivers);
    },
  },
  {
    name: 'SUBSCRIBE',
    minArgs: 1,
    allowedInSubscribed: true,
    handler: (args, ctx) => {
      let resp = '';
      for (const ch of args) {
        ctx.client.subscriptions.add(ch);
        const count = ctx.pubsub.subscribe(ctx.client, ch);
        resp += RespSerializer.array(['subscribe', ch, count]);
      }
      return resp;
    },
  },
  {
    name: 'UNSUBSCRIBE',
    minArgs: 0,
    allowedInSubscribed: true,
    handler: (args, ctx) => {
      const channels = args.length === 0 ? Array.from(ctx.client.subscriptions) : args;
      if (channels.length === 0) {
        return RespSerializer.array(['unsubscribe', null, ctx.pubsub.getClientSubscriptionCount(ctx.client)]);
      }

      let resp = '';
      for (const ch of channels) {
        ctx.client.subscriptions.delete(ch);
        const count = ctx.pubsub.unsubscribe(ctx.client, ch);
        resp += RespSerializer.array(['unsubscribe', ch, count]);
      }
      return resp;
    },
  },
  {
    name: 'PSUBSCRIBE',
    minArgs: 1,
    allowedInSubscribed: true,
    handler: (args, ctx) => {
      let resp = '';
      for (const pat of args) {
        ctx.client.patternSubscriptions.add(pat);
        const count = ctx.pubsub.psubscribe(ctx.client, pat);
        resp += RespSerializer.array(['psubscribe', pat, count]);
      }
      return resp;
    },
  },
  {
    name: 'PUNSUBSCRIBE',
    minArgs: 0,
    allowedInSubscribed: true,
    handler: (args, ctx) => {
      const patterns = args.length === 0 ? Array.from(ctx.client.patternSubscriptions) : args;
      if (patterns.length === 0) {
        return RespSerializer.array(['punsubscribe', null, ctx.pubsub.getClientSubscriptionCount(ctx.client)]);
      }

      let resp = '';
      for (const pat of patterns) {
        ctx.client.patternSubscriptions.delete(pat);
        const count = ctx.pubsub.punsubscribe(ctx.client, pat);
        resp += RespSerializer.array(['punsubscribe', pat, count]);
      }
      return resp;
    },
  },
];
