import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Orchestrator } from '../js/core/orchestrator.js';

function fakeAgent(name, answer) {
  return {
    name,
    async run(task, callbacks = {}) {
      callbacks.onStream?.(1, 'thinking…');
      callbacks.onStreamEnd?.(1, 'thinking…');
      callbacks.onStep?.({ step: 1, reasoning: 'r', action: 'FINISH', input: null });
      callbacks.onToolCall?.({ step: 1, tool: 'web_search', input: {}, result: { result: 'x' } });
      callbacks.onTokenUsage?.({ prompt_tokens: 6, completion_tokens: 4, total_tokens: 10 }, null);
      const r = { answer, steps: 1, usage: { total_tokens: 10 }, cost: null };
      callbacks.onComplete?.(r);
      return r;
    }
  };
}

test('Orchestrator.sequential 串行执行，上游 answer 传给下游 buildTask', async () => {
  const seenTasks = [];
  const results = await Orchestrator.sequential([
    fakeAgent('A', '研究结果A'),
    {
      agent: fakeAgent('B', '对比结果B'),
      key: 'compare',
      meta: { prefix: '[对比] ' },
      buildTask: (prev) => { seenTasks.push(prev); return `基于：${prev}`; }
    }
  ], '初始任务');

  assert.equal(results.length, 2);
  assert.equal(results[0].result.answer, '研究结果A');
  assert.equal(results[1].result.answer, '对比结果B');
  assert.deepEqual(seenTasks, ['研究结果A']);
});

test('Orchestrator.sequential 回调透传 key/meta 与事件字段', async () => {
  const seen = [];
  await Orchestrator.sequential([
    { agent: fakeAgent('A', 'ok'), key: 'k1', meta: { statusText: 'working' } }
  ], 'task', {
    onAgentStart: (name, ctx) => seen.push(['start', name, ctx.key, ctx.statusText]),
    onStream:      (name, ctx) => seen.push(['stream', ctx.key, ctx.step, ctx.text]),
    onStep:        (name, ctx) => seen.push(['step', ctx.key, ctx.reasoning]),
    onToolCall:    (name, ctx) => seen.push(['tool', ctx.key, ctx.tool]),
    onTokenUsage:  (name, ctx) => seen.push(['token', ctx.key, ctx.usage.total_tokens]),
    onComplete:    (name, ctx) => seen.push(['complete', ctx.key, ctx.result.answer])
  });

  assert.deepEqual(seen[0], ['start', 'A', 'k1', 'working']);
  assert.ok(seen.some(s => s[0] === 'stream' && s[1] === 'k1'));
  assert.ok(seen.some(s => s[0] === 'step' && s[2] === 'r'));
  assert.ok(seen.some(s => s[0] === 'tool' && s[2] === 'web_search'));
  assert.ok(seen.some(s => s[0] === 'token' && s[1] === 'k1' && s[2] === 10));
  assert.ok(seen.some(s => s[0] === 'complete' && s[2] === 'ok'));
});
