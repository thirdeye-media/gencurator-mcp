import type { RankedModel } from "../types.js";
import { apiGet } from "./api-client.js";
import { cacheGet, cacheSet } from "./cache.js";
import { CACHE_TTL_MS } from "../constants.js";

const HF_ROWS_BASE = "https://datasets-server.huggingface.co";

interface LMArenaRow {
  model_name: string;
  organization: string;
  license: string;
  rating: number;
  vote_count: number;
  rank: number;
  category: string;
}

interface HFRowsResponse {
  rows: Array<{ row_idx: number; row: LMArenaRow }>;
}

export async function fetchArenaLeaderboard(limit = 50): Promise<RankedModel[]> {
  const cacheKey = `arena:text:${limit}`;
  const cached = cacheGet<RankedModel[]>(cacheKey);
  if (cached) return cached;

  const data = await apiGet<HFRowsResponse>(HF_ROWS_BASE, "rows", {
    params: {
      dataset: "lmarena-ai/leaderboard-dataset",
      config: "text",
      split: "latest",
      offset: "0",
      length: String(limit),
    },
  });

  const now = new Date().toISOString();
  const models: RankedModel[] = data.rows
    .filter(r => r.row.category === "overall")
    .map(({ row }, i) => {
      const votes = row.vote_count >= 1000
        ? `votes:${Math.round(row.vote_count / 1000)}K`
        : `votes:${Math.round(row.vote_count)}`;
      const tags = [votes];
      if (row.license && row.license !== "Unknown") tags.push(row.license.toLowerCase());

      return {
        id: row.model_name,
        name: row.model_name,
        creator: row.organization,
        modality: "text" as const,
        elo_score: Math.round(row.rating),
        benchmark_score: null,
        rank: Math.round(row.rank) || i + 1,
        pricing: null,
        performance: null,
        tags,
        source: "arena" as const,
        last_updated: now,
      };
    });

  if (models.length === 0) {
    throw new Error("LMArena returned no data. Check https://lmarena.ai directly.");
  }

  cacheSet(cacheKey, models, CACHE_TTL_MS);
  return models;
}
