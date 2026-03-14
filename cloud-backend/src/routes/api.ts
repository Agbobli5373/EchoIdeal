import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { licenseKeyHash } from "../lib/license.js";
import { requireHeader, truncate } from "../lib/http.js";
import { endOfUtcMonth, startOfUtcMonth } from "../lib/period.js";
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

async function validateActiveLicenseAndInstance(app: any, params: {
  licenseKey: string;
  instanceId: string;
  machineId: string;
}) {
  const license = await app.prisma.license.findUnique({
    where: { licenseKeyHash: licenseKeyHash(params.licenseKey) },
    include: { plan: true, customer: true },
  });
  if (!license) return { ok: false as const, error: "Invalid license" };
  if (license.status !== "active") return { ok: false as const, error: "License inactive" };

  const instance = await app.prisma.instance.findFirst({
    where: {
      id: params.instanceId,
      licenseId: license.id,
      machineId: params.machineId,
      deactivatedAt: null,
    },
  });
  if (!instance) return { ok: false as const, error: "Instance not activated" };

  return { ok: true as const, license, instance };
}

export const apiRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  app.get(
    "/api/response",
    { preHandler: app.requireApiAccessKey },
    async (req, reply) => {
      const licenseKey = requireHeader(req.headers as any, "license_key");
      const instanceId = requireHeader(req.headers as any, "instance");
      const machineId = requireHeader(req.headers as any, "machine_id");
      const requestedModel = requireHeader(req.headers as any, "model");

      if (!licenseKey || !instanceId || !machineId) {
        return reply.code(400).send({ error: "Missing required headers" });
      }

      const validated = await validateActiveLicenseAndInstance(app, {
        licenseKey,
        instanceId,
        machineId,
      });
      if (!validated.ok) {
        return reply.code(403).send({ error: validated.error });
      }

      if (validated.license.type === "dev") {
        return reply.code(403).send({ error: "Hosted API not available for dev licenses" });
      }

      const availableModels = await app.prisma.modelCatalog.findMany({
        where: { isAvailable: true },
        orderBy: { createdAt: "asc" },
      });
      const chosen =
        (requestedModel
          ? availableModels.find((m: any) => m.model === requestedModel)
          : null) ?? availableModels[0];
      if (!chosen) {
        return reply.code(500).send({ error: "No models configured" });
      }

      const now = new Date();
      const periodStart = validated.license.currentPeriodStart ?? startOfUtcMonth(now);
      const periodEnd = validated.license.currentPeriodEnd ?? endOfUtcMonth(now);

      // Ensure a usage_totals row exists for this period (for quick quota checks in proxy).
      await app.prisma.usageTotal.upsert({
        where: { licenseId_periodStart: { licenseId: validated.license.id, periodStart } },
        update: { periodEnd },
        create: { licenseId: validated.license.id, periodStart, periodEnd },
      });

      const token = app.jwt.sign(
        {
          license_id: validated.license.id,
          license_key_hash: licenseKeyHash(licenseKey),
          instance_id: instanceId,
          machine_id: machineId,
          plan_id: validated.license.planId,
          allowed_models: availableModels.map((m: any) => m.model),
        },
        { expiresIn: "15m", sub: validated.license.id }
      );

      const baseUrl = opts.env.APP_BASE_URL.replace(/\/$/, "");
      const responseBody = {
        stream_options: { include_usage: true },
        max_tokens: 1024,
      };

      const errorRules = [
        { includes: "429", error: "Rate limited. Please try again in a moment." },
        { includes: "402", error: "Usage quota exceeded. Please upgrade or wait for reset." },
        { includes: "403", error: "License inactive. Please re-activate your license." },
        { includes: "insufficient_quota", error: "Usage quota exceeded. Please upgrade or wait for reset." },
        { includes: "Unauthorized", error: "Your session expired. Please re-activate your license." },
        { includes: "", error: "Something went wrong. Please try again or contact support." },
      ];

      return reply.send({
        url: `${baseUrl}/api/chat`,
        user_token: token,
        model: chosen.model,
        body: JSON.stringify(responseBody),
        customer_id: null,
        customer_email: validated.license.customer?.email ?? null,
        customer_name: null,
        license_key: licenseKey,
        instance_id: instanceId,
        user_audio: {
          url: `${baseUrl}/api/transcribe`,
          model: "whisper-1",
          user_token: token,
          fallback_url: null,
          fallback_model: null,
          fallback_user_token: null,
          headers: null,
        },
        errors: errorRules,
      });
    }
  );

  app.post(
    "/api/models",
    { preHandler: app.requireApiAccessKey },
    async (req, reply) => {
      const licenseKey = requireHeader(req.headers as any, "license_key");
      const instanceId = requireHeader(req.headers as any, "instance");
      const machineId = requireHeader(req.headers as any, "machine_id");

      const models = await app.prisma.modelCatalog.findMany({
        where: { isAvailable: true },
        orderBy: { createdAt: "asc" },
      });

      let hasActive = false;
      if (licenseKey && instanceId && machineId) {
        const validated = await validateActiveLicenseAndInstance(app, {
          licenseKey,
          instanceId,
          machineId,
        });
        hasActive = validated.ok && validated.license.type !== "dev";
      }

      return reply.send({
        models: models.map((m: any) => ({
          provider: m.provider,
          name: m.name,
          id: m.id,
          model: m.model,
          description: m.description,
          modality: m.modality,
          isAvailable: hasActive,
        })),
      });
    }
  );

  app.post(
    "/api/prompts",
    { preHandler: app.requireApiAccessKey },
    async (_req, reply) => {
      const prompts = await app.prisma.promptCatalog.findMany({
        where: { isActive: true },
        include: { model: true },
        orderBy: { updatedAt: "desc" },
      });

      const lastUpdated = prompts[0]?.updatedAt?.toISOString?.() ?? null;

      return reply.send({
        prompts: prompts.map((p: any) => ({
          title: p.title,
          prompt: p.prompt,
          modelId: p.model.model,
          modelName: p.model.name,
        })),
        total: prompts.length,
        last_updated: lastUpdated,
      });
    }
  );

  app.post(
    "/api/prompt",
    { preHandler: app.requireApiAccessKey },
    async (req, reply) => {
      const licenseKey = requireHeader(req.headers as any, "license_key");
      const instanceId = requireHeader(req.headers as any, "instance");
      const machineId = requireHeader(req.headers as any, "machine_id");
      if (!licenseKey || !instanceId || !machineId) {
        return reply.code(400).send({ error: "Missing required headers" });
      }

      const validated = await validateActiveLicenseAndInstance(app, {
        licenseKey,
        instanceId,
        machineId,
      });
      if (!validated.ok) {
        return reply.code(403).send({ error: validated.error });
      }
      if (validated.license.type === "dev") {
        return reply.code(403).send({ error: "Hosted API not available for dev licenses" });
      }

      const bodyParsed = CreatePromptSchema.safeParse(req.body);
      if (!bodyParsed.success) {
        return reply.code(400).send({ error: "Invalid request" });
      }

      if (!opts.env.OPENAI_API_KEY) {
        return reply.code(500).send({ error: "OpenAI is not configured" });
      }

      const generatorModel = "gpt-4o-mini";
      const system = `You generate system prompts for an AI assistant. Return JSON with keys: prompt_name, system_prompt. prompt_name is short (2-5 words). system_prompt is concise but specific.`;
      const user = bodyParsed.data.user_prompt;

      const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: generatorModel,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          temperature: 0.3,
          response_format: { type: "json_object" },
        }),
      });

      if (!openaiResp.ok) {
        const text = await openaiResp.text();
        return reply.code(502).send({ error: `Upstream error: ${text}` });
      }

      const json: any = await openaiResp.json();
      const content = json?.choices?.[0]?.message?.content;
      if (typeof content !== "string") {
        return reply.code(502).send({ error: "Invalid upstream response" });
      }

      let parsed: any;
      try {
        parsed = JSON.parse(content);
      } catch {
        parsed = null;
      }

      const promptName = parsed?.prompt_name ?? parsed?.promptName ?? "Custom Prompt";
      const systemPrompt = parsed?.system_prompt ?? parsed?.systemPrompt ?? content;

      return reply.send({
        prompt_name: String(promptName),
        system_prompt: String(systemPrompt),
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

      // Server-side usage accounting happens in /api/chat and /api/transcribe.
      // This endpoint remains for backward compatibility with existing desktop clients.
      return reply.send({ ok: true });
    }
  );

  app.get(
    "/api/activity",
    { preHandler: app.requireApiAccessKey },
    async (req, reply) => {
      const licenseKey = requireHeader(req.headers as any, "license_key");
      const machineId = requireHeader(req.headers as any, "machine_id");
      const instanceId =
        requireHeader(req.headers as any, "instance_name") ??
        requireHeader(req.headers as any, "instance");

      if (!licenseKey || !machineId || !instanceId) {
        return reply.code(400).send({ error: "Missing required headers" });
      }

      const license = await app.prisma.license.findUnique({
        where: { licenseKeyHash: licenseKeyHash(licenseKey) },
      });
      if (!license) return reply.code(404).send({ error: "Not found" });

      const totals = await app.prisma.usageTotal.findMany({
        where: { licenseId: license.id },
        orderBy: { periodStart: "desc" },
        take: 3,
      });

      return reply.send({
        license_id: license.id,
        periods: totals.map((t: any) => ({
          period_start: t.periodStart.toISOString(),
          period_end: t.periodEnd.toISOString(),
          used_tokens: t.usedTokens,
          used_transcription_seconds: t.usedTranscriptionSeconds,
        })),
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

      const { license_key, machine_id, instance, endpoint, model, provider, app_version } =
        parsed.data;
      const license = await app.prisma.license.findUnique({
        where: { licenseKeyHash: licenseKeyHash(license_key) },
      });

      await app.prisma.errorEvent.create({
        data: {
          licenseId: license?.id ?? null,
          machineId: machine_id,
          instanceId: instance,
          endpoint,
          model,
          provider,
          appVersion: app_version,
          errorMessage: truncate(parsed.data.error_message, 2000),
        },
      });

      return reply.send({ ok: true });
    }
  );
};
