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
      allowedHeaders: ["Content-Type", "Authorization", "Accept-Language", "x-locale"],
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
    this._app.set("trust proxy", 1);

    // CORS must be first to ensure it's applied even for early responses from other middlewares
    this._app.use(cors(corsOptions));
    this._app.options("*", cors(corsOptions)); // handle all preflights

    // Security headers
    this._app.use(helmet());

    // add Vary: Origin to prevent cache poisoning
    this._app.use((req, res, next) => { res.header("Vary", "Origin"); next(); });

    // Rate limiting – skip local development or use relaxed limit to avoid blocking HMR/Fast Refresh
    const isDev = process.env.NODE_ENV !== "production";
    const envRateLimit = parseInt(process.env.RATE_LIMIT_MAX, 10);
    const rateLimitMax = !isNaN(envRateLimit) ? envRateLimit : (isDev ? 10000 : 1000);

    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: isDev ? Math.max(rateLimitMax, 10000) : rateLimitMax,
      standardHeaders: true,
      legacyHeaders: false,
      message: "Too many requests from this IP, please try again after 15 minutes",
      skip: (req) => {
        // Skip rate limiting in development for local machine requests
        if (isDev) {
          const ip = req.ip || req.connection?.remoteAddress || "";
          if (
            ip === "127.0.0.1" ||
            ip === "::1" ||
            ip === "::ffff:127.0.0.1" ||
            ip.includes("localhost")
          ) {
            return true;
          }
        }
        return false;
      },
    });
    this._app.use(limiter);

    this._app.use(
      express.json({
        limit: "10mb",
        verify: (req, res, buf) => {
          req.rawBody = buf;
        },
      })
    );
    this._app.use(express.urlencoded({ extended: true }));
  }

  initErrorHandling() {
    // 404 handler
    this._app.use((req, res, next) => {
      res.status(404).json({ error: "Not Found" });
    });

    // Global error handler

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
    mongoose.connect(mongoUrl, {
      autoCreate: true,
      autoIndex: true,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      family: 4, // Prefer IPv4 to avoid macOS DNS getaddrinfo ENOTFOUND IPv6 timeout issues
      maxPoolSize: 10,
    });
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
    const { execSync } = require("child_process");

    const server = this._app.listen(PORT, () => {
      ConsoleLogger.info(`Server start on ${PORT}!`);
    });

    server.on("error", (err) => {
      if (err.code === "EADDRINUSE") {
        ConsoleLogger.warn(`Port ${PORT} is in use (EADDRINUSE). Clearing stale process...`);
        try {
          execSync(`lsof -ti:${PORT} | xargs kill -9 2>/dev/null || true`);
          ConsoleLogger.info(`Port ${PORT} cleared. Retrying...`);
          setTimeout(() => {
            this._app.listen(PORT, () => {
              ConsoleLogger.info(`Server start on ${PORT}!`);
            });
          }, 1000);
        } catch (e) {
          ConsoleLogger.error(`Failed to auto-clear port ${PORT}: ${e.message}`);
          process.exit(1);
        }
      } else {
        ConsoleLogger.error(`Server listen error: ${err.message}`);
      }
    });

    // Graceful shutdown
    const shutdown = () => {
      ConsoleLogger.info("Shutting down gracefully...");
      server.close(() => {
        ConsoleLogger.info("HTTP server closed.");
        mongoose.connection.close(false).then(() => {
          ConsoleLogger.info("MongoDB connection closed.");
          process.exit(0);
        });
      });
    };

    process.on("SIGTERM", shutdown);
    process.on("SIGINT", shutdown);

    // Nodemon restart handling
    process.once("SIGUSR2", () => {
      server.close(() => {
        process.kill(process.pid, "SIGUSR2");
      });
    });
  }
}

module.exports = AppServer;