// ── 색상 변환 ──────────────────────────────────────────
export const hslToRgb = (h, s, l) => {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
};

export const rgbToHsl = (r, g, b) => {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return [h * 360, s * 100, l * 100];
};

export const rgbToHex = (r, g, b) =>
  '#' + [r, g, b].map(x => Math.round(x).toString(16).padStart(2, '0')).join('');

// ── CMY 감산혼합 (makeblack.jsx 동일) ──────────────────
// totalCount: 전체 할일 수 (진행률 기반 다크닝에 사용)
export const mixRgbList = (rgbList, totalCount = null) => {
  if (!rgbList.length) return null;
  const n = rgbList.length;
  // 감산혼합: RGB → CMY로 변환 후 평균 → 다시 RGB
  const avgC = rgbList.reduce((a, c) => a + (1 - c[0] / 255), 0) / n;
  const avgM = rgbList.reduce((a, c) => a + (1 - c[1] / 255), 0) / n;
  const avgY = rgbList.reduce((a, c) => a + (1 - c[2] / 255), 0) / n;
  const r = (1 - avgC) * 255;
  const g = (1 - avgM) * 255;
  const b = (1 - avgY) * 255;
  // 진행률 기반 추가 다크닝 — 100% 완료 시 검정으로 수렴
  const total = totalCount || n;
  const progress = n / total;
  const darken = Math.max(0.02, 1 - Math.pow(progress, 0.7) * 0.98);
  return [r * darken, g * darken, b * darken];
};

// ── 고유 색상 생성 (makeblack.jsx 동일) ────────────────
// usedHues: 이미 사용된 hue 배열 — 28도 이상 차이 보장
export const generateUniqueColor = (usedHues = []) => {
  let hue, tries = 0;
  do {
    hue = Math.floor(Math.random() * 360);
    tries++;
  } while (
    usedHues.some(h => Math.min(Math.abs(h - hue), 360 - Math.abs(h - hue)) < 28) &&
    tries < 100
  );
  const rgb = hslToRgb(hue, 82, 54);
  return { hue, rgb, color: `hsl(${hue},82%,54%)` };
};


// ── 날짜 유틸 ──────────────────────────────────────────
export const dateKey = (d = new Date()) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const getTodayKey = () => dateKey(new Date());

export const addDays = (dateStr, n) => {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return dateKey(d);
};

export const formatDateLabel = (dateStr) => {
  const today = dateKey();
  if (dateStr === today) return '오늘';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric' });
};
