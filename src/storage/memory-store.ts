import { matchGlob } from '../utils/glob.ts';
import { SortedSet, type ZNode } from './zset.ts';
import { Stream, type StreamEntry } from './stream.ts';
import type {
  StorageEntry,
  StringEntry,
  HashEntry,
  ListEntry,
  SetEntry,
  ZSetEntry,
  StreamDbEntry,
  SerializedEntry,
} from './types.ts';

export class MemoryStore {
  private entries: Map<string, StorageEntry> = new Map();
  public readonly id: number;

  constructor(id: number) {
    this.id = id;
  }

  // --- Expiration & Key Lifecycle ---

  public getRawEntry(key: string): StorageEntry | null {
    const entry = this.entries.get(key);
    if (!entry) return null;

    if (entry.expiresAt !== null && Date.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  public exists(key: string): boolean {
    return this.getRawEntry(key) !== null;
  }

  public delete(key: string): boolean {
    return this.entries.delete(key);
  }

  public deleteMultiple(keys: string[]): number {
    let count = 0;
    for (const key of keys) {
      if (this.entries.delete(key)) {
        count++;
      }
    }
    return count;
  }

  public type(key: string): string {
    const entry = this.getRawEntry(key);
    return entry ? entry.type : 'none';
  }

  public expire(key: string, seconds: number): boolean {
    return this.pexpire(key, seconds * 1000);
  }

  public pexpire(key: string, milliseconds: number): boolean {
    const entry = this.getRawEntry(key);
    if (!entry) return false;
    entry.expiresAt = Date.now() + milliseconds;
    return true;
  }

  public expireAt(key: string, unixSeconds: number): boolean {
    const entry = this.getRawEntry(key);
    if (!entry) return false;
    entry.expiresAt = unixSeconds * 1000;
    return true;
  }

  public pexpireAt(key: string, unixMs: number): boolean {
    const entry = this.getRawEntry(key);
    if (!entry) return false;
    entry.expiresAt = unixMs;
    return true;
  }

  public ttl(key: string): number {
    const entry = this.getRawEntry(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    const diff = Math.ceil((entry.expiresAt - Date.now()) / 1000);
    return diff > 0 ? diff : -2;
  }

  public pttl(key: string): number {
    const entry = this.getRawEntry(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    const diff = entry.expiresAt - Date.now();
    return diff > 0 ? diff : -2;
  }

  public persist(key: string): boolean {
    const entry = this.getRawEntry(key);
    if (!entry || entry.expiresAt === null) return false;
    entry.expiresAt = null;
    return true;
  }

  public rename(oldKey: string, newKey: string): boolean {
    const entry = this.getRawEntry(oldKey);
    if (!entry) return false;
    this.entries.set(newKey, entry);
    this.entries.delete(oldKey);
    return true;
  }

  public renamenx(oldKey: string, newKey: string): boolean {
    if (this.exists(newKey)) return false;
    return this.rename(oldKey, newKey);
  }

  public keys(pattern: string): string[] {
    const results: string[] = [];
    const now = Date.now();
    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAt !== null && now >= entry.expiresAt) {
        this.entries.delete(key);
        continue;
      }
      if (matchGlob(pattern, key)) {
        results.push(key);
      }
    }
    return results;
  }

  public randomKey(): string | null {
    const keys = Array.from(this.entries.keys());
    if (keys.length === 0) return null;
    const rand = keys[Math.floor(Math.random() * keys.length)]!;
    if (this.exists(rand)) return rand;
    return null;
  }

  public dbsize(): number {
    // Purge expired keys quickly
    const now = Date.now();
    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAt !== null && now >= entry.expiresAt) {
        this.entries.delete(key);
      }
    }
    return this.entries.size;
  }

  public flush(): void {
    this.entries.clear();
  }

  public sweepExpiredKeys(limit = 50): number {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAt !== null && now >= entry.expiresAt) {
        this.entries.delete(key);
        cleaned++;
        if (cleaned >= limit) break;
      }
    }
    return cleaned;
  }

  // --- String Operations ---

  public set(
    key: string,
    value: string,
    options?: {
      exSeconds?: number;
      pxMilliseconds?: number;
      exatUnixSeconds?: number;
      pxatUnixMs?: number;
      nx?: boolean;
      xx?: boolean;
      keepTtl?: boolean;
    }
  ): boolean {
    const existing = this.getRawEntry(key);

    if (options?.nx && existing) return false;
    if (options?.xx && !existing) return false;

    let expiresAt: number | null = null;
    if (options?.keepTtl && existing) {
      expiresAt = existing.expiresAt;
    } else if (options?.pxMilliseconds !== undefined) {
      expiresAt = Date.now() + options.pxMilliseconds;
    } else if (options?.exSeconds !== undefined) {
      expiresAt = Date.now() + options.exSeconds * 1000;
    } else if (options?.pxatUnixMs !== undefined) {
      expiresAt = options.pxatUnixMs;
    } else if (options?.exatUnixSeconds !== undefined) {
      expiresAt = options.exatUnixSeconds * 1000;
    }

    const entry: StringEntry = {
      type: 'string',
      value,
      expiresAt,
    };

    this.entries.set(key, entry);
    return true;
  }

  public get(key: string): string | null {
    const entry = this.getRawEntry(key);
    if (!entry) return null;
    if (entry.type !== 'string') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value;
  }

  public getSet(key: string, value: string): string | null {
    const old = this.get(key);
    this.set(key, value);
    return old;
  }

  public getDel(key: string): string | null {
    const old = this.get(key);
    if (old !== null) {
      this.delete(key);
    }
    return old;
  }

  public append(key: string, value: string): number {
    const entry = this.getRawEntry(key);
    if (!entry) {
      this.set(key, value);
      return value.length;
    }
    if (entry.type !== 'string') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    entry.value += value;
    return entry.value.length;
  }

  public strlen(key: string): number {
    const val = this.get(key);
    return val ? val.length : 0;
  }

  public incrBy(key: string, delta: number): number {
    const entry = this.getRawEntry(key);
    let num = 0;
    if (entry) {
      if (entry.type !== 'string') {
        throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
      }
      num = parseInt(entry.value, 10);
      if (isNaN(num) || num.toString() !== entry.value.trim()) {
        throw new Error('ERR value is not an integer or out of range');
      }
    }
    num += delta;
    this.set(key, num.toString(), { keepTtl: true });
    return num;
  }

  public incrByFloat(key: string, delta: number): number {
    const entry = this.getRawEntry(key);
    let num = 0;
    if (entry) {
      if (entry.type !== 'string') {
        throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
      }
      num = parseFloat(entry.value);
      if (isNaN(num)) {
        throw new Error('ERR value is not a valid float');
      }
    }
    num += delta;
    const str = num.toString();
    this.set(key, str, { keepTtl: true });
    return num;
  }

  // --- Hash Operations ---

  public hset(key: string, field: string, value: string): number {
    return this.hmset(key, [[field, value]]);
  }

  public hmset(key: string, pairs: [string, string][]): number {
    let entry = this.getRawEntry(key);
    if (!entry) {
      const map = new Map<string, string>();
      for (const [f, v] of pairs) {
        map.set(f, v);
      }
      const newEntry: HashEntry = {
        type: 'hash',
        value: map,
        expiresAt: null,
      };
      this.entries.set(key, newEntry);
      return pairs.length;
    }

    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    let added = 0;
    for (const [f, v] of pairs) {
      if (!entry.value.has(f)) added++;
      entry.value.set(f, v);
    }
    return added;
  }

  public hget(key: string, field: string): string | null {
    const entry = this.getRawEntry(key);
    if (!entry) return null;
    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.get(field) ?? null;
  }

  public hdel(key: string, fields: string[]): number {
    const entry = this.getRawEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    let count = 0;
    for (const field of fields) {
      if (entry.value.delete(field)) {
        count++;
      }
    }
    if (entry.value.size === 0) {
      this.delete(key);
    }
    return count;
  }

  public hexists(key: string, field: string): boolean {
    const entry = this.getRawEntry(key);
    if (!entry) return false;
    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.has(field);
  }

  public hgetall(key: string): [string, string][] {
    const entry = this.getRawEntry(key);
    if (!entry) return [];
    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return Array.from(entry.value.entries());
  }

  public hkeys(key: string): string[] {
    const entry = this.getRawEntry(key);
    if (!entry) return [];
    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return Array.from(entry.value.keys());
  }

  public hvals(key: string): string[] {
    const entry = this.getRawEntry(key);
    if (!entry) return [];
    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return Array.from(entry.value.values());
  }

  public hlen(key: string): number {
    const entry = this.getRawEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'hash') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.size;
  }

  public hincrby(key: string, field: string, increment: number): number {
    const current = this.hget(key, field);
    let val = 0;
    if (current !== null) {
      val = parseInt(current, 10);
      if (isNaN(val)) {
        throw new Error('ERR hash value is not an integer');
      }
    }
    val += increment;
    this.hset(key, field, val.toString());
    return val;
  }

  // --- List Operations ---

  public lpush(key: string, values: string[]): number {
    let entry = this.getRawEntry(key);
    if (!entry) {
      entry = {
        type: 'list',
        value: [],
        expiresAt: null,
      };
      this.entries.set(key, entry);
    } else if (entry.type !== 'list') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    for (const v of values) {
      entry.value.unshift(v);
    }
    return entry.value.length;
  }

  public rpush(key: string, values: string[]): number {
    let entry = this.getRawEntry(key);
    if (!entry) {
      entry = {
        type: 'list',
        value: [],
        expiresAt: null,
      };
      this.entries.set(key, entry);
    } else if (entry.type !== 'list') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    entry.value.push(...values);
    return entry.value.length;
  }

  public lpop(key: string, count = 1): string[] | string | null {
    const entry = this.getRawEntry(key);
    if (!entry) return null;
    if (entry.type !== 'list') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    if (entry.value.length === 0) return null;

    if (count === 1) {
      const item = entry.value.shift() ?? null;
      if (entry.value.length === 0) this.delete(key);
      return item;
    }

    const items: string[] = [];
    for (let i = 0; i < count && entry.value.length > 0; i++) {
      const el = entry.value.shift();
      if (el !== undefined) items.push(el);
    }
    if (entry.value.length === 0) this.delete(key);
    return items;
  }

  public rpop(key: string, count = 1): string[] | string | null {
    const entry = this.getRawEntry(key);
    if (!entry) return null;
    if (entry.type !== 'list') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    if (entry.value.length === 0) return null;

    if (count === 1) {
      const item = entry.value.pop() ?? null;
      if (entry.value.length === 0) this.delete(key);
      return item;
    }

    const items: string[] = [];
    for (let i = 0; i < count && entry.value.length > 0; i++) {
      const el = entry.value.pop();
      if (el !== undefined) items.push(el);
    }
    if (entry.value.length === 0) this.delete(key);
    return items;
  }

  public lrange(key: string, start: number, stop: number): string[] {
    const entry = this.getRawEntry(key);
    if (!entry) return [];
    if (entry.type !== 'list') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    const len = entry.value.length;
    let s = start < 0 ? Math.max(0, len + start) : Math.min(start, len);
    let e = stop < 0 ? Math.max(0, len + stop) : Math.min(stop, len - 1);
    if (s > e || s >= len) return [];
    return entry.value.slice(s, e + 1);
  }

  public llen(key: string): number {
    const entry = this.getRawEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'list') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.length;
  }

  public lindex(key: string, index: number): string | null {
    const entry = this.getRawEntry(key);
    if (!entry) return null;
    if (entry.type !== 'list') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    const idx = index < 0 ? entry.value.length + index : index;
    return entry.value[idx] ?? null;
  }

  public lrem(key: string, count: number, element: string): number {
    const entry = this.getRawEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'list') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    let removed = 0;
    if (count === 0) {
      // Remove all elements equal to value
      const initialLen = entry.value.length;
      entry.value = entry.value.filter((x) => x !== element);
      removed = initialLen - entry.value.length;
    } else if (count > 0) {
      // Remove from head to tail
      for (let i = 0; i < entry.value.length && removed < count; ) {
        if (entry.value[i] === element) {
          entry.value.splice(i, 1);
          removed++;
        } else {
          i++;
        }
      }
    } else {
      // Remove from tail to head
      const absCount = Math.abs(count);
      for (let i = entry.value.length - 1; i >= 0 && removed < absCount; i--) {
        if (entry.value[i] === element) {
          entry.value.splice(i, 1);
          removed++;
        }
      }
    }

    if (entry.value.length === 0) {
      this.delete(key);
    }
    return removed;
  }

  // --- Set Operations ---

  public sadd(key: string, members: string[]): number {
    let entry = this.getRawEntry(key);
    if (!entry) {
      entry = {
        type: 'set',
        value: new Set(),
        expiresAt: null,
      };
      this.entries.set(key, entry);
    } else if (entry.type !== 'set') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    let added = 0;
    for (const m of members) {
      if (!entry.value.has(m)) {
        entry.value.add(m);
        added++;
      }
    }
    return added;
  }

  public smembers(key: string): string[] {
    const entry = this.getRawEntry(key);
    if (!entry) return [];
    if (entry.type !== 'set') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return Array.from(entry.value);
  }

  public srem(key: string, members: string[]): number {
    const entry = this.getRawEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'set') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    let removed = 0;
    for (const m of members) {
      if (entry.value.delete(m)) {
        removed++;
      }
    }
    if (entry.value.size === 0) {
      this.delete(key);
    }
    return removed;
  }

  public sismember(key: string, member: string): boolean {
    const entry = this.getRawEntry(key);
    if (!entry) return false;
    if (entry.type !== 'set') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.has(member);
  }

  public scard(key: string): number {
    const entry = this.getRawEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'set') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.size;
  }

  public spop(key: string, count = 1): string[] | string | null {
    const entry = this.getRawEntry(key);
    if (!entry || entry.value.size === 0) return null;
    if (entry.type !== 'set') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    const items = Array.from(entry.value);
    const popped: string[] = [];
    const numToPop = Math.min(count, items.length);

    for (let i = 0; i < numToPop; i++) {
      const idx = Math.floor(Math.random() * items.length);
      const [item] = items.splice(idx, 1);
      if (item !== undefined) {
        entry.value.delete(item);
        popped.push(item);
      }
    }

    if (entry.value.size === 0) {
      this.delete(key);
    }

    return count === 1 ? popped[0] ?? null : popped;
  }

  // --- Sorted Set (ZSet) Operations ---

  public zadd(key: string, members: { member: string; score: number }[]): number {
    let entry = this.getRawEntry(key);
    if (!entry) {
      entry = {
        type: 'zset',
        value: new SortedSet(),
        expiresAt: null,
      };
      this.entries.set(key, entry);
    } else if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }

    let added = 0;
    for (const item of members) {
      if (entry.value.add(item.member, item.score)) {
        added++;
      }
    }
    return added;
  }

  public zscore(key: string, member: string): number | null {
    const entry = this.getRawEntry(key);
    if (!entry) return null;
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.getScore(member);
  }

  public zrange(key: string, start: number, stop: number, withScores = false): (string | number)[] {
    const entry = this.getRawEntry(key);
    if (!entry) return [];
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.range(start, stop, withScores);
  }

  public zrevrange(key: string, start: number, stop: number, withScores = false): (string | number)[] {
    const entry = this.getRawEntry(key);
    if (!entry) return [];
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.revRange(start, stop, withScores);
  }

  public zrem(key: string, members: string[]): number {
    const entry = this.getRawEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    let removed = 0;
    for (const m of members) {
      if (entry.value.remove(m)) {
        removed++;
      }
    }
    if (entry.value.size === 0) {
      this.delete(key);
    }
    return removed;
  }

  public zcard(key: string): number {
    const entry = this.getRawEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.size;
  }

  public zcount(key: string, min: number, max: number): number {
    const entry = this.getRawEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.count(min, max);
  }

  public zincrby(key: string, increment: number, member: string): number {
    let entry = this.getRawEntry(key);
    if (!entry) {
      entry = {
        type: 'zset',
        value: new SortedSet(),
        expiresAt: null,
      };
      this.entries.set(key, entry);
    } else if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.incrBy(member, increment);
  }

  public zrank(key: string, member: string): number | null {
    const entry = this.getRawEntry(key);
    if (!entry) return null;
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.getRank(member);
  }

  public zrevrank(key: string, member: string): number | null {
    const entry = this.getRawEntry(key);
    if (!entry) return null;
    if (entry.type !== 'zset') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.getRevRank(member);
  }

  // --- Stream Operations ---

  public xadd(key: string, id: string, fields: [string, string][], maxLen?: number): string {
    let entry = this.getRawEntry(key);
    if (!entry) {
      entry = {
        type: 'stream',
        value: new Stream(),
        expiresAt: null,
      };
      this.entries.set(key, entry);
    } else if (entry.type !== 'stream') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.add(id, fields, maxLen);
  }

  public xlen(key: string): number {
    const entry = this.getRawEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'stream') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.length;
  }

  public xrange(key: string, start: string, end: string, count?: number): StreamEntry[] {
    const entry = this.getRawEntry(key);
    if (!entry) return [];
    if (entry.type !== 'stream') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.range(start, end, count);
  }

  public xrevrange(key: string, end: string, start: string, count?: number): StreamEntry[] {
    const entry = this.getRawEntry(key);
    if (!entry) return [];
    if (entry.type !== 'stream') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.revRange(end, start, count);
  }

  public xread(key: string, lastId: string, count?: number): StreamEntry[] {
    const entry = this.getRawEntry(key);
    if (!entry) return [];
    if (entry.type !== 'stream') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.readAfter(lastId, count);
  }

  public xdel(key: string, ids: string[]): number {
    const entry = this.getRawEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'stream') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.delete(ids);
  }

  public xtrim(key: string, maxLen: number): number {
    const entry = this.getRawEntry(key);
    if (!entry) return 0;
    if (entry.type !== 'stream') {
      throw new Error('WRONGTYPE Operation against a key holding the wrong kind of value');
    }
    return entry.value.trim(maxLen);
  }

  // --- Serialization / Deserialization for JSON Persistence ---

  public exportData(): Record<string, SerializedEntry> {
    const now = Date.now();
    const result: Record<string, SerializedEntry> = {};

    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAt !== null && now >= entry.expiresAt) {
        continue;
      }

      let val: unknown;
      switch (entry.type) {
        case 'string':
          val = entry.value;
          break;
        case 'hash':
          val = Object.fromEntries(entry.value.entries());
          break;
        case 'list':
          val = entry.value;
          break;
        case 'set':
          val = Array.from(entry.value);
          break;
        case 'zset':
          val = entry.value.toJSON();
          break;
        case 'stream':
          val = entry.value.toJSON();
          break;
      }

      result[key] = {
        type: entry.type,
        expiresAt: entry.expiresAt,
        value: val,
      };
    }

    return result;
  }

  public importData(data: Record<string, SerializedEntry>): void {
    const now = Date.now();
    for (const [key, sEntry] of Object.entries(data)) {
      if (sEntry.expiresAt !== null && now >= sEntry.expiresAt) {
        continue; // skip expired
      }

      try {
        switch (sEntry.type) {
          case 'string':
            this.entries.set(key, {
              type: 'string',
              value: String(sEntry.value),
              expiresAt: sEntry.expiresAt,
            });
            break;
          case 'hash': {
            const map = new Map<string, string>();
            if (typeof sEntry.value === 'object' && sEntry.value !== null) {
              for (const [f, v] of Object.entries(sEntry.value)) {
                map.set(f, String(v));
              }
            }
            this.entries.set(key, {
              type: 'hash',
              value: map,
              expiresAt: sEntry.expiresAt,
            });
            break;
          }
          case 'list': {
            const arr = Array.isArray(sEntry.value) ? sEntry.value.map(String) : [];
            this.entries.set(key, {
              type: 'list',
              value: arr,
              expiresAt: sEntry.expiresAt,
            });
            break;
          }
          case 'set': {
            const set = new Set<string>();
            if (Array.isArray(sEntry.value)) {
              for (const m of sEntry.value) {
                set.add(String(m));
              }
            }
            this.entries.set(key, {
              type: 'set',
              value: set,
              expiresAt: sEntry.expiresAt,
            });
            break;
          }
          case 'zset': {
            const znodes: ZNode[] = [];
            if (Array.isArray(sEntry.value)) {
              for (const item of sEntry.value) {
                if (typeof item === 'object' && item !== null && 'member' in item && 'score' in item) {
                  znodes.push({
                    member: String((item as any).member),
                    score: Number((item as any).score),
                  });
                }
              }
            }
            this.entries.set(key, {
              type: 'zset',
              value: new SortedSet(znodes),
              expiresAt: sEntry.expiresAt,
            });
            break;
          }
          case 'stream': {
            const stream = Stream.fromJSON(Array.isArray(sEntry.value) ? sEntry.value : []);
            this.entries.set(key, {
              type: 'stream',
              value: stream,
              expiresAt: sEntry.expiresAt,
            });
            break;
          }
        }
      } catch {
        // Skip invalid entries gracefully
      }
    }
  }
}
