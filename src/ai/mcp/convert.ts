import { z } from "zod"

/**
 * Convert a JSON Schema object into a Zod schema.
 * Handles the common patterns found in MCP tool input schemas.
 */
export function jsonSchemaToZod(schema: Record<string, unknown>): z.ZodType {
  if (!schema || typeof schema !== "object") {
    return z.object({})
  }

  const type = schema.type as string | undefined

  switch (type) {
    case "object":
      return convertObject(schema)
    case "string":
      return convertString(schema)
    case "number":
    case "integer":
      return convertNumber(schema)
    case "boolean":
      return z.boolean()
    case "array":
      return convertArray(schema)
    case "null":
      return z.null()
    default:
      // No type specified — treat as object if it has properties
      if (schema.properties) return convertObject(schema)
      // Fallback: accept anything
      return z.any()
  }
}

function convertObject(schema: Record<string, unknown>): z.ZodObject<any> {
  const properties = (schema.properties || {}) as Record<string, Record<string, unknown>>
  const required = new Set((schema.required || []) as string[])

  const shape: Record<string, z.ZodType> = {}
  for (const [key, propSchema] of Object.entries(properties)) {
    let zodProp = jsonSchemaToZod(propSchema)
    if (!required.has(key)) {
      zodProp = zodProp.optional()
    }
    if (propSchema.description) {
      zodProp = zodProp.describe(propSchema.description as string)
    }
    shape[key] = zodProp
  }

  return z.object(shape)
}

function convertString(schema: Record<string, unknown>): z.ZodString | z.ZodEnum<any> {
  if (schema.enum && Array.isArray(schema.enum)) {
    return z.enum(schema.enum as [string, ...string[]])
  }
  let s = z.string()
  if (typeof schema.minLength === "number") s = s.min(schema.minLength)
  if (typeof schema.maxLength === "number") s = s.max(schema.maxLength)
  return s
}

function convertNumber(schema: Record<string, unknown>): z.ZodNumber {
  let n = z.number()
  if (schema.type === "integer") n = n.int()
  if (typeof schema.minimum === "number") n = n.min(schema.minimum)
  if (typeof schema.maximum === "number") n = n.max(schema.maximum)
  return n
}

function convertArray(schema: Record<string, unknown>): z.ZodArray<any> {
  const items = schema.items as Record<string, unknown> | undefined
  const itemSchema = items ? jsonSchemaToZod(items) : z.any()
  return z.array(itemSchema)
}
