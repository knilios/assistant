const config = require('../config/config');

module.exports = {
  name: 'help',
  description: 'List all commands',
  aliases: ['commands', 'h'],
  usage: '!help [command]',
  execute: (message, args, client) => {
    const { prefix } = config.discord;
    const { commands } = client;

    if (!args.length) {
      const commandList = commands.map(cmd => `\`${prefix}${cmd.name}\``).join(', ');
      
      return message.channel.send(
        `**Available Commands:**\n${commandList}\n\nUse \`${prefix}help [command]\` for details.` +
        `\n\n**AI Chat:** Just mention me (@${client.user.username}) to chat!`
      );
    }

    const name = args[0].toLowerCase();
    const command = commands.get(name) || commands.find(c => c.aliases && c.aliases.includes(name));

    if (!command) {
      return message.reply('That command doesn\'t exist!');
    }

    let reply = `**Command:** ${command.name}\n`;
    if (command.aliases) reply += `**Aliases:** ${command.aliases.join(', ')}\n`;
    if (command.description) reply += `**Description:** ${command.description}\n`;
    if (command.usage) reply += `**Usage:** ${command.usage}`;

    message.channel.send(reply);
  },
};
