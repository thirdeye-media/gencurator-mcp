import type { RankedModel, Modality, HFModelEntry } from "../types.js";
import { API_URLS, HF_PIPELINE_TAGS, CACHE_TTL_MS } from "../constants.js";
import { apiGet } from "./api-client.js";
import { cacheGet, cacheSet } from "./cache.js";

function getToken(): string | undefined {
  return process.env.HF_TOKEN;
}

function buildHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { "Authorization": `Bearer ${token}` } : {};
}

function normalizeModel(raw: HFModelEntry, modality: Modality, rank: number): RankedModel {
  const id = raw.modelId ?? raw.id;
  const inferredCreator = typeof id === "string" && id.includes("/") ? id.split("/")[0] : "community";
  return {
    id,
    name: id,
    creator: raw.author ?? inferredCreator,
    modality,
    elo_score: null,
    benchmark_score: null,
    rank,
    pricing: null,
    performance: null,
    tags: [
      ...(raw.tags ?? []).slice(0, 10),
      `downloads:${raw.downloads ?? 0}`,
      `likes:${raw.likes ?? 0}`,
    ],
    source: "huggingface",
    last_updated: raw.lastModified ?? new Date().toISOString(),
  };
}

export async function fetchHFModels(
  modality: Modality,
  options: { search?: string; limit?: number; sort?: string } = {}
): Promise<RankedModel[]> {
  const { search, limit = 20, sort = "downloads" } = options;
  const pipelineTag = HF_PIPELINE_TAGS[modality];
  if (!pipelineTag) {
    throw new Error(`Unsupported modality for Hugging Face: ${modality}`);
  }

  const cacheKey = `hf:${modality}:${search ?? ""}:${sort}:${limit}`;
  const cached = cacheGet<RankedModel[]>(cacheKey);
  if (cached) return cached;

  try {
    const raw = await apiGet<HFModelEntry[]>(API_URLS.HUGGINGFACE, "models", {
      headers: buildHeaders(),
      params: {
        pipeline_tag: pipelineTag,
        sort,
        direction: "-1",
        limit,
        ...(search ? { search } : {}),
      },
    });

    const models = (Array.isArray(raw) ? raw : [])
      .map((m, i) => normalizeModel(m, modality, i + 1));

    cacheSet(cacheKey, models, CACHE_TTL_MS);
    return models;
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to fetch ${modality} models from Hugging Face: ${message}. ` +
      `For gated models, set HF_TOKEN in your environment.`
    );
  }
}
