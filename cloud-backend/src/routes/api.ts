import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { requireHeader } from "../lib/http.js";
import {
  getResponseConfig,
  listModels,
  listPrompts,
  getActivity,
  recordError,
} from "../services/catalog.js";
import { generateCustomPrompt } from "../services/prompt.js";
import type { Env } from "../env.js";

const CreatePromptSchema = z.object({
  user_prompt: z.string().min(1).max(4000),
});

const ActivitySchema = z.object({
  license: z.string().min(1),
  instance: z.string().min(1),
  machine_id: z.string().min(1),
  app_version: z.string().min(1),
  ai_model: z.string().min(1),
  usage: z.any().optional(),
});

const ErrorSchema = z.object({
  machine_id: z.string().min(1),
  error_message: z.string().min(1),
  app_version: z.string().min(1),
  instance: z.string().min(1),
  license_key: z.string().min(1),
  endpoint: z.string().min(1),
  model: z.string().optional().default(""),
  provider: z.string().optional().default(""),
});

export const apiRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const getCatalogDeps = () => ({
    prisma: app.prisma,
    env: opts.env,
  });

  const getPromptDeps = () => ({
    env: opts.env,
  });

  app.get(
    "/api/response",
    { preHandler: app.requireApiAccessKey },
    async (req, reply) => {
      const licenseKey = requireHeader(req.headers as Record<string, unknown>, "license_key");
      const instanceId = requireHeader(req.headers as Record<string, unknown>, "instance");
      const machineId = requireHeader(req.headers as Record<string, unknown>, "machine_id");
      const requestedModel = requireHeader(req.headers as Record<string, unknown>, "model");

      if (!licenseKey || !instanceId || !machineId) {
        return reply.code(400).send({ error: "Missing required headers" });
      }

      const config = await getResponseConfig(getCatalogDeps(), {
        licenseKey,
        instanceId,
        machineId,
        requestedModel: requestedModel ?? null,
      });

      if (!config.ok) {
        return reply.code(403).send({ error: config.error });
      }

      const token = app.jwt.sign(config.tokenPayload, {
        expiresIn: "15m",
        sub: config.tokenPayload.license_id,
      });

      const responseBody = {
        stream_options: { include_usage: true },
        max_tokens: 1024,
      };

      return reply.send({
        url: `${config.baseUrl}/api/chat`,
        user_token: token,
        model: config.model,
        body: JSON.stringify(responseBody),
        customer_id: null,
        customer_email: config.customerEmail,
        customer_name: null,
        license_key: licenseKey,
        instance_id: instanceId,
        user_audio: {
          url: `${config.baseUrl}/api/transcribe`,
          model: "whisper-1",
          user_token: token,
          fallback_url: null,
          fallback_model: null,
          fallback_user_token: null,
          headers: null,
        },
        errors: config.errorRules,
      });
    }
  );

  app.post(
    "/api/models",
    { preHandler: app.requireApiAccessKey },
    async (req, reply) => {
      const licenseKey = requireHeader(req.headers as Record<string, unknown>, "license_key");
      const instanceId = requireHeader(req.headers as Record<string, unknown>, "instance");
      const machineId = requireHeader(req.headers as Record<string, unknown>, "machine_id");

      const models = await listModels(getCatalogDeps(), {
        licenseKey,
        instanceId,
        machineId,
      });
      return reply.send({ models });
    }
  );

  app.post(
    "/api/prompts",
    { preHandler: app.requireApiAccessKey },
    async (_req, reply) => {
      const result = await listPrompts(getCatalogDeps());
      return reply.send(result);
    }
  );

  app.post(
    "/api/prompt",
    { preHandler: app.requireApiAccessKey },
    async (req, reply) => {
      const licenseKey = requireHeader(req.headers as Record<string, unknown>, "license_key");
      const instanceId = requireHeader(req.headers as Record<string, unknown>, "instance");
      const machineId = requireHeader(req.headers as Record<string, unknown>, "machine_id");
      if (!licenseKey || !instanceId || !machineId) {
        return reply.code(400).send({ error: "Missing required headers" });
      }

      const validated = await getResponseConfig(getCatalogDeps(), {
        licenseKey,
        instanceId,
        machineId,
        requestedModel: null,
      });
      if (!validated.ok) {
        return reply.code(403).send({ error: validated.error });
      }

      const bodyParsed = CreatePromptSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        return reply.code(400).send({ error: "Invalid request" });
      }

      const result = await generateCustomPrompt(
        getPromptDeps(),
        bodyParsed.data.user_prompt
      );

      if (!result.ok) {
        if (result.error.includes("Upstream error")) {
          return reply.code(502).send({ error: result.error });
        }
        if (result.error === "OpenAI is not configured") {
          return reply.code(500).send({ error: result.error });
        }
        return reply.code(502).send({ error: result.error });
      }

      return reply.send({
        prompt_name: result.prompt_name,
        system_prompt: result.system_prompt,
      });
    }
  );

  app.post(
    "/api/activity",
    { preHandler: app.requireApiAccessKey },
    async (req, reply) => {
      const parsed = ActivitySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request" });
      }
      return reply.send({ ok: true });
    }
  );

  app.get(
    "/api/activity",
    { preHandler: app.requireApiAccessKey },
    async (req, reply) => {
      const licenseKey = requireHeader(req.headers as Record<string, unknown>, "license_key");
      const machineId = requireHeader(req.headers as Record<string, unknown>, "machine_id");
      const instanceId =
        requireHeader(req.headers as Record<string, unknown>, "instance_name") ??
        requireHeader(req.headers as Record<string, unknown>, "instance");

      if (!licenseKey || !machineId || !instanceId) {
        return reply.code(400).send({ error: "Missing required headers" });
      }

      const result = await getActivity(getCatalogDeps(), {
        licenseKey,
        machineId,
        instanceId,
      });

      if (!result.ok) {
        return reply.code(404).send({ error: result.error });
      }

      return reply.send({
        license_id: result.license_id,
        periods: result.periods,
      });
    }
  );

  app.post(
    "/api/error",
    { preHandler: app.requireApiAccessKey },
    async (req, reply) => {
      const parsed = ErrorSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "Invalid request" });
      }

      await recordError(getCatalogDeps(), parsed.data);
      return reply.send({ ok: true });
    }
  );
};
