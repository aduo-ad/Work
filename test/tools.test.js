import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ToolRegistry, createDefaultTools } from '../js/core/tools.js';

test('ToolRegistry 注册缺字段应报错', () => {
  const r = new ToolRegistry();
  assert.throws(() => r.register({ name: 'x' }), /定义不完整/);
});

test('calculate_package 正确计算年包', async () => {
  const r = new ToolRegistry();
  createDefaultTools(r);
  const res = await r.execute('calculate_package', { monthly_base: 25, months: 15, sign_bonus: 5, stock_per_year: 4 });
  // 25k × 15 = 37.5万 + 签字费5万 + 股票4万 = 46.5万
  assert.equal(JSON.parse(res.result).total_package, 465000);
});

test('calculate_package 缺必需参数返回错误', async () => {
  const r = new ToolRegistry();
  createDefaultTools(r);
  const res = await r.execute('calculate_package', { monthly_base: 25 });
  assert.ok(res.error);
});

test('web_search 实时搜索失败时回退为搜索链接', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('network/CORS'); };
  try {
    const r = new ToolRegistry();
    createDefaultTools(r);
    const res = await r.execute('web_search', { company: '字节跳动', source: 'niuke' });
    assert.ok(res.result.includes('nowcoder.com'));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('web_search 实时搜索成功时返回真实结果', async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ results: [{ title: '字节跳动面经', content: '三轮技术面', url: 'https://example.com/1' }] })
  });
  try {
    const r = new ToolRegistry();
    createDefaultTools(r);
    const res = await r.execute('web_search', { company: '字节跳动', source: 'niuke' });
    assert.ok(res.result.includes('字节跳动面经'));
    assert.ok(res.result.includes('https://example.com/1'));
    assert.ok(res.result.includes('[实时搜索结果 · Tavily]'));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('未知工具返回错误', async () => {
  const r = new ToolRegistry();
  createDefaultTools(r);
  const res = await r.execute('no_such_tool', {});
  assert.ok(res.error);
});

test('save_research 离线模式（无 window）返回降级信息', async () => {
  const r = new ToolRegistry();
  createDefaultTools(r);
  const res = await r.execute('save_research', { company: 'x', category: 'salary', content: 'y' });
  assert.ok(res.result.includes('知识库不可用'));
});
