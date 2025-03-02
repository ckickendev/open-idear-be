const HttpException = require('./HttpException');

class UnauthorizedException extends HttpException {
  constructor(message, errors = {}) {
    super(message || 'ServerException', 401, errors);
  }
}

module.exports = UnauthorizedException;
