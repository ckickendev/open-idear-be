const HttpException = require('./HttpException');

class ServerException extends HttpException {
  constructor(message, errors = {}) {
    super(message || 'ServerException', 500, errors);
  }
}

module.exports = ServerException;
