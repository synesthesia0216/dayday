// 处理 HYG v41 + Stellarium modern skyculture → public/data/stars.json + constellations.json
import fs from 'node:fs';

const HYG = 'E:/Web/nox/.tmp-test/hygdata_v41.csv';
const SKY = JSON.parse(fs.readFileSync('E:/Web/nox/.tmp-test/sky-modern-index.json', 'utf8'));

// ---- 1. 星座连线(chain → segments)+ 名称 ----
const ZH = {
  And:'仙女座',Ant:'唧筒座',Aps:'天燕座',Aqr:'宝瓶座',Aql:'天鹰座',Ara:'天坛座',Ari:'白羊座',Aur:'御夫座',
  Boo:'牧夫座',Cae:'雕具座',Cam:'鹿豹座',Cnc:'巨蟹座',CVn:'猎犬座',CMa:'大犬座',CMi:'小犬座',Cap:'摩羯座',
  Car:'船底座',Cas:'仙后座',Cen:'半人马座',Cep:'仙王座',Cet:'鲸鱼座',Cha:'蝘蜓座',Cir:'圆规座',Col:'天鸽座',
  Com:'后发座',CrA:'南冕座',CrB:'北冕座',Crv:'乌鸦座',Crt:'巨爵座',Cru:'南十字座',Cyg:'天鹅座',Del:'海豚座',
  Dor:'剑鱼座',Dra:'天龙座',Equ:'小马座',Eri:'波江座',For:'天炉座',Gem:'双子座',Gru:'天鹤座',Her:'武仙座',
  Hor:'时钟座',Hya:'长蛇座',Hyi:'水蛇座',Ind:'印第安座',Lac:'蝎虎座',Leo:'狮子座',LMi:'小狮座',Lep:'天兔座',
  Lib:'天秤座',Lup:'豺狼座',Lyn:'天猫座',Lyr:'天琴座',Men:'山案座',Mic:'显微镜座',Mon:'麒麟座',Mus:'苍蝇座',
  Nor:'矩尺座',Oct:'南极座',Oph:'蛇夫座',Ori:'猎户座',Pav:'孔雀座',Peg:'飞马座',Per:'英仙座',Phe:'凤凰座',
  Pic:'绘架座',Psc:'双鱼座',PsA:'南鱼座',Pup:'船尾座',Pyx:'罗盘座',Ret:'网罟座',Sge:'天箭座',Sgr:'人马座',
  Sco:'天蝎座',Scl:'玉夫座',Sct:'盾牌座',Ser:'巨蛇座',Sex:'六分仪座',Tau:'金牛座',Tel:'望远镜座',Tri:'三角座',
  TrA:'南三角座',Tuc:'杜鹃座',UMa:'大熊座',UMi:'小熊座',Vel:'船帆座',Vir:'室女座',Vol:'飞鱼座',Vul:'狐狸座',
};

const lineHips = new Set();
const cons = [];
for (const c of SKY.constellations) {
  const m = c.id.match(/^CON modern (\w+)$/);
  if (!m) continue;
  const abbr = m[1];
  const segments = [];
  for (const chain of c.lines || []) {
    for (let i = 0; i < chain.length - 1; i++) {
      segments.push([chain[i], chain[i + 1]]);
      lineHips.add(chain[i]); lineHips.add(chain[i + 1]);
    }
  }
  cons.push({
    abbr,
    zh: ZH[abbr] || abbr,
    en: (c.common_name && c.common_name.english) || abbr,
    segments,
  });
}
console.log('constellations:', cons.length, 'line star hips:', lineHips.size);

// ---- 2. HYG CSV → 恒星 ----
const text = fs.readFileSync(HYG, 'utf8');
const lines = text.split('\n');
const header = lines[0].split(',');
const idx = {};
header.forEach((h, i) => idx[h.replace(/"/g, '')] = i);
const need = ['hip','proper','ra','dec','mag','ci','spect','con','bayer','flam','lum'];
for (const k of need) if (idx[k] === undefined) { console.error('missing col', k); process.exit(1); }

// 著名恒星中文名(亮星标签)
const STAR_ZH = {
  'Sirius':'天狼星','Canopus':'老人星','Arcturus':'大角星','Vega':'织女一','Capella':'五车二','Rigel':'参宿七',
  'Procyon':'南河三','Betelgeuse':'参宿四','Altair':'河鼓二(牛郎星)','Aldebaran':'毕宿五','Antares':'心宿二',
  'Spica':'角宿一','Pollux':'北河三','Fomalhaut':'北落师门','Deneb':'天津四','Regulus':'轩辕十四','Castor':'北河二',
  'Acrux':'十字架二','Achernar':'水委一','Hadar':'马腹一','Alpha Centauri':'南门二','Polaris':'北极星',
  'Rigil Kentaurus':'南门二','Gacrux':'十字架一','Mimosa':'十字架三','Alioth':'玉衡','Alkaid':'摇光','Dubhe':'天枢',
  'Merak':'天璇','Phecda':'天玑','Megrez':'天权','Mizar':'开阳','Alnilam':'参宿二','Alnitak':'参宿一','Mintaka':'参宿三',
  'Bellatrix':'参宿五','Saiph':'参宿六','Mirfak':'天船三','Algol':'大陵五','Alpheratz':'壁宿二','Markab':'室宿一',
  'Scheat':'室宿二','Algenib':'壁宿一','Enif':'危宿三','Denebola':'五帝座一','Zubenelgenubi':'氐宿一','Shaula':'尾宿八',
  'Elnath':'五车五','Menkalinan':'五车三','Alhena':'井宿三','Adhara':'弧矢七','Wezen':'弧矢一','Aludra':'弧矢二',
  'Suhail':'天记','Avior':'海石一','Naos':'弧矢增二十二','Kaus Australis':'箕宿三','Nunki':'斗宿四','Rasalhague':'侯',
  'Eltanin':'天棓四','Alderamin':'天钩五','Sadr':'天津一','Albireo':'辇道增七','Sheliak':'渐台二','Sulafat':'渐台三',
  'Vindemiatrix':'东次将','Algieba':'轩辕十二','Zosma':'西上相','Chertan':'西次相','Izar':'梗河一','Muphrid':'右摄提一',
  'Seginus':'招摇','Zubeneschamali':'氐宿四','Unukalhai':'蜀','Dschubba':'房宿三','Acrab':'房宿四','Girtab':'尾宿二',
  'Sargas':'尾宿五','Larawag':'尾宿六','Kaus Media':'斗宿二','Kaus Borealis':'斗宿二','Alnasl':'箕宿一',
  'Toliman':'南门二','Alnair':'鹤一','Peacock':'孔雀十一','Ankaa':'火鸟六','Diphda':'土司空','Menkar':'天囷一',
  'Mira':'蒭藁增二','Hamal':'娄宿三','Sheratan':'娄宿一','Mesarthim':'娄宿二','Mirach':'奎宿九','Almach':'天大将军一',
  'Alphard':'星宿一','Rastaban':'天棓三','Thuban':'右枢','Kochab':'帝','Pherkad':'太子','Alrai':'少卫增八',
  'Schedar':'王良四','Caph':'王良一','Navi':'策','Ruchbah':'阁道三','Atria':'三角形三','Ancha':'泣二',
  'Rukbat':'天渊三','Kornephoros':'河中','Mufrid':'右摄提一','Zavijava':'右执法','Porrima':'东上相','Heze':'角宿二',
  'Alcyone':'昴宿六','Atlas':'昴宿七','Electra':'昴宿一','Maia':'昴宿四','Merope':'昴宿五','Taygeta':'昴宿二',
  'Pleione':'昴宿增十二','Celaeno':'昴宿增九','Sterope':'昴宿三','Ain':'毕宿一','Prima Hyadum':'毕宿四',
};

const stars = [];
let kept = 0;
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',');
  if (cols.length < header.length) continue;
  const hip = cols[idx.hip] ? parseInt(cols[idx.hip]) : null;
  const mag = cols[idx.mag] ? parseFloat(cols[idx.mag]) : null;
  const ra = cols[idx.ra] ? parseFloat(cols[idx.ra]) : null;
  const dec = cols[idx.dec] ? parseFloat(cols[idx.dec]) : null;
  if (ra === null || dec === null) continue;
  const isLine = hip !== null && lineHips.has(hip);
  if (!isLine && (mag === null || mag > 4.5)) continue;
  if (cols[idx.id] === '0') continue; // 跳过太阳
  const proper = (cols[idx.proper] || '').replace(/"/g, '');
  const bayer = (cols[idx.bayer] || '').replace(/"/g, '');
  const con = (cols[idx.con] || '').replace(/"/g, '');
  stars.push({
    hip: hip || 0,
    n: proper,
    zh: STAR_ZH[proper] || null,
    bayer,
    con,
    ra: Math.round(ra * 1e6) / 1e6,
    dec: Math.round(dec * 1e6) / 1e6,
    mag: mag === null ? 6.0 : Math.round(mag * 100) / 100,
    ci: cols[idx.ci] ? Math.round(parseFloat(cols[idx.ci]) * 100) / 100 : null,
    spect: cols[idx.spect] || '',
  });
  kept++;
}
console.log('stars kept:', kept);

fs.writeFileSync('E:/Web/nox/public/data/constellations.json', JSON.stringify(cons));
fs.writeFileSync('E:/Web/nox/public/data/stars.json', JSON.stringify(stars));
console.log('written.');
