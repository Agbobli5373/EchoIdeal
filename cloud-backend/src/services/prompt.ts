import type { Env } from "../env.js";

export type PromptDeps = {
  env: Env;
};

export type GeneratePromptResult =
  | { ok: true; prompt_name: string; system_prompt: string }
  | { ok: false; error: string };

export async function generateCustomPrompt(
  deps: PromptDeps,
  userPrompt: string
): Promise<GeneratePromptResult> {
  if (!deps.env.OPENAI_API_KEY) {
    return { ok: false, error: "OpenAI is not configured" };
  }

  const generatorModel = "gpt-4o-mini";
  const system = `You generate system prompts for an AI assistant. Return JSON with keys: prompt_name, system_prompt. prompt_name is short (2-5 words). system_prompt is concise but specific.`;

  const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deps.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: generatorModel,
      messages: [
        { role: "system", content: system },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    }),
  });

  if (!openaiResp.ok) {
    const text = await openaiResp.text();
    return { ok: false, error: `Upstream error: ${text}` };
  }

  const json = (await openaiResp.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    return { ok: false, error: "Invalid upstream response" };
  }

  type ParsedPrompt = {
    prompt_name?: string;
    promptName?: string;
    system_prompt?: string;
    systemPrompt?: string;
  };
  let parsed: ParsedPrompt | null = null;
  try {
    parsed = JSON.parse(content) as ParsedPrompt;
  } catch {
    // use content as-is below
  }

  const promptName =
    parsed?.prompt_name ?? parsed?.promptName ?? "Custom Prompt";
  const systemPrompt =
    parsed?.system_prompt ?? parsed?.systemPrompt ?? content;

  return {
    ok: true,
    prompt_name: String(promptName),
    system_prompt: String(systemPrompt),
  };
}
