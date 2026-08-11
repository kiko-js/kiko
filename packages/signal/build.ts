import { buildPackage } from "../../scripts/build-lib"

await buildPackage({
  entrypoints: ["src/index.ts"],
  external: ["signal-polyfill"],
})
