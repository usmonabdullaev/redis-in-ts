import fengari from 'fengari';
import { decode as msgpackDecode, encode as msgpackEncode } from '@msgpack/msgpack';
import { createHash } from 'node:crypto';
import type { CommandContext } from '../commands/command.interface.ts';
import type { CommandRegistry } from '../commands/command-registry.ts';
import { RespSerializer } from '../protocol/serializer.ts';

const { lua, lauxlib, lualib, to_luastring } = fengari;

function toLuaBytes(strOrBuf: string | Uint8Array | Buffer): Uint8Array {
  if (strOrBuf instanceof Uint8Array || Buffer.isBuffer(strOrBuf)) {
    return new Uint8Array(strOrBuf);
  }
  return new Uint8Array(Buffer.from(strOrBuf, 'binary'));
}

export class LuaEngine {
  private scriptCache: Map<string, string> = new Map();

  public getSha1(script: string): string {
    return createHash('sha1').update(script).digest('hex');
  }

  public loadScript(script: string): string {
    const sha = this.getSha1(script);
    this.scriptCache.set(sha, script);
    return sha;
  }

  public getScript(sha: string): string | undefined {
    return this.scriptCache.get(sha);
  }

  public exists(shas: string[]): number[] {
    return shas.map((s) => (this.scriptCache.has(s) ? 1 : 0));
  }

  public flush(): void {
    this.scriptCache.clear();
  }

  public async eval(
    script: string,
    keys: string[],
    argv: string[],
    ctx: CommandContext,
    registry: CommandRegistry
  ): Promise<string> {
    // Cache script
    this.loadScript(script);

    // Create fresh Lua state
    const L = lauxlib.luaL_newstate();
    lualib.luaL_openlibs(L);

    // Setup KEYS table
    this.pushArrayToLua(L, keys);
    lua.lua_setglobal(L, to_luastring('KEYS'));

    // Setup ARGV table
    this.pushArrayToLua(L, argv);
    lua.lua_setglobal(L, to_luastring('ARGV'));

    // Setup cjson library
    this.registerCJson(L);

    // Setup cmsgpack library
    this.registerCMsgpack(L);

    // Setup redis library
    this.registerRedis(L, ctx, registry);

    // Execute script
    const loadStatus = lauxlib.luaL_loadstring(L, to_luastring(script));
    if (loadStatus !== 0) {
      const err = Buffer.from(lua.lua_tolstring(L, -1)).toString('utf8');
      lua.lua_close(L);
      return RespSerializer.error(`user_script: ${err}`);
    }

    const pcallStatus = lua.lua_pcall(L, 0, 1, 0);
    if (pcallStatus !== 0) {
      const err = Buffer.from(lua.lua_tolstring(L, -1)).toString('utf8');
      lua.lua_close(L);
      return RespSerializer.error(`user_script: ${err}`);
    }

    // Get return value
    const result = this.pullFromLua(L, -1);
    lua.lua_close(L);

    return this.serializeLuaResult(result);
  }

  private registerCJson(L: any): void {
    lua.lua_newtable(L);

    // cjson.decode
    lua.lua_pushcfunction(L, (L: any) => {
      const raw = lua.lua_tolstring(L, 1);
      if (!raw) {
        lua.lua_pushnil(L);
        return 1;
      }
      try {
        const str = Buffer.from(raw).toString('utf8');
        const parsed = JSON.parse(str);
        this.pushToLua(L, parsed);
      } catch {
        lua.lua_pushnil(L);
      }
      return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('decode'));

    // cjson.encode
    lua.lua_pushcfunction(L, (L: any) => {
      const obj = this.pullFromLua(L, 1);
      try {
        const json = JSON.stringify(obj);
        const bytes = toLuaBytes(json);
        lua.lua_pushlstring(L, bytes, bytes.length);
      } catch {
        const bytes = toLuaBytes('{}');
        lua.lua_pushlstring(L, bytes, bytes.length);
      }
      return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('encode'));

    lua.lua_setglobal(L, to_luastring('cjson'));
  }

  private registerCMsgpack(L: any): void {
    lua.lua_newtable(L);

    // cmsgpack.unpack
    lua.lua_pushcfunction(L, (L: any) => {
      const raw = lua.lua_tolstring(L, 1);
      if (!raw) {
        lua.lua_pushnil(L);
        return 1;
      }
      try {
        const unpacked = msgpackDecode(raw);
        this.pushToLua(L, unpacked);
      } catch (err) {
        lua.lua_pushnil(L);
      }
      return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('unpack'));

    // cmsgpack.pack
    lua.lua_pushcfunction(L, (L: any) => {
      const obj = this.pullFromLua(L, 1);
      try {
        const packed = msgpackEncode(obj);
        lua.lua_pushlstring(L, packed, packed.length);
      } catch {
        lua.lua_pushnil(L);
      }
      return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('pack'));

    lua.lua_setglobal(L, to_luastring('cmsgpack'));
  }

  private registerRedis(L: any, ctx: CommandContext, registry: CommandRegistry): void {
    lua.lua_newtable(L);

    // redis.call
    lua.lua_pushcfunction(L, (L: any) => {
      const top = lua.lua_gettop(L);
      const cmdArgs: string[] = [];
      for (let i = 1; i <= top; i++) {
        const val = this.pullFromLua(L, i);
        cmdArgs.push(val === null || val === undefined ? '' : String(val));
      }

      const rawResp = (registry as any).executeSync(cmdArgs, ctx);
      return this.pushRespToLua(L, rawResp, true);
    });
    lua.lua_setfield(L, -2, to_luastring('call'));

    // redis.pcall
    lua.lua_pushcfunction(L, (L: any) => {
      const top = lua.lua_gettop(L);
      const cmdArgs: string[] = [];
      for (let i = 1; i <= top; i++) {
        const val = this.pullFromLua(L, i);
        cmdArgs.push(val === null || val === undefined ? '' : String(val));
      }

      const rawResp = (registry as any).executeSync(cmdArgs, ctx);
      return this.pushRespToLua(L, rawResp, false);
    });
    lua.lua_setfield(L, -2, to_luastring('pcall'));

    // redis.sha1hex
    lua.lua_pushcfunction(L, (L: any) => {
      const raw = lua.lua_tolstring(L, 1);
      const str = Buffer.from(raw).toString('binary');
      const sha = createHash('sha1').update(str).digest('hex');
      const shaBytes = toLuaBytes(sha);
      lua.lua_pushlstring(L, shaBytes, shaBytes.length);
      return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('sha1hex'));

    // redis.status_reply
    lua.lua_pushcfunction(L, (L: any) => {
      const raw = lua.lua_tolstring(L, 1);
      lua.lua_newtable(L);
      lua.lua_pushlstring(L, raw, raw.length);
      lua.lua_setfield(L, -2, to_luastring('ok'));
      return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('status_reply'));

    // redis.error_reply
    lua.lua_pushcfunction(L, (L: any) => {
      const raw = lua.lua_tolstring(L, 1);
      lua.lua_newtable(L);
      lua.lua_pushlstring(L, raw, raw.length);
      lua.lua_setfield(L, -2, to_luastring('err'));
      return 1;
    });
    lua.lua_setfield(L, -2, to_luastring('error_reply'));

    lua.lua_setglobal(L, to_luastring('redis'));
  }

  private pushRespToLua(L: any, rawResp: string, raiseOnError: boolean): number {
    if (!rawResp) {
      lua.lua_pushnil(L);
      return 1;
    }

    const firstChar = rawResp[0];

    // Simple string (+OK\r\n)
    if (firstChar === '+') {
      const val = rawResp.slice(1, -2);
      if (val === 'OK') {
        lua.lua_newtable(L);
        const okBytes = toLuaBytes('OK');
        lua.lua_pushlstring(L, okBytes, okBytes.length);
        lua.lua_setfield(L, -2, to_luastring('ok'));
      } else {
        const bytes = toLuaBytes(val);
        lua.lua_pushlstring(L, bytes, bytes.length);
      }
      return 1;
    }

    // Error (-ERR message\r\n)
    if (firstChar === '-') {
      const errMsg = rawResp.slice(1, -2);
      if (raiseOnError) {
        lauxlib.luaL_error(L, to_luastring(errMsg));
        return 0;
      } else {
        lua.lua_newtable(L);
        const errBytes = toLuaBytes(errMsg);
        lua.lua_pushlstring(L, errBytes, errBytes.length);
        lua.lua_setfield(L, -2, to_luastring('err'));
        return 1;
      }
    }

    // Integer (:123\r\n)
    if (firstChar === ':') {
      const num = parseInt(rawResp.slice(1, -2), 10);
      lua.lua_pushinteger(L, num);
      return 1;
    }

    // Null bulk string ($-1\r\n)
    if (rawResp === '$-1\r\n' || rawResp === '*-1\r\n') {
      lua.lua_pushboolean(L, 0); // In Redis Lua, nil bulk reply is false boolean
      return 1;
    }

    // Bulk string ($5\r\nhello\r\n)
    if (firstChar === '$') {
      const crlf = rawResp.indexOf('\r\n');
      const val = rawResp.substring(crlf + 2, rawResp.length - 2);
      const bytes = toLuaBytes(val);
      lua.lua_pushlstring(L, bytes, bytes.length);
      return 1;
    }

    // Array (*2\r\n...)
    if (firstChar === '*') {
      const items = this.parseRespArray(rawResp);
      this.pushArrayToLua(L, items);
      return 1;
    }

    const bytes = toLuaBytes(rawResp);
    lua.lua_pushlstring(L, bytes, bytes.length);
    return 1;
  }

  private parseRespArray(rawResp: string): any[] {
    const lines = rawResp.split('\r\n');
    const count = parseInt(lines[0]!.slice(1), 10);
    const result: any[] = [];
    let idx = 1;

    for (let i = 0; i < count && idx < lines.length; i++) {
      const line = lines[idx]!;
      if (line.startsWith(':')) {
        result.push(parseInt(line.slice(1), 10));
        idx++;
      } else if (line.startsWith('+')) {
        result.push(line.slice(1));
        idx++;
      } else if (line === '$-1') {
        result.push(false);
        idx++;
      } else if (line.startsWith('$')) {
        result.push(lines[idx + 1] ?? '');
        idx += 2;
      } else {
        idx++;
      }
    }
    return result;
  }

  private pushArrayToLua(L: any, arr: any[]): void {
    lua.lua_createtable(L, arr.length, 0);
    for (let i = 0; i < arr.length; i++) {
      this.pushToLua(L, arr[i]);
      lua.lua_rawseti(L, -2, i + 1);
    }
  }

  public pushToLua(L: any, val: unknown): void {
    if (val === null || val === undefined) {
      lua.lua_pushnil(L);
    } else if (typeof val === 'boolean') {
      lua.lua_pushboolean(L, val ? 1 : 0);
    } else if (typeof val === 'number') {
      if (Number.isInteger(val)) {
        lua.lua_pushinteger(L, val);
      } else {
        lua.lua_pushnumber(L, val);
      }
    } else if (typeof val === 'bigint') {
      lua.lua_pushinteger(L, Number(val));
    } else if (typeof val === 'string') {
      const bytes = toLuaBytes(val);
      lua.lua_pushlstring(L, bytes, bytes.length);
    } else if (val instanceof Uint8Array || Buffer.isBuffer(val)) {
      const arr = new Uint8Array(val);
      lua.lua_pushlstring(L, arr, arr.length);
    } else if (Array.isArray(val)) {
      this.pushArrayToLua(L, val);
    } else if (typeof val === 'object') {
      const entries = Object.entries(val);
      lua.lua_createtable(L, 0, entries.length);
      for (const [k, v] of entries) {
        const kBytes = toLuaBytes(k);
        lua.lua_pushlstring(L, kBytes, kBytes.length);
        this.pushToLua(L, v);
        lua.lua_settable(L, -3);
      }
    } else {
      lua.lua_pushnil(L);
    }
  }

  public pullFromLua(L: any, idx: number): any {
    const type = lua.lua_type(L, idx);
    switch (type) {
      case lua.LUA_TNIL:
        return null;
      case lua.LUA_TBOOLEAN:
        return Boolean(lua.lua_toboolean(L, idx));
      case lua.LUA_TNUMBER:
        return lua.lua_tonumber(L, idx);
      case lua.LUA_TSTRING: {
        const ptr = lua.lua_tolstring(L, idx);
        return Buffer.from(ptr).toString('binary');
      }
      case lua.LUA_TTABLE: {
        const len = lua.lua_rawlen(L, idx);
        if (len > 0) {
          const arr: any[] = [];
          for (let i = 1; i <= len; i++) {
            lua.lua_rawgeti(L, idx, i);
            arr.push(this.pullFromLua(L, -1));
            lua.lua_pop(L, 1);
          }
          return arr;
        } else {
          // Check for status table { ok: "..." } or error table { err: "..." }
          lua.lua_getfield(L, idx, to_luastring('ok'));
          if (!lua.lua_isnil(L, -1)) {
            const okMsg = Buffer.from(lua.lua_tolstring(L, -1)).toString('utf8');
            lua.lua_pop(L, 1);
            return { ok: okMsg };
          }
          lua.lua_pop(L, 1);

          lua.lua_getfield(L, idx, to_luastring('err'));
          if (!lua.lua_isnil(L, -1)) {
            const errMsg = Buffer.from(lua.lua_tolstring(L, -1)).toString('utf8');
            lua.lua_pop(L, 1);
            return { err: errMsg };
          }
          lua.lua_pop(L, 1);

          const obj: Record<string, any> = {};
          lua.lua_pushnil(L);
          const actualIdx = idx < 0 ? idx - 1 : idx;
          while (lua.lua_next(L, actualIdx) !== 0) {
            const val = this.pullFromLua(L, -1);
            const key = this.pullFromLua(L, -2);
            obj[String(key)] = val;
            lua.lua_pop(L, 1);
          }
          return obj;
        }
      }
      default:
        return null;
    }
  }

  private serializeLuaResult(result: unknown): string {
    if (result === null || result === undefined) {
      return RespSerializer.nullBulk();
    }
    if (typeof result === 'boolean') {
      return result ? RespSerializer.integer(1) : RespSerializer.nullBulk();
    }
    if (typeof result === 'number') {
      return RespSerializer.integer(Math.floor(result));
    }
    if (typeof result === 'string') {
      return RespSerializer.bulkString(result);
    }
    if (typeof result === 'object' && result !== null) {
      if ('ok' in result) {
        return RespSerializer.simpleString((result as any).ok);
      }
      if ('err' in result) {
        return RespSerializer.error((result as any).err);
      }
      if (Array.isArray(result)) {
        return RespSerializer.array(result);
      }
    }
    return RespSerializer.bulkString(String(result));
  }
}
