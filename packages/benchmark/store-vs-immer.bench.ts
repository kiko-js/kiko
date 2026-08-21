/**
 * Benchmarks for the kiko reactive core.
 *
 * Two focuses:
 *   1. `@kikojs/signal` — the raw signal primitives (`createSignal`, `computed`,
 *      `effect`, `batch`) that everything else is built on, so we can see the
 *      cost of the primitives themselves and how much overhead a richer layer
 *      (the proxy store, reactivity loop) adds on top of them.
 *   2. `@kikojs/signal` store vs `immer` — read/write/create cost for nested
 *      structures (the original comparison).
 *
 * Methodology notes:
 *   - Read/write benches create the store / plain object ONCE outside the timed
 *     region and reuse it, so we measure the accessor cost, not the create cost.
 *     Create cost is measured separately in its own section.
 *   - Reactive (effect) benches are async because `effect` re-runs are
 *     microtask-batched; each timed iteration sets a signal and awaits the
 *     flush that actually re-runs the effect.
 *   - NaN / negative results print as `n/a` so a broken setup is obvious
 *     instead of silently misreported.
 *
 * Usage: bun run bench (in packages/benchmark)
 */

import { produce, setAutoFreeze } from "immer"
import { createSignal, computed, effect, batch, createStore } from "@kikojs/signal"

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

// Binary tree: 2^6 - 1 = 63 nodes (two extra levels over the old 31-node tree)
function makeTree(levels: number): Record<string, unknown> {
  if (levels === 0) return { v: 1 }
  return { left: makeTree(levels - 1), right: makeTree(levels - 1), val: levels }
}
const treeData = makeTree(6) as Record<string, unknown>

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════

/**
 * Run a synchronous micro-benchmark. `fn` is timed for `iterations` calls; a
 * short warm-up executes first so JIT/alloc warm state is representative.
 */
function bench(label: string, fn: () => void, iterations = 10_000): number {
  for (let i = 0; i < 50; i++) fn()
  const start = performance.now()
  for (let i = 0; i < iterations; i++) fn()
  const elapsed = performance.now() - start
  const opsPerSec = iterations / (elapsed / 1000)
  const avgUs = (elapsed / iterations) * 1000
  console.log(
    `  ${label.padEnd(56)} ${formatNum(opsPerSec).padStart(12)} ops/s  (${formatUs(avgUs)})`,
  )
  return opsPerSec
}

/**
 * Async micro-benchmark for reactive code paths whose work happens on a
 * microtask (e.g. `effect` re-runs). Each iteration sets a signal and awaits a
 * macrotask so the scheduled effect has definitely flushed.
 */
async function benchAsync(label: string, fn: () => void, iterations = 1_000): Promise<number> {
  const flush = () => new Promise<void>(resolve => setTimeout(resolve, 0))
  for (let i = 0; i < 20; i++) {
    fn()
    await flush()
  }
  const start = performance.now()
  for (let i = 0; i < iterations; i++) {
    fn()
    await flush()
  }
  const elapsed = performance.now() - start
  const opsPerSec = iterations / (elapsed / 1000)
  const avgUs = (elapsed / iterations) * 1000
  console.log(
    `  ${label.padEnd(56)} ${formatNum(opsPerSec).padStart(12)} ops/s  (${formatUs(avgUs)})`,
  )
  return opsPerSec
}

function formatNum(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "n/a"
  return Math.round(n).toLocaleString("en-US")
}

function formatUs(us: number): string {
  if (!Number.isFinite(us) || us < 0) return "n/a"
  return `${us.toFixed(2)} μs/op`
}

function hdr(title: string): void {
  console.log(`\n${"=".repeat(72)}`)
  console.log(`  ${title}`)
  console.log("=".repeat(72))
}

/** ratio: `over / under` with the label describing what's on top. */
function ratio(over: number, under: number, label: string): void {
  if (!over || !under) {
    console.log(`  ${label.padEnd(56)} n/a`)
    return
  }
  console.log(`  ${label.padEnd(56)} ${(over / under).toFixed(2)}×`)
}

// ═══════════════════════════════════════════════════════════════════════
// 1. Signal primitives — raw createSignal vs store
// ═══════════════════════════════════════════════════════════════════════

hdr("Signal primitives — create cost (10k iterations)")

const rawCreate = bench("raw    createSignal(0)", () => createSignal(0))
const storeCreate = bench("store  createStore({a:0})", () => createStore({ a: 0 }))
ratio(rawCreate, storeCreate, "raw : store create (higher = raw faster)")

hdr("Signal primitives — read (10k iterations)")

// Raw: a single State reused; store: a single store reused.
{
  const raw = createSignal(1)
  const st = createStore({ a: 1 })

  const rawRead = bench("raw    signal.get()", () => {
    for (let i = 0; i < 100; i++) raw.get()
  })
  const storeRead = bench("store  store.a.get()", () => {
    for (let i = 0; i < 100; i++) st.a.get()
  })
  const plainRead = bench("plain  obj.a           ", () => {
    for (let i = 0; i < 100; i++) void smallData.a
  })
  ratio(rawRead, storeRead, "raw : store get (higher = raw faster)")
  ratio(rawRead, plainRead, "raw : plain object read overhead")
  ratio(storeRead, plainRead, "store : plain object read overhead")
}

hdr("Signal primitives — write (10k iterations)")

{
  const raw = createSignal(0)
  const st = createStore({ a: 0 })

  const rawWrite = bench("raw    signal.set(i)", () => {
    for (let i = 0; i < 100; i++) raw.set(i)
  })
  const storeWrite = bench("store  store.a.set(i)", () => {
    for (let i = 0; i < 100; i++) st.a.set(i)
  })
  ratio(rawWrite, storeWrite, "raw : store set (higher = raw faster)")
}

// ═══════════════════════════════════════════════════════════════════════
// 2. Computed / derived
// ═══════════════════════════════════════════════════════════════════════

hdr("Computed — evaluate + re-evaluate (10k iterations)")

{
  const a = createSignal(1)
  const b = createSignal(2)
  const sum = computed(() => a.get() + b.get())
  // First evaluation is cold (establishes the graph).
  void sum.get()

  const evalCost = bench("read computed result (cached)", () => {
    for (let i = 0; i < 100; i++) sum.get()
  })
  const recompute = bench("recompute after dep write", () => {
    for (let i = 0; i < 100; i++) {
      a.set(i)
      sum.get()
    }
  })
  ratio(evalCost, recompute, "cached read : recompute cost")
}

// ═══════════════════════════════════════════════════════════════════════
// 3. Reactivity — effect re-run / batch
// (effects flush on a microtask, so these are async)
// ═══════════════════════════════════════════════════════════════════════

hdr("Reactivity — effect re-run (1k iterations, awaited flush)")

{
  const raw = createSignal(0)
  let sink = 0
  effect(() => {
    sink = raw.get()
  })

  await benchAsync("raw    effect re-run after set", () => {
    raw.set(sink + 1)
  })
}

hdr("Reactivity — sync write coalescing (verification)")

// How many effect runs do N synchronous signal writes actually trigger?
// Because `effect` re-runs flush on a microtask, ALL writes in one synchronous
// block coalesce into a SINGLE flush (dedup), even across very many writes.
// `batch()` therefore does not change the run count for a pure sync block — its
// value is deferring the flush to the batch boundary (e.g. keeping an in-flight
// flush from interleaving with async work). This section verifies that
// invariant rather than racing two equivalent workloads. Lower = better.
{
  const a = createSignal(0)
  let runs = 0
  effect(() => {
    void a.get()
    runs++
  })

  // 1000×100 = 100k sync writes, no await between them → expect a single run
  // after the microtask flush (0 during the writes themselves).
  runs = 0
  for (let iter = 0; iter < 1000; iter++) {
    for (let i = 0; i < 100; i++) a.set(a.get() + 1)
  }
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  const syncRuns = runs

  // Same but wrapped in batch().
  runs = 0
  for (let iter = 0; iter < 1000; iter++) {
    batch(() => {
      for (let i = 0; i < 100; i++) a.set(a.get() + 1)
    })
  }
  await new Promise<void>(resolve => setTimeout(resolve, 0))
  const batchRuns = runs

  console.log(`  ${"effect runs for 100k plain sync writes".padEnd(56)} ${syncRuns}`)
  console.log(`  ${"effect runs for 100k batched sync writes".padEnd(56)} ${batchRuns}`)
  console.log(`  ${"expected (dedup to a single run)".padEnd(56)} 1`)
}

// ═══════════════════════════════════════════════════════════════════════
// 4. store vs immer — original comparison
// ═══════════════════════════════════════════════════════════════════════

hdr("Small object — read (10k iterations, store reused)")

{
  const st = createStore(smallData)
  const storeLeaf = bench("kiko  leaf read (store.a.get())", () => {
    for (let i = 0; i < 100; i++) st.a.get()
  })
  const immerLeaf = bench("immer plain read (obj.a)", () => {
    for (let i = 0; i < 100; i++) void smallData.a
  })
  const storeDeep = bench("kiko  deep read (store.b.b3.b31.get())", () => {
    for (let i = 0; i < 100; i++) st.b.b3.b31.get()
  })
  const immerDeep = bench("immer plain deep read (obj.b.b3.b31)", () => {
    for (let i = 0; i < 100; i++) void smallData.b.b3.b31
  })
  const storeFull = bench("kiko  full object read (store.get())", () => {
    for (let i = 0; i < 100; i++) st.get()
  })
  const immerFull = bench("immer full read (produce identity)", () => {
    produce(smallData, d => {
      void d
    })
  })
  ratio(immerLeaf, storeLeaf, "immer : kiko leaf read")
  ratio(immerDeep, storeDeep, "immer : kiko deep read")
  ratio(immerFull, storeFull, "immer : kiko full read")
}

hdr("Small object — write (10k iterations)")

{
  const st = createStore(smallData)
  const storeLeaf = bench("kiko  leaf set (store.a.set(i))", () => {
    for (let i = 0; i < 100; i++) st.a.set(i)
  })
  const immerLeaf = bench("immer leaf set (draft.a = i)", () => {
    for (let i = 0; i < 100; i++) {
      produce(smallData, draft => {
        draft.a = i
      })
    }
  })
  const storeDeep = bench("kiko  deep set (store.b.b3.b31.set(i))", () => {
    for (let i = 0; i < 100; i++) st.b.b3.b31.set(i)
  })
  const immerDeep = bench("immer deep set (draft.b.b3.b31 = i)", () => {
    for (let i = 0; i < 100; i++) {
      produce(smallData, draft => {
        draft.b.b3.b31 = i
      })
    }
  })
  const storeReplace = bench("kiko  nested replace (store.b.set({...}))", () => {
    for (let i = 0; i < 100; i++) {
      st.b.set({ b1: i, b2: i + 1, b3: { b31: i + 2 } })
    }
  })
  const immerReplace = bench("immer nested replace (draft.b = {...})", () => {
    for (let i = 0; i < 100; i++) {
      produce(smallData, draft => {
        draft.b = { b1: i, b2: i + 1, b3: { b31: i + 2 } }
      })
    }
  })
  ratio(immerLeaf, storeLeaf, "immer : kiko leaf set")
  ratio(immerDeep, storeDeep, "immer : kiko deep set")
  ratio(immerReplace, storeReplace, "immer : kiko nested replace")
}

hdr("Create cost (10k iterations)")

const kSmall = bench("kiko  createStore", () => createStore(smallData))
const iSmall = bench("immer produce (no modify)", () => produce(smallData, () => {}))
ratio(kSmall, iSmall, "kiko : immer create")

// ═══════════════════════════════════════════════════════════════════════
// 5. Deep structure
// ═══════════════════════════════════════════════════════════════════════

hdr("Deep chain (6 levels)")

const kDeep = bench("kiko  createStore", () => createStore(deepData), 1000)
const iDeep = bench("immer produce (no modify)", () => produce(deepData, () => {}), 1000)
ratio(kDeep, iDeep, "kiko : immer deep create")

{
  const st = createStore(deepData)
  const kDeepRead = bench("kiko  deep leaf read", () => {
    for (let i = 0; i < 100; i++) {
      ;(st as any).child.child.child.child.child.child.v.get()
    }
  }, 1000)
  const iDeepRead = bench("immer plain deep read (obj path)", () => {
    for (let i = 0; i < 100; i++) {
      void (deepData as any).child.child.child.child.child.child.v
    }
  }, 1000)
  ratio(iDeepRead, kDeepRead, "immer : kiko deep read")

  const kDeepWrite = bench("kiko  deep leaf set", () => {
    for (let i = 0; i < 100; i++) {
      ;(st as any).child.child.child.child.child.child.v.set(42)
    }
  }, 1000)
  const iDeepWrite = bench("immer deep leaf set", () => {
    for (let i = 0; i < 100; i++) {
      produce(deepData, draft => {
        ;(draft as any).child.child.child.child.child.child.v = 42
      })
    }
  }, 1000)
  ratio(iDeepWrite, kDeepWrite, "immer : kiko deep set")
}

// ═══════════════════════════════════════════════════════════════════════
// 6. Binary tree (structural sharing) — 63 nodes
// ═══════════════════════════════════════════════════════════════════════

hdr("Binary tree (6 levels, 63 nodes)")

const kTree = bench("kiko  createStore", () => createStore(treeData), 1000)
const iTree = bench("immer produce (no modify)", () => produce(treeData, () => {}), 1000)
ratio(kTree, iTree, "kiko : immer tree create")

{
  const st = createStore(treeData)
  const kTreeWrite = bench("kiko  leaf set (tree.left.left.val)", () => {
    for (let i = 0; i < 100; i++) {
      ;(st as any).left.left.val.set(99)
    }
  }, 1000)
  const iTreeWrite = bench("immer leaf set (draft.left.left.val)", () => {
    for (let i = 0; i < 100; i++) {
      produce(treeData, draft => {
        ;(draft as any).left.left.val = 99
      })
    }
  }, 1000)
  ratio(iTreeWrite, kTreeWrite, "immer : kiko tree set")
}

// ═══════════════════════════════════════════════════════════════════════
// 7. Arrays — read AND write (was read-only before)
// ═══════════════════════════════════════════════════════════════════════

hdr("Array (10000 items) — read + write (1k iterations)")

const bigArray = { items: Array.from({ length: 10000 }, (_, i) => i) }

{
  const st = createStore(bigArray)
  const kArrayRead = bench("kiko  array read index 5000", () => {
    for (let i = 0; i < 100; i++) {
      void (st.items.get() as number[])[5000]
    }
  }, 1000)
  const iArrayRead = bench("immer plain array read index 5000", () => {
    for (let i = 0; i < 100; i++) void bigArray.items[5000]
  }, 1000)
  ratio(iArrayRead, kArrayRead, "immer : kiko array read")

  // One whole-array replace (copying the 10k array once) per outer iteration.
  // The full-array copy dominates, so store's wrapper overhead is the variable.
  const kArraySet = bench("kiko  array replace (store.items.set(copy))", () => {
    ;(st as any).items.set([...bigArray.items])
  }, 200)
  const iArraySet = bench("immer array item set (produce)", () => {
    produce(bigArray, draft => {
      draft.items[5000] = 1
    })
  }, 200)
  ratio(iArraySet, kArraySet, "immer : kiko array replace")
}

console.log("\nDone.")
