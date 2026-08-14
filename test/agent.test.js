import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ReActAgent } from '../js/core/agent.js';

function stubTools() {
  return { list: () => [], execute: async () => ({ result: 'ok' }) };
}

test('_parseResponse 直接解析合法 JSON', () => {
  const agent = new ReActAgent({ name: 't', role: 'r', goal: 'g', tools: stubTools(), llm: {} });
  const p = agent._parseResponse('{"action":"FINISH","answer":"hi"}');
  assert.equal(p.action, 'FINISH');
});

test('_parseResponse 从文本中提取 JSON 块', () => {
  const agent = new ReActAgent({ name: 't', role: 'r', goal: 'g', tools: stubTools(), llm: {} });
  const p = agent._parseResponse('好的，结果如下：\n```json\n{"action":"FINISH","answer":"ok"}\n```');
  assert.equal(p.action, 'FINISH');
  assert.equal(p.answer, 'ok');
});

test('_parseResponse 无法解析时兜底为自然语言 FINISH', () => {
  const agent = new ReActAgent({ name: 't', role: 'r', goal: 'g', tools: stubTools(), llm: {} });
  const p = agent._parseResponse('这是纯文本回答');
  assert.equal(p.action, 'FINISH');
  assert.equal(p.answer, '这是纯文本回答');
});

test('run 遇到 FINISH 直接返回答案', async () => {
  const llm = {
    name: 'fake',
    cost: null,
    lastUsage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
    async chat() { return '{"action":"FINISH","answer":"最终答案"}'; }
  };
  const agent = new ReActAgent({ name: 't', role: 'r', goal: 'g', tools: stubTools(), llm, maxSteps: 4 });
  const result = await agent.run('任务');
  assert.equal(result.answer, '最终答案');
  assert.equal(result.steps, 1);
});

test('run 调用工具后进入下一轮，最终 FINISH', async () => {
  const calls = [];
  const llm = {
    name: 'fake',
    cost: null,
    lastUsage: null,
    async chat(messages) {
      calls.push(messages.length);
      if (calls.length === 1) return '{"action":"web_search","input":{"company":"x"},"reasoning":"先搜"}';
      return '{"action":"FINISH","answer":"完成"}';
    }
  };
  const tools = {
    list: () => [{ name: 'web_search', description: 's', parameters: {} }],
    execute: async () => ({ result: '搜索结果' })
  };
  const agent = new ReActAgent({ name: 't', role: 'r', goal: 'g', tools, llm, maxSteps: 4 });
  const result = await agent.run('任务');
  assert.equal(result.answer, '完成');
  assert.equal(result.steps, 2);
});
