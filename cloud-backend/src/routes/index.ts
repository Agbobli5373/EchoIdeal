import type { FastifyPluginAsync } from "fastify";
import type { Env } from "../env.js";
import { licensingRoutes } from "./licensing.js";
import { apiRoutes } from "./api.js";
import { proxyRoutes } from "./proxy.js";

export const routes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  await app.register(licensingRoutes, { env: opts.env });
  await app.register(apiRoutes, { env: opts.env });
  await app.register(proxyRoutes, { env: opts.env });
};
