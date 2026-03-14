import type { FastifyPluginAsync } from "fastify";
import { startOfUtcMonth, endOfUtcMonth } from "../lib/period.js";
import { wavDurationSeconds } from "../lib/wav.js";
import type { Env } from "../env.js";

async function verifyJwt(req: any, reply: any) {
  try {
    await req.jwtVerify();
  } catch {
    return reply.code(401).send({ error: "Unauthorized" });
  }
}

async function getQuotaContext(app: any, licenseId: string) {
  const license = await app.prisma.license.findUnique({
    where: { id: licenseId },
    include: { plan: true },
  });
  if (!license) return { ok: false as const, error: "Invalid license" };
  if (license.status !== "active") return { ok: false as const, error: "License inactive" };
  if (license.type === "dev") return { ok: false as const, error: "Hosted API not available for dev licenses" };

  const now = new Date();
  const periodStart = license.currentPeriodStart ?? startOfUtcMonth(now);
  const periodEnd = license.currentPeriodEnd ?? endOfUtcMonth(now);
  const usageTotal = await app.prisma.usageTotal.upsert({
    where: { licenseId_periodStart: { licenseId: license.id, periodStart } },
    update: { periodEnd },
    create: { licenseId: license.id, periodStart, periodEnd },
  });

  return { ok: true as const, license, plan: license.plan, periodStart, periodEnd, usageTotal };
}

export const proxyRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  app.post(
    "/api/chat",
    { preHandler: verifyJwt },
    async (req, reply) => {
      const claims = (req.user ?? {}) as any;
      const licenseId = claims.license_id as string | undefined;
      const instanceId = claims.instance_id;
      const machineId = claims.machine_id;
      const allowedModels: string[] = Array.isArray(claims.allowed_models)
        ? claims.allowed_models
        : [];

      if (!licenseId || !instanceId || !machineId) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const quota = await getQuotaContext(app, licenseId);
      if (!quota.ok) return reply.code(403).send({ error: quota.error });

      if (quota.usageTotal.usedTokens >= quota.plan.monthlyTokenQuota) {
        return reply.code(402).send({ error: "Usage quota exceeded" });
      }

      const instance = await app.prisma.instance.findFirst({
        where: { id: instanceId, licenseId: quota.license.id, machineId, deactivatedAt: null },
      });
      if (!instance) return reply.code(403).send({ error: "Instance not activated" });

      if (!opts.env.OPENAI_API_KEY) {
        return reply.code(500).send({ error: "OpenAI is not configured" });
      }

      const body = (req.body ?? {}) as any;
      const requestedModel = String(body.model ?? "");
      if (!requestedModel || (allowedModels.length && !allowedModels.includes(requestedModel))) {
        return reply.code(400).send({ error: "Model not allowed" });
      }

      const upstreamBody = {
        ...body,
        stream: true,
        stream_options: { include_usage: true, ...(body.stream_options ?? {}) },
      };

      const ac = new AbortController();
      req.raw.on("close", () => ac.abort());

      const upstream = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${opts.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify(upstreamBody),
        signal: ac.signal,
      });

      if (!upstream.ok || !upstream.body) {
        const text = await upstream.text().catch(() => "");
        return reply.code(502).send({ error: text || "Upstream error" });
      }

      reply.raw.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      });
      reply.hijack();

      const decoder = new TextDecoder();
      let buffer = "";
      let usage: any = null;

      try {
        const reader = upstream.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            // Forward raw bytes for exact SSE compatibility.
            reply.raw.write(Buffer.from(value));

            // Parse lines to capture usage.
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() ?? "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith("data: ")) continue;
              const jsonStr = trimmed.slice("data: ".length);
              if (jsonStr === "[DONE]") continue;
              if (!jsonStr) continue;
              try {
                const parsed = JSON.parse(jsonStr);
                const u = parsed?.usage;
                if (u && typeof u === "object" && !Array.isArray(u)) {
                  usage = u;
                }
              } catch {
                // ignore parse errors while streaming
              }
            }
          }
        }
      } finally {
        reply.raw.end();
      }

      if (usage && typeof usage.total_tokens === "number") {
        const promptTokens =
          typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : null;
        const completionTokens =
          typeof usage.completion_tokens === "number"
            ? usage.completion_tokens
            : null;
        const totalTokens = usage.total_tokens;

        await app.prisma.$transaction([
          app.prisma.usageEvent.create({
            data: {
              licenseId: quota.license.id,
              machineId,
              instanceId,
              aiModel: requestedModel,
              promptTokens: promptTokens ?? undefined,
              completionTokens: completionTokens ?? undefined,
              totalTokens,
            },
          }),
          app.prisma.usageTotal.update({
            where: {
              licenseId_periodStart: {
                licenseId: quota.license.id,
                periodStart: quota.periodStart,
              },
            },
            data: { usedTokens: { increment: totalTokens }, updatedAt: new Date() },
          }),
        ]);
      }
    }
  );

  app.post(
    "/api/transcribe",
    { preHandler: verifyJwt },
    async (req, reply) => {
      const claims = (req.user ?? {}) as any;
      const licenseId = claims.license_id as string | undefined;
      const instanceId = claims.instance_id;
      const machineId = claims.machine_id;
      if (!licenseId || !instanceId || !machineId) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const quota = await getQuotaContext(app, licenseId);
      if (!quota.ok) return reply.code(403).send({ error: quota.error });

      const instance = await app.prisma.instance.findFirst({
        where: { id: instanceId, licenseId: quota.license.id, machineId, deactivatedAt: null },
      });
      if (!instance) return reply.code(403).send({ error: "Instance not activated" });

      if (!opts.env.OPENAI_API_KEY) {
        return reply.code(500).send({ error: "OpenAI is not configured" });
      }

      const file = await (req as any).file();
      if (!file) return reply.code(400).send({ error: "Missing file" });

      const buf: Buffer = await file.toBuffer();
      const seconds = wavDurationSeconds(buf);
      const durationSeconds = seconds ? Math.ceil(seconds) : 0;

      if (
        durationSeconds > 0 &&
        quota.usageTotal.usedTranscriptionSeconds + durationSeconds >
          quota.plan.monthlyTranscriptionSecondsQuota
      ) {
        return reply.code(402).send({ error: "Transcription quota exceeded" });
      }

      const requestedModel = String(file.fields?.model?.value ?? "whisper-1");

      const form = new FormData();
      form.append(
        "file",
        new Blob([buf], { type: file.mimetype || "audio/wav" }),
        file.filename || "audio.wav"
      );
      form.append("model", requestedModel);

      const upstream = await fetch(
        "https://api.openai.com/v1/audio/transcriptions",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${opts.env.OPENAI_API_KEY}`,
          },
          body: form as any,
        }
      );

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => "");
        return reply.code(502).send({ error: text || "Upstream error" });
      }

      const json: any = await upstream.json();
      const text = json?.text;

      if (durationSeconds > 0) {
        await app.prisma.$transaction([
          app.prisma.usageEvent.create({
            data: {
              licenseId: quota.license.id,
              machineId,
              instanceId,
              transcriptionSeconds: durationSeconds,
            },
          }),
          app.prisma.usageTotal.update({
            where: {
              licenseId_periodStart: {
                licenseId: quota.license.id,
                periodStart: quota.periodStart,
              },
            },
            data: {
              usedTranscriptionSeconds: { increment: durationSeconds },
              updatedAt: new Date(),
            },
          }),
        ]);
      }

      return reply.send({ text: typeof text === "string" ? text : JSON.stringify(json) });
    }
  );
};
