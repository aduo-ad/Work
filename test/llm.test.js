import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLLM, createDeepSeekLLM, createGeminiLLM, COST } from '../js/core/llm.js';

test('createDeepSeekLLM 返回统一契约', () => {
  const llm = createDeepSeekLLM('k');
  assert.equal(llm.name, 'DeepSeek');
  assert.equal(llm.cost, COST.deepseek);
  assert.equal(typeof llm.chat, 'function');
  assert.equal(typeof llm.chatStream, 'function');
});

test('createGeminiLLM 返回统一契约', () => {
  const llm = createGeminiLLM('k');
  assert.equal(llm.name, 'Gemini');
  assert.equal(typeof llm.chat, 'function');
  assert.equal(typeof llm.chatStream, 'function');
});

test('createLLM 按 provider 分发，未知默认 DeepSeek', () => {
  assert.equal(createLLM('gemini', 'k').name, 'Gemini');
  assert.equal(createLLM('deepseek', 'k').name, 'DeepSeek');
  assert.equal(createLLM('unknown', 'k').name, 'DeepSeek');
});
