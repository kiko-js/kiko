import { buildPackage } from "../../scripts/build-lib"

await buildPackage({
  entrypoints: ["src/index.ts", "src/bun/index.ts"],
  external: ["oxc-parser", "signal-polyfill", "bun", "node:path"],
})
