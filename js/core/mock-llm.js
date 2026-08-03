/**
 * Mock LLM — 回放式 Agent 测试
 *
 * 面试亮点：
 *   非确定性系统（LLM）的确定性测试方案。
 *   不调真实 API，用预设脚本模拟完整 Agent 流程。
 *   支持录制 → 回放模式。
 *
 * 激活方式：
 *   URL 加 ?mock=1
 *   或公司名输入 "demo"
 *   或控制台 window.__enableMock()
 */

// ============ 预设场景 ============

const SCENARIOS = {
  // 默认研究场景：模拟 3 步 Agent 流程
  default: [
    {
      action: 'web_search',
      input: { company: '{company}', source: 'niuke' },
      reasoning: '需要先在牛客上搜索{company}的校招面经，了解面试流程和难度'
    },
    {
      action: 'web_search',
      input: { company: '{company}', source: 'maimai' },
      reasoning: '牛客的面经信息已获取，还需要脉脉上了解{company}的薪资水平和内部评价'
    },
    {
      action: 'FINISH',
      answer: `## {company} 2026 秋招全面分析

### 📊 薪资水平
| 岗位 | 月Base | 年包 |
|------|--------|------|
| 后端开发 | 25-30K | 38-50万 |
| 前端开发 | 22-28K | 33-45万 |
| 算法工程师 | 30-38K | 48-65万 |

- 签字费：3-8万（根据面试评级）
- 股票/期权：部分岗位有 RSU
- 公积金：全额 12%

### 📝 面试流程
1. **简历筛选**（1-2周）
2. **笔试**：牛客网在线编程，3道算法题（中等难度）
3. **技术一面**：项目深挖 + 1道算法
4. **技术二面**：系统设计 + 基础知识
5. **HR面**：薪资期望、职业规划

### 💡 面经要点（牛客高频）
- 算法：二叉树、动态规划、链表操作
- 系统设计：短链接系统、消息队列设计
- 项目追问：难点、优化方案、量化成果

### 🏢 工作体验（脉脉/知乎）
- 工作强度：1095，双休但项目期加班
- 团队氛围：年轻化，技术驱动
- 成长空间：内部晋升通道清晰
- 福利：三餐免费、健身房、租房补贴

### ⚠️ 注意事项
- 竞争激烈，提前批开始就投递
- HR面会考察价值观匹配
- 部分部门有试用期考核

> 📌 以上信息综合自牛客、脉脉、知乎等平台 2026 秋招数据，具体以实际 offer 为准。`,
      reasoning: '已从多个来源收集足够信息，输出完整的结构化分析报告'
    }
  ],

  // 错误恢复场景：第一次工具调用失败 → 换策略
  error_recovery: [
    {
      action: 'web_search',
      input: { company: '{company}', source: 'niuke' },
      reasoning: '先搜索{company}的面经信息'
    },
    {
      action: 'web_search',
      input: { company: '{company}', source: 'zhihu' },
      reasoning: '上一个搜索源未能获取足够信息，换个平台搜索知乎上的讨论'
    },
    {
      action: 'FINISH',
      answer: `## {company} 校招分析报告

### 薪资概况
- 技术岗年包集中在 30-50万
- 五险一金全额缴纳
- 年终奖 2-4 个月

### 面试建议
- 提前刷 LeetCode 中等题
- 准备好项目深度
- 关注公司业务方向

> 信息来自知乎、牛客等公开平台，仅供参考。`,
      reasoning: '信息收集完毕，输出最终报告。注：牛客搜索未返回足够数据，已用知乎补充。'
    }
  ]
};

// ============ MockLLM 类 ============

class MockLLM {
  constructor(scenario = 'default', options = {}) {
    this.name = 'Mock (测试模式)';
    this.cost = { input: 0, output: 0 }; // 模拟不花钱
    this.lastUsage = null;
    this._step = 0;
    this._scenario = scenario;
    this._delay = options.delay || 300;   // 每步模拟延迟（ms）
    this._streamDelay = options.streamDelay || 15; // 流式每块延迟
    this._company = options.company || '字节跳动';
    this._steps = (SCENARIOS[scenario] || SCENARIOS.default).map(s => ({
      ...s,
      answer: s.answer ? s.answer.replace(/\{company\}/g, this._company) : undefined,
      reasoning: s.reasoning ? s.reasoning.replace(/\{company\}/g, this._company) : undefined,
      input: s.input ? JSON.parse(JSON.stringify(s.input).replace(/\{company\}/g, this._company)) : undefined
    }));
  }

  /** 非流式调用 */
  async chat(messages, opts = {}) {
    if (window.__agentAborted || opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    await this._sleep(this._delay, opts.signal);
    const response = this._nextResponse();
    this._updateFakeUsage(response);
    return response;
  }

  /** 流式调用：逐字符回调，模拟真实 streaming */
  async chatStream(messages, opts, onChunk) {
    const fullText = this._nextResponse();
    this._updateFakeUsage(fullText);

    // 逐块输出，模拟流式体验
    const chunkSize = 3 + Math.floor(Math.random() * 5); // 3-7 字/块
    for (let i = 0; i < fullText.length; i += chunkSize) {
      if (window.__agentAborted || opts.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const chunk = fullText.slice(i, i + chunkSize);
      onChunk?.(chunk, fullText.slice(0, i + chunkSize));
      await this._sleep(this._streamDelay, opts.signal);
    }
    return fullText;
  }

  /** 获取下一步的预设响应 */
  _nextResponse() {
    const step = this._steps[this._step] || this._steps[this._steps.length - 1];
    this._step++;
    return JSON.stringify(step);
  }

  /** 模拟 token 消耗 */
  _updateFakeUsage(text) {
    const promptTokens = 800 + this._step * 600;    // 每步上下文增长
    const completionTokens = Math.ceil(text.length / 2); // 粗估：2 字符 ≈ 1 token
    this.lastUsage = {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens
    };
  }

  _sleep(ms, signal) {
    return new Promise((resolve, reject) => {
      if (window.__agentAborted || signal?.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
      const timer = setTimeout(resolve, ms);
      const onAbort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
      if (signal) signal.addEventListener('abort', onAbort, { once: true });
    });
  }
}

// ============ 录制模式（可选） ============

class RecordLLM {
  constructor(realLLM) {
    this._real = realLLM;
    this.name = realLLM.name + ' (录制中)';
    this.cost = realLLM.cost;
    this.lastUsage = null;
    this._trace = [];
  }

  get trace() { return this._trace; }
  get lastUsage() { return this._real.lastUsage; }
  set lastUsage(v) { this._real.lastUsage = v; }

  async chat(messages, opts) {
    const resp = await this._real.chat(messages, opts);
    this._trace.push({ type: 'chat', messages: messages.length, response: resp });
    return resp;
  }

  async chatStream(messages, opts, onChunk) {
    const chunks = [];
    const resp = await this._real.chatStream(messages, opts, (chunk, full) => {
      chunks.push(chunk);
      onChunk?.(chunk, full);
    });
    this._trace.push({ type: 'chatStream', messages: messages.length, chunks: chunks.length, response: resp });
    return resp;
  }
}

// ============ 检测函数 ============

const MOCK_FLAG_KEY = '__qiuzhao_mock';

function isMockEnabled() {
  if (typeof window === 'undefined') return false;
  if (window[MOCK_FLAG_KEY]) return true;
  const params = new URLSearchParams(window.location.search);
  return params.get('mock') === '1';
}

function enableMock(scenario = 'default', company = '字节跳动') {
  if (typeof window !== 'undefined') {
    window[MOCK_FLAG_KEY] = true;
    window.__mockScenario = scenario;
    window.__mockCompany = company;
    window.__showToast?.('🧪 Mock 模式已启用');
  }
}

export { MockLLM, RecordLLM, SCENARIOS, isMockEnabled, enableMock };
