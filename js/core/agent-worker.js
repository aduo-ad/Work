/**
 * Agent Worker — 在独立线程中运行 ReAct 循环
 *
 * 面试亮点：
 *   Web Workers + postMessage 通信 + SharedArrayBuffer 概念
 *   主线程零阻塞，UI 始终 60fps
 *
 * 消息协议：
 *   主 → Worker: { type: 'run', task, provider, apiKey, mode, temperature }
 *   Worker → 主: { type: 'stream', step, text }
 *                 { type: 'streamEnd', step, fullText }
 *                 { type: 'step', step, reasoning, action, input }
 *                 { type: 'tool', step, tool, input, result }
 *                 { type: 'tool_request', id, name, args }  → 需要主线程执行工具
 *                 { type: 'complete', answer, steps, usage, cost }
 *                 { type: 'error', message }
 *   主 → Worker: { type: 'tool_result', id, result }
 *                { type: 'abort' }
 */

import { ReActAgent } from './agent.js';
import { ToolRegistry, createDefaultTools } from './tools.js';
import {
  createResearchAgent,
  createCompareAgent,
  createInterviewAgent,
  createCriticAgent
} from '../agents/index.js';

// ============ LLM 工厂（Worker 内独立 fetch） ============

function createWorkerLLM(provider, apiKey) {
  const COST = { deepseek: { input: 1, output: 2 }, gemini: { input: 0.5, output: 1.5 } };

  if (provider === 'deepseek') {
    const llm = {
      name: 'DeepSeek',
      cost: COST.deepseek,
      lastUsage: null,

      async chat(messages, opts = {}) {
        const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'deepseek-chat', messages, temperature: opts.temperature ?? 0.7, max_tokens: 2048 }),
          signal: opts.signal || undefined
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error?.message || `API 请求失败 (${resp.status})`);
        }
        const data = await resp.json();
        const u = data.usage;
        llm.lastUsage = u ? { prompt_tokens: u.prompt_tokens, completion_tokens: u.completion_tokens, total_tokens: u.total_tokens } : null;
        return data.choices?.[0]?.message?.content || '';
      },

      async chatStream(messages, opts, onChunk) {
        const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({ model: 'deepseek-chat', messages, temperature: opts.temperature ?? 0.7, max_tokens: 2048, stream: true }),
          signal: opts.signal || undefined
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          throw new Error(err.error?.message || `API 请求失败 (${resp.status})`);
        }

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let fullText = '', buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const json = JSON.parse(data);
              const delta = json.choices?.[0]?.delta?.content || '';
              if (delta) { fullText += delta; onChunk?.(delta, fullText); }
              if (json.usage) {
                llm.lastUsage = { prompt_tokens: json.usage.prompt_tokens, completion_tokens: json.usage.completion_tokens, total_tokens: json.usage.total_tokens };
              }
            } catch (e) { /* skip */ }
          }
        }
        return fullText;
      }
    };
    return llm;
  }

  // Gemini（简化版）
  const llm = {
    name: 'Gemini',
    cost: COST.gemini,
    lastUsage: null,
    async chat(messages, opts = {}) {
      const prompt = messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n');
      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: opts.temperature ?? 0.7, maxOutputTokens: 2048 } }),
          signal: opts.signal || undefined }
      );
      if (!resp.ok) { const err = await resp.json().catch(() => ({})); throw new Error(err.error?.message || `请求失败(${resp.status})`); }
      const data = await resp.json();
      const u = data.usageMetadata;
      llm.lastUsage = u ? { prompt_tokens: u.promptTokenCount, completion_tokens: u.candidatesTokenCount, total_tokens: u.totalTokenCount } : null;
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    },
    async chatStream(messages, opts, onChunk) { /* fallback to chat */ return this.chat(messages, opts); }
  };
  return llm;
}

// ============ 主线程工具代理 ============
// 这些工具需要 DOM/IndexedDB，由主线程执行

const MAIN_THREAD_TOOLS = ['save_research', 'query_knowledge'];

let _pendingToolResolve = null;
let _toolRequestId = 0;

// ============ Worker 入口 ============

let _abortController = null;

self.onmessage = async (e) => {
  const msg = e.data;

  switch (msg.type) {

    case 'run': {
      const { task, provider, apiKey, mode, temperature } = msg;
      _abortController = new AbortController();

      const llm = createWorkerLLM(provider, apiKey);
      const tools = new ToolRegistry();
      createDefaultTools(tools);

      // 代理「需要主线程」的工具
      for (const name of MAIN_THREAD_TOOLS) {
        const original = tools.get(name);
        if (original) {
          tools._tools.set(name, {
            ...original,
            execute: async (args) => {
              const id = ++_toolRequestId;
              return new Promise((resolve) => {
                _pendingToolResolve = resolve;
                self.postMessage({ type: 'tool_request', id, name, args });
              });
            }
          });
        }
      }

      // 创建 Agent
      const agentFactory = {
        research: createResearchAgent,
        compare: createCompareAgent,
        interview: createInterviewAgent,
        full: createResearchAgent // full mode uses multiple agents
      };
      const createFn = agentFactory[mode] || agentFactory.research;
      const agent = createFn(tools, llm);
      agent.setAbortController(_abortController);

      try {
        await agent.run(task, {
          onStream: (step, text) => {
            self.postMessage({ type: 'stream', step, text });
          },
          onStreamEnd: (step, fullText) => {
            self.postMessage({ type: 'streamEnd', step, fullText });
          },
          onStep: (s) => {
            self.postMessage({ type: 'step', step: s.step, reasoning: s.reasoning, action: s.action, input: s.input });
          },
          onToolCall: (t) => {
            self.postMessage({ type: 'tool', step: t.step, tool: t.tool, input: t.input, result: t.result });
          },
          onTokenUsage: (usage, cost) => {
            self.postMessage({ type: 'token', usage, cost });
          },
          onComplete: (r) => {
            self.postMessage({ type: 'complete', answer: r.answer, steps: r.steps, forced: r.forced, usage: r.usage, cost: r.cost, aborted: r.aborted });
          },
          onError: (e) => {
            self.postMessage({ type: 'error', message: e.error });
          }
        });
      } catch (e) {
        if (e.name !== 'AbortError') {
          self.postMessage({ type: 'error', message: e.message });
        }
      }
      break;
    }

    case 'tool_result': {
      if (_pendingToolResolve) {
        _pendingToolResolve(msg.result);
        _pendingToolResolve = null;
      }
      break;
    }

    case 'abort': {
      if (_abortController) {
        _abortController.abort();
      }
      break;
    }
  }
};
