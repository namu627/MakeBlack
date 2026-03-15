// ── 색상 변환 ──────────────────────────────────────────
export const hslToRgb = (h, s, l) => {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0)*255), Math.round(f(8)*255), Math.round(f(4)*255)];
};

export const rgbToHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  let h, s, l = (max+min)/2;
  if (max === min) { h = s = 0; }
  else {
    const d = max - min;
    s = l > 0.5 ? d/(2-max-min) : d/(max+min);
    switch(max) {
      case r: h = ((g-b)/d + (g<b?6:0))/6; break;
      case g: h = ((b-r)/d + 2)/6; break;
      case b: h = ((r-g)/d + 4)/6; break;
    }
  }
  return [h*360, s*100, l*100];
};

export const rgbToHex = (r, g, b) =>
  '#' + [r,g,b].map(x => x.toString(16).padStart(2,'0')).join('');

// ── CMY 감산혼합 ───────────────────────────────────────
export const mixRgbList = (rgbList) => {
  if (!rgbList.length) return [128, 128, 128];
  // RGB → CMY 변환 후 평균 → RGB 역변환
  const cmyList = rgbList.map(([r,g,b]) => [1-r/255, 1-g/255, 1-b/255]);
  const avgCmy = cmyList.reduce(
    (acc, [c,m,y]) => [acc[0]+c, acc[1]+m, acc[2]+y],
    [0,0,0]
  ).map(v => v / cmyList.length);

  // 완료율에 따라 어두워지는 비율
  const darken = Math.min(1, cmyList.length / 10);
  const boosted = avgCmy.map(v => Math.min(1, v + darken * 0.3));

  return boosted.map(v => Math.round((1-v)*255));
};

// ── 할일 고유 색상 생성 ────────────────────────────────
const seededRng = (seed) => {
  let s = seed;
  return () => { s = (s * 1664525 + 1013904223) & 0xffffffff; return (s >>> 0) / 0xffffffff; };
};

export const generateTodoColor = (catColor, usedHues = []) => {
  // 카테고리 색에서 기본 hue 추출
  let baseHue = 200;
  if (catColor && catColor.startsWith('#')) {
    const r = parseInt(catColor.slice(1,3),16);
    const g = parseInt(catColor.slice(3,5),16);
    const b = parseInt(catColor.slice(5,7),16);
    const [h] = rgbToHsl(r, g, b);
    baseHue = h;
  }

  // 28도 이상 차이 보장
  let hue = baseHue;
  let attempts = 0;
  while (attempts < 20) {
    const candidate = (baseHue + (Math.random() - 0.5) * 60 + 360) % 360;
    if (usedHues.every(h => Math.abs(candidate - h) > 28)) {
      hue = candidate;
      break;
    }
    attempts++;
  }

  const seed = Math.random();
  const rgb = hslToRgb(hue, 82, 54);
  return {
    hue,
    rgb,
    color: rgbToHex(...rgb),
    seed,
  };
};

// ── 날짜 유틸 ──────────────────────────────────────────
export const dateKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth()+1).padStart(2,'0');
  const day = String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
};

export const addDays = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dateKey(d);
};

export const formatDateLabel = (dateStr) => {
  const today = dateKey();
  if (dateStr === today) return '오늘';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth()+1}월 ${d.getDate()}일`;
};