import type { Env } from "./grading";

type ModelInput = {
  messages: { role: string; content: string }[];
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: string; json_schema?: unknown };
};

export function providerConfigured(env: Env) {
  return env.AI_PROVIDER === "gemini"
    ? !!env.GEMINI_API_KEY && !!env.GEMINI_MODEL
    : !!env.AI && !!env.AI_MODEL;
}

// One server-only adapter for authoring, independent validation and grading.
// Never return provider error bodies: they can contain request data or credentials.
export async function runModel(
  env: Env,
  model: string,
  input: ModelInput,
  options: { signal: AbortSignal },
): Promise<unknown> {
  if (env.AI_PROVIDER !== "gemini") {
    if (!env.AI) throw Error("AI provider not configured");
    return env.AI.run(model, input, options);
  }
  if (!env.GEMINI_API_KEY || !env.GEMINI_MODEL)
    throw Error("Gemini provider not configured");
  const selected = model === (env.AI_GENERATION_MODEL || env.AI_MODEL)
    ? env.GEMINI_GENERATION_MODEL || env.GEMINI_MODEL
    : env.GEMINI_MODEL;
  if (!/^gemini-[a-z0-9.-]+$/.test(selected))
    throw Error("Invalid Gemini model configuration");
  const wrapped = input.response_format?.json_schema as
    | { schema?: unknown }
    | undefined;
  const schema = wrapped?.schema ?? wrapped;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${selected}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY,
      },
      signal: options.signal,
      body: JSON.stringify({
        systemInstruction: {
          parts: input.messages.filter(m => m.role === "system").map(m => ({ text: m.content })),
        },
        contents: input.messages.filter(m => m.role !== "system").map(m => ({
          role: m.role === "assistant" ? "model" : "user",
          parts: [{ text: m.content }],
        })),
        generationConfig: {
          temperature: input.temperature ?? 0.1,
          maxOutputTokens: input.max_tokens ?? 1600,
          responseMimeType: "application/json",
          ...(selected.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: "minimal" } } : {}),
          ...(schema ? { responseJsonSchema: schema } : {}),
        },
      }),
    },
  );
  if (!response.ok) {
    // Keep status available for existing safe quota/configuration categorization.
    throw Error(`Gemini ${response.status}: ${response.status === 429 ? "rate limit" : response.status === 400 ? "invalid input" : response.status === 401 || response.status === 403 ? "permission denied" : response.status === 404 ? "model not found" : "provider unavailable"}`);
  }
  const body = await response.json() as {
    candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  };
  const candidate = body.candidates?.[0];
  if (candidate?.finishReason !== "STOP") throw Error("Gemini response incomplete or blocked");
  const text = candidate.content?.parts?.filter(p => !p.thought).map(p => p.text ?? "").join("");
  if (!text) throw Error("Gemini response empty");
  return { response: text };
}
