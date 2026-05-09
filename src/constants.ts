/** API base URLs */
export const API_URLS = {
  ARTIFICIAL_ANALYSIS: "https://artificialanalysis.ai/api/v2/data",
  HUGGINGFACE: "https://huggingface.co/api",
  OPENROUTER: "https://openrouter.ai/api/v1",
  BENCHLM: "https://benchlm.ai/api/data",
  ARENA: "https://arena.ai/leaderboard/text",
  EQBENCH_CREATIVE_WRITING: "https://raw.githubusercontent.com/EQ-bench/EQ-bench-site/main/creative_writing.js",
  EQBENCH_EMOTIONAL_INTELLIGENCE: "https://raw.githubusercontent.com/EQ-bench/EQ-bench-site/main/eqbench3.js",
} as const;

/** Modality to Artificial Analysis endpoint mapping */
export const AA_MODALITY_ENDPOINTS: Record<string, string> = {
  text: "llms/models",
  image: "media/text-to-image",
  video: "media/text-to-video",
  audio: "media/text-to-speech",
  music: "media/music",
};

/** Hugging Face pipeline tags by modality */
export const HF_PIPELINE_TAGS: Record<string, string> = {
  text: "text-generation",
  image: "text-to-image",
  video: "text-to-video",
  audio: "text-to-speech",
  music: "text-to-audio",
};

/** Cache TTL in milliseconds (1 hour default) */
export const CACHE_TTL_MS = 60 * 60 * 1000;

/** Maximum character limit for MCP responses */
export const CHARACTER_LIMIT = 50_000;

/** Default pagination limit */
export const DEFAULT_LIMIT = 20;

/** Request timeout in ms */
export const REQUEST_TIMEOUT_MS = 15_000;
