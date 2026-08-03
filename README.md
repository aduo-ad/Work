# 🎯 阿duo的秋招旅程

> PWA 求职进度管理 + AI Agent 智能研究，纯浏览器端运行，零后端依赖。

[![PWA](https://img.shields.io/badge/PWA-ready-blue)](https://aduo-ad.github.io/Work)
[![ES Module](https://img.shields.io/badge/ES%20Module-native-green)](https://github.com/aduo-ad/Work)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-orange)](#)

---

## ✨ 功能

| Tab | 功能 | 说明 |
|---|---|---|
| 📋 **投递** | 看板拖拽管理 | 待投递 → 已投递 → 面试中 → 已 Offer → 已拒绝，支持搜索/筛选/导出 |
| ⚖️ **Offer** | 多 Offer 对比 | 薪资结构、base×月数、签字费、股票，可视化对比 |
| 🔬 **研究院** | AI Agent 深度研究 | Agent 自主搜索多平台、交叉验证、批判反思，输出结构化报告 |

---

## 🧠 研究院 — Agent 架构（v2）

从 v1 的「一次 API 调用返回文本」升级为 **Agent Loop 自主规划多步执行**。

```
用户输入「字节跳动 后端 秋招」
            │
  ┌─────────▼──────────┐
  │  ReAct Agent Loop  │  Thought → Action → Observation → ...
  │                    │
  │  🔧 工具调用        │  web_search(牛客/脉脉/知乎/看准/小红书)
  │  💾 本地知识库      │  保存研究结果，跨会话查询
  │  🧮 薪资计算        │  calculate_package 自动算年包
  └─────────┬──────────┘
            │
  ┌─────────▼──────────┐
  │  批判 Agent 审查    │  检查信息源、逻辑一致性、遗漏维度
  │      ↓ 发现不足     │
  │  研究 Agent 修正    │  基于反馈补充完善
  └─────────┬──────────┘
            │
      最终结构化报告
```

### 四种 Agent 模式

- **🔬 深度研究** — 单 Agent 多源搜索，结构化报告
- **⚖️ 对比分析** — 研究 Agent → 对比 Agent 串行流水线
- **🎯 面试准备** — 结合本地知识库 + 实时搜索，制定面试策略
- **🔄 全流程** — 研究 → 批判审查 → 反思修正，Self-Reflection 闭环

---

## 🏗️ 技术架构

```
├── index.html              PWA 入口
├── manifest.json           PWA 配置（可安装到桌面）
├── sw.js                   Service Worker（网络优先缓存策略）
├── css/
│   ├── style.css           主样式（移动端优先，520px 容器）
│   └── agent.css           Agent 思考链 UI
└── js/
    ├── app.js              主应用（投递管理、Offer 对比、研究院基础）
    ├── agent-app.js        Agent 系统入口（ES Module）
    ├── agents/
    │   └── index.js        4 个 Agent 工厂（研究/对比/面试/批判）
    ├── core/
    │   ├── agent.js        ReAct Loop 核心（200 行，零框架）
    │   ├── memory.js       三层记忆（Working + Episodic + Summary）
    │   ├── tools.js        ToolRegistry + 4 个内置工具
    │   └── orchestrator.js 多 Agent 编排（Sequential / Parallel / Debate）
    └── ui/
        └── agent-chat.js   Agent 思考过程可视化
```

### 模块分层

| 层 | 模块 | 职责 |
|---|---|---|
| 🔧 工具层 | `tools.js` | 工具注册、参数校验、标准化返回 `{result}/{error}` |
| 🧠 推理层 | `agent.js` | ReAct 循环、JSON 解析容错、错误恢复、中止控制 |
| 🗄️ 记忆层 | `memory.js` | Working Memory 自动压缩 + Episodic(IndexedDB) + Summary |
| 🎭 编排层 | `orchestrator.js` | Sequential(流水线) / Parallel(Promise.all) / Debate(辩论+裁判) |
| 👁️ UI 层 | `agent-chat.js` | 每步推理-工具调用-观察全链路可视化 |
| 🔌 桥接层 | `agent-app.js` | ES Module ↔ 传统脚本，window.\_\_xxx API |

---

## 🔑 技术亮点

### 1. 手写 ReAct Loop，不用 LangChain

```
200 行实现 Thought → Action → Observation 循环：
- JSON Schema 驱动工具选择
- 工具执行失败 → 告知 LLM 出错 → 自动换策略
- 达到 maxSteps → 强制总结，不无限循环
- 支持 abort() 中止
```

### 2. 三层记忆架构（认知科学模型）

| 层级 | 实现 | 作用 |
|---|---|---|
| Working Memory | 内存数组 + 20 条溢出自动压缩 | 当前任务上下文 |
| Episodic Memory | IndexedDB 持久化 | 历史研究记录，跨会话查询 |
| Summary Memory | ≥3 条相关记录自动触发 | 压缩摘要，减少 token 消耗 |

### 3. LLM 输出容错设计

```
JSON.parse() → 正则提取 {…} 块 → 兜底当作自然语言
```
非确定性系统的三层容错，确保 Agent 不会因格式问题中断。

### 4. 双引擎 Provider 模式

支持 DeepSeek（国内直连）和 Gemini（需 VPN），UI 一键切换，API Key 仅存储在 localStorage。

### 5. 全流程 Self-Reflection

Google DeepMind Self-Refine 论文思路的工程实现：
研究 Agent 输出 → 批判 Agent 审查 → 研究 Agent 基于反馈修正 → 最终报告

---

## 🚀 使用方式

### 安装（PWA）
1. 用手机浏览器打开 `https://aduo-ad.github.io/Work`
2. Chrome/Safari → 添加到主屏幕
3. 像原生 App 一样使用，离线也能查看已缓存数据

### 使用 Agent 功能
1. 点击 ⚙️ 设置 → 选择 AI 引擎 → 填入 API Key
2. 切换到 🔬 研究院 Tab
3. 输入公司名 → 选择 Agent 模式 → 点击「启动 Agent」
4. 观察 Agent 每一步的思考、工具调用、观察结果
5. 最终报告可一键保存到研究笔记

### AI API Key 获取
- **DeepSeek**（推荐，国内直连）：https://platform.deepseek.com/api_keys
- **Gemini**（需 VPN）：https://aistudio.google.com/apikey

---

## 📦 技术栈

| 技术 | 说明 |
|---|---|
| 框架 | 零框架，纯原生 JavaScript |
| 模块化 | ES Module（核心）+ 传统脚本（主应用），window 桥接 |
| 存储 | localStorage + IndexedDB |
| PWA | Service Worker + Web App Manifest |
| AI | DeepSeek API / Gemini API（Provider 模式） |
| 依赖 | **零第三方依赖**，连 LangChain 都没用 |

---

## 📝 和市面上项目的差异

| 竞品 | 差异化 |
|---|---|
| 调 ChatGPT API 的套壳应用 | 自主 Agent，多步执行，不是一问一答 |
| 用 LangChain 的项目 | 200 行手写，每行都可解释 |
| 需要后端的 Agent | 纯浏览器端运行，PWA 安装即用 |
| 只支持一种 LLM | 双引擎 Provider 模式，一键切换 |
