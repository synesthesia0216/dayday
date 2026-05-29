const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const multer = require('multer');

const app = express();
const PORT = 3099;
const DATA = path.join(__dirname, 'data');
const UPLOADS = path.join(__dirname, 'uploads');
const CONFIG = require('./config.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS));

[DATA, UPLOADS, path.join(DATA, 'users')].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

// ---- Nodemailer ----
const transporter = nodemailer.createTransport({
  host: CONFIG.smtp.host,
  port: CONFIG.smtp.port,
  secure: CONFIG.smtp.secure,
  auth: { user: CONFIG.smtp.user, pass: CONFIG.smtp.pass },
});

// ---- Multer ----
const storage = multer.diskStorage({
  destination: UPLOADS,
  filename: (req, file, cb) => cb(null, Date.now() + '-' + crypto.randomBytes(4).toString('hex') + path.extname(file.originalname)),
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

// ---- Helpers ----
function readJSON(fp) { if (!fs.existsSync(fp)) return []; try { return JSON.parse(fs.readFileSync(fp, 'utf-8')); } catch { return []; } }
function writeJSON(fp, data) { fs.writeFileSync(fp, JSON.stringify(data, null, 2), 'utf-8'); }
function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function userDir(req) {
  const token = req.headers['x-auth-token'];
  if (!token) return null;
  const tokens = readJSON(path.join(DATA, 'tokens.json'));
  const entry = tokens.find(t => t.token === token);
  if (!entry) return null;
  const dir = path.join(DATA, 'users', entry.userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return { dir, userId: entry.userId };
}

function authMiddleware(req, res, next) {
  const u = userDir(req);
  if (!u) return res.status(401).json({ error: '未登录' });
  req.userDir = u.dir;
  req.userId = u.userId;
  next();
}

// ---- 验证码存储（内存） ----
const codes = {}; // email -> { code, expires }

// ==================== 认证 API ====================
app.post('/api/auth/send-code', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) return res.status(400).json({ error: '邮箱无效' });

  const code = String(Math.floor(1000 + Math.random() * 9000));
  codes[email] = { code, expires: Date.now() + 10 * 60 * 1000 };

  try {
    await transporter.sendMail({
      from: `"Day-Day" <${CONFIG.smtp.user}>`,
      to: email,
      subject: 'Day-Day 验证码',
      text: `你的登录验证码：${code}\n有效期 10 分钟。`,
      html: `<div style="font-family:sans-serif;max-width:400px;margin:0 auto;padding:40px 20px;text-align:center;background:#0f1115;color:#c8cad0;border-radius:4px;"><div style="font-size:12px;color:#787b84;letter-spacing:0.1em;margin-bottom:24px;">Day-Day</div><div style="font-size:36px;font-weight:200;letter-spacing:0.2em;color:#fff;margin-bottom:16px;">${code}</div><div style="font-size:13px;color:#787b84;">有效期 10 分钟</div></div>`,
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('Send email failed:', e.message);
    res.status(500).json({ error: '发送失败，请检查邮箱配置' });
  }
});

app.post('/api/auth/verify', (req, res) => {
  const { email, code } = req.body;
  const entry = codes[email];
  if (!entry || entry.code !== code || Date.now() > entry.expires) {
    return res.status(400).json({ error: '验证码错误或已过期' });
  }
  delete codes[email];

  const userId = crypto.createHash('sha256').update(email.toLowerCase().trim()).digest('hex').slice(0, 16);
  const token = crypto.randomBytes(24).toString('hex');
  const tokens = readJSON(path.join(DATA, 'tokens.json'));
  tokens.push({ token, userId, email, createdAt: new Date().toISOString() });
  // 只保留最近 50 个 token
  if (tokens.length > 50) tokens.splice(0, tokens.length - 50);
  writeJSON(path.join(DATA, 'tokens.json'), tokens);

  const dir = path.join(DATA, 'users', userId);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  res.json({ token, userId });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ userId: req.userId });
});

// ==================== 图片上传 ====================
app.post('/api/upload', authMiddleware, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '无文件' });
  res.json({ url: '/uploads/' + req.file.filename });
});

// ==================== 笔记 API (用户隔离) ====================
app.get('/api/notes', authMiddleware, (req, res) => {
  const notes = readJSON(path.join(req.userDir, 'notes.json'));
  const { type, search } = req.query;
  let result = notes;
  if (type && type !== 'all') result = result.filter(n => n.type === type);
  if (search) {
    const kw = search.toLowerCase();
    result = result.filter(n => n.title.toLowerCase().includes(kw) || (n.content || '').toLowerCase().includes(kw) || (n.tags || []).some(t => t.toLowerCase().includes(kw)));
  }
  res.json(result);
});

app.post('/api/notes', authMiddleware, (req, res) => {
  const notes = readJSON(path.join(req.userDir, 'notes.json'));
  const note = { id: uid(), title: req.body.title || '无标题', content: req.body.content || '', type: req.body.type || '灵感', tags: req.body.tags || [], images: req.body.images || [], pinned: req.body.pinned || false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  notes.push(note);
  writeJSON(path.join(req.userDir, 'notes.json'), notes);
  addXP(req, 5, '写笔记');
  res.status(201).json(note);
});

app.put('/api/notes/:id', authMiddleware, (req, res) => {
  const fp = path.join(req.userDir, 'notes.json');
  const notes = readJSON(fp);
  const idx = notes.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '未找到' });
  Object.assign(notes[idx], req.body, { updatedAt: new Date().toISOString() });
  writeJSON(fp, notes);
  res.json(notes[idx]);
});

app.delete('/api/notes/:id', authMiddleware, (req, res) => {
  const fp = path.join(req.userDir, 'notes.json');
  let notes = readJSON(fp);
  const before = notes.length;
  notes = notes.filter(n => n.id !== req.params.id);
  if (notes.length === before) return res.status(404).json({ error: '未找到' });
  writeJSON(fp, notes);
  res.json({ success: true });
});

// ==================== 日记 ====================
app.get('/api/diary', authMiddleware, (req, res) => {
  let diary = readJSON(path.join(req.userDir, 'diary.json'));
  diary.sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(diary);
});

app.post('/api/diary', authMiddleware, (req, res) => {
  const diary = readJSON(path.join(req.userDir, 'diary.json'));
  const entry = { id: uid(), date: req.body.date || new Date().toISOString().slice(0, 10), title: req.body.title || '日记', content: req.body.content || '', mood: req.body.mood || '', images: req.body.images || [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  diary.push(entry);
  writeJSON(path.join(req.userDir, 'diary.json'), diary);
  addXP(req, 8, '写日记');
  res.status(201).json(entry);
});

app.put('/api/diary/:id', authMiddleware, (req, res) => {
  const fp = path.join(req.userDir, 'diary.json');
  const diary = readJSON(fp);
  const idx = diary.findIndex(d => d.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '未找到' });
  Object.assign(diary[idx], req.body, { updatedAt: new Date().toISOString() });
  writeJSON(fp, diary);
  res.json(diary[idx]);
});

app.delete('/api/diary/:id', authMiddleware, (req, res) => {
  const fp = path.join(req.userDir, 'diary.json');
  let diary = readJSON(fp);
  const before = diary.length;
  diary = diary.filter(d => d.id !== req.params.id);
  if (diary.length === before) return res.status(404).json({ error: '未找到' });
  writeJSON(fp, diary);
  res.json({ success: true });
});

app.get('/api/diary/weekly', authMiddleware, (req, res) => {
  const diary = readJSON(path.join(req.userDir, 'diary.json'));
  const checkins = readJSON(path.join(req.userDir, 'checkins.json'));
  const now = new Date();
  const dow = now.getDay();
  const mon = new Date(now); mon.setDate(now.getDate() - (dow === 0 ? 6 : dow - 1));
  const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
  const ms = mon.toISOString().slice(0, 10), ss = sun.toISOString().slice(0, 10);
  const wd = diary.filter(d => d.date >= ms && d.date <= ss);
  const wc = checkins.filter(c => c.date >= ms && c.date <= ss);
  const wn = readJSON(path.join(req.userDir, 'notes.json')).filter(n => n.createdAt.slice(0, 10) >= ms && n.createdAt.slice(0, 10) <= ss);
  const mc = {}; wc.forEach(c => { mc[c.mood] = (mc[c.mood] || 0) + 1; });
  const tm = Object.entries(mc).sort((a, b) => b[1] - a[1])[0];
  res.json({ weekStart: ms, weekEnd: ss, checkinCount: wc.length, diaryCount: wd.length, notesCount: wn.length, topMood: tm ? tm[0] : null, totalWords: wd.reduce((s, d) => s + (d.content || '').length, 0) });
});

// ==================== 打卡 ====================
app.get('/api/checkins', authMiddleware, (req, res) => {
  const checkins = readJSON(path.join(req.userDir, 'checkins.json'));
  const { year, month } = req.query;
  let result = checkins;
  if (year) result = result.filter(c => { const d = new Date(c.date); return d.getFullYear() === parseInt(year) && (!month || d.getMonth() + 1 === parseInt(month)); });
  res.json(result);
});

app.get('/api/checkins/today', authMiddleware, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const checkins = readJSON(path.join(req.userDir, 'checkins.json'));
  res.json(checkins.find(c => c.date === today) || null);
});

app.get('/api/checkins/streak', authMiddleware, (req, res) => {
  const checkins = readJSON(path.join(req.userDir, 'checkins.json'));
  const dates = [...new Set(checkins.map(c => c.date))].sort().reverse();
  let streak = 0; const today = new Date();
  for (let i = 0; i < dates.length; i++) {
    const d = new Date(dates[i]), t = new Date(today);
    t.setDate(t.getDate() - i);
    if (d.toISOString().slice(0, 10) === t.toISOString().slice(0, 10)) streak++; else break;
  }
  res.json({ streak });
});

app.post('/api/checkins', authMiddleware, (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const fp = path.join(req.userDir, 'checkins.json');
  let checkins = readJSON(fp);
  const ex = checkins.findIndex(c => c.date === today);
  if (ex !== -1) {
    checkins[ex].mood = req.body.mood || checkins[ex].mood;
    checkins[ex].note = req.body.note || '';
    checkins[ex].updatedAt = new Date().toISOString();
  } else {
    checkins.push({ id: uid(), date: today, mood: req.body.mood || '😊', note: req.body.note || '', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    addXP(req, 10, '每日打卡');
  }
  writeJSON(fp, checkins);
  checkStoryUnlocks(req);
  res.json(checkins.find(c => c.date === today));
});

// ==================== 提醒 ====================
app.get('/api/reminders', authMiddleware, (req, res) => { res.json(readJSON(path.join(req.userDir, 'reminders.json'))); });
app.post('/api/reminders', authMiddleware, (req, res) => {
  const fp = path.join(req.userDir, 'reminders.json');
  const reminders = readJSON(fp);
  const r = { id: uid(), title: req.body.title || '提醒', datetime: req.body.datetime || null, done: false, createdAt: new Date().toISOString() };
  reminders.push(r); writeJSON(fp, reminders); res.status(201).json(r);
});
app.put('/api/reminders/:id', authMiddleware, (req, res) => {
  const fp = path.join(req.userDir, 'reminders.json');
  const reminders = readJSON(fp);
  const idx = reminders.findIndex(r => r.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '未找到' });
  const wasDone = reminders[idx].done;
  Object.assign(reminders[idx], req.body);
  writeJSON(fp, reminders);
  if (!wasDone && reminders[idx].done) addXP(req, 3, '完成待办');
  res.json(reminders[idx]);
});
app.delete('/api/reminders/:id', authMiddleware, (req, res) => {
  const fp = path.join(req.userDir, 'reminders.json');
  let reminders = readJSON(fp);
  const before = reminders.length;
  reminders = reminders.filter(r => r.id !== req.params.id);
  if (reminders.length === before) return res.status(404).json({ error: '未找到' });
  writeJSON(fp, reminders); res.json({ success: true });
});

// ==================== 成长 ====================
function getGrowth(req) {
  const fp = path.join(req.userDir, 'growth.json');
  let g = readJSON(fp);
  if (!g || typeof g.xp !== 'number') g = { xp: 0, level: 1, achievements: [], xpHistory: [] };
  return { fp, data: g };
}

function addXP(req, amount, source) {
  const { fp, data: g } = getGrowth(req);
  g.xp += amount;
  g.xpHistory.push({ amount, source, date: new Date().toISOString() });
  checkAchievements(req, g);
  writeJSON(fp, g);
}

function checkAchievements(req, g) {
  const notes = readJSON(path.join(req.userDir, 'notes.json'));
  const diary = readJSON(path.join(req.userDir, 'diary.json'));
  const checkins = readJSON(path.join(req.userDir, 'checkins.json'));
  const sp = readJSON(path.join(req.userDir, 'story_progress.json')) || { unlocked: [] };

  const dates = [...new Set(checkins.map(c => c.date))].sort().reverse();
  let streak = 0; const today = new Date();
  for (let i = 0; i < dates.length; i++) { const d = new Date(dates[i]), t = new Date(today); t.setDate(t.getDate() - i); if (d.toISOString().slice(0, 10) === t.toISOString().slice(0, 10)) streak++; else break; }

  const all = [
    { id: 'first_checkin', icon: '🌱', name: '初来乍到', test: () => checkins.length >= 1 },
    { id: 'streak_7', icon: '🔥', name: '七日之火', test: () => streak >= 7 },
    { id: 'notes_10', icon: '✍️', name: '笔耕不辍', test: () => notes.length >= 10 },
    { id: 'diary_7', icon: '📖', name: '日笺成册', test: () => diary.length >= 7 },
    { id: 'story_ch3', icon: '🌙', name: '守夜人', test: () => (sp.unlocked || []).length >= 3 },
    { id: 'streak_30', icon: '⭐', name: '满月', test: () => streak >= 30 },
  ];
  let changed = false;
  for (const a of all) {
    if (!g.achievements.find(e => e.id === a.id) && a.test()) {
      g.achievements.push({ id: a.id, name: a.name, icon: a.icon, earnedAt: new Date().toISOString() }); changed = true;
    }
  }
  return changed;
}

app.get('/api/growth', authMiddleware, (req, res) => {
  const { fp, data: g } = getGrowth(req);
  checkAchievements(req, g); writeJSON(fp, g);
  const LEVELS = [{ lv: 1, name: '观察者', xp: 0 }, { lv: 2, name: '记录者', xp: 50 }, { lv: 3, name: '探索者', xp: 120 }, { lv: 4, name: '编织者', xp: 250 }, { lv: 5, name: '创造者', xp: 500 }, { lv: 6, name: '守夜人', xp: 1000 }, { lv: 7, name: '破晓者', xp: 2000 }];
  let lv = LEVELS[0]; for (const l of LEVELS) { if (g.xp >= l.xp) lv = l; }
  const next = LEVELS.find(l => l.xp > g.xp);
  const notes = readJSON(path.join(req.userDir, 'notes.json'));
  const diary = readJSON(path.join(req.userDir, 'diary.json'));
  const checkins = readJSON(path.join(req.userDir, 'checkins.json'));
  const dates = [...new Set(checkins.map(c => c.date))].sort().reverse();
  let streak = 0; const today = new Date();
  for (let i = 0; i < dates.length; i++) { const d = new Date(dates[i]), t = new Date(today); t.setDate(t.getDate() - i); if (d.toISOString().slice(0, 10) === t.toISOString().slice(0, 10)) streak++; else break; }
  res.json({ xp: g.xp, level: lv.lv, levelName: lv.name, nextLevelName: next ? next.name : null, nextXp: next ? next.xp - g.xp : 0, progress: next ? Math.round((g.xp - lv.xp) / (next.xp - lv.xp) * 100) : 100, achievements: g.achievements || [], xpHistory: (g.xpHistory || []).slice(-20).reverse(), stats: { totalNotes: notes.length, totalDiary: diary.length, totalCheckins: checkins.length, streak } });
});

// ==================== 故事 ====================
function checkStoryUnlocks(req) {
  const stories = readJSON(path.join(DATA, 'story.json'));
  const checkins = readJSON(path.join(req.userDir, 'checkins.json'));
  const notes = readJSON(path.join(req.userDir, 'notes.json'));
  const diary = readJSON(path.join(req.userDir, 'diary.json'));
  const g = getGrowth(req).data;
  const fp = path.join(req.userDir, 'story_progress.json');
  let progress = readJSON(fp);
  if (!progress || !progress.unlocked) progress = { unlocked: [], read: [] };

  const dates = [...new Set(checkins.map(c => c.date))].sort().reverse();
  let streak = 0; const today = new Date();
  for (let i = 0; i < dates.length; i++) { const d = new Date(dates[i]), t = new Date(today); t.setDate(t.getDate() - i); if (d.toISOString().slice(0, 10) === t.toISOString().slice(0, 10)) streak++; else break; }

  for (const s of stories) {
    if (progress.unlocked.includes(s.id)) continue;
    const c = s.unlockCondition; let met = false;
    if (c.type === 'always') met = true;
    else if (c.type === 'checkin_streak') met = streak >= c.threshold;
    else if (c.type === 'total_notes') met = notes.length >= c.threshold;
    else if (c.type === 'total_diary') met = diary.length >= c.threshold;
    else if (c.type === 'xp_reached') met = g.xp >= c.threshold;
    if (met) progress.unlocked.push(s.id);
  }
  writeJSON(fp, progress);
}

app.get('/api/story', authMiddleware, (req, res) => {
  checkStoryUnlocks(req);
  const stories = readJSON(path.join(DATA, 'story.json'));
  const progress = readJSON(path.join(req.userDir, 'story_progress.json')) || { unlocked: [], read: [] };
  const isDev = req.query.dev === 'true';
  stories.sort((a, b) => a.order - b.order);
  res.json({ chapters: stories.map(s => ({ id: s.id, title: s.title, order: s.order, unlockCondition: s.unlockCondition, unlocked: isDev ? true : progress.unlocked.includes(s.id), read: progress.read ? progress.read.includes(s.id) : false, content: isDev ? s.content : (progress.unlocked.includes(s.id) ? s.content : null) })), isDev });
});

app.get('/api/story/:id', authMiddleware, (req, res) => {
  const stories = readJSON(path.join(DATA, 'story.json'));
  const story = stories.find(s => s.id === req.params.id);
  if (!story) return res.status(404).json({ error: '未找到' });
  const progress = readJSON(path.join(req.userDir, 'story_progress.json')) || { unlocked: [], read: [] };
  const isDev = req.query.dev === 'true';
  if (!isDev && !progress.unlocked.includes(story.id)) return res.status(403).json({ error: '尚未解锁' });
  if (progress.read && !progress.read.includes(story.id)) { progress.read.push(story.id); writeJSON(path.join(req.userDir, 'story_progress.json'), progress); }
  res.json(story);
});

app.post('/api/story', authMiddleware, (req, res) => {
  const fp = path.join(DATA, 'story.json');
  const stories = readJSON(fp);
  const ch = { id: uid(), title: req.body.title || '新章节', order: req.body.order || stories.length + 1, unlockCondition: req.body.unlockCondition || { type: 'always', threshold: 0 }, content: req.body.content || '' };
  stories.push(ch); writeJSON(fp, stories); res.status(201).json(ch);
});

app.put('/api/story/:id', authMiddleware, (req, res) => {
  const fp = path.join(DATA, 'story.json');
  const stories = readJSON(fp);
  const idx = stories.findIndex(s => s.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '未找到' });
  Object.assign(stories[idx], req.body); writeJSON(fp, stories); res.json(stories[idx]);
});

app.delete('/api/story/:id', authMiddleware, (req, res) => {
  const fp = path.join(DATA, 'story.json');
  let stories = readJSON(fp);
  const before = stories.length;
  stories = stories.filter(s => s.id !== req.params.id);
  if (stories.length === before) return res.status(404).json({ error: '未找到' });
  writeJSON(fp, stories); res.json({ success: true });
});

// ==================== 统计 ====================
app.get('/api/stats', authMiddleware, (req, res) => {
  const notes = readJSON(path.join(req.userDir, 'notes.json'));
  const reminders = readJSON(path.join(req.userDir, 'reminders.json'));
  const checkins = readJSON(path.join(req.userDir, 'checkins.json'));
  const diary = readJSON(path.join(req.userDir, 'diary.json'));
  const g = getGrowth(req).data;
  const dates = [...new Set(checkins.map(c => c.date))].sort().reverse();
  let streak = 0; const today = new Date();
  for (let i = 0; i < dates.length; i++) { const d = new Date(dates[i]), t = new Date(today); t.setDate(t.getDate() - i); if (d.toISOString().slice(0, 10) === t.toISOString().slice(0, 10)) streak++; else break; }
  res.json({ totalNotes: notes.length, pinnedNotes: notes.filter(n => n.pinned).length, pendingReminders: reminders.filter(r => !r.done).length, totalCheckins: checkins.length, totalDiary: diary.length, streak, xp: g.xp, byType: ['灵感', '日记', '草稿', '摘录', '其他'].map(type => ({ type, count: notes.filter(n => n.type === type).length })) });
});

// ==================== 启动 ====================
if (!fs.existsSync(path.join(DATA, 'story.json'))) writeJSON(path.join(DATA, 'story.json'), []);
if (!fs.existsSync(path.join(DATA, 'tokens.json'))) writeJSON(path.join(DATA, 'tokens.json'), []);

app.listen(PORT, () => {
  console.log(`Day-Day → http://localhost:${PORT}`);
  console.log(`dev  → http://localhost:${PORT}/?dev`);
});
