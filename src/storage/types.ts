import type { SortedSet } from './zset.ts';
import type { Stream } from './stream.ts';

export type RedisDataType = 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream';

export interface BaseEntry {
  type: RedisDataType;
  expiresAt: number | null;
}

export interface StringEntry extends BaseEntry {
  type: 'string';
  value: string;
}

export interface HashEntry extends BaseEntry {
  type: 'hash';
  value: Map<string, string>;
}

export interface ListEntry extends BaseEntry {
  type: 'list';
  value: string[];
}

export interface SetEntry extends BaseEntry {
  type: 'set';
  value: Set<string>;
}

export interface ZSetEntry extends BaseEntry {
  type: 'zset';
  value: SortedSet;
}

export interface StreamDbEntry extends BaseEntry {
  type: 'stream';
  value: Stream;
}

export type StorageEntry =
  | StringEntry
  | HashEntry
  | ListEntry
  | SetEntry
  | ZSetEntry
  | StreamDbEntry;

/**
 * Serializable format for persistence in JSON file
 */
export interface SerializedEntry {
  type: RedisDataType;
  expiresAt: number | null;
  value: unknown;
}

export interface DatabaseDump {
  version: number;
  savedAt: string;
  databases: Record<string, Record<string, SerializedEntry>>;
}
