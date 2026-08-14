/**
 * Agent 对话界面 — 展示 Agent 思考-行动-观察全过程
 *
 * 面试亮点：
 *   Agent 可观测性（Observability）—— 用户能看到每一步推理和工具调用，
 *   不只是一个黑盒返回结果
 */

class AgentChatUI {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    this._autoScroll = true;
  }

  /** 清空 */
  clear() {
    if (this.container) this.container.innerHTML = '';
  }

  /** 用户消息 */
  addUserMessage(text) {
    this._append(`
      <div class="ag-msg ag-msg-user">
        <div class="ag-msg-bubble">${this._esc(text)}</div>
      </div>
    `);
  }

  /** Agent 状态条 — 显示当前进度 + token 消耗 */
  updateStatus(icon, text, tokenInfo) {
    let el = this.container.querySelector('.ag-status');
    if (!el) {
      el = document.createElement('div');
      el.className = 'ag-status';
      this.container.insertBefore(el, this.container.firstChild);
    }
    let html = `<span>${icon}</span> <span>${this._esc(text)}</span>`;
    if (tokenInfo && tokenInfo.total_tokens > 0) {
      const costStr = tokenInfo.cost ? this._formatCost(tokenInfo.usage, tokenInfo.cost) : '';
      html += `<span class="ag-token-badge">📊 ${tokenInfo.usage.total_tokens} tokens${costStr ? ' · ' + costStr : ''}</span>`;
    }
    el.innerHTML = html;
    this._scroll();
  }
  /** 只更新状态栏中的 token 徽标（不覆盖文字） */
  updateTokenBadge(usage, cost) {
    if (!usage || usage.total_tokens <= 0) return;
    let el = this.container.querySelector('.ag-status');
    if (!el) { this.updateStatus('🤖', 'Agent 思考中…'); el = this.container.querySelector('.ag-status'); }
    if (!el) return;
    let badge = el.querySelector('.ag-token-badge');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'ag-token-badge';
      el.appendChild(badge);
    }
    const costStr = cost ? this._formatCost(usage, cost) : '';
    badge.textContent = `📊 ${usage.total_tokens} tokens${costStr ? ' · ' + costStr : ''}`;
  }

  clearStatus() {
    const el = this.container.querySelector('.ag-status');
    if (el) el.remove();
  }

  /** 格式化费用 */
  _formatCost(usage, cost) {
    if (!cost || !usage) return '';
    const yuan = (usage.prompt_tokens / 1000000) * cost.input + (usage.completion_tokens / 1000000) * cost.output;
    if (yuan < 0.001) return '<¥0.001';
    if (yuan < 0.01) return `≈¥${yuan.toFixed(3)}`;
    return `≈¥${yuan.toFixed(2)}`;
  }

  /** 推理步骤 */
  addReasoning(step, text) {
    this._append(`
      <div class="ag-step ag-step-think" data-stream-step="${step}">
        <div class="ag-step-head">
          <span class="ag-step-num">🧠 第${step}步 · 思考</span>
        </div>
        <div class="ag-step-body">${this._esc(text)}</div>
      </div>
    `);
  }

  /** 流式思考：创建或更新实时思考卡片 */
  addStreamingThought(step, text) {
    const id = `ag-stream-${step}`;
    let el = document.getElementById(id);
    if (!el) {
      // 首次创建：带闪烁指示器
      const html = `
        <div class="ag-step ag-step-think ag-step-streaming" id="${id}" data-stream-step="${step}">
          <div class="ag-step-head">
            <span class="ag-step-num">🧠 第${step}步 · 思考中</span>
            <span class="ag-stream-dot"></span>
          </div>
          <div class="ag-step-body streaming-body">${text ? this._renderMarkdown(text) : '<span class="ag-cursor">▊</span>'}</div>
        </div>`;
      this._append(html);
      el = document.getElementById(id);
    } else {
      // 更新内容
      const body = el.querySelector('.streaming-body');
      if (body) {
        body.innerHTML = this._renderMarkdown(text) + '<span class="ag-cursor">▊</span>';
      }
    }
    this._scroll();
  }

  /** 流式思考完成：去掉闪烁，转为普通卡 */
  finalizeStreamingThought(step) {
    const el = document.getElementById(`ag-stream-${step}`);
    if (!el) return;
    el.classList.remove('ag-step-streaming');
    const dot = el.querySelector('.ag-stream-dot');
    if (dot) dot.remove();
    const cursor = el.querySelector('.ag-cursor');
    if (cursor) cursor.remove();
    const head = el.querySelector('.ag-step-num');
    if (head) head.textContent = `🧠 第${step}步 · 思考`;
  }

  /** 工具调用 */
  addToolCall(step, tool, input) {
    this._append(`
      <div class="ag-step ag-step-act">
        <div class="ag-step-head">
          <span class="ag-step-num">🔧 第${step}步 · 调用工具</span>
          <span class="ag-tool-name">${this._esc(tool)}</span>
        </div>
        <div class="ag-step-body ag-tool-input">
          <pre>${this._esc(JSON.stringify(input, null, 2))}</pre>
        </div>
      </div>
    `);
  }

  /** 工具结果 */
  addObservation(step, result) {
    const text = result.error
      ? `<span style="color:var(--pink)">❌ ${this._esc(result.error)}</span>`
      : typeof result.result === 'string'
        ? this._esc(result.result.slice(0, 300))
        : this._esc(JSON.stringify(result.result, null, 2));

    this._append(`
      <div class="ag-step ag-step-observe">
        <div class="ag-step-head">
          <span class="ag-step-num">👁️ 第${step}步 · 观察结果</span>
        </div>
        <div class="ag-step-body">${text}</div>
      </div>
    `);
  }

  /** 最终答案 */
  addFinalAnswer(text, metadata = {}) {
    // Token 统计行
    let statsHtml = '';
    if (metadata.usage && metadata.usage.total_tokens > 0) {
      const u = metadata.usage;
      const costStr = metadata.cost ? this._formatCost(u, metadata.cost) : '';
      statsHtml = `
        <div class="ag-token-summary">
          <span>📊 Token: ${u.total_tokens}（提示${u.prompt_tokens} + 生成${u.completion_tokens}）</span>
          <span>· 步数: ${metadata.steps || '?'}</span>
          ${costStr ? `<span>· ${costStr}</span>` : ''}
        </div>`;
    }

    this._append(`
      <div class="ag-final">
        <div class="ag-final-head">
          ✅ 分析完成${metadata.forced ? '（达到最大步数，强制总结）' : ''}
          <span class="ag-final-steps">共 ${metadata.steps || '?'} 步</span>
        </div>
        ${statsHtml}
        <div class="ag-final-body">${this._renderMarkdown(text)}</div>
        <button class="ag-save-btn">💾 保存到笔记</button>
      </div>
    `);

    // 绑定保存按钮
    const btn = this.container.querySelector('.ag-save-btn:last-child');
    if (btn) {
      btn.addEventListener('click', () => {
        if (this._onSave) this._onSave(text);
      });
    }
  }

  /** 错误 */
  addError(text) {
    this._append(`
      <div class="ag-step ag-step-error">
        <div class="ag-step-head">❌ 出错了</div>
        <div class="ag-step-body">${this._esc(text)}</div>
      </div>
    `);
  }

  /** 保存回调 */
  onSave(cb) { this._onSave = cb; }

  /** Markdown 渲染：表格 / 引用 / 代码块 / 行内代码 / 链接 / 列表 / 标题 */
  _renderMarkdown(text) {
    const src = String(text ?? '');
    const lines = src.split('\n');
    const html = [];
    let inCode = false;
    let codeBuf = [];
    let listType = null;   // 'ul' | 'ol' | null
    let tableBuf = [];

    const flushList = () => {
      if (listType) { html.push(`</${listType}>`); listType = null; }
    };
    const flushTable = () => {
      if (tableBuf.length >= 2) {
        const headers = this._splitTableRow(tableBuf[0]);
        let t = '<table><thead><tr>';
        headers.forEach(c => { t += `<th>${this._inline(c)}</th>`; });
        t += '</tr></thead><tbody>';
        for (let i = 2; i < tableBuf.length; i++) { // 第 1 行是分隔行 |---|
          const cells = this._splitTableRow(tableBuf[i]);
          t += '<tr>';
          headers.forEach((_, j) => { t += `<td>${this._inline(cells[j] || '')}</td>`; });
          t += '</tr>';
        }
        t += '</tbody></table>';
        html.push(t);
      } else if (tableBuf.length) {
        html.push(`<p>${this._inline(tableBuf.join(' '))}</p>`);
      }
      tableBuf = [];
    };

    for (const line of lines) {
      const trimmed = line.trim();

      // 代码块边界
      if (/^```/.test(trimmed)) {
        if (!inCode) {
          flushList(); flushTable();
          inCode = true; codeBuf = [];
        } else {
          html.push(`<pre><code>${this._esc(codeBuf.join('\n'))}</code></pre>`);
          inCode = false; codeBuf = [];
        }
        continue;
      }
      if (inCode) { codeBuf.push(line); continue; }

      // 表格行（连续 |...| 行聚合成表格）
      if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 1) {
        flushList();
        tableBuf.push(trimmed);
        continue;
      }
      if (tableBuf.length) flushTable();

      // 空行
      if (!trimmed) { flushList(); continue; }

      // 引用
      if (/^>/.test(trimmed)) {
        flushList(); flushTable();
        html.push(`<blockquote>${this._inline(trimmed.replace(/^>\s?/, ''))}</blockquote>`);
        continue;
      }

      // 标题（## → h3、### → h4，与原版视觉一致）
      const h = trimmed.match(/^(#{1,4})\s+(.+)$/);
      if (h) {
        flushList(); flushTable();
        const level = Math.min(h[1].length + 1, 6);
        html.push(`<h${level}>${this._inline(h[2])}</h${level}>`);
        continue;
      }

      // 分隔线
      if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
        flushList(); flushTable();
        html.push('<hr>');
        continue;
      }

      // 无序列表
      const ul = trimmed.match(/^[-*]\s+(.+)$/);
      if (ul) {
        flushTable();
        if (listType !== 'ul') { flushList(); html.push('<ul>'); listType = 'ul'; }
        html.push(`<li>${this._inline(ul[1])}</li>`);
        continue;
      }

      // 有序列表
      const ol = trimmed.match(/^\d+[.)]\s+(.+)$/);
      if (ol) {
        flushTable();
        if (listType !== 'ol') { flushList(); html.push('<ol>'); listType = 'ol'; }
        html.push(`<li>${this._inline(ol[1])}</li>`);
        continue;
      }

      // 普通段落
      flushList(); flushTable();
      html.push(`<p>${this._inline(trimmed)}</p>`);
    }

    if (inCode) html.push(`<pre><code>${this._esc(codeBuf.join('\n'))}</code></pre>`);
    flushTable();
    flushList();

    return html.join('\n');
  }

  /** 拆解表格行 `| a | b |` → [a, b] */
  _splitTableRow(line) {
    return line.replace(/^\|/, '').replace(/\|$/, '').split('|').map(s => s.trim());
  }

  /** 行内 Markdown：粗体 / 斜体 / 行内代码 / 链接 */
  _inline(text) {
    let s = this._esc(text);
    s = s.replace(/`([^`]+)`/g, '<code>$1</code>');
    s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*\w])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }

  _append(html) {
    if (!this.container) return;
    this.container.insertAdjacentHTML('beforeend', html);
    this._scroll();
  }

  _scroll() {
    if (this._autoScroll && this.container) {
      // 滚动页面让最新内容可见（容器不再内部滚动）
      const lastChild = this.container.lastElementChild;
      if (lastChild) {
        lastChild.scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
    }
  }

  _esc(s) {
    const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(s ?? '').replace(/[&<>"']/g, c => map[c]);
  }
}

export { AgentChatUI };
