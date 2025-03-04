const chalk = require("chalk");

const log = console.log;

class ConsoleLogger {
  static info(message) {
    log(chalk.blue.bold(message));
  }

  static warn(message) {
    log(chalk.yellow(message));
  }

  static error(message) {
    log(chalk.red.bold(message));
  }

  static success(message) {
    log(chalk.green.bold(message));
  }

  static verbose(message) {
    log(chalk.hex("#8b4ccf").bold(message));
  }
}

module.exports = ConsoleLogger;
