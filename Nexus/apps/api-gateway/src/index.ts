import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import { createAdapter } from "@socket.io/redis-adapter";
import { connectRedis, pubClient, subClient } from "./redis";
import { registerSocketHandlers } from "./socket";
import routes from "./routes";
import { logger } from "./logger";
import { validateAuthConfig } from "./middleware/auth";
import { PurgeWorker } from "./services/DisappearingMessages";
import { sessionController } from "./services/AuthoritativeSessionController";
import { scheduledMessageQueue } from "./services/ScheduledMessageQueue";

// ═══════════════════════════════════════════════════════════════
// QUANTCHAT API GATEWAY — Production Entry Point
// Auth: Quantmail Biometric SSO (JWT)
// ═══════════════════════════════════════════════════════════════

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const NODE_ENV = requireEnv("NODE_ENV");
const ALLOWED_ORIGINS = requireEnv("CORS_ORIGINS")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (ALLOWED_ORIGINS.length === 0) {
  throw new Error("CORS_ORIGINS must contain at least one origin");
}

const app = express();
app.use(cors({ origin: ALLOWED_ORIGINS }));
app.use(express.json({ limit: "1mb" })); // cap JSON body size
app.use(routes);

const server = http.createServer(app);

async function boot(): Promise<void> {
  // 0. Fail fast if required auth configuration is missing
  validateAuthConfig();

  // 1. Connect Redis for Socket.io cluster awareness
  await connectRedis();

  // 2. Create Socket.io server with production-grade config
  const io = new Server(server, {
    cors: { origin: ALLOWED_ORIGINS },

    // ─── Connection Tuning for 10k+ ───────────────────────
    maxHttpBufferSize: 1e6,          // 1MB max payload — reject oversized messages
    pingTimeout: 30000,              // 30s before considering connection dead
    pingInterval: 25000,             // 25s heartbeat (slightly under timeout)
    perMessageDeflate: false,        // Disable at scale — CPU cost > bandwidth savings with 10k+ sockets
    httpCompression: false,          // Let the reverse proxy (nginx) handle compression instead

    connectionStateRecovery: {
      maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
      skipMiddlewares: true,
    },

    // Allow websocket upgrade only (skip long-polling for production perf)
    transports: ["websocket"],
  });

  io.adapter(createAdapter(pubClient, subClient));
  logger.info("[Socket.io] Redis adapter attached — cluster-ready");

  // 3. Register all socket event handlers
  registerSocketHandlers(io);

  // 3b. Start the disappearing-messages purge worker
  const purgeWorker = new PurgeWorker(io);
  purgeWorker.start();

  // 3c. Bind session controller and start scheduled message queue
  sessionController.bind(io);
  scheduledMessageQueue.start();
  logger.info("[Gateway] SessionController and ScheduledMessageQueue active");

  // 4. Start listening
  const PORT = Number.parseInt(requireEnv("PORT"), 10);
  if (!Number.isFinite(PORT) || PORT <= 0) {
    throw new Error("PORT must be a positive integer");
  }
  server.listen(PORT, () => {
    logger.info({ port: PORT }, "[Gateway] Listening");
    logger.info({ mode: NODE_ENV }, "[Gateway] Mode");
    logger.info({ origins: ALLOWED_ORIGINS }, "[Gateway] CORS origins");
  });

  // 5. Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, "[Gateway] Draining connections...");

    purgeWorker.stop();
    scheduledMessageQueue.stop();
    io.close();

    try {
      await pubClient.quit();
      await subClient.quit();
    } catch { /* ignore */ }

    server.close(() => {
      logger.info("[Gateway] Shut down cleanly.");
      process.exit(0);
    });

    setTimeout(() => {
      logger.error("[Gateway] Forced shutdown after 10s timeout.");
      process.exit(1);
    }, 10_000);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

boot().catch((err) => {
  logger.error({ err }, "[Gateway] FATAL: Failed to start");
  process.exit(1);
});
