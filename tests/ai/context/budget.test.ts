import { describe, expect, test } from "bun:test"
import {
  calculateBudget,
  shouldPrune,
  shouldCompact,
  type ContextBudget,
} from "../../../src/ai/context/budget"

describe("calculateBudget", () => {
  // ── Tier classification ────────────────────────────────────

  describe("prompt tiers", () => {
    test("minimal tier for <= 8K context", () => {
      expect(calculateBudget(4096).promptTier).toBe("minimal")
      expect(calculateBudget(8192).promptTier).toBe("minimal")
    })

    test("medium tier for 8K-32K context", () => {
      expect(calculateBudget(16384).promptTier).toBe("medium")
      expect(calculateBudget(32768).promptTier).toBe("medium")
    })

    test("full tier for > 32K context", () => {
      expect(calculateBudget(65536).promptTier).toBe("full")
      expect(calculateBudget(128000).promptTier).toBe("full")
      expect(calculateBudget(200000).promptTier).toBe("full")
    })
  })

  // ── Max tools per tier ─────────────────────────────────────

  describe("maxTools", () => {
    test("minimal tier limits to 5 tools", () => {
      expect(calculateBudget(4096).maxTools).toBe(5)
    })

    test("medium tier limits to 12 tools", () => {
      expect(calculateBudget(16384).maxTools).toBe(12)
    })

    test("full tier allows 99 tools", () => {
      expect(calculateBudget(128000).maxTools).toBe(99)
    })
  })

  // ── Output reserve ─────────────────────────────────────────

  describe("output reserve", () => {
    test("small models reserve less for output", () => {
      const budget = calculateBudget(4096)
      expect(budget.outputReserve).toBeLessThanOrEqual(2048)
      expect(budget.outputReserve).toBe(Math.min(2048, Math.floor(4096 * 0.2)))
    })

    test("medium models cap at 4096", () => {
      const budget = calculateBudget(16384)
      expect(budget.outputReserve).toBeLessThanOrEqual(4096)
    })

    test("large models cap at 16384", () => {
      const budget = calculateBudget(200000)
      expect(budget.outputReserve).toBeLessThanOrEqual(16384)
    })

    test("respects explicit maxOutput", () => {
      const budget = calculateBudget(128000, 8192)
      // Should use min(maxOutput, 25% of context)
      expect(budget.outputReserve).toBe(Math.min(8192, Math.floor(128000 * 0.25)))
    })

    test("caps maxOutput at 25% of context window", () => {
      // maxOutput larger than 25% of context should be capped
      const budget = calculateBudget(10000, 5000)
      expect(budget.outputReserve).toBe(2500) // 25% of 10000
    })
  })

  // ── Input budget ───────────────────────────────────────────

  describe("input budget", () => {
    test("is contextWindow minus outputReserve", () => {
      const budget = calculateBudget(128000)
      expect(budget.inputBudget).toBe(budget.contextWindow - budget.outputReserve)
    })

    test("is positive for any reasonable context window", () => {
      for (const size of [2048, 4096, 8192, 32768, 128000, 200000]) {
        expect(calculateBudget(size).inputBudget).toBeGreaterThan(0)
      }
    })
  })

  // ── Thresholds ─────────────────────────────────────────────

  describe("thresholds", () => {
    test("prune threshold is 70%", () => {
      expect(calculateBudget(128000).pruneThreshold).toBe(0.70)
    })

    test("compact threshold is 85%", () => {
      expect(calculateBudget(128000).compactThreshold).toBe(0.85)
    })

    test("prune triggers before compact", () => {
      const budget = calculateBudget(128000)
      expect(budget.pruneThreshold).toBeLessThan(budget.compactThreshold)
    })
  })
})

// ── shouldPrune / shouldCompact ─────────────────────────────

describe("shouldPrune", () => {
  const budget = calculateBudget(100000)

  test("returns false below threshold", () => {
    expect(shouldPrune(1000, budget)).toBe(false)
    expect(shouldPrune(budget.inputBudget * 0.5, budget)).toBe(false)
  })

  test("returns true at threshold", () => {
    const atThreshold = Math.ceil(budget.inputBudget * budget.pruneThreshold)
    expect(shouldPrune(atThreshold, budget)).toBe(true)
  })

  test("returns true above threshold", () => {
    expect(shouldPrune(budget.inputBudget, budget)).toBe(true)
  })
})

describe("shouldCompact", () => {
  const budget = calculateBudget(100000)

  test("returns false below threshold", () => {
    expect(shouldCompact(1000, budget)).toBe(false)
    expect(shouldCompact(budget.inputBudget * 0.7, budget)).toBe(false)
  })

  test("returns true at threshold", () => {
    const atThreshold = Math.ceil(budget.inputBudget * budget.compactThreshold)
    expect(shouldCompact(atThreshold, budget)).toBe(true)
  })

  test("returns true above threshold", () => {
    expect(shouldCompact(budget.inputBudget, budget)).toBe(true)
  })
})
