import type { RankedModel, Modality } from "../types.js";
import { API_URLS, AA_MODALITY_ENDPOINTS, CACHE_TTL_MS } from "../constants.js";
import { apiGet } from "./api-client.js";
import { cacheGet, cacheSet } from "./cache.js";

interface AAResponse<T> {
  status: number;
  data?: T[];
}

// LLM endpoint shape
interface AALLMEntry {
  id: string;
  name: string;
  slug?: string;
  release_date?: string;
  model_creator?: { name?: string; slug?: string };
  evaluations?: {
    artificial_analysis_intelligence_index?: number;
    artificial_analysis_coding_index?: number;
    artificial_analysis_math_index?: number;
    [key: string]: number | null | undefined;
  };
  pricing?: {
    price_1m_input_tokens?: number;
    price_1m_output_tokens?: number;
    price_1m_blended_3_to_1?: number;
  };
  median_output_tokens_per_second?: number;
  median_time_to_first_token_seconds?: number;
}

// Media endpoint shape (image, video, audio, music)
interface AAMediaEntry {
  id: string;
  name: string;
  slug?: string;
  release_date?: string;
  model_creator?: { name?: string; slug?: string };
  elo?: number;
  rank?: number;
  ci95?: string;
  appearances?: number;
}

function getApiKey(): string | undefined {
  return process.env.ARTIFICIAL_ANALYSIS_API_KEY;
}

function buildHeaders(): Record<string, string> {
  const key = getApiKey();
  return key ? { "x-api-key": key } : {};
}

function unwrap<T>(raw: AAResponse<T> | T[]): T[] {
  if (Array.isArray(raw)) return raw;
  return raw.data ?? [];
}

function normalizeLLM(raw: AALLMEntry, rank: number): RankedModel {
  const intelligence = raw.evaluations?.artificial_analysis_intelligence_index;
  const inputCost = raw.pricing?.price_1m_input_tokens;
  const outputCost = raw.pricing?.price_1m_output_tokens;
  const ttftMs = raw.median_time_to_first_token_seconds != null
    ? raw.median_time_to_first_token_seconds * 1000
    : null;

  const tags: string[] = [];
  if (raw.evaluations?.artificial_analysis_coding_index != null) tags.push(`coding:${raw.evaluations.artificial_analysis_coding_index}`);
  if (raw.evaluations?.artificial_analysis_math_index != null) tags.push(`math:${raw.evaluations.artificial_analysis_math_index}`);
  if (raw.release_date) tags.push(`released:${raw.release_date}`);

  return {
    id: raw.id ?? raw.slug ?? raw.name,
    name: raw.name,
    creator: raw.model_creator?.name ?? "Unknown",
    modality: "text",
    elo_score: null,
    benchmark_score: intelligence ?? null,
    rank,
    pricing: (inputCost != null || outputCost != null)
      ? {
          input_cost: inputCost ?? null,
          output_cost: outputCost ?? null,
          currency: "USD",
          unit: "per 1M tokens",
        }
      : null,
    performance: (raw.median_output_tokens_per_second != null || ttftMs != null)
      ? {
          throughput: raw.median_output_tokens_per_second ?? null,
          latency: ttftMs,
        }
      : null,
    tags,
    source: "artificial_analysis",
    last_updated: new Date().toISOString(),
  };
}

function normalizeMedia(raw: AAMediaEntry, modality: Modality, rank: number): RankedModel {
  const tags: string[] = [];
  if (raw.appearances != null) tags.push(`votes:${raw.appearances}`);
  if (raw.ci95) tags.push(`ci95:${raw.ci95}`);
  if (raw.release_date) tags.push(`released:${raw.release_date}`);

  return {
    id: raw.id ?? raw.slug ?? raw.name,
    name: raw.name,
    creator: raw.model_creator?.name ?? "Unknown",
    modality,
    elo_score: raw.elo ?? null,
    benchmark_score: null,
    rank: raw.rank ?? rank,
    pricing: null,
    performance: null,
    tags,
    source: "artificial_analysis",
    last_updated: new Date().toISOString(),
  };
}

export async function fetchAALeaderboard(modality: Modality): Promise<RankedModel[]> {
  const cacheKey = `aa:${modality}`;
  const cached = cacheGet<RankedModel[]>(cacheKey);
  if (cached) return cached;

  const endpoint = AA_MODALITY_ENDPOINTS[modality];
  if (!endpoint) {
    throw new Error(`Unsupported modality for Artificial Analysis: ${modality}`);
  }

  try {
    if (modality === "text") {
      const raw = await apiGet<AAResponse<AALLMEntry> | AALLMEntry[]>(
        API_URLS.ARTIFICIAL_ANALYSIS,
        endpoint,
        { headers: buildHeaders() },
      );
      const list = unwrap(raw);
      const models = list.map((m, i) => normalizeLLM(m, i + 1));
      cacheSet(cacheKey, models, CACHE_TTL_MS);
      return models;
    }

    const raw = await apiGet<AAResponse<AAMediaEntry> | AAMediaEntry[]>(
      API_URLS.ARTIFICIAL_ANALYSIS,
      endpoint,
      { headers: buildHeaders() },
    );
    const list = unwrap(raw);
    const models = list.map((m, i) => normalizeMedia(m, modality, i + 1));
    cacheSet(cacheKey, models, CACHE_TTL_MS);
    return models;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to fetch ${modality} rankings from Artificial Analysis: ${message}. ` +
      `Ensure ARTIFICIAL_ANALYSIS_API_KEY is set. Get a free key at https://artificialanalysis.ai/`
    );
  }
}
