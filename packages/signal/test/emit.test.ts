import { describe, it, expect } from "bun:test"
import { createEmitter } from "../src/emit"

describe("createEmitter", () => {
  it("emits events to listeners", () => {
    const emitter = createEmitter<{ ping: string }>()
    const heard: string[] = []
    emitter.on("ping", msg => {
      heard.push(msg)
    })
    emitter.emit("ping", "hello")
    expect(heard).toEqual(["hello"])
  })

  it("supports multiple listeners", () => {
    const emitter = createEmitter<{ count: number }>()
    let a = 0
    let b = 0
    emitter.on("count", n => {
      a += n
    })
    emitter.on("count", n => {
      b += n
    })
    emitter.emit("count", 2)
    expect(a).toBe(2)
    expect(b).toBe(2)
  })

  it("off removes a listener", () => {
    const emitter = createEmitter<{ x: number }>()
    const heard: number[] = []
    const dispose = emitter.on("x", n => {
      heard.push(n)
    })
    emitter.emit("x", 1)
    dispose()
    emitter.emit("x", 2)
    expect(heard).toEqual([1])
  })

  it("once removes itself after first emit", () => {
    const emitter = createEmitter<{ y: number }>()
    let calls = 0
    emitter.once("y", () => {
      calls++
    })
    emitter.emit("y", 1)
    emitter.emit("y", 2)
    expect(calls).toBe(1)
  })

  it("emits only to matching event listeners", () => {
    const emitter = createEmitter<{ a: string; b: number }>()
    let aHeard = false
    emitter.on("a", () => {
      aHeard = true
    })
    emitter.emit("b", 1)
    expect(aHeard).toBe(false)
  })

  it("clear removes all listeners for an event", () => {
    const emitter = createEmitter<{ z: number }>()
    let calls = 0
    emitter.on("z", () => {
      calls++
    })
    emitter.clear("z")
    emitter.emit("z", 1)
    expect(calls).toBe(0)
  })

  it("off during emit does not skip later listeners", () => {
    const emitter = createEmitter<{ e: number }>()
    const seen: number[] = []
    const disposeSelf = emitter.on("e", n => {
      seen.push(n)
      disposeSelf()
    })
    emitter.on("e", n => {
      seen.push(n * 10)
    })
    emitter.emit("e", 1)
    // Both listeners fire — the second is not skipped despite the first
    // removing itself mid-emit.
    expect(seen).toEqual([1, 10])
    emitter.emit("e", 2)
    expect(seen).toEqual([1, 10, 20])
  })
})
