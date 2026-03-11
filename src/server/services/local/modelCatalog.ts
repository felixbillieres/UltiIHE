/**
 * Local model catalog — curated for pentest tool calling.
 *
 * SELECTION CRITERIA:
 * - Must have reliable structured tool calling (not hallucinated)
 * - Must follow complex multi-step instructions
 * - Minimum 14B parameters (smaller models can't handle tool calling reliably)
 * - Single-file GGUF from verified repos (bartowski preferred for consistency)
 * - Models without tool calling are excluded (useless for our agent system)
 *
 * All repos verified on HuggingFace. No split files.
 */

// ─── Model Definition ─────────────────────────────────────────

export interface LocalModelDef {
  id: string
  name: string
  description: string
  parameterSize: string // "14B", "24B", "32B", "70B"
  quantization: string  // "Q4_K_M"
  fileSizeMB: number
  vramRequiredMB: number
  contextWindow: number
  toolCalling: boolean
  reasoning: boolean
  hfRepo: string      // HuggingFace repo (bartowski preferred for single files)
  hfFile: string      // Exact filename in the repo
  tags: string[]      // "pentest", "coding", "uncensored", "fast", "reasoning"
}

// ─── Catalog ──────────────────────────────────────────────────

export const LOCAL_MODEL_CATALOG: LocalModelDef[] = [

  // ═══════════════════════════════════════════════════════════
  // Entry Level (14B) — minimum viable for tool calling
  // Needs ~11 GB VRAM (RTX 3090 / 4070 Ti / 4080)
  // ═══════════════════════════════════════════════════════════
  {
    id: "qwen3-14b",
    name: "Qwen 3 14B",
    description: "Newest Qwen generation. Matches Qwen2.5-32B quality at half the size. Hybrid reasoning.",
    parameterSize: "14B",
    quantization: "Q4_K_M",
    fileSizeMB: 9000,
    vramRequiredMB: 11000,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: true,
    hfRepo: "bartowski/Qwen_Qwen3-14B-GGUF",
    hfFile: "Qwen3-14B-Q4_K_M.gguf",
    tags: ["general", "fast"],
  },
  {
    id: "qwen2.5-coder-14b",
    name: "Qwen 2.5 Coder 14B Instruct",
    description: "Strong coding model. Native Qwen tool calling. Good for script analysis.",
    parameterSize: "14B",
    quantization: "Q4_K_M",
    fileSizeMB: 9000,
    vramRequiredMB: 11000,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: false,
    hfRepo: "Qwen/Qwen2.5-Coder-14B-Instruct-GGUF",
    hfFile: "qwen2.5-coder-14b-instruct-q4_k_m.gguf",
    tags: ["coding"],
  },
  {
    id: "hermes-4-14b",
    name: "Hermes 4 14B",
    description: "NousResearch — neutral alignment, rarely refuses. Budget-friendly tool calling.",
    parameterSize: "14B",
    quantization: "Q4_K_M",
    fileSizeMB: 9000,
    vramRequiredMB: 11000,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: true,
    hfRepo: "bartowski/NousResearch_Hermes-4-14B-GGUF",
    hfFile: "Hermes-4-14B-Q4_K_M.gguf",
    tags: ["general", "pentest"],
  },

  // ═══════════════════════════════════════════════════════════
  // Mid Range (24B) — sweet spot for single GPU
  // Needs ~16-18 GB VRAM (RTX 4090 / 3090 24GB)
  // ═══════════════════════════════════════════════════════════
  {
    id: "dolphin3-mistral-24b",
    name: "Dolphin 3.0 Mistral 24B",
    description: "Fully uncensored. Zero refusals on pentest commands. Solid tool calling.",
    parameterSize: "24B",
    quantization: "Q4_K_M",
    fileSizeMB: 14300,
    vramRequiredMB: 17000,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: false,
    hfRepo: "bartowski/cognitivecomputations_Dolphin3.0-Mistral-24B-GGUF",
    hfFile: "Dolphin3.0-Mistral-24B-Q4_K_M.gguf",
    tags: ["uncensored", "pentest", "general"],
  },
  {
    id: "devstral-small-24b",
    name: "Devstral Small 2 24B",
    description: "Mistral's agentic coder. 256K context for massive terminal outputs. SWE-Bench 68%.",
    parameterSize: "24B",
    quantization: "Q4_K_M",
    fileSizeMB: 14300,
    vramRequiredMB: 17000,
    contextWindow: 256_000,
    toolCalling: true,
    reasoning: false,
    hfRepo: "bartowski/mistralai_Devstral-Small-2-24B-Instruct-2512-GGUF",
    hfFile: "Devstral-Small-2-24B-Instruct-2512-Q4_K_M.gguf",
    tags: ["coding", "general"],
  },

  // ═══════════════════════════════════════════════════════════
  // High End (27-36B) — excellent quality, single GPU possible
  // Needs ~20-26 GB VRAM
  // ═══════════════════════════════════════════════════════════
  {
    id: "qwen3.5-27b",
    name: "Qwen 3.5 27B",
    description: "Latest Qwen generation. Excellent overall performance and tool calling.",
    parameterSize: "27B",
    quantization: "Q4_K_M",
    fileSizeMB: 17100,
    vramRequiredMB: 20000,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: true,
    hfRepo: "bartowski/Qwen_Qwen3.5-27B-GGUF",
    hfFile: "Qwen3.5-27B-Q4_K_M.gguf",
    tags: ["general", "coding"],
  },
  {
    id: "qwen3-coder-30b-a3b",
    name: "Qwen 3 Coder 30B (MoE 3B active)",
    description: "MoE: 30B total but only 3B active = blazing fast. 256K context. Agentic RL trained.",
    parameterSize: "30B/3B",
    quantization: "Q4_K_M",
    fileSizeMB: 18600,
    vramRequiredMB: 21000,
    contextWindow: 256_000,
    toolCalling: true,
    reasoning: true,
    hfRepo: "unsloth/Qwen3-Coder-30B-A3B-Instruct-GGUF",
    hfFile: "Qwen3-Coder-30B-A3B-Instruct-Q4_K_M.gguf",
    tags: ["coding", "fast"],
  },
  {
    id: "qwen3-32b",
    name: "Qwen 3 32B",
    description: "Best reasoning at 32B. Hybrid thinking mode. Excellent multi-step tool chains.",
    parameterSize: "32B",
    quantization: "Q4_K_M",
    fileSizeMB: 19800,
    vramRequiredMB: 23000,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: true,
    hfRepo: "bartowski/Qwen_Qwen3-32B-GGUF",
    hfFile: "Qwen3-32B-Q4_K_M.gguf",
    tags: ["general", "reasoning", "coding"],
  },
  {
    id: "qwen2.5-coder-32b",
    name: "Qwen 2.5 Coder 32B Instruct",
    description: "Best open-source coding model. Native Qwen tool handler. Rivals GPT-4o on code.",
    parameterSize: "32B",
    quantization: "Q4_K_M",
    fileSizeMB: 19900,
    vramRequiredMB: 23000,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: false,
    hfRepo: "Qwen/Qwen2.5-Coder-32B-Instruct-GGUF",
    hfFile: "qwen2.5-coder-32b-instruct-q4_k_m.gguf",
    tags: ["coding"],
  },
  {
    id: "qwen2.5-coder-32b-abliterated",
    name: "Qwen 2.5 Coder 32B (Uncensored)",
    description: "Same as above but with safety guardrails removed. Will never refuse pentest commands.",
    parameterSize: "32B",
    quantization: "Q4_K_M",
    fileSizeMB: 19900,
    vramRequiredMB: 23000,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: false,
    hfRepo: "bartowski/Qwen2.5-Coder-32B-Instruct-abliterated-GGUF",
    hfFile: "Qwen2.5-Coder-32B-Instruct-abliterated-Q4_K_M.gguf",
    tags: ["coding", "uncensored", "pentest"],
  },
  {
    id: "hermes-4.3-36b",
    name: "Hermes 4.3 36B",
    description: "NousResearch — neutral alignment, strong tool calling. Hybrid reasoning mode.",
    parameterSize: "36B",
    quantization: "Q4_K_M",
    fileSizeMB: 21800,
    vramRequiredMB: 25000,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: true,
    hfRepo: "bartowski/NousResearch_Hermes-4.3-36B-GGUF",
    hfFile: "Hermes-4.3-36B-Q4_K_M.gguf",
    tags: ["general", "pentest"],
  },

  // ═══════════════════════════════════════════════════════════
  // Premium (49-80B) — needs serious hardware
  // Needs ~35-50 GB VRAM (A6000 / dual GPU / heavy CPU offload)
  // ═══════════════════════════════════════════════════════════
  {
    id: "nemotron-super-49b",
    name: "Nemotron Super 49B",
    description: "NVIDIA's strong reasoning model. Based on Llama 3.3 architecture.",
    parameterSize: "49B",
    quantization: "Q4_K_M",
    fileSizeMB: 30200,
    vramRequiredMB: 35000,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: false,
    hfRepo: "bartowski/nvidia_Llama-3_3-Nemotron-Super-49B-v1-GGUF",
    hfFile: "Llama-3_3-Nemotron-Super-49B-v1-Q4_K_M.gguf",
    tags: ["general", "reasoning"],
  },
  {
    id: "llama3.3-70b",
    name: "Llama 3.3 70B Instruct",
    description: "Near-frontier quality. Top BFCL tool calling scores. Best reasoning at 70B.",
    parameterSize: "70B",
    quantization: "Q4_K_M",
    fileSizeMB: 42500,
    vramRequiredMB: 46000,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: false,
    hfRepo: "bartowski/Llama-3.3-70B-Instruct-GGUF",
    hfFile: "Llama-3.3-70B-Instruct-Q4_K_M.gguf",
    tags: ["general", "coding"],
  },
  {
    id: "qwen2.5-72b",
    name: "Qwen 2.5 72B Instruct",
    description: "Top-tier open model. Excellent tool calling accuracy and multilingual support.",
    parameterSize: "72B",
    quantization: "Q4_K_M",
    fileSizeMB: 47400,
    vramRequiredMB: 50000,
    contextWindow: 128_000,
    toolCalling: true,
    reasoning: false,
    hfRepo: "bartowski/Qwen2.5-72B-Instruct-GGUF",
    hfFile: "Qwen2.5-72B-Instruct-Q4_K_M.gguf",
    tags: ["general", "coding"],
  },
  {
    id: "qwen3-coder-next",
    name: "Qwen 3 Coder Next (80B MoE 3B active)",
    description: "Flagship agentic coder. 80B total, 3B active. 256K context. Best for complex multi-step tasks.",
    parameterSize: "80B/3B",
    quantization: "Q4_K_M",
    fileSizeMB: 48500,
    vramRequiredMB: 50000,
    contextWindow: 256_000,
    toolCalling: true,
    reasoning: true,
    hfRepo: "unsloth/Qwen3-Coder-Next-GGUF",
    hfFile: "Qwen3-Coder-Next-Q4_K_M.gguf",
    tags: ["coding", "general"],
  },
]
