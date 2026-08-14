# 🎯 阿duo的秋招旅程

> 秋招求职 PWA 工具，包含投递管理、Offer 对比、AI Agent 研究院。纯浏览器端运行，零后端、零框架依赖。

[![PWA](https://img.shields.io/badge/PWA-ready-blue)](https://aduo-ad.github.io/Work)
[![Lines](https://img.shields.io/badge/total-4,147_lines-333)](https://github.com/aduo-ad/Work)
[![Zero Deps](https://img.shields.io/badge/dependencies-zero-orange)](https://github.com/aduo-ad/Work)

---

## 功能

| 模块 | 说明 |
|---|---|
| 📋 **投递管理** | 看板拖拽（待投递→已投递→面试中→已Offer→已拒绝），支持搜索、筛选、导出 |
| ⚖️ **Offer 对比** | 薪资结构（base×月数+签字费+股票），多 Offer 可视化对比 |
| 🔬 **研究院** | AI Agent 自主规划多步执行，实时搜索（Tavily）多平台信息、交叉验证、输出结构化报告 |

研究院是本项目的技术核心——基于 ReAct 模式，Agent 自己决定搜什么、搜几个源、何时结束，不是简单的一问一答。

### Agent 研究院

四种工作模式：

| 模式 | 流程 |
|---|---|
| 🔬 **深度研究** | 单 Agent 多源搜索 → 结构化报告 |
| ⚖️ **对比分析** | 研究 Agent → 对比 Agent 流水线 |
| 🎯 **面试准备** | 本地知识库 + 实时搜索 → 面试策略 |
| 🔄 **全流程** | 研究 → 批判审查 → 反思修正（Self-Reflection） |

### 技术特性

- **流式输出**：LLM 逐字生成实时展示，ReadableStream 解析 SSE
- **Token 追踪**：实时显示消耗和费用估算
- **中止控制**：AbortController + 全局标志双重保障，随时停止
- **Mock 测试**：输入 `demo` 或 URL 加 `?mock=1`，无需 API Key 即可演示
- **Web Worker**：Agent 循环迁独立线程，UI 零阻塞
- **双引擎**：DeepSeek / Gemini 一键切换

---

## 架构

```
浏览器（PWA）
├── app.js               传统脚本 — 投递管理、Offer 对比
├── agent-app.js         ES Module — Agent 入口、Worker 管理
│   ├── core/
│   │   ├── agent.js         ReAct Loop（Thought → Action → Observation）
│   │   ├── agent-worker.js  Web Worker 版 Agent
│   │   ├── llm.js           DeepSeek / Gemini LLM 工厂（流式）
│   │   ├── memory.js        三层记忆（Working / Episodic / Summary）
│   │   ├── tools.js         工具注册表 + 4 个内置工具
│   │   ├── orchestrator.js  多 Agent 编排（Sequential / Parallel / Debate）
│   │   └── mock-llm.js      Mock LLM，无需 API 离线演示
│   ├── agents/
│   │   └── index.js         研究 / 对比 / 面试 / 批判 Agent 工厂
│   └── ui/
│       └── agent-chat.js    思考链可视化 UI
└── sw.js                Service Worker（网络优先缓存）
```

---

## 技术

### ReAct Loop（238 行，不依赖 LangChain）

```javascript
// Thought → Action → Observation → Thought → ...
for (let step = 0; step < maxSteps; step++) {
  const response = await llm.chatStream(messages, { signal }, onChunk);
  const { action, input } = parseResponse(response);
  const result = await tools.execute(action, input);
  messages.push({ role: 'user', content: formatResult(result) });
}
```

自研的理由：完全控制每一步的 prompt 构造、错误处理、日志记录。比引入 LangChain（200KB+）更适合 PWA 场景。

### LLM 输出容错

LLM 的 JSON 输出不可靠，`_parseResponse()` 做三层容错：

```javascript
try { return JSON.parse(raw); } catch {}                         // 直接解析
const match = raw.match(/\{[\s\S]*\}/);                          // 正则提取
if (match) try { return JSON.parse(match[0]); } catch {}
return { action: 'FINISH', answer: raw };                        // 兜底
```

### 三层记忆

| 层级 | 实现 | 作用 |
|---|---|---|
| Working Memory | 内存数组，≥20 条自动压缩 | 当前任务上下文 |
| Episodic Memory | IndexedDB 持久化 | 历史研究，跨会话查询 |
| Summary Memory | ≥3 条相关记录自动触发 | 压缩摘要，减少 token 消耗 |

### Web Worker 线程隔离

Agent 循环迁入独立线程，主线程只做 UI 渲染。消息协议：

```
主线程                     Worker
  │── { type: 'run' } ────→│  开始 Agent 循环
  │←── { type: 'stream' } ─│  流式输出
  │←── { type: 'tool' } ───│  工具调用结果
  │←── { type: 'complete' } │  完成
  │── { type: 'abort' } ──→│  中止
```

Worker 中无法访问 DOM/IndexedDB 的工具，通过 `tool_request` → `tool_result` 消息回主线程执行。

---

## 难点

**CORS 沙箱限制**：浏览器不能发任意 HTTP 请求。`web_search` 通过 Tavily（支持浏览器端 CORS，keyless 免费额度无需 API Key）做实时搜索，任何失败自动回退为平台链接提示，Agent 永不因搜索中断。

**Token 消耗控制**：ReAct 每步追加消息，上限通过 Working Memory 压缩 + maxSteps=8 + 温度控制实现。

**PWA 离线 vs Agent 实时性**：SW 网络优先策略保证 Agent 拿最新响应，离线降级为本地知识库 + Mock 模式。

**ES Module 桥接**：app.js（传统脚本）和 agent-app.js（ES Module）通过 `window.__xxx` 解耦通信。

---

## 使用

### PWA 安装

手机浏览器打开 `https://aduo-ad.github.io/Work` → 添加到主屏幕 → 像原生 App 使用。

### Agent 研究院

```
正常模式（需 API Key）：
  ⚙️ 设置 → 选引擎 → 填 Key → 输入公司名 → 选模式 → 启动

Mock 模式（无需 API Key）：
  输入 demo 启动，或 URL 加 ?mock=1
```

### API Key

| 引擎 | 获取地址 | 说明 |
|---|---|---|
| DeepSeek | https://platform.deepseek.com/api_keys | 国内直连，推荐 |
| Gemini | https://aistudio.google.com/apikey | 需 VPN |
| Tavily（搜索） | https://app.tavily.com | 可选；实时搜索，无 Key 也走免费额度 |

---

## 项目结构

```
qiuzhao/
├── index.html                    PWA 入口 + Agent UI
├── manifest.json                 PWA 配置
├── package.json                  ESM 配置 + 测试脚本（零运行时依赖）
├── sw.js                         Service Worker
├── css/
│   ├── style.css                 主样式（移动端优先）
│   └── agent.css                 Agent 思考链样式
├── test/                         node:test 单元测试
│   ├── agent.test.js             ReAct 循环 / JSON 容错解析
│   ├── tools.test.js             工具注册表 / 参数校验 / 计算
│   ├── memory.test.js            三层记忆 / 压缩阈值
│   └── llm.test.js               LLM 工厂契约
└── js/
    ├── app.js                    主应用（投递/Offer/桥接/触屏拖拽）
    ├── agent-app.js              Agent 入口（Worker/回调/编排）
    ├── agents/index.js           4 个 Agent 工厂
    ├── core/
    │   ├── agent.js              ReAct Loop 核心
    │   ├── agent-worker.js       Web Worker 版 Agent
    │   ├── llm.js                DeepSeek / Gemini LLM 工厂
    │   ├── memory.js             三层记忆
    │   ├── tools.js              ToolRegistry + 工具
    │   ├── orchestrator.js       多 Agent 编排
    │   └── mock-llm.js           Mock LLM
    └── ui/agent-chat.js          思考链 UI + Markdown 渲染

技术栈：纯原生 JS · ES Module · IndexedDB · ReadableStream · Web Worker · AbortController
零第三方依赖。测试用 `node --test` 运行。
```
