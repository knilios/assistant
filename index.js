const Discord = require('discord.js');
const config = require('./src/config/config');
const logger = require('./src/utils/logger');

// Create Discord client
const client = new Discord.Client({
  partials: ['MESSAGE', 'CHANNEL', 'REACTION'],
  intents: [
    Discord.Intents.FLAGS.GUILDS,
    Discord.Intents.FLAGS.GUILD_MESSAGES,
    Discord.Intents.FLAGS.DIRECT_MESSAGES,
  ]
});

// Load handlers
require('./src/handlers/eventHandler')(client);
require('./src/handlers/commandHandler')(client);

// Initialize databases
const { initializeVectorDB } = require('./src/modules/vectorDB');
const { initializeSQL } = require('./src/modules/sqlDB');

(async () => {
  try {
    await initializeVectorDB();
    await initializeSQL();
    logger.success('Databases initialized');
  } catch (error) {
    logger.error('Failed to initialize databases:', error);
  }
})();

// Start scheduler
require('./src/utils/scheduler');

// Login to Discord
client.login(config.discord.token)
  .then(() => logger.success('Bot started successfully'))
  .catch(err => logger.error('Failed to login:', err));

// Handle errors
process.on('unhandledRejection', error => {
  logger.error('Unhandled promise rejection:', error);
});
