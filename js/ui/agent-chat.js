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

  /** 简单的 Markdown 渲染 */
  _renderMarkdown(text) {
    let html = this._esc(text);
    // 标题
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    // 无序列表
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    // 有序列表
    html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
    // 粗体
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    // 换行：所有换行 → <br>，连续多个 → 段落间距
    html = html.replace(/\n/g, '<br>');
    html = html.replace(/(<br>\s*){3,}/g, '<br><br>');
    return html;
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
