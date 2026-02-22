const logger = require('../utils/logger');

module.exports = {
  name: 'ready',
  once: true,
  execute: async (client) => {
    logger.success(`Logged in as ${client.user.tag}`);
    client.user.setActivity('your tasks', { type: 'WATCHING' });
  }
};
