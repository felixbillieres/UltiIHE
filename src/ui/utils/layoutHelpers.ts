/**
 * Pure layout tree helpers for terminal split management.
 * Extracted from terminal store for testability and reuse.
 */

export interface LayoutLeaf {
  type: "leaf"
  groupId: string
}

export interface LayoutSplit {
  type: "split"
  direction: "horizontal" | "vertical"
  children: LayoutNode[]
  sizes: number[]
}

export type LayoutNode = LayoutLeaf | LayoutSplit

let groupCounter = 0

export function newGroupId(): string {
  return `group-${++groupCounter}`
}

export function removeGroupFromLayout(
  node: LayoutNode | null,
  groupId: string,
): LayoutNode | null {
  if (!node) return null
  if (node.type === "leaf") {
    return node.groupId === groupId ? null : node
  }

  const newChildren: LayoutNode[] = []
  const newSizes: number[] = []

  for (let i = 0; i < node.children.length; i++) {
    const result = removeGroupFromLayout(node.children[i], groupId)
    if (result) {
      newChildren.push(result)
      newSizes.push(node.sizes[i])
    }
  }

  if (newChildren.length === 0) return null
  if (newChildren.length === 1) return newChildren[0]

  const total = newSizes.reduce((a, b) => a + b, 0)
  const normalizedSizes = newSizes.map((s) => (s / total) * 100)

  return { ...node, children: newChildren, sizes: normalizedSizes }
}

export function replaceLeaf(
  node: LayoutNode,
  groupId: string,
  replacement: LayoutNode,
): LayoutNode {
  if (node.type === "leaf") {
    return node.groupId === groupId ? replacement : node
  }
  return {
    ...node,
    children: node.children.map((c) => replaceLeaf(c, groupId, replacement)),
  }
}

export function updateSizesAtPath(
  node: LayoutNode,
  path: number[],
  sizes: number[],
): LayoutNode {
  if (path.length === 0 && node.type === "split") {
    return { ...node, sizes }
  }
  if (node.type === "split" && path.length > 0) {
    const [head, ...rest] = path
    return {
      ...node,
      children: node.children.map((c, i) =>
        i === head ? updateSizesAtPath(c, rest, sizes) : c,
      ),
    }
  }
  return node
}
