/**
 * Agent 工厂 — 创建各类型专用 Agent
 *
 * 设计说明：
 *   每个 Agent 有不同的 system prompt 和工具集，
 *   体现了 Agent 的分工协作思想
 *
 * 每个工厂都接受可选的 memory 参数，注入 ReActAgent 后启用
 * Working Memory 自动压缩（超过阈值时把旧轮次折叠成摘要）。
 */

import { ReActAgent } from '../core/agent.js';

/**
 * 研究 Agent — 搜集公司多维信息
 * 特点：使用 web_search 工具访问多个信息源，
 *       交叉验证信息，去重整理后输出结构化报告
 */
function createResearchAgent(tools, llm, memory) {
  return new ReActAgent({
    name: '研究Agent',
    role: '秋招信息研究员',
    goal: '搜集目标公司的校招薪资、面试流程、工作体验等信息，输出结构化报告。使用 web_search 工具搜索多个平台（牛客、脉脉、知乎、看准网、小红书），交叉验证信息准确性。每个维度至少搜索 2 个来源。',
    tools,
    llm,
    memory,
    maxSteps: 8,
    temperature: 0.5
  });
}

/**
 * 对比 Agent — 横向对比多家公司
 * 特点：接收研究 Agent 的输出，
 *       从多个维度对比，给出择业建议
 */
function createCompareAgent(tools, llm, memory) {
  return new ReActAgent({
    name: '对比Agent',
    role: 'Offer 对比分析师',
    goal: '从薪资、成长空间、工作强度、稳定性等维度横向对比多家公司的 Offer，输出对比表格和择业建议。如果有不确定的信息，使用 web_search 工具补充。使用 calculate_package 工具精确计算年包。',
    tools,
    llm,
    memory,
    maxSteps: 6,
    temperature: 0.3
  });
}

/**
 * 面试准备 Agent — 针对具体公司的面试攻略
 * 特点：基于搜集到的面经信息，
 *       制定针对性准备策略
 */
function createInterviewAgent(tools, llm, memory) {
  return new ReActAgent({
    name: '面试Agent',
    role: '面试准备策略师',
    goal: '根据目标公司的面试流程和考察重点，制定针对性的准备方案。包括：高频考点清单、刷题建议、项目准备方向、模拟面试要点。使用 web_search 获取该公司的具体面经，使用 query_knowledge 查询本地已有信息。',
    tools,
    llm,
    memory,
    maxSteps: 6,
    temperature: 0.6
  });
}

/**
 * 批判 Agent — 自我反思和质量检查
 * 特点：接收其他 Agent 的输出，
 *       找出逻辑漏洞、信息缺失、过度推断
 */
function createCriticAgent(tools, llm, memory) {
  return new ReActAgent({
    name: '批判Agent',
    role: '信息质量审查员',
    goal: '审查分析报告的准确性。检查：1) 信息是否有来源支撑 2) 逻辑是否自洽 3) 是否有遗漏维度 4) 薪资数字是否合理。如有问题列出具体改进点，不要修改原文。',
    tools,
    llm,
    memory,
    maxSteps: 4,
    temperature: 0.3
  });
}

export {
  createResearchAgent,
  createCompareAgent,
  createInterviewAgent,
  createCriticAgent
};
