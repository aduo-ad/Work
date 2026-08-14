/**
 * Agent Worker — 在独立线程中运行 ReAct 循环
 *
 * 设计说明：
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
import { createLLM } from './llm.js';
import { MemorySystem } from './memory.js';
import {
  createResearchAgent,
  createCompareAgent,
  createInterviewAgent,
  createCriticAgent
} from '../agents/index.js';

// ============ 主线程工具代理 ============
// 这些工具需要 DOM/IndexedDB，由主线程执行

const MAIN_THREAD_TOOLS = ['web_search', 'save_research', 'query_knowledge'];

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

      const llm = createLLM(provider, apiKey);
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
      // Worker 内使用纯内存版 Working Memory（不触碰 IndexedDB）
      const agent = createFn(tools, llm, new MemorySystem());
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
