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
import { createLLM as createProviderLLM } from './core/llm.js';
import { Orchestrator } from './core/orchestrator.js';
import { AgentChatUI } from './ui/agent-chat.js';
import { MockLLM, isMockEnabled } from './core/mock-llm.js';
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
  window.__agentChatUI = chatUI; // 暴露给 app.js 的 searchCompany

  // ============ Web Worker Agent 运行器 ============
  let agentWorker = null;

  function createAgentWorker() {
    try {
      const worker = new Worker('./js/core/agent-worker.js', { type: 'module' });
      worker.onmessage = (e) => {
        const msg = e.data;
        switch (msg.type) {
          case 'stream':   chatUI.addStreamingThought(msg.step, msg.text); break;
          case 'streamEnd': chatUI.finalizeStreamingThought(msg.step); break;
          case 'step':     chatUI.addReasoning(msg.step, msg.reasoning); break;
          case 'tool':
            chatUI.addToolCall(msg.step, msg.tool, msg.input);
            chatUI.addObservation(msg.step, msg.result);
            break;
          case 'token':    chatUI.updateTokenBadge(msg.usage, msg.cost); break;
          case 'complete':
            chatUI.addFinalAnswer(msg.answer, { steps: msg.steps, forced: msg.forced, usage: msg.usage, cost: msg.cost });
            chatUI.clearStatus();
            setRunning(false);
            window.__agentAborted = false;
            break;
          case 'error':
            chatUI.addError(msg.message);
            chatUI.clearStatus();
            setRunning(false);
            window.__agentAborted = false;
            break;
          case 'tool_request':
            // Worker 需要主线程执行 memory 工具
            handleWorkerToolRequest(worker, msg.id, msg.name, msg.args);
            break;
        }
      };
      worker.onerror = (e) => {
        chatUI.addError('Worker 运行异常: ' + (e.message || '未知错误'));
        chatUI.clearStatus();
        setRunning(false);
        terminateWorker();
      };
      return worker;
    } catch (e) {
      return null; // Worker 不支持，降级到主线程
    }
  }

  function terminateWorker() {
    if (agentWorker) { agentWorker.terminate(); agentWorker = null; }
  }

  async function handleWorkerToolRequest(worker, id, name, args) {
    // 在主线程执行 memory 工具，结果发回 Worker
    const tool = tools.get(name);
    let result;
    if (tool) {
      result = await tool.execute(args);
    } else {
      result = { error: `未知工具: ${name}` };
    }
    worker.postMessage({ type: 'tool_result', id, result });
  }

  // Mock 模式控制台入口
  window.__enableMock = (scenario, company) => {
    import('./core/mock-llm.js').then(m => m.enableMock(scenario, company));
  };
  window.__disableMock = () => { window.__qiuzhao_mock = false; };

  // ============ LLM 接口（适配 DeepSeek / Gemini） ============
  function createLLM(forceMock = false, mockCompany = '字节跳动') {
    const provider = window.__getAiProvider?.() || 'deepseek';
    const apiKey = window.__getAiApiKey?.() || '';

    // Mock 模式：URL ?mock=1 或公司名 "demo" 或 window.__enableMock()
    if (forceMock || isMockEnabled()) {
      chatUI.updateStatus('🧪', 'Mock 测试模式 — 无需 API Key');
      const scenario = window.__mockScenario || 'default';
      const company = window.__mockCompany || mockCompany;
      return new MockLLM(scenario, { company, delay: 600, streamDelay: 20 });
    }

    if (!apiKey) {
      chatUI.addError('请先在设置（⚙️）中配置 AI API Key');
      return null;
    }

    // 统一由 js/core/llm.js 创建（DeepSeek / Gemini），Mock 分支在上方已提前返回
    return createProviderLLM(provider, apiKey);
  }

  // ============ Agent 模式（由 app.js 的 window.__setAgentMode 控制） ============

  // ============ 执行/停止按钮 ============
  let running = false;
  let abortController = null;
  const btnRun = document.getElementById('btn-agent-run');
  const inputEl = document.getElementById('research-input');

  function setRunning(isRunning) {
    running = isRunning;
    btnRun.textContent = isRunning ? '⏹️ 停止' : '🤖 启动Agent';
    btnRun.classList.toggle('btn-stop', isRunning);
    if (inputEl) inputEl.disabled = isRunning;
    // 禁用模式切换
    document.querySelectorAll('.ag-tab').forEach(b => b.disabled = isRunning);
  }

  btnRun.addEventListener('click', async () => {
    // 如果正在运行 → 中止
    if (running) {
      // 直接设置全局 abort 标志（MockLLM 检查这个）
      window.__agentAborted = true;
      if (agentWorker) {
        agentWorker.postMessage({ type: 'abort' });
        terminateWorker();
        chatUI.updateStatus('⏹️', '已停止');
        setRunning(false);
        return;
      }
      if (abortController) {
        abortController.abort();
        chatUI.updateStatus('⏹️', '正在停止…');
      }
      return;
    }

    const query = inputEl?.value.trim();
    // 输入 "demo" 或 URL ?mock=1 使用 Mock 模式
    const useMock = query === 'demo' || isMockEnabled();
    // Mock 模式：demo→字节跳动，否则用实际输入
    const researchTarget = useMock ? (query === 'demo' ? '字节跳动' : query) : query;
    lastQuery = researchTarget;
    if (useMock && query === 'demo') {
      window.__showToast?.('🧪 Mock 模式：演示 字节跳动 研究流程');
    }
    if (!query) {
      window.__showToast?.('请先输入公司名称');
      return;
    }

    const llm = createLLM(useMock, researchTarget);
    if (!llm) {
      window.__showToast?.('⚠️ 请先在设置中配置 AI API Key');
      window.__openSettings?.();
      return;
    }

    // 创建新的 AbortController
    window.__agentAborted = false;
    abortController = new AbortController();
    setRunning(true);
    chatUI.clear();
    chatUI.addUserMessage(`分析：${researchTarget}${useMock ? ' (Mock)' : ''}`);
    const mode = window.__agentMode || 'research';
    chatUI.updateStatus('🤖', `正在启动 ${mode} Agent…`);

    // 简单模式（research / interview）→ Web Worker 运行
    const canUseWorker = (mode === 'research' || mode === 'interview') && !useMock;
    if (canUseWorker) {
      terminateWorker();
      agentWorker = createAgentWorker();
    }

    try {
      if (agentWorker) {
        // === Worker 路径 ===
        const provider = window.__getAiProvider?.() || 'deepseek';
        const apiKey = window.__getAiApiKey?.() || '';
        agentWorker.postMessage({
          type: 'run',
          task: mode === 'research'
            ? `请全面研究这家公司：${researchTarget}。使用 web_search 搜索至少 3 个不同来源。`
            : (() => {
                const localKnowledge = memory.query(researchTarget);
                const hint = localKnowledge.length ? `\n本地知识库已有以下信息，请利用：${JSON.stringify(localKnowledge)}` : '';
                return `请为 ${researchTarget} 制定面试准备方案。${hint}`;
              })(),
          provider, apiKey, mode, temperature: mode === 'research' ? 0.5 : 0.6
        });
        // 完成/错误/中止由 worker.onmessage 处理（setRunning 在那里调）
      } else {
        // === 主线程路径（降级 / 复杂模式） ===
        await runAgent(mode, researchTarget, llm, tools, chatUI, abortController);
        chatUI.clearStatus();
        setRunning(false);
        window.__agentAborted = false;
      }
    } catch (e) {
      chatUI.clearStatus();
      if (e.name !== 'AbortError') chatUI.addError(e.message);
      setRunning(false);
    } finally {
      if (!agentWorker) {
        abortController = null;
      }
    }
  });

  // 保存回调（用 lastQuery 捕获闭包外的变量）
  let lastQuery = '';
  chatUI.onSave((text) => {
    const q = lastQuery || '未知公司';
    memory.save(q, 'agent_analysis', text);
    window.__addResearchNote?.(q, text, 'Agent 分析');
    window.__showToast?.('💾 已保存到研究笔记');
  });
});

// ============ Agent 执行 ============
async function runAgent(mode, query, llm, tools, chatUI, abortController) {
  const memory = window.__agentMemory;
  // 注入 AbortController 到 Agent
  function prepareAgent(agent) {
    agent.setAbortController(abortController);
    return agent;
  }

  // 通用流式回调（带 addReasoning 去重 + token 追踪）
  function streamCallbacks(prefix = '') {
    let streaming = false;
    return {
      onStream: (step, text) => {
        streaming = true;
        chatUI.addStreamingThought(step, text);
      },
      onStreamEnd: (step) => {
        streaming = false;
        chatUI.finalizeStreamingThought(step);
      },
      onTokenUsage: (usage, cost) => {
        chatUI.updateTokenBadge(usage, cost);
      },
      makeOnStep: (customFn) => (s) => {
        if (!streaming) {
          if (customFn) customFn(s);
          else chatUI.addReasoning(s.step, s.reasoning);
        }
      },
      makeOnToolCall: () => (t) => {
        chatUI.addToolCall(t.step, t.tool, t.input);
        chatUI.addObservation(t.step, t.result);
      }
    };
  }

  switch (mode) {
    case 'research': {
      const sc = streamCallbacks();
      const agent = prepareAgent(createResearchAgent(tools, llm, memory));
      await agent.run(`请全面研究这家公司：${query}。使用 web_search 搜索至少 3 个不同来源。`, {
        onStream:    sc.onStream,
        onStreamEnd: sc.onStreamEnd,
        onStep:      sc.makeOnStep(),
        onToolCall:  sc.makeOnToolCall(),
        onComplete:  (r) => chatUI.addFinalAnswer(r.answer, { steps: r.steps, forced: r.forced, usage: r.usage, cost: r.cost }),
        onError:     (e) => chatUI.addError(e.error)
      });
      break;
    }

    case 'compare': {
      const sc1 = streamCallbacks();
      const researcher = prepareAgent(createResearchAgent(tools, llm, memory));
      const comparer = prepareAgent(createCompareAgent(tools, llm, memory));

      chatUI.updateStatus('🔬', '研究 Agent 工作中…');
      const researchResult = await researcher.run(
        `请研究以下公司的校招情况并对比：${query}。每家公司至少搜索 2 个信息源。`,
        { onStream: sc1.onStream, onStreamEnd: sc1.onStreamEnd, onStep: sc1.makeOnStep(), onToolCall: sc1.makeOnToolCall() }
      );

      const sc2 = streamCallbacks();
      chatUI.updateStatus('⚖️', '对比 Agent 工作中…');
      const compareResult = await comparer.run(
        `基于以下研究结果，请做横向对比分析：\n${researchResult.answer}`,
        { onStream: sc2.onStream, onStreamEnd: sc2.onStreamEnd, onStep: sc2.makeOnStep((s) => chatUI.addReasoning(s.step, `[对比] ${s.reasoning}`)), onToolCall: sc2.makeOnToolCall() }
      );

      chatUI.addFinalAnswer(
        `## 研究结果\n${researchResult.answer}\n\n---\n\n## 对比分析\n${compareResult.answer}`,
        { steps: researchResult.steps + compareResult.steps }
      );
      break;
    }

    case 'interview': {
      const sc = streamCallbacks();
      const agent = prepareAgent(createInterviewAgent(tools, llm, memory));
      const localKnowledge = memory.query(query);
      const knowledgeHint = localKnowledge.length
        ? `\n本地知识库已有以下信息，请利用：${JSON.stringify(localKnowledge)}`
        : '';

      await agent.run(`请为 ${query} 制定面试准备方案。${knowledgeHint}`, {
        onStream:    sc.onStream,
        onStreamEnd: sc.onStreamEnd,
        onStep:      sc.makeOnStep(),
        onToolCall:  sc.makeOnToolCall(),
        onComplete:  (r) => chatUI.addFinalAnswer(r.answer, { steps: r.steps, usage: r.usage, cost: r.cost }),
        onError:     (e) => chatUI.addError(e.error)
      });
      break;
    }

    case 'full': {
      const researcher = prepareAgent(createResearchAgent(tools, llm, memory));
      const critic = prepareAgent(createCriticAgent(tools, llm, memory));

      const sc1 = streamCallbacks();
      chatUI.updateStatus('🔬', '研究 Agent 搜集信息…');
      const r1 = await researcher.run(`请全面研究：${query}。搜索多个来源，交叉验证。`,
        { onStream: sc1.onStream, onStreamEnd: sc1.onStreamEnd, onStep: sc1.makeOnStep(), onToolCall: sc1.makeOnToolCall() }
      );

      const sc2 = streamCallbacks();
      chatUI.updateStatus('🔍', '批判 Agent 审查质量…');
      const c1 = await critic.run(`请审查以下研究报告的质量：\n${r1.answer}`,
        { onStream: sc2.onStream, onStreamEnd: sc2.onStreamEnd, onStep: sc2.makeOnStep((s) => chatUI.addReasoning(s.step, `[审查] ${s.reasoning}`)), onToolCall: sc2.makeOnToolCall() }
      );

      const sc3 = streamCallbacks();
      chatUI.updateStatus('🔄', '基于反馈修正…');
      const r2 = await researcher.run(
        `请基于以下审查意见，修正并完善你的分析报告：\n\n## 原报告\n${r1.answer}\n\n## 审查意见\n${c1.answer}\n\n请输出修正后的完整报告。`,
        { onStream: sc3.onStream, onStreamEnd: sc3.onStreamEnd, onStep: sc3.makeOnStep((s) => chatUI.addReasoning(s.step, `[修正] ${s.reasoning}`)), onToolCall: sc3.makeOnToolCall() }
      );

      const fullUsage = {
        prompt_tokens: (r1.usage?.prompt_tokens || 0) + (c1.usage?.prompt_tokens || 0) + (r2.usage?.prompt_tokens || 0),
        completion_tokens: (r1.usage?.completion_tokens || 0) + (c1.usage?.completion_tokens || 0) + (r2.usage?.completion_tokens || 0),
        total_tokens: (r1.usage?.total_tokens || 0) + (c1.usage?.total_tokens || 0) + (r2.usage?.total_tokens || 0)
      };
      chatUI.addFinalAnswer(r2.answer, { steps: r1.steps + c1.steps + r2.steps, usage: fullUsage, cost: llm.cost });
      break;
    }
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
