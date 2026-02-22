const chalk = require('chalk');

const logger = {
  info: (message, ...args) => {
    console.log(chalk.blue('[INFO]'), message, ...args);
  },
  
  success: (message, ...args) => {
    console.log(chalk.green('[SUCCESS]'), message, ...args);
  },
  
  warn: (message, ...args) => {
    console.log(chalk.yellow('[WARN]'), message, ...args);
  },
  
  error: (message, ...args) => {
    console.error(chalk.red('[ERROR]'), message, ...args);
  },
  
  debug: (message, ...args) => {
    if (process.env.DEBUG) {
      console.log(chalk.gray('[DEBUG]'), message, ...args);
    }
  }
};

module.exports = logger;
