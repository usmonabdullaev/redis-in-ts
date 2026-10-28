import { ConfigManager } from './config/index.ts';
import { DataStore } from './storage/data-store.ts';
import { PersistenceManager } from './storage/persistence.ts';
import { PubSubManager } from './pubsub/pubsub-manager.ts';
import { TcpServer } from './server/tcp-server.ts';
import { logger } from './utils/logger.ts';

const BANNER = `
                _._                                                  
           _.-"\`\`__ ''-._                                             
      _.-"\`    \`.  \`_.  ''-._           Redis TypeScript (Bun)      
  .-"\`.-._.---'  \`.   .-"_\` '.-.        Port: :PORT:                 
 (    '  \`       ___.-"\` \` \`  ) )       PID: :PID:                  
  \`.      \`.   "-._  \`.__.--"  .'       Persistence: JSON (:PATH:)  
    \`.      \`-._   \`.__..--" .'         https://redis.io             
      \`-._      \`.__..--"  .'                                        
          \`-._      \`.__.-'                                         
              \`-._.-'                                               
`.trim();

async function bootstrap() {
  const configManager = ConfigManager.fromEnvironmentAndArgs();
  const config = configManager.get();

  logger.setLevel(config.logLevel);

  configManager.onChange((key, val) => {
    if (key === 'loglevel') {
      logger.setLevel(val as any);
      logger.info(`Log level dynamically changed to: ${val}`);
    } else if (key === 'requirepass') {
      logger.info(val ? 'Authentication password updated dynamically.' : 'Authentication password removed (no auth required).');
    } else {
      logger.info(`Config parameter '${key}' dynamically changed to: ${val}`);
    }
  });

  const banner = BANNER
    .replace(':PORT:', config.port.toString())
    .replace(':PID:', process.pid.toString())
    .replace(':PATH:', configManager.getPathToDataFile());

  console.log(`\x1b[36m${banner}\x1b[0m\n`);

  const dataStore = new DataStore(config.databases);
  const persistenceManager = new PersistenceManager(configManager, dataStore);
  const pubsubManager = new PubSubManager();

  // Initialize persistence (load initial data from JSON file)
  await persistenceManager.init();

  const server = new TcpServer(configManager, dataStore, persistenceManager, pubsubManager);
  server.start();

  // Handle graceful shutdown signals
  let shuttingDown = false;
  const handleShutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}. Starting graceful shutdown...`);
    persistenceManager.stopAutoSave();
    await server.stop();
    logger.info('Server terminated cleanly.');
    process.exit(0);
  };

  process.on('SIGINT', () => handleShutdown('SIGINT'));
  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
}

bootstrap().catch((err) => {
  logger.error('Fatal bootstrap error:', err);
  process.exit(1);
});
