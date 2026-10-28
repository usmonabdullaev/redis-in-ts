export class RespParser {
  private buffer: Buffer = Buffer.alloc(0);

  public append(chunk: Uint8Array | Buffer): void {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    this.buffer = this.buffer.length === 0 ? buf : Buffer.concat([this.buffer, buf]);
  }

  public hasData(): boolean {
    return this.buffer.length > 0;
  }

  public reset(): void {
    this.buffer = Buffer.alloc(0);
  }

  /**
   * Attempts to parse the next command from the buffer.
   * Returns array of string arguments if a full command is ready, or null if incomplete.
   */
  public parseNext(): string[] | null {
    if (this.buffer.length === 0) return null;

    // Check if it's a RESP array command (starts with '*')
    if (this.buffer[0] === 42 /* '*' */) {
      return this.parseRespArray();
    }

    // Otherwise, treat as an inline command (e.g. telnet: "PING\r\n")
    return this.parseInlineCommand();
  }

  private parseRespArray(): string[] | null {
    const crlfIndex = this.indexOfCrlf(0);
    if (crlfIndex === -1) return null; // Incomplete line

    const countStr = this.buffer.toString('utf8', 1, crlfIndex);
    const count = parseInt(countStr, 10);

    if (isNaN(count)) {
      // Malformed, skip to next line
      this.buffer = this.buffer.subarray(crlfIndex + 2);
      return null;
    }

    if (count <= 0) {
      this.buffer = this.buffer.subarray(crlfIndex + 2);
      return [];
    }

    let offset = crlfIndex + 2;
    const args: string[] = [];

    for (let i = 0; i < count; i++) {
      if (offset >= this.buffer.length) return null;

      const prefix = this.buffer[offset];

      if (prefix === 36 /* '$' */) {
        // Bulk string
        const nextCrlf = this.indexOfCrlf(offset);
        if (nextCrlf === -1) return null;

        const lenStr = this.buffer.toString('utf8', offset + 1, nextCrlf);
        const len = parseInt(lenStr, 10);

        if (isNaN(len)) return null;

        if (len === -1) {
          args.push('');
          offset = nextCrlf + 2;
          continue;
        }

        const dataStart = nextCrlf + 2;
        const dataEnd = dataStart + len;

        // Need dataEnd + 2 for \r\n
        if (this.buffer.length < dataEnd + 2) {
          return null; // Not enough data yet
        }

        const val = this.buffer.toString('binary', dataStart, dataEnd);
        args.push(val);
        offset = dataEnd + 2; // Skip \r\n after bulk string
      } else if (prefix === 58 /* ':' */ || prefix === 43 /* '+' */) {
        // Simple string or integer
        const nextCrlf = this.indexOfCrlf(offset);
        if (nextCrlf === -1) return null;
        const val = this.buffer.toString('utf8', offset + 1, nextCrlf);
        args.push(val);
        offset = nextCrlf + 2;
      } else {
        // Unexpected prefix
        return null;
      }
    }

    // Successfully parsed full array command, advance buffer
    this.buffer = this.buffer.subarray(offset);
    return args;
  }

  private parseInlineCommand(): string[] | null {
    let crlfIndex = this.buffer.indexOf(10 /* '\n' */);
    if (crlfIndex === -1) return null;

    let end = crlfIndex;
    if (end > 0 && this.buffer[end - 1] === 13 /* '\r' */) {
      end--;
    }

    const line = this.buffer.toString('utf8', 0, end).trim();
    this.buffer = this.buffer.subarray(crlfIndex + 1);

    if (line.length === 0) {
      return this.parseNext();
    }

    return this.splitInlineArgs(line);
  }

  private splitInlineArgs(line: string): string[] {
    const args: string[] = [];
    let current = '';
    let inQuotes = false;
    let quoteChar = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if ((char === '"' || char === "'") && (!inQuotes || quoteChar === char)) {
        inQuotes = !inQuotes;
        quoteChar = inQuotes ? char : '';
      } else if (/\s/.test(char!) && !inQuotes) {
        if (current.length > 0) {
          args.push(current);
          current = '';
        }
      } else {
        current += char;
      }
    }

    if (current.length > 0) {
      args.push(current);
    }

    return args;
  }

  private indexOfCrlf(fromIndex: number): number {
    for (let i = fromIndex; i < this.buffer.length - 1; i++) {
      if (this.buffer[i] === 13 && this.buffer[i + 1] === 10) {
        return i;
      }
    }
    return -1;
  }
}
