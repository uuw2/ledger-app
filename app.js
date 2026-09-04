/* ============================================================
   简洁记账 - 核心逻辑
   数据全部存储在 localStorage，100% 本地离线
   ============================================================ */

// ============ 存储层封装 ============
const Store = {
  KEY: 'ledger_app_data_v1',
  get() {
    try {
      const raw = localStorage.getItem(this.KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { console.error('读取数据失败', e); }
    return null;
  },
  set(data) {
    localStorage.setItem(this.KEY, JSON.stringify(data));
  }
};

// ============ 配色（饼图用） ============
const COLORS = ['#FF6B9D', '#4ECDC4', '#FFD93D', '#6BCB77', '#4D96FF', '#FF8E53', '#C780FA', '#FF6B6B', '#45B7D1', '#96CEB4'];

// ============ 皮肤配色 ============
const SKIN_COLORS = {
  pink:  { name: '淡粉色', main: '#FFB6D1', dark: '#FF8FB8', text: '#5a2a3e' },
  cream: { name: '奶黄色', main: '#FFE9A8', dark: '#FFD76A', text: '#6a5a1e' },
  black: { name: '黑色',   main: '#4A4A4A', dark: '#2C2C2C', text: '#FFFFFF' },
  white: { name: '白色',   main: '#F5F5F5', dark: '#E0E0E0', text: '#333333' },
  mint:  { name: '薄荷绿', main: '#A8E6C4', dark: '#6FCF97', text: '#1e5a3a' },
  sky:   { name: '天蓝色', main: '#A8D8F0', dark: '#5BAFD9', text: '#1e4a6a' }
};

function applySkin() {
  const skin = state.settings.skin || { a: 'pink', b: 'cream' };
  const a = SKIN_COLORS[skin.a] || SKIN_COLORS.pink;
  const b = SKIN_COLORS[skin.b] || SKIN_COLORS.cream;
  const r = document.documentElement.style;
  r.setProperty('--theme-a', a.main);
  r.setProperty('--theme-a-dark', a.dark);
  r.setProperty('--theme-a-text', a.text);
  r.setProperty('--theme-b', b.main);
  r.setProperty('--theme-b-dark', b.dark);
  r.setProperty('--theme-b-text', b.text);
}

// ============ 默认数据 ============
function getDefaultData() {
  const now = new Date();
  const ym = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  const ledgerId = 'L' + Date.now();
  return {
    currentLedgerId: ledgerId,
    currentMonth: ym,
    viewDate: Date.now(),
    settings: {
      reminderTime: '21:00',
      reminderEnabled: false,
      lastReminderDate: '',
      skin: { a: 'pink', b: 'cream' }
    },
    ledgers: [{
      id: ledgerId,
      name: '工资账本',
      icon: '💼',
      createTime: Date.now()
    }],
    // 每个账本的分类设置
    categories: {
      [ledgerId]: [
        { id: 'C1', name: '生活成本', emoji: '🏠', kind: 'expense', dailyLabel: '可支配', subCategories: [
          { id: 'S1', name: '租房' },
          { id: 'S2', name: '吃饭' },
          { id: 'S3', name: '交通' },
          { id: 'S4', name: '通讯' },
          { id: 'S5', name: '其他' }
        ]},
        { id: 'C2', name: '储蓄', emoji: '💰', kind: 'savings', dailyLabel: '需储蓄', subCategories: [
          { id: 'S6', name: '定期存款' },
          { id: 'S7', name: '应急金' }
        ]},
        { id: 'C3', name: '自我投资', emoji: '📚', kind: 'expense', dailyLabel: '可支配', subCategories: [
          { id: 'S8', name: '书籍课程' },
          { id: 'S9', name: '技能培训' }
        ]},
        { id: 'C4', name: '生活质量', emoji: '🎮', kind: 'expense', dailyLabel: '可支配', subCategories: [
          { id: 'S10', name: '奶茶零食' },
          { id: 'S11', name: '恋爱花销' },
          { id: 'S12', name: '旅游' },
          { id: 'S13', name: '娱乐' }
        ]},
        { id: 'C5', name: '负债还款', emoji: '💳', kind: 'debt', dailyLabel: '需还款', subCategories: [
          { id: 'S14', name: '信用卡' },
          { id: 'S15', name: '房贷车贷' }
        ]}
      ]
    },
    // 每个账本 × 每个月的预算
    budgets: {},
    // 所有支出记录
    expenses: []
  };
}

// ============ 全局状态 ============
let state = Store.get() || getDefaultData();

// 数据迁移：为旧数据补全 kind 字段和预算 setDate
function migrateData() {
  let changed = false;
  Object.values(state.categories || {}).forEach(cats => {
    cats.forEach(c => {
      if (!c.kind) {
        if (c.name === '储蓄') c.kind = 'savings';
        else if (c.name === '负债还款') c.kind = 'debt';
        else c.kind = 'expense';
        changed = true;
      }
      if (!c.dailyLabel) {
        c.dailyLabel = c.kind === 'savings' ? '需储蓄' : (c.kind === 'debt' ? '需还款' : '可支配');
        changed = true;
      }
    });
  });
  Object.keys(state.budgets || {}).forEach(k => {
    const b = state.budgets[k];
    if (b.setDate == null) {
      const ym = k.split('_').pop();
      const [y, m] = ym.split('-').map(Number);
      b.setDate = new Date(y, m - 1, 1).getTime();
      changed = true;
    }
  });
  if (!state.viewDate) { state.viewDate = Date.now(); changed = true; }
  if (!state.settings.skin) { state.settings.skin = { a: 'pink', b: 'cream' }; changed = true; }
  if (changed) save();
}
migrateData();
applySkin();

let currentPage = 'home';
let addPageState = {
  amount: '',
  note: '',
  selectedCatId: null,
  selectedSubId: null,
  skipClassify: false,
  date: null // timestamp，null 表示使用 state.viewDate
};

function save() { Store.set(state); }

// ============ 工具函数 ============
function $(id) { return document.getElementById(id); }

function toast(msg, duration = 1500) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), duration);
}

function confirmDialog(title, msg) {
  return new Promise(resolve => {
    $('confirmTitle').textContent = title;
    $('confirmMsg').textContent = msg;
    $('confirmModal').classList.add('show');
    window._confirmCb = resolve;
  });
}
function closeConfirm(result) {
  $('confirmModal').classList.remove('show');
  if (window._confirmCb) { window._confirmCb(result); window._confirmCb = null; }
}

function inputDialog(title, placeholder = '', defaultValue = '', type = 'text') {
  return new Promise(resolve => {
    $('inputTitle').textContent = title;
    const f = $('inputField');
    f.placeholder = placeholder;
    f.value = defaultValue;
    f.type = type;
    $('inputModal').classList.add('show');
    window._inputCb = resolve;
    setTimeout(() => f.focus(), 100);
  });
}
function closeInputModal(result) {
  $('inputModal').classList.remove('show');
  const val = $('inputField').value;
  if (window._inputCb) { window._inputCb(result ? val : null); window._inputCb = null; }
}

function fmtMoney(n) {
  if (n == null || isNaN(n)) n = 0;
  return Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  const dt = new Date(d);
  return dt.getFullYear() + '-' +
    String(dt.getMonth() + 1).padStart(2, '0') + '-' +
    String(dt.getDate()).padStart(2, '0') + ' ' +
    String(dt.getHours()).padStart(2, '0') + ':' +
    String(dt.getMinutes()).padStart(2, '0');
}

function fmtDateShort(d) {
  const dt = new Date(d);
  return String(dt.getMonth() + 1) + '/' + dt.getDate();
}

function uid(prefix = 'X') {
  return prefix + Date.now() + Math.floor(Math.random() * 1000);
}

// 获取当月第一天最后一天（毫秒）
function getMonthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  const start = new Date(y, m - 1, 1).getTime();
  const end = new Date(y, m, 1).getTime();
  return [start, end];
}

// 获取某月天数
function getMonthDays(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(y, m, 0).getDate();
}

// 预算周期计算（单一契约函数，所有页面复用）
// 以预算设置之日为第1日，周期 = 预算所在月的天数
// 返回 { periodDays, daysPassed, remainingDays, setDate }
function getBudgetPeriod(budget, ym) {
  const periodDays = getMonthDays(ym);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let setDate;
  if (budget && budget.setDate != null) {
    setDate = new Date(budget.setDate);
  } else {
    const [y, m] = ym.split('-').map(Number);
    setDate = new Date(y, m - 1, 1);
  }
  const setDay = new Date(setDate.getFullYear(), setDate.getMonth(), setDate.getDate());
  let daysPassed = Math.floor((today - setDay) / 86400000);
  daysPassed = Math.max(0, Math.min(daysPassed, periodDays));
  const remainingDays = Math.max(0, periodDays - daysPassed);
  return { periodDays, daysPassed, remainingDays, setDate };
}

// 获取某分类在预算周期内的已花/已存金额（仅统计设置预算之后的记录）
function getCategorySpentInPeriod(expenses, catId, setDate) {
  const base = setDate ? new Date(setDate.getFullYear(), setDate.getMonth(), setDate.getDate()).getTime() : 0;
  return expenses
    .filter(e => e.categoryId === catId && e.date >= base)
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
}

// 获取某月各分类统计：预算、已花/已存、结余（预算-已花）
// 返回 { cats: [{cat, budget, spent, surplus}], totalBudget, totalSpent, totalSurplus }
function getMonthCategoryStats(ledgerId, ym) {
  const [start, end] = getMonthRange(ym);
  const expenses = state.expenses.filter(e => e.ledgerId === ledgerId && e.date >= start && e.date < end);
  const budget = state.budgets[ledgerId + '_' + ym] || { total: 0, cats: {}, subs: {} };
  const period = getBudgetPeriod(budget, ym);
  const cats = state.categories[ledgerId] || [];
  const catStats = cats.map((cat, idx) => {
    const b = Number(budget.cats[cat.id] || 0);
    const s = getCategorySpentInPeriod(expenses, cat.id, period.setDate);
    return { cat, budget: b, spent: s, surplus: b - s, color: COLORS[idx % COLORS.length] };
  });
  const totalBudget = catStats.reduce((sum, c) => sum + c.budget, 0);
  const totalSpent = catStats.reduce((sum, c) => sum + c.spent, 0);
  return { cats: catStats, totalBudget, totalSpent, totalSurplus: totalBudget - totalSpent, period };
}

// 保留2位小数（除不尽时），能整除则显示整数
function fmtDaily(n) {
  if (!isFinite(n)) return '0.00';
  const r = Math.round(n * 100) / 100;
  return r.toFixed(2);
}

// ============ 路由 / 页面切换 ============
function navigate(page, params = {}) {
  currentPage = page;
  document.querySelectorAll('.nav-item').forEach(el => {
    el.classList.toggle('active', el.dataset.page === page);
  });
  // 重置记账状态
  if (page === 'add') {
    addPageState = { amount: '', note: '', selectedCatId: null, selectedSubId: null, skipClassify: false };
  }
  render(params);
}

// ============ 渲染入口 ============
function render(params = {}) {
  const app = $('app');
  if (params.scrollTop != null) app.scrollTop = 0;

  switch (currentPage) {
    case 'home': return renderHome(app);
    case 'add': return renderAdd(app);
    case 'stats': return renderStats(app, params);
    case 'monthSummary': return renderMonthSummary(app, params);
    case 'ledger': return renderLedger(app);
    case 'me': return renderMe(app);
    case 'budgetAllocate': return renderBudgetAllocate(app);
    case 'classifyList': return renderClassifyList(app);
    case 'classifyOne': return renderClassifyOne(app, params);
    case 'catManage': return renderCatManage(app);
    case 'settingsReminder': return renderSettingsReminder(app);
    case 'skin': return renderSkin(app);
    case 'ledgerCreate': return renderLedgerCreate(app, params);
    case 'dataBackup': return renderDataBackup(app);
    case 'expenseDetail': return renderExpenseDetail(app, params);
    case 'editExpense': return renderEditExpense(app, params);
    case 'expenseList': return renderExpenseList(app, params);
    default: return renderHome(app);
  }
}

// ============ 1. 首页 ============
function renderHome(app) {
  let ym = state.currentMonth;
  const ledger = getCurrentLedger();
  if (!ledger) { app.innerHTML = '<div class="empty">请先创建账本</div>'; return; }
  const [start, end] = getMonthRange(ym);
  const expenses = state.expenses.filter(e => e.ledgerId === ledger.id && e.date >= start && e.date < end);
  const budget = state.budgets[ledger.id + '_' + ym] || null;
  const totalBudget = budget ? Number(budget.total) || 0 : 0;
  const totalSpent = expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
  const unclassifiedCount = expenses.filter(e => !e.categoryId).length;

  // 储蓄金额：储蓄类别的已存金额
  const savingsCats = (state.categories[ledger.id] || []).filter(c => c.kind === 'savings').map(c => c.id);
  const savingsAmount = expenses.filter(e => savingsCats.includes(e.categoryId))
    .reduce((s, e) => s + (Number(e.amount) || 0), 0);
  // 实际支出 = 总支出 - 储蓄金额
  const actualExpense = totalSpent - savingsAmount;
  // 剩余预算 = 总预算 - 实际支出 - 储蓄（已存的钱不再可支配）
  const remainingBudget = totalBudget - actualExpense - savingsAmount;

  // 分类进度
  const cats = (state.categories[ledger.id] || []);
  const period = getBudgetPeriod(budget, ym);
  let catProgressHtml = '';
  cats.forEach((cat, idx) => {
    const catBudget = budget ? (budget.cats[cat.id] || 0) : 0;
    const catSpent = getCategorySpentInPeriod(expenses, cat.id, period.setDate);
    const percent = catBudget > 0 ? Math.min(100, Math.round(catSpent / catBudget * 100)) : 0;
    const color = COLORS[idx % COLORS.length];
    const over = catSpent > catBudget && catBudget > 0;
    const isSavings = cat.kind === 'savings';
    const isDebt = cat.kind === 'debt';
    const kindTag = isSavings ? '储蓄' : (isDebt ? '负债' : '支出');
    // 初始日均 = 分类预算 / 周期天数（固定参照）
    const initialDaily = catBudget > 0 ? catBudget / period.periodDays : 0;
    // 剩余日均 = (分类预算 - 已花/已存) / 剩余天数（变动）
    const remainingDaily = period.remainingDays > 0
      ? (catBudget - catSpent) / period.remainingDays
      : (catBudget - catSpent);
    // 状态色：支出/负债类剩余日均<初始=花太快(红)；储蓄类剩余日均>初始=落后(红)
    let dailyColor = '#666';
    if (isSavings) {
      dailyColor = (remainingDaily > initialDaily + 0.005) ? '#e74c3c' : ((remainingDaily < initialDaily - 0.005) ? '#27ae60' : '#666');
    } else {
      dailyColor = (remainingDaily < initialDaily - 0.005) ? '#e74c3c' : ((remainingDaily > initialDaily + 0.005) ? '#27ae60' : '#666');
    }
    const verb = cat.dailyLabel || (isSavings ? '需储蓄' : (isDebt ? '需还款' : '可支配'));
    catProgressHtml += `
      <div class="progress-item">
        <div class="progress-head">
          <span>${cat.emoji} ${cat.name}${kindTag !== '支出' ? ` <span style="font-size:10px;color:#999">(${kindTag})</span>` : ''}</span>
          <span class="${over ? 'text-danger' : 'text-muted'}">¥${fmtMoney(catSpent)} / ¥${fmtMoney(catBudget)} <span style="font-size:11px">(${catBudget - catSpent >= 0 ? '剩余' : '超支'} ¥${fmtMoney(Math.abs(catBudget - catSpent))})</span></span>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${percent}%;background:${over ? '#e74c3c' : color}"></div>
        </div>
        <div class="daily-row">
          <span class="daily-label">日均${verb}：</span>
          <span class="daily-value">初始 ¥${fmtDaily(initialDaily)}</span>
          <span class="daily-arrow">→</span>
          <span class="daily-value" style="color:${dailyColor}">剩余 ¥${fmtDaily(remainingDaily)}</span>
          <span class="daily-days">（剩${period.remainingDays}天）</span>
        </div>
      </div>`;
  });
  if (!cats.length) catProgressHtml = '<div class="text-muted text-center" style="padding:10px">暂无分类</div>';

  // 最近支出（最近5条）
  const recent = [...expenses].sort((a, b) => b.date - a.date).slice(0, 5);
  const recentHtml = recent.length ? recent.map(renderExpenseItem).join('') :
    '<div class="empty" style="padding:30px 0"><div class="empty-icon">📝</div><div>本月还没有记录哦</div></div>';

  // 日期导航（基于 viewDate）
  const vd = new Date(state.viewDate);
  const vdY = vd.getFullYear();
  const vdM = vd.getMonth() + 1;
  const vdD = vd.getDate();
  // 同步 currentMonth 为 viewDate 所在月
  state.currentMonth = `${vdY}-${String(vdM).padStart(2, '0')}`;
  ym = state.currentMonth;

  app.innerHTML = `
    <div class="home-header">
      <div class="home-month">
        <div class="month-switch">
          <span class="month-btn" onclick="changeMonth(-1)" title="上一月">‹‹</span>
          <span class="month-btn" onclick="changeDay(-1)" title="前一日">‹</span>
          <span class="month-text" onclick="openCalendarPicker()" style="cursor:pointer">${vdY}年${vdM}月${vdD}日 ▾</span>
          <span class="month-btn" onclick="changeDay(1)" title="后一日">›</span>
          <span class="month-btn" onclick="changeMonth(1)" title="下一月">››</span>
        </div>
        <div class="ledger-selector" onclick="navigate('ledger')">
          <span style="margin-right:6px">${ledger.icon}</span>
          <span>${ledger.name}</span>
          <span style="margin-left:4px">›</span>
        </div>
      </div>
      <div class="summary-cards">
        <div class="summary-item">
          <div class="summary-label">总预算</div>
          <div class="summary-value" style="${totalBudget ? '' : 'opacity:0.6'}">¥${fmtMoney(totalBudget)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">总支出</div>
          <div class="summary-value">¥${fmtMoney(actualExpense)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">剩余预算</div>
          <div class="summary-value" style="${remainingBudget >= 0 ? '' : 'color:#e74c3c'}">¥${fmtMoney(remainingBudget)}</div>
        </div>
        <div class="summary-item">
          <div class="summary-label">储蓄金额</div>
          <div class="summary-value" style="color:#27ae60">¥${fmtMoney(savingsAmount)}</div>
        </div>
      </div>
    </div>

    ${unclassifiedCount > 0 ? `
      <div class="unclassified-banner" onclick="navigate('classifyList')">
        <div class="unclassified-left">
          <span>⏰</span>
          <span>您有 ${unclassifiedCount} 笔支出未分类</span>
          <span class="unclassified-count">去分类</span>
        </div>
        <span>›</span>
      </div>` : ''}

    ${totalBudget > 0 ? `
    <div class="progress-section">
      <div class="progress-card">
        <div style="font-size:14px;font-weight:600;margin-bottom:12px">整体进度</div>
        <div class="progress-item">
          <div class="progress-head">
            <span>预算使用</span>
            <span class="${actualExpense > totalBudget ? 'text-danger' : ''}">${totalBudget ? Math.round(actualExpense / totalBudget * 100) : 0}% · ${actualExpense > totalBudget ? '超支' : '正常'}</span>
          </div>
          <div class="progress-bar" style="height:10px">
            <div class="progress-fill" style="width:${Math.min(100, totalBudget ? actualExpense / totalBudget * 100 : 0)}%;background:${actualExpense > totalBudget ? '#e74c3c' : 'linear-gradient(90deg,#4A90D9,#357ABD)'}"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="recent-list">
      <div class="section-title">
        <span>分类进度</span>
        <span class="section-more" onclick="navigate('budgetAllocate')">调整预算 ›</span>
      </div>
      <div class="progress-card">
        <div class="period-info">
          📅 预算周期：${period.setDate.getFullYear()}/${period.setDate.getMonth()+1}/${period.setDate.getDate()} 起，共 ${period.periodDays} 天 · 已过 ${period.daysPassed} 天 · 剩 ${period.remainingDays} 天
          <span style="float:right;cursor:pointer;color:#4A90D9" onclick="navigate('monthSummary')">📊 本月总结 ›</span>
        </div>
        ${catProgressHtml}
      </div>
    </div>` : `
    <div class="card mt-16" style="text-align:center">
      <div style="font-size:40px;margin-bottom:8px">💰</div>
      <div style="color:#666;margin-bottom:12px">还没有设置${vdY}年${vdM}月预算</div>
      <button class="btn btn-primary" onclick="navigate('budgetAllocate')">立即分配</button>
    </div>`}

    <div class="recent-list">
      <div class="section-title">
        <span>最近支出</span>
        <span class="section-more" onclick="navigate('expenseList')">查看全部 ›</span>
      </div>
      ${recentHtml}
    </div>
  `;
}

function changeMonth(delta) {
  const d = new Date(state.viewDate);
  d.setMonth(d.getMonth() + delta);
  state.viewDate = d.getTime();
  state.currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  save();
  render();
}

function changeDay(delta) {
  const d = new Date(state.viewDate);
  d.setDate(d.getDate() + delta);
  state.viewDate = d.getTime();
  state.currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  save();
  render();
}

function setViewDate(ts) {
  const d = new Date(ts);
  state.viewDate = d.getTime();
  state.currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  save();
  render();
}

// 日历选择器
function openCalendarPicker() {
  const d = new Date(state.viewDate);
  const y = d.getFullYear();
  const m = d.getMonth();
  const today = new Date();
  const todayStr = today.toDateString();
  const curStr = d.toDateString();
  const firstDay = new Date(y, m, 1).getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  let cells = '';
  for (let i = 0; i < firstDay; i++) cells += '<div class="cal-cell"></div>';
  for (let day = 1; day <= daysInMonth; day++) {
    const cellDate = new Date(y, m, day);
    const isToday = cellDate.toDateString() === todayStr;
    const isCur = cellDate.toDateString() === curStr;
    const isFuture = cellDate > today;
    cells += `<div class="cal-cell ${isCur ? 'cur' : ''} ${isToday ? 'today' : ''} ${isFuture ? 'future' : ''}"
      onclick="${isFuture ? '' : `setViewDate(${cellDate.getTime()});closeCalendar()`}">
      ${day}
    </div>`;
  }
  $('calYear').textContent = y;
  $('calMonth').textContent = (m + 1) + '月';
  $('calGrid').innerHTML = cells;
  $('calendarModal').classList.add('show');
}

function closeCalendar() { $('calendarModal').classList.remove('show'); }

function calPrevMonth() {
  const d = new Date(state.viewDate);
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  state.viewDate = d.getTime();
  openCalendarPicker();
}

function calNextMonth() {
  const d = new Date(state.viewDate);
  d.setDate(1);
  d.setMonth(d.getMonth() + 1);
  state.viewDate = d.getTime();
  openCalendarPicker();
}

function openMonthPicker() {
  const [y, m] = state.currentMonth.split('-').map(Number);
  const yearSel = $('pickYear');
  const monthSel = $('pickMonth');
  // 生成年份列表：当前年前后各10年
  const nowY = new Date().getFullYear();
  let opts = '';
  for (let yr = nowY - 10; yr <= nowY + 10; yr++) {
    opts += `<option value="${yr}" ${yr === y ? 'selected' : ''}>${yr}年</option>`;
  }
  yearSel.innerHTML = opts;
  monthSel.value = String(m);
  $('monthPickerModal').classList.add('show');
}

function closeMonthPicker(confirm) {
  $('monthPickerModal').classList.remove('show');
  if (!confirm) return;
  const y = $('pickYear').value;
  const m = $('pickMonth').value;
  // 跳转年月时，日期设为该月1日（不超过今天）
  const today = new Date();
  let day = 1;
  if (+y === today.getFullYear() && +m === today.getMonth() + 1) day = today.getDate();
  state.viewDate = new Date(+y, +m - 1, day).getTime();
  state.currentMonth = `${y}-${String(m).padStart(2, '0')}`;
  save();
  render();
}

function goCurrentMonth() {
  const now = new Date();
  state.viewDate = now.getTime();
  state.currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  save();
  $('monthPickerModal').classList.remove('show');
  render();
}

function goCurrentDay() {
  const now = new Date();
  state.viewDate = now.getTime();
  state.currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  save();
  $('calendarModal').classList.remove('show');
  render();
}

// ============ 本月总结 ============
function renderMonthSummary(app, params) {
  const ledger = getCurrentLedger();
  if (!ledger) { app.innerHTML = '<div class="empty">请先创建账本</div>'; return; }
  const ym = state.currentMonth;
  const [y, m] = ym.split('-').map(Number);
  const stats = getMonthCategoryStats(ledger.id, ym);
  const { cats: catStats, totalBudget, totalSpent, totalSurplus, period } = stats;

  const isPeriodEnd = period.remainingDays <= 1;
  const surplusSign = totalSurplus >= 0 ? '剩余' : '超支';
  const surplusColor = totalSurplus >= 0 ? '#27ae60' : '#e74c3c';

  // 柱状图：预算 vs 已花
  const maxVal = Math.max(totalBudget, ...catStats.map(c => Math.max(c.budget, c.spent)), 1);
  const barsHtml = catStats.filter(c => c.budget > 0 || c.spent > 0).map(c => {
    const budgetPct = (c.budget / maxVal) * 100;
    const spentPct = (c.spent / maxVal) * 100;
    const surplus = c.surplus;
    const isSavings = c.cat.kind === 'savings';
    const isDebt = c.cat.kind === 'debt';
    const verb = isSavings ? '储蓄' : (isDebt ? '还款' : '支出');
    const surplusText = surplus >= 0 ? `剩余 ¥${fmtMoney(surplus)}` : `超支 ¥${fmtMoney(Math.abs(surplus))}`;
    const surplusClr = surplus >= 0 ? '#27ae60' : '#e74c3c';
    return `
      <div class="summary-bar-item">
        <div class="summary-bar-head">
          <span>${c.cat.emoji} ${c.cat.name}</span>
          <span style="color:${surplusClr};font-weight:600">${surplusText}</span>
        </div>
        <div class="summary-bars">
          <div class="summary-bar-row">
            <span class="summary-bar-label">预算</span>
            <div class="summary-bar-track">
              <div class="summary-bar-fill budget-bar" style="width:${budgetPct}%"></div>
            </div>
            <span class="summary-bar-val">¥${fmtMoney(c.budget)}</span>
          </div>
          <div class="summary-bar-row">
            <span class="summary-bar-label">实际${verb}</span>
            <div class="summary-bar-track">
              <div class="summary-bar-fill spent-bar" style="width:${spentPct}%;background:${surplus < 0 ? '#e74c3c' : c.color}"></div>
            </div>
            <span class="summary-bar-val">¥${fmtMoney(c.spent)}</span>
          </div>
        </div>
      </div>`;
  }).join('');

  const unclassifiedCount = state.expenses.filter(e =>
    e.ledgerId === ledger.id && e.date >= getMonthRange(ym)[0] && e.date < getMonthRange(ym)[1] && !e.categoryId
  ).length;

  app.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center" onclick="navigate('home')">
        <span style="font-size:20px;margin-right:10px">‹</span>
        <span class="page-title">${y}年${m}月总结</span>
      </div>
    </div>

    <div class="summary-total-card">
      <div class="summary-total-row">
        <div>
          <div class="summary-total-label">总预算</div>
          <div class="summary-total-val">¥${fmtMoney(totalBudget)}</div>
        </div>
        <div>
          <div class="summary-total-label">总支出</div>
          <div class="summary-total-val">¥${fmtMoney(totalSpent)}</div>
        </div>
        <div>
          <div class="summary-total-label">${surplusSign}</div>
          <div class="summary-total-val" style="color:${surplusColor}">¥${fmtMoney(Math.abs(totalSurplus))}</div>
        </div>
      </div>
      ${isPeriodEnd ? '<div class="summary-tip">🎉 本月周期已结束，可参考下方数据规划下月预算</div>' : ''}
    </div>

    <div style="padding:0 16px">
      <div class="section-title"><span>各分类对比</span></div>
      ${barsHtml || '<div class="text-muted text-center" style="padding:30px">本月暂无数据</div>'}
    </div>

    ${unclassifiedCount > 0 ? `
      <div style="margin:16px">
        <div class="unclassified-banner" onclick="navigate('classifyList')">
          <div class="unclassified-left">
            <span>⚠️</span>
            <span>还有 ${unclassifiedCount} 笔未分类，影响统计准确性</span>
            <span class="unclassified-count">去分类</span>
          </div>
          <span>›</span>
        </div>
      </div>` : ''}

    <div style="padding:16px">
      <button class="btn btn-primary btn-block" onclick="navigate('budgetAllocate')">去设置下月预算 ›</button>
    </div>
  `;
}

function getCurrentLedger() {
  return state.ledgers.find(l => l.id === state.currentLedgerId);
}

function getCategoryById(ledgerId, catId) {
  const cats = state.categories[ledgerId] || [];
  return cats.find(c => c.id === catId);
}
function getSubCategoryById(ledgerId, catId, subId) {
  const cat = getCategoryById(ledgerId, catId);
  if (!cat) return null;
  return cat.subCategories.find(s => s.id === subId);
}

function renderExpenseItem(e) {
  const classified = !!e.categoryId;
  let icon = '❓', catName = '未分类', subName = '';
  if (classified) {
    const cat = getCategoryById(e.ledgerId, e.categoryId);
    if (cat) {
      icon = cat.emoji;
      catName = cat.name;
      if (e.subCategoryId) {
        const sub = getSubCategoryById(e.ledgerId, e.categoryId, e.subCategoryId);
        if (sub) subName = sub.name;
      }
    }
  }
  const note = e.note ? (subName ? subName + ' · ' + e.note : e.note) : subName;
  return `
    <div class="expense-item ${classified ? '' : 'expense-unclassified'}" onclick="navigate('expenseDetail',{id:'${e.id}'})">
      <div class="expense-icon">${icon}</div>
      <div class="expense-info">
        <div class="expense-cat">${catName}${classified ? '' : ' <span style="color:#f39c12;font-size:11px">(待分类)</span>'}</div>
        <div class="expense-sub">${note || fmtDate(e.date)}</div>
      </div>
      <div class="expense-right">
        <div class="expense-amount">-¥${fmtMoney(e.amount)}</div>
        <div class="expense-time">${fmtDateShort(e.date)}</div>
      </div>
    </div>`;
}

// ============ 2. 记一笔 ============
function renderAdd(app) {
  const ledger = getCurrentLedger();
  if (!ledger) { app.innerHTML = '<div class="empty">请先创建账本</div>'; return; }
  const cats = state.categories[ledger.id] || [];

  const selectedCat = cats.find(c => c.id === addPageState.selectedCatId);
  const subCats = selectedCat ? selectedCat.subCategories : [];

  // 日期选择：默认为今天，可选择过去或未来日期
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const useDate = addPageState.date ? new Date(addPageState.date) : today;
  const dateStr = useDate.toISOString().slice(0, 10);

  app.innerHTML = `
    <div class="add-page">
      <div class="amount-section">
        <div class="amount-label">支出金额</div>
        <div class="amount-input-wrap">
          <span class="amount-yen">¥</span>
          <input id="amountInput" type="number" step="0.01" inputmode="decimal" class="amount-input"
            placeholder="0.00" value="${addPageState.amount}"
            oninput="onAmountInput(this.value)" onfocus="this.select()">
        </div>
        <input id="noteInput" type="text" class="note-input" placeholder="备注（选填）" value="${addPageState.note}"
          oninput="addPageState.note = this.value">
      </div>

      <div style="padding:12px 20px;background:#fff;border-bottom:1px solid #f5f5f5">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:13px;color:#666">📅 账单日期</span>
          <input id="expenseDate" type="date" value="${dateStr}"
            style="padding:6px 10px;border-radius:8px;background:#f5f7fa;font-size:14px;border:none"
            onchange="addPageState.date = new Date(this.value).getTime()">
        </div>
        <div style="font-size:11px;color:#999;margin-top:6px">默认为今天，可选择任意日期（含未来）</div>
      </div>

      <div class="category-section">
        <div class="section-label">${addPageState.skipClassify ? '✅ 本次跳过分类（可稍后分类）' : '选择分类（跳过也可稍后分类）'}</div>
        ${cats.length ? `
        <div class="cat-grid">
          ${cats.map(c => `
            <div class="cat-item ${addPageState.selectedCatId === c.id ? 'selected' : ''}"
              onclick="selectCat('${c.id}')">
              <div class="cat-emoji">${c.emoji}</div>
              <div class="cat-name">${c.name}</div>
            </div>`).join('')}
        </div>
        ${selectedCat && subCats.length ? `
          <div style="margin-top:16px">
            <div class="section-label">选择子分类</div>
            <div class="sub-cat-scroll">
              ${subCats.map(s => `
                <div class="sub-tag ${addPageState.selectedSubId === s.id ? 'selected' : ''}"
                  onclick="selectSub('${s.id}')">${s.name}</div>`).join('')}
              <div class="sub-tag add-btn" onclick="addSubCat()">+ 新增</div>
            </div>
          </div>` : ''}
        ` : '<div class="text-muted text-center" style="padding:20px">暂无分类，请先在账本中创建</div>'}
      </div>

      <div class="skip-classify" onclick="toggleSkipClassify()">
        <input type="checkbox" id="skipChk" ${addPageState.skipClassify ? 'checked' : ''} onclick="event.stopPropagation();toggleSkipClassify()">
        <span>本次不分类，稍后统一处理</span>
      </div>

      <button class="btn btn-primary btn-block" onclick="saveExpense()">确认记账</button>
    </div>
  `;

  // 自动聚焦金额
  setTimeout(() => {
    const ai = $('amountInput');
    if (ai && !addPageState.amount) ai.focus();
  }, 200);
}

function onAmountInput(v) { addPageState.amount = v; }

function selectCat(id) {
  addPageState.skipClassify = false;
  if (addPageState.selectedCatId === id) {
    addPageState.selectedCatId = null;
  } else {
    addPageState.selectedCatId = id;
  }
  addPageState.selectedSubId = null;
  render();
}

function selectSub(id) {
  if (addPageState.selectedSubId === id) {
    addPageState.selectedSubId = null;
  } else {
    addPageState.selectedSubId = id;
  }
  render();
}

function toggleSkipClassify() {
  addPageState.skipClassify = !addPageState.skipClassify;
  if (addPageState.skipClassify) {
    addPageState.selectedCatId = null;
    addPageState.selectedSubId = null;
  }
  render();
}

async function addSubCat() {
  if (!addPageState.selectedCatId) { toast('请先选择大分类'); return; }
  const name = await inputDialog('新增子分类', '如：咖啡');
  if (!name) return;
  const ledger = getCurrentLedger();
  const cats = state.categories[ledger.id];
  const cat = cats.find(c => c.id === addPageState.selectedCatId);
  if (cat) {
    cat.subCategories.push({ id: uid('S'), name: name.trim() });
    save();
    toast('已添加');
    render();
  }
}

function saveExpense() {
  const amount = parseFloat(addPageState.amount);
  if (!amount || amount <= 0) { toast('请输入正确的金额'); return; }
  const ledger = getCurrentLedger();
  // 确定账单日期：用户选的日期 > 今天
  const expenseTs = addPageState.date || Date.now();
  const e = {
    id: uid('E'),
    ledgerId: ledger.id,
    amount: Math.round(amount * 100) / 100,
    note: addPageState.note || '',
    date: expenseTs,
    categoryId: addPageState.skipClassify ? null : (addPageState.selectedCatId || null),
    subCategoryId: addPageState.skipClassify ? null : (addPageState.selectedSubId || null)
  };
  state.expenses.push(e);
  // 跳转至账单所在月份，便于查看
  const eDate = new Date(expenseTs);
  state.viewDate = expenseTs;
  state.currentMonth = `${eDate.getFullYear()}-${String(eDate.getMonth() + 1).padStart(2, '0')}`;
  save();
  toast('记账成功 🎉');
  // 重置表单
  addPageState.amount = '';
  addPageState.note = '';
  addPageState.selectedCatId = null;
  addPageState.selectedSubId = null;
  addPageState.skipClassify = false;
  addPageState.date = null;
  setTimeout(() => navigate('home'), 500);
}

// ============ 3. 统计 ============
// ============ 统计数据统一聚合 ============
// type: today / month / year / total
function getStatsAggregation(type, ledgerId) {
  const cats = state.categories[ledgerId] || [];
  const now = new Date();
  let start, end, periodLabel;

  if (type === 'today') {
    start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    end = start + 86400000;
    periodLabel = '今日';
  } else if (type === 'month') {
    const ym = state.currentMonth;
    const [s, e] = getMonthRange(ym);
    start = s; end = e;
    periodLabel = ym.replace('-', '年') + '月';
  } else if (type === 'year') {
    // 使用当前查看月份所在的年份
    const y = Number(state.currentMonth.split('-')[0]);
    start = new Date(y, 0, 1).getTime();
    end = new Date(y + 1, 0, 1).getTime();
    periodLabel = y + '年度';
  } else { // total
    start = 0;
    end = Date.now() + 86400000;
    periodLabel = '总计';
  }

  const expenses = state.expenses.filter(e =>
    e.ledgerId === ledgerId && e.date >= start && e.date < end);

  // 汇总周期内各月预算
  const budgetMap = {};
  let totalBudget = 0;
  Object.keys(state.budgets).forEach(k => {
    const parts = k.split('_');
    const lid = parts[0];
    const ym = parts.slice(1).join('_'); // 兼容分类名含下划线
    if (lid !== ledgerId) return;
    const b = state.budgets[k];
    const [by, bm] = ym.split('-').map(Number);
    const monthStart = new Date(by, bm - 1, 1).getTime();
    const monthEnd = new Date(by, bm, 1).getTime();
    if (monthStart < end && monthEnd > start) {
      Object.entries(b.cats || {}).forEach(([cid, val]) => {
        budgetMap[cid] = (budgetMap[cid] || 0) + (Number(val) || 0);
        totalBudget += Number(val) || 0;
      });
    }
  });

  // 汇总周期内各分类支出
  const spentMap = {};
  let totalSpent = 0;
  let unclassifiedSpent = 0;
  expenses.forEach(e => {
    const amt = Number(e.amount) || 0;
    totalSpent += amt;
    if (e.categoryId) {
      spentMap[e.categoryId] = (spentMap[e.categoryId] || 0) + amt;
    } else {
      unclassifiedSpent += amt;
    }
  });

  // 构建分类数据（预算+实际），区分储蓄类
  const catData = cats.map((cat, idx) => ({
    cat,
    budget: budgetMap[cat.id] || 0,
    spent: spentMap[cat.id] || 0,
    isSavings: cat.kind === 'savings',
    color: COLORS[idx % COLORS.length]
  })).filter(d => d.budget > 0 || d.spent > 0);

  // 储蓄金额 = 储蓄类别的实际已存金额
  const totalSavings = catData.filter(d => d.isSavings).reduce((s, d) => s + d.spent, 0);
  const savingsBudget = catData.filter(d => d.isSavings).reduce((s, d) => s + d.budget, 0);
  // 实际支出 = 总支出 - 储蓄金额（储蓄不算支出）
  const actualExpense = totalSpent - totalSavings;
  // 结余 = 除储蓄外各类别(预算-支出) + 储蓄金额
  const surplus = catData.filter(d => !d.isSavings).reduce((s, d) => s + (d.budget - d.spent), 0) + totalSavings;

  // 今日总预算 = 本月剩余可支配金额（功能1）
  let displayBudget = totalBudget;
  if (type === 'today') {
    // 本月剩余可支配 = 本月总预算 - 本月实际支出
    const ymNow = state.currentMonth;
    const [ms, me] = getMonthRange(ymNow);
    const monthExpenses = state.expenses.filter(x =>
      x.ledgerId === ledgerId && x.date >= ms && x.date < me);
    const monthSavingsCats = cats.filter(c => c.kind === 'savings').map(c => c.id);
    const monthSavings = monthExpenses.filter(x => monthSavingsCats.includes(x.categoryId))
      .reduce((s, x) => s + (Number(x.amount) || 0), 0);
    const monthActualExpense = monthExpenses.reduce((s, x) => s + (Number(x.amount) || 0), 0) - monthSavings;
    const monthBudget = state.budgets[ledgerId + '_' + ymNow];
    const mb = monthBudget ? Number(monthBudget.total) || 0 : 0;
    // 功能1：今日总预算 = 本月剩余可支配金额 = 月度总预算 - 本月已流出（含储蓄，已存的钱不再可支配）
    displayBudget = Math.max(0, mb - monthActualExpense - monthSavings);
  }

  return {
    periodLabel,
    totalBudget: displayBudget,
    totalExpense: actualExpense,
    totalSavings,
    surplus,
    catData,
    unclassifiedSpent,
    expenses,
    start, end
  };
}

function renderStats(app, params = {}) {
  const type = params.type || 'month'; // today / month / year / total
  const ledger = getCurrentLedger();
  if (!ledger) { app.innerHTML = '<div class="empty">请先创建账本</div>'; return; }

  const { periodLabel, totalBudget, totalExpense, totalSavings, surplus, catData, unclassifiedSpent, expenses } =
    getStatsAggregation(type, ledger.id);

  // 柱状图最大值（用于归一化条宽）
  let maxVal = 0;
  catData.forEach(d => { maxVal = Math.max(maxVal, d.budget, d.spent); });
  maxVal = Math.max(maxVal, 1);

  // 按支出降序
  const sorted = [...catData].sort((a, b) => b.spent - a.spent);

  const barsHtml = sorted.length ? sorted.map(d => {
    const budgetPct = (d.budget / maxVal * 100);
    const spentPct = (d.spent / maxVal * 100);
    // 功能5：比例 = 各类实际 / 各类预算
    const ratioPct = d.budget > 0 ? (d.spent / d.budget * 100) : 0;
    const overSpent = d.spent > d.budget && d.budget > 0;
    const actualLabel = d.isSavings ? '储蓄' : '实际';
    return `
      <div class="bar-row">
        <div class="bar-row-head">
          <span class="bar-cat-emoji">${d.cat.emoji}</span>
          <span class="bar-cat-name">${d.cat.name}${d.isSavings ? ' <span style="font-size:10px;color:#27ae60">(储蓄)</span>' : ''}</span>
          <span class="bar-share">${ratioPct.toFixed(2)}%</span>
        </div>
        <div class="bar-pair">
          <div class="bar-line">
            <div class="bar-label">预算</div>
            <div class="bar-track">
              <div class="bar-fill bar-budget" style="width:${budgetPct}%"></div>
            </div>
            <div class="bar-amount">¥${fmtMoney(d.budget)}</div>
          </div>
          <div class="bar-line">
            <div class="bar-label">${actualLabel}</div>
            <div class="bar-track">
              <div class="bar-fill ${overSpent ? 'bar-spent-over' : (d.isSavings ? 'bar-savings' : 'bar-spent')}" style="width:${spentPct}%"></div>
            </div>
            <div class="bar-amount">¥${fmtMoney(d.spent)}</div>
          </div>
        </div>
      </div>`;
  }).join('') : '<div class="empty" style="padding:30px 0"><div class="empty-icon">📭</div><div>暂无数据</div></div>';

  const unclassifiedHtml = unclassifiedSpent > 0 ? `
    <div class="bar-row" style="opacity:0.7">
      <div class="bar-row-head">
        <span class="bar-cat-emoji">❓</span>
        <span class="bar-cat-name">未分类支出</span>
        <span class="bar-share">—</span>
      </div>
      <div class="bar-pair">
        <div class="bar-line">
          <div class="bar-label">预算</div>
          <div class="bar-track"><div class="bar-fill bar-budget" style="width:0%"></div></div>
          <div class="bar-amount">¥0.00</div>
        </div>
        <div class="bar-line">
          <div class="bar-label">实际</div>
          <div class="bar-track"><div class="bar-fill bar-spent-over" style="width:${unclassifiedSpent / maxVal * 100}%"></div></div>
          <div class="bar-amount">¥${fmtMoney(unclassifiedSpent)}</div>
        </div>
      </div>
    </div>` : '';

  app.innerHTML = `
    <div class="page-header">
      <div class="page-title">统计分析</div>
    </div>

    <div class="stats-tabs">
      <div class="stats-tab ${type === 'today' ? 'active' : ''}" onclick="navigate('stats',{type:'today'})">今日</div>
      <div class="stats-tab ${type === 'month' ? 'active' : ''}" onclick="navigate('stats',{type:'month'})">月度</div>
      <div class="stats-tab ${type === 'year' ? 'active' : ''}" onclick="navigate('stats',{type:'year'})">年度</div>
      <div class="stats-tab ${type === 'total' ? 'active' : ''}" onclick="navigate('stats',{type:'total'})">总计</div>
    </div>

    <div class="stats-summary-card">
      <div class="stats-summary-item">
        <div class="stats-summary-label">${periodLabel}预算</div>
        <div class="stats-summary-val">¥${fmtMoney(totalBudget)}</div>
      </div>
      <div class="stats-summary-item">
        <div class="stats-summary-label">${periodLabel}支出</div>
        <div class="stats-summary-val" style="color:#e74c3c">¥${fmtMoney(totalExpense)}</div>
      </div>
      <div class="stats-summary-item">
        <div class="stats-summary-label">${periodLabel}储蓄</div>
        <div class="stats-summary-val" style="color:#27ae60">¥${fmtMoney(totalSavings)}</div>
      </div>
      <div class="stats-summary-item">
        <div class="stats-summary-label">${surplus >= 0 ? '结余' : '超支'}</div>
        <div class="stats-summary-val" style="color:${surplus >= 0 ? '#4A90D9' : '#e74c3c'}">
          ${surplus >= 0 ? '' : '-'}¥${fmtMoney(Math.abs(surplus))}
        </div>
      </div>
    </div>

    <div class="stats-chart">
      <div class="bar-legend">
        <span class="legend-dot" style="background:#4A90D9"></span>预算
        <span class="legend-dot" style="background:#27ae60;margin-left:16px"></span>支出/储蓄
        <span class="legend-dot" style="background:#e74c3c;margin-left:16px"></span>超支
        <span style="margin-left:16px;font-size:11px;color:#999">百分比=实际/预算</span>
      </div>
      <div class="bar-list">
        ${barsHtml}
        ${unclassifiedHtml}
      </div>
    </div>

    ${expenses.length ? `
    <div class="section-title" style="padding:16px 20px 8px">支出明细</div>
    <div style="padding:0 16px">
      ${[...expenses].sort((a, b) => b.date - a.date).slice(0, 30).map(renderExpenseItem).join('')}
    </div>` : ''}
  `;
}

// ============ 4. 账本管理 ============
function renderLedger(app) {
  const ym = state.currentMonth;
  const [y, m] = ym.split('-');
  const html = state.ledgers.map(l => {
    const [start, end] = getMonthRange(ym);
    const spent = state.expenses.filter(e => e.ledgerId === l.id && e.date >= start && e.date < end)
      .reduce((s, e) => s + (Number(e.amount) || 0), 0);
    const budget = state.budgets[l.id + '_' + ym];
    const total = budget ? (Number(budget.total) || 0) : 0;
    const isActive = state.currentLedgerId === l.id;
    return `
      <div class="ledger-card ${isActive ? 'active' : ''}" onclick="switchLedger('${l.id}')">
        <div class="ledger-card-bg">${l.icon}</div>
        <div class="ledger-icon">${l.icon}</div>
        <div class="ledger-info">
          <div class="ledger-name">${l.name}${isActive ? ' <span style="color:#4A90D9;font-size:11px;font-weight:normal">使用中</span>' : ''}</div>
          <div class="ledger-budget">预算 ¥${fmtMoney(total)} · 已支 ¥${fmtMoney(spent)}</div>
        </div>
        <div class="ledger-actions" onclick="event.stopPropagation()">
          <div class="icon-btn" title="分配预算" onclick="navigate('budgetAllocate');state.currentLedgerId='${l.id}';save()">
            📊
          </div>
          <div class="icon-btn" title="编辑" onclick="navigate('ledgerCreate',{id:'${l.id}'})">
            ✏️
          </div>
          ${state.ledgers.length > 1 ? `
            <div class="icon-btn" title="删除" style="color:#e74c3c" onclick="deleteLedger('${l.id}')">
              🗑️
            </div>` : ''}
        </div>
      </div>`;
  }).join('');

  app.innerHTML = `
    <div class="page-header">
      <div class="page-title">账本管理</div>
    </div>
    <div class="ledger-list">
      ${html}
      <div class="add-ledger-card" onclick="navigate('ledgerCreate')">
        ➕ 新建账本（如：零花钱账本、副业主账本）
      </div>
    </div>
  `;
}

function switchLedger(id) {
  state.currentLedgerId = id;
  save();
  render();
  toast('已切换账本');
}

async function deleteLedger(id) {
  const ok = await confirmDialog('删除账本', '确定要删除该账本吗？该账本下的分类、预算、支出记录都会被删除，不可恢复！');
  if (!ok) return;
  state.ledgers = state.ledgers.filter(l => l.id !== id);
  delete state.categories[id];
  // 删除相关预算和支出
  Object.keys(state.budgets).forEach(k => {
    if (k.startsWith(id + '_')) delete state.budgets[k];
  });
  state.expenses = state.expenses.filter(e => e.ledgerId !== id);
  if (state.currentLedgerId === id) state.currentLedgerId = state.ledgers[0]?.id;
  save();
  toast('已删除');
  render();
}

// ============ 4.1 创建/编辑账本 ============
function renderLedgerCreate(app, params = {}) {
  const editing = params.id ? state.ledgers.find(l => l.id === params.id) : null;
  const icons = ['💼', '💰', '🏠', '👨‍👩‍👧', '🎮', '📚', '🚗', '🛍️', '💪', '🌴', '🎓', '💳'];
  const selectedIcon = editing?.icon || icons[0];
  const name = editing?.name || '';

  app.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center" onclick="navigate('ledger')">
        <span style="font-size:20px;margin-right:10px">‹</span>
        <span class="page-title">${editing ? '编辑账本' : '新建账本'}</span>
      </div>
    </div>
    <div style="padding:16px">
      <div class="card">
        <div class="label">账本名称</div>
        <input id="ledgerName" class="input" placeholder="如：工资账本" value="${name}">
      </div>
      <div class="card">
        <div class="label mb-12">选择图标</div>
        <div class="cat-grid" id="iconGrid">
          ${icons.map(ic => `
            <div class="cat-item ${selectedIcon === ic ? 'selected' : ''}" onclick="selectIcon('${ic}')">
              <div class="cat-emoji">${ic}</div>
              <div class="cat-name">${ic}</div>
            </div>`).join('')}
        </div>
      </div>
      <button class="btn btn-primary btn-block mt-16" onclick="saveLedger('${editing?.id || ''}')">
        ${editing ? '保存修改' : '创建账本'}
      </button>
    </div>
  `;
  window._selectedIcon = selectedIcon;
}

function selectIcon(ic) {
  window._selectedIcon = ic;
  document.querySelectorAll('#iconGrid .cat-item').forEach(el => {
    el.classList.toggle('selected', el.querySelector('.cat-emoji').textContent === ic);
  });
}

function saveLedger(id) {
  const name = $('ledgerName').value.trim();
  if (!name) { toast('请输入账本名称'); return; }
  if (id) {
    const l = state.ledgers.find(x => x.id === id);
    if (l) { l.name = name; l.icon = window._selectedIcon; }
  } else {
    const newId = uid('L');
    state.ledgers.push({ id: newId, name, icon: window._selectedIcon, createTime: Date.now() });
    state.categories[newId] = [
      { id: uid('C'), name: '生活成本', emoji: '🏠', kind: 'expense', dailyLabel: '可支配', subCategories: [
        { id: uid('S'), name: '租房' }, { id: uid('S'), name: '吃饭' },
        { id: uid('S'), name: '交通' }, { id: uid('S'), name: '通讯' }, { id: uid('S'), name: '其他' }]},
      { id: uid('C'), name: '储蓄', emoji: '💰', kind: 'savings', dailyLabel: '需储蓄', subCategories: [{ id: uid('S'), name: '定期存款' }] },
      { id: uid('C'), name: '自我投资', emoji: '📚', kind: 'expense', dailyLabel: '可支配', subCategories: [{ id: uid('S'), name: '书籍课程' }] },
      { id: uid('C'), name: '生活质量', emoji: '🎮', kind: 'expense', dailyLabel: '可支配', subCategories: [
        { id: uid('S'), name: '奶茶零食' }, { id: uid('S'), name: '恋爱花销' },
        { id: uid('S'), name: '旅游' }, { id: uid('S'), name: '娱乐' }]},
      { id: uid('C'), name: '负债还款', emoji: '💳', kind: 'debt', dailyLabel: '需还款', subCategories: [{ id: uid('S'), name: '信用卡' }] }
    ];
    state.currentLedgerId = newId;
  }
  save();
  toast(editing ? '已保存' : '创建成功');
  setTimeout(() => navigate('ledger'), 400);
}

// ============ 4.2 预算分配 ============
function renderBudgetAllocate(app) {
  const ledger = getCurrentLedger();
  if (!ledger) { app.innerHTML = '<div class="empty">请先创建账本</div>'; return; }
  const ym = state.currentMonth;
  const [y, m] = ym.split('-');
  const key = ledger.id + '_' + ym;
  if (!state.budgets[key]) {
    state.budgets[key] = { total: 0, cats: {}, subs: {} };
  }
  const budget = state.budgets[key];
  const cats = state.categories[ledger.id] || [];

  // 校验：预算金额字段实时同步到state
  window._syncBudget = function () {
    const t = parseFloat(document.getElementById('totalInput').value) || 0;
    budget.total = Math.round(t * 100) / 100;
    cats.forEach(c => {
      const inp = document.getElementById('cat_' + c.id);
      if (inp) budget.cats[c.id] = Math.round((parseFloat(inp.value) || 0) * 100) / 100;
      c.subCategories.forEach(s => {
        const sinp = document.getElementById('sub_' + s.id);
        if (sinp) {
          if (!budget.subs[c.id]) budget.subs[c.id] = {};
          budget.subs[c.id][s.id] = Math.round((parseFloat(sinp.value) || 0) * 100) / 100;
        }
      });
    });
  };

  const catAllocated = Object.values(budget.cats).reduce((s, n) => s + n, 0);
  const diff = Number(budget.total) - catAllocated;

  // 上月各分类结余结转（功能4）
  const [py, pm] = ym.split('-').map(Number);
  const prevYm = new Date(py, pm - 2, 1).toISOString().slice(0, 7);
  const prevStats = getMonthCategoryStats(ledger.id, prevYm);
  const hasPrevBudget = prevStats.totalBudget > 0;
  // 计算各分类结转金额：支出/负债类=结余(正加负减)；储蓄类只加超额部分
  const carryovers = {};
  let totalCarryover = 0;
  prevStats.cats.forEach(pc => {
    const isSavings = pc.cat.kind === 'savings';
    let co;
    if (isSavings) {
      // 储蓄类只增加：已存超过预算的部分
      co = Math.max(0, pc.spent - pc.budget);
    } else {
      // 支出/负债类：结余=预算-已花，正为剩余(加)，负为超支(减)
      co = pc.surplus;
    }
    carryovers[pc.cat.id] = co;
    totalCarryover += co;
  });

  app.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center" onclick="window._syncBudget();save();navigate('ledger')">
        <span style="font-size:20px;margin-right:10px">‹</span>
        <span class="page-title">预算分配 - ${y}年${+m}月</span>
      </div>
      <div class="cat-manage-btn" onclick="navigate('catManage')">管理分类</div>
    </div>

    <div class="budget-total">
      <div class="budget-total-label">${ledger.icon} ${ledger.name} · ${y}年${+m}月总收入</div>
      <div style="display:flex;align-items:baseline;justify-content:center">
        <span style="font-size:20px;margin-right:4px">¥</span>
        <input id="totalInput" type="number" step="0.01" inputmode="decimal"
          style="background:transparent;color:#fff;font-size:36px;font-weight:700;width:220px;text-align:center;border:none;outline:none"
          value="${budget.total}" oninput="this.style.width=(this.value.length*22+40)+'px'">
      </div>
      <div style="font-size:12px;opacity:0.9;margin-top:4px">
        已分配：¥${fmtMoney(catAllocated)} ·
        <span style="color:${diff >= 0 ? '#d4f1d4' : '#ffcdd2'}">${diff >= 0 ? '剩余' : '超支'} ¥${fmtMoney(Math.abs(diff))}</span>
      </div>
    </div>

    ${hasPrevBudget ? `
    <div class="carryover-card">
      <div class="flex-between" style="margin-bottom:8px">
        <span style="font-weight:600">📦 上月（${prevYm.replace('-','年')}月）结余结转</span>
        <span class="${totalCarryover >= 0 ? 'text-success' : 'text-danger'}" style="font-weight:600">
          ${totalCarryover >= 0 ? '+' : ''}¥${fmtMoney(totalCarryover)}
        </span>
      </div>
      <div style="font-size:11px;color:#888;margin-bottom:8px">
        支出/负债类：剩余加、超支减；储蓄类：仅累加超额储蓄
      </div>
      <button class="btn btn-outline" style="width:100%;padding:8px;font-size:13px" onclick="applyCarryover()">
        一键应用上月结转到各分类
      </button>
    </div>` : ''}

    <div style="padding:12px 20px;font-size:12px;color:#888">
      💡 先输入上方总收入，再在下方填入每个大分类的计划金额。括号内为含上月结转后的"总体可支配"
    </div>

    <div class="budget-cat-list">
      ${cats.map((c, idx) => {
        const catBudget = budget.cats[c.id] || 0;
        const subBudgets = budget.subs[c.id] || {};
        const subAllocated = Object.values(subBudgets).reduce((s, n) => s + n, 0);
        const subDiff = catBudget - subAllocated;
        const co = carryovers[c.id] || 0;
        const totalDisposable = catBudget + co;
        const coText = co > 0 ? `+¥${fmtMoney(co)}` : (co < 0 ? `-¥${fmtMoney(Math.abs(co))}` : '');
        const coClr = co > 0 ? '#27ae60' : (co < 0 ? '#e74c3c' : '#999');
        return `
          <div class="budget-cat-item">
            <div class="budget-cat-head">
              <div class="budget-cat-left">
                <span class="budget-cat-emoji">${c.emoji}</span>
                <div>
                  <div class="budget-cat-name">${c.name}</div>
                  <div style="font-size:11px;color:#999;margin-top:2px">
                    ${subAllocated ? `小类已分配 ¥${fmtMoney(subAllocated)} / ¥${fmtMoney(catBudget)} · <span style="color:${subDiff >= 0 ? '#27ae60' : '#e74c3c'}">${subDiff >= 0 ? '剩' : '超'} ¥${fmtMoney(Math.abs(subDiff))}</span>` : ''}
                  </div>
                </div>
              </div>
              <div class="budget-cat-amount">
                <span style="color:#999">¥</span>
                <input id="cat_${c.id}" type="number" step="0.01" value="${catBudget}" placeholder="0">
              </div>
            </div>
            ${hasPrevBudget ? `
            <div style="margin-top:6px;padding:6px 10px;background:#f8f9fb;border-radius:6px;font-size:11px;color:#666">
              上月结转：<span style="color:${coClr};font-weight:600">${coText || '0'}</span> ·
              总体可支配：<span style="font-weight:600;color:#4A90D9">¥${fmtMoney(totalDisposable)}</span>
            </div>` : ''}
            ${catBudget > 0 && c.subCategories.length ? `
              <div class="budget-sub-list">
                ${c.subCategories.map(s => `
                  <div class="budget-sub-item">
                    <div class="budget-sub-name">· ${s.name}</div>
                    <div class="budget-sub-amount">
                      <span style="color:#999;font-size:12px">¥</span>
                      <input id="sub_${s.id}" type="number" step="0.01" value="${subBudgets[s.id] || 0}" placeholder="0">
                    </div>
                  </div>`).join('')}
              </div>` : ''}
          </div>`;
      }).join('')}

      ${cats.length === 0 ? `
        <div class="text-center text-muted" style="padding:40px">
          暂无分类，请先点右上角「管理分类」创建
        </div>` : ''}
    </div>

    <div style="padding:16px">
      <button class="btn btn-primary btn-block" onclick="saveBudget()">保存预算方案</button>
    </div>
  `;
}

// 一键应用上月结转：将结转金额加到各分类当前输入值上
function applyCarryover() {
  const ledger = getCurrentLedger();
  const ym = state.currentMonth;
  const [py, pm] = ym.split('-').map(Number);
  const prevYm = new Date(py, pm - 2, 1).toISOString().slice(0, 7);
  const prevStats = getMonthCategoryStats(ledger.id, prevYm);
  prevStats.cats.forEach(pc => {
    const inp = document.getElementById('cat_' + pc.cat.id);
    if (!inp) return;
    const cur = parseFloat(inp.value) || 0;
    const isSavings = pc.cat.kind === 'savings';
    const co = isSavings ? Math.max(0, pc.spent - pc.budget) : pc.surplus;
    inp.value = (Math.round((cur + co) * 100) / 100).toFixed(2);
  });
  toast('已应用上月结转');
}

function saveBudget() {
  window._syncBudget();
  // 记录预算设置日期，作为周期第1日
  const ledger = getCurrentLedger();
  const key = ledger.id + '_' + state.currentMonth;
  const budget = state.budgets[key];
  if (budget) budget.setDate = Date.now();
  save();
  toast('预算已保存 💪');
  setTimeout(() => navigate('home'), 500);
}

// ============ 4.3 分类管理 ============
function renderCatManage(app) {
  const ledger = getCurrentLedger();
  if (!ledger) { app.innerHTML = '<div class="empty">请先创建账本</div>'; return; }
  const cats = state.categories[ledger.id] || [];
  const emojis = ['🏠', '💰', '📚', '🎮', '💳', '🍔', '🚗', '✈️', '🎁', '💊', '💡', '🏋️'];

  app.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center" onclick="navigate('budgetAllocate')">
        <span style="font-size:20px;margin-right:10px">‹</span>
        <span class="page-title">分类管理</span>
      </div>
    </div>

    <div style="padding:0 16px 16px">
      ${cats.map(c => {
        const isSavings = c.kind === 'savings';
        const isDebt = c.kind === 'debt';
        const kindTag = isSavings ? '储蓄类' : (isDebt ? '负债类' : '支出类');
        const kindColor = isSavings ? '#f39c12' : (isDebt ? '#8e44ad' : '#4A90D9');
        return `
        <div class="manage-cat-section">
          <div class="manage-cat-title">${c.emoji} ${c.name}
            <span style="font-size:10px;color:${kindColor};margin-left:4px">${kindTag}</span>
            <span style="font-size:10px;color:#999;margin-left:6px">日均${c.dailyLabel}</span>
            <span style="float:right">
              <button class="btn btn-secondary" style="padding:2px 10px;font-size:12px" onclick="toggleCatKind('${c.id}')">${isSavings || isDebt ? '改为支出' : '改为储蓄'}</button>
              <button class="btn btn-secondary" style="padding:2px 10px;font-size:12px" onclick="editDailyLabel('${c.id}')">改标签</button>
              <button class="btn btn-secondary" style="padding:2px 10px;font-size:12px" onclick="editCat('${c.id}','name')">重命名</button>
              <button class="btn btn-danger" style="padding:2px 10px;font-size:12px" onclick="delCat('${c.id}')">删除</button>
            </span>
          </div>
          <div>
            ${c.subCategories.map(s => `
              <div class="manage-sub-item">
                <div class="manage-sub-name">· ${s.name}</div>
                <button class="btn btn-secondary" style="padding:2px 10px;font-size:12px" onclick="editSub('${c.id}','${s.id}')">改名</button>
                <button class="btn btn-danger" style="padding:2px 10px;font-size:12px;margin-left:6px" onclick="delSub('${c.id}','${s.id}')">删</button>
              </div>`).join('')}
            <button class="btn btn-outline" style="width:100%;margin-top:6px;padding:8px;font-size:13px" onclick="addSub('${c.id}')">+ 新增子分类</button>
          </div>
        </div>`;
      }).join('')}

      <button class="btn btn-primary btn-block mt-16" onclick="addCat()">+ 新增大分类</button>
      ${cats.length ? `
        <div style="margin-top:20px;padding:12px;font-size:12px;color:#999;background:#f8f9fb;border-radius:8px;line-height:1.6">
          💡 <strong>支出类</strong>：日均标签默认"可支配"，剩余日均偏低=花太快（红色）<br>
          💡 <strong>储蓄类</strong>：日均标签默认"需储蓄"，剩余日均偏高=储蓄进度落后（红色）<br>
          💡 <strong>负债类</strong>：日均标签默认"需还款"，剩余日均偏高=还款进度落后（红色）<br>
          ✏️ 点"改标签"可自定义日均显示文字（如"可投资"、"可娱乐"等）<br>
          ⚠️ 删除分类不会删除已有支出记录，但统计时将无法显示该分类。
        </div>` : ''}
    </div>
  `;
}

async function addCat() {
  const ledger = getCurrentLedger();
  const name = await inputDialog('新增大分类', '如：医疗健康');
  if (!name) return;
  const emojis = ['🏠', '💰', '📚', '🎮', '💳', '🍔', '🚗', '✈️', '🎁', '💊', '💡', '🏋️'];
  const used = (state.categories[ledger.id] || []).map(c => c.emoji);
  const emoji = emojis.find(e => !used.includes(e)) || '📌';
  state.categories[ledger.id].push({ id: uid('C'), name: name.trim(), emoji, kind: 'expense', dailyLabel: '可支配', subCategories: [] });
  save(); toast('已添加'); render();
}

async function editCat(cid, field) {
  const ledger = getCurrentLedger();
  const cat = state.categories[ledger.id].find(c => c.id === cid);
  if (!cat) return;
  const name = await inputDialog('重命名大分类', '', cat.name);
  if (!name) return;
  cat.name = name.trim(); save(); toast('已修改'); render();
}

function toggleCatKind(cid) {
  const ledger = getCurrentLedger();
  const cat = state.categories[ledger.id].find(c => c.id === cid);
  if (!cat) return;
  if (cat.kind === 'expense') {
    cat.kind = 'savings';
    cat.dailyLabel = '需储蓄';
  } else if (cat.kind === 'savings') {
    cat.kind = 'debt';
    cat.dailyLabel = '需还款';
  } else {
    cat.kind = 'expense';
    cat.dailyLabel = '可支配';
  }
  save();
  toast(cat.kind === 'savings' ? '已设为储蓄类' : (cat.kind === 'debt' ? '已设为负债类' : '已设为支出类'));
  render();
}

async function editDailyLabel(cid) {
  const ledger = getCurrentLedger();
  const cat = state.categories[ledger.id].find(c => c.id === cid);
  if (!cat) return;
  const label = await inputDialog('自定义日均标签', '如：可投资、可娱乐、需还款...', cat.dailyLabel);
  if (label != null && label.trim()) {
    cat.dailyLabel = label.trim();
    save(); toast('标签已更新'); render();
  }
}

async function delCat(cid) {
  const ok = await confirmDialog('删除分类', '确定删除该大分类及其所有子分类？已有支出记录不受影响。');
  if (!ok) return;
  const ledger = getCurrentLedger();
  state.categories[ledger.id] = state.categories[ledger.id].filter(c => c.id !== cid);
  // 清除该分类的预算
  Object.values(state.budgets).forEach(b => {
    delete b.cats[cid]; if (b.subs) delete b.subs[cid];
  });
  save(); toast('已删除'); render();
}

async function addSub(cid) {
  const name = await inputDialog('新增子分类', '如：医疗费');
  if (!name) return;
  const ledger = getCurrentLedger();
  const cat = state.categories[ledger.id].find(c => c.id === cid);
  cat.subCategories.push({ id: uid('S'), name: name.trim() });
  save(); toast('已添加'); render();
}

async function editSub(cid, sid) {
  const ledger = getCurrentLedger();
  const sub = state.categories[ledger.id].find(c => c.id === cid)?.subCategories.find(s => s.id === sid);
  if (!sub) return;
  const name = await inputDialog('重命名子分类', '', sub.name);
  if (!name) return;
  sub.name = name.trim(); save(); toast('已修改'); render();
}

async function delSub(cid, sid) {
  const ok = await confirmDialog('删除子分类', '确定删除该子分类？');
  if (!ok) return;
  const ledger = getCurrentLedger();
  const cat = state.categories[ledger.id].find(c => c.id === cid);
  cat.subCategories = cat.subCategories.filter(s => s.id !== sid);
  Object.values(state.budgets).forEach(b => {
    if (b.subs && b.subs[cid]) delete b.subs[cid][sid];
  });
  save(); toast('已删除'); render();
}

// ============ 5. 我的 ============
function renderMe(app) {
  const { reminderTime, reminderEnabled } = state.settings;
  const totalExpenses = state.expenses.length;
  const totalAmount = state.expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);

  app.innerHTML = `
    <div class="profile-header">
      <div class="profile-avatar">📒</div>
      <div class="profile-name">简洁记账</div>
      <div style="font-size:12px;opacity:0.85;margin-top:4px">
        账本 ${state.ledgers.length} · 总记录 ${totalExpenses} 笔 · 累计 ¥${fmtMoney(totalAmount)}
      </div>
    </div>

    <div class="menu-list">
      <div class="menu-item" onclick="navigate('skin')">
        <div class="menu-icon">🎨</div>
        <div class="menu-label">皮肤设置</div>
        <div class="menu-value">A ${SKIN_COLORS[state.settings.skin.a].name} · B ${SKIN_COLORS[state.settings.skin.b].name}</div>
        <div class="menu-arrow">›</div>
      </div>
      <div class="menu-item" onclick="navigate('settingsReminder')">
        <div class="menu-icon">⏰</div>
        <div class="menu-label">每日提醒记账</div>
        <div class="menu-value">${reminderEnabled ? '已开启 · ' + reminderTime : '未开启'}</div>
        <div class="menu-arrow">›</div>
      </div>
      <div class="menu-item" onclick="navigate('catManage')">
        <div class="menu-icon">🏷️</div>
        <div class="menu-label">分类管理</div>
        <div class="menu-arrow">›</div>
      </div>
      <div class="menu-item" onclick="navigate('classifyList')">
        <div class="menu-icon">📥</div>
        <div class="menu-label">未分类支出</div>
        <div class="menu-value">${state.expenses.filter(e => !e.categoryId).length} 笔</div>
        <div class="menu-arrow">›</div>
      </div>
    </div>

    <div class="menu-list">
      <div class="menu-item" onclick="navigate('dataBackup')">
        <div class="menu-icon">💾</div>
        <div class="menu-label">数据备份与恢复</div>
        <div class="menu-arrow">›</div>
      </div>
      <div class="menu-item" onclick="notifyTest()">
        <div class="menu-icon">🔔</div>
        <div class="menu-label">测试系统通知权限</div>
        <div class="menu-arrow">›</div>
      </div>
      <div class="menu-item" onclick="showAbout()">
        <div class="menu-icon">ℹ️</div>
        <div class="menu-label">关于</div>
        <div class="menu-arrow">›</div>
      </div>
    </div>

    <div style="text-align:center;color:#bbb;font-size:12px;padding:20px">
      本地离线 · 数据仅保存在本设备
    </div>
  `;
}

// ============ 5.1 提醒设置 ============
function renderSettingsReminder(app) {
  const { reminderTime, reminderEnabled } = state.settings;
  const [h, mm] = (reminderTime || '21:00').split(':');

  app.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center" onclick="navigate('me')">
        <span style="font-size:20px;margin-right:10px">‹</span>
        <span class="page-title">每日提醒</span>
      </div>
    </div>

    <div style="padding:16px">
      <div class="card">
        <div class="flex-between mb-12">
          <span style="font-weight:600">启用提醒</span>
          <div style="width:50px;height:28px;border-radius:14px;background:${reminderEnabled ? '#4A90D9' : '#ddd'};position:relative;cursor:pointer"
            onclick="toggleReminder()">
            <div style="position:absolute;top:2px;left:${reminderEnabled ? '24px' : '2px'};width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 2px 4px rgba(0,0,0,0.2);transition:all 0.2s"></div>
          </div>
        </div>
        <div style="font-size:12px;color:#888;line-height:1.5">
          开启后，每天设定时间会通过系统通知（如已授权）和应用内弹窗方式提醒你记录当日支出。
        </div>
      </div>

      <div class="card mt-16">
        <div class="label mb-12 text-center">选择提醒时间</div>
        <div class="time-picker-wrap">
          <div class="time-picker">
            <select id="hourSel">
              ${Array.from({ length: 24 }, (_, i) =>
                `<option value="${String(i).padStart(2, '0')}" ${i === +h ? 'selected' : ''}>${String(i).padStart(2, '0')}</option>`
              ).join('')}
            </select>
            <span style="font-size:24px;font-weight:600;color:#666">:</span>
            <select id="minSel">
              ${Array.from({ length: 60 }, (_, i) =>
                `<option value="${String(i).padStart(2, '0')}" ${i === +mm ? 'selected' : ''}>${String(i).padStart(2, '0')}</option>`
              ).join('')}
            </select>
          </div>
        </div>
      </div>

      <button class="btn btn-primary btn-block mt-16" onclick="saveReminder()">保存设置</button>

      <div style="margin-top:16px;padding:14px;background:#fff8e1;border-radius:10px;font-size:12px;color:#8a6d00;line-height:1.6">
        💡 <strong>两种提醒方式：</strong><br>
        1. <strong>系统通知栏推送</strong>：需要浏览器授权通知权限，且应用需要被浏览器保持运行（如Chrome/Edge/Safari添加到桌面后）<br>
        2. <strong>应用内弹窗提醒</strong>：打开应用时，若到达提醒时间且当天未提醒，会立即弹出提示
      </div>
    </div>
  `;
}

function toggleReminder() {
  state.settings.reminderEnabled = !state.settings.reminderEnabled;
  save();
  render();
}

function saveReminder() {
  const h = $('hourSel').value;
  const m = $('minSel').value;
  state.settings.reminderTime = `${h}:${m}`;
  save();
  if (state.settings.reminderEnabled && 'Notification' in window) {
    Notification.requestPermission();
  }
  toast('设置已保存');
  setTimeout(() => navigate('me'), 400);
}

// ============ 皮肤设置 ============
function renderSkin(app) {
  const skin = state.settings.skin || { a: 'pink', b: 'cream' };
  const a = SKIN_COLORS[skin.a];
  const b = SKIN_COLORS[skin.b];

  const colorDots = (part, selected) => Object.entries(SKIN_COLORS).map(([key, c]) => `
    <div class="skin-color-dot ${selected === key ? 'selected' : ''}"
      style="background:${c.main};color:${c.text}"
      onclick="setSkinColor('${part}','${key}')" title="${c.name}"></div>
  `).join('');

  app.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center" onclick="navigate('me')">
        <span style="font-size:20px;margin-right:10px">‹</span>
        <span class="page-title">皮肤设置</span>
      </div>
    </div>

    <div class="skin-section">
      <div class="skin-preview">
        <div class="skin-preview-a" style="background:${a.main};color:${a.text}">顶部 A</div>
        <div class="skin-preview-b" style="background:${b.main};color:${b.text}">功能栏 B</div>
      </div>

      <div class="skin-picker-group">
        <div class="skin-picker-label">A · 顶部区域（首页头部/预算/按钮）</div>
        <div class="skin-color-list">${colorDots('a', skin.a)}</div>
      </div>

      <div class="skin-picker-group">
        <div class="skin-picker-label">B · 功能栏区域（底部导航）</div>
        <div class="skin-color-list">${colorDots('b', skin.b)}</div>
      </div>

      <div style="margin-top:20px;padding:14px;background:#fff8e1;border-radius:10px;font-size:12px;color:#8a6d00;line-height:1.6">
        💡 可选颜色：淡粉色、奶黄色、黑色、白色、薄荷绿、天蓝色。A 和 B 可自由搭配，也可选择相同颜色。
      </div>
    </div>
  `;
}

function setSkinColor(part, key) {
  state.settings.skin[part] = key;
  save();
  applySkin();
  render();
}

// ============ 未分类支出 ============
function renderClassifyList(app) {
  const ledger = getCurrentLedger();
  if (!ledger) { app.innerHTML = '<div class="empty">请先创建账本</div>'; return; }
  const list = state.expenses
    .filter(e => e.ledgerId === ledger.id && !e.categoryId)
    .sort((a, b) => b.date - a.date);

  app.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center" onclick="navigate('home')">
        <span style="font-size:20px;margin-right:10px">‹</span>
        <span class="page-title">未分类支出（${list.length}）</span>
      </div>
    </div>

    <div style="padding:12px 16px">
      ${list.length ? list.map(e => `
        <div class="classify-item" onclick="navigate('classifyOne',{id:'${e.id}'})">
          <div class="classify-head">
            <div class="classify-amount">-¥${fmtMoney(e.amount)}</div>
            <div class="classify-date">${fmtDate(e.date)}</div>
          </div>
          ${e.note ? `<div class="classify-note">📝 ${e.note}</div>` : ''}
          <button class="btn btn-primary" style="padding:8px 16px;font-size:13px">去分类 →</button>
        </div>`).join('') : `
        <div class="empty"><div class="empty-icon">🎉</div><div>全部完成！没有未分类的支出</div></div>`}
    </div>
  `;
}

function renderClassifyOne(app, params) {
  const e = state.expenses.find(x => x.id === params.id);
  if (!e) { navigate('classifyList'); return; }
  const ledger = state.ledgers.find(l => l.id === e.ledgerId);
  const cats = state.categories[e.ledgerId] || [];
  if (!window._classifyState || window._classifyState.expenseId !== e.id) {
    window._classifyState = { expenseId: e.id, catId: null, subId: null };
  }
  const st = window._classifyState;
  const selectedCat = cats.find(c => c.id === st.catId);
  const subCats = selectedCat ? selectedCat.subCategories : [];

  app.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center" onclick="navigate('classifyList')">
        <span style="font-size:20px;margin-right:10px">‹</span>
        <span class="page-title">分类支出</span>
      </div>
    </div>

    <div style="padding:16px">
      <div class="card">
        <div class="flex-between mb-8">
          <span class="text-muted">${fmtDate(e.date)}</span>
          <span class="text-muted">${ledger?.icon} ${ledger?.name}</span>
        </div>
        <div style="font-size:32px;font-weight:700;color:#e74c3c;margin:8px 0">-¥${fmtMoney(e.amount)}</div>
        ${e.note ? `<div style="color:#666;font-size:13px;background:#f8f9fb;padding:8px 10px;border-radius:6px;margin-top:8px">📝 ${e.note}</div>` : ''}
      </div>

      <div class="card mt-16">
        <div class="section-label">选择大分类</div>
        ${cats.length ? `
        <div class="cat-grid">
          ${cats.map(c => `
            <div class="cat-item ${st.catId === c.id ? 'selected' : ''}" onclick="pickCat('${c.id}')">
              <div class="cat-emoji">${c.emoji}</div>
              <div class="cat-name">${c.name}</div>
            </div>`).join('')}
        </div>` : ''}
        ${selectedCat && subCats.length ? `
          <div style="margin-top:16px">
            <div class="section-label">选择子分类（选填）</div>
            <div class="sub-cat-scroll">
              ${subCats.map(s => `
                <div class="sub-tag ${st.subId === s.id ? 'selected' : ''}" onclick="pickSub('${s.id}')">${s.name}</div>`).join('')}
              <div class="sub-tag add-btn" onclick="addSubInClassify()">+ 新增</div>
            </div>
          </div>` : ''}
      </div>

      <button class="btn btn-primary btn-block mt-16" onclick="submitClassify()">保存分类</button>
      <button class="btn btn-secondary btn-block mt-12" onclick="deleteExpense('${e.id}','classifyList')">删除该笔支出</button>
    </div>
  `;
}

function pickCat(id) {
  window._classifyState.catId = window._classifyState.catId === id ? null : id;
  window._classifyState.subId = null;
  render();
}
function pickSub(id) {
  window._classifyState.subId = window._classifyState.subId === id ? null : id;
  render();
}
async function addSubInClassify() {
  const st = window._classifyState;
  if (!st.catId) { toast('请先选择大分类'); return; }
  const name = await inputDialog('新增子分类', '');
  if (!name) return;
  const cat = (state.categories[state.currentLedgerId] || []).find(c => c.id === st.catId);
  if (cat) {
    cat.subCategories.push({ id: uid('S'), name: name.trim() });
    save(); render();
  }
}
function submitClassify() {
  const st = window._classifyState;
  if (!st.catId) { toast('请至少选择大分类'); return; }
  const e = state.expenses.find(x => x.id === st.expenseId);
  if (e) {
    e.categoryId = st.catId;
    e.subCategoryId = st.subId;
    save();
    toast('已分类 ✅');
    setTimeout(() => navigate('classifyList'), 400);
  }
}

// ============ 支出详情 + 删除 ============
function renderExpenseDetail(app, params) {
  const e = state.expenses.find(x => x.id === params.id);
  if (!e) { navigate('home'); return; }
  const ledger = state.ledgers.find(l => l.id === e.ledgerId);
  let catName = '未分类', subName = '', emoji = '❓';
  if (e.categoryId) {
    const cat = getCategoryById(e.ledgerId, e.categoryId);
    if (cat) { catName = cat.name; emoji = cat.emoji; }
    if (e.subCategoryId) {
      const sub = getSubCategoryById(e.ledgerId, e.categoryId, e.subCategoryId);
      if (sub) subName = sub.name;
    }
  }

  app.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center" onclick="history.back();navigate('home')">
        <span style="font-size:20px;margin-right:10px">‹</span>
        <span class="page-title">支出详情</span>
      </div>
    </div>

    <div class="detail-info">
      <div style="text-align:center;padding:20px 0">
        <div style="font-size:14px;color:#888">${fmtDate(e.date)}</div>
        <div style="font-size:40px;font-weight:700;color:#e74c3c;margin:10px 0">-¥${fmtMoney(e.amount)}</div>
        <div style="color:#666">${ledger?.icon} ${ledger?.name}</div>
      </div>

      <div class="card" style="margin:0">
        <div class="detail-row">
          <div class="detail-key">分类</div>
          <div class="detail-val">${emoji} ${catName}${subName ? ' · ' + subName : ''}${e.categoryId ? '' : ' <span class="text-warning">(未分类)</span>'}</div>
        </div>
        <div class="detail-row">
          <div class="detail-key">备注</div>
          <div class="detail-val">${e.note || '—'}</div>
        </div>
        <div class="detail-row">
          <div class="detail-key">记录时间</div>
          <div class="detail-val">${fmtDate(e.date)}</div>
        </div>
      </div>

      <div style="padding:0;margin-top:20px">
        <button class="btn btn-primary btn-block mb-12" onclick="navigate('editExpense',{id:'${e.id}'})">✏️ 编辑该记录</button>
        ${!e.categoryId ? `<button class="btn btn-secondary btn-block mb-12" onclick="navigate('classifyOne',{id:'${e.id}'})">补充分类</button>` : ''}
        <button class="btn btn-danger btn-block" onclick="deleteExpense('${e.id}','home')">删除该条记录</button>
      </div>
    </div>
  `;
}

async function editNote(id) {
  const e = state.expenses.find(x => x.id === id);
  if (!e) return;
  const note = await inputDialog('修改备注', '', e.note);
  if (note != null) { e.note = note.trim(); save(); toast('已保存'); render(); }
}

// ============ 编辑支出记录 ============
let editExpenseState = { id: null, amount: '', note: '', categoryId: null, subCategoryId: null, date: 0 };

function renderEditExpense(app, params) {
  const e = state.expenses.find(x => x.id === params.id);
  if (!e) { navigate('home'); return; }
  // 初始化编辑状态
  if (editExpenseState.id !== e.id) {
    editExpenseState = {
      id: e.id,
      amount: String(e.amount),
      note: e.note || '',
      categoryId: e.categoryId,
      subCategoryId: e.subCategoryId,
      date: e.date
    };
  }
  const ledger = getCurrentLedger();
  const cats = state.categories[ledger.id] || [];
  const selectedCat = cats.find(c => c.id === editExpenseState.categoryId);
  const subCats = selectedCat ? selectedCat.subCategories : [];
  const dateStr = new Date(editExpenseState.date).toISOString().slice(0, 10);

  app.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center" onclick="navigate('expenseDetail',{id:'${e.id}'})">
        <span style="font-size:20px;margin-right:10px">‹</span>
        <span class="page-title">编辑记录</span>
      </div>
    </div>
    <div class="add-page">
      <div class="amount-section">
        <div class="amount-label">支出金额</div>
        <div class="amount-input-wrap">
          <span class="amount-yen">¥</span>
          <input id="editAmount" type="number" step="0.01" inputmode="decimal" class="amount-input"
            value="${editExpenseState.amount}" oninput="editExpenseState.amount=this.value" onfocus="this.select()">
        </div>
        <input id="editNote" type="text" class="note-input" placeholder="备注（选填）" value="${editExpenseState.note}"
          oninput="editExpenseState.note=this.value">
      </div>

      <div style="padding:12px 20px;background:#fff;border-bottom:1px solid #f5f5f5">
        <div style="display:flex;align-items:center;justify-content:space-between">
          <span style="font-size:13px;color:#666">📅 账单日期</span>
          <input id="editDate" type="date" value="${dateStr}"
            style="padding:6px 10px;border-radius:8px;background:#f5f7fa;font-size:14px;border:none"
            onchange="editExpenseState.date=new Date(this.value).getTime()">
        </div>
      </div>

      <div class="category-section">
        <div class="section-label">选择分类</div>
        ${cats.length ? `
        <div class="cat-grid">
          ${cats.map(c => `
            <div class="cat-item ${editExpenseState.categoryId === c.id ? 'selected' : ''}"
              onclick="editSelectCat('${c.id}')">
              <div class="cat-emoji">${c.emoji}</div>
              <div class="cat-name">${c.name}</div>
            </div>`).join('')}
        </div>
        ${selectedCat && subCats.length ? `
          <div style="margin-top:16px">
            <div class="section-label">选择子分类</div>
            <div class="sub-cat-scroll">
              ${subCats.map(s => `
                <div class="sub-tag ${editExpenseState.subCategoryId === s.id ? 'selected' : ''}"
                  onclick="editSelectSub('${s.id}')">${s.name}</div>`).join('')}
            </div>
          </div>` : ''}
        ` : '<div class="text-muted text-center" style="padding:20px">暂无分类</div>'}
      </div>

      <div style="padding:16px">
        <button class="btn btn-primary btn-block" onclick="saveEditExpense()">保存修改</button>
      </div>
    </div>
  `;
}

function editSelectCat(id) {
  if (editExpenseState.categoryId === id) editExpenseState.categoryId = null;
  else editExpenseState.categoryId = id;
  editExpenseState.subCategoryId = null;
  render();
}

function editSelectSub(id) {
  if (editExpenseState.subCategoryId === id) editExpenseState.subCategoryId = null;
  else editExpenseState.subCategoryId = id;
  render();
}

function saveEditExpense() {
  const amount = parseFloat(editExpenseState.amount);
  if (!amount || amount <= 0) { toast('请输入正确的金额'); return; }
  const e = state.expenses.find(x => x.id === editExpenseState.id);
  if (!e) { navigate('home'); return; }
  e.amount = Math.round(amount * 100) / 100;
  e.note = editExpenseState.note || '';
  e.date = editExpenseState.date;
  e.categoryId = editExpenseState.categoryId;
  e.subCategoryId = editExpenseState.subCategoryId;
  save();
  toast('修改成功 ✅');
  setTimeout(() => navigate('expenseDetail', { id: e.id }), 400);
}

async function deleteExpense(id, back = 'home') {
  const ok = await confirmDialog('删除记录', '确定删除该条支出记录？不可恢复。');
  if (!ok) return;
  state.expenses = state.expenses.filter(e => e.id !== id);
  save(); toast('已删除');
  setTimeout(() => navigate(back), 400);
}

// ============ 支出列表 ============
function renderExpenseList(app, params) {
  const ledger = getCurrentLedger();
  if (!ledger) { app.innerHTML = '<div class="empty">请先创建账本</div>'; return; }
  const ym = state.currentMonth;
  const [start, end] = getMonthRange(ym);
  const list = state.expenses
    .filter(e => e.ledgerId === ledger.id && e.date >= start && e.date < end)
    .sort((a, b) => b.date - a.date);

  app.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center" onclick="navigate('home')">
        <span style="font-size:20px;margin-right:10px">‹</span>
        <span class="page-title">本月支出（${list.length}）</span>
      </div>
    </div>
    <div style="padding:12px 16px">
      ${list.length ? list.map(renderExpenseItem).join('') :
        '<div class="empty"><div class="empty-icon">📭</div><div>本月暂无记录</div></div>'}
    </div>
  `;
}

// ============ 数据备份恢复 ============
function renderDataBackup(app) {
  app.innerHTML = `
    <div class="page-header">
      <div style="display:flex;align-items:center" onclick="navigate('me')">
        <span style="font-size:20px;margin-right:10px">‹</span>
        <span class="page-title">数据备份与恢复</span>
      </div>
    </div>

    <div style="padding:16px">
      <div class="card">
        <div style="font-weight:600;margin-bottom:8px">📤 导出数据（备份）</div>
        <div style="font-size:12px;color:#888;line-height:1.6;margin-bottom:12px">
          将所有账本、分类、预算、支出记录导出为文本文件，可保存到本地或发送到其他地方作为备份。
        </div>
        <button class="btn btn-primary btn-block" onclick="exportData()">导出 JSON 文件</button>
        <button class="btn btn-secondary btn-block mt-12" onclick="copyData()">复制数据到剪贴板</button>
      </div>

      <div class="card mt-16">
        <div style="font-weight:600;margin-bottom:8px">📥 导入数据（恢复）</div>
        <div style="font-size:12px;color:#e74c3c;line-height:1.6;margin-bottom:12px">
          ⚠️ 导入会<strong>覆盖当前全部数据</strong>，请谨慎操作，建议先导出备份！
        </div>
        <input type="file" id="importFile" accept=".json,application/json" style="display:none" onchange="importData(this)">
        <button class="btn btn-outline btn-block" onclick="$('importFile').click()">选择文件导入</button>
        <div style="text-align:center;font-size:12px;color:#999;margin:12px 0">或</div>
        <textarea id="importArea" class="input" rows="4" placeholder="粘贴备份的 JSON 文本到这里..." style="resize:vertical;height:80px;font-size:12px"></textarea>
        <button class="btn btn-danger btn-block mt-12" onclick="importFromText()">从文本导入（覆盖）</button>
      </div>

      <div class="card mt-16" style="background:#fff0f0">
        <div style="font-weight:600;margin-bottom:8px;color:#e74c3c">☠️ 危险操作</div>
        <button class="btn btn-danger btn-block" onclick="clearAllData()">清空所有数据</button>
      </div>
    </div>
  `;
}

function exportData() {
  const dataStr = JSON.stringify(state, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const d = new Date();
  const fname = `ledger_backup_${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
  a.download = fname;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  toast('导出文件已生成');
}

function copyData() {
  const dataStr = JSON.stringify(state, null, 2);
  const ta = document.createElement('textarea');
  ta.value = dataStr; document.body.appendChild(ta); ta.select();
  try {
    document.execCommand('copy');
    toast('已复制到剪贴板');
  } catch (e) { toast('复制失败，请手动复制'); }
  document.body.removeChild(ta);
}

function importData(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      const ok = await confirmDialog('确认导入', '将覆盖全部现有数据，是否继续？');
      if (!ok) return;
      state = data; save();
      toast('导入成功，正在重启');
      setTimeout(() => location.reload(), 800);
    } catch (err) {
      toast('文件格式错误');
    }
  };
  reader.readAsText(file);
  input.value = '';
}

async function importFromText() {
  const txt = $('importArea').value.trim();
  if (!txt) { toast('请先粘贴内容'); return; }
  try {
    const data = JSON.parse(txt);
    const ok = await confirmDialog('确认导入', '将覆盖全部现有数据，是否继续？');
    if (!ok) return;
    state = data; save();
    toast('导入成功');
    setTimeout(() => location.reload(), 800);
  } catch (err) {
    toast('JSON 格式错误');
  }
}

async function clearAllData() {
  const ok = await confirmDialog('确认清空', '将删除所有账本、分类、预算、支出记录，且不可恢复！真的要清空吗？');
  if (!ok) return;
  const ok2 = await confirmDialog('再次确认', '最后确认一次：真的要清空所有数据吗？');
  if (!ok2) return;
  state = getDefaultData(); save();
  toast('已重置');
  setTimeout(() => location.reload(), 500);
}

// ============ 通知测试 + 关于 ============
function notifyTest() {
  if (!('Notification' in window)) {
    toast('当前浏览器不支持系统通知');
    return;
  }
  if (Notification.permission === 'granted') {
    new Notification('简洁记账', { body: '📒 这是一条测试通知，收到表示系统推送可用！', icon: 'icons/icon-192.svg' });
    toast('通知已发送，请查看通知栏');
  } else if (Notification.permission === 'denied') {
    toast('通知权限被拒绝，请在浏览器设置中手动开启');
  } else {
    Notification.requestPermission().then(p => {
      if (p === 'granted') {
        new Notification('简洁记账', { body: '✅ 授权成功！从现在起可以推送通知啦' });
        toast('授权成功');
      } else {
        toast('未授权通知');
      }
    });
  }
}

function showAbout() {
  alert([
    '简洁记账 1.0',
    '',
    '✅ 多账本管理',
    '✅ 每月预算分配',
    '✅ 手动分类记录',
    '✅ 定时提醒记账',
    '✅ 数据统计图表',
    '',
    '💾 全部数据本地存储',
    '🔒 不联网、不上传任何数据',
    '',
    '数据保存在您的浏览器中，清除浏览器数据会同时清除记账数据，建议定期导出备份。'
  ].join('\n'));
}

// ============ 定时提醒检查（每次打开页面时执行） ============
function checkReminder() {
  const { reminderEnabled, reminderTime, lastReminderDate } = state.settings;
  if (!reminderEnabled || !reminderTime) return;
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  if (lastReminderDate === today) return; // 今天已经提醒过
  const [h, mm] = reminderTime.split(':').map(Number);
  const reminderTimeToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), h, mm);
  if (now >= reminderTimeToday) {
    // 今天到点了
    state.settings.lastReminderDate = today;
    save();
    // 应用内弹窗
    setTimeout(async () => {
      const ok = await confirmDialog('⏰ 记账提醒', '到每日记账时间啦！现在去记录今天的支出吧？');
      if (ok) navigate('add');
    }, 500);
    // 系统通知
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification('⏰ 每日记账提醒', {
          body: '到时间啦，记录一下今天的花销吧！',
          icon: 'icons/icon-192.svg',
          tag: 'daily-reminder-' + today
        });
      } catch (e) {}
    }
  }
}

// ============ 启动 ============
document.addEventListener('DOMContentLoaded', () => {
  // 底部导航点击
  document.querySelectorAll('.nav-item').forEach(el => {
    el.addEventListener('click', () => {
      const page = el.dataset.page;
      if (page) navigate(page);
    });
  });
  // 首次初始化
  if (!Store.get()) {
    save();
  }
  navigate('home', { scrollTop: 0 });
  // 检查提醒
  setTimeout(checkReminder, 1000);
});
