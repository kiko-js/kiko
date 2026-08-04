/**
 * Benchmark: kiko createStore vs immer produce
 *
 * Compares read performance, write performance, and create cost
 * for nested object structures.
 *
 * Usage: bun run benchmark/store-vs-immer.bench.ts
 */

import { produce, setAutoFreeze } from "immer"
import { createStore } from "../packages/signal/src/store"

setAutoFreeze(false)

// ═══════════════════════════════════════════════════════════════════════
// Test data
// ═══════════════════════════════════════════════════════════════════════

const smallData = {
  a: 1,
  b: { b1: 1, b2: 2, b3: { b31: 1 } },
  c: [1, 2, 3],
  d: { d1: 1000 },
}

function makeDeep(levels: number): Record<string, unknown> {
  if (levels === 0) return { v: 1 }
  return { child: makeDeep(levels - 1), value: levels }
}

// Single-child chain: 6 levels = 7 nodes
const deepData = makeDeep(6) as Record<string, unknown>

// Binary tree: 2^5 - 1 = 31 nodes
function makeTree(levels: number): Record<string, unknown> {
  if (levels === 0) return { v: 1 }
  return { left: makeTree(levels - 1), right: makeTree(levels - 1), val: levels }
}
const treeData = makeTree(5) as Record<string, unknown>

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

function bench(label: string, fn: () => void, iterations = 10_000): void {
  for (let i = 0; i < 50; i++) fn()
  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  const elapsed = performance.now() - start
  const opsPerSec = Math.round(iterations / (elapsed / 1000))
  const avgUs = ((elapsed / iterations) * 1000).toFixed(2)
  console.log(`  ${label.padEnd(52)} ${String(opsPerSec).padStart(9)} ops/s  (${avgUs} μs/op)`)
}

function hdr(title: string): void {
  console.log(`\n${"=".repeat(68)}`)
  console.log(`  ${title}`)
  console.log("=".repeat(68))
}

// ═══════════════════════════════════════════════════════════════════════
// Read benchmarks
// ═══════════════════════════════════════════════════════════════════════

hdr("Small object — read (10k iterations)")

bench("kiko  leaf read (store.a.get())", () => {
  const s = createStore(smallData)
  for (let i = 0; i < 100; i++) s.a.get()
})

bench("immer leaf read (draft.a)", () => {
  produce(smallData, draft => {
    for (let i = 0; i < 100; i++) void draft.a
  })
})

bench("kiko  deep read (store.b.b3.b31.get())", () => {
  const s = createStore(smallData)
  for (let i = 0; i < 100; i++) s.b.b3.b31.get()
})

bench("immer deep read (draft.b.b3.b31)", () => {
  produce(smallData, draft => {
    for (let i = 0; i < 100; i++) void draft.b.b3.b31
  })
})

bench("kiko  full object read (store.get())", () => {
  const s = createStore(smallData)
  void s.get()
})

bench("immer full object read (produce + identity)", () => {
  produce(smallData, d => {
    void d
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Write benchmarks
// ═══════════════════════════════════════════════════════════════════════

hdr("Small object — write (10k iterations)")

bench("kiko  leaf set (store.a.set(i))", () => {
  const s = createStore(smallData)
  for (let i = 0; i < 100; i++) s.a.set(i)
})

bench("immer leaf set (draft.a = i)", () => {
  for (let i = 0; i < 100; i++) {
    produce(smallData, draft => {
      draft.a = i
    })
  }
})

bench("kiko  deep set (store.b.b3.b31.set(i))", () => {
  const s = createStore(smallData)
  for (let i = 0; i < 100; i++) s.b.b3.b31.set(i)
})

bench("immer deep set (draft.b.b3.b31 = i)", () => {
  for (let i = 0; i < 100; i++) {
    produce(smallData, draft => {
      draft.b.b3.b31 = i
    })
  }
})

bench("kiko  nested replace (store.b.set({...}))", () => {
  const s = createStore(smallData)
  for (let i = 0; i < 100; i++) {
    s.b.set({ b1: i, b2: i + 1, b3: { b31: i + 2 } })
  }
})

bench("immer nested replace (draft.b = {...})", () => {
  for (let i = 0; i < 100; i++) {
    produce(smallData, draft => {
      draft.b = { b1: i, b2: i + 1, b3: { b31: i + 2 } }
    })
  }
})

// ═══════════════════════════════════════════════════════════════════════
// Create cost
// ═══════════════════════════════════════════════════════════════════════

hdr("Create cost — small object (10k iterations)")

bench("kiko  createStore", () => {
  createStore(smallData)
})
bench("immer produce (no modify)", () => {
  produce(smallData, () => {})
})

// ═══════════════════════════════════════════════════════════════════════
// Deep object
// ═══════════════════════════════════════════════════════════════════════

hdr("Deep chain (6 levels) — create cost (1k iterations)")

bench("kiko  createStore", () => {
  createStore(deepData)
}, 1000)
bench("immer produce (no modify)", () => {
  produce(deepData, () => {})
}, 1000)

hdr("Deep chain (6 levels) — read (1k iterations)")

bench("kiko  deep leaf read", () => {
  const s = createStore(deepData)
  // @ts-expect-error
  void s.child.child.child.child.child.child.v.get()
}, 1000)

bench("immer deep leaf read", () => {
  produce(deepData, draft => {
    // @ts-expect-error
    void draft.child.child.child.child.child.child.v
  })
}, 1000)

hdr("Deep chain (6 levels) — write (1k iterations)")

bench("kiko  deep leaf set", () => {
  const s = createStore(deepData)
  // @ts-expect-error
  s.child.child.child.child.child.child.v.set(42)
}, 1000)

bench("immer deep leaf set", () => {
  produce(deepData, draft => {
    // @ts-expect-error
    draft.child.child.child.child.child.child.v = 42
  })
}, 1000)

// ═══════════════════════════════════════════════════════════════════════
// Binary tree (structural sharing)
// ═══════════════════════════════════════════════════════════════════════

hdr("Binary tree (6 levels, 31 nodes) — create cost (1k iterations)")

bench("kiko  createStore", () => {
  createStore(treeData)
}, 1000)
bench("immer produce (no modify)", () => {
  produce(treeData, () => {})
}, 1000)

hdr("Binary tree — write (1k iterations)")

bench("kiko  leaf set", () => {
  const s = createStore(treeData)
  // @ts-expect-error
  s.left.left.val.set(99)
}, 1000)

bench("immer leaf set", () => {
  produce(treeData, draft => {
    // @ts-expect-error
    draft.left.left.val = 99
  })
}, 1000)

// ═══════════════════════════════════════════════════════════════════════
// Large array
// ═══════════════════════════════════════════════════════════════════════

hdr("Large array (10000 items) — read (100 iterations)")

const bigArray = { items: Array.from({ length: 10000 }, (_, i) => i) }

bench("kiko  array read index 5000", () => {
  const s = createStore(bigArray)
  void (s.items.get() as number[])[5000]
}, 100)

bench("immer array read index 5000", () => {
  produce(bigArray, draft => {
    void draft.items[5000]
  })
}, 100)

console.log("\nDone.")
