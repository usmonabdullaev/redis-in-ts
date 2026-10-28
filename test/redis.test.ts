import { describe, expect, test } from 'bun:test';
import { ConfigManager } from '../src/config/index.ts';
import { DataStore } from '../src/storage/data-store.ts';
import { PersistenceManager } from '../src/storage/persistence.ts';
import { PubSubManager } from '../src/pubsub/pubsub-manager.ts';
import { CommandRegistry } from '../src/commands/command-registry.ts';
import { ClientSession } from '../src/server/client-session.ts';
import { RespParser } from '../src/protocol/parser.ts';

describe('Redis Emulator', () => {
  const config = new ConfigManager({ dataDir: './data', dataFile: 'test_dump.json' });
  const dataStore = new DataStore(16);
  const persistence = new PersistenceManager(config, dataStore);
  const pubsub = new PubSubManager();
  const registry = new CommandRegistry();

  const mockSocket = {
    remoteAddress: '127.0.0.1',
    write: () => {},
    end: () => {},
  };
  const client = new ClientSession(1, mockSocket, false);

  const getCtx = () => ({
    client,
    dataStore,
    currentDb: dataStore.getDb(client.currentDbIndex),
    persistence,
    config,
    pubsub,
    connectedClientsCount: 1,
  });

  test('RESP Parser works with bulk and inline commands', () => {
    const parser = new RespParser();
    parser.append(Buffer.from('*3\r\n$3\r\nSET\r\n$3\r\nfoo\r\n$3\r\nbar\r\n'));
    const parsed = parser.parseNext();
    expect(parsed).toEqual(['SET', 'foo', 'bar']);

    parser.append(Buffer.from('PING\r\n'));
    const inline = parser.parseNext();
    expect(inline).toEqual(['PING']);
  });

  test('TTL and Expiration: active and passive expiration', async () => {
    // 1. SET with PX (milliseconds)
    await registry.execute(['SET', 'temp_key', 'temp_val', 'PX', '50'], getCtx());
    let exists = await registry.execute(['EXISTS', 'temp_key'], getCtx());
    expect(exists).toBe(':1\r\n');

    // Wait 70ms for key to expire
    await Bun.sleep(70);

    // Passive check: key should be gone
    exists = await registry.execute(['EXISTS', 'temp_key'], getCtx());
    expect(exists).toBe(':0\r\n');

    let getVal = await registry.execute(['GET', 'temp_key'], getCtx());
    expect(getVal).toBe('$-1\r\n');

    // 2. EXPIRE command + active sweeper
    await registry.execute(['SET', 'auto_sweep', 'val'], getCtx());
    await registry.execute(['PEXPIRE', 'auto_sweep', '40'], getCtx());
    await Bun.sleep(60);

    // Run active sweeper
    const swept = dataStore.sweepExpiredKeys();
    expect(swept).toBeGreaterThanOrEqual(1);
    expect(dataStore.getDb(0).exists('auto_sweep')).toBe(false);
  });

  test('String commands: SET, GET, INCR, APPEND', async () => {
    let res = await registry.execute(['SET', 'num', '10'], getCtx());
    expect(res).toBe('+OK\r\n');

    res = await registry.execute(['GET', 'num'], getCtx());
    expect(res).toBe('$2\r\n10\r\n');

    res = await registry.execute(['INCR', 'num'], getCtx());
    expect(res).toBe(':11\r\n');

    res = await registry.execute(['APPEND', 'num', 'xyz'], getCtx());
    expect(res).toBe(':5\r\n');
  });

  test('Hash commands: HSET, HGET, HGETALL', async () => {
    await registry.execute(['HSET', 'user:1', 'name', 'Usmon', 'role', 'admin'], getCtx());
    const val = await registry.execute(['HGET', 'user:1', 'name'], getCtx());
    expect(val).toBe('$5\r\nUsmon\r\n');

    const all = await registry.execute(['HGETALL', 'user:1'], getCtx());
    expect(all).toContain('name');
    expect(all).toContain('Usmon');
  });

  test('List commands: LPUSH, RPUSH, LRANGE, LPOP', async () => {
    await registry.execute(['RPUSH', 'mylist', 'a', 'b', 'c'], getCtx());
    const range = await registry.execute(['LRANGE', 'mylist', '0', '-1'], getCtx());
    expect(range).toContain('a');
    expect(range).toContain('b');
    expect(range).toContain('c');

    const pop = await registry.execute(['LPOP', 'mylist'], getCtx());
    expect(pop).toBe('$1\r\na\r\n');
  });

  test('Set commands: SADD, SMEMBERS, SISMEMBER', async () => {
    await registry.execute(['SADD', 'myset', 'apple', 'banana'], getCtx());
    const isMember = await registry.execute(['SISMEMBER', 'myset', 'apple'], getCtx());
    expect(isMember).toBe(':1\r\n');
  });

  test('Sorted Set commands: ZADD, ZRANGE, ZSCORE', async () => {
    await registry.execute(['ZADD', 'myzset', '10', 'player1', '20', 'player2'], getCtx());
    const score = await registry.execute(['ZSCORE', 'myzset', 'player1'], getCtx());
    expect(score).toBe('$2\r\n10\r\n');

    const range = await registry.execute(['ZRANGE', 'myzset', '0', '-1'], getCtx());
    expect(range).toContain('player1');
    expect(range).toContain('player2');
  });

  test('Dynamic Configuration (CONFIG GET, CONFIG SET, AUTH)', async () => {
    // 1. CONFIG GET
    let res = await registry.execute(['CONFIG', 'GET', 'port'], getCtx());
    expect(res).toContain('port');

    // 2. CONFIG SET requirepass dynamically
    res = await registry.execute(['CONFIG', 'SET', 'requirepass', 'secret123'], getCtx());
    expect(res).toBe('+OK\r\n');
    expect(config.getProperty('requirepass')).toBe('secret123');

    // New unauthenticated client should be rejected
    const unauthClient = new ClientSession(2, mockSocket, true);
    const unauthCtx = { ...getCtx(), client: unauthClient };
    let failRes = await registry.execute(['GET', 'num'], unauthCtx);
    expect(failRes).toBe('-NOAUTH Authentication required.\r\n');

    // Authenticate
    let authRes = await registry.execute(['AUTH', 'secret123'], unauthCtx);
    expect(authRes).toBe('+OK\r\n');

    let successRes = await registry.execute(['GET', 'num'], unauthCtx);
    expect(successRes).toBe('$5\r\n11xyz\r\n');

    // Remove password dynamically
    await registry.execute(['CONFIG', 'SET', 'requirepass', ''], getCtx());
    expect(config.getProperty('requirepass')).toBeNull();

    // 3. CONFIG REWRITE
    const rewriteRes = await registry.execute(['CONFIG', 'REWRITE'], getCtx());
    expect(rewriteRes).toBe('+OK\r\n');
  });

  test('JSON Persistence: SAVE and load', async () => {
    await persistence.save();
    const filePath = config.getPathToDataFile();
    const file = Bun.file(filePath);
    expect(await file.exists()).toBe(true);

    const content = JSON.parse(await file.text());
    expect(content.databases['0']).toBeDefined();
    expect(content.databases['0']['num'].value).toBe('11xyz');
  });
});

