import type { RankedModel, ORModelEntry } from "../types.js";
import { API_URLS, CACHE_TTL_MS } from "../constants.js";
import { apiGet } from "./api-client.js";
import { cacheGet, cacheSet } from "./cache.js";

interface ORModelsResponse {
  data: ORModelEntry[];
}

function normalizeModel(raw: ORModelEntry, rank: number): RankedModel {
  const inputCost = raw.pricing?.prompt ? parseFloat(raw.pricing.prompt) * 1_000_000 : null;
  const outputCost = raw.pricing?.completion ? parseFloat(raw.pricing.completion) * 1_000_000 : null;

  return {
    id: raw.id,
    name: raw.name ?? raw.id,
    creator: raw.id.split("/")[0] ?? "unknown",
    modality: "text",
    elo_score: null,
    benchmark_score: null,
    rank,
    pricing: (inputCost != null || outputCost != null)
      ? { input_cost: inputCost, output_cost: outputCost, currency: "USD", unit: "per 1M tokens" }
      : null,
    performance: null,
    tags: [
      `context:${raw.context_length ?? "unknown"}`,
      ...(raw.architecture?.modality ? [`arch:${raw.architecture.modality}`] : []),
    ],
    source: "openrouter",
    last_updated: new Date().toISOString(),
  };
}

export async function fetchORModels(
  options: { search?: string; limit?: number } = {}
): Promise<RankedModel[]> {
  const { search, limit = 50 } = options;

  const cacheKey = `or:models:${search ?? "all"}`;
  const cached = cacheGet<RankedModel[]>(cacheKey);
  if (cached) return cached;

  try {
    const response = await apiGet<ORModelsResponse>(API_URLS.OPENROUTER, "models", {});
    const allModels = response.data ?? [];

    let filtered = allModels;
    if (search) {
      const q = search.toLowerCase();
      filtered = allModels.filter(
        (m) =>
          m.id.toLowerCase().includes(q) ||
          (m.name ?? "").toLowerCase().includes(q) ||
          (m.description ?? "").toLowerCase().includes(q)
      );
    }

    const models = filtered
      .slice(0, limit)
      .map((m, i) => normalizeModel(m, i + 1));

    cacheSet(cacheKey, models, CACHE_TTL_MS);
    return models;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to fetch models from OpenRouter: ${message}`);
  }
}
