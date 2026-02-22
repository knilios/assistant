const config = require('../config/config');
const logger = require('../utils/logger');
const { handleAIChat } = require('../modules/aiChat');

module.exports = {
  name: 'message',
  execute: async (message, client) => {
    // Ignore bots
    if (message.author.bot) return;

    const { prefix } = config.discord;

    // Handle prefix commands
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/ +/);
      const commandName = args.shift().toLowerCase();

      const command = client.commands.get(commandName) 
        || client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

      if (!command) return;

      try {
        await command.execute(message, args, client);
      } catch (error) {
        logger.error('Error executing command:', error);
        message.reply('There was an error executing that command.');
      }
      return;
    }

    // Handle mentions (AI chat)
    if (message.mentions.has(client.user)) {
      try {
        await handleAIChat(message, client);
      } catch (error) {
        logger.error('Error in AI chat:', error);
        message.reply('Sorry, I encountered an error processing your message.');
      }
    }
  }
};
