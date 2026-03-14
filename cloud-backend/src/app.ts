import Fastify from "fastify";
import sensible from "@fastify/sensible";
import rateLimit from "@fastify/rate-limit";
import multipart from "@fastify/multipart";
import rawBody from "fastify-raw-body";
import dotenv from "dotenv";
import type { Env } from "./env.js";
import { loadEnv } from "./env.js";
import { prismaPlugin } from "./plugins/prisma.js";
import { authPlugin } from "./plugins/auth.js";
import { routes } from "./routes/index.js";
import { AppError } from "./services/errors.js";

export async function buildApp(overrides?: Partial<Env>) {
  dotenv.config();
  const env = { ...loadEnv(process.env), ...overrides } as Env;

  const app = Fastify({
    logger: {
      level: env.NODE_ENV === "production" ? "info" : "debug",
      // Avoid logging request bodies.
      redact: ["req.headers.authorization", "req.body", "req.headers.cookie"],
    },
    bodyLimit: 10 * 1024 * 1024,
  });

  await app.register(sensible);
  await app.register(rawBody, {
    field: "rawBody",
    global: false,
    encoding: false,
    runFirst: true,
  });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: "1 minute",
  });
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });

  await app.register(prismaPlugin);
  await app.register(authPlugin, { env });
  await app.register(routes, { env });

  app.get("/health", async () => ({ ok: true }));

  app.setErrorHandler((err, _req, reply) => {
    app.log.error({ err }, "request error");
    const status =
      err instanceof AppError ? err.statusCode : (err as { statusCode?: number }).statusCode ?? 500;
    const message = err instanceof Error ? err.message : String(err);
    reply.code(status).send({ error: status >= 500 ? "Server error" : message });
  });

  return { app, env };
}
