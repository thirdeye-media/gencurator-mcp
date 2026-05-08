import type { RankedModel, BenchLMEntry, BenchLMCategory } from "../types.js";
import { API_URLS, CACHE_TTL_MS } from "../constants.js";
import { apiGet } from "./api-client.js";
import { cacheGet, cacheSet } from "./cache.js";

interface BenchLMResponse {
  lastUpdated?: string;
  mode?: string;
  models?: BenchLMEntry[];
  data?: BenchLMEntry[];
  results?: BenchLMEntry[];
}

function pickScoreForCategory(
  scores: Record<string, number | null> | undefined,
  category: BenchLMCategory | undefined,
): number | null {
  if (!scores || !category) return null;
  // BenchLM uses camelCase keys (e.g. "multimodalGrounded", "instructionFollowing")
  // Convert dash-case category param to camelCase for lookup.
  const camel = category.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
  const v = scores[camel];
  return typeof v === "number" ? v : null;
}

function normalizeModel(
  raw: BenchLMEntry,
  rank: number,
  category: BenchLMCategory | undefined,
  lastUpdated: string,
): RankedModel {
  const name = raw.model ?? "unknown";
  const overall = typeof raw.overallScore === "number" ? raw.overallScore : null;
  const categoryScore = pickScoreForCategory(raw.categoryScores, category);
  const benchmark = categoryScore ?? overall;

  const tags: string[] = [];
  if (raw.sourceType) tags.push(`type:${raw.sourceType}`);
  if (category && categoryScore != null) tags.push(`${category}:${categoryScore}`);
  if (raw.categoryScores) {
    for (const [cat, score] of Object.entries(raw.categoryScores)) {
      if (score == null) continue;
      if (category && cat === category.replace(/-([a-z])/g, (_, c) => c.toUpperCase())) continue;
      tags.push(`${cat}:${score}`);
    }
  }

  const inputCost = typeof raw.inputPrice === "number" ? raw.inputPrice : null;
  const outputCost = typeof raw.outputPrice === "number" ? raw.outputPrice : null;

  return {
    id: name,
    name,
    creator: raw.creator ?? "Unknown",
    modality: "text",
    elo_score: null,
    benchmark_score: benchmark,
    rank: raw.rank ?? rank,
    pricing: (inputCost != null || outputCost != null)
      ? { input_cost: inputCost, output_cost: outputCost, currency: "USD", unit: "per 1M tokens" }
      : null,
    performance: null,
    tags: tags.slice(0, 8),
    source: "benchlm",
    last_updated: lastUpdated,
  };
}

export async function fetchBenchLMLeaderboard(
  options: { category?: BenchLMCategory; limit?: number } = {}
): Promise<RankedModel[]> {
  const { category, limit = 50 } = options;
  const cacheKey = `benchlm:${category ?? "all"}:${limit}`;
  const cached = cacheGet<RankedModel[]>(cacheKey);
  if (cached) return cached;

  const raw = await apiGet<BenchLMResponse | BenchLMEntry[]>(
    API_URLS.BENCHLM,
    "leaderboard",
    {
      params: {
        ...(category ? { category } : {}),
        limit,
        format: "json",
      },
    },
  );

  const list: BenchLMEntry[] = Array.isArray(raw)
    ? raw
    : (raw.models ?? raw.data ?? raw.results ?? []);
  const lastUpdated = (Array.isArray(raw) ? null : raw.lastUpdated) ?? new Date().toISOString();

  let models = list.map((m, i) => normalizeModel(m, i + 1, category, lastUpdated));

  // If a category was requested, sort by that category's score so the leaderboard reflects
  // category-specific ranking rather than overall ranking.
  if (category) {
    models = [...models].sort((a, b) => (b.benchmark_score ?? -Infinity) - (a.benchmark_score ?? -Infinity));
    models = models.map((m, i) => ({ ...m, rank: i + 1 }));
  }

  cacheSet(cacheKey, models, CACHE_TTL_MS);
  return models;
}
