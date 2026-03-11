# Context Management & Compaction — Research Notes

> Recherche sur comment les IDE AI gerent le contexte LLM, la compaction, et l'optimisation pour les petits modeles locaux.

---

## Table of Contents

1. [Le Probleme](#le-probleme)
2. [Comment les autres font](#comment-les-autres-font)
3. [Techniques de compression](#techniques-de-compression)
4. [Tool calling avec les petits modeles](#tool-calling-avec-les-petits-modeles)
5. [Patterns sub-agents](#patterns-sub-agents)
6. [Context indicators UI](#context-indicators-ui)
7. [Architecture proposee pour UltiIHE](#architecture-proposee-pour-ultiIHE)
8. [Sources](#sources)

---

## Le Probleme

Chaque requete LLM est **stateless** — le modele n'a pas de memoire. A chaque message, on renvoie :

```
System prompt (~800 tokens)
+ Tool definitions (~500-1000 tokens pour 15 tools)
+ Historique complet des messages
+ Terminal output injecte
+ Message user actuel
= TOTAL INPUT (doit tenir dans le context window)
```

| Modele | Context Window | System+Tools | Reste pour le chat |
|--------|---------------|-------------|-------------------|
| Claude Opus | 200,000 | ~1,500 | ~198,500 (99.3%) |
| GPT-4o | 128,000 | ~1,500 | ~126,500 (98.8%) |
| Llama 8B Q4 | 4,096 | ~1,500 | ~2,596 (63%) |
| Llama 8B Q4 (8k) | 8,192 | ~1,500 | ~6,692 (81%) |
| Qwen 32B | 32,768 | ~1,500 | ~31,268 (95%) |

Pour les petits modeles, le systeme prompt + tools **bouffent 20-37%** du contexte avant meme le premier message.

---

## Comment les autres font

### Claude Code

**Source**: https://claudefa.st/blog/guide/mechanics/context-buffer-management

- Auto-compaction a **~83.5%** du context window (167K/200K)
- Buffer reserve reduit de 45K a ~33K tokens (16.5%)
- Override possible : `export CLAUDE_AUTOCOMPACT_PCT_OVERRIDE=90`
- `/context` pour voir l'allocation exacte (system, tools, messages, espace libre)
- `/compact` avec instructions focus : `/compact focus on the API changes`

**Compaction server-side (API beta)** :
- Strategy `compact_20260112` dans `context_management.edits`
- Cree un bloc `compaction` dans la reponse
- Les requetes suivantes droppent tout ce qui est avant le bloc
- Configurable : `trigger_tokens` threshold + `summary_prompt` optionnel
- **58.6% reduction** sur un benchmark de 5 tickets (82K vs 204K tokens input)

### OpenCode (notre reference directe)

**Source**: https://deepwiki.com/sst/opencode/2.4-context-management-and-compaction

**Detection overflow** :
```
overflow = tokens_used >= (context_limit - output_limit - reserved)
reserved = min(20_000, maxOutputTokens)
```

**Pruning** (independant de la compaction) :
1. Walk backwards dans l'historique
2. Pour chaque tool call > 40K tokens du present :
   - Marquer `time.compacted = Date.now()`
   - Output remplace par `"[Old tool result content cleared]"`
3. Proteger les 2 derniers turns user
4. Minimum 20K tokens a liberer par pruning

**Compaction** (apres pruning si toujours overflow) :
1. Agent "compaction" genere un resume structure :
   - Goal, Instructions, Discoveries, Accomplished, Relevant files
2. Le resume remplace l'historique avant le point de compaction
3. Les media sont convertis en placeholders : `[Attached image/jpeg: filename.jpg]`

**Token counting** : Simple estimation 4 chars = 1 token. Les vrais counts viennent de la reponse du provider.

**Constants cles** :
- `COMPACTION_BUFFER = 20_000`
- `PRUNE_MINIMUM = 20_000`
- `PRUNE_PROTECT = 40_000`
- `OUTPUT_TOKEN_MAX = 32_000`

### Cursor IDE

**Source**: https://cursor.com/blog/dynamic-context-discovery

Approche radicalement differente :
- **Tool output ecrit dans des fichiers** — les agents utilisent `tail`/`cat` pour lire selectivement (evite le context bloat)
- **Chat history comme fichiers queryables** — apres summarization, l'historique brut reste sur disque, l'agent grep dedans
- **MCP tool lazy loading** — un dossier par serveur, l'agent recoit uniquement les noms des tools, fetch les descriptions a la demande
  - **A/B test : 46.9% reduction des tokens totaux**
- **Terminal output sync au filesystem** — les agents grep l'historique terminal selectivement plutot que injection statique

### Comparaison

| Feature | Claude Code | OpenCode | Cursor | Codex CLI |
|---------|------------|----------|--------|-----------|
| Auto-trigger | ~83.5% | `isOverflow()` | N/A | Token threshold |
| Pruning | Non documente | Separe (40K protege) | File-based | None |
| Preserve recent | Full | 2 derniers turns | N/A | ~20K tokens |
| Compaction method | Server-side API | LLM summary | File export | Unknown |

---

## Techniques de compression

### LLMLingua (Microsoft)

**Source**: https://github.com/microsoft/LLMLingua

- Utilise un petit LM (GPT-2) pour calculer la perplexite et retirer les tokens low-information
- Jusqu'a **20x compression** avec ~1.5 point de drop en performance
- Trois modules : Budget Controller, Iterative Token-level Compression, Distribution Alignment
- LLMLingua-2 : 3-6x plus rapide que v1
- Fonctionne comme preprocessing black-box — pas de modification du modele

**Application** : Compresser les outputs de tools verbeux (scans nmap, output gobuster) avant de les envoyer au modele.

### Natural Language Tools (NLT)

**Source**: https://arxiv.org/html/2510.14453v1

- Remplace les schemas JSON des tools par des descriptions en langage naturel + decisions YES/NO
- **31.4% reduction moyenne** sur tous les modeles, **47.4% moins de tokens input**
- Elimine completement l'overhead du formatage JSON
- Les modeles open-weight voient les plus gros gains

**Application** : Au lieu d'envoyer 15 schemas JSON complexes, presenter les tools en langage naturel pour les modeles locaux.

### ctx-zip (AI SDK integration)

**Source**: https://github.com/karthikscale3/ctx-zip

- Genere des implementations TypeScript des tools comme fichiers en sandbox
- **Output compaction** : ecrit les gros resultats de tools dans `/workspace/compact/{sessionId}/tool-results/`, remplace par une reference fichier
- Deux strategies : `write-tool-results-to-file` (~60-90% reduction) ou `drop-tool-results`
- Integre via le hook `prepareStep` de AI SDK

---

## Tool calling avec les petits modeles

### PA-Tool : Adapter les schemas aux modeles

**Source**: https://arxiv.org/html/2510.07248

- Methode training-free : renomme les parametres des tools pour matcher les connaissances du pretraining du modele
- Llama3.1-8B avec PA-Tool : **88.3%** sur les taches multi-tools (depasse Claude Sonnet a 85.1%)
- Les erreurs de misalignment de schema diminuent de **80%** sur les 8B
- Generation one-time des schemas, pas de retraining

### Small Language Models for Tool Calling

**Source**: https://arxiv.org/html/2512.15943v1

- Un modele fine-tune de 350M atteint **77.55% pass rate** vs 30.18% pour ToolLLaMA-7B
- Cle : SFT cible sur des donnees domain-specific bat fondamentalement le parameter scaling
- Les patterns de sortie structures (Thought-Action-Action Input) sont critiques

### Best practices

1. **Limiter le nombre de tools** — 3-5 max par step, pas 15
2. **Few-shot examples** dans le system prompt ameliorent drastiquement le tool calling des petits modeles
3. **Hermes format** (`<tool_call>`) fonctionne nativement avec la plupart des modeles instruct
4. **activeTools** dans AI SDK pour exposer uniquement les tools pertinents par step

---

## Patterns sub-agents

### Anthropic — Write, Select, Compress, Isolate

**Source**: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

Quatre strategies fondamentales :
- **Write** : sauvegarder plans/etat dans des fichiers externes (NOTES.md, progress.txt)
- **Select** : pull le contexte a la demande via tools (grep, glob, head/tail)
- **Compress** : resumer + pruner les vieux messages quand on approche la limite
- **Isolate** : sub-agents avec des context windows separes. Le sub-agent consomme des dizaines de milliers de tokens, retourne un resume de 1-2K tokens

### Orchestrator-Worker Pattern

**Source**: https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/

- ~70% des deployments multi-agents en production
- Router qui classifie l'intent, dispatch aux workers specialises
- Chaque worker connait profondement 3-5 tools

### LangChain — Three compression tiers

**Source**: https://blog.langchain.com/context-management-for-deepagents/

1. **Tier 1** : Offload les tool results > 20K tokens au filesystem
2. **Tier 2** : Offload les tool inputs a 85% capacity
3. **Tier 3** : LLM summarization comme fallback

**Warning** : Le goal drift est le mode de failure le plus subtil apres summarization.

### Anthropic — Effective Harnesses

**Source**: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents

- Architecture two-agent : initializer (setup, progress tracking) + coding agent (progres incremental)
- Fichier `claude-progress.txt` bridge les context windows entre sessions
- Insight cle : les agents essaient d'en faire trop en un shot — forcer le progres incremental

---

## Context indicators UI

### Implementations existantes

| Outil | Implementation |
|-------|---------------|
| Claude Code CLI | `tokens 117k/200k (59%)` dans la status bar |
| VS Code Copilot | Barre visuelle fill avec hover pour le detail |
| Zed | Token usage par tool-call, meter colore (green/yellow/red) |
| AI SDK | Composant `<Context>` avec breakdown input/output/reasoning/cache |

### Bonnes pratiques

1. **Indicateur persistant** : `Context: 67% (134K/200K)` avec color coding
   - Vert < 50%, Jaune 50-80%, Rouge > 80%
2. **Hover tooltip** avec breakdown : system prompt, tool schemas, message history, tool outputs, espace libre
3. **Warning flash** quand on approche le seuil de compaction
4. **Indicateur "Compacting..."** pendant l'auto-compaction
5. **Differents seuils** selon le type de modele (cloud vs local)

---

## Architecture proposee pour UltiIHE

### Dual-mode : Cloud vs Local

| Aspect | Cloud (Claude 200K) | Local (8B, 4-32K) |
|--------|--------------------|--------------------|
| Compaction trigger | 83% (~166K) | 75% |
| Tool strategy | Full JSON schemas | Tools adaptatifs (3-5 max) |
| Tool output | `toModelOutput` compression | Ecrire dans fichier, agent lit selectivement |
| Sub-agent isolation | Nice-to-have | Obligatoire |
| System prompt | Full (tous les tools, regles) | Minimal (agent-specific) |
| Compaction method | API server-side si dispo | Client-side (OpenCode pattern) |

### Composants a implementer

#### 1. Token Counter & Context Indicator

```
┌─────────────────────────────────────┐
│ [===========================   ] 78%│  ← Status bar
│ System: 800  Tools: 650  Chat: 4200 │  ← Hover detail
│ Free: 2542 / 8192                    │
└─────────────────────────────────────┘
```

- Estimation simple (4 chars/token) comme OpenCode
- Vrais counts depuis la reponse provider quand dispo
- Refresh a chaque message envoye/recu

#### 2. prepareStep Hook (AI SDK)

Le point de controle central. Avant chaque step de la boucle agent :

```typescript
prepareStep: async ({ messages, model }) => {
  const tokenCount = estimateTokens(messages)
  const limit = getModelContextLimit(model)

  // 1. Prune old tool outputs (> 40K tokens old)
  const pruned = pruneOldToolOutputs(messages)

  // 2. If still over 80%, compress via LLM summary
  if (tokenCount > limit * 0.8) {
    return { messages: await compactMessages(pruned) }
  }

  // 3. Limit active tools based on model size
  const activeTools = selectRelevantTools(messages, model)

  return { messages: pruned, activeTools }
}
```

#### 3. Adaptive Prompt System

```typescript
function buildSystemPrompt(model: ModelInfo, agent: AgentId, context: Context) {
  const contextBudget = model.contextWindow

  if (contextBudget <= 8192) {
    // Minimal: agent-specific prompt only, no tool docs
    return MINIMAL_PROMPTS[agent]
  }
  if (contextBudget <= 32768) {
    // Medium: agent prompt + relevant tool descriptions (no full schemas)
    return MEDIUM_PROMPTS[agent] + relevantToolDescriptions(agent)
  }
  // Full: everything
  return FULL_PROMPT + ALL_TOOL_DOCS
}
```

#### 4. Tool Output Compression

```typescript
// AI SDK toModelOutput pattern
const terminalRead = {
  execute: async (args) => {
    const fullOutput = await getTerminalOutput(args.terminalId)
    return fullOutput // Full data for UI display
  },
  toModelOutput: (result) => {
    // Compressed version for the model
    if (result.length > 2000) {
      return `[Terminal output: ${result.length} chars, last 50 lines shown]\n` +
        result.split('\n').slice(-50).join('\n')
    }
    return result
  }
}
```

#### 5. Compaction Agent

Comme OpenCode, un agent dedie qui genere un resume structure :

```
## Goal
[Ce que l'utilisateur essaie de faire]

## Progress
[Ce qui a ete fait, findings, resultats]

## Current State
[Ou on en est, prochaines etapes]

## Key Files/Targets
[IP, ports, vulns, fichiers pertinents]
```

#### 6. Sub-Agent Isolation pour les petits modeles

```
User: "scan le reseau et trouve des vulns"
        │
        ▼
   [Router Agent] ← petit prompt, pas de tools
        │
        ├─► [Recon Sub-Agent] ← 3 tools: terminal_create, terminal_write, terminal_read
        │   Context: 6K tokens
        │   Returns: "Found 3 hosts, ports 22,80,443 on 10.10.1.5"
        │
        ├─► [Vuln Sub-Agent] ← 3 tools: terminal_write, terminal_read, web_search
        │   Context: 6K tokens
        │   Returns: "CVE-2024-XXXX on port 443, exploitable"
        │
        └─► Resume combine (1-2K tokens) → retourne a l'user
```

### Priorites d'implementation

1. **P0 — Context indicator** : Afficher le % utilise dans le chat. Simple, high-value.
2. **P0 — Prompt adaptatif** : Prompt leger pour modeles < 32K ctx.
3. **P1 — Tool output compression** : `toModelOutput` pour tronquer les gros outputs.
4. **P1 — Auto-prune** : Marquer les vieux tool outputs comme `[cleared]`.
5. **P2 — Auto-compaction** : Agent de summarization quand overflow.
6. **P2 — activeTools** : Limiter les tools par step selon le modele et le contexte.
7. **P3 — Sub-agent isolation** : Router + workers specialises pour les petits modeles.
8. **P3 — LLMLingua compression** : Pour les cas extremes (gros scans nmap).

---

## Sources

### Context Management & Compaction
- [DeepWiki - OpenCode Context Management](https://deepwiki.com/sst/opencode/2.4-context-management-and-compaction)
- [Claude Code Context Buffer Management](https://claudefa.st/blog/guide/mechanics/context-buffer-management)
- [Anthropic API - Compaction Docs](https://platform.claude.com/docs/en/build-with-claude/compaction)
- [Anthropic Cookbook - Automatic Context Compaction](https://platform.claude.com/cookbook/tool-use-automatic-context-compaction)
- [Context Compaction Comparison Gist (Claude Code, Codex CLI, OpenCode, Amp)](https://gist.github.com/badlogic/cd2ef65b0697c4dbe2d13fbecb0a0a5f)
- [How Claude Code Got Better by Protecting More Context](https://hyperdev.matsuoka.com/p/how-claude-code-got-better-by-protecting)
- [Factory AI - Compressing Context](https://factory.ai/news/compressing-context)
- [OpenAI - Compaction API](https://developers.openai.com/api/docs/guides/compaction/)
- [OpenAI - Unrolling the Codex Agent Loop](https://openai.com/index/unrolling-the-codex-agent-loop/)

### IDE Approaches
- [Cursor Blog - Dynamic Context Discovery](https://cursor.com/blog/dynamic-context-discovery)
- [Cursor Agent System Prompt (March 2025)](https://gist.github.com/sshh12/25ad2e40529b269a88b80e7cf1c38084)
- [InfoQ - Cursor Dynamic Context Discovery](https://www.infoq.com/news/2026/01/cursor-dynamic-context-discovery/)

### AI SDK
- [AI SDK 5 - Vercel](https://vercel.com/blog/ai-sdk-5)
- [AI SDK 6 - Vercel](https://vercel.com/blog/ai-sdk-6)
- [AI SDK - Tool Calling Docs](https://ai-sdk.dev/docs/ai-sdk-core/tools-and-tool-calling)
- [AI SDK - Loop Control / prepareStep](https://ai-sdk.dev/docs/agents/loop-control)
- [AI SDK Context Component](https://ai-sdk.dev/elements/components/context)
- [ctx-zip - Tool Call Result Compression](https://github.com/karthikscale3/ctx-zip)

### Prompt Compression
- [LLMLingua (Microsoft)](https://github.com/microsoft/LLMLingua)
- [LLMLingua Paper](https://arxiv.org/abs/2310.05736)
- [LongLLMLingua Paper](https://arxiv.org/abs/2310.06839)
- [NAACL 2025 Prompt Compression Survey](https://github.com/ZongqianLi/Prompt-Compression-Survey)

### Tool Calling
- [PA-Tool: Adapt Tool Schemas to Small Models](https://arxiv.org/abs/2510.07248)
- [Small Language Models for Efficient Agentic Tool Calling](https://arxiv.org/html/2512.15943v1)
- [Natural Language Tools (NLT)](https://arxiv.org/abs/2510.14453)
- [vLLM Tool Calling Docs](https://docs.vllm.ai/en/latest/features/tool_calling/)

### Multi-Agent Patterns
- [Anthropic - Effective Context Engineering for AI Agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- [Anthropic - Building Effective Agents](https://www.anthropic.com/research/building-effective-agents)
- [Anthropic - Effective Harnesses for Long-Running Agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [Google ADK Multi-Agent Patterns](https://developers.googleblog.com/developers-guide-to-multi-agent-patterns-in-adk/)
- [LangChain - Context Management for Deep Agents](https://blog.langchain.com/context-management-for-deepagents/)
- [LangChain - Context Engineering for Agents](https://blog.langchain.com/context-engineering-for-agents/)

### UI / Context Indicators
- [VS Code Copilot Context Management](https://code.visualstudio.com/docs/copilot/chat/copilot-chat-context)
- [Claude Code Context Indicator Feature Request](https://github.com/anthropics/claude-code/issues/28962)
- [Zed - Display Token Usage Discussion](https://github.com/zed-industries/zed/discussions/47171)

### llama.cpp
- [llama.cpp KV Cache Reuse Tutorial](https://github.com/ggml-org/llama.cpp/discussions/13606)
- [llama.cpp Server README](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md)
- [Leeroopedia - llama.cpp Context Window Management](https://leeroopedia.com/index.php/Principle:Ggml_org_Llama_cpp_Context_Window_Management)
- [Leeroopedia - llama.cpp KV Cache](https://leeroopedia.com/index.php/Implementation:Ggml_org_Llama_cpp_KV_Cache)

### OpenCode Source Code (dans le repo)
- `oldversions/opencode-exegol/packages/opencode/src/session/compaction.ts` — Compaction + pruning
- `oldversions/opencode-exegol/packages/opencode/src/session/message-v2.ts` — Message conversion, token tracking
- `oldversions/opencode-exegol/packages/opencode/src/provider/transform.ts` — Provider normalization, caching
- `oldversions/opencode-exegol/packages/opencode/src/util/token.ts` — Token estimation
