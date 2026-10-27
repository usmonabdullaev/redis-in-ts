# Bun Redis Emulator (TypeScript)

Полноценный высокопроизводительный эмулятор Redis на **TypeScript** под рантайм **Bun**. Сервер слушает реальные TCP-соединения по стандартному протоколу **RESP (Redis Serialization Protocol)** и совместим с `redis-cli`, а также официальными драйверами (`ioredis`, `@redis/client`, Python `redis-py`, Go `go-redis` и т.д.).

---

## 🚀 Быстрый старт

### Запуск сервера
```bash
# Обычный запуск
bun run start

# Запуск в режиме разработки (watch mode)
bun run start:dev

# Запуск тестов
bun test
```

### Подключение через `redis-cli`
```bash
redis-cli -h 127.0.0.1 -p 6379
```

---

## ⚙️ Конфигурация

Все параметры можно задавать через **CLI аргументы**, **переменные окружения** или динамически через `CONFIG SET`.

| Параметр | CLI флаг | ENV переменная | По умолчанию | Описание |
|---|---|---|---|---|
| Порт | `--port` или `-p` | `REDIS_PORT` | `6379` | TCP-порт сервера |
| Хост | `--host` или `-h` | `REDIS_HOST` | `0.0.0.0` | Интерфейс привязки |
| Пароль | `--requirepass` | `REDIS_PASSWORD` | `null` | Пароль доступа (`AUTH`) |
| Директория данных | `--data-dir` | `REDIS_DATADIR` | `./data` | Папка для JSON снимков |
| Файл данных | `--data-file` | `REDIS_DATAFILE` | `dump.json` | Имя JSON файла базы |
| Интервал автосохранения | `--save-interval` | `REDIS_SAVE_INTERVAL`| `15000` (мс) | Период снапшотов (0 = выкл) |
| Уровень логов | `--log-level` | `REDIS_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

### Пример запуска с кастомными опциями:
```bash
bun run src/main.ts --port 6380 --requirepass mysecret --data-dir ./data --save-interval 10000
```

---

## 💾 Сохранение данных в JSON (`/data/*`)

Данные сохраняются в удобном JSON-формате по пути `./data/dump.json`:
- **Атомарная запись**: исключает повреждение файла при сбоях (запись во временный `.tmp` с последующим переименованием).
- **Периодический сброс**: автосохранение по таймеру (фоновый BGSAVE).
- **Сохранение по требованию**: команды `SAVE` и `BGSAVE`.
- **Сохранение при завершении**: перехват `SIGINT` / `SIGTERM` и команды `SHUTDOWN`.
- **Автоматическая загрузка**: при старте сервера все базы данных поднимаются из файла.

---

## 🏗 Архитектура проекта

```
data/
  └── dump.json                  # Персистентный JSON-файл базы
src/
  ├── config/                    # Менеджер конфигураций (ENV, CLI, runtime)
  │   └── index.ts
  ├── protocol/                  # Реализация протокола RESP2 / RESP3
  │   ├── parser.ts              # Потоковый парсер буферов и inline команд
  │   ├── serializer.ts          # Сериализатор ответов RESP
  │   └── types.ts               # Типы протокола
  ├── storage/                   # Хранилище данных
  │   ├── types.ts               # Типы структур данных Redis
  │   ├── zset.ts                # Реализация Sorted Set
  │   ├── memory-store.ts        # База данных в памяти (TTL, операции, экспорт/импорт)
  │   ├── data-store.ts          # Мульти-БД менеджер (0..15)
  │   └── persistence.ts         # Движок JSON-персистентности
  ├── pubsub/                    # Менеджер Pub/Sub каналов и паттернов
  │   └── pubsub-manager.ts
  ├── commands/                  # Реестр и обработчики команд
  │   ├── command.interface.ts   # Интерфейсы команд и контекста
  │   ├── command-registry.ts    # Диспетчер команд и проверка прав
  │   └── handlers/              # Модульные обработчики
  │       ├── connection.ts      # PING, ECHO, AUTH, SELECT, CLIENT, COMMAND, HELLO, QUIT
  │       ├── strings.ts         # GET, SET, MGET, MSET, INCR, DECR, APPEND, STRLEN...
  │       ├── keys.ts            # DEL, EXISTS, EXPIRE, TTL, KEYS, TYPE, RENAME, SCAN...
  │       ├── hashes.ts          # HSET, HGET, HDEL, HEXISTS, HGETALL, HKEYS, HLEN...
  │       ├── lists.ts           # LPUSH, RPUSH, LPOP, RPOP, LRANGE, LLEN, LINDEX, LREM...
  │       ├── sets.ts            # SADD, SMEMBERS, SREM, SISMEMBER, SCARD, SPOP...
  │       ├── zsets.ts           # ZADD, ZSCORE, ZRANGE, ZREVRANGE, ZCOUNT, ZINCRBY...
  │       ├── server.ts          # INFO, TIME, SAVE, BGSAVE, CONFIG, SHUTDOWN...
  │       └── pubsub.ts          # PUBLISH, SUBSCRIBE, UNSUBSCRIBE, PSUBSCRIBE...
  ├── server/                    # Сетевой слой
  │   ├── client-session.ts      # Состояние клиента, буферы и подписки
  │   └── tcp-server.ts          # Native Bun.listen TCP сервер
  ├── utils/
  │   ├── glob.ts                # Redis-совместимый матчер масок (*, ?, [a-z])
  │   └── logger.ts              # Структурированное логирование
  └── main.ts                    # Точка входа и graceful shutdown
test/
  └── redis.test.ts              # Набор тестов (Bun test)
```
