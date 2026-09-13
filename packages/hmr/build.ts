import { buildPackage } from "../../scripts/build-lib"

await buildPackage({
  entrypoints: [
    // 通用 / 浏览器安全
    "src/index.ts",
    "src/client.ts",
    "src/server.ts",
    // 通用但依赖 node / bundler 的构建期能力（单独入口，避免污染根图）
    "src/transform.ts",
    "src/watcher.ts",
    // 接入方式
    "src/bun/index.ts",
    "src/node/index.ts",
  ],
  external: ["oxc-parser", "signal-polyfill", "bun", "node:path", "node:fs", "node:http"],
})
