// Gyan model catalog. Every ID was checked against WebLLM 0.2.86's prebuilt list.
// "mb" is the GPU memory WebLLM says the model needs (vram_required_MB, rounded).

export const DEFAULT_ID = "Qwen2.5-1.5B-Instruct-q4f16_1-MLC";
export const VISION_ID = "Phi-3.5-vision-instruct-q4f16_1-MLC";

export const KINDS = {
  chat: "Chat",
  coding: "Coding",
  reasoning: "Reasoning (shows its thinking, slower)",
  vision: "Understands pictures",
};

export const CATALOG = [
  { id: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC",      name: "Qwen 2.5 0.5B",   maker: "Alibaba",      kind: "chat", mb: 945,  note: "Fastest, basic answers" },
  { id: "Llama-3.2-1B-Instruct-q4f16_1-MLC",      name: "Llama 3.2 1B",    maker: "Meta",         kind: "chat", mb: 879,  note: "Tiny and quick" },
  { id: "Qwen2.5-1.5B-Instruct-q4f16_1-MLC",      name: "Qwen 2.5 1.5B",   maker: "Alibaba",      kind: "chat", mb: 1630, note: "Balanced. Recommended to start", star: true },
  { id: "SmolLM2-1.7B-Instruct-q4f16_1-MLC",      name: "SmolLM2 1.7B",    maker: "Hugging Face", kind: "chat", mb: 1774, note: "Small and friendly" },
  { id: "gemma-2-2b-it-q4f16_1-MLC",              name: "Gemma 2 2B",      maker: "Google",       kind: "chat", mb: 1895, note: "Natural, chatty replies" },
  { id: "Qwen3-1.7B-q4f16_1-MLC",                 name: "Qwen 3 1.7B",     maker: "Alibaba",      kind: "chat", mb: 2037, note: "Newer and smarter for its size" },
  { id: "Llama-3.2-3B-Instruct-q4f16_1-MLC",      name: "Llama 3.2 3B",    maker: "Meta",         kind: "chat", mb: 2264, note: "Great for casual conversation" },
  { id: "Qwen2.5-3B-Instruct-q4f16_1-MLC",        name: "Qwen 2.5 3B",     maker: "Alibaba",      kind: "chat", mb: 2505, note: "Solid all-rounder" },
  { id: "Qwen3-4B-q4f16_1-MLC",                   name: "Qwen 3 4B",       maker: "Alibaba",      kind: "chat", mb: 3432, note: "Strong for its size" },
  { id: "Phi-3.5-mini-instruct-q4f16_1-MLC",      name: "Phi 3.5 mini",    maker: "Microsoft",    kind: "chat", mb: 3672, note: "Good at school-style questions" },
  { id: "Mistral-7B-Instruct-v0.3-q4f16_1-MLC",   name: "Mistral 7B",      maker: "Mistral AI",   kind: "chat", mb: 4573, note: "Popular and capable" },
  { id: "Llama-3.1-8B-Instruct-q4f16_1-MLC",      name: "Llama 3.1 8B",    maker: "Meta",         kind: "chat", mb: 5001, note: "Best quality, needs a strong GPU" },
  { id: "Qwen3-8B-q4f16_1-MLC",                   name: "Qwen 3 8B",       maker: "Alibaba",      kind: "chat", mb: 5696, note: "Top quality, needs a strong GPU" },
  { id: "gemma-2-9b-it-q4f16_1-MLC",              name: "Gemma 2 9B",      maker: "Google",       kind: "chat", mb: 6422, note: "Very capable, needs a strong GPU" },

  { id: "Qwen2.5-Coder-1.5B-Instruct-q4f16_1-MLC", name: "Qwen 2.5 Coder 1.5B", maker: "Alibaba", kind: "coding", mb: 1630, note: "Light coding helper" },
  { id: "Qwen2.5-Coder-3B-Instruct-q4f16_1-MLC",   name: "Qwen 2.5 Coder 3B",   maker: "Alibaba", kind: "coding", mb: 2505, note: "Better code, decent laptops" },
  { id: "Qwen2.5-Coder-7B-Instruct-q4f16_1-MLC",   name: "Qwen 2.5 Coder 7B",   maker: "Alibaba", kind: "coding", mb: 5107, note: "Best code quality, strong GPU" },

  { id: "DeepSeek-R1-Distill-Qwen-1.5B-q4f16_1-MLC", name: "DeepSeek R1 1.5B", maker: "DeepSeek", kind: "reasoning", mb: 1630, note: "Thinks step by step first" },
  { id: "DeepSeek-R1-Distill-Qwen-7B-q4f16_1-MLC",   name: "DeepSeek R1 7B",   maker: "DeepSeek", kind: "reasoning", mb: 5107, note: "Stronger reasoning, strong GPU" },

  { id: "Phi-3.5-vision-instruct-q4f16_1-MLC", name: "Phi 3.5 Vision", maker: "Microsoft", kind: "vision", mb: 4522, note: "Looks at pictures, charts and screenshots" },
];

// Old saved settings used tier names.
export const LEGACY = { tiny: "Qwen2.5-0.5B-Instruct-q4f16_1-MLC", small: DEFAULT_ID, medium: "Llama-3.2-3B-Instruct-q4f16_1-MLC" };

export const byId = (id) => CATALOG.find((m) => m.id === id);
export const isVision = (id) => !!byId(id) && byId(id).kind === "vision";
export const isReasoning = (id) => !!byId(id) && byId(id).kind === "reasoning";
export const isQwen3 = (id) => /^Qwen3-/.test(id || "");
export const shortName = (id) => (byId(id) ? byId(id).name : id);

export function fitLabel(mb) {
  if (mb <= 1700) return "Runs on most devices";
  if (mb <= 3000) return "Needs a decent laptop GPU";
  return "Needs a strong GPU";
}
export const gb = (mb) => (mb / 1000).toFixed(1) + " GB";
