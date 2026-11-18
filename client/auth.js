// Day-Day 本地密钥认证
// 首次使用设置密钥，之后凭密钥解锁
const SETTINGS_KEY = 'master_key_hash';

async function sha256(text) {
  const data = new TextEncoder().encode(text);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const auth = {
  // 检查是否已设置过密钥
  isSetup: async () => {
    const db = await import('./db.js');
    const h = await db.default.settings.get(SETTINGS_KEY);
    return !!h;
  },

  // 首次设置密钥
  setupKey: async key => {
    if (!key || key.length < 4) throw new Error('密钥至少4位');
    const db = await import('./db.js');
    const existing = await db.default.settings.get(SETTINGS_KEY);
    if (existing) throw new Error('密钥已设置');
    const hash = await sha256(key);
    await db.default.settings.set(SETTINGS_KEY, hash);
    return { success: true };
  },

  // 用密钥解锁
  unlock: async key => {
    if (!key) throw new Error('请输入密钥');
    const db = await import('./db.js');
    const stored = await db.default.settings.get(SETTINGS_KEY);
    if (!stored) throw new Error('尚未设置密钥');
    const hash = await sha256(key);
    if (hash !== stored) throw new Error('密钥错误');
    return { token: 'unlocked' };
  },

  // 重置（清除密钥 + 所有数据）
  reset: async () => {
    const db = await import('./db.js');
    await db.default.settings.set(SETTINGS_KEY, null);
  },

  getMe: async () => ({ id: 'local-user' }),
};

export default auth;
