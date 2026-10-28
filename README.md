# Bun Redis Emulator (TypeScript)

Полноценный высокопроизводительный эмулятор Redis на **TypeScript** под рантайм **Bun**. Сервер слушает реальные TCP-соединения по стандартному протоколу **RESP (Redis Serialization Protocol)** и совместим с `redis-cli`, а также официальными драйверами (`ioredis`, `@redis/client`, Python `redis-py`, Go `go-redis` и т.д.).

---

## 🚀 Быстрый старт

### Запуск сервера
```bash
# Обычный запуск из исходников
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

## 📦 Сборка проекта (Build)

В проекте настроена сборка под Bun и компиляция в автономный бинарный исполняемый файл:

```bash
# 1. Сборка бандла JavaScript (создает dist/main.js)
bun run build

# 2. Компиляция в автономный бинарник (создает dist/redis-server.exe)
# Готовый бинарник можно запускать на любой машине без Bun или Node.js!
bun run build:bin

# 3. Полная сборка всего
bun run build:all

# 4. Запуск собранного проекта
bun run start:dist
# или запуск бинарника:
./dist/redis-server.exe
```

---

## ⚡ Динамическая настройка параметров

Параметры можно менять на лету **3 различными способами**:

### 1. На лету во время работы сервера через Redis Protocol (`CONFIG SET` / `CONFIG GET`)
Без перезапуска сервера прямо из любого клиента или `redis-cli`:

```bash
# Установить новый пароль на лету:
CONFIG SET requirepass "mySuperSecretPassword"

# Удалить пароль (сделать доступ без авторизации):
CONFIG SET requirepass ""

# Изменить уровень логирования на лету:
CONFIG SET loglevel debug

# Изменить интервал сохранения (в секундах или мс):
CONFIG SET save "30 1"

# Изменить максимальное число клиентов:
CONFIG SET maxclients 20000

# Посмотреть текущие настройки:
CONFIG GET *
CONFIG GET requirepass

# Сохранить текущие динамические настройки обратно в redis.conf:
CONFIG REWRITE
```

### 2. Через конфигурационный файл (`redis.conf` или `.json`)
Сервер автоматически подхватывает файл `redis.conf` из корня проекта, либо вы можете передать свой путь:
```bash
bun run start --config ./my-custom-redis.conf
```
Пример синтаксиса `redis.conf`:
```conf
bind 0.0.0.0
port 6379
requirepass "secret"
databases 16
dir "./data"
dbfilename "dump.json"
save "15 1"
maxclients 10000
timeout 0
loglevel info
```

### 3. Через CLI аргументы и переменные окружения
| Параметр | CLI флаг | ENV переменная | По умолчанию | Описание |
|---|---|---|---|---|
| Конфиг файл | `--config` или `-c` | — | `redis.conf` | Путь к файлу конфигурации |
| Порт | `--port` или `-p` | `REDIS_PORT` | `6379` | TCP-порт сервера |
| Хост | `--host` или `-h` | `REDIS_HOST` | `0.0.0.0` | Интерфейс привязки |
| Пароль | `--requirepass` или `-a` | `REDIS_PASSWORD` | `null` | Пароль доступа (`AUTH`) |
| Базы данных | `--databases` или `-db`| `REDIS_DATABASES` | `16` | Количество баз данных |
| Директория данных | `--data-dir` | `REDIS_DATADIR` | `./data` | Папка для JSON снимков |
| Файл данных | `--data-file` | `REDIS_DATAFILE` | `dump.json` | Имя JSON файла базы |
| Автосохранение | `--save-interval` | `REDIS_SAVE_INTERVAL`| `15000` (мс) | Период снапшотов (0 = выкл) |
| Макс. клиентов | `--maxclients` | `REDIS_MAX_CLIENTS` | `10000` | Лимит соединений |
| Таймаут | `--timeout` | `REDIS_TIMEOUT` | `0` | Таймаут бездействия (сек) |
| Уровень логов | `--log-level` | `REDIS_LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |

#### Пример запуска с аргументами:
```bash
bun run src/main.ts --port 6380 --requirepass mysecret --save-interval 10000 --log-level debug
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
dist/                            # Скомпилированный билд
  ├── main.js                    # Бандл JavaScript
  └── redis-server.exe           # Автономный бинарник
data/
  └── dump.json                  # Персистентный JSON-файл базы
redis.conf                       # Конфигурационный файл
src/
  ├── config/                    # Менеджер конфигураций (ENV, CLI, config file, runtime)
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
  │   └── handlers/              # Модульные обработчики:
  │       ├── connection.ts      # PING, ECHO, AUTH, SELECT, CLIENT, COMMAND, HELLO, QUIT
  │       ├── strings.ts         # GET, SET, MGET, MSET, INCR, DECR, APPEND, STRLEN...
  │       ├── keys.ts            # DEL, EXISTS, EXPIRE, TTL, KEYS, TYPE, RENAME, SCAN...
  │       ├── hashes.ts          # HSET, HGET, HDEL, HEXISTS, HGETALL, HKEYS, HLEN...
  │       ├── lists.ts           # LPUSH, RPUSH, LPOP, RPOP, LRANGE, LLEN, LINDEX, LREM...
  │       ├── sets.ts            # SADD, SMEMBERS, SREM, SISMEMBER, SCARD, SPOP...
  │       ├── zsets.ts           # ZADD, ZSCORE, ZRANGE, ZREVRANGE, ZCOUNT, ZINCRBY...
  │       ├── server.ts          # INFO, TIME, SAVE, BGSAVE, CONFIG (GET/SET/REWRITE), SHUTDOWN...
  │       └── pubsub.ts          # PUBLISH, SUBSCRIBE, UNSUBSCRIBE, PSUBSCRIBE...
  ├── server/                    # Сетевой слой
  │   ├── client-session.ts      # Состояние клиента, буферы и подписки
  │   └── tcp-server.ts          # Native Bun.listen TCP сервер
  ├── utils/
  │   ├── glob.ts                # Redis-совместимый матчер масок (*, ?, [a-z])
  │   └── logger.ts              # Структурированное логирование
  └── main.ts                    # Точка входа и graceful shutdown
test/
  └── redis.test.ts              # Комплексный набор тестов (Bun test)
```
