const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
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
    this.initErrorHandling();
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

    // Security headers
    this._app.use(helmet());

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Limit each IP to 100 requests per `window`
      standardHeaders: true,
      legacyHeaders: false,
      message: "Too many requests from this IP, please try again after 15 minutes"
    });
    this._app.use(limiter);

    // add Vary: Origin to prevent cache poisoning
    this._app.use((req, res, next) => { res.header("Vary", "Origin"); next(); });

    // must be before any routes
    this._app.use(cors(corsOptions));
    this._app.options("*", cors(corsOptions)); // handle all preflights

    this._app.use(express.json()); // bodyParser.json() replacement
    this._app.use(express.urlencoded({ extended: true }));
  }

  initErrorHandling() {
    // 404 handler
    this._app.use((req, res, next) => {
      res.status(404).json({ error: "Not Found" });
    });

    // Global error handler
    this._app._router.stack.forEach((layer) => {
      if (layer.route) {
        // This is a bit hacky for Express, usually we add it at the end
      }
    });

    this._app.use((err, req, res, next) => {
      ConsoleLogger.error(`Error: ${err.message}`);
      const status = err.status || 500;
      res.status(status).json({
        error: err.message || "Internal Server Error",
        status
      });
    });
  }

  loadDatabase = () => {
    const mongoUrl = process.env.MONGO_URL;
    mongoose.connect(mongoUrl, { autoCreate: true, autoIndex: true });
    mongoose.set("strictQuery", true);

    mongoose.connection.on("connected", () => {
      ConsoleLogger.success("MongoDB connected successfully");
    });

    mongoose.connection.on("error", (err) => {
      ConsoleLogger.error(`MongoDB connection error: ${err.message}`);
    });

    mongoose.connection.on("disconnected", () => {
      ConsoleLogger.warn("MongoDB disconnected");
    });
  };

  startListening() {
    const PORT = process.env.PORT || this._port;
    this._app.listen(PORT, () => {
      ConsoleLogger.info(`Server start on ${PORT}!`);
    });
  }
}

module.exports = AppServer;