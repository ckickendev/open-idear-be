const express = require("express");
const cors = require("cors");
const { ConsoleLogger } = require("../core");
const { default: mongoose } = require("mongoose");
const bodyParser = require("body-parser");
require("dotenv").config();

class AppServer {
  _app = express();
  _port = 5001;


  
  constructor(controllers = []) {
    this.loadDatabase();
    this.initMiddleWares();
    this.loadControllers(controllers);
  }

  loadCorsOption = () => {
    const configCors = process.env.CORS_ALLOW_ORIGINS;
    if (!configCors) {
      throw new Error("ENV CORS not provider!");
    }
    return {
      origin: '*',
      methods: "OPTIONS,GET,HEAD,PUT,PATCH,POST,DELETE",
      preflightContinue: false,
      optionsSuccessStatus: 204,
      credentials: true,
    };
  };

  loadControllers = (controllers) => {
    controllers.forEach((controller) => {
      this._app.use("/", controller._router);
    });
  };

  initMiddleWares() {
    this._app.use(cors(this.loadCorsOption()));
    this._app.use(bodyParser.json());
    this._app.use(bodyParser.urlencoded({ extended: true }));
  }

  loadDatabase = () => {
    const mongoUrl = process.env.MONGO_URL;
    mongoose.connect(mongoUrl, {
      autoCreate: true,
      autoIndex: true,
    });
    mongoose.set('strictQuery', true);
  };

  startListening() {
    const PORT = process.env.PORT || this._port;
    this._app.listen(PORT, () => {
      ConsoleLogger.info(`Server start on ${PORT}!`);
    });
  }
}

module.exports = AppServer;
