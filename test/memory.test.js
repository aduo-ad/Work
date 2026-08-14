import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemorySystem } from '../js/core/memory.js';

test('resetWorking 清空 working memory', () => {
  const m = new MemorySystem();
  m.addWorking({ role: 'user', content: 'a' });
  m.resetWorking();
  assert.equal(m.getWorkingContext().length, 0);
});

test('addWorking 超过阈值自动压缩为摘要 + 最近 10 条', () => {
  const m = new MemorySystem();
  m.maxWorkingSize = 10;
  for (let i = 0; i < 25; i++) {
    m.addWorking({ role: 'user', content: `msg${i}` });
  }
  assert.equal(m.working.length, 11);
  assert.ok(m.working[0].content.includes('历史压缩摘要'));
});

test('save/query episodic memory 过滤与排序', () => {
  const m = new MemorySystem();
  m.save('字节跳动', 'salary', '25k*15');
  m.save('字节跳动', '面试', '三轮');
  m.save('腾讯', 'salary', '30k*16');

  assert.equal(m.query('字节跳动').length, 2);
  const r = m.query('字节跳动', 'salary');
  assert.equal(r.length, 1);
  assert.equal(r[0].category, 'salary');
});

test('save 满 3 条触发 summary', () => {
  const m = new MemorySystem();
  m.save('A公司', 'salary', '1');
  m.save('A公司', '面试', '2');
  m.save('A公司', '评价', '3');
  assert.ok(m.getSummary('A公司'));
});
