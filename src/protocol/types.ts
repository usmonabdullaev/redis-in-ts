export type RespValue =
  | SimpleString
  | ResrError
  | RespInteger
  | RespBulkString
  | RespArray
  | RespNull;

export interface SimpleString {
  type: 'simple_string';
  value: string;
}

export interface ResrError {
  type: 'error';
  value: string;
}

export interface RespInteger {
  type: 'integer';
  value: number;
}

export interface RespBulkString {
  type: 'bulk_string';
  value: string | null;
}

export interface RespArray {
  type: 'array';
  value: RespValue[] | null;
}

export interface RespNull {
  type: 'null';
}
