import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prismaLogLevels: Array<"query" | "info" | "warn" | "error"> =
  process.env.NODE_ENV === "development"
    ? ["query", "info", "warn", "error"]
    : ["warn", "error"];

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: prismaLogLevels,
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
