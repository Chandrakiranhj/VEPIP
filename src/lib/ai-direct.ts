import { GoogleGenerativeAI } from "@google/generative-ai";

export function getGeminiModel(modelName = process.env.GEMINI_MODEL ?? "gemini-2.5-flash") {
  const key = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  if (!key) {
    throw new Error("GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY is not configured");
  }
  return new GoogleGenerativeAI(key).getGenerativeModel({ model: modelName });
}

export function extractJsonBlock(raw: string): string | null {
  const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return null;
}

export async function generateJson<T>(prompt: string, modelName?: string): Promise<T> {
  const model = getGeminiModel(modelName);
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    },
  });
  const text = result.response.text();
  const json = extractJsonBlock(text) ?? text;
  return JSON.parse(json) as T;
}

export async function generateText(prompt: string, modelName?: string): Promise<string> {
  const model = getGeminiModel(modelName);
  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.35 },
  });
  return result.response.text();
}
