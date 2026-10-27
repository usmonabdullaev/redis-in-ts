export interface ZNode {
  member: string;
  score: number;
}

export class SortedSet {
  private dict: Map<string, number> = new Map();
  private sorted: ZNode[] = [];

  constructor(initialNodes?: ZNode[]) {
    if (initialNodes && initialNodes.length > 0) {
      for (const node of initialNodes) {
        this.add(node.member, node.score);
      }
    }
  }

  public get size(): number {
    return this.dict.size;
  }

  public add(member: string, score: number): boolean {
    const isNew = !this.dict.has(member);
    if (!isNew) {
      this.remove(member);
    }

    this.dict.set(member, score);
    const node: ZNode = { member, score };

    // Binary search insert position to keep array sorted
    let low = 0;
    let high = this.sorted.length;

    while (low < high) {
      const mid = (low + high) >>> 1;
      const midNode = this.sorted[mid]!;
      if (this.compare(node, midNode) < 0) {
        high = mid;
      } else {
        low = mid + 1;
      }
    }

    this.sorted.splice(low, 0, node);
    return isNew;
  }

  public remove(member: string): boolean {
    const score = this.dict.get(member);
    if (score === undefined) return false;

    this.dict.delete(member);
    const idx = this.sorted.findIndex((n) => n.member === member);
    if (idx !== -1) {
      this.sorted.splice(idx, 1);
    }
    return true;
  }

  public getScore(member: string): number | null {
    const s = this.dict.get(member);
    return s !== undefined ? s : null;
  }

  public incrBy(member: string, delta: number): number {
    const current = this.dict.get(member) ?? 0;
    const next = current + delta;
    this.add(member, next);
    return next;
  }

  public getRank(member: string): number | null {
    if (!this.dict.has(member)) return null;
    const idx = this.sorted.findIndex((n) => n.member === member);
    return idx !== -1 ? idx : null;
  }

  public getRevRank(member: string): number | null {
    const rank = this.getRank(member);
    if (rank === null) return null;
    return this.sorted.length - 1 - rank;
  }

  public count(min: number, max: number): number {
    let count = 0;
    for (const node of this.sorted) {
      if (node.score >= min && node.score <= max) {
        count++;
      }
    }
    return count;
  }

  public range(start: number, stop: number, withScores = false): (string | number)[] {
    const len = this.sorted.length;
    let s = start < 0 ? Math.max(0, len + start) : Math.min(start, len);
    let e = stop < 0 ? Math.max(0, len + stop) : Math.min(stop, len - 1);

    if (s > e || s >= len) return [];

    const result: (string | number)[] = [];
    for (let i = s; i <= e; i++) {
      const node = this.sorted[i]!;
      result.push(node.member);
      if (withScores) {
        result.push(node.score.toString());
      }
    }
    return result;
  }

  public revRange(start: number, stop: number, withScores = false): (string | number)[] {
    const len = this.sorted.length;
    let s = start < 0 ? Math.max(0, len + start) : Math.min(start, len);
    let e = stop < 0 ? Math.max(0, len + stop) : Math.min(stop, len - 1);

    if (s > e || s >= len) return [];

    const result: (string | number)[] = [];
    for (let i = s; i <= e; i++) {
      const revIdx = len - 1 - i;
      const node = this.sorted[revIdx]!;
      result.push(node.member);
      if (withScores) {
        result.push(node.score.toString());
      }
    }
    return result;
  }

  public rangeByScore(
    min: number,
    max: number,
    withScores = false,
    offset = 0,
    count = -1
  ): (string | number)[] {
    const matched: ZNode[] = [];
    for (const node of this.sorted) {
      if (node.score >= min && node.score <= max) {
        matched.push(node);
      }
    }

    const sliced = count < 0 ? matched.slice(offset) : matched.slice(offset, offset + count);
    const result: (string | number)[] = [];
    for (const node of sliced) {
      result.push(node.member);
      if (withScores) {
        result.push(node.score.toString());
      }
    }
    return result;
  }

  public toJSON(): ZNode[] {
    return [...this.sorted];
  }

  public static fromJSON(nodes: ZNode[]): SortedSet {
    return new SortedSet(nodes);
  }

  private compare(a: ZNode, b: ZNode): number {
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    return a.member.localeCompare(b.member);
  }
}
