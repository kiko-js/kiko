import { buildPackage } from "../../scripts/build-lib"

await buildPackage({
  entrypoints: ["src/index.ts"],
  external: ["@kikojs/signal", "@kikojs/dom", "signal-polyfill"],
})
