const express = require("express");
const { Controller } = require("../core");
const { default: mongoose } = require("mongoose");
const asyncHandler = require("../utils/asyncHandler");

const serverStartTime = new Date();

class HealthController extends Controller {
  _rootPath = "";
  _router = express.Router();

  constructor() {
    super();
    this.initController();
  }

  formatUptime = (seconds) => {
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);

    const parts = [];
    if (d > 0) parts.push(`${d}d`);
    if (h > 0) parts.push(`${h}h`);
    if (m > 0) parts.push(`${m}m`);
    parts.push(`${s}s`);
    return parts.join(" ");
  };

  formatBytes = (bytes) => {
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  };

  getHealthData = async () => {
    const readyState = mongoose.connection.readyState;
    const readyStateMap = {
      0: "Disconnected",
      1: "Connected",
      2: "Connecting",
      3: "Disconnecting",
    };
    const dbStatus = readyStateMap[readyState] || "Unknown";
    const isDbConnected = readyState === 1;

    let dbPingMs = null;
    if (isDbConnected && mongoose.connection.db) {
      try {
        const start = Date.now();
        await mongoose.connection.db.admin().ping();
        dbPingMs = Date.now() - start;
      } catch (err) {
        dbPingMs = null;
      }
    }

    const uptimeSeconds = process.uptime();
    const mem = process.memoryUsage();
    const isHealthy = isDbConnected;

    return {
      status: isHealthy ? "healthy" : "degraded",
      service: "OpenIdear Backend API",
      message: isHealthy
        ? "All services are running normally"
        : "Database connection degraded",
      timestamp: new Date().toISOString(),
      serverStartTime: serverStartTime.toISOString(),
      uptime: {
        seconds: Math.floor(uptimeSeconds),
        formatted: this.formatUptime(uptimeSeconds),
      },
      environment: process.env.NODE_ENV || "development",
      database: {
        status: dbStatus,
        connected: isDbConnected,
        readyState,
        name: mongoose.connection.name || "open-idear",
        pingMs: dbPingMs,
      },
      system: {
        nodeVersion: process.version,
        platform: process.platform,
        arch: process.arch,
        pid: process.pid,
        memory: {
          heapUsed: this.formatBytes(mem.heapUsed),
          heapTotal: this.formatBytes(mem.heapTotal),
          rss: this.formatBytes(mem.rss),
        },
      },
    };
  };

  renderHtmlDashboard = (data) => {
    const isHealthy = data.status === "healthy";
    const statusColor = isHealthy ? "#10B981" : "#F59E0B";
    const statusGlow = isHealthy
      ? "rgba(16, 185, 129, 0.35)"
      : "rgba(245, 158, 11, 0.35)";

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>OpenIdear API • Server Status</title>
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>⚡</text></svg>">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #0B0F17;
      color: #E2E8F0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 24px 16px;
      line-height: 1.5;
    }
    .container {
      width: 100%;
      max-width: 720px;
      background: #111827;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 20px;
      padding: 32px;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.6), 0 0 50px -10px ${statusGlow};
      backdrop-filter: blur(12px);
    }
    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding-bottom: 24px;
      margin-bottom: 24px;
      flex-wrap: wrap;
      gap: 16px;
    }
    .brand {
      display: flex;
      align-items: center;
      gap: 14px;
    }
    .logo-badge {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      background: linear-gradient(135deg, #3B82F6, #8B5CF6);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 22px;
      box-shadow: 0 8px 16px -4px rgba(59, 130, 246, 0.4);
    }
    .title h1 {
      font-size: 1.25rem;
      font-weight: 700;
      color: #FFFFFF;
      letter-spacing: -0.02em;
    }
    .title p {
      font-size: 0.8125rem;
      color: #94A3B8;
    }
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: rgba(${isHealthy ? "16, 185, 129" : "245, 158, 11"}, 0.12);
      border: 1px solid rgba(${isHealthy ? "16, 185, 129" : "245, 158, 11"}, 0.3);
      padding: 6px 14px;
      border-radius: 9999px;
      font-size: 0.8125rem;
      font-weight: 600;
      color: ${statusColor};
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .pulse-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${statusColor};
      box-shadow: 0 0 0 0 ${statusGlow};
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0% { box-shadow: 0 0 0 0 ${statusGlow}; }
      70% { box-shadow: 0 0 0 10px rgba(16, 185, 129, 0); }
      100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .card {
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 14px;
      padding: 16px;
      transition: all 0.2s ease;
    }
    .card:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.12);
      transform: translateY(-2px);
    }
    .card-label {
      font-size: 0.75rem;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #94A3B8;
      margin-bottom: 6px;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .card-value {
      font-size: 1.125rem;
      font-weight: 700;
      color: #F8FAFC;
    }
    .card-subtext {
      font-size: 0.75rem;
      color: #64748B;
      margin-top: 4px;
    }
    .endpoints {
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 14px;
      padding: 18px;
      margin-bottom: 24px;
    }
    .endpoints h3 {
      font-size: 0.8125rem;
      font-weight: 600;
      color: #CBD5E1;
      margin-bottom: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .endpoint-links {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .endpoint-link {
      background: rgba(255, 255, 255, 0.06);
      color: #38BDF8;
      text-decoration: none;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 0.8125rem;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      border: 1px solid rgba(56, 189, 248, 0.2);
      transition: all 0.15s ease;
    }
    .endpoint-link:hover {
      background: rgba(56, 189, 248, 0.15);
      border-color: rgba(56, 189, 248, 0.4);
      transform: translateY(-1px);
    }
    .footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font-size: 0.75rem;
      color: #64748B;
      flex-wrap: wrap;
      gap: 12px;
      border-top: 1px solid rgba(255, 255, 255, 0.06);
      padding-top: 20px;
    }
    .refresh-btn {
      background: rgba(255, 255, 255, 0.08);
      border: 1px solid rgba(255, 255, 255, 0.12);
      color: #E2E8F0;
      padding: 6px 14px;
      border-radius: 8px;
      font-size: 0.75rem;
      cursor: pointer;
      font-weight: 500;
      transition: all 0.2s ease;
    }
    .refresh-btn:hover {
      background: rgba(255, 255, 255, 0.16);
      color: #FFFFFF;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">
        <div class="logo-badge">⚡</div>
        <div class="title">
          <h1>OpenIdear Backend</h1>
          <p>Production API Service • Render Cloud</p>
        </div>
      </div>
      <div class="status-badge">
        <span class="pulse-dot"></span>
        ${isHealthy ? "All Systems Operational" : "Service Degraded"}
      </div>
    </div>

    <div class="grid">
      <!-- Database -->
      <div class="card">
        <div class="card-label">🍃 Database</div>
        <div class="card-value" style="color: ${data.database.connected ? "#10B981" : "#EF4444"}">
          ${data.database.status}
        </div>
        <div class="card-subtext">
          ${data.database.pingMs !== null ? `Latency: ${data.database.pingMs}ms • ` : ""}${data.database.name}
        </div>
      </div>

      <!-- Uptime -->
      <div class="card">
        <div class="card-label">⏱️ Server Uptime</div>
        <div class="card-value">${data.uptime.formatted}</div>
        <div class="card-subtext">Started ${new Date(data.serverStartTime).toLocaleDateString()}</div>
      </div>

      <!-- Memory -->
      <div class="card">
        <div class="card-label">🧠 Memory Usage</div>
        <div class="card-value">${data.system.memory.heapUsed}</div>
        <div class="card-subtext">RSS: ${data.system.memory.rss} • Total: ${data.system.memory.heapTotal}</div>
      </div>

      <!-- Environment -->
      <div class="card">
        <div class="card-label">🌍 Environment</div>
        <div class="card-value" style="text-transform: capitalize;">${data.environment}</div>
        <div class="card-subtext">Node ${data.system.nodeVersion} (${data.system.platform})</div>
      </div>
    </div>

    <!-- Quick API Endpoints -->
    <div class="endpoints">
      <h3>Active API Endpoints</h3>
      <div class="endpoint-links">
        <a class="endpoint-link" href="/health?format=json" target="_blank">GET /health</a>
        <a class="endpoint-link" href="/ping" target="_blank">GET /ping</a>
        <a class="endpoint-link" href="/course" target="_blank">GET /course</a>
        <a class="endpoint-link" href="/post" target="_blank">GET /post</a>
        <a class="endpoint-link" href="/topic" target="_blank">GET /topic</a>
        <a class="endpoint-link" href="/category" target="_blank">GET /category</a>
      </div>
    </div>

    <div class="footer">
      <div>Checked: <span id="timestamp">${new Date(data.timestamp).toLocaleString()}</span></div>
      <div>
        <button class="refresh-btn" onclick="window.location.reload()">↻ Refresh Status</button>
      </div>
    </div>
  </div>

  <script>
    // Auto-refresh every 30 seconds
    setTimeout(() => {
      window.location.reload();
    }, 30000);
  </script>
</body>
</html>`;
  };

  getHealth = asyncHandler(async (req, res) => {
    const data = await this.getHealthData();
    const statusCode = data.status === "healthy" ? 200 : 503;

    // Check if request prefers HTML (e.g. browser address bar)
    const acceptsHtml =
      req.headers.accept && req.headers.accept.includes("text/html");
    const wantsJson =
      req.query.format === "json" ||
      (req.headers.accept &&
        req.headers.accept.includes("application/json") &&
        !acceptsHtml);

    if (acceptsHtml && !wantsJson) {
      res.setHeader(
        "Content-Security-Policy",
        "default-src 'self' 'unsafe-inline' data:;"
      );
      return res.status(statusCode).send(this.renderHtmlDashboard(data));
    }

    return res.status(statusCode).json(data);
  });

  getPing = (req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.status(200).json({
      message: "pong",
      timestamp: new Date().toISOString(),
      uptime: Math.floor(process.uptime()),
    });
  };

  initController = () => {
    // Health check routes
    this._router.get("/", this.getHealth);
    this._router.get("/health", this.getHealth);
    this._router.get("/api/health", this.getHealth);
    this._router.get("/ping", this.getPing);
  };
}

module.exports = HealthController;
