import { createClient, RedisClientType } from "redis";
import { logger } from "./logger";

// ─── Redis Client Factory ──────────────────────────────────
// Both Socket.io adapter and application code share these clients.
// In docker-compose, REDIS_URL = redis://redis:6379
// Locally, REDIS_URL = redis://localhost:6379

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

export const pubClient: RedisClientType = createClient({
  url: REDIS_URL,
  socket: {
    reconnectStrategy: (retries: number) => {
      if (retries > 20) {
        logger.error("[Redis] Max reconnect attempts reached. Giving up.");
        return new Error("Redis max retries");
      }
      const delay = Math.min(retries * 200, 5000); // exponential capped at 5s
      logger.warn(`[Redis] Reconnecting in ${delay}ms (attempt ${retries})...`);
      return delay;
    },
  },
}) as RedisClientType;

export const subClient: RedisClientType = pubClient.duplicate() as RedisClientType;

// Track readiness — socket handlers can check this before attempting Redis ops
export let redisReady = false;

export async function connectRedis(): Promise<void> {
  // Register error handlers BEFORE connect to catch handshake errors
  pubClient.on("error", (err: Error) => logger.error({ err }, "[Redis PUB] Error"));
  subClient.on("error", (err: Error) => logger.error({ err }, "[Redis SUB] Error"));

  pubClient.on("ready", () => { redisReady = true; });
  pubClient.on("end", () => { redisReady = false; });

  await Promise.all([pubClient.connect(), subClient.connect()]);
  logger.info(`[Redis] Connected to ${REDIS_URL}`);
}
