import type { RankedModel } from "../types.js";
import type { EQBenchCategory } from "../types.js";
import { fetchHtml } from "./api-client.js";
import { cacheGet, cacheSet } from "./cache.js";
import { API_URLS, CACHE_TTL_MS } from "../constants.js";

const JS_URLS: Record<EQBenchCategory, string> = {
  "creative-writing": API_URLS.EQBENCH_CREATIVE_WRITING,
  "creative-writing-longform": API_URLS.EQBENCH_CREATIVE_WRITING_LONGFORM,
  "emotional-intelligence": API_URLS.EQBENCH_EMOTIONAL_INTELLIGENCE,
};

const VAR_NAMES: Record<EQBenchCategory, string> = {
  "creative-writing": "leaderboardDataCreativeWritingV3",
  "creative-writing-longform": "leaderboardDataLongformV3",
  "emotional-intelligence": "leaderboardDataEQBench3",
};

function extractCsv(js: string, varName: string): string {
  const m = js.match(new RegExp(`${varName}\\s*=\\s*\`([\\s\\S]+?)\``));
  if (m) return m[1];
  throw new Error(`Cannot find ${varName} in EQ-bench data file`);
}

function guessCreator(name: string): string {
  if (name.includes("/")) return name.split("/")[0];
  const n = name.toLowerCase();
  if (n.includes("claude")) return "Anthropic";
  if (n.startsWith("gpt") || n.startsWith("o1") || n.startsWith("o3") || n.startsWith("o4")) return "OpenAI";
  if (n.includes("gemini")) return "Google";
  if (n.includes("llama") || n.includes("meta-")) return "Meta";
  if (n.includes("mistral") || n.includes("mixtral")) return "Mistral";
  if (n.includes("qwen")) return "Alibaba";
  if (n.includes("deepseek")) return "DeepSeek";
  if (n.includes("grok")) return "xAI";
  return "Unknown";
}

function parseLeaderboard(
  js: string,
  varName: string,
  category: EQBenchCategory,
  limit: number,
): RankedModel[] {
  const csv = extractCsv(js, varName);
  const now = new Date().toISOString();
  const models: RankedModel[] = [];
  let rank = 1;

  for (const line of csv.split("\n")) {
    if (models.length >= limit) break;
    const cells = line.split(",").map(c => c.trim());
    if (cells.length < 2) continue;

    const rawName = cells[0];
    if (!rawName || rawName === "model_name") continue;

    const name = rawName.replace(/^\*/, "");
    const tags: string[] = [`eq:${category}`];
    let elo: number | null = null;
    let score: number | null = null;

    if (category === "creative-writing-longform") {
      // 0:model 1:overall_score_100 2:avg_chapter_length 3:vocab 4:slop ...
      const s = parseFloat(cells[1]);
      if (isNaN(s)) continue;
      score = s;
      const slop = parseFloat(cells[4]);
      if (!isNaN(slop)) tags.push(`slop:${slop.toFixed(1)}`);
    } else if (category === "creative-writing") {
      // 0:model 1:elo 2:rubric 3:avg_length 4:vocab 5:slop ...
      const e = parseFloat(cells[1]);
      if (isNaN(e)) continue;
      elo = e;
      score = isNaN(parseFloat(cells[2])) ? null : parseFloat(cells[2]);
      const slop = parseFloat(cells[5]);
      if (!isNaN(slop)) tags.push(`slop:${slop.toFixed(1)}`);
    } else {
      // emotional-intelligence: 0:model 1:elo_norm 2:rubric_0_100 ...
      const e = parseFloat(cells[1]);
      if (isNaN(e)) continue;
      elo = e;
      score = isNaN(parseFloat(cells[2])) ? null : parseFloat(cells[2]);
    }

    models.push({
      id: name,
      name,
      creator: guessCreator(name),
      modality: "text",
      elo_score: elo,
      benchmark_score: score,
      rank: rank++,
      pricing: null,
      performance: null,
      tags,
      source: "eqbench",
      last_updated: now,
    });
  }

  return models;
}

export async function fetchEQBenchLeaderboard(
  options: { category?: EQBenchCategory; limit?: number } = {},
): Promise<RankedModel[]> {
  const { category = "creative-writing", limit = 50 } = options;
  const cacheKey = `eqbench:${category}:${limit}`;
  const cached = cacheGet<RankedModel[]>(cacheKey);
  if (cached) return cached;

  const js = await fetchHtml(JS_URLS[category]);
  const models = parseLeaderboard(js, VAR_NAMES[category], category, limit);

  if (models.length === 0) {
    throw new Error(
      `EQ-bench returned no data for '${category}'. ` +
        "Check https://eqbench.com directly.",
    );
  }

  cacheSet(cacheKey, models, CACHE_TTL_MS);
  return models;
}
