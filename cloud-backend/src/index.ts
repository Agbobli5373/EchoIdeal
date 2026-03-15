import { buildApp } from "./app.js";

const { app, env } = await buildApp();

// In some sandboxed dev environments, binding to 0.0.0.0 is not permitted.
// Production containers still need 0.0.0.0 to receive traffic.
const host =
  process.env.HOST ??
  (env.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1");

await app.listen({ port: env.PORT, host });
