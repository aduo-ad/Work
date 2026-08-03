# 🎯 阿duo的秋招旅程

> PWA 求职进度管理 + AI Agent 智能研究，纯浏览器端运行，零后端依赖、零框架。

---

## 功能

| Tab | 功能 |
|---|---|
| 📋 投递管理 | 看板拖拽（待投递→已投递→面试中→已Offer→已拒绝），搜索/筛选/导出 |
| ⚖️ Offer 对比 | 多维度薪资对比（base×月数+签字费+股票） |
| 🔬 研究院 | **AI Agent** 自主搜索多平台、交叉验证、批判反思，输出结构化报告 |

---

## Agent 研究院

四种模式：**深度研究** / **对比分析** / **面试准备** / **全流程**（含 Self-Reflection）。

```
用户输入公司名
      ↓
ReAct Agent Loop（Thought → Action → Observation）
      ↓
流式输出思考过程 → 工具调用 → Token 实时统计
      ↓
结构化分析报告（可保存到本地笔记）
```

Mock 模式：输入 `demo` 或 URL 加 `?mock=1`，无需 API Key 即可演示完整流程。

---

## 项目结构（4,147 行）

```
├── index.html              PWA 入口，含 Agent Tab 和设置面板
├── manifest.json           PWA 配置，支持添加到手机主屏幕
├── sw.js                   Service Worker，网络优先缓存策略
│
├── css/
│   ├── style.css           主样式，移动端优先（max-width: 520px）
│   └── agent.css           Agent 思考链样式：流式卡片/Token徽标/停止按钮
│
└── js/
    ├── app.js              主应用：投递管理、Offer 对比、设置、ES Module 桥接
    ├── agent-app.js        Agent 入口：LLM 工厂、回调路由、Worker 管理、运行控制
    │
    ├── core/
    │   ├── agent.js        ReAct Loop 核心：Thought→Action→Observation，JSON 容错，错误恢复，AbortController
    │   ├── agent-worker.js Web Worker 版 Agent：独立线程运行，postMessage 通信，工具跨线程代理
    │   ├── memory.js       三层记忆：Working Memory（自动压缩）+ Episodic（IndexedDB）+ Summary
    │   ├── tools.js        工具注册表：注册校验、参数校验、标准化 {result}/{error} 返回，4 个内置工具
    │   ├── orchestrator.js 多 Agent 编排：Sequential（流水线）/ Parallel（并发）/ Debate（辩论+裁判）
    │   └── mock-llm.js     Mock LLM：预设脚本驱动，支持流式/Token/Abort，无需 API 离线演示
    │
    ├── agents/
    │   └── index.js        4 个 Agent 工厂：研究（t=0.5）/ 对比（t=0.3）/ 面试（t=0.6）/ 批判（t=0.3）
    │
    └── ui/
        └── agent-chat.js   Agent 思考链 UI：流式卡片、工具调用展示、Token 统计、最终报告、Markdown 渲染
```

---

## 技术栈

| 层面 | 技术 |
|---|---|
| 框架 | **零框架**，纯原生 JavaScript |
| 模块化 | ES Module（Agent 核心）+ 传统脚本（主应用），window 桥接 |
| AI | DeepSeek / Gemini 双引擎 Provider 模式 |
| 流式 | ReadableStream + SSE 解析 |
| 存储 | localStorage + IndexedDB |
| 离线 | Service Worker（网络优先）+ PWA Manifest |
| 并发 | Web Worker + AbortController + postMessage |
| 依赖 | **零第三方依赖**（连 LangChain 都没用） |

---

## 使用

```
正常使用：
  1. 手机浏览器打开 → 添加到主屏幕（PWA）
  2. ⚙️ 设置 → 选 AI 引擎 → 填 API Key
  3. 输入公司名 → 选 Agent 模式 → 启动

Mock 演示（无需 API Key）：
  方式 A: URL 加 ?mock=1 → 输入任意公司名
  方式 B: 直接输入 demo 启动

API Key 获取：
  DeepSeek（推荐，国内直连）: https://platform.deepseek.com/api_keys
  Gemini（需 VPN）:           https://aistudio.google.com/apikey
```
