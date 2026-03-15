import type { PrismaClient } from "@prisma/client";
import { licenseKeyHash } from "../lib/license.js";
import { endOfUtcMonth, startOfUtcMonth } from "../lib/period.js";
import { truncate } from "../lib/http.js";
import type { Env } from "../env.js";

export type CatalogDeps = {
  prisma: PrismaClient;
  env: Env;
};

export type ValidateLicenseResult =
  | {
      ok: true;
      license: Awaited<
        ReturnType<
          PrismaClient["license"]["findUnique"]
        >
      > extends infer L
        ? L extends null
          ? never
          : L
        : never;
      instance: NonNullable<
        Awaited<ReturnType<PrismaClient["instance"]["findFirst"]>>
      >;
    }
  | { ok: false; error: string };

export async function validateActiveLicenseAndInstance(
  deps: CatalogDeps,
  params: { licenseKey: string; instanceId: string; machineId: string }
): Promise<ValidateLicenseResult> {
  const license = await deps.prisma.license.findUnique({
    where: { licenseKeyHash: licenseKeyHash(params.licenseKey) },
    include: { plan: true, customer: true },
  });
  if (!license) return { ok: false, error: "Invalid license" };
  if (license.status !== "active")
    return { ok: false, error: "License inactive" };

  const instance = await deps.prisma.instance.findFirst({
    where: {
      id: params.instanceId,
      licenseId: license.id,
      machineId: params.machineId,
      deactivatedAt: null,
    },
  });
  if (!instance) return { ok: false, error: "Instance not activated" };

  return { ok: true, license, instance };
}

export type ResponseConfigTokenPayload = {
  license_id: string;
  license_key_hash: string;
  instance_id: string;
  machine_id: string;
  plan_id: string;
  allowed_models: string[];
};

export type ResponseConfigResult =
  | {
      ok: true;
      tokenPayload: ResponseConfigTokenPayload;
      model: string;
      customerEmail: string | null;
      errorRules: Array<{ includes: string; error: string }>;
      baseUrl: string;
    }
  | { ok: false; error: string };

export async function getResponseConfig(
  deps: CatalogDeps,
  params: {
    licenseKey: string;
    instanceId: string;
    machineId: string;
    requestedModel: string | null;
  }
): Promise<ResponseConfigResult> {
  const validated = await validateActiveLicenseAndInstance(deps, {
    licenseKey: params.licenseKey,
    instanceId: params.instanceId,
    machineId: params.machineId,
  });
  if (!validated.ok) return { ok: false, error: validated.error };
  if (validated.license.type === "dev") {
    return {
      ok: false,
      error: "Hosted API not available for dev licenses",
    };
  }

  const availableModels = await deps.prisma.modelCatalog.findMany({
    where: { isAvailable: true },
    orderBy: { createdAt: "asc" },
  });
  const chosen =
    (params.requestedModel
      ? availableModels.find((m) => m.model === params.requestedModel)
      : null) ?? availableModels[0];
  if (!chosen) {
    return { ok: false, error: "No models configured" };
  }

  const now = new Date();
  const periodStart =
    validated.license.currentPeriodStart ?? startOfUtcMonth(now);
  const periodEnd =
    validated.license.currentPeriodEnd ?? endOfUtcMonth(now);

  await deps.prisma.usageTotal.upsert({
    where: {
      licenseId_periodStart: {
        licenseId: validated.license.id,
        periodStart,
      },
    },
    update: { periodEnd },
    create: {
      licenseId: validated.license.id,
      periodStart,
      periodEnd,
    },
  });

  const tokenPayload: ResponseConfigTokenPayload = {
    license_id: validated.license.id,
    license_key_hash: licenseKeyHash(params.licenseKey),
    instance_id: params.instanceId,
    machine_id: params.machineId,
    plan_id: validated.license.planId,
    allowed_models: availableModels.map((m) => m.model),
  };

  const baseUrl = deps.env.APP_BASE_URL.replace(/\/$/, "");
  const errorRules = [
    {
      includes: "429",
      error: "Rate limited. Please try again in a moment.",
    },
    {
      includes: "402",
      error: "Usage quota exceeded. Please upgrade or wait for reset.",
    },
    {
      includes: "403",
      error: "License inactive. Please re-activate your license.",
    },
    {
      includes: "insufficient_quota",
      error: "Usage quota exceeded. Please upgrade or wait for reset.",
    },
    {
      includes: "Unauthorized",
      error: "Your session expired. Please re-activate your license.",
    },
    {
      includes: "",
      error: "Something went wrong. Please try again or contact support.",
    },
  ];

  const license = validated.license as typeof validated.license & { customer?: { email: string | null } | null };
  return {
    ok: true,
    tokenPayload,
    model: chosen.model,
    customerEmail: license.customer?.email ?? null,
    errorRules,
    baseUrl,
  };
}

export async function listModels(
  deps: CatalogDeps,
  options: { licenseKey: string | null; instanceId: string | null; machineId: string | null }
): Promise<
  Array<{
    provider: string;
    name: string;
    id: string;
    model: string;
    description: string;
    modality: string;
    isAvailable: boolean;
  }>
> {
  const models = await deps.prisma.modelCatalog.findMany({
    where: { isAvailable: true },
    orderBy: { createdAt: "asc" },
  });

  let hasActive = false;
  if (
    options.licenseKey &&
    options.instanceId &&
    options.machineId
  ) {
    const validated = await validateActiveLicenseAndInstance(deps, {
      licenseKey: options.licenseKey,
      instanceId: options.instanceId,
      machineId: options.machineId,
    });
    hasActive = validated.ok && validated.license.type !== "dev";
  }

  return models.map((m) => ({
    provider: m.provider,
    name: m.name,
    id: m.id,
    model: m.model,
    description: m.description,
    modality: m.modality,
    isAvailable: hasActive,
  }));
}

export async function listPrompts(deps: CatalogDeps): Promise<{
  prompts: Array<{
    title: string;
    prompt: string;
    modelId: string;
    modelName: string;
  }>;
  total: number;
  last_updated: string | null;
}> {
  const prompts = await deps.prisma.promptCatalog.findMany({
    where: { isActive: true },
    include: { model: true },
    orderBy: { updatedAt: "desc" },
  });

  const lastUpdated = prompts[0]?.updatedAt?.toISOString() ?? null;

  return {
    prompts: prompts.map((p) => ({
      title: p.title,
      prompt: p.prompt,
      modelId: p.model.model,
      modelName: p.model.name,
    })),
    total: prompts.length,
    last_updated: lastUpdated,
  };
}

export async function getActivity(
  deps: CatalogDeps,
  params: { licenseKey: string; machineId: string; instanceId: string }
): Promise<
  | {
      ok: true;
      license_id: string;
      periods: Array<{
        period_start: string;
        period_end: string;
        used_tokens: number;
        used_transcription_seconds: number;
      }>;
    }
  | { ok: false; error: "Not found" }
> {
  const license = await deps.prisma.license.findUnique({
    where: { licenseKeyHash: licenseKeyHash(params.licenseKey) },
  });
  if (!license) return { ok: false, error: "Not found" };

  const totals = await deps.prisma.usageTotal.findMany({
    where: { licenseId: license.id },
    orderBy: { periodStart: "desc" },
    take: 3,
  });

  return {
    ok: true,
    license_id: license.id,
    periods: totals.map((t) => ({
      period_start: t.periodStart.toISOString(),
      period_end: t.periodEnd.toISOString(),
      used_tokens: t.usedTokens,
      used_transcription_seconds: t.usedTranscriptionSeconds,
    })),
  };
}

export type RecordErrorInput = {
  license_key: string;
  machine_id: string;
  instance: string;
  endpoint: string;
  model?: string;
  provider?: string;
  app_version: string;
  error_message: string;
};

export async function recordError(
  deps: CatalogDeps,
  input: RecordErrorInput
): Promise<void> {
  const license = await deps.prisma.license.findUnique({
    where: { licenseKeyHash: licenseKeyHash(input.license_key) },
  });

  await deps.prisma.errorEvent.create({
    data: {
      licenseId: license?.id ?? null,
      machineId: input.machine_id,
      instanceId: input.instance,
      endpoint: input.endpoint,
      model: input.model ?? "",
      provider: input.provider ?? "",
      appVersion: input.app_version,
      errorMessage: truncate(input.error_message, 2000),
    },
  });
}
