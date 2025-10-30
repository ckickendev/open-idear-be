const express = require("express");
const cors = require("cors");
const { ConsoleLogger } = require("../core");
const { default: mongoose } = require("mongoose");
require("dotenv").config();

class AppServer {
  _app = express();
  _port = 5001;

  constructor(controllers = []) {
    this.loadDatabase();
    this.initMiddleWares();
    this.loadControllers(controllers);
  }

  // CORS
  loadCorsOption = () => {
    const cfg = process.env.CORS_ALLOW_ORIGINS;
    if (!cfg) throw new Error("ENV CORS not provider! (CORS_ALLOW_ORIGINS)");

    // comma-separated list in .env, e.g.:
    // CORS_ALLOW_ORIGINS=https://openidear.vercel.app,https://www.openidear.vercel.app,http://localhost:3000
    const allowed = cfg.split(",").map(s => s.trim()).filter(Boolean);

    return {
      origin(origin, cb) {
        // allow non-browser clients (no Origin header)
        if (!origin) return cb(null, true);
        if (allowed.includes(origin)) return cb(null, true);
        return cb(new Error(`Not allowed by CORS: ${origin}`));
      },
      credentials: true, // keep true ONLY if you use cookies/session
      methods: ["OPTIONS", "GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
      allowedHeaders: ["Content-Type", "Authorization"],
      exposedHeaders: ["Content-Type"],
      optionsSuccessStatus: 204,
    };
  };

  loadControllers = (controllers) => {
    controllers.forEach((controller) => {
      this._app.use("/", controller._router);
    });
  };

  initMiddleWares() {
    const corsOptions = this.loadCorsOption();

    // add Vary: Origin to prevent cache poisoning
    this._app.use((req, res, next) => { res.header("Vary", "Origin"); next(); });

    // must be before any routes
    this._app.use(cors(corsOptions));
    this._app.options("*", cors(corsOptions)); // handle all preflights

    this._app.use(express.json()); // bodyParser.json() replacement
    this._app.use(express.urlencoded({ extended: true }));
  }

  loadDatabase = () => {
    const mongoUrl = process.env.MONGO_URL;
    mongoose.connect(mongoUrl, { autoCreate: true, autoIndex: true });
    mongoose.set("strictQuery", true);
  };

  startListening() {
    const PORT = process.env.PORT || this._port;
    this._app.listen(PORT, () => {
      ConsoleLogger.info(`Server start on ${PORT}!`);
    });
  }
}

module.exports = AppServer;