import { describe, expect, test } from "bun:test"
import {
  TOOL_REGISTRY,
  getReadOnlyToolNames,
  getToolsByCategory,
  getApprovalRequiredTools,
  type ToolCategory,
} from "../../../src/ai/tool/registry"

describe("TOOL_REGISTRY", () => {
  test("every entry has consistent name field", () => {
    for (const [key, meta] of Object.entries(TOOL_REGISTRY)) {
      expect(meta.name).toBe(key)
    }
  })

  test("every entry has required fields", () => {
    for (const meta of Object.values(TOOL_REGISTRY)) {
      expect(typeof meta.name).toBe("string")
      expect(typeof meta.category).toBe("string")
      expect(typeof meta.description).toBe("string")
      expect(typeof meta.requiresApproval).toBe("boolean")
      expect(typeof meta.readOnly).toBe("boolean")
    }
  })

  test("category is a valid ToolCategory", () => {
    const validCategories: ToolCategory[] = [
      "terminal", "file", "search", "web", "workflow", "integration",
    ]
    for (const meta of Object.values(TOOL_REGISTRY)) {
      expect(validCategories).toContain(meta.category)
    }
  })

  test("most readOnly tools do not require approval", () => {
    // Some tools like web_search are readOnly but still need approval (cost/privacy)
    const readOnlyWithApproval = Object.values(TOOL_REGISTRY)
      .filter((t) => t.readOnly && t.requiresApproval)
    // These should be web tools only (external calls)
    for (const t of readOnlyWithApproval) {
      expect(t.category).toBe("web")
    }
  })

  test("contains expected core tools", () => {
    const expected = [
      "terminal_create", "terminal_write", "terminal_read", "terminal_list",
      "file_read", "file_write", "file_edit",
      "search_find", "search_grep",
      "web_search", "web_fetch",
    ]
    for (const name of expected) {
      expect(TOOL_REGISTRY).toHaveProperty(name)
    }
  })
})

describe("getReadOnlyToolNames", () => {
  test("returns only readOnly tools", () => {
    const names = getReadOnlyToolNames()
    for (const name of names) {
      expect(TOOL_REGISTRY[name].readOnly).toBe(true)
    }
  })

  test("includes known read-only tools", () => {
    const names = getReadOnlyToolNames()
    expect(names).toContain("terminal_read")
    expect(names).toContain("terminal_list")
    expect(names).toContain("file_read")
    expect(names).toContain("search_find")
    expect(names).toContain("search_grep")
  })

  test("excludes write tools", () => {
    const names = getReadOnlyToolNames()
    expect(names).not.toContain("terminal_write")
    expect(names).not.toContain("file_write")
    expect(names).not.toContain("file_edit")
    expect(names).not.toContain("file_delete")
  })
})

describe("getToolsByCategory", () => {
  test("returns terminal tools", () => {
    const tools = getToolsByCategory("terminal")
    expect(tools.length).toBeGreaterThan(0)
    for (const name of tools) {
      expect(TOOL_REGISTRY[name].category).toBe("terminal")
    }
  })

  test("returns file tools", () => {
    const tools = getToolsByCategory("file")
    expect(tools).toContain("file_read")
    expect(tools).toContain("file_write")
    expect(tools).toContain("file_edit")
  })

  test("returns empty for unknown category", () => {
    const tools = getToolsByCategory("nonexistent" as ToolCategory)
    expect(tools).toHaveLength(0)
  })
})

describe("getApprovalRequiredTools", () => {
  test("returns only approval-required tools", () => {
    const names = getApprovalRequiredTools()
    for (const name of names) {
      expect(TOOL_REGISTRY[name].requiresApproval).toBe(true)
    }
  })

  test("includes write operations", () => {
    const names = getApprovalRequiredTools()
    expect(names).toContain("terminal_write")
    expect(names).toContain("file_write")
    expect(names).toContain("file_edit")
    expect(names).toContain("file_delete")
  })

  test("excludes read-only tools", () => {
    const names = getApprovalRequiredTools()
    expect(names).not.toContain("terminal_read")
    expect(names).not.toContain("file_read")
    expect(names).not.toContain("search_find")
  })
})
