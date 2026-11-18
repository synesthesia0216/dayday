// ====== Day-Day IndexedDB 数据层 ======
// 替代 Node.js 服务器的所有 JSON 文件存储

const DB_NAME = 'dayday';
const DB_VER = 3;
const STORES = ['notes','diary','checkins','reminders','growth','storyCollection','profile','settings','users','storyHistory','ledger','moonFrames'];
const DATA_STORES = new Set(['notes','diary','checkins','reminders','storyCollection','ledger']);
const CACHE_STORES = new Set(['moonFrames']);

let _db = null;
let _scope = 'full';

function openDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      STORES.forEach(s => { if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' }); });
    };
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode) { return _db.transaction(store, mode).objectStore(store); }

function promisify(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Generic CRUD
async function list(store) { await openDB(); const all = await promisify(tx(store, 'readonly').getAll()); if (_scope === 'lite' && DATA_STORES.has(store)) return all.filter(r => r._scope === 'lite'); return all; }
async function get(store, id) { await openDB(); return promisify(tx(store, 'readonly').get(id)); }
async function create(store, item) { await openDB(); item.id = item.id || uid(); item.createdAt = item.createdAt || new Date().toISOString(); if (DATA_STORES.has(store)) item._scope = _scope; await promisify(tx(store, 'readwrite').add(item)); return item; }
async function update(store, id, data) { await openDB(); const existing = await get(store, id); if (!existing) throw new Error('not found'); const merged = { ...existing, ...data, id, updatedAt: new Date().toISOString() }; await promisify(tx(store, 'readwrite').put(merged)); return merged; }
async function remove(store, id) { await openDB(); return promisify(tx(store, 'readwrite').delete(id)); }
async function clear(store) { await openDB(); return promisify(tx(store, 'readwrite').clear()); }

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function growthMutation(mutate) {
  return new Promise((resolve, reject) => {
    const t = _db.transaction('growth', 'readwrite');
    const st = t.objectStore('growth');
    const req = st.get('singleton');
    req.onsuccess = () => {
      const g = req.result || { id: 'singleton', xp: 0, xpHistory: [], createdAt: new Date().toISOString() };
      mutate(g);
      st.put(g);
      t.oncomplete = () => resolve(g);
    };
    t.onerror = () => reject(t.error);
    req.onerror = () => reject(req.error);
  });
}

// ====== Backup / Restore（缓存 store 不参与备份，避免 Blob 撑爆备份文件） ======
async function exportAll() {
  await openDB();
  const dump = {};
  for (const store of STORES) {
    if (CACHE_STORES.has(store)) continue;
    dump[store] = await promisify(tx(store, 'readonly').getAll());
  }
  return dump;
}

async function importAll(dump) {
  await openDB();
  for (const store of STORES) {
    if (CACHE_STORES.has(store)) continue;
    await promisify(tx(store, 'readwrite').clear());
  }
  for (const store of STORES) {
    if (CACHE_STORES.has(store)) continue;
    const rows = dump[store];
    if (!Array.isArray(rows) || !rows.length) continue;
    await new Promise((resolve, reject) => {
      const st = tx(store, 'readwrite');
      rows.forEach(r => st.put(r));
      st.oncomplete = () => resolve();
      st.onerror = () => reject(st.error);
    });
  }
}

// ====== Domain APIs ======
const db = {
  setScope: s => { _scope = s; },
  notes: {
    list: () => list('notes'),
    get: id => get('notes', id),
    create: data => create('notes', data),
    update: (id, data) => update('notes', id, data),
    delete: id => remove('notes', id),
    // Lightweight list: excludes image binary data to prevent OOM
    listLight: async (limit, offset) => {
      await openDB();
      const all = await promisify(tx('notes', 'readonly').getAll());
      const filtered = _scope === 'lite' ? all.filter(r => r._scope === 'lite') : all;
      const sorted = filtered.sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
      const slice = sorted.slice(offset || 0, (offset || 0) + (limit || 30));
      return slice.map(n => ({ ...n, images: undefined, imageCount: (n.images || []).length }));
    },
    count: async () => {
      await openDB();
      const all = await promisify(tx('notes', 'readonly').getAll());
      const filtered = _scope === 'lite' ? all.filter(r => r._scope === 'lite') : all;
      return filtered.length;
    },
  },
  diary: {
    list: () => list('diary'),
    get: id => get('diary', id),
    create: data => create('diary', data),
    update: (id, data) => update('diary', id, data),
    delete: id => remove('diary', id),
  },
  checkins: {
    list: () => list('checkins'),
    get: id => get('checkins', id),
    getToday: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const all = await list('checkins');
      return all.find(c => c.date === today) || null;
    },
    getStreak: async () => {
      const all = await list('checkins');
      const dates = [...new Set(all.map(c => c.date))].sort().reverse();
      let streak = 0; const today = new Date();
      for (const d of dates) {
        const t = new Date(today); t.setDate(t.getDate() - streak);
        if (d === t.toISOString().slice(0, 10)) streak++; else break;
      }
      return streak;
    },
    create: async data => {
      const today = new Date().toISOString().slice(0, 10);
      const all = await list('checkins');
      const ex = all.findIndex(c => c.date === today);
      if (ex !== -1) {
        return update('checkins', all[ex].id, { mood: data.mood || '🌕', note: data.note || '' });
      }
      return create('checkins', { date: today, mood: data.mood || '🌕', note: data.note || '' });
    },
  },
  reminders: {
    list: () => list('reminders'),
    get: id => get('reminders', id),
    create: data => create('reminders', data),
    update: (id, data) => update('reminders', id, data),
    delete: id => remove('reminders', id),
  },
  ledger: {
    list: () => list('ledger'),
    get: id => get('ledger', id),
    create: data => create('ledger', data),
    update: (id, data) => update('ledger', id, data),
    delete: id => remove('ledger', id),
  },
  growth: {
    get: async () => {
      const g = await get('growth', 'singleton');
      return g || { id: 'singleton', xp: 0, xpHistory: [] };
    },
    // 读-改-写在同一 readwrite 事务内完成；IndexedDB 对同 store 的 readwrite 事务串行执行，
    // 防止并发 addXP/setMeta 互相覆盖丢数据（真实月面 +5 与星空 +2 并发时曾互吞）
    addXP: async (amount, source) => {
      await openDB();
      return growthMutation(g => {
        g.xp = (g.xp || 0) + amount;
        g.xpHistory = g.xpHistory || [];
        g.xpHistory.push({ amount, source, date: new Date().toISOString() });
      });
    },
    setMeta: async (patch) => {
      await openDB();
      return growthMutation(g => Object.assign(g, patch));
    },
  },
  storyCollection: {
    list: () => list('storyCollection'),
    get: id => get('storyCollection', id),
    create: data => create('storyCollection', data),
    delete: id => remove('storyCollection', id),
  },
  storyHistory: {
    list: () => list('storyHistory'),
    add: async contentHash => create('storyHistory', { id: contentHash, fetchedAt: new Date().toISOString() }),
    hasSeen: async contentHash => !!(await get('storyHistory', contentHash)),
  },
  profile: {
    get: async () => {
      const p = await get('profile', 'singleton');
      return p || { id: 'singleton', displayName: null, avatar: null, celestialName: null, celestialNameGeneratedAt: null, birthDate: null, calendarType: 'solar' };
    },
    update: async data => {
      const p = await get('profile', 'singleton');
      if (!p) return create('profile', { id: 'singleton', displayName: null, avatar: null, celestialName: null, celestialNameGeneratedAt: null, birthDate: null, calendarType: 'solar', ...data });
      return update('profile', 'singleton', data);
    },
  },
  users: {
    findByEmail: async email => {
      const all = await list('users');
      return all.find(u => u.email === email.toLowerCase().trim());
    },
    create: async data => create('users', { ...data, email: data.email.toLowerCase().trim() }),
  },
  settings: {
    get: async key => { const s = await get('settings', key); return s ? s.value : null; },
    set: async (key, value) => { await openDB(); await promisify(tx('settings', 'readwrite').put({ id: key, value })); },
  },
  moonFrames: {
    get: dateKey => get('moonFrames', dateKey),
    put: async (dateKey, blob, meta) => { await openDB(); await promisify(tx('moonFrames', 'readwrite').put({ id: dateKey, blob, meta: meta || {}, fetchedAt: new Date().toISOString() })); },
  },
  stats: async () => {
    const [notes, reminders, checkins, diary, g] = await Promise.all([
      list('notes'), list('reminders'), list('checkins'), list('diary'), db.growth.get()
    ]);
    const dates = [...new Set(checkins.map(c => c.date))].sort().reverse();
    let streak = 0; const today = new Date();
    for (const d of dates) {
      const t = new Date(today); t.setDate(t.getDate() - streak);
      if (d === t.toISOString().slice(0, 10)) streak++; else break;
    }
    return {
      totalNotes: notes.length, pinnedNotes: notes.filter(n => n.pinned).length,
      pendingReminders: reminders.filter(r => !r.done).length,
      totalCheckins: checkins.length, totalDiary: diary.length,
      streak, xp: g.xp || 0,
      byType: ['灵感','随笔','草稿','摘录','其他'].map(type => ({ type, count: notes.filter(n => n.type === type).length })),
    };
  },
};

db.exportAll = exportAll;
db.importAll = importAll;

export default db;
