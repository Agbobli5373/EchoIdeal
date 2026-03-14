import type { FastifyPluginAsync } from "fastify";
import { wavDurationSeconds } from "../lib/wav.js";
import {
  getQuotaContext,
  recordChatUsage,
  recordTranscribeUsage,
} from "../services/proxy.js";
import type { Env } from "../env.js";

async function verifyJwt(req: unknown, reply: unknown) {
  const r = req as { jwtVerify: () => Promise<void> };
  const rep = reply as { code: (n: number) => { send: (body: object) => unknown } };
  try {
    await r.jwtVerify();
  } catch {
    return rep.code(401).send({ error: "Unauthorized" });
  }
}

export const proxyRoutes: FastifyPluginAsync<{ env: Env }> = async (app, opts) => {
  const getProxyDeps = () => ({
    prisma: app.prisma,
    env: opts.env,
  });

  app.post(
    "/api/chat",
    { preHandler: verifyJwt },
    async (req, reply) => {
      const claims = ((req as { user?: unknown }).user ?? {}) as Record<string, unknown>;
      const licenseId = claims.license_id as string | undefined;
      const instanceId = claims.instance_id as string | undefined;
      const machineId = claims.machine_id as string | undefined;
      const allowedModels: string[] = Array.isArray(claims.allowed_models)
        ? (claims.allowed_models as string[])
        : [];

      if (!licenseId || !instanceId || !machineId) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const quota = await getQuotaContext(getProxyDeps(), licenseId);
      if (!quota.ok) return reply.code(403).send({ error: quota.error });

      if (quota.usageTotal.usedTokens >= quota.plan.monthlyTokenQuota) {
        return reply.code(402).send({ error: "Usage quota exceeded" });
      }

      const instance = await app.prisma.instance.findFirst({
        where: {
          id: instanceId,
          licenseId: quota.license.id,
          machineId,
          deactivatedAt: null,
        },
      });
      if (!instance)
        return reply.code(403).send({ error: "Instance not activated" });

      if (!opts.env.OPENAI_API_KEY) {
        return reply.code(500).send({ error: "OpenAI is not configured" });
      }

      const body = ((req as { body?: unknown }).body ?? {}) as Record<string, unknown>;
      const requestedModel = String(body.model ?? "");
      if (
        !requestedModel ||
        (allowedModels.length > 0 && !allowedModels.includes(requestedModel))
      ) {
        return reply.code(400).send({ error: "Model not allowed" });
      }

      const upstreamBody = {
        ...body,
        stream: true,
        stream_options: { include_usage: true, ...(body.stream_options as object ?? {}) },
      };

      const ac = new AbortController();
      (req as { raw: { on: (e: string, fn: () => void) => void } }).raw.on(
        "close",
        () => ac.abort()
      );

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
      type UsageShape = {
        total_tokens?: number;
        prompt_tokens?: number;
        completion_tokens?: number;
      };
      let usage: UsageShape | null = null;

      try {
        const reader = upstream.body.getReader();
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            reply.raw.write(Buffer.from(value));

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
                const parsed = JSON.parse(jsonStr) as { usage?: unknown };
                const u = parsed?.usage;
                if (u && typeof u === "object" && !Array.isArray(u)) {
                  usage = u as UsageShape;
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

        await recordChatUsage(getProxyDeps(), {
          licenseId: quota.license.id,
          machineId,
          instanceId,
          periodStart: quota.periodStart,
          aiModel: requestedModel,
          promptTokens,
          completionTokens,
          totalTokens: usage.total_tokens,
        });
      }
    }
  );

  app.post(
    "/api/transcribe",
    { preHandler: verifyJwt },
    async (req, reply) => {
      const claims = ((req as { user?: unknown }).user ?? {}) as Record<string, unknown>;
      const licenseId = claims.license_id as string | undefined;
      const instanceId = claims.instance_id as string | undefined;
      const machineId = claims.machine_id as string | undefined;

      if (!licenseId || !instanceId || !machineId) {
        return reply.code(401).send({ error: "Unauthorized" });
      }

      const quota = await getQuotaContext(getProxyDeps(), licenseId);
      if (!quota.ok) return reply.code(403).send({ error: quota.error });

      const instance = await app.prisma.instance.findFirst({
        where: {
          id: instanceId,
          licenseId: quota.license.id,
          machineId,
          deactivatedAt: null,
        },
      });
      if (!instance)
        return reply.code(403).send({ error: "Instance not activated" });

      if (!opts.env.OPENAI_API_KEY) {
        return reply.code(500).send({ error: "OpenAI is not configured" });
      }

      const file = await (req as { file: () => Promise<{ toBuffer: () => Promise<Buffer>; mimetype?: string; filename?: string; fields?: { model?: { value?: string } } }> }).file();
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
        new Blob([new Uint8Array(buf)], { type: file.mimetype || "audio/wav" }),
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
          body: form as unknown as BodyInit,
        }
      );

      if (!upstream.ok) {
        const text = await upstream.text().catch(() => "");
        return reply.code(502).send({ error: text || "Upstream error" });
      }

      const json = (await upstream.json()) as { text?: string };
      const text = json?.text;

      if (durationSeconds > 0) {
        await recordTranscribeUsage(getProxyDeps(), {
          licenseId: quota.license.id,
          machineId,
          instanceId,
          periodStart: quota.periodStart,
          transcriptionSeconds: durationSeconds,
        });
      }

      return reply.send({
        text: typeof text === "string" ? text : JSON.stringify(json),
      });
    }
  );
};
