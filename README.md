# 🎯 阿duo的秋招旅程

> **纯浏览器端 AI Agent 系统** — PWA + 手写 ReAct Loop + 多 Agent 编排，零后端、零框架依赖。

[![PWA](https://img.shields.io/badge/PWA-ready-blue)](https://aduo-ad.github.io/Work)
[![Lines](https://img.shields.io/badge/total-4,147_lines-333)](https://github.com/aduo-ad/Work)
[![Zero Deps](https://img.shields.io/badge/dependencies-zero-orange)](https://github.com/aduo-ad/Work)
[![ES Module](https://img.shields.io/badge/modules-ES%20Module-green)](https://github.com/aduo-ad/Work)

---

## 📋 目录

- [项目概述](#项目概述)
- [核心功能](#核心功能)
- [架构设计](#架构设计)
- [技术亮点](#技术亮点)
- [技术难点](#技术难点)
- [使用方式](#使用方式)
- [项目结构](#项目结构)
- [面试指南](#面试指南)

---

## 项目概述

一个面向秋招求职场景的 PWA 应用，包含三个核心模块：

| Tab | 功能 | 说明 |
|---|---|---|
| 📋 **投递管理** | 看板拖拽 | 待投递→已投递→面试中→已Offer→已拒绝，支持搜索/筛选/导出 |
| ⚖️ **Offer 对比** | 多维度对比 | 薪资结构、base×月数、签字费、股票，可视化对比 |
| 🔬 **研究院** | AI Agent 研究 | **核心亮点** — Agent 自主搜索多平台、交叉验证、批判反思 |

其中「研究院」是本项目的技术核心——从 v1 的「调一次 API 返回文本」升级为 v2 的 **Agent Loop 自主规划多步执行**，完整实现了 ReAct 模式。

---

## 核心功能

### Agent 研究院 — 四种工作模式

```
┌─────────────────────────────────────────────────────────┐
│ 🔬 深度研究    ⚖️ 对比分析    🎯 面试准备    🔄 全流程  │
└─────────────────────────────────────────────────────────┘
```

| 模式 | 流程 | 适用场景 |
|---|---|---|
| 🔬 **深度研究** | 单 Agent 多源搜索 → 结构化报告 | 快速了解一家公司 |
| ⚖️ **对比分析** | 研究 Agent → 对比 Agent 流水线 | 多个 Offer 横向对比 |
| 🎯 **面试准备** | 查本地知识库 + 实时搜索 → 面试策略 | 针对特定公司备战 |
| 🔄 **全流程** | 研究 → 批判审查 → 反思修正（Self-Reflection） | 追求最高质量分析 |

### 5 项 Agent 增强

| # | 功能 | 行数 | 效果 |
|---|---|---|---|
| 1 | **流式输出** | ~130 行 | LLM 逐字生成实时展示，不等完整回包 |
| 2 | **Token 追踪** | ~60 行 | 实时显示消耗 + 费用估算（¥） |
| 3 | **中止控制** | ~60 行 | AbortController + 全局标志双重保障 |
| 4 | **Mock 测试** | ~170 行 | 无需 API Key 即可演示完整流程 |
| 5 | **Web Worker** | ~220 行 | Agent 循环迁独立线程，UI 零阻塞 |

---

## 架构设计

### 整体架构

```
┌──────────────────────────────────────────────────────────┐
│                      浏览器（PWA）                        │
│                                                          │
│  ┌─────────────┐  ┌──────────────────────────────────┐  │
│  │   app.js    │  │        agent-app.js (ES Module)   │  │
│  │  传统脚本    │  │                                  │  │
│  │  投递/Offer  │  │  ┌──────────┐  ┌─────────────┐  │  │
│  │  桥接 API   │  │  │  Agent   │  │  Web Worker  │  │  │
│  │             │◄─┤  │  主线程   │  │  独立线程    │  │  │
│  │  window.__* │  │  └──────────┘  └─────────────┘  │  │
│  └─────────────┘  └──────────────────────────────────┘  │
│                                                          │
│  ┌──────────────────────────────────────────────────┐   │
│  │                 Service Worker                     │   │
│  │            网络优先缓存策略 / 离线降级             │   │
│  └──────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 模块分层（8 模块 + 2 新增）

```
js/
├── app.js                主应用（1036行）— 投递 / Offer / 桥接
├── agent-app.js          Agent 入口（549行）— ES Module，集成所有 Agent 功能
├── core/
│   ├── agent.js          ReAct Loop（238行）— Thought→Action→Observation
│   ├── agent-worker.js   Worker 版 Agent（224行）— 独立线程运行
│   ├── memory.js         三层记忆（129行）— Working/Episodic/Summary
│   ├── tools.js          ToolRegistry（164行）— 工具注册/校验/执行
│   ├── orchestrator.js   多 Agent 编排（103行）— Sequential/Parallel/Debate
│   └── mock-llm.js       Mock LLM（230行）— 回放式测试
├── agents/
│   └── index.js          Agent 工厂（84行）— 研究/对比/面试/批判
└── ui/
    └── agent-chat.js     Agent UI（248行）— 流式思考/Token/可视化
```

| 层 | 模块 | 核心职责 |
|---|---|---|
| 🔧 工具层 | `tools.js` | 注册校验 → 参数校验 → 标准化返回 `{result}` 或 `{error}` |
| 🧠 推理层 | `agent.js` | ReAct 循环 + JSON 三层容错 + 错误恢复 + abort |
| 🧵 Worker层 | `agent-worker.js` | Agent 循环迁出主线程，postMessage 通信 |
| 🗄️ 记忆层 | `memory.js` | Working Memory 自动压缩 + Episodic(IndexedDB) + Summary |
| 🎭 编排层 | `orchestrator.js` | Sequential(流水线) / Parallel(Promise.all) / Debate(辩论+裁判) |
| 🧪 测试层 | `mock-llm.js` | 脚本驱动假 LLM + 录制回放，不调真实 API |
| 👁️ UI 层 | `agent-chat.js` | 流式思考卡片 + Token 实时徽标 + 停止按钮 |
| 🔌 桥接层 | `agent-app.js` | ES Module ↔ 传统脚本，Worker 管理，回调路由 |

---

## 技术亮点

### 1. 手写 ReAct Loop（200 行，零框架）

```javascript
// Thought → Action → Observation → Thought → ...
for (let step = 0; step < maxSteps; step++) {
  // Think: 调用 LLM（优先流式）
  const response = await llm.chatStream(messages, { signal }, onChunk);
  // Parse: JSON 三层容错
  const { action, input, reasoning } = parseResponse(response);
  // Act: 执行工具
  const result = await tools.execute(action, input);
  // Observe: 结果反馈给 LLM
  messages.push({ role: 'user', content: formatResult(result) });
}
```

**面试答："为什么不用 LangChain？"**
> LangChain 200KB+，封装太厚调试困难。自研 200 行完全控制每一步的 prompt 构造、错误处理、日志记录。PWA 首屏加载更快，且每行代码都能讲清楚。

### 2. 流式输出 — ReadableStream 解析 SSE

LLM 返回的是 SSE（Server-Sent Events）流，用 `fetch + ReadableStream` 逐块读取：

```
data: {"choices":[{"delta":{"content":"需要"}}]}
data: {"choices":[{"delta":{"content":"搜索"}}]}
data: {"choices":[{"delta":{"content":"牛客"}}]}
data: [DONE]
```

每收到一个 token 立即回调 UI，实现打字机效果。难点在于 SSE 的粘包处理——`buffer` 暂存不完整行，下次拼接。

### 3. 三层记忆架构（认知科学模型）

| 层级 | 实现 | 触发条件 | 面试理论 |
|---|---|---|---|
| Working Memory | 内存数组 | 当前会话，≥20 条自动压缩 | 工作记忆容量有限（Miller 定律） |
| Episodic Memory | IndexedDB | 每次研究自动持久化 | 情景记忆 — 跨会话检索 |
| Summary Memory | 压缩文本 | ≥3 条相关记录自动触发 | 语义压缩 — 减少认知负荷 |

### 4. 工具系统健壮性设计

```
ToolRegistry
├── register()      → 注册时校验 name/description/parameters/execute 四要素
├── execute()       → 参数 schema 校验 → 执行 → 标准化返回
│                     成功: { result: ... }
│                     失败: { error: "原因" }
├── list()          → 给 LLM 看的工具描述（JSON Schema 格式）
└── toOpenAIFunctions() → 兼容 OpenAI function calling 格式
```

Agent 根据 `{result}` 或 `{error}` 决定下一步——这是 ReAct 可观测性的基础。

### 5. 多 Agent 编排

三种模式，均为生产级抽象：

```
Sequential:  Agent A → Agent B → Agent C     (流水线)
Parallel:    Agent A ↘
             Agent B → 合并结果               (Promise.all)
             Agent C ↗
Debate:      正方 ↔ 反方 × N 轮 → 裁判裁决    (对抗式)
```

### 6. Self-Reflection 闭环（DeepMind Self-Refine 实现）

```
研究 Agent 输出 → 批判 Agent 审查 → 发现不足 → 研究 Agent 修正 → 最终报告
```

### 7. Mock 测试 — 非确定性系统的确定性测试

三种激活方式：
- URL `?mock=1`
- 输入 `demo`
- 控制台 `window.__enableMock()`

MockLLM 用预设 JSON 脚本模拟完整 ReAct 流程，支持流式、Token 统计、Abort。面试时不用 API Key，离线跑完整 Demo。

### 8. Web Worker — Agent 线程隔离

Agent 循环迁入 `agent-worker.js`（独立线程），主线程只做 UI 渲染。消息协议：

```
主线程                     Worker
  │── { type: 'run' } ────→│  开始 Agent 循环
  │←── { type: 'stream' } ─│  流式输出
  │←── { type: 'tool' } ───│  工具调用结果
  │←── { type: 'token' } ──│  Token 统计
  │←── { type: 'complete' } │  完成
  │── { type: 'abort' } ──→│  中止
```

跨线程工具代理：Worker 中无法访问 DOM/IndexedDB 的工具，通过 `tool_request` → `tool_result` 消息回主线程执行。

---

## 技术难点

### 难点 1：LLM 输出格式不可靠

LLM 经常不按 JSON 格式输出（多加解释、格式错误）。解决方案 `_parseResponse()` 三层容错：

```javascript
// 1. 直接 JSON.parse
try { return JSON.parse(raw); } catch {}
// 2. 正则提取 {...} 块再 parse
const match = raw.match(/\{[\s\S]*\}/);
if (match) try { return JSON.parse(match[0]); } catch {}
// 3. 兜底：当自然语言直接输出
return { action: 'FINISH', answer: raw };
```

### 难点 2：浏览器 CORS 沙箱限制

浏览器不能发任意 HTTP 请求。工具设计时必须考虑沙箱约束：
- `window.open()` 会跳转——改为纯链接返回
- LLM API 需要 CORS 支持——DeepSeek/Gemini 均已支持
- 部分站点（如牛客）不支持 iframe 嵌入——仅提供链接

### 难点 3：Agent 循环的 Token 消耗控制

ReAct 每步往 messages 追加内容，8 步后上下文可达 4K-8K token。控制策略：
- Working Memory 自动压缩（合并旧消息到摘要）
- `maxSteps=8` 硬上限
- 温度控制（研究 0.5、对比 0.3 减少废话）
- 成本可视化让用户感知消耗

### 难点 4：PWA 离线 vs Agent 实时性的矛盾

Agent 需要网络调 LLM，但 PWA 需要支持离线。解决方案：
- Service Worker 网络优先策略（Agent 拿最新响应）
- 离线降级为本地知识库查询
- Mock 模式提供离线演示能力

### 难点 5：ES Module 与旧代码的桥接

`app.js` 是传统脚本（全局变量），`agent-app.js` 是 ES Module。通过 `window.__xxx` 桥接保持解耦：

```javascript
// app.js → 暴露
window.__getAiProvider = () => aiProvider;
window.__addResearchNote = (company, content) => { ... };

// agent-app.js → 消费
const provider = window.__getAiProvider?.() || 'deepseek';
```

### 难点 6：移动端嵌套滚动陷阱

`.ag-container` 最初设置了 `max-height: 55vh; overflow-y: auto`，在手机上制造了不可见的嵌套滚动区。用户不知道要在盒子内部滑，报告被裁剪在 55vh 外。解决：去掉约束，让页面自然滚动。

### 难点 7：ES Module 静默失败

Python 脚本批量修改代码时，正则替换错误地把分号放到函数体内部（`prepareAgent(fn();)`），导致整个 `agent-app.js` 解析失败。ES Module 的静默失败特性让 bug 长时间未被发现——没有控制台错误，没有 UI 提示，Agent Tab 只是一个空壳。

---

## 使用方式

### PWA 安装

1. 手机浏览器打开 `https://aduo-ad.github.io/Work`
2. Chrome「添加到主屏幕」/ Safari「添加到主屏幕」
3. 像原生 App 使用，离线也能查看已缓存数据

### Agent 研究院

```
正常模式（需 API Key）：
  1. ⚙️ 设置 → 选 AI 引擎 → 填 API Key
  2. 输入公司名 → 选模式 → 点「启动Agent」

Mock 模式（无需 API Key）：
  方式 A: URL 加 ?mock=1
  方式 B: 输入 demo 启动
  方式 C: 控制台 window.__enableMock()
```

### API Key 获取

| 引擎 | 获取地址 | 特点 |
|---|---|---|
| DeepSeek（推荐） | https://platform.deepseek.com/api_keys | 国内直连，免 VPN，¥1/百万token |
| Gemini | https://aistudio.google.com/apikey | 需 VPN，信息更新 |

---

## 项目结构

```
qiuzhao/                       总行数: 4,147
├── index.html                 (254行) PWA 入口 + Agent UI 结构
├── manifest.json                      PWA 配置
├── sw.js                      (46行)  Service Worker 网络优先
├── README.md                          
├── css/
│   ├── style.css              (659行) 主样式（移动端优先）
│   └── agent.css              (183行) Agent 思考链 UI 样式
└── js/
    ├── app.js                 (1036行) 主应用 — 投递/Offer/桥接 API
    ├── agent-app.js           (549行)  Agent 系统入口 — LLM/Worker/回调
    ├── agents/
    │   └── index.js           (84行)   4 个 Agent 工厂函数
    ├── core/
    │   ├── agent.js           (238行)  ReAct Loop 核心
    │   ├── agent-worker.js    (224行)  Web Worker 版 Agent
    │   ├── memory.js          (129行)  三层记忆系统
    │   ├── tools.js           (164行)  ToolRegistry + 4 工具
    │   ├── orchestrator.js    (103行)  多 Agent 编排器
    │   └── mock-llm.js        (230行)  Mock LLM + 录制回放
    └── ui/
        └── agent-chat.js      (248行)  流式思考 + Token + 状态 UI
```

---

## 面试指南

### 30 秒电梯演讲

> "这是一个纯浏览器端 AI Agent 系统，PWA 安装即用。核心是手写 ReAct Loop，200 行实现了完整的 Thought→Action→Observation 循环。在此基础上做了 5 层增强：流式输出、Token 追踪、中止控制、Mock 测试、Web Worker。技术栈零第三方依赖，全部原生 API。"

### 高频问答

**Q: 为什么不用 LangChain？**
> LangChain 封装太厚调试困难。自研可以完全控制每一步的 prompt 构造、错误处理、日志记录。而且 LangChain 200KB+，自研 200 行，PWA 首屏加载更快。

**Q: Agent 循环怎么防止无限循环？**
> maxSteps 硬上限（默认 8 步），达到后强制让 LLM 总结。同时 Working Memory 自动压缩旧消息，防止上下文溢出。

**Q: LLM 不按 JSON 格式返回怎么办？**
> 三层容错：直接 JSON.parse → 正则提取 {...} 块 → 兜底当自然语言输出。非确定性系统的容错设计。

**Q: 怎么测试 Agent？不调 API 能跑吗？**
> URL 加 `?mock=1` 或输入 `demo`，MockLLM 用预设脚本模拟完整 3 步 ReAct 流程，支持流式、Token 统计、Abort。面试现场无需网络和 API Key。

**Q: 浏览器端怎么处理 CORS？**
> LLM API（DeepSeek/Gemini）已支持 CORS。搜索工具不真正抓取网页（浏览器沙箱限制），改为返回链接 + 平台信息提示，由 LLM 基于平台特征生成分析。

**Q: 为什么用 Web Worker？**
> Agent 循环中的 LLM 调用是长时间异步操作。虽然 async/await 不阻塞主线程，但流式 SSE 解析是 CPU 密集操作。Worker 隔离保证 UI 始终 60fps。同时展示跨线程通信能力。

### 和市面上项目的差异化

| 竞品 | 本项目差异 |
|---|---|
| 调 ChatGPT API 的套壳应用 | 自研 Agent，多步自主执行 + Self-Reflection |
| 用 LangChain 的项目 | 200 行手写，每行可解释，零依赖 |
| 需要后端服务器的 Agent | 纯浏览器端运行，PWA 安装即用 |
| 只支持一种 LLM | 双引擎 Provider 模式，UI 一键切换 |
| 黑盒 AI 应用 | 每步推理-工具调用-观察全链路可视化 + Token 追踪 |
