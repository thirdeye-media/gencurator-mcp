# Model Rankings MCP Server

An MCP server that provides real-time AI model rankings and recommendations across **text, image, video, audio, and music generation** modalities.

Query it from Claude (or any MCP client) to get leaderboard data, search for models, compare options side-by-side, or get task-specific recommendations.

## Data sources

| Source | Modalities | What it provides | API key required |
|--------|-----------|------------------|-----------------|
| **Artificial Analysis** | All (text, image, video, audio, music) | Elo rankings, pricing, latency | Yes (free) |
| **Hugging Face Hub** | All | Open model metadata, downloads, community metrics | Optional (for gated models) |
| **OpenRouter** | Text | Usage-based rankings, 300+ models, pricing | No |
| **BenchLM** | Text | Capability-categorised scores (coding, reasoning, agentic, …) | No |

If a key is missing or a source errors out, the server skips that source, returns whatever it could gather from the others, and surfaces the skipped sources as warnings in the response.

## Quick start

### 1. Install dependencies

```bash
npm install
npm run build
```

### 2. Configure API keys

Create a `.env` file or export environment variables:

```bash
# Required — get a free key at https://artificialanalysis.ai/
export ARTIFICIAL_ANALYSIS_API_KEY="your_key_here"

# Optional — for gated Hugging Face models
export HF_TOKEN="hf_your_token_here"
```

### 3. Connect to Claude Desktop

Add to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "model-rankings": {
      "command": "node",
      "args": ["/path/to/model-rankings-mcp-server/dist/index.js"],
      "env": {
        "ARTIFICIAL_ANALYSIS_API_KEY": "your_key_here"
      }
    }
  }
}
```

### 4. Or run as HTTP server

```bash
TRANSPORT=http PORT=3000 node dist/index.js
```

## Tools

### `ranking_get_leaderboard`
Get a ranked leaderboard for any modality.

> "Show me the top 5 image generation models"
> "What are the best LLMs right now?"

### `ranking_search_models`
Search across all sources by name, creator, or keyword.

> "Find Flux image models"
> "Search for code-focused LLMs"

### `ranking_recommend`
Get task-specific recommendations with priority weighting.

> "Photorealistic product shots for e-commerce" (priority: quality)
> "Retro 80s illustration for a zine cover" (priority: quality)
> "Fast cheap text generation for prototyping" (priority: cost)

### `ranking_compare`
Side-by-side comparison table of 2–5 models.

> Compare GPT-4o vs Claude Sonnet vs Gemini
> Compare DALL-E 3 vs Midjourney vs Flux

### `ranking_cache_status`
Check or clear the 1-hour data cache.

## Architecture

```
src/
├── index.ts              # MCP server setup + tool registration
├── types.ts              # TypeScript interfaces
├── constants.ts          # API URLs, config
├── schemas/index.ts      # Zod input schemas
├── services/
│   ├── api-client.ts     # Generic HTTP client
│   ├── cache.ts          # In-memory TTL cache
│   ├── artificial-analysis.ts
│   ├── huggingface.ts
│   ├── openrouter.ts
│   └── benchlm.ts
└── tools/
    ├── format.ts         # Markdown/JSON formatters
    └── handlers.ts       # Tool handler logic
```

## Adding new data sources

See [CONTRIBUTING.md](CONTRIBUTING.md). Candidates we'd love to see: LMArena/LMSYS, Arena.ai, VBench, HF TTS Arena.

## License

MIT
