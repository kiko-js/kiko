import { buildPackage } from "../../scripts/build-lib"

await buildPackage({
  entrypoints: ["src/index.ts"],
  external: ["oxc-parser", "bun", "node:path"],
})
