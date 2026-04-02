let data = null;

const ICONS = {
  'credit-card': '💳',
  'phone': '📱',
  'wifi': '🌐',
  'receipt': '📄',
  'home': '🏠',
  'zap': '⚡',
  'droplet': '💧'
};

const URGENCY_LABELS = {
  'overdue': '已逾期',
  'urgent': '即將到期',
  'warning': '即將到期'
};

// Init
document.addEventListener('DOMContentLoaded', () => {
  data = initData();

  if (!isSetupDone(data)) {
    showSetupWizard();
  } else {
    data = ensureCurrentPeriodBills(data);
    showApp();
  }

  initTabs();
  registerSW();
});

// Setup Wizard
function showSetupWizard() {
  document.getElementById('setupWizard').style.display = 'block';
  document.getElementById('appHeader').style.display = 'none';
  document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
  document.querySelector('.tab-bar').style.display = 'none';

  // Add one empty row to start
  addSetupRow();
}

function addSetupRow(name, icon, dueDay, closingDay) {
  const list = document.getElementById('setupList');
  const row = document.createElement('div');
  row.className = 'setup-row';
  row.innerHTML = `
    <select class="setup-icon-select">
      <option value="credit-card" ${icon === 'phone' || icon === 'wifi' || icon === 'zap' || icon === 'droplet' || icon === 'home' ? '' : 'selected'}>💳</option>
      <option value="phone" ${icon === 'phone' ? 'selected' : ''}>📱</option>
      <option value="wifi" ${icon === 'wifi' ? 'selected' : ''}>🌐</option>
      <option value="zap" ${icon === 'zap' ? 'selected' : ''}>⚡</option>
      <option value="droplet" ${icon === 'droplet' ? 'selected' : ''}>💧</option>
      <option value="home" ${icon === 'home' ? 'selected' : ''}>🏠</option>
      <option value="receipt">📄</option>
    </select>
    <input type="text" placeholder="名稱" value="${name || ''}" class="setup-name-input">
    <span class="setup-due-label">結帳</span>
    <input type="number" min="1" max="31" placeholder="-" class="setup-closing-input" value="${closingDay || ''}" style="width:42px">
    <span class="setup-due-label">繳費</span>
    <input type="number" min="1" max="31" value="${dueDay || 15}" class="setup-due-input" style="width:42px">
    <span class="setup-due-label">號</span>
    <button class="setup-remove" onclick="this.parentElement.remove();updateSetupBtn()">✕</button>
  `;
  list.appendChild(row);

  // Focus the name input if empty
  if (!name) {
    row.querySelector('.setup-name-input').focus();
  }

  updateSetupBtn();
}

function updateSetupBtn() {
  const rows = document.querySelectorAll('.setup-row');
  const hasAny = rows.length > 0;
  const btn = document.getElementById('setupDoneBtn');

  // Check if at least one row has a name
  let hasName = false;
  rows.forEach((row) => {
    if (row.querySelector('.setup-name-input').value.trim()) hasName = true;
  });

  btn.disabled = !hasAny || !hasName;
}

// Listen for input changes in setup
document.getElementById('setupList').addEventListener('input', updateSetupBtn);

function finishSetup() {
  const rows = document.querySelectorAll('.setup-row');

  rows.forEach((row) => {
    const name = row.querySelector('.setup-name-input').value.trim();
    const icon = row.querySelector('.setup-icon-select').value;
    const dueDay = parseInt(row.querySelector('.setup-due-input').value) || 15;
    const closingDayVal = row.querySelector('.setup-closing-input').value;
    const closingDay = closingDayVal ? Math.min(31, Math.max(1, parseInt(closingDayVal))) : null;

    if (name) {
      data = addBillType(data, name, Math.min(31, Math.max(1, dueDay)), icon, closingDay);
    }
  });

  data = completeSetup(data);
  data = ensureCurrentPeriodBills(data);

  // Hide wizard, show app
  document.getElementById('setupWizard').style.display = 'none';
  showApp();
}

function showApp() {
  document.getElementById('appHeader').style.display = '';
  document.querySelector('.tab-bar').style.display = '';
  document.getElementById('pageBills').classList.add('active');
  renderBills();
  renderHistory();
  renderSettings();
  updatePeriodLabel();
}

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js');
  }
}

// Tabs
function initTabs() {
  document.querySelectorAll('.tab-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
      document.querySelectorAll('.page').forEach((p) => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(btn.dataset.tab).classList.add('active');

      if (btn.dataset.tab === 'pageHistory') renderHistory();
      if (btn.dataset.tab === 'pageSettings') renderSettings();
    });
  });
}

function updatePeriodLabel() {
  const period = getCurrentPeriod();
  const [y, m] = period.split('-');
  document.getElementById('periodLabel').textContent = `${y} 年 ${parseInt(m)} 月`;
}

// Render Bills
function renderBills() {
  const period = getCurrentPeriod();
  const bills = getBillsByPeriod(data, period);

  const issued = bills.filter((b) => b.status === 'pending' && isBillIssued(b));
  const notIssued = bills.filter((b) => b.status === 'pending' && !isBillIssued(b));
  const paid = bills.filter((b) => b.status === 'paid');

  // Sort issued by urgency (most urgent first)
  issued.sort((a, b) => getDaysUntilDue(a) - getDaysUntilDue(b));
  // Sort not-issued by closing day
  notIssued.sort((a, b) => getDaysUntilClosing(a) - getDaysUntilClosing(b));

  // Stats
  const statsEl = document.getElementById('statsBar');
  statsEl.innerHTML = `
    <div class="stat-card">
      <div class="stat-num">${issued.length}</div>
      <div class="stat-label">待繳</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${notIssued.length}</div>
      <div class="stat-label">未出帳</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${paid.length}</div>
      <div class="stat-label">已繳</div>
    </div>
  `;

  const listEl = document.getElementById('billsList');
  let html = '';

  if (issued.length > 0) {
    html += '<div class="section-title">待繳帳單</div>';
    issued.forEach((bill) => {
      html += renderBillCard(bill);
    });
  }

  if (notIssued.length > 0) {
    html += '<div class="section-title">未出帳</div>';
    notIssued.forEach((bill) => {
      html += renderBillCard(bill);
    });
  }

  if (paid.length > 0) {
    html += '<div class="section-title">本月已繳</div>';
    paid.forEach((bill) => {
      html += renderBillCard(bill);
    });
  }

  if (bills.length === 0) {
    html = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>本月沒有帳單</p>
      </div>
    `;
  }

  listEl.innerHTML = html;
}

function renderBillCard(bill) {
  const urgency = getUrgency(bill);
  const icon = ICONS[bill.icon] || '📄';
  const days = getDaysUntilDue(bill);
  const checked = bill.status === 'paid';
  const issued = isBillIssued(bill);

  let metaText = '';
  if (bill.closingDay) {
    metaText += `結帳：${bill.closingDay} 號 · `;
  }
  metaText += `繳費：${bill.dueDay} 號`;

  if (checked) {
    metaText += ` · 已於 ${bill.paidDate} 繳費`;
  } else if (!issued) {
    const closingDays = getDaysUntilClosing(bill);
    if (closingDays === 0) metaText += ' · 今天出帳';
    else metaText += ` · ${closingDays} 天後出帳`;
  } else {
    if (days < 0) metaText += ` · 逾期 ${Math.abs(days)} 天`;
    else if (days === 0) metaText += ' · 今天到期';
    else metaText += ` · 還有 ${days} 天`;
  }

  let badgeHtml = '';
  if (checked) {
    badgeHtml = '<span class="bill-badge badge-paid">已繳</span>';
  } else if (urgency === 'not-issued') {
    badgeHtml = '<span class="bill-badge badge-not-issued">未出帳</span>';
  } else if (URGENCY_LABELS[urgency]) {
    badgeHtml = `<span class="bill-badge badge-${urgency}">${URGENCY_LABELS[urgency]}</span>`;
  }

  const clickable = urgency !== 'not-issued';

  return `
    <div class="bill-card urgency-${urgency}" ${clickable ? `onclick="togglePaid('${bill.id}')"` : ''}>
      <div class="bill-icon">${icon}</div>
      <div class="bill-info">
        <div class="bill-name">${bill.name}</div>
        <div class="bill-meta">${metaText}</div>
      </div>
      ${badgeHtml}
      ${clickable ? `
        <div class="bill-check ${checked ? 'checked' : ''}">
          ${checked ? '✓' : ''}
        </div>
      ` : ''}
    </div>
  `;
}

function togglePaid(billId) {
  const bill = data.bills.find((b) => b.id === billId);
  if (!bill) return;

  if (bill.status === 'pending') {
    data = markAsPaid(data, billId);
  } else {
    data = markAsUnpaid(data, billId);
  }
  renderBills();
}

// Render History
function renderHistory() {
  const paid = getPaidBills(data);
  const listEl = document.getElementById('historyList');

  if (paid.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📂</div>
        <p>還沒有繳費紀錄</p>
      </div>
    `;
    return;
  }

  // Group by period
  const groups = {};
  paid.forEach((b) => {
    if (!groups[b.period]) groups[b.period] = [];
    groups[b.period].push(b);
  });

  const sortedPeriods = Object.keys(groups).sort().reverse();
  let html = '';

  sortedPeriods.forEach((period, idx) => {
    const [y, m] = period.split('-');
    const items = groups[period];
    const openClass = idx === 0 ? 'open' : '';

    html += `
      <div class="history-month">
        <div class="history-month-header" onclick="this.nextElementSibling.classList.toggle('open')">
          <span>${y} 年 ${parseInt(m)} 月（${items.length} 筆）</span>
          <span class="toggle">▼</span>
        </div>
        <div class="history-items ${openClass}">
          ${items.map((b) => `
            <div class="history-item">
              <span class="hi-icon">${ICONS[b.icon] || '📄'}</span>
              <span class="hi-name">${b.name}</span>
              <span class="hi-date">${b.paidDate || ''}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

// Render Settings
function renderSettings() {
  const listEl = document.getElementById('settingsList');
  let html = '';

  data.billTypes.forEach((bt) => {
    html += `
      <div class="setting-item">
        <div class="si-left">
          <span class="si-icon">${ICONS[bt.icon] || '📄'}</span>
          <div>
            <div class="si-name">${bt.name}</div>
            <div class="si-detail">${bt.closingDay ? `結帳 ${bt.closingDay} 號 · ` : ''}繳費 ${bt.dueDay} 號</div>
          </div>
        </div>
        <button class="btn btn-outline" style="padding:6px 12px;font-size:12px" onclick="showEditModal('${bt.id}')">編輯</button>
      </div>
    `;
  });

  listEl.innerHTML = html;
}

// Modal: Add
function showAddModal() {
  document.getElementById('addModal').classList.add('active');
  document.getElementById('modalName').value = '';
  document.getElementById('modalClosingDay').value = '';
  document.getElementById('modalDueDay').value = '15';
  document.getElementById('modalIcon').value = 'receipt';
}

function closeAddModal() {
  document.getElementById('addModal').classList.remove('active');
}

function doAdd() {
  const name = document.getElementById('modalName').value.trim();
  const dueDay = parseInt(document.getElementById('modalDueDay').value);
  const closingDayVal = document.getElementById('modalClosingDay').value;
  const closingDay = closingDayVal ? Math.min(31, Math.max(1, parseInt(closingDayVal))) : null;
  const icon = document.getElementById('modalIcon').value;

  if (!name) return;
  if (dueDay < 1 || dueDay > 31) return;

  data = addBillType(data, name, dueDay, icon, closingDay);
  closeAddModal();
  renderBills();
  renderSettings();
}

// Edit (reuse add modal with modifications)
let editingTypeId = null;

function showEditModal(typeId) {
  editingTypeId = typeId;
  const bt = data.billTypes.find((t) => t.id === typeId);
  if (!bt) return;

  const modal = document.getElementById('addModal');
  modal.classList.add('active');
  modal.querySelector('h3').textContent = '編輯帳單項目';

  document.getElementById('modalName').value = bt.name;
  document.getElementById('modalClosingDay').value = bt.closingDay || '';
  document.getElementById('modalDueDay').value = bt.dueDay;
  document.getElementById('modalIcon').value = bt.icon;

  // Swap button
  const addBtn = modal.querySelector('.btn-primary');
  addBtn.textContent = '儲存';
  addBtn.onclick = doEdit;

  // Add delete button if not already there
  if (!document.getElementById('deleteBtn')) {
    const delBtn = document.createElement('button');
    delBtn.id = 'deleteBtn';
    delBtn.className = 'btn btn-danger';
    delBtn.style.cssText = 'flex:1';
    delBtn.textContent = '刪除';
    delBtn.onclick = doDelete;
    addBtn.parentElement.appendChild(delBtn);
  }
}

function doEdit() {
  if (!editingTypeId) return;

  const name = document.getElementById('modalName').value.trim();
  const dueDay = parseInt(document.getElementById('modalDueDay').value);
  const closingDayVal = document.getElementById('modalClosingDay').value;
  const closingDay = closingDayVal ? Math.min(31, Math.max(1, parseInt(closingDayVal))) : null;
  const icon = document.getElementById('modalIcon').value;

  if (!name || dueDay < 1 || dueDay > 31) return;

  data = updateBillType(data, editingTypeId, { name, dueDay, closingDay, icon });
  resetModal();
  renderBills();
  renderSettings();
}

function doDelete() {
  if (!editingTypeId) return;
  if (!confirm('確定要刪除這個帳單項目？相關的歷史紀錄也會一併刪除。')) return;

  data = deleteBillType(data, editingTypeId);
  resetModal();
  renderBills();
  renderSettings();
}

function resetModal() {
  editingTypeId = null;
  const modal = document.getElementById('addModal');
  modal.classList.remove('active');
  modal.querySelector('h3').textContent = '新增帳單項目';
  const addBtn = modal.querySelector('.btn-primary');
  addBtn.textContent = '新增';
  addBtn.onclick = doAdd;
  const delBtn = document.getElementById('deleteBtn');
  if (delBtn) delBtn.remove();
}

// Export / Import
function doExport() {
  exportData(data);
}

function doImport(event) {
  const file = event.target.files[0];
  if (!file) return;
  importData(file, (imported) => {
    data = imported;
    data = ensureCurrentPeriodBills(data);
    renderBills();
    renderHistory();
    renderSettings();
    alert('匯入成功！');
  });
  event.target.value = '';
}

// Close modal on overlay click
document.getElementById('addModal').addEventListener('click', (e) => {
  if (e.target === e.currentTarget) resetModal();
});
