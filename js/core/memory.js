/**
 * Agent 记忆系统
 *
 * 分层架构（面试重点）：
 *   Working Memory  — 当前任务上下文，窗口有限（最近 20 轮）
 *   Episodic Memory — 历史研究记录，存 IndexedDB，按相关性检索
 *   Summary Memory  — 压缩摘要，当 Working Memory 溢出时自动压缩
 */

const DB_NAME = 'agent_memory_v1';
const DB_VERSION = 1;

class MemorySystem {
  constructor() {
    this.working = [];      // [{role, content, timestamp}]
    this.episodic = [];     // [{company, category, content, timestamp}]
    this.summaries = [];    // [{company, summary, timestamp}]
    this.maxWorkingSize = 20;
    this._db = null;
  }

  /** 初始化 IndexedDB */
  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains('episodes')) {
          db.createObjectStore('episodes', { keyPath: 'id', autoIncrement: true });
        }
      };
      req.onsuccess = (e) => {
        this._db = e.target.result;
        this._loadFromDB().then(resolve).catch(resolve);
      };
      req.onerror = () => resolve(); // 降级：不使用 IndexedDB
    });
  }

  async _loadFromDB() {
    return new Promise((resolve) => {
      const tx = this._db.transaction('episodes', 'readonly');
      const store = tx.objectStore('episodes');
      const req = store.getAll();
      req.onsuccess = () => {
        this.episodic = req.result || [];
        resolve();
      };
      req.onerror = () => resolve();
    });
  }

  /** 保存到 episodic memory */
  save(company, category, content) {
    const record = { company, category, content, timestamp: Date.now() };
    this.episodic.push(record);

    // 持久化
    if (this._db) {
      try {
        const tx = this._db.transaction('episodes', 'readwrite');
        tx.objectStore('episodes').add(record);
      } catch (e) { /* 静默失败 */ }
    }

    // 更新摘要
    this._updateSummary(company);
  }

  /** 查询 episodic memory */
  query(company, category = null) {
    let results = this.episodic
      .filter(r => r.company.includes(company) || company.includes(r.company));

    if (category) {
      results = results.filter(r => r.category === category);
    }

    // 返回最近 5 条，按时间倒序
    return results
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 5)
      .map(r => ({ category: r.category, content: r.content, time: new Date(r.timestamp).toLocaleDateString() }));
  }

  /** 获取公司摘要 */
  getSummary(company) {
    const s = this.summaries.find(s => s.company === company);
    return s ? s.summary : null;
  }

  /** 更新摘要（最近研究内容超过 3 条时触发） */
  _updateSummary(company) {
    const records = this.episodic
      .filter(r => r.company === company)
      .sort((a, b) => b.timestamp - a.timestamp);

    if (records.length >= 3) {
      const summary = records.slice(0, 3).map(r => `[${r.category}] ${r.content.slice(0, 200)}`).join(' | ');
      const existing = this.summaries.findIndex(s => s.company === company);
      const entry = { company, summary, timestamp: Date.now() };
      if (existing >= 0) this.summaries[existing] = entry;
      else this.summaries.push(entry);
    }
  }

  /** 清空 working memory（每个新任务开始时调用） */
  resetWorking() {
    this.working = [];
  }

  /** 添加到 working memory（自动压缩） */
  addWorking(entry) {
    this.working.push({ ...entry, timestamp: Date.now() });
    if (this.working.length > this.maxWorkingSize) {
      // 保留最近 10 条，其余折叠成一条摘要，避免上下文无限膨胀
      const recent = this.working.slice(-10);
      const old = this.working.slice(0, -10);
      const summary = old
        .map(e => `${e.role}: ${typeof e.content === 'string' ? e.content : JSON.stringify(e.content)}`)
        .join('\n')
        .slice(0, 800);
      const compressed = {
        role: 'user',
        content: `[历史压缩摘要]\n${summary}`,
        timestamp: Date.now()
      };
      this.working = [compressed, ...recent];
    }
  }

  /** 获取 working memory 供 LLM 使用 */
  getWorkingContext() {
    return this.working.map(e => ({ role: e.role, content: e.content }));
  }
}

export { MemorySystem };
