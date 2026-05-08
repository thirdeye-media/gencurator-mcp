import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import { z } from "zod";

import {
  GetLeaderboardInput,
  SearchModelsInput,
  RecommendInput,
  CompareModelsInput,
} from "./schemas/index.js";

import {
  handleGetLeaderboard,
  handleSearchModels,
  handleRecommend,
  handleCompareModels,
} from "./tools/handlers.js";

import { cacheClear, cacheStats } from "./services/cache.js";

// ── Server setup ────────────────────────────────────────────────

const server = new McpServer({
  name: "model-rankings-mcp-server",
  version: "1.0.0",
});

// ── Tool: ranking_get_leaderboard ───────────────────────────────

server.registerTool(
  "ranking_get_leaderboard",
  {
    title: "Get model leaderboard",
    description: `Retrieve a ranked leaderboard of AI models for a given generation modality.

Supported modalities: text, image, video, audio, music.
Sources: artificial_analysis (recommended, covers all modalities), huggingface (open models), openrouter (text only, usage-based), benchlm (text only, capability-categorised), or 'all' to aggregate.

Args:
  - modality: "text" | "image" | "video" | "audio" | "music"
  - source: "artificial_analysis" | "huggingface" | "openrouter" | "benchlm" | "all" (default: "artificial_analysis")
  - category: BenchLM category — "coding" | "agentic" | "reasoning" | "knowledge" | "math" | "multimodal-grounded" | "multilingual" | "instruction-following" (only used when source="benchlm")
  - limit: 1-50 (default: 10)
  - response_format: "markdown" | "json" (default: "markdown")

Returns: Ranked list of models with Elo scores, benchmark scores, pricing, and performance data where available.

Examples:
  - "Show me the top 5 image generation models" → modality="image", limit=5
  - "What are the best LLMs right now?" → modality="text", source="all"
  - "Top video generation models" → modality="video"`,
    inputSchema: GetLeaderboardInput,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (params) => handleGetLeaderboard(params),
);

// ── Tool: ranking_search_models ─────────────────────────────────

server.registerTool(
  "ranking_search_models",
  {
    title: "Search AI models",
    description: `Search for AI models by name, creator, or capability keyword across multiple ranking sources.

Searches Artificial Analysis, Hugging Face, and OpenRouter simultaneously. Deduplicates results and prefers entries with Elo/benchmark data.

Args:
  - query: Search term (e.g. "flux", "stable diffusion", "claude", "photorealistic", "code")
  - modality: Optional filter by modality
  - limit: 1-50 (default: 10)
  - response_format: "markdown" | "json" (default: "markdown")

Examples:
  - "Find Flux image models" → query="flux", modality="image"
  - "Search for code-focused LLMs" → query="code", modality="text"
  - "Any music models by Suno?" → query="suno", modality="music"`,
    inputSchema: SearchModelsInput,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (params) => handleSearchModels(params),
);

// ── Tool: ranking_recommend ─────────────────────────────────────

server.registerTool(
  "ranking_recommend",
  {
    title: "Get model recommendation",
    description: `Get a model recommendation based on your specific use case and priorities.

Describe your task in natural language and the tool will rank available models by your chosen priority (quality, speed, cost, or balanced).

Args:
  - use_case: Natural language description of your task (5-500 chars)
  - modality: "text" | "image" | "video" | "audio" | "music"
  - priority: "quality" | "speed" | "cost" | "balanced" (default: "balanced")
  - limit: 1-10 recommendations (default: 3)
  - response_format: "markdown" | "json" (default: "markdown")

Examples:
  - "Photorealistic product shots for e-commerce" → modality="image", priority="quality"
  - "Retro 80s illustration for a zine cover" → modality="image", priority="quality"
  - "Transcribe Dutch-language interview recordings" → modality="audio", priority="quality"
  - "Fast cheap text generation for prototyping" → modality="text", priority="cost"
  - "Generate background music for a podcast" → modality="music", priority="balanced"`,
    inputSchema: RecommendInput,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (params) => handleRecommend(params),
);

// ── Tool: ranking_compare ───────────────────────────────────────

server.registerTool(
  "ranking_compare",
  {
    title: "Compare AI models",
    description: `Side-by-side comparison of 2-5 AI models within a single modality.

Searches all available data sources to find each model and produces a comparison table with Elo, benchmark, pricing, and performance data.

Args:
  - model_names: Array of 2-5 model names or IDs to compare
  - modality: "text" | "image" | "video" | "audio" | "music"
  - response_format: "markdown" | "json" (default: "markdown")

Examples:
  - Compare GPT-4o vs Claude Sonnet → model_names=["gpt-4o", "claude-sonnet"], modality="text"
  - Compare DALL-E 3 vs Midjourney vs Flux → model_names=["dall-e", "midjourney", "flux"], modality="image"`,
    inputSchema: CompareModelsInput,
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  async (params) => handleCompareModels(params),
);

// ── Tool: ranking_cache_status ──────────────────────────────────

server.registerTool(
  "ranking_cache_status",
  {
    title: "Cache status and refresh",
    description: `Check or clear the internal ranking data cache.

Data is cached for 1 hour to avoid excessive API calls. Use action="status" to see what's cached, or action="clear" to force fresh data on next query.

Args:
  - action: "status" | "clear"`,
    inputSchema: {
      action: z.enum(["status", "clear"]).describe("Check status or clear cache"),
    },
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  async (params: { action: string }) => {
    if (params.action === "clear") {
      cacheClear();
      return { content: [{ type: "text" as const, text: "Cache cleared. Next queries will fetch fresh data." }] };
    }
    const stats = cacheStats();
    return {
      content: [{
        type: "text" as const,
        text: `**Cache status:** ${stats.entries} cached entries\n\nKeys: ${stats.keys.join(", ") || "(empty)"}`,
      }],
    };
  },
);

// ── Transport selection ─────────────────────────────────────────

async function runStdio(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Model Rankings MCP server running on stdio");
}

async function runHTTP(): Promise<void> {
  const app = express();
  app.use(express.json());

  app.post("/mcp", async (req, res) => {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });
    res.on("close", () => transport.close());
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });

  const port = parseInt(process.env.PORT || "3000");
  app.listen(port, () => {
    console.error(`Model Rankings MCP server running on http://localhost:${port}/mcp`);
  });
}

// ── Entrypoint ──────────────────────────────────────────────────

const transport = process.env.TRANSPORT || "stdio";
if (transport === "http") {
  runHTTP().catch((err) => { console.error("Server error:", err); process.exit(1); });
} else {
  runStdio().catch((err) => { console.error("Server error:", err); process.exit(1); });
}
