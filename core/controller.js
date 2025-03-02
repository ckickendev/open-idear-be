const ConsoleLogger = require("./consoleLogger");

class Controller {
  constructor() {
    ConsoleLogger.warn(
      `Instance Controller ${this.constructor.name} has loaded!`
    );
  }
}

module.exports = Controller;
