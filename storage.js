const STORAGE_KEY = 'billTracker';

const DEFAULT_BILLS = [
  { id: '1', name: '信用卡 A', icon: 'credit-card', dueDay: 10, amount: null, note: '' },
  { id: '2', name: '信用卡 B', icon: 'credit-card', dueDay: 15, amount: null, note: '' },
  { id: '3', name: '信用卡 C', icon: 'credit-card', dueDay: 20, amount: null, note: '' },
  { id: '4', name: '信用卡 D', icon: 'credit-card', dueDay: 25, amount: null, note: '' },
  { id: '5', name: '信用卡 E', icon: 'credit-card', dueDay: 28, amount: null, note: '' },
  { id: '6', name: '電話費', icon: 'phone', dueDay: 15, amount: null, note: '' },
  { id: '7', name: '網路費', icon: 'wifi', dueDay: 20, amount: null, note: '' }
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function getCurrentPeriod() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getNextPeriod(period) {
  const [year, month] = period.split('-').map(Number);
  if (month === 12) return `${year + 1}-01`;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function loadData() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  return JSON.parse(raw);
}

function saveData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

function initData() {
  let data = loadData();
  if (data) return data;

  // First time: empty, setup wizard will fill it
  data = {
    billTypes: [],
    bills: [],
    settings: {
      theme: 'dark',
      setupDone: false
    }
  };
  saveData(data);
  return data;
}

function isSetupDone(data) {
  return data.settings && data.settings.setupDone;
}

function completeSetup(data) {
  data.settings.setupDone = true;
  saveData(data);
  return data;
}

function getBillsByPeriod(data, period) {
  return data.bills.filter((b) => b.period === period);
}

function getPendingBills(data, period) {
  return getBillsByPeriod(data, period).filter((b) => b.status === 'pending');
}

function getPaidBills(data) {
  return data.bills.filter((b) => b.status === 'paid');
}

function markAsPaid(data, billId, amount) {
  const bill = data.bills.find((b) => b.id === billId);
  if (!bill) return data;

  bill.status = 'paid';
  bill.paidDate = new Date().toISOString().slice(0, 10);
  if (amount !== undefined) bill.amount = amount;

  const nextPeriod = getNextPeriod(bill.period);
  const alreadyExists = data.bills.some(
    (b) => b.typeId === bill.typeId && b.period === nextPeriod
  );

  if (!alreadyExists) {
    data.bills.push({
      id: generateId(),
      typeId: bill.typeId,
      name: bill.name,
      icon: bill.icon,
      dueDay: bill.dueDay,
      closingDay: bill.closingDay || null,
      amount: null,
      period: nextPeriod,
      status: 'pending',
      paidDate: null,
      note: ''
    });
  }

  saveData(data);
  return data;
}

function markAsUnpaid(data, billId) {
  const bill = data.bills.find((b) => b.id === billId);
  if (!bill) return data;
  bill.status = 'pending';
  bill.paidDate = null;
  bill.amount = null;
  saveData(data);
  return data;
}

function formatAmount(amount) {
  if (amount == null || amount === '') return '';
  const n = Number(amount);
  if (isNaN(n)) return '';
  return 'NT$' + n.toLocaleString('en-US');
}

function updateBillType(data, typeId, updates) {
  const bt = data.billTypes.find((t) => t.id === typeId);
  if (!bt) return data;
  Object.assign(bt, updates);

  data.bills.forEach((b) => {
    if (b.typeId === typeId) {
      if (updates.name !== undefined) b.name = updates.name;
      if (updates.dueDay !== undefined) b.dueDay = updates.dueDay;
      if (updates.icon !== undefined) b.icon = updates.icon;
      if (updates.closingDay !== undefined) b.closingDay = updates.closingDay;
    }
  });

  saveData(data);
  return data;
}

function syncBillsWithTypes(data) {
  if (!data || !Array.isArray(data.billTypes) || !Array.isArray(data.bills)) return data;
  let changed = false;
  data.bills.forEach((b) => {
    const bt = data.billTypes.find((t) => t.id === b.typeId);
    if (!bt) return;
    if (b.name !== bt.name) { b.name = bt.name; changed = true; }
    if (b.icon !== bt.icon) { b.icon = bt.icon; changed = true; }
    if (b.dueDay !== bt.dueDay) { b.dueDay = bt.dueDay; changed = true; }
    const btClosing = bt.closingDay || null;
    const bClosing = b.closingDay || null;
    if (bClosing !== btClosing) { b.closingDay = btClosing; changed = true; }
  });
  if (changed) saveData(data);
  return data;
}

function addBillType(data, name, dueDay, icon, closingDay) {
  const typeId = generateId();
  data.billTypes.push({ id: typeId, name, icon: icon || 'receipt', dueDay, closingDay: closingDay || null, amount: null, note: '' });

  const period = getCurrentPeriod();
  data.bills.push({
    id: generateId(),
    typeId,
    name,
    icon: icon || 'receipt',
    dueDay,
    closingDay: closingDay || null,
    amount: null,
    period,
    status: 'pending',
    paidDate: null,
    note: ''
  });

  saveData(data);
  return data;
}

function deleteBillType(data, typeId) {
  data.billTypes = data.billTypes.filter((t) => t.id !== typeId);
  data.bills = data.bills.filter((b) => b.typeId !== typeId);
  saveData(data);
  return data;
}

function exportData(data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bill-tracker-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importData(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = JSON.parse(e.target.result);
    saveData(data);
    callback(data);
  };
  reader.readAsText(file);
}

function getClosingDate(bill) {
  if (!bill.closingDay) return null;
  const [year, month] = bill.period.split('-').map(Number);
  return new Date(year, month - 1, bill.closingDay);
}

function getDueDate(bill) {
  const [year, month] = bill.period.split('-').map(Number);
  let dueYear = year, dueMonth = month;
  if (bill.closingDay && bill.closingDay > bill.dueDay) {
    if (dueMonth === 12) { dueYear += 1; dueMonth = 1; }
    else { dueMonth += 1; }
  }
  return new Date(dueYear, dueMonth - 1, bill.dueDay);
}

function getDaysUntilDue(bill) {
  const dueDate = getDueDate(bill);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
}

function isBillIssued(bill) {
  if (!bill.closingDay) return true; // no closing day = always issued
  const [year, month] = bill.period.split('-').map(Number);
  const closingDate = new Date(year, month - 1, bill.closingDay);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today >= closingDate;
}

function getDaysUntilClosing(bill) {
  if (!bill.closingDay) return -1; // already issued
  const [year, month] = bill.period.split('-').map(Number);
  const closingDate = new Date(year, month - 1, bill.closingDay);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((closingDate - today) / (1000 * 60 * 60 * 24));
}

function getUrgency(bill) {
  if (bill.status === 'paid') return 'paid';
  if (!isBillIssued(bill)) return 'not-issued';
  const days = getDaysUntilDue(bill);
  if (days < 0) return 'overdue';
  if (days <= 3) return 'urgent';
  if (days <= 7) return 'warning';
  return 'normal';
}

// ─── GitHub Gist 雲端同步 ───────────────────────────────
const GIST_FILENAME = 'bill-tracker.json';

function getSyncConfig(data) {
  return (data.settings && data.settings.sync) || {};
}

function setSyncConfig(data, patch) {
  data.settings.sync = { ...(data.settings.sync || {}), ...patch };
  saveData(data);
  return data;
}

async function gistCreate(token) {
  const res = await fetch('https://api.github.com/gists', {
    method: 'POST',
    headers: {
      'Authorization': `token ${token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      description: 'bill-tracker backup',
      public: false,
      files: { [GIST_FILENAME]: { content: '{}' } }
    })
  });
  if (!res.ok) throw new Error(`建立失敗 HTTP ${res.status}`);
  const json = await res.json();
  return json.id;
}

async function gistPush(data) {
  const cfg = getSyncConfig(data);
  if (!cfg.gistId || !cfg.token) throw new Error('請先填入 Gist ID 與 Token');
  const payload = JSON.parse(JSON.stringify(data));
  if (payload.settings && payload.settings.sync) delete payload.settings.sync.token;
  const res = await fetch(`https://api.github.com/gists/${cfg.gistId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `token ${cfg.token}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      files: { [GIST_FILENAME]: { content: JSON.stringify(payload, null, 2) } }
    })
  });
  if (!res.ok) throw new Error(`上傳失敗 HTTP ${res.status}`);
  return true;
}

async function gistPull(data) {
  const cfg = getSyncConfig(data);
  if (!cfg.gistId || !cfg.token) throw new Error('請先填入 Gist ID 與 Token');
  const res = await fetch(`https://api.github.com/gists/${cfg.gistId}`, {
    headers: {
      'Authorization': `token ${cfg.token}`,
      'Accept': 'application/vnd.github+json'
    }
  });
  if (!res.ok) throw new Error(`下載失敗 HTTP ${res.status}`);
  const json = await res.json();
  const file = json.files && json.files[GIST_FILENAME];
  if (!file || !file.content) throw new Error('Gist 內沒有 bill-tracker.json');
  let imported;
  try {
    imported = JSON.parse(file.content);
  } catch (e) {
    throw new Error('Gist 內容不是合法 JSON');
  }
  if (!imported || typeof imported !== 'object') {
    throw new Error('Gist 內容為空，請先在有資料的裝置按「上傳雲端」');
  }
  if (!Array.isArray(imported.billTypes)) imported.billTypes = [];
  if (!Array.isArray(imported.bills)) imported.bills = [];
  imported.settings = imported.settings || { theme: 'dark', setupDone: true };
  if (imported.settings.setupDone === undefined) imported.settings.setupDone = imported.billTypes.length > 0;
  imported.settings.sync = { ...(imported.settings.sync || {}), gistId: cfg.gistId, token: cfg.token };
  saveData(imported);
  return imported;
}

function ensureCurrentPeriodBills(data) {
  if (!data || !Array.isArray(data.billTypes)) return data;
  if (!Array.isArray(data.bills)) data.bills = [];
  const period = getCurrentPeriod();
  data.billTypes.forEach((bt) => {
    const exists = data.bills.some((b) => b.typeId === bt.id && b.period === period);
    if (!exists) {
      data.bills.push({
        id: generateId(),
        typeId: bt.id,
        name: bt.name,
        icon: bt.icon,
        dueDay: bt.dueDay,
        closingDay: bt.closingDay || null,
        amount: null,
        period: period,
        status: 'pending',
        paidDate: null,
        note: ''
      });
    }
  });
  saveData(data);
  return data;
}
