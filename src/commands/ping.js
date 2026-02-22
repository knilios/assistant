module.exports = {
  name: 'ping',
  description: 'Check bot latency',
  execute: (message) => {
    const latency = Date.now() - message.createdTimestamp;
    message.reply(`🏓 Pong! Latency: ${latency}ms`);
  },
};
