import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const plan = await prisma.plan.upsert({
    where: { name: "Pro" },
    update: {},
    create: {
      name: "Pro",
      monthlyTokenQuota: 5_000_000,
      monthlyTranscriptionSecondsQuota: 18_000,
      maxActiveMachines: 3,
    },
  });

  const models = [
    {
      provider: "openai",
      name: "GPT-4o mini",
      model: "gpt-4o-mini",
      description: "Fast, low-cost default model",
      modality: "text,image",
      isAvailable: true,
    },
    {
      provider: "openai",
      name: "GPT-4o",
      model: "gpt-4o",
      description: "Higher quality model (vision capable)",
      modality: "text,image",
      isAvailable: true,
    },
  ];

  for (const m of models) {
    await prisma.modelCatalog.upsert({
      where: { model: m.model },
      update: {
        provider: m.provider,
        name: m.name,
        description: m.description,
        modality: m.modality,
        isAvailable: m.isAvailable,
        updatedAt: new Date(),
      },
      create: m,
    });
  }

  const defaultModel = await prisma.modelCatalog.findFirst({
    where: { model: "gpt-4o-mini" },
  });

  if (defaultModel) {
    const prompts = [
      {
        title: "General Assistant",
        prompt:
          "You are a helpful AI assistant. Be concise, accurate, and friendly.",
        modelId: defaultModel.id,
      },
      {
        title: "Meeting Copilot",
        prompt:
          "You help during meetings. Provide short, actionable suggestions, follow-ups, and clarifications. Avoid long essays.",
        modelId: defaultModel.id,
      },
    ];

    for (const p of prompts) {
      await prisma.promptCatalog.upsert({
        where: { title: p.title },
        update: {
          prompt: p.prompt,
          modelId: p.modelId,
          isActive: true,
          updatedAt: new Date(),
        },
        create: p,
      });
    }
  }

  console.log(`Seeded plan=${plan.name}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
