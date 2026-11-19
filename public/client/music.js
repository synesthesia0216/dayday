// ====== Day-Day 背景音乐 ======
// 曲目：Kevin MacLeod (incompetech.com) · CC BY 4.0 · 全部离线打包
const TRACKS = [
  { id: 'lightless-dawn', file: 'audio/lightless-dawn.mp3', title: '无光黎明', sub: 'Lightless Dawn · 辽阔的钢琴与弦乐' },
  { id: 'at-rest', file: 'audio/at-rest.mp3', title: '静息', sub: 'At Rest · 舒缓钢琴，适合深夜' },
  { id: 'mesmerizing-galaxy', file: 'audio/mesmerizing-galaxy.mp3', title: '迷离星河', sub: 'Mesmerizing Galaxy · 空灵电子循环' },
  { id: 'comfortable-mystery-2', file: 'audio/comfortable-mystery-2.mp3', title: '静谧之谜', sub: 'Comfortable Mystery · 温柔电钢琴' },
];
const LS_KEY = 'dayday_music'; // { trackId }

let audio = null;
let started = false; // 本次会话是否开始过（决定悬浮钮显隐）
const state = { trackId: TRACKS[0].id };

function load() {
  try {
    const v = JSON.parse(localStorage.getItem(LS_KEY) || '{}');
    if (v.trackId && TRACKS.some(t => t.id === v.trackId)) state.trackId = v.trackId;
  } catch (e) {}
}
function save() { localStorage.setItem(LS_KEY, JSON.stringify(state)); }
function getAudio() {
  if (!audio) {
    audio = new Audio();
    audio.loop = true;
    audio.preload = 'none';
    audio.volume = 0.5;
  }
  return audio;
}
function currentTrack() { return TRACKS.find(t => t.id === state.trackId) || TRACKS[0]; }
function isPlaying() { return !!audio && !audio.paused && !audio.ended; }
function play() {
  const a = getAudio();
  const t = currentTrack();
  if (!a.src || !a.src.endsWith(t.file)) a.src = t.file;
  a.play().catch(() => {});
}
function pause() { if (audio) audio.pause(); }
function toggle() {
  if (isPlaying()) { pause(); return; }
  started = true;
  play();
}
function setTrack(id) {
  if (!TRACKS.some(t => t.id === id)) return;
  state.trackId = id;
  save();
  if (started) play();
}
function setVolume(v) {
  getAudio().volume = Math.max(0, Math.min(1, v));
}

export default { TRACKS, load, toggle, setTrack, setVolume, isPlaying, currentTrack, get started() { return started; } };
