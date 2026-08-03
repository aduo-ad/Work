/**
 * Agent 系统集成 — 连接 Agent 框架与现有 PWA
 *
 * 面试亮点：
 *   自研 Agent 框架 vs 使用 LangChain。
 *   这里选择自研，以便完全控制 ReAct 循环的每一步，
 *   实现细粒度的可观测性（trace、step回调）。
 */
import { ToolRegistry, createDefaultTools } from './core/tools.js';
import { MemorySystem } from './core/memory.js';
import { Orchestrator } from './core/orchestrator.js';
import { AgentChatUI } from './ui/agent-chat.js';
import {
  createResearchAgent,
  createCompareAgent,
  createInterviewAgent,
  createCriticAgent
} from './agents/index.js';

// ============ 初始化 ============
document.addEventListener('DOMContentLoaded', async () => {
  // 等待主 app 初始化完成
  await sleep(300);

  const memory = new MemorySystem();
  await memory.init();

  // 暴露给工具使用
  window.__agentMemory = memory;

  const tools = new ToolRegistry();
  createDefaultTools(tools);

  const chatUI = new AgentChatUI('ag-messages');

  // ============ LLM 接口（适配 DeepSeek / Gemini） ============
  function createLLM() {
    const provider = window.__getAiProvider?.() || 'deepseek';
    const apiKey = window.__getAiApiKey?.() || '';

    if (!apiKey) {
      chatUI.addError('请先在设置（⚙️）中配置 AI API Key');
      return null;
    }

    // DeepSeek 接口
    if (provider === 'deepseek') {
      return {
        name: 'DeepSeek',
        async chat(messages, opts = {}) {
          const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: 'deepseek-chat',
              messages,
              temperature: opts.temperature ?? 0.7,
              max_tokens: 2048
            })
          });
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error?.message || `API 请求失败 (${resp.status})`);
          }
          const data = await resp.json();
          return data.choices?.[0]?.message?.content || '';
        }
      };
    }

    // Gemini 接口
    if (provider === 'gemini') {
      return {
        name: 'Gemini',
        async chat(messages, opts = {}) {
          // 转换消息格式
          const prompt = messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');
          const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { temperature: opts.temperature ?? 0.7, maxOutputTokens: 2048 }
              })
            }
          );
          if (!resp.ok) {
            const err = await resp.json().catch(() => ({}));
            throw new Error(err.error?.message || `API 请求失败 (${resp.status})`);
          }
          const data = await resp.json();
          return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        }
      };
    }

    return null;
  }

  // ============ Agent 模式选择 ============
  let currentMode = 'research'; // research | compare | interview | full

  document.querySelectorAll('.ag-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ag-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentMode = btn.dataset.mode;
    });
  });

  // ============ 执行按钮 ============
  document.getElementById('btn-agent-run').addEventListener('click', async () => {
    const query = document.getElementById('research-input').value.trim();
    if (!query) {
      window.__showToast?.('请先输入公司名称');
      return;
    }

    const llm = createLLM();
    if (!llm) {
      window.__showToast?.('⚠️ 请先在设置中配置 AI API Key');
      window.__openSettings?.();
      return;
    }

    chatUI.clear();
    chatUI.addUserMessage(`分析：${query}`);
    chatUI.updateStatus('🤖', `正在启动 ${currentMode} Agent…`);

    try {
      await runAgent(currentMode, query, llm, tools, chatUI);
      chatUI.clearStatus();
    } catch (e) {
      chatUI.clearStatus();
      chatUI.addError(e.message);
    }
  });

  // 保存回调
  chatUI.onSave((text) => {
    memory.save(query, 'agent_analysis', text);
    window.__addResearchNote?.(query, text, 'Agent 分析');
    window.__showToast?.('💾 已保存到研究笔记');
  });
});

// ============ Agent 执行 ============
async function runAgent(mode, query, llm, tools, chatUI) {
  const memory = window.__agentMemory;

  switch (mode) {
    case 'research': {
      // 单 Agent 深度研究
      const agent = createResearchAgent(tools, llm);
      await agent.run(`请全面研究这家公司：${query}。使用 web_search 搜索至少 3 个不同来源。`, {
        onStep:    (s) => chatUI.addReasoning(s.step, s.reasoning),
        onToolCall:(t) => {
          chatUI.addToolCall(t.step, t.tool, t.input);
          chatUI.addObservation(t.step, t.result);
        },
        onComplete:(r) => chatUI.addFinalAnswer(r.answer, { steps: r.steps, forced: r.forced }),
        onError:   (e) => chatUI.addError(e.error)
      });
      break;
    }

    case 'compare': {
      // 串行：先研究，再对比
      const researcher = createResearchAgent(tools, llm);
      const comparer = createCompareAgent(tools, llm);

      chatUI.updateStatus('🔬', '研究 Agent 工作中…');
      const researchResult = await researcher.run(
        `请研究以下公司的校招情况并对比：${query}。每家公司至少搜索 2 个信息源。`,
        {
          onStep:    (s) => chatUI.addReasoning(s.step, s.reasoning),
          onToolCall:(t) => {
            chatUI.addToolCall(t.step, t.tool, t.input);
            chatUI.addObservation(t.step, t.result);
          }
        }
      );

      chatUI.updateStatus('⚖️', '对比 Agent 工作中…');
      const compareResult = await comparer.run(
        `基于以下研究结果，请做横向对比分析：\n${researchResult.answer}`,
        {
          onStep:    (s) => chatUI.addReasoning(s.step, `[对比] ${s.reasoning}`),
          onToolCall:(t) => {
            chatUI.addToolCall(t.step, t.tool, t.input);
            chatUI.addObservation(t.step, t.result);
          }
        }
      );

      chatUI.addFinalAnswer(
        `## 研究结果\n${researchResult.answer}\n\n---\n\n## 对比分析\n${compareResult.answer}`,
        { steps: researchResult.steps + compareResult.steps }
      );
      break;
    }

    case 'interview': {
      // 面试准备
      const agent = createInterviewAgent(tools, llm);
      // 先查本地知识库
      const localKnowledge = memory.query(query);
      const knowledgeHint = localKnowledge.length
        ? `\n本地知识库已有以下信息，请利用：${JSON.stringify(localKnowledge)}`
        : '';

      await agent.run(`请为 ${query} 制定面试准备方案。${knowledgeHint}`, {
        onStep:    (s) => chatUI.addReasoning(s.step, s.reasoning),
        onToolCall:(t) => {
          chatUI.addToolCall(t.step, t.tool, t.input);
          chatUI.addObservation(t.step, t.result);
        },
        onComplete:(r) => chatUI.addFinalAnswer(r.answer, { steps: r.steps }),
        onError:   (e) => chatUI.addError(e.error)
      });
      break;
    }

    case 'full': {
      // 全流程：研究 → 批判 → 反思 → 最终输出
      const researcher = createResearchAgent(tools, llm);
      const critic = createCriticAgent(tools, llm);

      chatUI.updateStatus('🔬', '研究 Agent 搜集信息…');
      const r1 = await researcher.run(`请全面研究：${query}。搜索多个来源，交叉验证。`, {
        onStep:    (s) => chatUI.addReasoning(s.step, s.reasoning),
        onToolCall:(t) => {
          chatUI.addToolCall(t.step, t.tool, t.input);
          chatUI.addObservation(t.step, t.result);
        }
      });

      chatUI.updateStatus('🔍', '批判 Agent 审查质量…');
      const c1 = await critic.run(`请审查以下研究报告的质量：\n${r1.answer}`, {
        onStep:    (s) => chatUI.addReasoning(s.step, `[审查] ${s.reasoning}`),
        onToolCall:(t) => { chatUI.addToolCall(t.step, t.tool, t.input); chatUI.addObservation(t.step, t.result); }
      });

      // 如果批判 Agent 发现问题，让研究 Agent 修正
      chatUI.updateStatus('🔄', '基于反馈修正…');
      const r2 = await researcher.run(
        `请基于以下审查意见，修正并完善你的分析报告：\n\n## 原报告\n${r1.answer}\n\n## 审查意见\n${c1.answer}\n\n请输出修正后的完整报告。`,
        {
          onStep:    (s) => chatUI.addReasoning(s.step, `[修正] ${s.reasoning}`),
          onToolCall:(t) => { chatUI.addToolCall(t.step, t.tool, t.input); chatUI.addObservation(t.step, t.result); }
        }
      );

      chatUI.addFinalAnswer(r2.answer, { steps: r1.steps + c1.steps + r2.steps });
      break;
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
