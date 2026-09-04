import { buildPackage } from "../../scripts/build-lib"

await buildPackage({
  entrypoints: ["src/index.ts", "src/server.ts"],
  external: ["@kikojs/signal", "@kikojs/dom", "signal-polyfill", "node:async_hooks"],
})
