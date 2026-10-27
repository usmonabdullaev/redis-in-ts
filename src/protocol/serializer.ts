export class RespSerializer {
  public static ok(): string {
    return '+OK\r\n';
  }

  public static pong(): string {
    return '+PONG\r\n';
  }

  public static nullBulk(): string {
    return '$-1\r\n';
  }

  public static nullArray(): string {
    return '*-1\r\n';
  }

  public static simpleString(str: string): string {
    return `+${str}\r\n`;
  }

  public static error(message: string, prefix = 'ERR'): string {
    if (message.startsWith('ERR ') || message.startsWith('WRONGTYPE ') || message.startsWith('NOAUTH ')) {
      return `-${message}\r\n`;
    }
    return `-${prefix} ${message}\r\n`;
  }

  public static wrongType(): string {
    return '-WRONGTYPE Operation against a key holding the wrong kind of value\r\n';
  }

  public static integer(num: number | bigint): string {
    return `:${num.toString()}\r\n`;
  }

  public static bulkString(val: string | null | undefined): string {
    if (val === null || val === undefined) {
      return '$-1\r\n';
    }
    const byteLength = Buffer.byteLength(val);
    return `$${byteLength}\r\n${val}\r\n`;
  }

  public static array(items: unknown[] | null): string {
    if (items === null) {
      return '*-1\r\n';
    }
    let result = `*${items.length}\r\n`;
    for (const item of items) {
      result += RespSerializer.serialize(item);
    }
    return result;
  }

  public static serialize(value: unknown): string {
    if (value === null || value === undefined) {
      return RespSerializer.nullBulk();
    }
    if (typeof value === 'string') {
      return RespSerializer.bulkString(value);
    }
    if (typeof value === 'number' || typeof value === 'bigint') {
      return RespSerializer.integer(value);
    }
    if (typeof value === 'boolean') {
      return RespSerializer.integer(value ? 1 : 0);
    }
    if (Array.isArray(value)) {
      return RespSerializer.array(value);
    }
    if (value instanceof Set) {
      return RespSerializer.array(Array.from(value));
    }
    if (value instanceof Map) {
      const arr: unknown[] = [];
      for (const [k, v] of value.entries()) {
        arr.push(k, v);
      }
      return RespSerializer.array(arr);
    }
    if (typeof value === 'object') {
      const arr: unknown[] = [];
      for (const [k, v] of Object.entries(value)) {
        arr.push(k, v);
      }
      return RespSerializer.array(arr);
    }

    return RespSerializer.bulkString(String(value));
  }
}
