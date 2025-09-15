import type { MLCEngine } from "@mlc-ai/web-llm";

export interface WebLLMProgress {
  percent: number;
  text: string;
}

export class WebLLMNotSupportedError extends Error {
  constructor(message = "WebGPU not available on this device/browser.") {
    super(message);
    this.name = "WebLLMNotSupportedError";
  }
}

const MODEL_ID = "Qwen2.5-0.5B-Instruct-q4f16_1-MLC";

let enginePromise: Promise<MLCEngine> | null = null;
const listeners = new Set<(progress: WebLLMProgress) => void>();

function emit(report: WebLLMProgress) {
  listeners.forEach((cb) => {
    try {
      cb(report);
    } catch (error) {
      console.error("WebLLM progress listener failed", error);
    }
  });
}

async function loadEngine(onProgress?: (progress: WebLLMProgress) => void) {
  if (!("gpu" in navigator)) {
    throw new WebLLMNotSupportedError();
  }
  if (onProgress) {
    listeners.add(onProgress);
  }
  if (!enginePromise) {
    enginePromise = (async () => {
      const { CreateMLCEngine } = await import("@mlc-ai/web-llm");
      return CreateMLCEngine(MODEL_ID, {
        initProgressCallback: (report) => {
          emit({
            percent: Math.round((report.progress ?? 0) * 100),
            text: report.text,
          });
        },
      });
    })();
  }
  const engine = await enginePromise;
  if (onProgress) {
    listeners.delete(onProgress);
  }
  return engine;
}

export async function generate(
  prompt: string,
  onProgress?: (progress: WebLLMProgress) => void
): Promise<string> {
  const engine = await loadEngine(onProgress);
  const reply = await engine.chat.completions.create({
    messages: [
      {
        role: "system",
        content:
          "You are a terse SALUTE report assistant. Focus on Situation, Activity, Location, Unit, Time, Equipment.",
      },
      { role: "user", content: prompt },
    ],
    temperature: 0.4,
    max_tokens: 240,
  });
  if (reply.choices && reply.choices.length > 0) {
    return reply.choices[0].message?.content?.trim() ?? "";
  }
  return "";
}

export async function ensureModel(
  onProgress?: (progress: WebLLMProgress) => void
) {
  await loadEngine(onProgress);
}
