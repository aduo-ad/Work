/**
 * Tool Registry — Agent 可调用的工具集合
 * 每个工具包含：name, description, parameters (JSON Schema), execute()
 *
 * 为什么用 JSON Schema 定义参数？
 * → LLM 天然理解 JSON Schema 格式，能根据 Schema 生成合法参数
 * → execute() 前做 schema 校验，参数不合法直接拒绝，保证健壮性
 */
class ToolRegistry {
  constructor() {
    this._tools = new Map();
  }

  /** 注册工具 */
  register(tool) {
    if (!tool.name || !tool.description || !tool.parameters || !tool.execute) {
      throw new Error(`工具 "${tool.name}" 定义不完整，必须有 name/description/parameters/execute`);
    }
    this._tools.set(tool.name, tool);
  }

  /** 获取工具 */
  get(name) {
    return this._tools.get(name);
  }

  /** 列出所有工具（供 LLM 选择） */
  list() {
    return Array.from(this._tools.values()).map(t => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters
    }));
  }

  /** 获取 function calling 格式的工具描述 */
  toOpenAIFunctions() {
    return this.list().map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: 'object',
          properties: t.parameters,
          required: Object.keys(t.parameters)
        }
      }
    }));
  }

  /** 校验并执行工具 */
  async execute(name, args) {
    const tool = this._tools.get(name);
    if (!tool) return { error: `未知工具: ${name}` };

    // 参数校验
    for (const [key, schema] of Object.entries(tool.parameters)) {
      if (schema.required && (args[key] === undefined || args[key] === null)) {
        return { error: `工具 ${name} 缺少必需参数: ${key}` };
      }
    }

    try {
      const result = await tool.execute(args);
      return { result };
    } catch (e) {
      return { error: `工具 ${name} 执行失败: ${e.message}` };
    }
  }
}

// ============ 实时搜索（Tavily） ============
// Tavily 是面向 AI Agent 的搜索引擎，支持浏览器端 CORS：
//   - keyless 免费额度无需 API Key（请求头 X-Tavily-Access-Mode: keyless）
//   - 可配置 Key（Authorization: Bearer tvly-xxx）提升限额
//   - 任何失败（CORS / 网络 / 限流）自动回退为搜索链接，工具永不中断

const SOURCE_KEYWORDS = {
  niuke:        '牛客网 校招 面经 笔试 offer 薪资',
  maimai:       '脉脉 薪资 加班 内部评价',
  zhihu:        '知乎 工作体验 待遇 发展前景',
  kanzhun:      '看准网 薪资结构 职级 涨幅',
  xiaohongshu:  '小红书 秋招 办公环境 氛围'
};

function buildSearchQuery(args) {
  const parts = [args.company, args.job_type, SOURCE_KEYWORDS[args.source] || ''];
  return parts.filter(Boolean).join(' ');
}

function getTavilyKey() {
  return (typeof window !== 'undefined' && typeof window.__getTavilyKey === 'function')
    ? window.__getTavilyKey()
    : '';
}

async function searchTavily(query, apiKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;
  else headers['X-Tavily-Access-Mode'] = 'keyless';

  // 8 秒超时，避免单个搜索拖垮 Agent 循环
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);

  try {
    const resp = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers,
      body: JSON.stringify({ query, max_results: 5, search_depth: 'basic' }),
      signal: controller.signal
    });
    if (!resp.ok) throw new Error(`Tavily 请求失败 (${resp.status})`);

    const data = await resp.json();
    const results = data.results || [];
    if (!results.length) return null;
    return formatSearchResults(results);
  } finally {
    clearTimeout(timer);
  }
}

function formatSearchResults(results) {
  const lines = results.slice(0, 5).map((r, i) =>
    `${i + 1}. ${r.title || '（无标题）'}\n${(r.content || '').slice(0, 260)}\n🔗 ${r.url}`
  ).join('\n\n');
  return `[实时搜索结果 · Tavily]\n${lines}`;
}

// ============ 内置工具定义 ============

export function createDefaultTools(registry) {
  // 1. 多源搜索工具（优先 Tavily 实时搜索，失败回退搜索链接）
  registry.register({
    name: 'web_search',
    description: '搜索公司相关信息，返回真实搜索结果（标题/摘要/链接）。source 可选值: niuke(牛客面经), maimai(脉脉评价), zhihu(知乎), kanzhun(看准网薪资), xiaohongshu(小红书)',
    parameters: {
      company:   { type: 'string',  description: '公司名称', required: true },
      source:    { type: 'string',  description: '搜索来源', required: true, enum: ['niuke', 'maimai', 'zhihu', 'kanzhun', 'xiaohongshu'] },
      job_type:  { type: 'string',  description: '岗位类型，如后端/前端/算法', required: false }
    },
    execute: async (args) => {
      const urls = {
        niuke:   `https://www.nowcoder.com/search?type=post&query=${encodeURIComponent(args.company + ' ' + (args.job_type || '') + ' 秋招 面经')}`,
        maimai:  `https://maimai.cn/search?query=${encodeURIComponent(args.company + ' 薪资待遇')}`,
        zhihu:   `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(args.company + ' 秋招 待遇')}`,
        kanzhun: `https://www.kanzhun.com/search/?q=${encodeURIComponent(args.company)}`,
        xiaohongshu: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(args.company + ' 秋招')}`
      };
      const hints = { niuke: '面经/笔试/面试流程/offer薪资', maimai: '薪资/加班/内部评价', zhihu: '公司文化/发展前景/工作体验', kanzhun: '薪资结构/职级/涨幅', xiaohongshu: '办公环境/氛围/最新动态' };
      const fallback = `${args.source} 搜索「${args.company}」: ${urls[args.source]} (提示: ${hints[args.source] || '综合信息'})`;

      // 优先实时搜索，失败回退链接
      try {
        const real = await searchTavily(buildSearchQuery(args), getTavilyKey());
        if (real) return real;
      } catch (e) {
        // CORS / 网络 / 限流失败 → 回退为链接提示
      }
      return fallback;
    }
  });

  // 2. 薪资对比计算工具
  registry.register({
    name: 'calculate_package',
    description: '计算年包总薪资，支持 base × 月数 + 签字费 + 股票',
    parameters: {
      monthly_base: { type: 'number', description: '月 base（K）', required: true },
      months:       { type: 'number', description: '月数（如15薪=15）', required: true },
      sign_bonus:   { type: 'number', description: '签字费（万）', required: false },
      stock_per_year: { type: 'number', description: '每年股票价值（万）', required: false }
    },
    execute: (args) => {
      const base = (args.monthly_base * 1000) * args.months;
      const sign = (args.sign_bonus || 0) * 10000;
      const stock = (args.stock_per_year || 0) * 10000;
      const total = base + sign + stock;
      return JSON.stringify({
        base_total: base,
        sign_bonus: sign,
        stock: stock,
        total_package: total,
        breakdown: `月薪${args.monthly_base}K × ${args.months}薪 = ${(base/10000).toFixed(1)}万` +
          (args.sign_bonus ? ` + 签字费${args.sign_bonus}万` : '') +
          (args.stock_per_year ? ` + 股票${args.stock_per_year}万/年` : '') +
          ` = 年包约${(total/10000).toFixed(1)}万`
      });
    }
  });

  // 3. 存储研究结果工具
  registry.register({
    name: 'save_research',
    description: '将分析结果保存到本地知识库，供后续查询',
    parameters: {
      company:  { type: 'string', description: '公司名称', required: true },
      category: { type: 'string', description: '类别：salary/面试/评价/建议', required: true },
      content:  { type: 'string', description: '研究内容', required: true }
    },
    execute: (args) => {
      if (typeof window !== 'undefined' && window.__agentMemory) {
        window.__agentMemory.save(args.company, args.category, args.content);
        return `已保存 ${args.company} 的 ${args.category} 信息到本地知识库`;
      }
      return '知识库不可用（离线模式）';
    }
  });

  // 4. 查询本地知识库
  registry.register({
    name: 'query_knowledge',
    description: '从本地知识库查询之前保存的公司研究信息',
    parameters: {
      company:  { type: 'string', description: '公司名称', required: true },
      category: { type: 'string', description: '类别筛选（可选）', required: false }
    },
    execute: (args) => {
      if (typeof window !== 'undefined' && window.__agentMemory) {
        const results = window.__agentMemory.query(args.company, args.category);
        return results.length ? JSON.stringify(results) : `本地知识库中暂无 ${args.company} 的记录`;
      }
      return '知识库不可用';
    }
  });
}

export { ToolRegistry };
