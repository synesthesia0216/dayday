// ====== Day-Day 生日系统 ======
// 阴历/阳历生日检测 + 生日故事推送

const lunarCalendar = (() => {
  // 1900-2100 农历数据: 每个数字的bit表示月份大小(1=30天, 0=29天)
  // 高4位表示闰月月份(0=无闰月), 低12位表示1-12月大小
  const LUNAR_INFO = [
    0x04bd8,0x04ae0,0x0a570,0x054d5,0x0d260,0x0d950,0x16554,0x056a0,0x09ad0,0x055d2,
    0x04ae0,0x0a5b6,0x0a4d0,0x0d250,0x1d255,0x0b540,0x0d6a0,0x0ada2,0x095b0,0x14977,
    0x04970,0x0a4b0,0x0b4b5,0x06a50,0x06d40,0x1ab54,0x02b60,0x09570,0x052f2,0x04970,
    0x06566,0x0d4a0,0x0ea50,0x06e95,0x05ad0,0x02b60,0x186e3,0x092e0,0x1c8d7,0x0c950,
    0x0d4a0,0x1d8a6,0x0b550,0x056a0,0x1a5b4,0x025d0,0x092d0,0x0d2b2,0x0a950,0x0b557,
    0x06ca0,0x0b550,0x15355,0x04da0,0x0a5b0,0x14573,0x052b0,0x0a9a8,0x0e950,0x06aa0,
    0x0aea6,0x0ab50,0x04b60,0x0aae4,0x0a570,0x05260,0x0f263,0x0d950,0x05b57,0x056a0,
    0x096d0,0x04dd5,0x04ad0,0x0a4d0,0x0d4d4,0x0d250,0x0d558,0x0b540,0x0b6a0,0x195a6,
    0x095b0,0x049b0,0x0a974,0x0a4b0,0x0b27a,0x06a50,0x06d40,0x0af46,0x0ab60,0x09570,
    0x04af5,0x04970,0x064b0,0x074a3,0x0ea50,0x06b58,0x055c0,0x0ab60,0x096d5,0x092e0,
    0x0c960,0x0d954,0x0d4a0,0x0da50,0x07552,0x056a0,0x0abb7,0x025d0,0x092d0,0x0cab5,
    0x0a950,0x0b4a0,0x0baa4,0x0ad50,0x055d9,0x04ba0,0x0a5b0,0x15176,0x052b0,0x0a930,
    0x07954,0x06aa0,0x0ad50,0x05b52,0x04b60,0x0a6e6,0x0a4e0,0x0d260,0x0ea65,0x0d530,
    0x05aa0,0x076a3,0x096d0,0x04afb,0x04ad0,0x0a4d0,0x1d0b6,0x0d250,0x0d520,0x0dd45,
    0x0b5a0,0x056d0,0x055b2,0x049b0,0x0a577,0x0a4b0,0x0aa50,0x1b255,0x06d20,0x0ada0,
    0x14b63,0x09370,0x049f8,0x04970,0x064b0,0x168a6,0x0ea50,0x06b20,0x1a6c4,0x0aae0,
    0x0a2e0,0x0d2e3,0x0c960,0x0d557,0x0d4a0,0x0da50,0x05d55,0x056a0,0x0a6d0,0x055d4,
    0x052d0,0x0a9b8,0x0a950,0x0b4a0,0x0b6a6,0x0ad50,0x055a0,0x0aba4,0x0a5b0,0x052b0,
    0x0b273,0x06930,0x07337,0x06aa0,0x0ad50,0x14b55,0x04b60,0x0a570,0x054e4,0x0d160,
    0x0e968,0x0d520,0x0daa0,0x16aa6,0x056d0,0x04ae0,0x0a9d4,0x0a4d0,0x0d150,0x0f252,
    0x0d520
  ];

  const SOLAR_TERM = [
    0,21208,42467,63836,85337,107014,128867,150921,173149,195551,
    218072,240693,263343,285989,308563,331033,353350,375494,397447,419210,
    440795,462224,483532,504758
  ];

  const GAN = ['甲','乙','丙','丁','戊','己','庚','辛','壬','癸'];
  const ZHI = ['子','丑','寅','卯','辰','巳','午','未','申','酉','戌','亥'];
  const ANIMALS = ['鼠','牛','虎','兔','龙','蛇','马','羊','猴','鸡','狗','猪'];
  const LUNAR_MONTH = ['正月','二月','三月','四月','五月','六月','七月','八月','九月','十月','冬月','腊月'];
  const LUNAR_DAY = ['初一','初二','初三','初四','初五','初六','初七','初八','初九','初十','十一','十二','十三','十四','十五','十六','十七','十八','十九','二十','廿一','廿二','廿三','廿四','廿五','廿六','廿七','廿八','廿九','三十'];

  function solarToLunar(year, month, day) {
    const offset = Math.floor(Date.UTC(year, month - 1, day) / 86400000) - Math.floor(Date.UTC(1900, 0, 31) / 86400000);
    let days = 0;

    // Find lunar year
    let ly = 1900;
    for (; ly < 2101 && days + yearDays(ly) <= offset; ly++) {
      days += yearDays(ly);
    }

    // Find lunar month, properly handling leap month
    const leapMonth = LUNAR_INFO[ly - 1900] & 0xf; // 0 means no leap month
    let lm = 1, isLeap = false;

    for (let i = 1; i <= 12; i++) {
      // Regular month i
      const mDays = monthDays(ly, i);
      if (days + mDays > offset) {
        lm = i;
        break;
      }
      days += mDays;

      // Leap month: inserted after regular month i when i === leapMonth
      if (i === leapMonth) {
        const leapDays = (LUNAR_INFO[ly - 1900] & 0x10000) ? 30 : 29;
        if (days + leapDays > offset) {
          isLeap = true;
          lm = i; // leap month has same number as the month it follows
          break;
        }
        days += leapDays;
      }
    }

    const ld = offset - days + 1;

    return {
      year: ly,
      month: lm,
      day: ld,
      isLeap,
      leapMonth: leapMonth || 0,
      yearName: GAN[(ly - 4) % 10] + ZHI[(ly - 4) % 12],
      animal: ANIMALS[(ly - 4) % 12],
      monthName: (isLeap ? '闰' : '') + LUNAR_MONTH[lm - 1],
      dayName: LUNAR_DAY[ld - 1] || ld + '',
    };
  }

  function yearDays(y) {
    // 12 months base (12*29=348) + big-month flags (bits 0x8000..0x10) + leap month
    let sum = 348;
    for (let i = 0x8000; i > 0x8; i >>= 1) {
      sum += (LUNAR_INFO[y - 1900] & i) ? 1 : 0;
    }
    const leapMonth = LUNAR_INFO[y - 1900] & 0xf;
    if (leapMonth) {
      sum += (LUNAR_INFO[y - 1900] & 0x10000) ? 30 : 29;
    }
    return sum;
  }

  function monthDays(y, m) {
    return (LUNAR_INFO[y - 1900] & (0x10000 >> m)) ? 30 : 29;
  }

  function daysInMonth(y, m) {
    const a = [31,28,31,30,31,30,31,31,30,31,30,31];
    if (m === 2 && ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0)) return 29;
    return a[m - 1];
  }

  return { solarToLunar, yearDays, monthDays, daysInMonth, LUNAR_INFO, GAN, ZHI, ANIMALS, LUNAR_MONTH, LUNAR_DAY };
})();

// Convert lunar month+day to corresponding solar date in a given solar year
// Scans 400 days from Jan 1 to cover all possible lunar date mappings
function lunarToSolar(solarYear, lunarMonth, lunarDay) {
  const start = new Date(solarYear, 0, 1);
  for (let d = 0; d < 400; d++) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + d);
    const lunar = lunarCalendar.solarToLunar(date.getFullYear(), date.getMonth() + 1, date.getDate());
    if (lunar.month === lunarMonth && lunar.day === lunarDay) {
      return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
    }
  }
  return null;
}

const birthday = {
  // Check if today is the user's birthday (solar or lunar anniversary)
  checkBirthday: async () => {
    const db = await import('./db.js');
    const profile = await db.default.profile.get();
    if (!profile || !profile.birthDate) return null;

    const birthDate = profile.birthDate; // always solar YYYY-MM-DD from date picker
    const calType = profile.calendarType || 'solar';
    const today = new Date();
    const todaySolar = today.toISOString().slice(0, 10);

    let isBirthday = false;
    let lunarToday = null;

    if (calType === 'solar') {
      // Solar: same month+day every year
      const bd = new Date(birthDate + 'T00:00:00');
      isBirthday = bd.getMonth() === today.getMonth() && bd.getDate() === today.getDate();
    } else {
      // Lunar: convert solar birth date → lunar month+day, then find this year's solar equivalent
      const [by, bm, bd] = birthDate.split('-').map(Number);
      const birthLunar = lunarCalendar.solarToLunar(by, bm, bd);
      const lunarMonth = birthLunar.month;
      const lunarDay = birthLunar.day;

      // Find solar date of this lunar anniversary in current year
      const solarBirthday = lunarToSolar(today.getFullYear(), lunarMonth, lunarDay);
      if (solarBirthday) {
        isBirthday = solarBirthday.month === today.getMonth() + 1 && solarBirthday.day === today.getDate();
      }
      // Also check next year (lunar anniversary can fall in Jan–Feb of following solar year)
      if (!isBirthday) {
        const solarNext = lunarToSolar(today.getFullYear() + 1, lunarMonth, lunarDay);
        if (solarNext) {
          isBirthday = solarNext.month === today.getMonth() + 1 && solarNext.day === today.getDate();
        }
      }
      lunarToday = lunarCalendar.solarToLunar(today.getFullYear(), today.getMonth() + 1, today.getDate());
    }

    if (!isBirthday) return null;

    const age = today.getFullYear() - parseInt(birthDate.split('-')[0]);
    return {
      age,
      calendarType: calType,
      birthDate,
      todaySolar,
      lunarToday,
    };
  },

  // Get lunar date for a solar date
  getLunarDate: date => {
    return lunarCalendar.solarToLunar(date.getFullYear(), date.getMonth() + 1, date.getDate());
  },

  // Format a lunar date object as string
  formatLunarDate: lunar => {
    return `${lunar.yearName}年${lunar.animal}年 ${lunar.monthName}${lunar.dayName}`;
  },

  // Given a solar birth date, get info for preview (lunar equivalent + this year's solar date)
  getBirthdayPreview: (solarBirthDateStr, calType) => {
    const [y, m, d] = solarBirthDateStr.split('-').map(Number);
    if (calType === 'solar') {
      return { label: '阳历', note: '每年 ' + m + '月' + d + '日 庆祝' };
    }
    const birthLunar = lunarCalendar.solarToLunar(y, m, d);
    const lunarLabel = '阴历' + birthLunar.monthName + birthLunar.dayName;
    const thisYear = new Date().getFullYear();
    const solarEquiv = lunarToSolar(thisYear, birthLunar.month, birthLunar.day);
    let note = '';
    if (solarEquiv) {
      note = '今年对应阳历 ' + solarEquiv.year + '/' + solarEquiv.month + '/' + solarEquiv.day;
    }
    return { label: lunarLabel, note, lunarMonth: birthLunar.month, lunarDay: birthLunar.day };
  },

  lunarToSolar,
  lunarCalendar,
};

export default birthday;
