/**
 * Tool Registry — Agent 可调用的工具集合
 * 每个工具包含：name, description, parameters (JSON Schema), execute()
 *
 * 面试重点：为什么用 JSON Schema 定义参数？
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

// ============ 内置工具定义 ============

export function createDefaultTools(registry) {
  // 1. 多源搜索工具
  registry.register({
    name: 'web_search',
    description: '搜索公司相关信息，返回搜索链接和摘要。source 可选值: niuke(牛客面经), maimai(脉脉评价), zhihu(知乎), kanzhun(看准网薪资), xiaohongshu(小红书)',
    parameters: {
      company:   { type: 'string',  description: '公司名称', required: true },
      source:    { type: 'string',  description: '搜索来源', required: true, enum: ['niuke', 'maimai', 'zhihu', 'kanzhun', 'xiaohongshu'] },
      job_type:  { type: 'string',  description: '岗位类型，如后端/前端/算法', required: false }
    },
    execute: (args) => {
      const urls = {
        niuke:   `https://www.nowcoder.com/search?type=post&query=${encodeURIComponent(args.company + ' ' + (args.job_type || '') + ' 秋招 面经')}`,
        maimai:  `https://maimai.cn/search?query=${encodeURIComponent(args.company + ' 薪资待遇')}`,
        zhihu:   `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(args.company + ' 秋招 待遇')}`,
        kanzhun: `https://www.kanzhun.com/search/?q=${encodeURIComponent(args.company)}`,
        xiaohongshu: `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(args.company + ' 秋招')}`
      };
      const url = urls[args.source];
      // 不打开浏览器——Agent 在报告中引用链接，用户自行查看
      const hints = { niuke: '面经/笔试/面试流程/offer薪资', maimai: '薪资/加班/内部评价', zhihu: '公司文化/发展前景/工作体验', kanzhun: '薪资结构/职级/涨幅', xiaohongshu: '办公环境/氛围/最新动态' };
      return args.source + ' 搜索「' + args.company + '」: ' + url + ' (提示: ' + (hints[args.source] || '综合信息') + ')';
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
