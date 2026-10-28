export interface StreamEntry {
  id: string; // e.g. "1600000000000-0"
  fields: [string, string][]; // [key, value] pairs
}

export class Stream {
  private entries: StreamEntry[] = [];
  private lastTimestamp = 0;
  private lastSequence = 0;

  public get length(): number {
    return this.entries.length;
  }

  public add(
    idPattern: string,
    fieldPairs: [string, string][],
    maxLen?: number
  ): string {
    const id = this.generateId(idPattern);
    this.entries.push({ id, fields: fieldPairs });

    if (maxLen !== undefined && maxLen > 0 && this.entries.length > maxLen) {
      const toRemove = this.entries.length - maxLen;
      this.entries.splice(0, toRemove);
    }

    return id;
  }

  public range(
    start: string,
    end: string,
    count?: number
  ): StreamEntry[] {
    const s = start === '-' ? '' : start;
    const e = end === '+' ? '\uffff' : end;

    const matched: StreamEntry[] = [];
    for (const entry of this.entries) {
      if (this.compareIds(entry.id, s) >= 0 && this.compareIds(entry.id, e) <= 0) {
        matched.push(entry);
        if (count !== undefined && count > 0 && matched.length >= count) {
          break;
        }
      }
    }
    return matched;
  }

  public revRange(
    end: string,
    start: string,
    count?: number
  ): StreamEntry[] {
    const s = start === '-' ? '' : start;
    const e = end === '+' ? '\uffff' : end;

    const matched: StreamEntry[] = [];
    for (let i = this.entries.length - 1; i >= 0; i--) {
      const entry = this.entries[i]!;
      if (this.compareIds(entry.id, e) <= 0 && this.compareIds(entry.id, s) >= 0) {
        matched.push(entry);
        if (count !== undefined && count > 0 && matched.length >= count) {
          break;
        }
      }
    }
    return matched;
  }

  public readAfter(lastId: string, count?: number): StreamEntry[] {
    const matched: StreamEntry[] = [];
    for (const entry of this.entries) {
      if (this.compareIds(entry.id, lastId) > 0) {
        matched.push(entry);
        if (count !== undefined && count > 0 && matched.length >= count) {
          break;
        }
      }
    }
    return matched;
  }

  public delete(ids: string[]): number {
    const set = new Set(ids);
    const initialLen = this.entries.length;
    this.entries = this.entries.filter((entry) => !set.has(entry.id));
    return initialLen - this.entries.length;
  }

  public trim(maxLen: number): number {
    if (this.entries.length > maxLen) {
      const removed = this.entries.length - maxLen;
      this.entries.splice(0, removed);
      return removed;
    }
    return 0;
  }

  public toJSON(): StreamEntry[] {
    return this.entries;
  }

  public static fromJSON(entries: StreamEntry[]): Stream {
    const stream = new Stream();
    stream.entries = entries;
    if (entries.length > 0) {
      const last = entries[entries.length - 1]!;
      const [tsStr, seqStr] = last.id.split('-');
      stream.lastTimestamp = parseInt(tsStr || '0', 10);
      stream.lastSequence = parseInt(seqStr || '0', 10);
    }
    return stream;
  }

  private generateId(idPattern: string): string {
    const now = Date.now();

    if (idPattern === '*') {
      if (now === this.lastTimestamp) {
        this.lastSequence++;
      } else {
        this.lastTimestamp = now;
        this.lastSequence = 0;
      }
      return `${this.lastTimestamp}-${this.lastSequence}`;
    }

    if (idPattern.endsWith('-*')) {
      const prefix = parseInt(idPattern.slice(0, -2), 10);
      const seq = prefix === this.lastTimestamp ? this.lastSequence + 1 : 0;
      this.lastTimestamp = prefix;
      this.lastSequence = seq;
      return `${prefix}-${seq}`;
    }

    // Explicit ID (e.g. 1526972288071-0)
    const [tsStr, seqStr] = idPattern.split('-');
    const ts = parseInt(tsStr || '0', 10);
    const seq = parseInt(seqStr || '0', 10);
    this.lastTimestamp = ts;
    this.lastSequence = seq;
    return idPattern;
  }

  private compareIds(id1: string, id2: string): number {
    if (!id2) return 1;
    if (id2 === '\uffff') return -1;

    const [t1 = '0', s1 = '0'] = id1.split('-');
    const [t2 = '0', s2 = '0'] = id2.split('-');

    const nT1 = BigInt(t1);
    const nT2 = BigInt(t2);

    if (nT1 !== nT2) {
      return nT1 < nT2 ? -1 : 1;
    }

    const nS1 = BigInt(s1);
    const nS2 = BigInt(s2);
    if (nS1 !== nS2) {
      return nS1 < nS2 ? -1 : 1;
    }
    return 0;
  }
}

