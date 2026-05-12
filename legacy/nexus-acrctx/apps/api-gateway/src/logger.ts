import pino from "pino";

// ═══════════════════════════════════════════════════════════════
// STRUCTURED LOGGER (Pino)
// Uses pretty-printing in development, JSON in production.
// ═══════════════════════════════════════════════════════════════

const isDev = process.env.NODE_ENV !== "production";

export const logger = pino(
  isDev
    ? {
        level: process.env.LOG_LEVEL || "debug",
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        },
      }
    : {
        level: process.env.LOG_LEVEL || "info",
      }
);
