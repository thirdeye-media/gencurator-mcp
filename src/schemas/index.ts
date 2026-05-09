import { z } from "zod";

export const ModalitySchema = z.enum(["text", "image", "video", "audio", "music"])
  .describe("Generation modality to query");

export const DataSourceSchema = z.enum([
  "artificial_analysis", "huggingface", "openrouter", "benchlm", "arena", "eqbench", "all"
]).describe("Data source to query. Use 'all' to aggregate from every available source.");

export const BenchLMCategorySchema = z.enum([
  "coding", "agentic", "reasoning", "knowledge", "math",
  "multimodal-grounded", "multilingual", "instruction-following",
]).describe("BenchLM capability category. Only used when source='benchlm'.");

export const CategorySchema = z.enum([
  // BenchLM capability categories
  "coding", "agentic", "reasoning", "knowledge", "math",
  "multimodal-grounded", "multilingual", "instruction-following",
  // EQ-Bench leaderboard categories
  "creative-writing", "creative-writing-longform", "emotional-intelligence",
]).describe(
  "Capability category filter. " +
  "BenchLM categories: coding, agentic, reasoning, knowledge, math, multimodal-grounded, multilingual, instruction-following. " +
  "EQ-Bench categories: creative-writing (default), creative-writing-longform, emotional-intelligence."
);

export const ResponseFormatSchema = z.enum(["markdown", "json"])
  .default("markdown")
  .describe("Output format: 'markdown' for human-readable, 'json' for structured data");

/** ranking_get_leaderboard */
export const GetLeaderboardInput = z.object({
  modality: ModalitySchema,
  source: DataSourceSchema.default("artificial_analysis"),
  category: CategorySchema.optional(),
  limit: z.number().int().min(1).max(50).default(10)
    .describe("Number of top models to return"),
  response_format: ResponseFormatSchema,
}).strict();

/** ranking_search_models */
export const SearchModelsInput = z.object({
  query: z.string().min(1).max(200)
    .describe("Search query — model name, creator, or capability keyword (e.g. 'photorealistic', 'code', 'flux')"),
  modality: ModalitySchema.optional()
    .describe("Optional: restrict search to a specific modality"),
  limit: z.number().int().min(1).max(50).default(10)
    .describe("Maximum results to return"),
  response_format: ResponseFormatSchema,
}).strict();

/** ranking_recommend */
export const RecommendInput = z.object({
  use_case: z.string().min(5).max(500)
    .describe("Describe your task — e.g. 'photorealistic product shots for e-commerce', 'retro 80s illustration for a zine', 'transcribe Dutch-language interview recordings'"),
  modality: ModalitySchema,
  priority: z.enum(["quality", "speed", "cost", "balanced"]).default("balanced")
    .describe("What matters most for your task"),
  limit: z.number().int().min(1).max(10).default(3)
    .describe("Number of recommendations to return"),
  response_format: ResponseFormatSchema,
}).strict();

/** ranking_compare */
export const CompareModelsInput = z.object({
  model_names: z.array(z.string().min(1)).min(2).max(5)
    .describe("Model names or IDs to compare (2-5 models)"),
  modality: ModalitySchema,
  response_format: ResponseFormatSchema,
}).strict();

export type GetLeaderboardParams = z.infer<typeof GetLeaderboardInput>;
export type CategoryParam = z.infer<typeof CategorySchema>;
export type SearchModelsParams = z.infer<typeof SearchModelsInput>;
export type RecommendParams = z.infer<typeof RecommendInput>;
export type CompareModelsParams = z.infer<typeof CompareModelsInput>;
