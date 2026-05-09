/** Supported generation modalities */
export type Modality = "text" | "image" | "video" | "audio" | "music";

/** A ranked model entry from any data source */
export interface RankedModel {
  id: string;
  name: string;
  creator: string;
  modality: Modality;
  elo_score: number | null;
  benchmark_score: number | null;
  rank: number;
  pricing: ModelPricing | null;
  performance: ModelPerformance | null;
  tags: string[];
  source: DataSource;
  last_updated: string;
}

export interface ModelPricing {
  /** Cost per million input tokens (text) or per image/minute */
  input_cost: number | null;
  /** Cost per million output tokens (text) or null for media */
  output_cost: number | null;
  currency: string;
  unit: string;
}

export interface ModelPerformance {
  /** Median output tokens per second (text) or generation time in seconds (media) */
  throughput: number | null;
  /** Time to first token in ms (text) or time to first frame (video) */
  latency: number | null;
}

export type DataSource =
  | "artificial_analysis"
  | "huggingface"
  | "benchlm"
  | "openrouter"
  | "arena"
  | "eqbench";

/** Cache entry with TTL */
export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl_ms: number;
}

/** Hugging Face model search response */
export interface HFModelEntry {
  id: string;
  modelId: string;
  author: string;
  downloads: number;
  likes: number;
  tags: string[];
  pipeline_tag: string;
  lastModified: string;
  [key: string]: unknown;
}

/** BenchLM API response */
export interface BenchLMEntry {
  rank?: number;
  model?: string;
  creator?: string;
  sourceType?: string;
  overallScore?: number;
  categoryScores?: Record<string, number | null>;
  inputPrice?: number;
  outputPrice?: number;
  [key: string]: unknown;
}

export type BenchLMCategory =
  | "coding"
  | "agentic"
  | "reasoning"
  | "knowledge"
  | "math"
  | "multimodal-grounded"
  | "multilingual"
  | "instruction-following";

export type EQBenchCategory =
  | "creative-writing"
  | "creative-writing-longform"
  | "emotional-intelligence";

export type Category = BenchLMCategory | EQBenchCategory;

/** OpenRouter model entry */
export interface ORModelEntry {
  id: string;
  name: string;
  description: string;
  pricing: {
    prompt: string;
    completion: string;
  };
  context_length: number;
  architecture: {
    modality: string;
    tokenizer: string;
    instruct_type: string;
  };
  top_provider: {
    max_completion_tokens: number;
  };
  [key: string]: unknown;
}
