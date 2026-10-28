import { describe, expect, test } from 'bun:test';
import { encode as msgpackEncode } from '@msgpack/msgpack';
import { ConfigManager } from '../src/config/index.ts';
import { DataStore } from '../src/storage/data-store.ts';
import { PersistenceManager } from '../src/storage/persistence.ts';
import { PubSubManager } from '../src/pubsub/pubsub-manager.ts';
import { LuaEngine } from '../src/scripting/lua-engine.ts';
import { CommandRegistry } from '../src/commands/command-registry.ts';
import { ClientSession } from '../src/server/client-session.ts';

describe('BullMQ Integration', () => {
  const config = new ConfigManager({ dataDir: './data', dataFile: 'test_bullmq_dump.json' });
  const dataStore = new DataStore(16);
  const persistence = new PersistenceManager(config, dataStore);
  const pubsub = new PubSubManager();
  const luaEngine = new LuaEngine();
  const registry = new CommandRegistry();

  const mockSocket = { remoteAddress: '127.0.0.1', write: () => {}, end: () => {} };
  const client = new ClientSession(1, mockSocket, false);

  const getCtx = () => ({
    client,
    dataStore,
    currentDb: dataStore.getDb(0),
    persistence,
    config,
    pubsub,
    luaEngine,
    connectedClientsCount: 1,
    registry,
  });

  test('BullMQ addJob Lua script executes successfully', async () => {
    const bullScript = `
      local waitKey = KEYS[1]
      local metaKey = KEYS[3]
      local activeKey = KEYS[7]
      local eventsKey = KEYS[8]
      local markerKey = KEYS[9]

      local rcall = redis.call
      local args = cmsgpack.unpack(ARGV[1])
      local data = ARGV[2]
      local opts = cmsgpack.unpack(ARGV[3])

      local jobCounter = rcall("INCR", KEYS[4])
      local jobId = tostring(jobCounter)
      local jobIdKey = args[1] .. jobId

      rcall("HMSET", jobIdKey, "name", args[3], "data", data, "timestamp", args[4])
      rcall("XADD", eventsKey, "*", "event", "added", "jobId", jobId, "name", args[3])
      rcall("LPUSH", waitKey, jobId)
      rcall("ZADD", markerKey, 0, "0")

      return jobId
    `;

    // Pack arguments like BullMQ does:
    // [1] prefix, [2] customId, [3] name, [4] timestamp, [5] parentKey, [6] parentDepsKey, [7] parent, [8] repeatJobKey, [9] dedupKey
    const arg1Packed = msgpackEncode(['bull:myqueue:', '', 'sendEmail', 16000000, null, null, null, null, null]);
    const arg2Json = JSON.stringify({ email: 'test@example.com', body: 'Hello BullMQ' });
    const arg3Packed = msgpackEncode({ delay: 0, priority: 0 });

    const keys = [
      'bull:myqueue:wait',
      'bull:myqueue:paused',
      'bull:myqueue:meta',
      'bull:myqueue:id',
      'bull:myqueue:completed',
      'bull:myqueue:delayed',
      'bull:myqueue:active',
      'bull:myqueue:events',
      'bull:myqueue:marker',
    ];

    const res = await registry.execute(
      [
        'EVAL',
        bullScript,
        keys.length.toString(),
        ...keys,
        Buffer.from(arg1Packed).toString('binary'),
        arg2Json,
        Buffer.from(arg3Packed).toString('binary'),
      ],
      getCtx()
    );

    expect(res).toBe('$1\r\n1\r\n');

    // Verify job in database
    const jobData = await registry.execute(['HGET', 'bull:myqueue:1', 'name'], getCtx());
    expect(jobData).toBe('$9\r\nsendEmail\r\n');

    // Verify wait queue
    const waitList = await registry.execute(['LRANGE', 'bull:myqueue:wait', '0', '-1'], getCtx());
    expect(waitList).toContain('1');

    // Verify events stream
    const streamLen = await registry.execute(['XLEN', 'bull:myqueue:events'], getCtx());
    expect(streamLen).toBe(':1\r\n');
  });
});

