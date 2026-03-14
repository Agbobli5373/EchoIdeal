import Fastify from "fastify";
import sensible from "@fastify/sensible";
import multipart from "@fastify/multipart";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Env } from "../src/env.js";
import { authPlugin } from "../src/plugins/auth.js";
import { routes } from "../src/routes/index.js";
import { licenseKeyHash, licenseKeyLast4 } from "../src/lib/license.js";
import { endOfUtcMonth, startOfUtcMonth } from "../src/lib/period.js";

type PlanRow = {
  id: string;
  name: string;
  monthlyTokenQuota: number;
  monthlyTranscriptionSecondsQuota: number;
  maxActiveMachines: number;
  createdAt: Date;
};

type CustomerRow = {
  id: string;
  stripeCustomerId: string | null;
  email: string | null;
  createdAt: Date;
};

type LicenseRow = {
  id: string;
  licenseKeyHash: string;
  licenseKeyLast4: string;
  type: "paid" | "dev";
  status: "active" | "revoked" | "past_due" | "canceled";
  customerId: string | null;
  planId: string;
  stripeSubscriptionId: string | null;
  currentPeriodStart: Date | null;
  currentPeriodEnd: Date | null;
  createdAt: Date;
  revokedAt: Date | null;
};

type MachineRow = {
  id: string;
  machineId: string;
  firstSeenAt: Date;
  lastSeenAt: Date;
};

type InstanceRow = {
  id: string;
  name: string | null;
  licenseId: string;
  machineId: string;
  appVersion: string | null;
  createdAt: Date;
  deactivatedAt: Date | null;
};

type UsageTotalRow = {
  licenseId: string;
  periodStart: Date;
  periodEnd: Date;
  usedTokens: number;
  usedTranscriptionSeconds: number;
  updatedAt: Date;
};

type UsageEventRow = {
  id: string;
  licenseId: string;
  machineId: string;
  instanceId: string | null;
  aiModel: string | null;
  promptTokens: number | null;
  completionTokens: number | null;
  totalTokens: number | null;
  transcriptionSeconds: number | null;
  createdAt: Date;
};

type ModelCatalogRow = {
  id: string;
  provider: string;
  name: string;
  model: string;
  description: string;
  modality: string;
  isAvailable: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type PromptCatalogRow = {
  id: string;
  title: string;
  prompt: string;
  modelId: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type ErrorEventRow = {
  id: string;
  licenseId: string | null;
  machineId: string | null;
  instanceId: string | null;
  endpoint: string;
  model: string | null;
  provider: string | null;
  appVersion: string | null;
  errorMessage: string;
  createdAt: Date;
};

function makeId(prefix: string, n: number): string {
  return `${prefix}_${n}`;
}

function usageTotalKey(licenseId: string, periodStart: Date): string {
  return `${licenseId}:${periodStart.toISOString()}`;
}

function makePcmWav(seconds: number, sampleRate = 8000): Buffer {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const dataSize = seconds * byteRate;

  const header = Buffer.alloc(44);
  header.write("RIFF", 0, 4, "ascii");
  header.writeUInt32LE(36 + dataSize, 4);
  header.write("WAVE", 8, 4, "ascii");
  header.write("fmt ", 12, 4, "ascii");
  header.writeUInt32LE(16, 16); // PCM fmt chunk size
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36, 4, "ascii");
  header.writeUInt32LE(dataSize, 40);

  const data = Buffer.alloc(dataSize);
  return Buffer.concat([header, data]);
}

function makeMultipartBody(parts: Array<{ headers: string; body: Buffer }>, boundary: string) {
  const buffers: Buffer[] = [];
  for (const part of parts) {
    buffers.push(Buffer.from(`--${boundary}\r\n${part.headers}\r\n\r\n`, "utf8"));
    buffers.push(part.body);
    buffers.push(Buffer.from("\r\n", "utf8"));
  }
  buffers.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return Buffer.concat(buffers);
}

function makeMockPrisma(seed: {
  plans: PlanRow[];
  customers: CustomerRow[];
  licenses: LicenseRow[];
  machines: MachineRow[];
  instances: InstanceRow[];
  usageTotals: UsageTotalRow[];
  usageEvents: UsageEventRow[];
  modelCatalog: ModelCatalogRow[];
  promptCatalog: PromptCatalogRow[];
  errorEvents: ErrorEventRow[];
}) {
  let usageEventSeq = seed.usageEvents.length;
  let errorEventSeq = seed.errorEvents.length;

  const prisma = {
    plan: {
      findUnique: async (args: any) => {
        const name = args?.where?.name as string | undefined;
        if (!name) return null;
        return seed.plans.find((p) => p.name === name) ?? null;
      },
      findFirst: async (_args?: any) => seed.plans[0] ?? null,
    },
    customer: {
      upsert: async (args: any) => {
        const stripeCustomerId = args?.where?.stripeCustomerId as string;
        let existing = seed.customers.find((c) => c.stripeCustomerId === stripeCustomerId);
        if (existing) {
          existing.email = args.update?.email ?? existing.email;
          return existing;
        }
        const created: CustomerRow = {
          id: makeId("cus", seed.customers.length + 1),
          stripeCustomerId,
          email: args.create?.email ?? null,
          createdAt: new Date(),
        };
        seed.customers.push(created);
        return created;
      },
    },
    license: {
      findUnique: async (args: any) => {
        if (args?.where?.licenseKeyHash) {
          const hash = args.where.licenseKeyHash as string;
          const lic = seed.licenses.find((l) => l.licenseKeyHash === hash) ?? null;
          if (!lic) return null;
          if (args.include?.plan) {
            const plan = seed.plans.find((p) => p.id === lic.planId) ?? null;
            const customer = args.include?.customer
              ? seed.customers.find((c) => c.id === lic.customerId) ?? null
              : undefined;
            return { ...lic, plan, customer };
          }
          return lic;
        }
        if (args?.where?.id) {
          const id = args.where.id as string;
          const lic = seed.licenses.find((l) => l.id === id) ?? null;
          if (!lic) return null;
          if (args.include?.plan) {
            const plan = seed.plans.find((p) => p.id === lic.planId) ?? null;
            return { ...lic, plan };
          }
          return lic;
        }
        if (args?.where?.stripeSubscriptionId) {
          const sid = args.where.stripeSubscriptionId as string;
          return seed.licenses.find((l) => l.stripeSubscriptionId === sid) ?? null;
        }
        return null;
      },
      updateMany: async (_args: any) => ({ count: 0 }),
      create: async (args: any) => {
        const created: LicenseRow = {
          id: makeId("lic", seed.licenses.length + 1),
          licenseKeyHash: args.data.licenseKeyHash,
          licenseKeyLast4: args.data.licenseKeyLast4,
          type: args.data.type,
          status: args.data.status,
          customerId: args.data.customerId ?? null,
          planId: args.data.planId,
          stripeSubscriptionId: args.data.stripeSubscriptionId ?? null,
          currentPeriodStart: args.data.currentPeriodStart ?? null,
          currentPeriodEnd: args.data.currentPeriodEnd ?? null,
          createdAt: new Date(),
          revokedAt: null,
        };
        seed.licenses.push(created);
        return created;
      },
    },
    machine: {
      upsert: async (args: any) => {
        const machineId = args.where.machineId as string;
        const now = new Date();
        let existing = seed.machines.find((m) => m.machineId === machineId) ?? null;
        if (existing) {
          existing.lastSeenAt = args.update?.lastSeenAt ?? now;
          return existing;
        }
        const created: MachineRow = {
          id: makeId("mac", seed.machines.length + 1),
          machineId,
          firstSeenAt: args.create?.firstSeenAt ?? now,
          lastSeenAt: args.create?.lastSeenAt ?? now,
        };
        seed.machines.push(created);
        return created;
      },
    },
    instance: {
      findFirst: async (args: any) => {
        const where = args?.where ?? {};
        const matches = seed.instances.filter((i) => {
          if (where.licenseId && i.licenseId !== where.licenseId) return false;
          if (where.machineId && i.machineId !== where.machineId) return false;
          if (where.id && i.id !== where.id) return false;
          if (where.deactivatedAt === null && i.deactivatedAt !== null) return false;
          return true;
        });
        return matches[0] ?? null;
      },
      findMany: async (args: any) => {
        const where = args?.where ?? {};
        let rows = seed.instances.slice();
        if (where.licenseId) rows = rows.filter((r) => r.licenseId === where.licenseId);
        if (where.deactivatedAt === null) rows = rows.filter((r) => r.deactivatedAt === null);

        if (args?.select?.machineId) {
          const unique = new Set<string>();
          const out: Array<{ machineId: string }> = [];
          for (const r of rows) {
            if (!unique.has(r.machineId)) {
              unique.add(r.machineId);
              out.push({ machineId: r.machineId });
            }
          }
          return out;
        }

        return rows;
      },
      create: async (args: any) => {
        const created: InstanceRow = {
          id: args.data.id,
          name: args.data.name ?? null,
          licenseId: args.data.licenseId,
          machineId: args.data.machineId,
          appVersion: args.data.appVersion ?? null,
          createdAt: new Date(),
          deactivatedAt: null,
        };
        seed.instances.push(created);
        return created;
      },
      updateMany: async (args: any) => {
        let count = 0;
        for (const r of seed.instances) {
          if (args.where?.id && r.id !== args.where.id) continue;
          if (args.where?.licenseId && r.licenseId !== args.where.licenseId) continue;
          r.deactivatedAt = args.data?.deactivatedAt ?? r.deactivatedAt;
          count++;
        }
        return { count };
      },
    },
    modelCatalog: {
      findMany: async (args: any) => {
        let rows = seed.modelCatalog.slice();
        if (args?.where?.isAvailable === true) rows = rows.filter((m) => m.isAvailable);
        return rows;
      },
    },
    promptCatalog: {
      findMany: async (args: any) => {
        let rows = seed.promptCatalog.slice();
        if (args?.where?.isActive === true) rows = rows.filter((p) => p.isActive);
        rows = rows.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
        if (args?.include?.model) {
          return rows.map((p) => ({
            ...p,
            model: seed.modelCatalog.find((m) => m.id === p.modelId) ?? null,
          }));
        }
        return rows;
      },
    },
    usageTotal: {
      upsert: async (args: any) => {
        const licenseId = args.where.licenseId_periodStart.licenseId as string;
        const periodStart = args.where.licenseId_periodStart.periodStart as Date;
        const key = usageTotalKey(licenseId, periodStart);
        let existing =
          seed.usageTotals.find((t) => usageTotalKey(t.licenseId, t.periodStart) === key) ?? null;
        if (existing) {
          existing.periodEnd = args.update?.periodEnd ?? existing.periodEnd;
          return existing;
        }
        const created: UsageTotalRow = {
          licenseId,
          periodStart,
          periodEnd: args.create.periodEnd,
          usedTokens: 0,
          usedTranscriptionSeconds: 0,
          updatedAt: new Date(),
        };
        seed.usageTotals.push(created);
        return created;
      },
      findMany: async (args: any) => {
        const licenseId = args?.where?.licenseId as string | undefined;
        let rows = seed.usageTotals.slice();
        if (licenseId) rows = rows.filter((t) => t.licenseId === licenseId);
        rows = rows.sort((a, b) => b.periodStart.getTime() - a.periodStart.getTime());
        if (typeof args?.take === "number") rows = rows.slice(0, args.take);
        return rows;
      },
      update: async (args: any) => {
        const licenseId = args.where.licenseId_periodStart.licenseId as string;
        const periodStart = args.where.licenseId_periodStart.periodStart as Date;
        const key = usageTotalKey(licenseId, periodStart);
        const existing =
          seed.usageTotals.find((t) => usageTotalKey(t.licenseId, t.periodStart) === key) ?? null;
        if (!existing) throw new Error("usage_total not found");

        if (args.data?.usedTokens?.increment) {
          existing.usedTokens += Number(args.data.usedTokens.increment);
        }
        if (args.data?.usedTranscriptionSeconds?.increment) {
          existing.usedTranscriptionSeconds += Number(
            args.data.usedTranscriptionSeconds.increment
          );
        }
        existing.updatedAt = args.data?.updatedAt ?? new Date();
        return existing;
      },
    },
    usageEvent: {
      create: async (args: any) => {
        usageEventSeq++;
        const created: UsageEventRow = {
          id: makeId("ue", usageEventSeq),
          licenseId: args.data.licenseId,
          machineId: args.data.machineId,
          instanceId: args.data.instanceId ?? null,
          aiModel: args.data.aiModel ?? null,
          promptTokens: args.data.promptTokens ?? null,
          completionTokens: args.data.completionTokens ?? null,
          totalTokens: args.data.totalTokens ?? null,
          transcriptionSeconds: args.data.transcriptionSeconds ?? null,
          createdAt: new Date(),
        };
        seed.usageEvents.push(created);
        return created;
      },
    },
    errorEvent: {
      create: async (args: any) => {
        errorEventSeq++;
        const created: ErrorEventRow = {
          id: makeId("ee", errorEventSeq),
          licenseId: args.data.licenseId ?? null,
          machineId: args.data.machineId ?? null,
          instanceId: args.data.instanceId ?? null,
          endpoint: args.data.endpoint,
          model: args.data.model ?? null,
          provider: args.data.provider ?? null,
          appVersion: args.data.appVersion ?? null,
          errorMessage: args.data.errorMessage,
          createdAt: new Date(),
        };
        seed.errorEvents.push(created);
        return created;
      },
    },
    $transaction: async (ops: any[]) => Promise.all(ops),
  };

  return prisma;
}

async function buildTestApp(prisma: any, envOverrides?: Partial<Env>) {
  const env = {
    NODE_ENV: "test",
    PORT: 0,
    APP_BASE_URL: "http://localhost:8787",
    API_ACCESS_KEY: "test_access_key_123",
    JWT_SIGNING_SECRET: "test_jwt_signing_secret_123456",
    DATABASE_URL: "postgresql://invalid",
    OPENAI_API_KEY: "test_openai_key",
    ...envOverrides,
  } as Env;

  const app = Fastify({ logger: false, bodyLimit: 10 * 1024 * 1024 });
  await app.register(sensible);
  await app.register(multipart, {
    limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  });
  app.decorate("prisma", prisma);
  await app.register(authPlugin, { env });
  await app.register(routes, { env });

  app.setErrorHandler((err, _req, reply) => {
    const status = (err as any).statusCode ?? 500;
    const message = err instanceof Error ? err.message : String(err);
    reply.code(status).send({ error: status >= 500 ? "Server error" : message });
  });

  await app.ready();
  return { app, env };
}

let app: Awaited<ReturnType<typeof buildTestApp>>["app"] | null = null;
let seed: ReturnType<typeof makeSeed> | null = null;

function makeSeed() {
  const now = new Date();
  const plan: PlanRow = {
    id: "plan_pro",
    name: "Pro",
    monthlyTokenQuota: 10000,
    monthlyTranscriptionSecondsQuota: 600,
    maxActiveMachines: 3,
    createdAt: now,
  };

  const licenseKey = "EI-ABCD-EFGH";
  const lic: LicenseRow = {
    id: "lic_1",
    licenseKeyHash: licenseKeyHash(licenseKey),
    licenseKeyLast4: licenseKeyLast4(licenseKey),
    type: "paid",
    status: "active",
    customerId: null,
    planId: plan.id,
    stripeSubscriptionId: null,
    currentPeriodStart: null,
    currentPeriodEnd: null,
    createdAt: now,
    revokedAt: null,
  };

  const model: ModelCatalogRow = {
    id: "model_1",
    provider: "openai",
    name: "Test Model",
    model: "gpt-test",
    description: "Test",
    modality: "chat",
    isAvailable: true,
    createdAt: now,
    updatedAt: now,
  };

  const prompt: PromptCatalogRow = {
    id: "prompt_1",
    title: "Default",
    prompt: "You are helpful.",
    modelId: model.id,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };

  return {
    plan,
    licenseKey,
    lic,
    model,
    prompt,
    plans: [plan],
    customers: [] as CustomerRow[],
    licenses: [lic],
    machines: [] as MachineRow[],
    instances: [] as InstanceRow[],
    usageTotals: [] as UsageTotalRow[],
    usageEvents: [] as UsageEventRow[],
    modelCatalog: [model],
    promptCatalog: [prompt],
    errorEvents: [] as ErrorEventRow[],
  };
}

beforeEach(async () => {
  seed = makeSeed();
  const prisma = makeMockPrisma(seed);
  const built = await buildTestApp(prisma);
  app = built.app;
});

afterEach(async () => {
  vi.unstubAllGlobals();
  if (app) await app.close();
  app = null;
  seed = null;
});

describe("Licensing contract", () => {
  it("rejects /activate without API access key", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/activate",
      headers: { "content-type": "application/json" },
      payload: {
        license_key: seed!.licenseKey,
        instance_name: "inst_1",
        machine_id: "mac_1",
        app_version: "0.0.0",
      },
    });
    expect(res.statusCode).toBe(401);
  });

  it("activates and validates, then deactivates", async () => {
    const headers = {
      authorization: "Bearer test_access_key_123",
      "content-type": "application/json",
    };

    const activation = await app!.inject({
      method: "POST",
      url: "/activate",
      headers,
      payload: {
        license_key: seed!.licenseKey,
        instance_name: "inst_1",
        machine_id: "mac_1",
        app_version: "0.0.0",
      },
    });

    expect(activation.statusCode).toBe(200);
    const activationJson = activation.json();
    expect(activationJson.activated).toBe(true);
    expect(activationJson.instance?.id).toBe("inst_1");
    expect(activationJson.is_dev_license).toBe(false);

    const validate = await app!.inject({
      method: "POST",
      url: "/validate",
      headers,
      payload: {
        license_key: seed!.licenseKey,
        instance_name: "inst_1",
        machine_id: "mac_1",
        app_version: "0.0.0",
      },
    });
    expect(validate.statusCode).toBe(200);
    expect(validate.json().is_active).toBe(true);

    const deactivate = await app!.inject({
      method: "POST",
      url: "/deactivate",
      headers,
      payload: {
        license_key: seed!.licenseKey,
        instance_name: "inst_1",
        machine_id: "mac_1",
        app_version: "0.0.0",
      },
    });
    expect(deactivate.statusCode).toBe(200);
    expect(deactivate.json().activated).toBe(true);

    const validateAfter = await app!.inject({
      method: "POST",
      url: "/validate",
      headers,
      payload: {
        license_key: seed!.licenseKey,
        instance_name: "inst_1",
        machine_id: "mac_1",
        app_version: "0.0.0",
      },
    });
    expect(validateAfter.statusCode).toBe(200);
    expect(validateAfter.json().is_active).toBe(false);
  });

  it("enforces max active machines per license", async () => {
    // Pre-seed 3 active machines.
    seed!.instances.push(
      {
        id: "inst_a",
        name: "inst_a",
        licenseId: seed!.lic.id,
        machineId: "mac_a",
        appVersion: "0.0.0",
        createdAt: new Date(),
        deactivatedAt: null,
      },
      {
        id: "inst_b",
        name: "inst_b",
        licenseId: seed!.lic.id,
        machineId: "mac_b",
        appVersion: "0.0.0",
        createdAt: new Date(),
        deactivatedAt: null,
      },
      {
        id: "inst_c",
        name: "inst_c",
        licenseId: seed!.lic.id,
        machineId: "mac_c",
        appVersion: "0.0.0",
        createdAt: new Date(),
        deactivatedAt: null,
      }
    );

    const res = await app!.inject({
      method: "POST",
      url: "/activate",
      headers: {
        authorization: "Bearer test_access_key_123",
        "content-type": "application/json",
      },
      payload: {
        license_key: seed!.licenseKey,
        instance_name: "inst_over",
        machine_id: "mac_over",
        app_version: "0.0.0",
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(json.activated).toBe(false);
    expect(String(json.error ?? "")).toMatch(/Device limit/i);
  });
});

describe("App API contract", () => {
  it("/api/response returns hosted proxy config + JWT", async () => {
    // Activate an instance first.
    await app!.inject({
      method: "POST",
      url: "/activate",
      headers: {
        authorization: "Bearer test_access_key_123",
        "content-type": "application/json",
      },
      payload: {
        license_key: seed!.licenseKey,
        instance_name: "inst_1",
        machine_id: "mac_1",
        app_version: "0.0.0",
      },
    });

    const res = await app!.inject({
      method: "GET",
      url: "/api/response",
      headers: {
        authorization: "Bearer test_access_key_123",
        license_key: seed!.licenseKey,
        instance: "inst_1",
        machine_id: "mac_1",
        model: "gpt-test",
      },
    });

    expect(res.statusCode).toBe(200);
    const json = res.json();
    expect(typeof json.url).toBe("string");
    expect(json.url).toContain("/api/chat");
    expect(typeof json.user_token).toBe("string");
    expect(json.model).toBe("gpt-test");
    expect(typeof json.body).toBe("string");

    const body = JSON.parse(json.body);
    expect(body.stream_options?.include_usage).toBe(true);
    expect(typeof body.max_tokens).toBe("number");

    const verified = (app as any)!.jwt.verify(json.user_token);
    expect(verified.license_id).toBe(seed!.lic.id);
    expect(verified.instance_id).toBe("inst_1");
    expect(verified.machine_id).toBe("mac_1");
    expect(Array.isArray(verified.allowed_models)).toBe(true);
  });

  it("/api/chat proxies SSE and accounts usage", async () => {
    // Activate instance.
    await app!.inject({
      method: "POST",
      url: "/activate",
      headers: {
        authorization: "Bearer test_access_key_123",
        "content-type": "application/json",
      },
      payload: {
        license_key: seed!.licenseKey,
        instance_name: "inst_1",
        machine_id: "mac_1",
        app_version: "0.0.0",
      },
    });

    // Ensure usage_totals row exists before proxying.
    const now = new Date();
    const periodStart = startOfUtcMonth(now);
    const periodEnd = endOfUtcMonth(now);
    seed!.usageTotals.push({
      licenseId: seed!.lic.id,
      periodStart,
      periodEnd,
      usedTokens: 0,
      usedTranscriptionSeconds: 0,
      updatedAt: new Date(),
    });

    // Mock OpenAI SSE.
    const sse =
      [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}],"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}\n\n',
        "data: [DONE]\n\n",
      ].join("");
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(sse));
        controller.close();
      },
    });

    const fetchSpy = vi.fn(async (url: string, init: any) => {
      expect(String(url)).toContain("/v1/chat/completions");
      const parsed = JSON.parse(init.body);
      expect(parsed.stream).toBe(true);
      expect(parsed.stream_options?.include_usage).toBe(true);
      return {
        ok: true,
        body: stream,
        text: async () => "",
      } as any;
    });
    vi.stubGlobal("fetch", fetchSpy as any);

    const token = (app as any)!.jwt.sign(
      {
        license_id: seed!.lic.id,
        license_key_hash: seed!.lic.licenseKeyHash,
        instance_id: "inst_1",
        machine_id: "mac_1",
        plan_id: seed!.plan.id,
        allowed_models: ["gpt-test"],
      },
      { expiresIn: "15m", sub: seed!.lic.id }
    );

    const res = await app!.inject({
      method: "POST",
      url: "/api/chat",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      payload: {
        model: "gpt-test",
        messages: [],
        stream: true,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toMatch(/text\/event-stream/i);
    expect(res.payload).toContain("data: ");
    expect(res.payload).toContain("[DONE]");

    // Usage accounting should have been applied.
    const total = seed!.usageTotals.find((t) => t.licenseId === seed!.lic.id);
    expect(total?.usedTokens).toBe(3);
    expect(seed!.usageEvents.length).toBeGreaterThan(0);
  });

  it("/api/transcribe accepts multipart WAV and returns {text}", async () => {
    // Activate instance.
    await app!.inject({
      method: "POST",
      url: "/activate",
      headers: {
        authorization: "Bearer test_access_key_123",
        "content-type": "application/json",
      },
      payload: {
        license_key: seed!.licenseKey,
        instance_name: "inst_1",
        machine_id: "mac_1",
        app_version: "0.0.0",
      },
    });

    // Ensure usage_totals row exists for quota accounting.
    const now = new Date();
    const periodStart = startOfUtcMonth(now);
    const periodEnd = endOfUtcMonth(now);
    seed!.usageTotals.push({
      licenseId: seed!.lic.id,
      periodStart,
      periodEnd,
      usedTokens: 0,
      usedTranscriptionSeconds: 0,
      updatedAt: new Date(),
    });

    const fetchSpy = vi.fn(async (url: string) => {
      expect(String(url)).toContain("/v1/audio/transcriptions");
      return {
        ok: true,
        json: async () => ({ text: "hello" }),
        text: async () => "",
      } as any;
    });
    vi.stubGlobal("fetch", fetchSpy as any);

    const token = (app as any)!.jwt.sign(
      {
        license_id: seed!.lic.id,
        license_key_hash: seed!.lic.licenseKeyHash,
        instance_id: "inst_1",
        machine_id: "mac_1",
        plan_id: seed!.plan.id,
        allowed_models: ["gpt-test"],
      },
      { expiresIn: "15m", sub: seed!.lic.id }
    );

    const boundary = "----echoideal_test_boundary";
    const wav = makePcmWav(2);
    const payload = makeMultipartBody(
      [
        {
          headers: `Content-Disposition: form-data; name="model"`,
          body: Buffer.from("whisper-1", "utf8"),
        },
        {
          headers:
            `Content-Disposition: form-data; name="file"; filename="audio.wav"\r\n` +
            `Content-Type: audio/wav`,
          body: wav,
        },
      ],
      boundary
    );

    const res = await app!.inject({
      method: "POST",
      url: "/api/transcribe",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ text: "hello" });

    // Quota accounting increments transcription seconds.
    const total = seed!.usageTotals.find((t) => t.licenseId === seed!.lic.id);
    expect(total?.usedTranscriptionSeconds).toBeGreaterThan(0);
  });
});

