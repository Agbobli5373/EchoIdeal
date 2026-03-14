import fp from "fastify-plugin";
import fastifyJwt from "@fastify/jwt";
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { timingSafeEqualString } from "../lib/crypto.js";
import type { Env } from "../env.js";

declare module "fastify" {
  interface FastifyInstance {
    requireApiAccessKey: (
      req: FastifyRequest,
      reply: FastifyReply
    ) => void | Promise<void>;
  }
}

function extractBearerToken(authorization?: string): string | null {
  if (!authorization) return null;
  const [scheme, token] = authorization.split(" ");
  if (scheme?.toLowerCase() !== "bearer") return null;
  if (!token) return null;
  return token;
}

const plugin: FastifyPluginAsync<{ env: Env }> = async (
  app: FastifyInstance,
  opts
) => {
  await app.register(fastifyJwt, {
    secret: opts.env.JWT_SIGNING_SECRET,
  });

  // Fastify v5 treats non-async hooks as callback-style and will wait for `done()`.
  // Make this hook async so the request lifecycle proceeds without a `done` callback.
  app.decorate("requireApiAccessKey", async (req: FastifyRequest, _reply: FastifyReply) => {
    const token = extractBearerToken(req.headers.authorization);
    if (!token || !timingSafeEqualString(token, opts.env.API_ACCESS_KEY)) {
      // Throwing reliably short-circuits the request lifecycle.
      throw (app as any).httpErrors.unauthorized();
    }
  });
};

export const authPlugin = fp(plugin);

export function getBearerToken(authorization?: string): string | null {
  return extractBearerToken(authorization);
}
