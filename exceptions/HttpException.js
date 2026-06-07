class HttpException extends Error {
  status;
  message;
  errors;

  constructor(message, status, errors) {
    super(message);
    this.status = status;
    this.message = message;
    this.errors = errors;
  }
}

module.exports = HttpException;
