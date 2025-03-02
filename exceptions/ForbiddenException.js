const HttpException = require('./HttpException');

class ForbiddenException extends HttpException {
  constructor(message, error) {
    super(message || 'Refuses to authorize', 403, error);
  }
}

module.exports = ForbiddenException;
