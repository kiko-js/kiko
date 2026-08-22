import { buildPackage } from "../../scripts/build-lib"

await buildPackage({
  entrypoints: ["src/index.ts", "src/server.ts", "src/jsx-runtime.ts", "src/react-portal.ts"],
  external: ["react", "react-dom", "signal-polyfill"],
  // Code-split so `@kikojs/dom` and `@kikojs/dom/jsx-runtime` share ONE core
  // chunk (single runtime instance — no duplicated delegation/watcher state).
  splitting: true,
})
