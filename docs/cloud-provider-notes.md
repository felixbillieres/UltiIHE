# Cloud Provider Notes & Known Issues

## Provider Status (last verified: 2026-03-11)

### Tier 1 — Fully Working
| Provider | Models | Tool Calling | Notes |
|----------|--------|-------------|-------|
| **Anthropic** | Claude Opus 4, Sonnet 4, Haiku 4.5 | Excellent | Best overall. $5 free credits on signup |
| **OpenAI** | GPT-4o, GPT-4o Mini, o3-mini | Excellent | Pay-as-you-go only |
| **Google** | Gemini 2.5 Pro, 2.5 Flash | Excellent | Free API key. 1M context. Thinking budget capped at 24576 tokens |
| **Mistral** | Mistral Large, Codestral | Good | Codestral free for coding |
| **DeepSeek** | Chat, Reasoner | Good | Very cheap. Reasoner does internal reasoning |
| **xAI** | Grok 3, Grok 3 Mini | Good | $25/mo free credits |

### Tier 2 — Working with Caveats
| Provider | Models | Tool Calling | Issues |
|----------|--------|-------------|--------|
| **Groq** | Llama 3.3 70B, QwQ 32B | Good | Some models send tool params as strings instead of numbers (we coerce). Mixtral 8x7B was **decommissioned** — removed |
| **Together AI** | Llama 3.3 70B Turbo, DeepSeek R1 | Good | $5 free credits |
| **Cerebras** | Llama 3.3 70B, Llama 3.1 8B | OK | Ultra-fast inference. Free tier |
| **OpenRouter** | Various | Varies | Gateway — depends on underlying provider. Credit errors come from OpenRouter, not us |
| **Perplexity** | Sonar Pro, Sonar Reasoning Pro | Good | Search-augmented. Pay-as-you-go |
| **Cohere** | Command A, Command R7B | Good | Old models (command-r, command-r-plus) **removed Sept 2025** — updated to current models |

### Tier 3 — Limited
| Provider | Models | Tool Calling | Issues |
|----------|--------|-------------|--------|
| **Fireworks AI** | Llama 3.3 70B | **Broken** | Returns tool calls as raw JSON text instead of structured calls. Tool calling marked as disabled. DeepSeek R1 **not deployed** — removed |

## Issues Found & Fixed

### 1. Gemini 2.5 Flash — Thinking Budget Too High
**Error**: `The thinking budget 32000 is invalid. Please choose a value between 0 and 24576`
**Cause**: Our `high` thinking budget was 32000 tokens, but Gemini Flash caps at 24576
**Fix**: Added `GOOGLE_MAX_THINKING = 24576` cap in `reasoning.ts`

### 2. Groq — Tool Parameter Type Mismatch
**Error**: `parameters for tool web_search did not match schema: errors: [/numResults: expected integer, but got string]`
**Cause**: Some models (especially via Groq) generate `"3"` (string) instead of `3` (number) for numeric params
**Fix**: Changed `z.number()` to `z.coerce.number()` in web_search tool schema — auto-converts strings

### 3. Groq Mixtral 8x7B — Decommissioned
**Error**: `The model mixtral-8x7b-32768 has been decommissioned`
**Fix**: Removed from catalog, replaced with QwQ 32B (reasoning model)

### 4. Cohere Command-R / Command-R+ — Removed
**Error**: `model 'command-r-plus' was removed on September 15, 2025`
**Fix**: Updated to `command-a-03-2025` and `command-r7b-12-2024`

### 5. Fireworks DeepSeek R1 — Not Deployed
**Error**: `Model not found, inaccessible, and/or not deployed`
**Fix**: Removed from catalog (model not available on Fireworks)

### 6. Fireworks Llama 3.3 70B — Hallucinated Tool Calls
**Symptom**: Model returns raw JSON like `{"type": "function", "name": "web_search", ...}` as text instead of making structured tool calls
**Fix**: Marked `toolCalling: false` for Fireworks models. This is a Fireworks provider limitation — same model works fine on Groq/Together

### 7. OpenRouter — Credit Error
**Error**: `This request requires more credits...You requested up to 16384 tokens, but can only afford 1888`
**Not our bug**: User needs to add credits on OpenRouter. Error handling already maps this to HTTP 402.

## Error Handling

Our `errors.ts` maps provider errors to meaningful HTTP status codes:
- **429**: quota exceeded, rate limit, RESOURCE_EXHAUSTED
- **402**: credits, billing (OpenRouter credits etc)
- **400**: decommissioned, not found, does not exist
- **401**: unauthorized, invalid key
- **502**: server error from provider
- **500**: unknown/fallback

## Provider-Specific Reasoning Config

| Provider | Method | Budget Limits |
|----------|--------|---------------|
| Anthropic | `thinking.budgetTokens` | Low: 8K, Medium: 16K, High: 32K |
| OpenAI | `reasoningEffort` | "low" / "medium" / "high" (no token budget) |
| Google | `thinkingConfig.thinkingBudget` | Capped at 24576 tokens (Flash limit) |
| DeepSeek | Internal | No configuration needed |
| Others | N/A | Reasoning not supported |
