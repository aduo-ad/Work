/* ==========================================
   阿duo的秋招旅程 — 应用逻辑
   ========================================== */

// ==================== 常量 ====================
const STAGES = [
  { key: 'resume',   label: '简历评估中', pct: 0,   color: '#9B72CF', bg: '#F0E8FF', active: false },
  { key: 'written',  label: '笔试',       pct: 20,  color: '#00B4D8', bg: '#E0F7FA', active: true  },
  { key: 'one',      label: '一面',       pct: 40,  color: '#FF6B9D', bg: '#FFE8F0', active: true  },
  { key: 'two',      label: '二面',       pct: 60,  color: '#FF8C42', bg: '#FFF0E3', active: true  },
  { key: 'hr',       label: 'HR 面',      pct: 80,  color: '#F0C420', bg: '#FFF8E0', active: true  },
  { key: 'oc',       label: 'OC / Offer', pct: 100, color: '#52C41A', bg: '#E8F8E0', active: true  },
  { key: 'rejected', label: '已淘汰',     pct: -1,  color: '#999999', bg: '#EEEEEE', active: false },
];

const STAGE_MAP = Object.fromEntries(STAGES.map(s => [s.key, s]));
const STORAGE_KEY = 'qiuzhao_v2';
const KANBAN_STAGES = STAGES.filter(s => s.active);
const ALL_STAGES = STAGES; // includes rejected for the picker

// ==================== DOM 工具 ====================
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

// ==================== 状态 ====================
let apps          = [];
let editingId     = null;
let pendingDeleteId = null;
let currentSort   = 'default';
let searchQuery   = '';
let dragId        = null;

// ==================== 工具函数 ====================
const escapeHTML = (s) => {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(s ?? '').replace(/[&<>"']/g, c => map[c]);
};

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

const stageOf = (key) => STAGE_MAP[key] ?? STAGES[0];

// ==================== 数据持久层 ====================
function loadApps() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    // 兼容旧数据
    return data.map(a => {
      if (a.stage === 'apply') a.stage = 'resume';
      return a;
    });
  } catch (e) {
    console.warn('数据加载失败:', e);
    return [];
  }
}

function saveApps() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(apps));
    return true;
  } catch (e) {
    console.error('数据保存失败:', e);
    showToast('⚠️ 保存失败：存储空间不足，请导出数据备份');
    return false;
  }
}

// ==================== 数据导出 / 导入 ====================
function exportData() {
  try {
    const blob = new Blob([JSON.stringify(apps, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `秋招数据备份_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('✅ 数据已导出');
  } catch (e) {
    showToast('❌ 导出失败');
  }
}

function importData(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      if (!Array.isArray(data)) throw new Error('格式错误');
      // 合并还是替换？这里用替换策略
      apps = data.map(a => {
        if (!a.id) a.id = uid();
        if (a.stage === 'apply') a.stage = 'resume';
        // 确保必要字段
        a.company  = a.company  || '未填写';
        a.position = a.position || '未填写';
        a.stage    = a.stage    || 'resume';
        a.date     = a.date     || '';
        a.note     = a.note     || '';
        a.salary   = a.salary   || '';
        a.location = a.location || '';
        return a;
      });
      saveApps();
      renderAll();
      showToast(`✅ 已导入 ${apps.length} 条记录`);
    } catch (e) {
      showToast('❌ 文件格式不正确');
    }
  };
  reader.readAsText(file);
}

// ==================== 搜索 & 排序 ====================
function getFilteredAndSorted() {
  let result = [...apps];

  // 搜索过滤
  if (searchQuery.trim()) {
    const q = searchQuery.trim().toLowerCase();
    result = result.filter(a =>
      a.company.toLowerCase().includes(q) ||
      a.position.toLowerCase().includes(q) ||
      (a.note && a.note.toLowerCase().includes(q))
    );
  }

  // 排序
  switch (currentSort) {
    case 'name':
      result.sort((a, b) => a.company.localeCompare(b.company, 'zh'));
      break;
    case 'date-desc':
      result.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      break;
    case 'stage':
      result.sort((a, b) => {
        const ia = STAGES.findIndex(s => s.key === a.stage);
        const ib = STAGES.findIndex(s => s.key === b.stage);
        return ib - ia; // 进度高的在前
      });
      break;
    default: // 保持原序（按添加时间倒序）
      break;
  }

  return result;
}

// ==================== Toast ====================
function showToast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timeout);
  t._timeout = setTimeout(() => t.classList.remove('show'), 2000);
}

// ==================== 统计渲染 ====================
function renderStats() {
  const total  = apps.length;
  const offer  = apps.filter(a => a.stage === 'oc').length;
  const active = apps.filter(a => STAGE_MAP[a.stage]?.active).length;

  $('#st-total').textContent  = total;
  $('#st-active').textContent = active;
  $('#st-offer').textContent  = offer;
  $('#nav-total').textContent  = total;
  $('#nav-active').textContent = active;
  $('#nav-offer').textContent  = offer;
}

// ==================== 公司列表渲染 ====================
function renderCompanies() {
  const container = $('#companies-list');
  const data = getFilteredAndSorted();
  const view = $('#view-companies');

  // 更新搜索结果提示
  let hint = '';
  if (searchQuery.trim() && data.length !== apps.length) {
    hint = `<div class="result-count">找到 ${data.length} / ${apps.length} 条记录</div>`;
  }

  if (!apps.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="big">🎯</div>
        <div class="title">开始你的秋招之旅</div>
        <div class="sub">点击右下角「＋」添加第一家公司</div>
        <button class="action-btn" id="empty-add-btn">＋ 添加公司</button>
      </div>`;
    $('#empty-add-btn', view)?.addEventListener('click', () => openAdd());
    if (hint) container.insertAdjacentHTML('afterbegin', hint);
    return;
  }

  if (!data.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="big">🔍</div>
        <div class="title">没有匹配的记录</div>
        <div class="sub">试试其他关键词</div>
      </div>`;
    if (hint) container.insertAdjacentHTML('afterbegin', hint);
    return;
  }

  const itemsHTML = data.map(a => {
    const st = stageOf(a.stage);
    const rejectedClass = a.stage === 'rejected' ? ' is-rejected' : '';
    return `
      <div class="company-card${rejectedClass}">
        <div class="card-top">
          <div class="info">
            <div class="co">${escapeHTML(a.company)}</div>
            <div class="pos">${escapeHTML(a.position)}</div>
          </div>
          <div class="card-actions">
            <button class="icon-btn btn-edit" data-id="${a.id}" title="编辑">✏️</button>
            <button class="icon-btn del btn-del" data-id="${a.id}" title="删除">🗑️</button>
          </div>
        </div>
        <span class="stage-tag" style="background:${st.bg};color:${st.color}">
          <span class="dot" style="background:${st.color}"></span>${st.label}
        </span>
        ${a.stage === 'rejected' ? '' : `
        <div class="progress-wrap">
          <div class="progress-track">
            <div class="progress-fill" style="width:${st.pct}%;background:${st.color}"></div>
          </div>
          <div class="progress-meta">
            <span>${st.label}</span><span>${st.pct}%</span>
          </div>
        </div>`}
      </div>`;
  }).join('');

  container.innerHTML = hint + itemsHTML;
  bindCardButtons(container);
}

// ==================== 看板渲染 ====================
function renderKanban() {
  const container = $('#kanban');

  const colsHTML = KANBAN_STAGES.map(s => {
    const items = apps.filter(a => a.stage === s.key);
    const cardsHTML = items.length
      ? items.map(a => `
          <div class="k-card btn-kcard" draggable="true" data-id="${a.id}">
            <div style="flex:1;min-width:0">
              <div class="kn">${escapeHTML(a.company)}</div>
              <div class="kp">${escapeHTML(a.position)}</div>
              ${a.note ? `<div class="knote">📝 ${escapeHTML(a.note)}</div>` : ''}
            </div>
            ${a.date ? `<div class="kd">📅 ${escapeHTML(a.date)}</div>` : ''}
          </div>`).join('')
      : `<div class="k-empty">拖拽卡片到这里 或 <a href="#" class="kanban-empty-add" data-stage="${s.key}">点击添加</a></div>`;

    return `
      <div class="kanban-col" data-stage="${s.key}">
        <div class="kanban-head">
          <span class="kanban-dot" style="background:${s.color}"></span>
          <span class="t">${s.label}</span>
          <button class="kanban-add" data-stage="${s.key}" title="添加">＋</button>
          <span class="c">${items.length}</span>
        </div>
        <div class="kanban-body">${cardsHTML}</div>
      </div>`;
  }).join('');

  container.innerHTML = colsHTML;
  bindKanbanEvents();
}

// ==================== Offer 渲染 ====================
function renderOffers() {
  const container = $('#offers-list');
  const offers = apps.filter(a => a.stage === 'oc');

  if (!offers.length) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="big">🎁</div>
        <div class="title">还没有 Offer</div>
        <div class="sub">将公司进度设为「OC / Offer」后会自动出现在这里</div>
      </div>`;
    return;
  }

  container.innerHTML = offers.map(a => {
    const details = [];
    if (a.salary)   details.push(`<span class="detail-item">💰 ${escapeHTML(a.salary)}</span>`);
    if (a.location) details.push(`<span class="detail-item">📍 ${escapeHTML(a.location)}</span>`);
    if (a.date)     details.push(`<span class="detail-item">📅 OC：${escapeHTML(a.date)}</span>`);

    return `
      <div class="offer-card">
        <div class="co">${escapeHTML(a.company)}</div>
        <div class="pos">${escapeHTML(a.position)}</div>
        ${details.length ? `<div class="oc-detail">${details.join('')}</div>` : '<div class="oc-detail">🎉 已拿 Offer！</div>'}
        ${a.note ? `<div class="oc-note">📝 ${escapeHTML(a.note)}</div>` : ''}
        <div class="card-actions" style="margin-top:10px">
          <button class="icon-btn btn-edit" data-id="${a.id}">✏️</button>
          <button class="icon-btn del btn-del" data-id="${a.id}">🗑️</button>
        </div>
      </div>`;
  }).join('');

  bindCardButtons(container);
}

// ==================== 全量渲染 ====================
function renderAll() {
  renderStats();
  renderCompanies();
  renderKanban();
  renderOffers();
}

// ==================== 事件绑定 ====================
function bindCardButtons(container) {
  container.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => openEdit(btn.dataset.id));
  });
  container.querySelectorAll('.btn-del').forEach(btn => {
    btn.addEventListener('click', () => askDelete(btn.dataset.id));
  });
}

function bindKanbanEvents() {
  // 看板卡片点击 → 编辑
  $$('.btn-kcard').forEach(card => {
    card.addEventListener('click', () => openEdit(card.dataset.id));
  });

  // 看板列添加按钮
  $$('.kanban-add').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openAdd(btn.dataset.stage);
    });
  });

  // 看板空状态添加链接
  $$('.kanban-empty-add').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openAdd(link.dataset.stage);
    });
  });

  // --- 拖拽事件 ---
  const cards = $$('.k-card');
  const cols  = $$('.kanban-body');

  cards.forEach(card => {
    card.addEventListener('dragstart', handleDragStart);
    card.addEventListener('dragend',   handleDragEnd);
  });

  cols.forEach(col => {
    col.addEventListener('dragover',  handleDragOver);
    col.addEventListener('dragleave', handleDragLeave);
    col.addEventListener('drop',      handleDrop);
  });
}

// ==================== 拖拽处理 ====================
function handleDragStart(e) {
  dragId = this.dataset.id;
  this.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
}

function handleDragEnd() {
  this.classList.remove('dragging');
  dragId = null;
  $$('.kanban-col').forEach(c => c.classList.remove('drag-over'));
}

function handleDragOver(e) {
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
  this.closest('.kanban-col').classList.add('drag-over');
}

function handleDragLeave(e) {
  this.closest('.kanban-col').classList.remove('drag-over');
}

function handleDrop(e) {
  e.preventDefault();
  this.closest('.kanban-col').classList.remove('drag-over');

  const newStage = this.closest('.kanban-col').dataset.stage;
  if (!newStage || !dragId) return;

  const app = apps.find(a => a.id === dragId);
  if (!app) return;

  if (app.stage !== newStage) {
    app.stage = newStage;
    saveApps();
    renderAll();
    showToast(`已移至「${stageOf(newStage).label}」`);
  }
  dragId = null;
}

// ==================== 视图切换 ====================
function switchView(view) {
  $$('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.view === view));
  $$('.view').forEach(s => s.classList.remove('active'));
  $(`#view-${view}`).classList.add('active');

  const addBtn = $('#add-btn');
  const searchWrap = $('.search-wrap');
  const sortSelect = $('#sort-select');
  addBtn.classList.toggle('hidden', view === 'progress' || view === 'research');
  // 研究院视图：隐藏搜索和排序，保留设置按钮
  const isResearch = view === 'research';
  if (searchWrap) searchWrap.style.display = isResearch ? 'none' : '';
  if (sortSelect) sortSelect.style.display = isResearch ? 'none' : '';

  // 切换视图时重新渲染以保持数据最新
  if (view === 'companies') renderCompanies();
  if (view === 'progress')  renderKanban();
  if (view === 'offers')    renderOffers();
  if (view === 'research')  renderResearch();
}

$$('.nav-item').forEach(n => {
  n.addEventListener('click', () => switchView(n.dataset.view));
});

// ==================== 搜索 & 排序 ====================
$('#search-input').addEventListener('input', (e) => {
  searchQuery = e.target.value;
  renderCompanies();
});

$('#sort-select').addEventListener('change', (e) => {
  currentSort = e.target.value;
  renderCompanies();
});

// ==================== 阶段选择器 ====================
function buildStagePicker() {
  const box = $('#stage-picker');
  box.innerHTML = ALL_STAGES.map(s =>
    `<div class="stage-opt" data-key="${s.key}" style="color:${s.color}">${s.label}</div>`
  ).join('');

  $$('.stage-opt', box).forEach(el => {
    el.addEventListener('click', () => {
      pickStage(el.dataset.key);
    });
  });
}

function pickStage(key) {
  $$('.stage-opt').forEach(el => el.classList.toggle('on', el.dataset.key === key));
  // 切换 Offer 相关字段的显隐
  const offerFields = $('#offer-fields');
  if (offerFields) {
    offerFields.classList.toggle('visible', key === 'oc');
  }
}

function getPickedStage() {
  const on = $('.stage-opt.on');
  return on ? on.dataset.key : 'resume';
}

// ==================== 弹窗逻辑 ====================
function openAdd(initialStage) {
  editingId = null;
  $('#modal-title').textContent = '添加公司';
  $('#f-company').value    = '';
  $('#f-position').value   = '';
  pickStage(initialStage || 'resume');
  $('#f-date').value       = '';
  $('#f-note').value       = '';
  $('#f-salary').value     = '';
  $('#f-location').value   = '';
  $('#err-company').classList.remove('show');
  $('#overlay').classList.add('show');
  $('#f-company').focus();
}

function openEdit(id) {
  const a = apps.find(x => x.id === id);
  if (!a) return;

  editingId = id;
  $('#modal-title').textContent = '编辑公司';
  $('#f-company').value    = a.company;
  $('#f-position').value   = a.position;
  pickStage(a.stage);
  $('#f-date').value       = a.date || '';
  $('#f-note').value       = a.note || '';
  $('#f-salary').value     = a.salary || '';
  $('#f-location').value   = a.location || '';
  $('#err-company').classList.remove('show');
  $('#overlay').classList.add('show');
}

function closeModal() {
  $('#overlay').classList.remove('show');
}

function saveModal() {
  const company = $('#f-company').value.trim();
  if (!company) {
    $('#err-company').classList.add('show');
    return;
  }
  $('#err-company').classList.remove('show');

  const stage = getPickedStage();
  const data = {
    company,
    position: $('#f-position').value.trim() || '未填写',
    stage,
    date:     $('#f-date').value,
    note:     $('#f-note').value.trim(),
    salary:   $('#f-salary').value.trim(),
    location: $('#f-location').value.trim(),
  };

  if (editingId) {
    const a = apps.find(x => x.id === editingId);
    if (a) {
      Object.assign(a, data);
      showToast('✅ 已更新');
    }
  } else {
    apps.unshift({ id: uid(), ...data });
    showToast('✅ 已添加');
  }

  saveApps();
  closeModal();
  renderAll();
}

// 点击遮罩关闭
$('#overlay').addEventListener('click', (e) => {
  if (e.target === $('#overlay')) closeModal();
});

// ==================== 删除确认 ====================
function askDelete(id) {
  pendingDeleteId = id;
  const a = apps.find(x => x.id === id);
  $('#confirm-msg').textContent = `确定删除「${a ? a.company : ''}」吗？此操作不可恢复。`;
  $('#confirm-box').classList.add('show');
}

$('#btn-confirm-cancel').addEventListener('click', () => {
  $('#confirm-box').classList.remove('show');
  pendingDeleteId = null;
});

$('#btn-confirm-ok').addEventListener('click', () => {
  if (pendingDeleteId) {
    apps = apps.filter(x => x.id !== pendingDeleteId);
    saveApps();
    renderAll();
    showToast('🗑️ 已删除');
  }
  $('#confirm-box').classList.remove('show');
  pendingDeleteId = null;
});

// ==================== 主题切换 ====================
function initTheme() {
  const saved = localStorage.getItem('qiuzhao_theme');
  if (saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
    $('#theme-icon').textContent = '☀️';
  }
}

function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  if (isDark) {
    document.documentElement.removeAttribute('data-theme');
    $('#theme-icon').textContent = '🌙';
    localStorage.setItem('qiuzhao_theme', 'light');
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    $('#theme-icon').textContent = '☀️';
    localStorage.setItem('qiuzhao_theme', 'dark');
  }
}

$('#theme-toggle').addEventListener('click', toggleTheme);

// ==================== 设置面板 ====================
function openSettings() {
  $('#settings-panel').classList.add('show');
}

function closeSettings() {
  $('#settings-panel').classList.remove('show');
}

$('#settings-btn').addEventListener('click', openSettings);
$('#settings-panel').addEventListener('click', (e) => {
  if (e.target === $('#settings-panel')) closeSettings();
});
$('#btn-settings-close').addEventListener('click', closeSettings);
$('#btn-export').addEventListener('click', () => {
  exportData();
  closeSettings();
});

// 导入文件选择
$('#btn-import').addEventListener('click', () => {
  $('#import-file').click();
});
$('#import-file').addEventListener('change', (e) => {
  if (e.target.files[0]) {
    importData(e.target.files[0]);
    e.target.value = '';
    closeSettings();
  }
});

// ==================== 空状态快捷添加 ====================
// 通过事件委托，因为空状态按钮可能动态生成
$('#view-companies').addEventListener('click', (e) => {
  if (e.target.matches('#empty-add-btn') || e.target.closest('#empty-add-btn')) {
    openAdd();
  }
});

// ==================== 键盘快捷键 ====================
document.addEventListener('keydown', (e) => {
  // Esc 关闭弹窗
  if (e.key === 'Escape') {
    if ($('#overlay').classList.contains('show')) closeModal();
    if ($('#confirm-box').classList.contains('show')) {
      $('#confirm-box').classList.remove('show');
      pendingDeleteId = null;
    }
    if ($('#settings-panel').classList.contains('show')) closeSettings();
  }
  // Ctrl/Cmd + N 新建
  if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
    e.preventDefault();
    openAdd();
  }
  // Ctrl/Cmd + F 搜索
  if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
    e.preventDefault();
    $('#search-input').focus();
  }
});

// ==================== 研究院 ====================
const RESEARCH_KEY = 'qiuzhao_research_v1';
const API_KEY_STORAGE = 'qiuzhao_ai_key';
const AI_PROVIDER_STORAGE = 'qiuzhao_ai_provider';

let researchNotes = [];
let aiApiKey = '';
let aiProvider = 'deepseek';
let currentAiResult = null;

// Agent 系统桥接 API
window.__getAiProvider = () => aiProvider;
window.__getAiApiKey = () => aiApiKey;
window.__showToast = (msg) => showToast(msg);
window.__openSettings = () => openSettings();
window.__addResearchNote = (company, content, source) => {
  researchNotes.unshift({
    id: uid(),
    company,
    content,
    source: source || 'Agent 分析',
    date: new Date().toISOString().slice(0, 10)
  });
  saveResearchNotes();
  renderResearch();
};

// AI 提供商配置
const AI_PROVIDERS = {
  deepseek: {
    name: 'DeepSeek',
    icon: '🚀',
    hint: '国内直连，免 VPN',
    getKeyUrl: 'https://platform.deepseek.com/api_keys',
    call: async (key, prompt) => {
      const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model: 'deepseek-chat', messages: [{ role: 'user', content: prompt }], temperature: 0.7, max_tokens: 1024 })
      });
      if (!resp.ok) { const err = await resp.json().catch(()=>({})); throw new Error(err.error?.message || `请求失败(${resp.status})`); }
      const data = await resp.json();
      return data.choices?.[0]?.message?.content || '（未获取到结果）';
    }
  },
  gemini: {
    name: 'Gemini',
    icon: '🤖',
    hint: '需 VPN，信息更新',
    getKeyUrl: 'https://aistudio.google.com/apikey',
    call: async (key, prompt) => {
      const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${key}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.7, maxOutputTokens: 1024 } })
      });
      if (!resp.ok) { const err = await resp.json().catch(()=>({})); throw new Error(err.error?.message || `请求失败(${resp.status})`); }
      const data = await resp.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || '（未获取到结果）';
    }
  }
}; // 临时存储 AI 结果，供保存

// 搜索源配置
const SEARCH_SOURCES = {
  niuke: {
    label: '牛客网',
    icon: '🐮',
    url: (q) => `https://www.nowcoder.com/search?type=post&query=${encodeURIComponent(q + ' 秋招 面经')}`
  },
  maimai: {
    label: '脉脉',
    icon: '💬',
    url: (q) => `https://maimai.cn/search?query=${encodeURIComponent(q + ' 薪资')}`
  },
  zhihu: {
    label: '知乎',
    icon: '💡',
    url: (q) => `https://www.zhihu.com/search?type=content&q=${encodeURIComponent(q + ' 秋招 待遇')}`
  },
  kanzhun: {
    label: '看准网',
    icon: '👀',
    url: (q) => `https://www.kanzhun.com/search/?q=${encodeURIComponent(q)}`
  },
  xiaohongshu: {
    label: '小红书',
    icon: '📕',
    url: (q) => `https://www.xiaohongshu.com/search_result?keyword=${encodeURIComponent(q + ' 秋招')}`
  }
};

function loadResearchNotes() {
  try {
    const raw = localStorage.getItem(RESEARCH_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveResearchNotes() {
  try {
    localStorage.setItem(RESEARCH_KEY, JSON.stringify(researchNotes));
  } catch (e) {
    showToast('⚠️ 笔记保存失败');
  }
}

function loadApiKey() {
  try { return localStorage.getItem(API_KEY_STORAGE) || ''; }
  catch (e) { return ''; }
}

function saveApiKey(key) {
  try { localStorage.setItem(API_KEY_STORAGE, key.trim()); return true; }
  catch (e) { return false; }
}

function loadAiProvider() {
  try { return localStorage.getItem(AI_PROVIDER_STORAGE) || 'deepseek'; }
  catch (e) { return 'deepseek'; }
}

function saveAiProvider(provider) {
  try { localStorage.setItem(AI_PROVIDER_STORAGE, provider); return true; }
  catch (e) { return false; }
}

// 多源搜索 — 在新标签页打开
function searchCompany(sources) {
  const query = $('#research-input').value.trim();
  if (!query) { showToast('请先输入公司名称'); return; }

  sources.forEach(srcKey => {
    const src = SEARCH_SOURCES[srcKey];
    if (src) window.open(src.url(query), '_blank', 'noopener');
  });

  if (sources.length === 1) {
    showToast(`已打开 ${SEARCH_SOURCES[sources[0]].label}`);
  } else {
    showToast(`已打开 ${sources.length} 个来源`);
  }
}

// AI 分析入口
async function aiAnalyze() {
  const query = $('#research-input').value.trim();
  if (!query) { showToast('请先输入公司名称'); return; }
  if (!aiApiKey) {
    showToast('⚠️ 请先在设置中配置 AI API Key');
    openSettings();
    return;
  }

  const provider = AI_PROVIDERS[aiProvider];
  if (!provider) { showToast('❌ AI 引擎配置错误'); return; }

  const aiSection = $('#ai-section');
  const aiContent = $('#ai-content');
  const aiResultCard = $('#ai-result-card');
  const saveBtn = aiResultCard?.querySelector('.btn-ai-save');

  aiSection.style.display = 'block';
  aiContent.className = 'ai-content loading';
  aiContent.innerHTML = `<span class="ai-spinner"></span>${provider.icon} 正在用 ${provider.name} 分析…`;
  if (saveBtn) saveBtn.style.display = 'none';

  const prompt = `你是一位资深的校招求职顾问。请帮我调研这家公司，直接给出以下结构的分析（每条1-3句话，力求信息准确）：

🏢 **公司**：${query}

---
💰 **薪资待遇**
- 技术岗校招薪资范围（base + 年终 + 股票）
- 和同行相比处于什么水平

📝 **面试流程**
- 技术面几轮？每轮侧重什么？
- 有没有笔试？难度如何？

💬 **员工评价**
- 工作强度和加班情况
- 新人培养和成长机会
- 团队氛围

🎯 **求职建议**
- 什么时间投递比较好
- 面试中需要注意的点
- 适合什么样的人去

⚠️ 如果信息不确定，请标注「据网络信息」。控制在500字以内。`;

  try {
    const text = await provider.call(aiApiKey, prompt);

    currentAiResult = {
      company: query,
      content: text,
      date: new Date().toISOString().slice(0, 10),
      source: `${provider.name} AI`
    };

    aiContent.className = 'ai-content';
    aiContent.textContent = text;
    if (saveBtn) saveBtn.style.display = '';

  } catch (e) {
    aiContent.className = 'ai-content';
    const tip = aiProvider === 'gemini' ? '<br><small>Gemini 在国内需要 VPN，也可以试试 DeepSeek</small>' : '<br><small>请检查 API Key 是否正确</small>';
    aiContent.innerHTML = `<div class="ai-error">❌ ${escapeHTML(e.message)}${tip}</div>`;
    if (saveBtn) saveBtn.style.display = 'none';
    currentAiResult = null;
  }
}

// 保存 AI 结果到笔记
function saveAiResult() {
  if (!currentAiResult) return;
  researchNotes.unshift({
    id: uid(),
    company: currentAiResult.company,
    content: currentAiResult.content,
    source: currentAiResult.source,
    date: currentAiResult.date
  });
  saveResearchNotes();
  renderResearch();
  showToast('💾 已保存到研究笔记');
  currentAiResult = null;
}

// 删除笔记
function deleteResearchNote(id) {
  researchNotes = researchNotes.filter(n => n.id !== id);
  saveResearchNotes();
  renderResearch();
  showToast('🗑️ 笔记已删除');
}

// 渲染研究院
function renderResearch() {
  const listContainer = $('#research-notes-list');
  const emptyState = $('#research-empty');

  if (!researchNotes.length) {
    listContainer.innerHTML = '';
    emptyState.style.display = '';
  } else {
    emptyState.style.display = 'none';
    listContainer.innerHTML = researchNotes.map(n => `
      <div class="note-card">
        <div class="note-header">
          <div>
            <div class="note-co">🏢 ${escapeHTML(n.company)}</div>
            <div class="note-date">${escapeHTML(n.date)}</div>
          </div>
          <button class="icon-btn del btn-del-note" data-id="${n.id}" title="删除">🗑️</button>
        </div>
        <div class="note-body">${escapeHTML(n.content)}</div>
        ${n.source ? `<div class="note-source">🤖 来源：${escapeHTML(n.source)}</div>` : ''}
      </div>
    `).join('');

    listContainer.querySelectorAll('.btn-del-note').forEach(btn => {
      btn.addEventListener('click', () => deleteResearchNote(btn.dataset.id));
    });
  }
}

// ==================== 入口 ====================
function init() {
  apps = loadApps();
  researchNotes = loadResearchNotes();
  aiApiKey = loadApiKey();
  aiProvider = loadAiProvider();
  buildStagePicker();
  initTheme();
  renderAll();
  renderResearch();
  updateApiKeyUI();

  // 绑定按钮
  $('#add-btn').addEventListener('click', () => openAdd());
  $('#btn-cancel').addEventListener('click', closeModal);
  $('#btn-save').addEventListener('click', saveModal);

  // ---- 研究院事件绑定 ----
  // 快捷来源按钮
  $$('#source-chips .source-chip').forEach(chip => {
    chip.addEventListener('click', () => searchCompany([chip.dataset.source]));
  });

  // AI 分析按钮（兼容旧版）
  const aiBtn = $('#btn-ai-analyze');
  if (aiBtn) aiBtn.addEventListener('click', aiAnalyze);

  // 快捷来源按钮 — 点击时先填入搜索词
  $$('#source-chips .source-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const input = $('#research-input');
      if (input && !input.value.trim()) {
        input.focus();
        return;
      }
      searchCompany([chip.dataset.source]);
    });
  });

  // 保存 AI 结果
  const saveBtn = $('#ai-result-card')?.querySelector('.btn-ai-save');
  if (saveBtn) saveBtn.addEventListener('click', saveAiResult);

  // 回车触发 AI 分析
  $('#research-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') aiAnalyze();
  });

  // AI 提供商切换
  $('#ai-provider-select').addEventListener('change', (e) => {
    aiProvider = e.target.value;
    saveAiProvider(aiProvider);
    updateApiKeyUI();
  });

  // API Key 保存
  updateApiKeyUI();
  $('#btn-save-apikey').addEventListener('click', () => {
    const key = $('#f-apikey').value.trim();
    if (key) {
      saveApiKey(key);
      aiApiKey = key;
      updateApiKeyUI();
      showToast('✅ API Key 已保存');
      $('#f-apikey').value = '';
    }
  });
}

function updateApiKeyUI() {
  const status = $('#api-key-status');
  const provider = AI_PROVIDERS[aiProvider];
  const hintEl = $('#apikey-hint');
  if (aiApiKey) {
    status.textContent = `${provider.icon} 已设置 ✅`;
    status.className = 'api-key-status set';
  } else {
    status.textContent = '未设置';
    status.className = 'api-key-status unset';
  }
  if (hintEl) {
    hintEl.innerHTML = `免费获取：<a href="${provider.getKeyUrl}" target="_blank" style="color:var(--blue)">${provider.name} 后台</a> → 创建 API Key → 粘贴到这里。仅存储在本地浏览器。${provider.hint}`;
  }
  // 同步下拉框
  const sel = $('#ai-provider-select');
  if (sel && sel.value !== aiProvider) sel.value = aiProvider;
}

// 启动
document.addEventListener('DOMContentLoaded', init);
