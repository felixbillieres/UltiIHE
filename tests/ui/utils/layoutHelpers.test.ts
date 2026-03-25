import { describe, expect, test } from "bun:test"
import {
  removeGroupFromLayout,
  replaceLeaf,
  updateSizesAtPath,
  type LayoutNode,
  type LayoutLeaf,
  type LayoutSplit,
} from "../../../src/ui/utils/layoutHelpers"

// ── Helper factories ─────────────────────────────────────────

function leaf(groupId: string): LayoutLeaf {
  return { type: "leaf", groupId }
}

function split(
  direction: "horizontal" | "vertical",
  children: LayoutNode[],
  sizes?: number[],
): LayoutSplit {
  const s = sizes ?? children.map(() => 100 / children.length)
  return { type: "split", direction, children, sizes: s }
}

// ── removeGroupFromLayout ───────────────────────────────────

describe("removeGroupFromLayout", () => {
  test("returns null for null input", () => {
    expect(removeGroupFromLayout(null, "g1")).toBeNull()
  })

  test("returns null when removing the only leaf", () => {
    expect(removeGroupFromLayout(leaf("g1"), "g1")).toBeNull()
  })

  test("keeps unmatched leaf", () => {
    const node = leaf("g1")
    expect(removeGroupFromLayout(node, "g2")).toEqual(node)
  })

  test("removes a child from a split and returns remaining", () => {
    const node = split("horizontal", [leaf("g1"), leaf("g2")], [50, 50])
    const result = removeGroupFromLayout(node, "g1")
    // When only one child remains, it should be unwrapped
    expect(result).toEqual(leaf("g2"))
  })

  test("removes a child from 3-way split and renormalizes sizes", () => {
    const node = split("horizontal", [leaf("g1"), leaf("g2"), leaf("g3")], [25, 50, 25])
    const result = removeGroupFromLayout(node, "g2")
    expect(result).not.toBeNull()
    expect((result as LayoutSplit).children).toHaveLength(2)
    // Sizes should be renormalized to sum to 100
    const sizes = (result as LayoutSplit).sizes
    expect(Math.round(sizes[0] + sizes[1])).toBe(100)
  })

  test("removes from nested splits", () => {
    const node = split("vertical", [
      split("horizontal", [leaf("g1"), leaf("g2")], [50, 50]),
      leaf("g3"),
    ], [50, 50])
    const result = removeGroupFromLayout(node, "g1")
    // g1 removed from inner split, inner split collapses to just g2
    // outer split now has [g2, g3]
    expect(result).not.toBeNull()
    const outer = result as LayoutSplit
    expect(outer.children).toHaveLength(2)
    expect((outer.children[0] as LayoutLeaf).groupId).toBe("g2")
    expect((outer.children[1] as LayoutLeaf).groupId).toBe("g3")
  })

  test("returns null when removing all leaves from a split", () => {
    const node = split("horizontal", [leaf("g1")], [100])
    expect(removeGroupFromLayout(node, "g1")).toBeNull()
  })
})

// ── replaceLeaf ─────────────────────────────────────────────

describe("replaceLeaf", () => {
  test("replaces matching leaf", () => {
    const result = replaceLeaf(leaf("g1"), "g1", leaf("g2"))
    expect((result as LayoutLeaf).groupId).toBe("g2")
  })

  test("keeps non-matching leaf unchanged", () => {
    const result = replaceLeaf(leaf("g1"), "g2", leaf("g3"))
    expect((result as LayoutLeaf).groupId).toBe("g1")
  })

  test("replaces leaf deep in a split tree", () => {
    const node = split("vertical", [
      split("horizontal", [leaf("g1"), leaf("g2")]),
      leaf("g3"),
    ])
    const replacement = split("horizontal", [leaf("g4"), leaf("g5")])
    const result = replaceLeaf(node, "g2", replacement)

    const inner = (result as LayoutSplit).children[0] as LayoutSplit
    expect(inner.children[1]).toEqual(replacement)
  })

  test("can replace a leaf with a split (used for splitting)", () => {
    const node = leaf("g1")
    const newSplit = split("horizontal", [leaf("g1a"), leaf("g1b")])
    const result = replaceLeaf(node, "g1", newSplit)
    expect(result.type).toBe("split")
    expect((result as LayoutSplit).children).toHaveLength(2)
  })
})

// ── updateSizesAtPath ───────────────────────────────────────

describe("updateSizesAtPath", () => {
  test("updates sizes at root level", () => {
    const node = split("horizontal", [leaf("g1"), leaf("g2")], [50, 50])
    const result = updateSizesAtPath(node, [], [30, 70])
    expect((result as LayoutSplit).sizes).toEqual([30, 70])
  })

  test("updates sizes at nested path", () => {
    const inner = split("horizontal", [leaf("g1"), leaf("g2")], [50, 50])
    const node = split("vertical", [inner, leaf("g3")], [60, 40])
    const result = updateSizesAtPath(node, [0], [30, 70])

    const updatedInner = (result as LayoutSplit).children[0] as LayoutSplit
    expect(updatedInner.sizes).toEqual([30, 70])
    // Outer sizes unchanged
    expect((result as LayoutSplit).sizes).toEqual([60, 40])
  })

  test("returns node unchanged for leaf with path", () => {
    const node = leaf("g1")
    const result = updateSizesAtPath(node, [0], [50, 50])
    expect(result).toEqual(node)
  })

  test("returns node unchanged for empty path on leaf", () => {
    const node = leaf("g1")
    const result = updateSizesAtPath(node, [], [50, 50])
    expect(result).toEqual(node)
  })
})
