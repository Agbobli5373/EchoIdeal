import type { PrismaClient } from "@prisma/client";
import { startOfUtcMonth, endOfUtcMonth } from "../lib/period.js";
import type { Env } from "../env.js";

export type ProxyDeps = {
  prisma: PrismaClient;
  env: Env;
};

type UsageTotalRow = Awaited<
  ReturnType<PrismaClient["usageTotal"]["upsert"]>
>;

/** Minimal shape for quota context when ok: true; license has id, plan has quota fields. */
export type QuotaContextOk = {
  ok: true;
  license: { id: string } & { plan: { monthlyTokenQuota: number; monthlyTranscriptionSecondsQuota: number } };
  plan: { monthlyTokenQuota: number; monthlyTranscriptionSecondsQuota: number };
  periodStart: Date;
  periodEnd: Date;
  usageTotal: UsageTotalRow;
};

export type QuotaContext = QuotaContextOk | { ok: false; error: string };

export async function getQuotaContext(
  deps: ProxyDeps,
  licenseId: string
): Promise<QuotaContext> {
  const license = await deps.prisma.license.findUnique({
    where: { id: licenseId },
    include: { plan: true },
  });
  if (!license)
    return { ok: false, error: "Invalid license" };
  if (license.status !== "active")
    return { ok: false, error: "License inactive" };
  if (license.type === "dev")
    return {
      ok: false,
      error: "Hosted API not available for dev licenses",
    };

  const now = new Date();
  const periodStart =
    license.currentPeriodStart ?? startOfUtcMonth(now);
  const periodEnd = license.currentPeriodEnd ?? endOfUtcMonth(now);
  const usageTotal = await deps.prisma.usageTotal.upsert({
    where: {
      licenseId_periodStart: { licenseId: license.id, periodStart },
    },
    update: { periodEnd },
    create: {
      licenseId: license.id,
      periodStart,
      periodEnd,
    },
  });

  return {
    ok: true,
    license,
    plan: license.plan,
    periodStart,
    periodEnd,
    usageTotal,
  };
}

export async function recordChatUsage(
  deps: ProxyDeps,
  params: {
    licenseId: string;
    machineId: string;
    instanceId: string;
    periodStart: Date;
    aiModel: string;
    promptTokens: number | null;
    completionTokens: number | null;
    totalTokens: number;
  }
): Promise<void> {
  await deps.prisma.$transaction([
    deps.prisma.usageEvent.create({
      data: {
        licenseId: params.licenseId,
        machineId: params.machineId,
        instanceId: params.instanceId,
        aiModel: params.aiModel,
        ...(params.promptTokens != null && { promptTokens: params.promptTokens }),
        ...(params.completionTokens != null && { completionTokens: params.completionTokens }),
        totalTokens: params.totalTokens,
      },
    }),
    deps.prisma.usageTotal.update({
      where: {
        licenseId_periodStart: {
          licenseId: params.licenseId,
          periodStart: params.periodStart,
        },
      },
      data: {
        usedTokens: { increment: params.totalTokens },
        updatedAt: new Date(),
      },
    }),
  ]);
}

export async function recordTranscribeUsage(
  deps: ProxyDeps,
  params: {
    licenseId: string;
    machineId: string;
    instanceId: string;
    periodStart: Date;
    transcriptionSeconds: number;
  }
): Promise<void> {
  await deps.prisma.$transaction([
    deps.prisma.usageEvent.create({
      data: {
        licenseId: params.licenseId,
        machineId: params.machineId,
        instanceId: params.instanceId,
        transcriptionSeconds: params.transcriptionSeconds,
      },
    }),
    deps.prisma.usageTotal.update({
      where: {
        licenseId_periodStart: {
          licenseId: params.licenseId,
          periodStart: params.periodStart,
        },
      },
      data: {
        usedTranscriptionSeconds: {
          increment: params.transcriptionSeconds,
        },
        updatedAt: new Date(),
      },
    }),
  ]);
}
