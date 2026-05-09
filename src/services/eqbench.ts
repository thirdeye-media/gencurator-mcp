import type { RankedModel } from "../types.js";
import type { EQBenchCategory } from "../types.js";
import { fetchHtml } from "./api-client.js";
import { cacheGet, cacheSet } from "./cache.js";
import { API_URLS, CACHE_TTL_MS } from "../constants.js";

const EQBENCH_URLS: Record<EQBenchCategory, string> = {
  "creative-writing": API_URLS.EQBENCH_CREATIVE_WRITING,
  "emotional-intelligence": API_URLS.EQBENCH_EMOTIONAL_INTELLIGENCE,
};

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
}

function stripCell(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function extractTds(rowHtml: string): string[] {
  const cells: string[] = [];
  const re = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  let m;
  while ((m = re.exec(rowHtml)) !== null) cells.push(m[1]);
  return cells;
}

function parseModelCell(cellHtml: string): { name: string; creator: string } {
  // Some models link to HuggingFace: href="https://huggingface.co/org/model"
  const hfMatch = cellHtml.match(/href="https:\/\/huggingface\.co\/([^/"]+)\/([^"]+)"/i);
  const orgSlug = hfMatch?.[1] ?? null;

  // Strip tags and emoji (🆕 and similar Unicode emoji blocks)
  const raw = decodeEntities(cellHtml.replace(/<[^>]+>/g, " "))
    .replace(/\p{Emoji_Presentation}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  return {
    name: raw || "unknown",
    creator: orgSlug ?? "Unknown",
  };
}

function parseFloat_(s: string): number | null {
  const n = parseFloat(s.replace(/,/g, ""));
  return isNaN(n) ? null : n;
}

// Creative Writing v3 columns:
// 0:Model  1:Abilities  2:Style  3:Slop  4:Repetition  5:Length  6:RubricScore  7:EloScore  8:Sample
function parseCreativeWriting(html: string, limit: number): RankedModel[] {
  const now = new Date().toISOString();
  const models: RankedModel[] = [];

  const tbodyM = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const scope = tbodyM?.[1] ?? html;

  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trM;
  let rank = 1;

  while ((trM = trRe.exec(scope)) !== null) {
    const cells = extractTds(trM[1]);
    if (cells.length < 8) continue;

    const { name, creator } = parseModelCell(cells[0]);
    const nameText = stripCell(cells[0]);
    if (!name || nameText === "Model") continue;

    const slop = parseFloat_(stripCell(cells[3]));
    const rubric = parseFloat_(stripCell(cells[6]));
    const elo = parseFloat_(stripCell(cells[7]));
    if (elo === null && rubric === null) continue;

    const tags: string[] = ["eq:creative-writing"];
    if (slop !== null) tags.push(`slop:${slop.toFixed(1)}`);

    models.push({
      id: name,
      name,
      creator,
      modality: "text",
      elo_score: elo,
      benchmark_score: rubric,
      rank: rank++,
      pricing: null,
      performance: null,
      tags,
      source: "eqbench",
      last_updated: now,
    });

    if (models.length >= limit) break;
  }

  return models;
}

// EQ-Bench3 columns:
// 0:Model  1:Abilities  2:Humanlike  3:Safety  4:Assertive  5:SocialIQ  6:Warm
// 7:Analytic  8:Insight  9:Empathy  10:Compliant  11:Moralising  12:Pragmatic  13:EloScore  14:Sample
function parseEmotionalIntelligence(html: string, limit: number): RankedModel[] {
  const now = new Date().toISOString();
  const models: RankedModel[] = [];

  const tbodyM = html.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i);
  const scope = tbodyM?.[1] ?? html;

  const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let trM;
  let rank = 1;

  while ((trM = trRe.exec(scope)) !== null) {
    const cells = extractTds(trM[1]);
    if (cells.length < 13) continue;

    const { name, creator } = parseModelCell(cells[0]);
    const nameText = stripCell(cells[0]);
    if (!name || nameText === "Model") continue;

    // Elo is at index 13; if there are more cells (e.g. 15 with sample link), use index 13
    const eloCell = cells.length > 13 ? cells[13] : cells[cells.length - 1];
    const elo = parseFloat_(stripCell(eloCell));
    if (elo === null) continue;

    models.push({
      id: name,
      name,
      creator,
      modality: "text",
      elo_score: elo,
      benchmark_score: null,
      rank: rank++,
      pricing: null,
      performance: null,
      tags: ["eq:emotional-intelligence"],
      source: "eqbench",
      last_updated: now,
    });

    if (models.length >= limit) break;
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

  const html = await fetchHtml(EQBENCH_URLS[category]);

  const models =
    category === "creative-writing"
      ? parseCreativeWriting(html, limit)
      : parseEmotionalIntelligence(html, limit);

  if (models.length === 0) {
    throw new Error(
      `eqbench.com returned no parseable data for category '${category}'. ` +
        "Check https://eqbench.com directly.",
    );
  }

  cacheSet(cacheKey, models, CACHE_TTL_MS);
  return models;
}
