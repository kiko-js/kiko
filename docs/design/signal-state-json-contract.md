# 设计记录：SSR 信号状态的 JSON 契约与类型化扩展（依赖注入 codec）

- **日期**: 2026-09-05
- **状态**: 已决策（按用户 2026-09-05 指令落地）
- **决策**: 默认只做纯 JSON 往返（非调试、无 codec 时零校验零报错）；无损校验与报错
  仅在调试模式（`setSignalStateDebug(true)`）下进行；类型化数据由用户注入对称 codec
  （服务端 `encode` / 客户端 `decode`）。

## 背景与问题

SSR 信号状态走 `JSON.stringify` / `JSON.parse` 过桥。JSON 表达不了 JS 类型：Date→string、
Map/Set→{}、类实例→纯对象（原型/方法丢失）、undefined/NaN/±Infinity→null、纯对象/数组里
的键会被丢弃。此前用「手写有损类型名单 + 恢复端 typeof/shape 指纹」做启发式修补——覆盖不全
（同型基础类型错序不可判、纯对象 key 漂移不可判），越补越厚仍修不干净。

结论：**别试图跨 JSON 桥保任意 JS 类型**。把契约收窄到 JSON 语义等价，类型保真交给用户工具。

## 决策要点

1. **默认 = 纯 JSON 往返**（非调试，无 codec）：`serializeSignals` / `restoreSignals`
   只经 `JSON.stringify` / `JSON.parse`（或 codec encode/decode），**零逐值校验、零
   报错**。只承诺 JSON 语义等价数据（有限数 / string / boolean / null / 纯对象 /
   数组）；其余类型由 JSON 静默降级。循环 / bigint 由原生 `JSON.stringify` throw。
2. **校验与报错只在调试模式**（`setSignalStateDebug(true)`，两端各自开启，默认关）：
   - 服务端跑**无损 gate**（`isLosslessJson`，递归，非手写名单）：无法完美转换的值
     `console.error` 记录 + 在 envelope 新增可选 `l: number[]` 标记位置（值仍嵌入，
     降级形式照发）；函数 / symbol / 循环引用在 gate 下 throw（fail-fast）。
   - 客户端恢复到 `l` 标记位置时直接 throw（fail-fast 便于定位）。非调试客户端忽略
     服务端的 `l`。
3. **类型化扩展 = 依赖注入 codec**：`setSignalStateCodec({ encode, decode })`（模块级，两端
   各注册所需一半；`null` 清除）。与调试正交——配置即应用。
   - `encode`（服务端）：`serializeSignals` 对每个快照先经它转成可往返 tag（如
     `Date → { $date: iso }`），调试模式下通过 gate 即不再标记降级。
   - `decode`（客户端）：`restoreSignals` 对每个解析值还原为类型化形式作 `createSignal` 初始值。
   - 对称性：encode/decode 必须同一份实现、逐位置应用、未处理值原样返回——对称由用户负责。
   - envelope 格式不因 codec 改变（仍是 `{v,s,l?}`），v 保持 1，无破坏性变更。
4. **结构与树漂移指纹保留**：`typeof` + 对象类别（array/plain/Map/Set/Date/class）比对仍用于
   防「树漂移错序」（与值类型问题正交，非调试也生效）。

## 保留的既有指纹（防树漂移，非类型）

- `stopSignalRestore()` 数量错位报错（服务端多于客户端时附 async/Suspend 窗口提示）。
- `noteRestoreType`：基础类型 typeof + 对象 restoreShape（不比对 key，避免误报默认值少字段）。
  同型基础类型错序仍是位置契约固有盲区（记录在案）。

## 关联

- `docs/design/signal-restore-async.md`：恢复的同步窗口 vs `<Suspend>` async 子树（独立、开放）。
- AGENTS.md / `packages/dom/README.md`「行为语义与前提」：契约已写入用户文档。

## 流程约束

类型化 codec 若未来发现需要「每请求不同 codec / tag 命名空间冲突规避」等真实需求，需重开讨论
（可能触及 envelope v2），不得绕过本记录直接改。
