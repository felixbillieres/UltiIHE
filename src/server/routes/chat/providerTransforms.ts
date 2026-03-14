/**
 * Provider-specific message & schema transforms.
 *
 * Ported from OpenCode's ProviderTransform namespace.
 * Handles per-provider quirks so all models work reliably:
 *
 * 1. Message normalization — empty content, tool IDs, interleaved reasoning
 * 2. Unsupported parts — media → text errors instead of crashes
 * 3. Schema sanitization — Google/Gemini enum/type fixes
 * 4. Prompt caching hints — Anthropic/OpenRouter/Bedrock
 * 5. Sampling defaults — per-model temperature/topP/topK
 * 6. wrapLanguageModel middleware — transforms at the AI SDK level
 */

import { wrapLanguageModel, type LanguageModel, type LanguageModelMiddleware } from "ai"
import type { JSONSchema7 } from "@ai-sdk/provider"

// ── Message normalization ────────────────────────────────────────

/**
 * Normalize messages for a specific provider.
 * Applied inside wrapLanguageModel middleware (not before streamText).
 */
export function normalizeMessages(
  messages: any[],
  providerId: string,
  modelId: string = "",
): any[] {
  let result = [...messages]

  // Anthropic: reject empty content, sanitize tool call IDs
  if (
    providerId === "anthropic" ||
    modelId.includes("claude")
  ) {
    result = filterEmptyMessages(result)
    result = filterEmptyParts(result)
    result = sanitizeToolCallIds(result, /[^a-zA-Z0-9_-]/g, "_")
    return result
  }

  // Mistral/Devstral: 9-char alphanumeric IDs, assistant gaps
  if (
    providerId === "mistral" ||
    modelId.toLowerCase().includes("mistral") ||
    modelId.toLowerCase().includes("devstral")
  ) {
    result = normalizeMistralToolIds(result)
    result = insertMistralAssistantGaps(result)
    result = filterEmptyMessages(result)
    return result
  }

  // OpenRouter: same as Anthropic for safety
  if (providerId === "openrouter") {
    result = filterEmptyMessages(result)
    result = sanitizeToolCallIds(result, /[^a-zA-Z0-9_-]/g, "_")
    return result
  }

  // Default: basic cleanup
  result = filterEmptyMessages(result)
  return result
}

/**
 * Convert unsupported media parts to text error messages.
 * Prevents crashes when a model can't handle images/audio/pdf.
 */
export function filterUnsupportedParts(
  messages: any[],
  _providerId: string,
  _modelId: string,
): any[] {
  // For now, we don't have a model capabilities database like OpenCode.
  // Local models never support media — convert all file/image parts to text.
  if (_providerId === "local" || _providerId === "custom") {
    return messages.map((msg: any) => {
      if (msg.role !== "user" || !Array.isArray(msg.content)) return msg
      const filtered = msg.content.map((part: any) => {
        if (part.type === "image" || part.type === "file") {
          const kind = part.type === "image" ? "image" : (part.filename || "file")
          return {
            type: "text" as const,
            text: `ERROR: Cannot process ${kind} (this model does not support ${part.type} input). Describe it in text instead.`,
          }
        }
        return part
      })
      return { ...msg, content: filtered }
    })
  }
  return messages
}

// ── Internal helpers ──────────────────────────────────────────────

function filterEmptyMessages(messages: any[]): any[] {
  return messages
    .map((msg) => {
      if (typeof msg.content === "string") {
        return msg.content.length > 0 ? msg : undefined
      }
      if (Array.isArray(msg.content)) {
        const filtered = msg.content.filter((part: any) => {
          if (part.type === "text" && (!part.text || part.text.length === 0)) return false
          return true
        })
        if (filtered.length === 0) return undefined
        return { ...msg, content: filtered }
      }
      return msg
    })
    .filter((msg): msg is any => msg !== undefined)
}

/** Anthropic rejects empty text/reasoning parts inside arrays */
function filterEmptyParts(messages: any[]): any[] {
  return messages
    .map((msg: any) => {
      if (typeof msg.content === "string") {
        return msg.content === "" ? undefined : msg
      }
      if (!Array.isArray(msg.content)) return msg
      const filtered = msg.content.filter((part: any) => {
        if (part.type === "text" || part.type === "reasoning") {
          return part.text !== ""
        }
        return true
      })
      if (filtered.length === 0) return undefined
      return { ...msg, content: filtered }
    })
    .filter((msg: any): msg is any => msg !== undefined)
}

function sanitizeToolCallIds(messages: any[], pattern: RegExp, replacement: string): any[] {
  return messages.map((msg) => {
    let result = msg
    if (msg.tool_call_id) {
      result = { ...result, tool_call_id: msg.tool_call_id.replace(pattern, replacement) }
    }
    if (Array.isArray(msg.content)) {
      result = {
        ...result,
        content: msg.content.map((part: any) => {
          if (part.toolCallId) {
            return { ...part, toolCallId: part.toolCallId.replace(pattern, replacement) }
          }
          return part
        }),
      }
    }
    return result
  })
}

function normalizeMistralToolIds(messages: any[]): any[] {
  const idMap = new Map<string, string>()
  let counter = 0

  function getMistralId(original: string): string {
    if (!original) return "call00000"
    if (idMap.has(original)) return idMap.get(original)!
    const normalized = original.replace(/[^a-zA-Z0-9]/g, "").substring(0, 9).padEnd(9, "0")
    const id = normalized || `call${String(counter++).padStart(5, "0")}`
    idMap.set(original, id)
    return id
  }

  return messages.map((msg) => {
    let result = msg
    if (msg.tool_call_id) {
      result = { ...result, tool_call_id: getMistralId(msg.tool_call_id) }
    }
    if (Array.isArray(msg.content)) {
      result = {
        ...result,
        content: msg.content.map((part: any) => {
          if (part.toolCallId) {
            return { ...part, toolCallId: getMistralId(part.toolCallId) }
          }
          return part
        }),
      }
    }
    return result
  })
}

function insertMistralAssistantGaps(messages: any[]): any[] {
  const result: any[] = []
  for (let i = 0; i < messages.length; i++) {
    result.push(messages[i])
    if (
      messages[i].role === "tool" &&
      i + 1 < messages.length &&
      messages[i + 1].role === "user"
    ) {
      result.push({ role: "assistant", content: [{ type: "text", text: "Done." }] })
    }
  }
  return result
}

// ── Schema sanitization ──────────────────────────────────────────

/**
 * Sanitize JSON Schema for provider-specific requirements.
 * Ported from OpenCode's ProviderTransform.schema().
 *
 * Google/Gemini:
 * - Convert integer enums to string enums
 * - Filter required arrays to match actual properties
 * - Ensure array items have a type
 * - Remove properties/required from non-object types
 */
export function sanitizeSchema(
  schema: JSONSchema7,
  providerId: string,
  modelId: string,
): JSONSchema7 {
  if (providerId !== "google" && !modelId.includes("gemini")) {
    return schema
  }

  const isPlainObject = (node: unknown): node is Record<string, any> =>
    typeof node === "object" && node !== null && !Array.isArray(node)

  const hasCombiner = (node: unknown) =>
    isPlainObject(node) && (Array.isArray(node.anyOf) || Array.isArray(node.oneOf) || Array.isArray(node.allOf))

  const hasSchemaIntent = (node: unknown) => {
    if (!isPlainObject(node)) return false
    if (hasCombiner(node)) return true
    return [
      "type", "properties", "items", "prefixItems", "enum", "const",
      "$ref", "additionalProperties", "patternProperties", "required",
      "not", "if", "then", "else",
    ].some((key) => key in node)
  }

  const sanitizeGemini = (obj: any): any => {
    if (obj === null || typeof obj !== "object") return obj
    if (Array.isArray(obj)) return obj.map(sanitizeGemini)

    const result: any = {}
    for (const [key, value] of Object.entries(obj)) {
      if (key === "enum" && Array.isArray(value)) {
        // Convert all enum values to strings
        result[key] = value.map((v) => String(v))
        if (result.type === "integer" || result.type === "number") {
          result.type = "string"
        }
      } else if (typeof value === "object" && value !== null) {
        result[key] = sanitizeGemini(value)
      } else {
        result[key] = value
      }
    }

    // Filter required to match actual properties
    if (result.type === "object" && result.properties && Array.isArray(result.required)) {
      result.required = result.required.filter((field: any) => field in result.properties)
    }

    // Ensure array items have a type
    if (result.type === "array" && !hasCombiner(result)) {
      if (result.items == null) result.items = {}
      if (isPlainObject(result.items) && !hasSchemaIntent(result.items)) {
        result.items.type = "string"
      }
    }

    // Remove properties/required from non-object types
    if (result.type && result.type !== "object" && !hasCombiner(result)) {
      delete result.properties
      delete result.required
    }

    return result
  }

  return sanitizeGemini(schema) as JSONSchema7
}

// ── Prompt caching ───────────────────────────────────────────────

export function getPromptCacheOptions(providerId: string): Record<string, any> {
  switch (providerId) {
    case "anthropic":
    case "openrouter":
      return {
        [providerId]: { cacheControl: { type: "ephemeral" } },
      }
    case "amazon-bedrock":
      return {
        "amazon-bedrock": { cachePoint: { type: "default" } },
      }
    default:
      return {}
  }
}

export function supportsPromptCaching(providerId: string): boolean {
  return ["anthropic", "openrouter", "amazon-bedrock"].includes(providerId)
}

/**
 * Apply cache hints to the last 2 conversation messages.
 *
 * OpenCode pattern: cache the first 2 system messages + last 2 conversation messages.
 * System prompt caching is handled via providerOptions (applied to the whole system message).
 * This function handles the last 2 NON-system messages — so subsequent steps
 * pay only 10% for the cached prefix (Anthropic pricing).
 *
 * Mutates messages in-place.
 */
export function applyCacheHints(messages: any[], providerId: string): void {
  if (!supportsPromptCaching(providerId)) return

  const cacheOptions = getPromptCacheOptions(providerId)
  if (!cacheOptions || Object.keys(cacheOptions).length === 0) return

  // Find last 2 non-system messages with substantial content
  let cached = 0
  for (let i = messages.length - 1; i >= 0 && cached < 2; i--) {
    const msg = messages[i]
    if (msg.role === "system") continue

    // Only cache messages with meaningful content (avoid caching empty/tiny messages)
    const contentLen = typeof msg.content === "string"
      ? msg.content.length
      : Array.isArray(msg.content)
        ? msg.content.reduce((sum: number, p: any) => sum + (p.text?.length || 0), 0)
        : 0
    if (contentLen < 100) continue // Skip tiny messages (not worth caching)

    // Apply provider-specific cache options
    msg.providerOptions = {
      ...(msg.providerOptions || {}),
      ...cacheOptions,
    }
    cached++
  }
}

// ── Temperature / sampling defaults ──────────────────────────────

/**
 * Per-MODEL (not just per-provider) sampling defaults.
 * Ported from OpenCode's ProviderTransform.temperature/topP/topK.
 */
export function getDefaultSampling(providerId: string, modelId: string): {
  temperature?: number
  topP?: number
  topK?: number
} {
  const id = modelId.toLowerCase()

  // ── Model-specific overrides (highest priority) ──
  if (id.includes("qwen")) return { temperature: 0.55, topP: 1.0 }
  if (id.includes("gemini")) return { temperature: 1.0, topK: 64 }
  if (id.includes("glm-4")) return { temperature: 1.0 }
  if (id.includes("minimax-m2")) {
    const topK = ["m2.", "m25", "m21"].some((s) => id.includes(s)) ? 40 : 20
    return { temperature: 1.0, topP: 0.95, topK }
  }
  if (id.includes("kimi-k2")) {
    if (["thinking", "k2.", "k2p", "k2-5"].some((s) => id.includes(s))) {
      return { temperature: 1.0, topP: 0.95 }
    }
    return { temperature: 0.6 }
  }

  // ── Provider-level defaults ──
  switch (providerId) {
    case "mistral": return { temperature: 0.7 }
    case "fireworks":
    case "togetherai": return { temperature: 0.6 }
    case "cerebras": return { temperature: 0.5 }
    case "groq": return { temperature: 0.6 }
    case "cohere": return { temperature: 0.3 }
    case "local":
    case "custom": return { temperature: 0.4 }
    default: return {} // anthropic, openai, xai, deepseek: use model defaults
  }
}

// ── wrapLanguageModel middleware ──────────────────────────────────

/**
 * Wrap a language model with provider-specific transforms.
 * This applies message normalization and unsupported part filtering
 * at the AI SDK middleware level — BEFORE the HTTP call is made.
 *
 * Equivalent to OpenCode's:
 *   wrapLanguageModel({ model: language, middleware: [{ transformParams(...) }] })
 */
export function withProviderTransforms(
  model: LanguageModel,
  providerId: string,
  modelId: string,
): LanguageModel {
  const middleware: LanguageModelMiddleware = {
    specificationVersion: "v3" as const,
    async transformParams(args: any) {
      const prompt = args.params.prompt
      if (Array.isArray(prompt)) {
        let msgs = filterUnsupportedParts(prompt, providerId, modelId)
        msgs = normalizeMessages(msgs, providerId, modelId)
        args.params.prompt = msgs
      }
      return args.params
    },
  }

  return wrapLanguageModel({
    model: model as any,
    middleware: [middleware],
  })
}
