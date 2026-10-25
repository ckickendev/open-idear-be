const HttpException = require("./HttpException");

class ConflictException extends HttpException {
  constructor(message, errors = {}) {
    super(message, 409, errors);
  }
}

module.exports = ConflictException;
