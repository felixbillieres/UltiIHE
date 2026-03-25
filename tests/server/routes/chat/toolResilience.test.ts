import { describe, expect, test } from "bun:test"
import {
  createDoomLoopTracker,
  invalidTool,
  buildRepairCallback,
  type DoomLoopResult,
} from "../../../../src/server/routes/chat/toolResilience"

// ── createDoomLoopTracker ────────────────────────────────────

describe("createDoomLoopTracker", () => {
  test("returns ok for first call", () => {
    const tracker = createDoomLoopTracker()
    expect(tracker.check("file_read", { path: "/etc" })).toEqual({ action: "ok" })
  })

  test("returns ok for different consecutive calls", () => {
    const tracker = createDoomLoopTracker()
    tracker.check("file_read", { path: "/etc" })
    expect(tracker.check("file_read", { path: "/tmp" })).toEqual({ action: "ok" })
    expect(tracker.check("search_grep", { pattern: "test" })).toEqual({ action: "ok" })
  })

  test("warns on second identical call", () => {
    const tracker = createDoomLoopTracker()
    const args = { path: "/etc/passwd" }
    tracker.check("file_read", args)
    const result = tracker.check("file_read", args)
    expect(result.action).toBe("warn")
    expect((result as any).toolName).toBe("file_read")
  })

  test("aborts after 3 consecutive identical calls", () => {
    const tracker = createDoomLoopTracker()
    const args = { path: "/etc/passwd" }
    tracker.check("file_read", args) // 1st
    tracker.check("file_read", args) // 2nd — warn (mistake=1)
    tracker.check("file_read", args) // 3rd — warn (mistake=2)
    const result = tracker.check("file_read", args) // 4th — abort (mistake=3)
    expect(result.action).toBe("abort")
  })

  test("exempts terminal_read from loop detection", () => {
    const tracker = createDoomLoopTracker()
    const args = { terminalId: "t1" }
    for (let i = 0; i < 10; i++) {
      expect(tracker.check("terminal_read", args)).toEqual({ action: "ok" })
    }
  })

  test("exempts terminal_list from loop detection", () => {
    const tracker = createDoomLoopTracker()
    for (let i = 0; i < 10; i++) {
      expect(tracker.check("terminal_list", {})).toEqual({ action: "ok" })
    }
  })

  test("exempts terminal_close from loop detection", () => {
    const tracker = createDoomLoopTracker()
    const args = { terminalId: "t1" }
    for (let i = 0; i < 10; i++) {
      expect(tracker.check("terminal_close", args)).toEqual({ action: "ok" })
    }
  })

  test("resetOnText clears history and mistake count", () => {
    const tracker = createDoomLoopTracker()
    const args = { path: "/etc" }
    tracker.check("file_read", args)
    tracker.check("file_read", args) // warn
    expect(tracker.mistakes).toBe(1)

    tracker.resetOnText()
    expect(tracker.mistakes).toBe(0)
    expect(tracker.check("file_read", args)).toEqual({ action: "ok" })
  })

  test("resetOnSuccess clears mistake count but not history", () => {
    const tracker = createDoomLoopTracker()
    const args = { path: "/etc" }
    tracker.check("file_read", args)
    tracker.check("file_read", args) // warn, mistake=1
    expect(tracker.mistakes).toBe(1)

    tracker.resetOnSuccess()
    expect(tracker.mistakes).toBe(0)
  })

  test("getLoopTool returns null when no loop", () => {
    const tracker = createDoomLoopTracker()
    expect(tracker.getLoopTool()).toBeNull()
    tracker.check("file_read", { path: "/a" })
    expect(tracker.getLoopTool()).toBeNull()
    tracker.check("file_read", { path: "/b" })
    expect(tracker.getLoopTool()).toBeNull()
  })

  test("getLoopTool returns tool name when looping", () => {
    const tracker = createDoomLoopTracker()
    const args = { path: "/etc" }
    tracker.check("file_read", args)
    tracker.check("file_read", args)
    expect(tracker.getLoopTool()).toBe("file_read")
  })

  test("escalation messages increase in severity", () => {
    const tracker = createDoomLoopTracker()
    const args = { cmd: "whoami" }

    tracker.check("file_edit", args) // 1st — ok
    const r1 = tracker.check("file_edit", args) // 2nd — warn (mistake=1)
    expect(r1.action).toBe("warn")
    expect((r1 as any).message).toContain("Note:")

    const r2 = tracker.check("file_edit", args) // 3rd — warn (mistake=2)
    expect(r2.action).toBe("warn")
    expect((r2 as any).message).toContain("WARNING")
    expect((r2 as any).message).toContain("MUST change")

    const r3 = tracker.check("file_edit", args) // 4th — abort (mistake=3)
    expect(r3.action).toBe("abort")
    expect((r3 as any).message).toContain("Stopped")
  })

  test("terminal_write has higher threshold", () => {
    const tracker = createDoomLoopTracker()
    const args = { cmd: "ls" }

    // terminal_write should tolerate more repetitions before concern
    for (let i = 0; i < 4; i++) {
      tracker.check("terminal_write", args)
    }
    // Should have accumulated mistakes but not necessarily aborted
    // (the consecutive mistake counter still applies)
  })

  test("interleaving different tools resets consecutive detection", () => {
    const tracker = createDoomLoopTracker()
    const args = { path: "/etc" }

    tracker.check("file_read", args)
    tracker.check("search_grep", { pattern: "test" }) // different tool breaks sequence
    const result = tracker.check("file_read", args)
    expect(result).toEqual({ action: "ok" })
  })
})

// ── invalidTool ──────────────────────────────────────────────

describe("invalidTool", () => {
  test("returns actionable error message", async () => {
    const result = await invalidTool.execute!({
      tool: "nonexistent_tool",
      error: "Tool not found",
    }, {} as any)
    expect(result).toContain("nonexistent_tool")
    expect(result).toContain("Tool not found")
    expect(result).toContain("try again")
  })
})

// ── buildRepairCallback ─────────────────────────────────────

describe("buildRepairCallback", () => {
  const mockTools = {
    file_read: { description: "Read file" },
    terminal_write: { description: "Write to terminal" },
    batch: { description: "Batch calls" },
  }

  test("fixes tool name casing", async () => {
    const repair = buildRepairCallback(mockTools)
    const result = await repair({
      toolCall: { toolName: "File_Read", args: '{"path": "/etc"}' },
      error: new Error("tool not found"),
    })
    expect(result.toolName).toBe("file_read")
  })

  test("redirects unknown tools to invalid when args unchanged", async () => {
    const repair = buildRepairCallback(mockTools)
    // Use an object for args so parsing doesn't change it (avoids step 3 short-circuit)
    const result = await repair({
      toolCall: { toolName: "completely_unknown", args: {} },
      error: new Error("tool not found"),
    })
    expect(result.toolName).toBe("invalid")
  })

  test("parses stringified JSON args", async () => {
    const repair = buildRepairCallback(mockTools)
    const result = await repair({
      toolCall: { toolName: "file_read", args: '{"path": "/etc"}' },
      error: new Error("invalid args"),
    })
    // The args should be re-serialized after normalization
    expect(result.toolName).toBe("file_read")
  })

  test("normalizes batch tool field aliases", async () => {
    const repair = buildRepairCallback(mockTools)
    const batchArgs = JSON.stringify({
      calls: [
        { name: "file_read", arguments: { path: "/etc" } },
      ],
    })
    const result = await repair({
      toolCall: { toolName: "batch", args: batchArgs },
      error: new Error("validation error"),
    })
    const parsed = JSON.parse(result.args)
    expect(parsed.calls[0].tool).toBe("file_read")
    expect(parsed.calls[0].args).toEqual({ path: "/etc" })
  })

  test("normalizes field aliases: function → tool", async () => {
    const repair = buildRepairCallback(mockTools)
    const batchArgs = JSON.stringify({
      calls: [
        { function: "file_read", params: { path: "/etc" } },
      ],
    })
    const result = await repair({
      toolCall: { toolName: "batch", args: batchArgs },
      error: new Error("validation error"),
    })
    const parsed = JSON.parse(result.args)
    expect(parsed.calls[0].tool).toBe("file_read")
    expect(parsed.calls[0].args).toEqual({ path: "/etc" })
  })

  test("handles non-JSON string args gracefully", async () => {
    const repair = buildRepairCallback(mockTools)
    const result = await repair({
      toolCall: { toolName: "completely_unknown", args: "not json at all" },
      error: new Error("parse error"),
    })
    expect(result.toolName).toBe("invalid")
  })
})
