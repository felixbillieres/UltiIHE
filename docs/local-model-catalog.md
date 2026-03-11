# Local Model Catalog — Selection & Research

## Selection Criteria

Every model in UltiIHE's local catalog must meet ALL of these:

1. **Reliable structured tool calling** — Must produce real JSON tool calls via OpenAI-compatible API (llama-server + `--jinja`), not hallucinated text that looks like tool calls
2. **Complex multi-step instruction following** — Pentesting requires reading terminal output, deciding next commands, using multiple tools in sequence, reasoning about vulnerabilities
3. **Single-file GGUF Q4_K_M** — From verified repos (bartowski preferred). No split files that crash downloads
4. **Minimum 14B parameters** — Smaller models can't reliably handle tool calling. Tested: Hermes 3 8B, Llama 3.1 8B, Qwen 2.5 7B all hallucinate tool calls
5. **Proper chat template with tool support** — Requires Jinja templates compatible with llama.cpp's tool calling system

## Why No Small Models (< 14B)?

We tested extensively and found:
- **1.5-3B models**: Cannot follow tool schemas at all. Generate random JSON or plain text
- **7-8B models** (Hermes 3 8B, Llama 3.1 8B): Hallucinate tool execution — generate fake output text that looks like tool results without actually making structured tool calls
- **9B models** (Gemma 2 9B): No tool calling support at all
- **DeepSeek R1 Distill (all sizes)**: Reasoning-only models with no tool calling — useless for our agent system that requires tools

## Catalog Tiers

### Entry Level (14B) — ~9 GB download, ~11 GB VRAM
| Model | Tool Calling | Uncensored | Best For |
|-------|-------------|------------|----------|
| Qwen 3 14B | Excellent (native handler) | No | General use, hybrid reasoning |
| Qwen 2.5 Coder 14B | Good (native handler) | No | Code analysis, script writing |
| Hermes 4 14B | Good (Hermes format) | Mostly | Pentest (neutral alignment) |

### Mid Range (24B) — ~14 GB download, ~17 GB VRAM
| Model | Tool Calling | Uncensored | Best For |
|-------|-------------|------------|----------|
| Dolphin 3.0 Mistral 24B | Good | **Yes** | Pentest (zero refusals) |
| Devstral Small 2 24B | Good | No | Agentic coding, 256K context |

### High End (27-36B) — ~18-22 GB download, ~20-25 GB VRAM
| Model | Tool Calling | Uncensored | Best For |
|-------|-------------|------------|----------|
| Qwen 3.5 27B | Excellent | No | Latest gen, great overall |
| Qwen 3 Coder 30B (MoE) | Excellent | No | Fast inference (3B active), 256K ctx |
| Qwen 3 32B | Excellent | No | Best reasoning, hybrid thinking |
| Qwen 2.5 Coder 32B | Excellent | No | Best coding model |
| **Qwen 2.5 Coder 32B Abliterated** | **Excellent** | **Yes** | **#1 PICK for pentest** |
| Hermes 4.3 36B | Excellent | Mostly | Neutral alignment, strong tools |

### Premium (49-80B) — ~30-48 GB download, ~35-50 GB VRAM
| Model | Tool Calling | Uncensored | Best For |
|-------|-------------|------------|----------|
| Nemotron Super 49B | Good | No | Strong reasoning |
| Llama 3.3 70B | Excellent | No | Near-frontier quality |
| Qwen 2.5 72B | Excellent | No | Top-tier tool calling |
| Qwen 3 Coder Next (MoE) | Excellent | No | Flagship agentic, 256K ctx |

## Recommended Defaults

- **Best for pentest**: Qwen 2.5 Coder 32B Abliterated (no refusals + excellent tool calling)
- **Best bang for buck**: Qwen 3 Coder 30B A3B (MoE = fast inference, 256K context)
- **Budget option**: Dolphin 3.0 Mistral 24B (uncensored, 14 GB download)
- **Entry level**: Qwen 3 14B (if you only have ~12 GB VRAM)
- **Maximum quality**: Llama 3.3 70B or Qwen 2.5 72B

## Safety Refusal Risks (for pentest commands)

Models ranked from MOST to LEAST likely to refuse nmap/sqlmap/metasploit etc:
1. Llama 3.3 70B — Meta's Llama Guard is aggressive
2. Qwen 2.5 (standard variants) — Alibaba alignment, inconsistent
3. Devstral / Mistral — Moderate alignment
4. Qwen 3 / 3.5 — Slightly less restrictive than 2.5
5. Nemotron — Generally permissive for technical tasks
6. Hermes 4 / 4.3 — NousResearch neutral alignment, rarely refuses
7. Qwen 2.5 Abliterated — Safety pathways removed, no refusals
8. Dolphin 3.0 — Explicitly uncensored, zero refusals

## GGUF Repo Strategy

- **bartowski** repos preferred — always single-file, consistent naming (PascalCase)
- **Official Qwen** repos — BEWARE: many have split files (7B+). Only use for Coder variants which are single-file
- **unsloth** repos — used for Qwen3-Coder MoE variants (single-file)
- **NousResearch** — official single-file GGUFs for Hermes models
- Never use repos from TheBloke (outdated), or any repo without verifying the exact filename exists

## llama-server Configuration

Required flags for tool calling:
```bash
llama-server \
  -m model.gguf \
  --jinja           # Required for tool/function calling templates
  -np 1             # Single slot = max context per request on CPU
  -c 4096           # Context size (adjust based on available RAM)
  -ngl 999          # GPU layers (999 = all, 0 = CPU only)
```

The `--jinja` flag is critical — without it, tools sent via the OpenAI-compatible API are silently ignored.
