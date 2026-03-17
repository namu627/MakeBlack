import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─────────────────────────────────────────────
// Colour math
// ─────────────────────────────────────────────
function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
function rgbToHsl(r, g, b) {
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
}
function mixRgbList(rgbList, totalCount = null) {
  if (!rgbList.length) return null;
  const n = rgbList.length;
  // 감산혼합: RGB → CMY로 변환 후 평균 → 다시 RGB
  // 물감처럼 색을 섞을수록 어두워짐
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
}
function generateUniqueColor(usedHues) {
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
}

// ─────────────────────────────────────────────
// Ink-on-water canvas
// ─────────────────────────────────────────────
const S = 300;
function makeRng(seed) {
  let s = seed >>> 0;
  return () => { s = (Math.imul(1664525, s) + 1013904223) >>> 0; return s / 0x100000000; };
}
function smoothNoise(angle, seed, octaves = 4) {
  let v = 0, amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    v += Math.sin(angle * Math.pow(2, o) + seed * (o + 1) * 1.618) * amp;
    total += amp; amp *= 0.5;
  }
  return v / total;
}
function drawInkOnWater(ctx, cx, cy, r, g, b, radius, seed, opacity = 1, canvasSize = S) {
  const pad  = Math.ceil(radius * 1.35);
  const x0   = Math.max(0, Math.floor(cx - pad));
  const y0   = Math.max(0, Math.floor(cy - pad));
  const x1   = Math.min(canvasSize, Math.ceil(cx + pad));
  const y1   = Math.min(canvasSize, Math.ceil(cy + pad));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const img  = ctx.getImageData(x0, y0, w, h);
  const data = img.data;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dx = (x0 + px) - cx, dy = (y0 + py) - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const en1 = smoothNoise(angle, seed, 3) * radius * 0.12;
      const en2 = smoothNoise(angle, seed + 5.3, 2) * radius * 0.06;
      const r_edge = radius + en1 + en2;
      const nd = dist / r_edge;
      if (nd > 1.28) continue;
      let a = 0;
      if (nd <= 1.0) {
        const baseFill = 0.55 + nd * 0.25;
        const ring = Math.max(0, 1 - Math.abs(nd - 0.88) / 0.18) * 0.38;
        const tex  = (smoothNoise(angle * 3, seed + 2.1, 2) * 0.5 + 0.5) * 0.12 * (1 - nd * 0.5);
        a = (baseFill + ring + tex) * opacity;
      } else {
        const haloT = (nd - 1.0) / 0.28;
        a = Math.max(0, (1 - haloT) * (smoothNoise(angle, seed + 1.7, 3) * 0.5 + 0.5) * 0.22) * opacity;
      }
      a = Math.max(0, Math.min(1, a));
      if (a < 0.005) continue;
      const idx  = (py * w + px) * 4;
      const aOld = data[idx + 3] / 255;
      const aOut = a + aOld * (1 - a);
      if (aOut < 0.001) continue;
      data[idx    ] = (r * a + data[idx    ] * aOld * (1 - a)) / aOut;
      data[idx + 1] = (g * a + data[idx + 1] * aOld * (1 - a)) / aOut;
      data[idx + 2] = (b * a + data[idx + 2] * aOld * (1 - a)) / aOut;
      data[idx + 3] = aOut * 255;
    }
  }
  ctx.putImageData(img, x0, y0);
}

// 팔레트 캔버스 캐시 — drop이 추가될 때만 증분 렌더링
// key: canvas element → { dropCount, size }
const _paletteCache = new WeakMap();

function renderPalette(canvas, drops, totalCount, size = S) {
  const ctx = canvas.getContext("2d");
  const cached = _paletteCache.get(canvas);

  // drops가 줄었거나(체크 해제) 사이즈 변경 시 전체 재렌더
  const needFull = !cached || cached.size !== size || drops.length < cached.dropCount || cached.dropCount === 0;

  if (needFull) {
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#0d0c0b";
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < drops.length; i++) {
      const [r, g, b] = drops[i].rgb;
      const cx = drops[i].px * size, cy = drops[i].py * size;
      const cornerDist = Math.sqrt(Math.max(cx, size - cx) ** 2 + Math.max(cy, size - cy) ** 2);
      drawInkOnWater(ctx, cx, cy, r, g, b, cornerDist * 0.55, drops[i].seed * 0.001, 0.92, size);
    }
  } else if (drops.length > cached.dropCount) {
    // 새 drop만 증분으로 그리기
    for (let i = cached.dropCount; i < drops.length; i++) {
      const [r, g, b] = drops[i].rgb;
      const cx = drops[i].px * size, cy = drops[i].py * size;
      const cornerDist = Math.sqrt(Math.max(cx, size - cx) ** 2 + Math.max(cy, size - cy) ** 2);
      drawInkOnWater(ctx, cx, cy, r, g, b, cornerDist * 0.55, drops[i].seed * 0.001, 0.92, size);
    }
  }

  // BLACK 오버레이
  if (totalCount && drops.length >= totalCount) {
    ctx.fillStyle = "rgba(0,0,0,0.82)";
    ctx.fillRect(0, 0, size, size);
  }

  _paletteCache.set(canvas, { dropCount: drops.length, size });
}

// Tiny palette dot for calendar cell
function CalendarPalette({ drops, totalCount, size = 36 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) renderPalette(ref.current, drops, totalCount, size);
  }, [drops, totalCount, size]);
  return <canvas ref={ref} width={size} height={size} style={{ width: size, height: size, borderRadius: "50%", display: "block" }} />;
}

// Full palette with animation
function PaletteCanvas({ drops, version, totalCount, animDrop, onAnimDone }) {
  const staticRef = useRef(null);
  const animRef   = useRef(null);
  useEffect(() => {
    if (staticRef.current) renderPalette(staticRef.current, drops, totalCount, S);
  }, [drops, version, totalCount]);

  useEffect(() => {
    if (!animDrop) return;
    const canvas = animRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const [r, g, b] = animDrop.rgb;
    const cx = animDrop.px * S, cy = animDrop.py * S;
    const seed = animDrop.seed * 0.001;
    const cornerDist = Math.sqrt(Math.max(cx, S - cx) ** 2 + Math.max(cy, S - cy) ** 2);
    const maxR = cornerDist * 0.55;
    let frame = 0; const FRAMES = 68; let raf;
    function draw() {
      ctx.clearRect(0, 0, S, S);
      const t = frame / FRAMES;
      const eExpand = 1 - Math.pow(1 - Math.min(t * 1.15, 1), 3.5);
      const eFade   = t < 0.52 ? 1 : Math.max(0, 1 - (t - 0.52) / 0.48);
      if (eFade <= 0) { ctx.clearRect(0, 0, S, S); onAnimDone(); return; }
      const curR = eExpand * maxR;
      if (curR > 2) drawInkOnWater(ctx, cx, cy, r, g, b, curR, seed, eFade * 0.85, S);
      frame++; raf = requestAnimationFrame(draw);
    }
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [animDrop]);

  return (
    <div style={{ position: "relative", width: "100%", aspectRatio: "1" }}>
      <canvas ref={staticRef} width={S} height={S} style={{ width: "100%", height: "100%", borderRadius: 14, display: "block" }} />
      <canvas ref={animRef}   width={S} height={S} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: 14, pointerEvents: "none" }} />

    </div>
  );
}

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────
const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const getTodayKey = () => dateKey(new Date());



// ─────────────────────────────────────────────
// Initial data
// ─────────────────────────────────────────────
let _uid = 200;
const uid = () => ++_uid;

const DEFAULT_CATEGORIES = [
  { id: 1, name: "공부", color: "#6c8fff" },
  { id: 2, name: "운동", color: "#ff7c6e" },
];
const DEFAULT_ROUTINES = [];
// ─── Onboarding ───
function OnboardingOverlay({ onDone }) {
  const [step, setStep] = useState(0);
  const steps = [
    { icon: "🎨", title: "MakeBlack", desc: "할 일을 완료할 때마다\n물감이 팔레트에 퍼져나가요" },
    { icon: "✦",  title: "색이 섞여요", desc: "여러 할 일을 완료할수록\n색이 혼합되어 검정으로 가까워져요" },
    { icon: "●",  title: "BLACK 달성", desc: "모든 할 일을 완료하면\n팔레트가 BLACK이 돼요" },
    { icon: "◈",  title: "팀 팔레트", desc: "친구와 팀을 만들어\n함께 팔레트를 BLACK으로 채워요\n각자의 색이 섞여 하나가 돼요" },
  ];
  const s = steps[step];
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 400, background: "#080808", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
      <div style={{ fontSize: 56, marginBottom: 24 }}>{s.icon}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#f0ece6", marginBottom: 12, letterSpacing: "-0.02em" }}>{s.title}</div>
      <div style={{ fontSize: 14, color: "#4a4a4a", textAlign: "center", lineHeight: 1.8, whiteSpace: "pre-line", marginBottom: 48 }}>{s.desc}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 32 }}>
        {steps.map((_, i) => <div key={i} style={{ width: i === step ? 20 : 6, height: 6, borderRadius: 3, background: i === step ? "#f0ece6" : "#252525", transition: "all 0.3s" }} />)}
      </div>
      {step < steps.length - 1
        ? <button onClick={() => setStep(s => s + 1)} style={{ padding: "13px 40px", background: "#f0ece6", color: "#080808", border: "none", borderRadius: 999, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>다음</button>
        : <button onClick={onDone} style={{ padding: "13px 40px", background: "#f0ece6", color: "#080808", border: "none", borderRadius: 999, cursor: "pointer", fontSize: 14, fontWeight: 700, fontFamily: "inherit" }}>시작하기</button>
      }
    </div>
  );
}


// ─────────────────────────────────────────────
// Design tokens
// ─────────────────────────────────────────────
const THEMES = {
  dark: {
    bg: "#0a0a0a", surface: "#141414", card: "#181818",
    border: "#242424", border2: "#2e2e2e",
    text: "#f0ece6", muted: "#888888", dim: "#555555", pill: "#1e1e1e",
    paletteBase: "#0d0c0b",
  },
  light: {
    bg: "#f5f4f0", surface: "#ffffff", card: "#f0eeea",
    border: "#e0ddd8", border2: "#d4d0cb",
    text: "#1a1a1a", muted: "#777777", dim: "#aaaaaa", pill: "#e8e5e0",
    paletteBase: "#f0eeea",
  },
};
// C는 App root에서 주입되는 전역 ref — 초기값은 dark
let C = THEMES.dark;
const radius = { sm: 10, md: 16, lg: 22, full: 999 };

// ─────────────────────────────────────────────
// Shared tiny components
// ─────────────────────────────────────────────
function Pill({ children, active, onClick, color }) {
  return (
    <button onClick={onClick} style={{
      padding: "5px 13px", borderRadius: radius.full,
      border: `1px solid ${active ? (color || "#555") : C.border2}`,
      background: active ? (color ? color + "22" : "#242424") : "transparent",
      color: active ? (color || C.text) : C.muted,
      cursor: "pointer", fontSize: 12, fontFamily: "inherit",
      transition: "all 0.18s", whiteSpace: "nowrap",
    }}>{children}</button>
  );
}

function Modal({ onClose, children, title }) {
  return (
    <div onClick={onClose} style={{
      position: "fixed", inset: 0, zIndex: 200,
      background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "flex-end",
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: "100%", background: C.surface,
        borderRadius: "26px 26px 0 0",
        padding: "0 20px 48px", maxHeight: "90vh", overflowY: "auto",
      }}>
        <div style={{ width: 34, height: 4, borderRadius: 2, background: "#252525", margin: "14px auto 18px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text, letterSpacing: "-0.02em" }}>{title}</span>
          <button onClick={onClose} style={{
            width: 28, height: 28, borderRadius: "50%",
            background: C.surface, border: `1px solid ${C.border}`,
            color: C.muted, fontSize: 14, cursor: "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit",
          }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StyledInput({ value, onChange, onKeyDown, placeholder, inputRef }) {
  return (
    <input ref={inputRef} value={value} onChange={onChange} onKeyDown={onKeyDown}
      placeholder={placeholder}
      style={{
        flex: 1, background: C.surface, border: `1px solid ${C.border2}`,
        borderRadius: radius.md, padding: "11px 14px",
        color: C.text, fontSize: 13, fontFamily: "inherit", outline: "none",
        transition: "border-color 0.15s",
      }} />
  );
}

// ─────────────────────────────────────────────
// Category Manager Modal
// ─────────────────────────────────────────────
function CategoryManager({ categories, setCategories, routines, setRoutines, onClose }) {
  const [tab, setTab]               = useState("cats");
  const [newCatName, setNewCatName] = useState("");
  const [newCatColor, setNewCatColor] = useState("#6c8fff");
  const [routineForm, setRoutineForm] = useState(null);
  const COLORS = ["#6c8fff","#ff7c6e","#a8e063","#ffd166","#c77dff","#06d6a0","#ffb347","#ef476f","#4ecdc4","#f7b731"];

  const addCat = () => {
    if (!newCatName.trim()) return;
    setCategories(c => [...c, { id: uid(), name: newCatName.trim(), color: newCatColor }]);
    setNewCatName("");
  };
  const [confirmDelCat, setConfirmDelCat] = useState(null); // catId to delete
  const delCat = (id) => setConfirmDelCat(id);
  const confirmDelete = () => {
    setCategories(c => c.filter(x => x.id !== confirmDelCat));
    setRoutines(r => r.filter(x => x.catId !== confirmDelCat));
    setConfirmDelCat(null);
  };
  const saveRoutine = () => {
    if (!routineForm?.name?.trim()) return;
    if (routineForm.id) setRoutines(r => r.map(x => x.id === routineForm.id ? routineForm : x));
    else setRoutines(r => [...r, { ...routineForm, id: uid() }]);
    setRoutineForm(null);
  };
  const toggleDay = d => setRoutineForm(f => ({ ...f, days: f.days.includes(d) ? f.days.filter(x=>x!==d) : [...f.days,d] }));

  return (
    <Modal onClose={onClose} title="카테고리 관리">
      {/* tabs */}
      <div style={{ display: "flex", gap: 6, marginBottom: 22 }}>
        {[["cats","카테고리 ✦"],["routines","루틴 ◎"]].map(([k,l]) => (
          <Pill key={k} active={tab===k} onClick={() => setTab(k)}>{l}</Pill>
        ))}
      </div>

      {tab === "cats" && (<>
        {/* color row */}
        <div style={{ display: "flex", gap: 7, marginBottom: 14, flexWrap: "wrap" }}>
          {COLORS.map(c => (
            <div key={c} onClick={() => setNewCatColor(c)} style={{
              width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer",
              outline: newCatColor===c ? `2px solid #fff` : "2px solid transparent",
              outlineOffset: 2, transition: "outline 0.12s",
            }} />
          ))}
        </div>
        {/* add row */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
          <StyledInput value={newCatName} onChange={e=>setNewCatName(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&addCat()} placeholder="새 카테고리 이름" />
          <button onClick={addCat} style={{
            width: 42, height: 42, borderRadius: radius.md,
            background: C.text, color: C.bg, border: "none",
            cursor: "pointer", fontSize: 20, fontWeight: 700, flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>+</button>
        </div>
        {/* list with drag-to-reorder */}
        {categories.length === 0 && <div style={{ textAlign: "center", color: C.dim, fontSize: 13, padding: "20px 0" }}>아직 카테고리가 없어요</div>}
        {/* 삭제 확인 */}
        {confirmDelCat && (
          <div style={{ background: "#1e1010", border: "1px solid #3a1a1a", borderRadius: radius.md, padding: "14px", marginBottom: 10 }}>
            <div style={{ fontSize: 13, color: "#ff7070", marginBottom: 12 }}>이 카테고리와 관련된 루틴도 모두 삭제돼요. 계속할까요?</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setConfirmDelCat(null)} style={{ flex: 1, padding: "9px", background: "transparent", border: `1px solid ${C.border2}`, borderRadius: radius.sm, color: C.muted, cursor: "pointer", fontFamily: "inherit", fontSize: 12 }}>취소</button>
              <button onClick={confirmDelete} style={{ flex: 1, padding: "9px", background: "#ff4444", border: "none", borderRadius: radius.sm, color: "#fff", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 12 }}>삭제</button>
            </div>
          </div>
        )}
        {categories.map((cat, idx) => (
          <div key={cat.id}
            draggable
            onDragStart={e => e.dataTransfer.setData("catIdx", idx)}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              const from = Number(e.dataTransfer.getData("catIdx"));
              if (from === idx) return;
              const next = [...categories];
              next.splice(idx, 0, next.splice(from, 1)[0]);
              setCategories(next);
            }}
            style={{
              display: "flex", alignItems: "center", gap: 12,
              padding: "13px 14px", marginBottom: 6,
              background: C.card, borderRadius: radius.md,
              border: `1px solid ${C.border}`, cursor: "grab",
            }}>
            <span style={{ fontSize: 14, color: C.dim, cursor: "grab", flexShrink: 0, letterSpacing: "0.05em" }}>⠿</span>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: cat.color, boxShadow: `0 0 8px ${cat.color}88`, flexShrink: 0 }} />
            <span style={{ flex: 1, color: C.text, fontSize: 14 }}>{cat.name}</span>
            <button onClick={() => delCat(cat.id)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}>✕</button>
          </div>
        ))}
      </>)}

      {tab === "routines" && (<>
        <button onClick={() => setRoutineForm({ catId: categories[0]?.id, name: "", repeatType: "days", days: [], monthDays: [], startDate: getTodayKey(), endDate: "", dates: [] })} style={{
          width: "100%", padding: "12px", background: C.surface,
          border: `1px dashed ${C.border2}`, borderRadius: radius.md,
          color: C.muted, cursor: "pointer", fontSize: 13,
          marginBottom: 14, fontFamily: "inherit",
        }}>+ 루틴 추가하기</button>

        {routines.map(r => {
          const cat = categories.find(c => c.id === r.catId);
          const repeatLabel = r.repeatType === "monthly"
            ? `매월 ${(r.monthDays||[]).join(", ")}일`
            : (r.days||[]).map(d => ["일","월","화","수","목","금","토"][d]).join(", ");
          return (
            <div key={r.id} style={{ padding: "13px 14px", marginBottom: 8, background: C.card, borderRadius: radius.md, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: cat?.color ?? "#888" }} />
                <span style={{ fontSize: 11, color: C.muted }}>{cat?.name}</span>
                <span style={{ flex: 1, fontSize: 14, color: C.text }}>{r.name}</span>
                <button onClick={() => setRoutineForm({...r, repeatType: r.repeatType||"days", monthDays: r.monthDays||[], startDate: r.startDate||getTodayKey(), endDate: r.endDate||""})} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>편집</button>
                <button onClick={() => setRoutines(rs => rs.filter(x => x.id !== r.id))} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ fontSize: 11, color: C.dim }}>{repeatLabel || "반복 없음"}</div>
              {(r.startDate || r.endDate) && (
                <div style={{ fontSize: 10, color: C.dim, marginTop: 3 }}>
                  {r.startDate} ~ {r.endDate || "종료일 없음"}
                </div>
              )}
            </div>
          );
        })}

        {routineForm && (
          <div style={{ marginTop: 16, background: C.surface, borderRadius: radius.lg, padding: 16, border: `1px solid ${C.border2}` }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>루틴 {routineForm.id ? "편집" : "추가"}</div>

            {/* 카테고리 */}
            <select value={routineForm.catId} onChange={e => setRoutineForm(f => ({...f, catId: Number(e.target.value)}))}
              style={{ width: "100%", background: C.card, border: `1px solid ${C.border2}`, borderRadius: radius.sm, padding: "10px 12px", color: C.text, fontSize: 13, marginBottom: 10, outline: "none", fontFamily: "inherit" }}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>

            {/* 루틴 이름 */}
            <input value={routineForm.name} onChange={e => setRoutineForm(f => ({...f, name: e.target.value}))}
              placeholder="루틴 이름" style={{ width: "100%", boxSizing: "border-box", background: C.card, border: `1px solid ${C.border2}`, borderRadius: radius.sm, padding: "10px 12px", color: C.text, fontSize: 13, marginBottom: 12, outline: "none", fontFamily: "inherit" }} />

            {/* 반복 타입 탭 */}
            <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
              {[["days","요일 반복"],["monthly","날짜 반복"]].map(([k,l]) => (
                <button key={k} onClick={() => setRoutineForm(f => ({...f, repeatType: k}))} style={{
                  flex: 1, padding: "8px 0", borderRadius: radius.sm, cursor: "pointer", fontSize: 12, fontFamily: "inherit",
                  background: routineForm.repeatType === k ? C.text : C.card,
                  color: routineForm.repeatType === k ? "#080808" : C.dim,
                  border: `1px solid ${routineForm.repeatType === k ? C.text : C.border2}`,
                  transition: "all 0.15s",
                }}>{l}</button>
              ))}
            </div>

            {/* 요일 반복 */}
            {routineForm.repeatType === "days" && (
              <>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>반복 요일</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
                  {["일","월","화","수","목","금","토"].map((d,i) => (
                    <div key={i} onClick={() => setRoutineForm(f => ({ ...f, days: f.days.includes(i) ? f.days.filter(x=>x!==i) : [...f.days,i] }))} style={{
                      flex: 1, height: 34, borderRadius: radius.sm, cursor: "pointer", transition: "all 0.15s",
                      background: routineForm.days.includes(i) ? C.text : C.card,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, color: routineForm.days.includes(i) ? "#080808" : C.dim,
                    }}>{d}</div>
                  ))}
                </div>
              </>
            )}

            {/* 날짜 반복 (매월 N일) */}
            {routineForm.repeatType === "monthly" && (
              <>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>매월 반복할 날짜 (복수 선택 가능)</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 14 }}>
                  {Array.from({length: 31}, (_,i) => i+1).map(d => (
                    <div key={d} onClick={() => setRoutineForm(f => ({ ...f, monthDays: (f.monthDays||[]).includes(d) ? f.monthDays.filter(x=>x!==d) : [...(f.monthDays||[]),d] }))} style={{
                      width: 32, height: 32, borderRadius: radius.sm, cursor: "pointer", transition: "all 0.15s",
                      background: (routineForm.monthDays||[]).includes(d) ? C.text : C.card,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, color: (routineForm.monthDays||[]).includes(d) ? "#080808" : C.dim,
                      border: `1px solid ${C.border}`,
                    }}>{d}</div>
                  ))}
                </div>
              </>
            )}

            {/* 시작일 / 종료일 */}
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>기간</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>시작일</div>
                <input type="date" value={routineForm.startDate||""} onChange={e => setRoutineForm(f => ({...f, startDate: e.target.value}))}
                  style={{ width: "100%", boxSizing: "border-box", background: C.card, border: `1px solid ${C.border2}`, borderRadius: radius.sm, padding: "9px 10px", color: C.text, fontSize: 12, outline: "none", fontFamily: "inherit", colorScheme: "dark" }} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: C.dim, marginBottom: 4 }}>종료일</div>
                <input type="date" value={routineForm.endDate||""} onChange={e => setRoutineForm(f => ({...f, endDate: e.target.value}))}
                  style={{ width: "100%", boxSizing: "border-box", background: C.card, border: `1px solid ${C.border2}`, borderRadius: radius.sm, padding: "9px 10px", color: C.text, fontSize: 12, outline: "none", fontFamily: "inherit", colorScheme: "dark" }} />
              </div>
            </div>

            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={() => setRoutineForm(null)} style={{ flex: 1, padding: "11px", background: "transparent", border: `1px solid ${C.border2}`, borderRadius: radius.md, color: C.muted, cursor: "pointer", fontFamily: "inherit", fontSize: 13 }}>취소</button>
              <button onClick={saveRoutine} style={{ flex: 1, padding: "11px", background: C.text, border: "none", borderRadius: radius.md, color: "#080808", cursor: "pointer", fontWeight: 700, fontFamily: "inherit", fontSize: 13 }}>저장</button>
            </div>
          </div>
        )}
      </>)}
    </Modal>
  );
}

// ─────────────────────────────────────────────
// FlyingOrb — 검정 원이 팔레트 위치로 날아가는 Canvas 애니메이션
// ─────────────────────────────────────────────
function FlyingOrb({ sx, sy, tx, ty, drops, totalCount }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const W = window.innerWidth, H = window.innerHeight;
    canvas.width = W; canvas.height = H;

    // Orb starts white-ish (from BLACK screen), shrinks and darkens as it flies
    const FRAMES = 30; // ~480ms at 60fps
    let frame = 0;
    let raf;

    // Bezier control point — arc upward slightly for natural trajectory
    const cx1 = sx + (tx - sx) * 0.3;
    const cy1 = Math.min(sy, ty) - Math.abs(tx - sx) * 0.25;

    function bezier(t, p0, p1, p2) {
      return (1-t)*(1-t)*p0 + 2*(1-t)*t*p1 + t*t*p2;
    }

    function draw() {
      ctx.clearRect(0, 0, W, H);
      const t  = frame / FRAMES;
      const et = 1 - Math.pow(1 - t, 3); // ease-out

      const x  = bezier(et, sx, cx1, tx);
      const y  = bezier(et, sy, cy1, ty);

      // Size: 40px → 16px
      const r  = 40 - et * 24;
      // Color: white → black
      const lum = Math.round(255 * (1 - et));
      // Opacity: stays full until 80%, then fades
      const alpha = t < 0.8 ? 1 : 1 - (t - 0.8) / 0.2;

      // Glow
      if (lum > 80) {
        const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 2.5);
        glow.addColorStop(0, `rgba(${lum},${lum},${lum},${alpha * 0.25})`);
        glow.addColorStop(1, "transparent");
        ctx.beginPath(); ctx.arc(x, y, r * 2.5, 0, Math.PI*2);
        ctx.fillStyle = glow; ctx.fill();
      }

      // Main orb
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${lum},${lum},${lum},${alpha})`;
      ctx.fill();

      // Trailing tail — small faded circles behind
      for (let i = 1; i <= 3; i++) {
        const tt = Math.max(0, et - i * 0.06);
        const tx2 = bezier(tt, sx, cx1, tx);
        const ty2 = bezier(tt, sy, cy1, ty);
        const tr = r * (1 - i * 0.2);
        const ta = alpha * (0.25 - i * 0.07);
        if (tr > 0 && ta > 0) {
          ctx.beginPath();
          ctx.arc(tx2, ty2, tr, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${lum},${lum},${lum},${ta})`;
          ctx.fill();
        }
      }

      frame++;
      if (frame <= FRAMES) raf = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, W, H);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas ref={canvasRef} style={{
      position: "fixed", inset: 0, zIndex: 350, pointerEvents: "none",
    }} />
  );
}

// ─────────────────────────────────────────────
// Home Screen
// ─────────────────────────────────────────────
function HomeScreen({ cats, setCats, ruts, setRuts, paletteHistory, setPaletteHistory, todosByDate, setTodosByDate, selectedDate, setSelectedDate, settings }) {
  // Dynamic today — refreshes at midnight
  const [todayKey, setTodayKey]         = useState(getTodayKey);
  useEffect(() => {
    const tick = () => { const nk = getTodayKey(); if (nk !== todayKey) setTodayKey(nk); };
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [todayKey]);

  const [showCatMgr,   setShowCatMgr]   = useState(false);
  const [viewMonth, setViewMonth]       = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [addingTo, setAddingTo]         = useState(null);
  const [newTodoText, setNewTodoText]   = useState("");
  const [editingTodo, setEditingTodo]   = useState(null); // {catId, todoId, text}
  const editInputRef = useRef(null);
  const [animDrop, setAnimDrop]         = useState(null);
  const [canvasVer, setCanvasVer]       = useState(0);
  const [blackPhase, setBlackPhase]     = useState(null); // null | "in" | "out"
  const [usedHues, setUsedHues]         = useState([]);
  // selectedDate 바뀌면 usedHues 초기화 (날짜별 독립 색상 관리)
  const prevDateRef = useRef(selectedDate);
  useEffect(() => {
    if (prevDateRef.current !== selectedDate) {
      prevDateRef.current = selectedDate;
      setUsedHues([]);
    }
  }, [selectedDate]);
  const [showCal, setShowCal]           = useState(false);
  const [calClosing, setCalClosing]     = useState(false);
  const [flyOrb, setFlyOrb]             = useState(null);
  const [stampDate, setStampDate]       = useState(null);
  const targetCellRef = useRef(null);  // ref on the selected date cell in calendar
  const paletteAreaRef = useRef(null);
  const inputRef  = useRef(null);
  const blackTimer = useRef(null);

  const selDateObj = new Date(selectedDate + "T00:00:00");

  const getDateTodos = useCallback((dk) => {
    const base = todosByDate[dk] || {};
    const result = {};
    cats.forEach(cat => { result[cat.id] = [...(base[cat.id] || [])]; });
    ruts.forEach(rut => {
      // 시작일 / 종료일 범위 체크
      if (rut.startDate && dk < rut.startDate) return;
      if (rut.endDate   && dk > rut.endDate)   return;

      const dt  = new Date(dk + "T00:00:00");
      const dow = dt.getDay();
      const dayOfMonth = dt.getDate();
      const repeatType = rut.repeatType || "days";

      let applies = false;
      if (repeatType === "days")    applies = (rut.days||[]).includes(dow);
      if (repeatType === "monthly") applies = (rut.monthDays||[]).includes(dayOfMonth);
      // 하위호환: 기존 dates 배열
      if (!applies && (rut.dates||[]).includes(dk)) applies = true;
      if (!applies) return;

      const catTodos = result[rut.catId] || [];
      const routineTodoId = `r${rut.id}-${dk}`;
      const existing = catTodos.find(t => t.id === routineTodoId);
      if (!existing) {
        const saved = (todosByDate[dk]?.[rut.catId] || []).find(t => t.id === routineTodoId);
        // 루틴 todo에 카테고리 색 부여 (체크박스, 완료 표시에 사용)
        const rutCat = cats.find(ct => ct.id === rut.catId);
        const rutHue = (() => {
          if (!rutCat) return (rut.id * 47) % 360;
          const col = rutCat.color;
          // hex 색상 → RGB → HSL
          if (col.startsWith('#')) {
            const hex = col.replace('#','');
            const r = parseInt(hex.slice(0,2),16), g = parseInt(hex.slice(2,4),16), b = parseInt(hex.slice(4,6),16);
            return rgbToHsl(r, g, b)[0];
          }
          // hsl() 형식
          const m = col.match(/\d+/g);
          return m ? Number(m[0]) : (rut.id * 47) % 360;
        })();
        const rutRgb = hslToRgb(rutHue, 72, 56);
        result[rut.catId] = [{
          id: routineTodoId, text: rut.name,
          done: saved?.done ?? false,
          routineId: rut.id,
          hue: rutHue, rgb: rutRgb, color: `hsl(${Math.round(rutHue)},72%,56%)`,
          seed: rut.id * 7
        }, ...catTodos];
      }
    });
    return result;
  }, [todosByDate, cats, ruts]);

  const selTodos   = getDateTodos(selectedDate);
  const allTodos   = Object.values(selTodos).flat();

  // 캘린더용 월별 todo 캐시 — getDateTodos를 31번 호출하는 대신 한 번에 계산
  const calMonthTodoCache = useMemo(() => {
    const cache = {};
    const y = viewMonth.y, m = viewMonth.m;
    const days = new Date(y, m + 1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const dk = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const todos = Object.values(getDateTodos(dk)).flat();
      cache[dk] = { hasTodos: todos.length > 0, hasIncomplete: todos.some(t => !t.done) };
    }
    return cache;
  }, [viewMonth, todosByDate, cats, ruts]);
  const doneCount  = allTodos.filter(t => t.done).length;
  const totalCount = allTodos.length;
  const progress   = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;
  const isBlack    = progress === 100 && totalCount > 0;
  const histEntry  = paletteHistory[selectedDate] || { drops: [], total: 0 };
  const drops      = histEntry.drops || [];

  useEffect(() => {
    if (isBlack && blackPhase === null) {
      if (!settings.blackAnimationOn) return; // 애니메이션 off 시 스킵
      setBlackPhase("in");
      clearTimeout(blackTimer.current);
      blackTimer.current = setTimeout(() => {
        // ── 1. 오버레이 fade-out 시작 ──
        setBlackPhase("out");
        // ── 2. fade-out 시작 직후(150ms) 캘린더 열기 ──
        blackTimer.current = setTimeout(() => {
          setShowCal(true);
          // ── 3. 캘린더 거의 열린 시점(250ms)에 orb 발사 ──
          blackTimer.current = setTimeout(() => {
            setBlackPhase(null);
            const vw = window.innerWidth, vh = window.innerHeight;
            const cellEl = targetCellRef.current;
            const rect = cellEl?.getBoundingClientRect();
            const tx = rect ? rect.left + rect.width / 2 : vw / 2;
            const ty = rect ? rect.top  + rect.height / 2 : 120;
            setFlyOrb({ sx: vw / 2, sy: vh / 2, tx, ty });
            // ── 4. orb 착지 후 stamp ──
            blackTimer.current = setTimeout(() => {
              setFlyOrb(null);
              setStampDate(selectedDate);
              // ── 5. stamp 후 캘린더 닫기 ──
              blackTimer.current = setTimeout(() => {
                setStampDate(null);
                closeCalendar();
              }, 400);
            }, 480);
          }, 250);
        }, 150);
      }, 1000);
    }
  }, [isBlack]);
  const closeCalendar = (cb) => {
    setCalClosing(true);
    setTimeout(() => { setShowCal(false); setCalClosing(false); if (cb) cb(); }, 220);
  };
  useEffect(() => { setBlackPhase(null); clearTimeout(blackTimer.current); setCanvasVer(v => v + 1); }, [selectedDate]);

  const toggleTodo = (catId, todoId) => {
    const dk = selectedDate;
    const todo = (selTodos[catId] || []).find(t => t.id === todoId);
    if (!todo) return;
    const willDone = !todo.done;
    // 완료 → 미완료: 팔레트 drop도 제거되니 의도적 동작임을 보장
    setTodosByDate(prev => {
      const base = prev[dk] || {};
      const allCat = selTodos[catId] || [];
      const mapped = allCat.map(t => t.id === todoId ? { ...t, done: !t.done } : t);
      return { ...prev, [dk]: { ...base, [catId]: mapped } };
    });
    setPaletteHistory(prev => {
      const entry = prev[dk] || { drops: [], total: 0 };
      // total을 항상 현재 allTodos.length로 동기화
      const syncedTotal = allTodos.length;
      if (willDone) {
        if (entry.drops.some(d => d.id === todoId)) return prev;
        const { hue, rgb, color } = generateUniqueColor(entry.drops.map(d => d.hue));
        const seed = uid() * 17;
        const drop = { id: todoId, hue, rgb, color, px: 0.12 + Math.random() * 0.76, py: 0.12 + Math.random() * 0.76, seed };
        setAnimDrop(drop); setCanvasVer(v => v + 1);
        return { ...prev, [dk]: { drops: [...entry.drops, drop], total: syncedTotal } };
      } else {
        setCanvasVer(v => v + 1); setBlackPhase(null); clearTimeout(blackTimer.current);
        return { ...prev, [dk]: { ...entry, drops: entry.drops.filter(d => d.id !== todoId), total: syncedTotal } };
      }
    });
  };

  const addTodo = (catId) => {
    if (!newTodoText.trim()) { setAddingTo(null); return; }
    const { hue, rgb, color } = generateUniqueColor(usedHues);
    const seed = uid() * 31;
    const todo = { id: uid(), text: newTodoText.trim(), done: false, hue, rgb, color, seed };
    setUsedHues(h => [...h, hue]);
    setTodosByDate(prev => {
      const base = prev[selectedDate] || {};
      return { ...prev, [selectedDate]: { ...base, [catId]: [...(base[catId] || []), todo] } };
    });
    setNewTodoText(""); setAddingTo(null);
  };

  const deleteTodo = (catId, todoId) => {
    setTodosByDate(prev => {
      const base = prev[selectedDate] || {};
      return { ...prev, [selectedDate]: { ...base, [catId]: (base[catId] || []).filter(t => t.id !== todoId) } };
    });
    setPaletteHistory(prev => {
      const entry = prev[selectedDate] || { drops: [], total: 0 };
      const newDrops = entry.drops.filter(d => d.id !== todoId);
      // total도 1 감소 동기화
      const newTotal = Math.max(0, (entry.total || 0) - 1);
      return { ...prev, [selectedDate]: { drops: newDrops, total: newTotal } };
    });
    setCanvasVer(v => v + 1);
  };

  const saveEdit = () => {
    if (!editingTodo) return;
    const { catId, todoId, text } = editingTodo;
    if (!text.trim()) { setEditingTodo(null); return; }
    setTodosByDate(prev => {
      const base = prev[selectedDate] || {};
      const list = (base[catId] || []).map(t => t.id === todoId ? { ...t, text: text.trim() } : t);
      return { ...prev, [selectedDate]: { ...base, [catId]: list } };
    });
    setEditingTodo(null);
  };

  // Calendar — driven by viewMonth, independent of selectedDate
  const calYear     = viewMonth.y;
  const calMonth    = viewMonth.m;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const _rawDow1 = new Date(calYear, calMonth, 1).getDay(); // 0=Sun
  const firstDow = settings.calStartSunday ? _rawDow1 : (_rawDow1 === 0 ? 6 : _rawDow1 - 1);
  const monthName   = new Date(calYear, calMonth, 1).toLocaleString("ko-KR", { month: "long" });
  const goMonth     = (delta) => setViewMonth(({ y, m }) => {
    const d = new Date(y, m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const goDay = (delta) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + delta);
    const dk = dateKey(d);
    setSelectedDate(dk);
    setViewMonth({ y: d.getFullYear(), m: d.getMonth() });
  };

  const mixedRgb = mixRgbList(drops.map(d => d.rgb), totalCount);
  const mixedHsl = mixedRgb ? rgbToHsl(...mixedRgb) : null;
  const mixedCss = mixedHsl ? `hsl(${mixedHsl[0]|0},${mixedHsl[1]|0}%,${mixedHsl[2]|0}%)` : null;
  const isToday  = selectedDate === todayKey;


  // Gradient progress bar: left=first drop color, right=mixed color, darkens toward black
  const progressGradient = (() => {
    if (drops.length === 0) return C.border;
    if (drops.length === 1) return drops[0].color;
    const first = `hsl(${drops[0].hue},82%,54%)`;
    const last  = mixedCss || first;
    return `linear-gradient(90deg, ${first}, ${last})`;
  })();

  return (
    <div style={{ height: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui,sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── BLACK overlay ── */}
      {blackPhase && (
        <div onClick={() => {
            clearTimeout(blackTimer.current);
            setBlackPhase("out");
            blackTimer.current = setTimeout(() => {
              setShowCal(true);
              blackTimer.current = setTimeout(() => {
                setBlackPhase(null);
                const vw = window.innerWidth, vh = window.innerHeight;
                const cellEl = targetCellRef.current;
                const rect = cellEl?.getBoundingClientRect();
                const tx = rect ? rect.left + rect.width / 2 : vw / 2;
                const ty = rect ? rect.top  + rect.height / 2 : 120;
                setFlyOrb({ sx: vw/2, sy: vh/2, tx, ty });
                blackTimer.current = setTimeout(() => {
                  setFlyOrb(null);
                  setStampDate(selectedDate);
                  blackTimer.current = setTimeout(() => {
                    setStampDate(null); closeCalendar();
                  }, 400);
                }, 480);
              }, 250);
            }, 150);
          }}
          style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.97)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", cursor: "pointer",
            animation: blackPhase === "in" ? "blackIn 0.4s cubic-bezier(0.22,1,0.36,1) forwards" : "blackOut 0.45s ease forwards" }}>
          {/* ● 흰→검정 전환 */}
          <div style={{
            width: 80, height: 80, borderRadius: "50%", marginBottom: 28, flexShrink: 0,
            background: blackPhase === "out" ? "#000" : "#fff",
            boxShadow: blackPhase === "out" ? "none" : "0 0 40px rgba(255,255,255,0.4)",
            transition: "background 0.5s ease, box-shadow 0.5s ease",
            animation: blackPhase === "in" ? "pulse 2s 0.4s ease-in-out infinite" : "none",
          }} />
          <div style={{ fontSize: 28, letterSpacing: "0.55em", color: "#fff", fontWeight: 200 }}>BLACK</div>
          <div style={{ fontSize: 12, color: "#555", marginTop: 14, letterSpacing: "0.12em" }}>모든 색이 하나가 됐어요</div>
        </div>
      )}

      {/* ── Flying orb (BLACK → palette) ── */}
      {flyOrb && (
        <FlyingOrb
          sx={flyOrb.sx} sy={flyOrb.sy}
          tx={flyOrb.tx} ty={flyOrb.ty}
          drops={drops} totalCount={totalCount}
        />
      )}

      {/* ── Calendar sheet ── */}
      {showCal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(10px)" }} onClick={() => closeCalendar()}>
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: C.surface, borderRadius: "0 0 28px 28px", padding: "20px 18px 28px", animation: calClosing ? "slideUp 0.3s cubic-bezier(0.4,0,0.6,1) forwards" : "slideDown 0.2s cubic-bezier(0.22,1,0.36,1)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <button onClick={() => goMonth(-1)} style={{ width: 34, height: 34, borderRadius: "50%", background: C.surface, border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 18, fontFamily: "inherit" }}>‹</button>
              <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.02em" }}>{calYear}년 {monthName}</span>
              <button onClick={() => goMonth(1)} style={{ width: 34, height: 34, borderRadius: "50%", background: C.surface, border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 18, fontFamily: "inherit" }}>›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 6 }}>
              {["일","월","화","수","목","금","토"].map((d,i) => (
                <div key={d} style={{ textAlign: "center", fontSize: 10, color: i===0?"#ff7070":i===6?"#7090ff":C.dim }}>{d}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
              {Array.from({ length: firstDow }).map((_,i) => <div key={`e${i}`} />)}
              {Array.from({ length: daysInMonth }, (_,i) => i+1).map(day => {
                const dk    = `${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                const isSel = dk === selectedDate;
                const isTod = dk === todayKey;
                const hist  = paletteHistory[dk];
                const dow   = new Date(dk + "T00:00:00").getDay();
                const isDone = hist?.total > 0 && (hist.drops?.length||0) >= hist.total;
                // 캐시에서 할일 상태 읽기
                const cachedDay = calMonthTodoCache[dk] || { hasTodos: false, hasIncomplete: false };
                const hasTodos      = cachedDay.hasTodos;
                const hasIncomplete = cachedDay.hasIncomplete;
                // 날짜 숫자 색상: 요일색 우선 → 미완료=흰색, 완료=흐림, 없음=어두운회색
                const numColor = dow === 0 ? "#ff7070"
                  : dow === 6 ? "#7090ff"
                  : hasIncomplete ? C.text        // 미완료 → 흰색 (눈에 띔)
                  : isDone       ? "#444"          // 완료 → 흐림
                  : isSel        ? C.text
                  : "#3a3a3a";                     // 할일 없음 → 어두운 회색
                return (
                  <div key={day} ref={isSel ? targetCellRef : null} onClick={() => { setSelectedDate(dk); closeCalendar(); }} style={{
                    display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "pointer", padding: "3px 1px",
                    borderRadius: radius.sm,
                    background: isSel ? "#222" : "transparent",
                    outline: hasIncomplete ? "1px solid rgba(255,255,255,0.18)"
                           : isDone       ? "1px solid rgba(255,255,255,0.06)"
                           : "none",
                    transition: "background 0.15s",
                  }}>
                    <div style={{ position: "relative", width: 30, height: 30,
                      animation: stampDate === dk ? "stamp 0.55s cubic-bezier(0.36,0.07,0.19,0.97) both" : "none" }}>
                      {/* Ripple ring on stamp */}
                      {stampDate === dk && (
                        <div style={{ position: "absolute", inset: -4, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.6)", animation: "ripple 0.7s 0.15s ease-out forwards", pointerEvents: "none" }} />
                      )}
                      {hist?.drops?.length > 0
                        ? <div style={{ opacity: isDone ? 1 : 0.35 + (hist.drops.length / (hist.total || hist.drops.length)) * 0.65 }}>
                            <CalendarPalette drops={hist.drops} totalCount={hist.total} size={30} />
                            {isDone && <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: "1.5px solid rgba(255,255,255,0.5)", pointerEvents: "none" }} />}
                          </div>
                        : <div style={{ width: 30, height: 30, borderRadius: "50%",
                            background: isTod ? "#1a1a1a" : "transparent",
                            border: isTod ? `1px solid ${C.border2}` : isSel ? `1px solid #444` : "none",
                            display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {isTod && <div style={{ width: 4, height: 4, borderRadius: "50%", background: C.dim }} />}
                          </div>
                      }
                    </div>
                    <span style={{ fontSize: 9, color: numColor, fontWeight: isTod ? 700 : hasIncomplete ? 600 : 400 }}>{day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══ PALETTE (상단 고정) ══ */}
      <div style={{ flexShrink: 0, padding: "14px 18px 0" }}>
        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          {/* 날짜 + 이전/다음 — 슬림한 텍스트 버튼 */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontSize: 9, color: C.dim, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 2 }}>makeblack</div>
            <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <button onClick={() => goDay(-1)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 9, lineHeight: 1, padding: 0, width: 13, opacity: 0.55, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>◀</button>
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", color: C.text, whiteSpace: "nowrap", width: 88, textAlign: "center" }}>
                {isToday ? "오늘" : selDateObj.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
              </div>
              <button onClick={() => goDay(1)} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 9, lineHeight: 1, padding: 0, width: 13, opacity: 0.55, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>▶</button>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button onClick={() => setShowCal(true)} style={{ height: 28, padding: "0 11px", borderRadius: radius.full, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>캘린더</button>
<button onClick={() => setShowCatMgr(true)} style={{ height: 28, padding: "0 11px", borderRadius: radius.full, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>카테고리</button>
          </div>
        </div>

        {/* 팔레트 캔버스 */}
        {/* 팔레트 크기: small=140, medium=200, large=260 */}
        <div ref={paletteAreaRef} style={{ width: settings.paletteSize === "small" ? "min(38vw,140px)" : settings.paletteSize === "large" ? "min(66vw,260px)" : "min(52vw,200px)", aspectRatio: "1", borderRadius: radius.lg, overflow: "hidden", border: `1px solid ${C.border}`, position: "relative", margin: "0 auto" }}>
          <PaletteCanvas drops={drops} version={canvasVer} totalCount={totalCount} animDrop={animDrop} onAnimDone={() => setAnimDrop(null)} />

        </div>

        {/* 그라데이션 프로그레스바 */}
        <div style={{ margin: "10px auto 0", width: settings.paletteSize === "small" ? "min(38vw,140px)" : settings.paletteSize === "large" ? "min(66vw,260px)" : "min(52vw,200px)" }}>
          <div style={{ height: 4, borderRadius: 4, background: C.surface, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 4,
              width: `${progress}%`,
              background: isBlack
                ? "linear-gradient(90deg, #333, #111)"
                : drops.length > 0 ? progressGradient : C.border,
              transition: "width 0.8s ease, background 1s ease",
              boxShadow: drops.length > 0 && !isBlack ? `0 0 6px ${mixedCss || "transparent"}88` : "none",
            }} />
          </div>
          {/* 색 도트 + 완료 카운트 */}
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 6, minHeight: 14 }}>
            {drops.slice(0, 10).map(d => (
              <div key={d.id} style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, boxShadow: `0 0 4px ${d.color}66`, flexShrink: 0 }} />
            ))}
            {drops.length > 10 && (
              <span style={{ fontSize: 9, color: C.dim, flexShrink: 0 }}>+{drops.length - 10}</span>
            )}
            {totalCount > 0 && (
              <span style={{ fontSize: 10, color: C.dim, marginLeft: "auto" }}>{doneCount} / {totalCount}</span>
            )}
          </div>
        </div>
      </div>

      {/* 구분선 */}
      <div style={{ flexShrink: 0, height: 1, background: C.border, margin: "12px 18px 0" }} />

      {/* ══ TODO LIST (하단 스크롤) ══ */}
      <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px 100px" }}>
        {cats.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 24px", color: C.dim }}>
            <div style={{ fontSize: 36, marginBottom: 14 }}>🎨</div>
            <div style={{ fontSize: 14, color: "#555", marginBottom: 8, fontWeight: 600 }}>아직 카테고리가 없어요</div>
            <div style={{ fontSize: 12, color: C.dim, lineHeight: 1.8, marginBottom: 20 }}>상단 오른쪽 카테고리 버튼을 눌러서<br/>첫 번째 카테고리를 만들어보세요</div>
            <button onClick={() => setShowCatMgr(true)} style={{ padding: "11px 28px", background: "#f0ece6", color: "#080808", border: "none", borderRadius: radius.full, cursor: "pointer", fontSize: 13, fontWeight: 700, fontFamily: "inherit" }}>카테고리 만들기</button>
          </div>
        )}
        {cats.map(cat => {
          const todos = selTodos[cat.id] || [];
          const catDone = todos.filter(t => t.done).length;
          return (
            <div key={cat.id} style={{ marginBottom: 22 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px 4px 8px", background: cat.color + "15", borderRadius: radius.full, border: `1px solid ${cat.color}28` }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: cat.color, boxShadow: `0 0 5px ${cat.color}` }} />
                  <span style={{ fontSize: 12, fontWeight: 600, color: cat.color }}>{cat.name}</span>
                </div>
                {todos.length > 0 && <span style={{ fontSize: 10, color: C.dim }}>{catDone}/{todos.length}</span>}
                <div style={{ flex: 1 }} />
                <button onClick={() => { setAddingTo(cat.id); setNewTodoText(""); setTimeout(() => inputRef.current?.focus(), 50); }}
                  style={{ width: 26, height: 26, borderRadius: "50%", background: C.surface, border: `1px solid ${C.border2}`, color: C.muted, cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>+</button>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                {todos.map(todo => {
                  const isEditing = editingTodo?.todoId === todo.id;
                  return (
                    <div key={todo.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", background: isEditing ? C.surface : todo.done ? "transparent" : C.card, borderRadius: radius.md, border: `1px solid ${isEditing ? C.border2 : todo.done ? C.border : C.border2}`, opacity: todo.done && !isEditing ? 0.42 : 1, transition: "all 0.2s" }}>
                      {/* 체크박스 */}
                      <div onClick={() => !isEditing && toggleTodo(cat.id, todo.id)} style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, cursor: isEditing ? "default" : "pointer", border: `2px solid ${todo.done ? todo.color : C.border2}`, background: todo.done ? todo.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                        {todo.done && <span style={{ color: "#080808", fontSize: 10, fontWeight: 800 }}>✓</span>}
                      </div>
                      {/* 텍스트 or 편집 인풋 */}
                      {isEditing ? (
                        <input
                          ref={editInputRef}
                          value={editingTodo.text}
                          onChange={e => setEditingTodo(et => ({ ...et, text: e.target.value }))}
                          onKeyDown={e => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditingTodo(null); }}
                          onBlur={saveEdit}
                          autoFocus
                          style={{ flex: 1, background: "transparent", border: "none", outline: "none", fontSize: 13, color: C.text, fontFamily: "inherit", padding: 0 }}
                        />
                      ) : (
                        <span
                          onDoubleClick={() => !todo.done && !todo.routineId && setEditingTodo({ catId: cat.id, todoId: todo.id, text: todo.text })}
                          style={{ flex: 1, fontSize: 13, color: todo.done ? C.muted : C.text, textDecoration: todo.done ? "line-through" : "none", cursor: todo.done || todo.routineId ? "default" : "text" }}
                        >{todo.text}</span>
                      )}
                      {todo.routineId && <span style={{ fontSize: 9, color: C.dim, background: C.surface, padding: "2px 6px", borderRadius: 4, flexShrink: 0 }}>루틴</span>}
                      {isEditing ? (
                        <button onClick={saveEdit} style={{ background: "none", border: "none", color: "#6c8fff", cursor: "pointer", fontSize: 11, fontFamily: "inherit", flexShrink: 0, fontWeight: 600 }}>저장</button>
                      ) : !todo.routineId ? (
                        <button onClick={() => deleteTodo(cat.id, todo.id)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1, flexShrink: 0 }}>✕</button>
                      ) : null}
                    </div>
                  );
                })}
              </div>

              {addingTo === cat.id && (
                <div style={{ display: "flex", gap: 7, marginTop: 7 }}>
                  <StyledInput inputRef={inputRef} value={newTodoText} onChange={e => setNewTodoText(e.target.value)}
                    onKeyDown={e => { if (e.key==="Enter") addTodo(cat.id); if (e.key==="Escape") setAddingTo(null); }}
                    placeholder="할 일을 입력하고 Enter" />
                  <button onClick={() => addTodo(cat.id)} style={{ width: 42, height: 42, background: C.text, color: C.bg, border: "none", borderRadius: radius.md, cursor: "pointer", fontWeight: 700, fontSize: 18, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>↵</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showCatMgr && (
        <CategoryManager categories={cats} setCategories={setCats} routines={ruts} setRoutines={setRuts} onClose={() => setShowCatMgr(false)} />
      )}
    </div>
  )
}

// ─────────────────────────────────────────────
// MyPage
// ─────────────────────────────────────────────
function SettingRow({ label, sub, children }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: `1px solid ${C.border}` }}>
      <div>
        <div style={{ fontSize: 13, color: C.text }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ flexShrink: 0, marginLeft: 16 }}>{children}</div>
    </div>
  );
}

function Toggle({ on, onChange }) {
  return (
    <div onClick={() => onChange(!on)} style={{ width: 42, height: 24, borderRadius: 12, background: on ? "#6c8fff" : C.surface, border: `1px solid ${on ? "#6c8fff" : C.border2}`, position: "relative", cursor: "pointer", transition: "all 0.2s", flexShrink: 0 }}>
      <div style={{ position: "absolute", top: 2, left: on ? 20 : 2, width: 18, height: 18, borderRadius: "50%", background: on ? "#fff" : C.muted, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.3)" }} />
    </div>
  );
}

function SettingsSheet({ settings, updSetting, user, setUser, onClose }) {
  const [section, setSection] = useState(null); // null | "account" | "privacy" | "app" | "palette" | "pin" | "notification"
  const [pinInput, setPinInput] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinStep, setPinStep] = useState(() => settings.pin ? 0 : 1); // 기존 PIN 있으면 확인부터
  const [editField, setEditField] = useState(null); // { key, value }

  const S_BORDER = { borderBottom: `1px solid ${C.border}` };
  const chevron = <span style={{ color: C.dim, fontSize: 12 }}>›</span>;

  const sections = [
    { key: "account",      icon: "◎", label: "계정 관리",       sub: user.email },
    { key: "privacy",      icon: "◈", label: "공개 범위",        sub: settings.privacy === "public" ? "전체 공개" : settings.privacy === "followers" ? "팔로워만" : "비공개" },
    { key: "notification", icon: "◉", label: "알림 설정",        sub: settings.reminderOn ? `매일 ${settings.reminderTime}` : "꺼짐" },
    { key: "app",          icon: "⌘", label: "앱 설정",          sub: "캘린더 · 시간 · 언어" },
    { key: "palette",      icon: "✦", label: "팔레트 설정",      sub: "애니메이션 · 크기" },
    { key: "pin",          icon: "◆", label: "앱 잠금 (PIN)",    sub: settings.pinLock ? "설정됨" : "꺼짐" },
    { key: "info",         icon: "◌", label: "버전 정보 / 피드백", sub: "v0.1.0-beta" },
  ];

  const back = () => setSection(null);

  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 250, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(8px)", display: "flex", alignItems: "flex-end" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "100%", background: C.surface, borderRadius: "26px 26px 0 0", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ width: 34, height: 4, borderRadius: 2, background: C.border2, margin: "14px auto 0" }} />

        {/* 헤더 */}
        <div style={{ display: "flex", alignItems: "center", padding: "14px 20px 10px", gap: 10 }}>
          {section && <button onClick={back} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 20, padding: 0, lineHeight: 1, marginRight: 4 }}>‹</button>}
          <span style={{ fontSize: 16, fontWeight: 700, color: C.text, flex: 1 }}>
            {section ? sections.find(s => s.key === section)?.label : "설정"}
          </span>
          <button onClick={onClose} style={{ width: 28, height: 28, borderRadius: "50%", background: C.surface, border: `1px solid ${C.border}`, color: C.muted, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>✕</button>
        </div>

        <div style={{ padding: "4px 20px 48px" }}>
          {/* 메인 메뉴 */}
          {!section && sections.map(s => (
            <div key={s.key} onClick={() => setSection(s.key)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
              <div style={{ width: 34, height: 34, borderRadius: radius.sm, background: C.surface, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: C.muted, flexShrink: 0 }}>{s.icon}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: C.text }}>{s.label}</div>
                {s.sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{s.sub}</div>}
              </div>
              {chevron}
            </div>
          ))}

          {/* 계정 관리 */}
          {section === "account" && (<>
            {[
              { key: "name", label: "이름", val: user.name },
              { key: "handle", label: "핸들", val: user.handle },
              { key: "email", label: "이메일", val: user.email },
              { key: "bio", label: "소개", val: user.bio },
            ].map(f => (
              <div key={f.key} style={{ padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 10, color: C.muted, marginBottom: 6, letterSpacing: "0.06em" }}>{f.label}</div>
                {editField?.key === f.key
                  ? <div style={{ display: "flex", gap: 8 }}>
                      <input value={editField.value} onChange={e => setEditField(ef => ({ ...ef, value: e.target.value }))}
                        autoFocus style={{ flex: 1, background: C.card, border: `1px solid ${C.border2}`, borderRadius: radius.sm, padding: "8px 10px", color: C.text, fontSize: 13, outline: "none", fontFamily: "inherit" }} />
                      <button onClick={() => { setUser(u => ({ ...u, [f.key]: editField.value })); setEditField(null); }} style={{ padding: "8px 14px", background: C.text, color: C.bg, border: "none", borderRadius: radius.sm, cursor: "pointer", fontSize: 12, fontWeight: 700, fontFamily: "inherit" }}>저장</button>
                    </div>
                  : <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span style={{ fontSize: 14, color: C.text }}>{f.val}</span>
                      <button onClick={() => setEditField({ key: f.key, value: f.val })} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>변경</button>
                    </div>
                }
              </div>
            ))}
            <div style={{ marginTop: 24 }}>
              <button style={{ width: "100%", padding: "12px", background: "transparent", border: `1px solid #3a1a1a`, borderRadius: radius.md, color: "#ff7070", cursor: "pointer", fontSize: 13, fontFamily: "inherit" }}>계정 삭제</button>
            </div>
          </>)}

          {/* 공개 범위 */}
          {section === "privacy" && (<>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 14, lineHeight: 1.7 }}>내 할 일과 팔레트를 누가 볼 수 있는지 설정해요</div>
            {[
              { val: "public",    label: "전체 공개",  sub: "모든 사람이 볼 수 있어요" },
              { val: "followers", label: "팔로워만",   sub: "팔로워만 볼 수 있어요" },
              { val: "private",   label: "비공개",     sub: "나만 볼 수 있어요" },
            ].map(opt => (
              <div key={opt.val} onClick={() => updSetting("privacy", opt.val)} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                <div style={{ width: 20, height: 20, borderRadius: "50%", border: `2px solid ${settings.privacy === opt.val ? "#6c8fff" : C.border2}`, background: settings.privacy === opt.val ? "#6c8fff" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  {settings.privacy === opt.val && <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#fff" }} />}
                </div>
                <div>
                  <div style={{ fontSize: 13, color: C.text }}>{opt.label}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{opt.sub}</div>
                </div>
              </div>
            ))}
          </>)}

          {/* 알림 설정 */}
          {section === "notification" && (<>
            <SettingRow label="매일 리마인더" sub="설정한 시간에 알림을 보내요">
              <Toggle on={settings.reminderOn} onChange={v => updSetting("reminderOn", v)} />
            </SettingRow>
            {settings.reminderOn && (
              <div style={{ padding: "14px 0", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>리마인더 시간</div>
                <input type="time" value={settings.reminderTime} onChange={e => updSetting("reminderTime", e.target.value)}
                  style={{ background: C.card, border: `1px solid ${C.border2}`, borderRadius: radius.sm, padding: "9px 12px", color: C.text, fontSize: 14, outline: "none", fontFamily: "inherit", colorScheme: "dark" }} />
              </div>
            )}
          </>)}

          {/* 앱 설정 */}
          {section === "app" && (<>
            <SettingRow label="테마">
              <div style={{ display: "flex", gap: 6 }}>
                {[["dark","🌙 다크"],["light","☀️ 라이트"]].map(([k,l]) => (
                  <button key={k} onClick={() => updSetting("theme", k)} style={{ padding: "6px 12px", borderRadius: radius.full, background: settings.theme === k ? C.text : C.card, color: settings.theme === k ? C.bg : C.muted, border: `1px solid ${settings.theme === k ? C.text : C.border2}`, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>{l}</button>
                ))}
              </div>
            </SettingRow>
            <SettingRow label="캘린더 시작 요일" sub="일요일부터 시작">
              <Toggle on={settings.calStartSunday} onChange={v => updSetting("calStartSunday", v)} />
            </SettingRow>
            <SettingRow label="24시간 표기" sub="오후 2시 → 14:00">
              <Toggle on={settings.use24h} onChange={v => updSetting("use24h", v)} />
            </SettingRow>
            <SettingRow label="언어" sub="Language">
              <div style={{ display: "flex", gap: 6 }}>
                {[["ko","한국어"],["en","English"]].map(([k,l]) => (
                  <button key={k} onClick={() => updSetting("language", k)} style={{ padding: "6px 12px", borderRadius: radius.full, background: settings.language === k ? C.text : C.card, color: settings.language === k ? C.bg : C.muted, border: `1px solid ${settings.language === k ? C.text : C.border2}`, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>{l}</button>
                ))}
              </div>
            </SettingRow>
          </>)}

          {/* 팔레트 설정 */}
          {section === "palette" && (<>
            <SettingRow label="BLACK 달성 애니메이션" sub="홈 화면 완료 시 연출 효과">
              <Toggle on={settings.blackAnimationOn} onChange={v => updSetting("blackAnimationOn", v)} />
            </SettingRow>
            <SettingRow label="팀 BLACK 애니메이션" sub="팀 화면 완료 시 연출 효과">
              <Toggle on={settings.teamBlackAnimationOn !== false} onChange={v => updSetting("teamBlackAnimationOn", v)} />
            </SettingRow>
            <SettingRow label="팔레트 크기">
              <div style={{ display: "flex", gap: 6 }}>
                {[["small","소"],["medium","중"],["large","대"]].map(([k,l]) => (
                  <button key={k} onClick={() => updSetting("paletteSize", k)} style={{ width: 36, height: 30, borderRadius: radius.sm, background: settings.paletteSize === k ? C.text : C.card, color: settings.paletteSize === k ? C.bg : C.muted, border: `1px solid ${settings.paletteSize === k ? C.text : C.border2}`, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>{l}</button>
                ))}
              </div>
            </SettingRow>
          </>)}

          {/* PIN 잠금 */}
          {section === "pin" && (<>
            <SettingRow label="앱 잠금" sub="앱 시작 시 PIN 입력">
              <Toggle on={settings.pinLock} onChange={v => { updSetting("pinLock", v); if (!v) { updSetting("pin", ""); setPinStep(1); setPinInput(""); setPinConfirm(""); } }} />
            </SettingRow>
            {settings.pinLock && (
              <div style={{ marginTop: 16 }}>
                {/* 기존 PIN이 있으면 먼저 확인 (step 0) */}
                <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>
                  {pinStep === 0 ? "현재 PIN을 입력해주세요"
                   : pinStep === 1 ? "새 PIN 4자리 입력"
                   : "PIN 확인 (다시 입력)"}
                </div>
                <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
                  {Array.from({ length: 4 }, (_, i) => {
                    const cur = pinStep === 0 ? pinConfirm : pinStep === 1 ? pinInput : pinConfirm;
                    return (
                      <div key={i} style={{ width: 42, height: 52, borderRadius: radius.sm, background: C.card, border: `1px solid ${cur.length > i ? "#6c8fff" : C.border2}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: C.text }}>
                        {cur.length > i ? "●" : ""}
                      </div>
                    );
                  })}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
                    <button key={i} onClick={() => {
                      if (!k) return;
                      if (pinStep === 0) {
                        // 기존 PIN 확인
                        const next = k === "⌫" ? pinConfirm.slice(0,-1) : pinConfirm + k;
                        setPinConfirm(next);
                        if (next.length === 4) {
                          if (next === settings.pin) { setPinStep(1); setPinConfirm(""); }
                          else { setTimeout(() => setPinConfirm(""), 300); }
                        }
                      } else {
                        const setter = pinStep === 1 ? setPinInput : setPinConfirm;
                        const val    = pinStep === 1 ? pinInput : pinConfirm;
                        if (k === "⌫") { setter(val.slice(0, -1)); return; }
                        const next = val + k;
                        setter(next);
                        if (next.length === 4) {
                          if (pinStep === 1) { setPinStep(2); }
                          else if (next === pinInput) { updSetting("pin", pinInput); setPinStep(settings.pin ? 0 : 1); setPinInput(""); setPinConfirm(""); }
                          else { setTimeout(() => { setPinStep(1); setPinInput(""); setPinConfirm(""); }, 300); }
                        }
                      }
                    }} style={{ height: 48, borderRadius: radius.md, background: k ? C.card : "transparent", border: k ? `1px solid ${C.border}` : "none", color: C.text, fontSize: 18, cursor: k ? "pointer" : "default", fontFamily: "inherit" }}>{k}</button>
                  ))}
                </div>
              </div>
            )}
          </>)}

          {/* 버전 / 피드백 */}
          {section === "info" && (<>
            <div style={{ textAlign: "center", padding: "28px 0 20px" }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>●</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: C.text, letterSpacing: "0.1em" }}>MakeBlack</div>
              <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>v0.1.0-beta</div>
            </div>
            {[
              { label: "버그 신고",      sub: "불편한 점을 알려주세요" },
              { label: "기능 제안",      sub: "원하는 기능을 제안해 주세요" },
              { label: "앱 평가하기",    sub: "앱스토어에서 리뷰 남기기" },
              { label: "개인정보 처리방침" },
              { label: "서비스 이용약관" },
            ].map(item => (
              <div key={item.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}>
                <div>
                  <div style={{ fontSize: 13, color: C.text }}>{item.label}</div>
                  {item.sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>{item.sub}</div>}
                </div>
                {chevron}
              </div>
            ))}
          </>)}
        </div>
      </div>
    </div>
  );
}

function MyPageScreen({ paletteHistory, todosByDate, cats, ruts, user, setUser, settings, updSetting, friends, onTabChange }) {
  const [showSettings, setShowSettings] = useState(false);
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const getMyPageTodos = (dk) => {
    const base = todosByDate[dk] || {};
    const result = {};
    cats.forEach(cat => { result[cat.id] = [...(base[cat.id] || [])]; });
    ruts.forEach(rut => {
      if (rut.startDate && dk < rut.startDate) return;
      if (rut.endDate   && dk > rut.endDate)   return;
      const dt = new Date(dk + "T00:00:00");
      const repeatType = rut.repeatType || "days";
      let applies = false;
      if (repeatType === "days")    applies = (rut.days||[]).includes(dt.getDay());
      if (repeatType === "monthly") applies = (rut.monthDays||[]).includes(dt.getDate());
      if (!applies && (rut.dates||[]).includes(dk)) applies = true;
      if (!applies) return;
      const rid = `r${rut.id}-${dk}`;
      const catTodos = result[rut.catId] || [];
      if (!catTodos.some(t => t.id === rid)) {
        const saved = (todosByDate[dk]?.[rut.catId] || []).find(t => t.id === rid);
        result[rut.catId] = [{ id: rid, done: saved?.done ?? false }, ...catTodos];
      }
    });
    return Object.values(result).flat();
  };

  const monthStats = Array.from({ length: daysInMonth }, (_, i) => {
    const dk   = `${year}-${String(month+1).padStart(2,'0')}-${String(i+1).padStart(2,'0')}`;
    const hist = paletteHistory[dk];
    const allT = getMyPageTodos(dk);
    const done  = allT.filter(t => t.done).length;
    const total = hist?.total || allT.length;
    const prog  = total > 0 ? done / total : 0;
    return { dk, day: i+1, prog, done, total, drops: hist?.drops || [], isBlack: prog >= 1 && total > 0 };
  });

  const activeDays  = monthStats.filter(d => d.total > 0);
  const blackDays   = monthStats.filter(d => d.isBlack);
  const avgProgress = activeDays.length > 0 ? Math.round(activeDays.reduce((s, d) => s + d.prog, 0) / activeDays.length * 100) : 0;
  const totalDone   = monthStats.reduce((s, d) => s + d.done, 0);
  const streak = (() => {
    let s = 0;
    // 오늘부터 역순으로 — 전달까지 거슬러 올라감
    let cur = new Date(now); cur.setHours(0,0,0,0);
    while (true) {
      const dk = dateKey(cur);
      const hist = paletteHistory[dk];
      const dayTodos = getMyPageTodos(dk);
      const total = hist?.total || dayTodos.length;
      const done  = dayTodos.filter(t => t.done).length;
      const isB   = total > 0 && done >= total;
      if (!isB) break;
      s++;
      cur.setDate(cur.getDate() - 1);
      if (s > 365) break; // 무한루프 방지
    }
    return s;
  })();
  const byDow       = Array.from({ length: 7 }, (_, dow) => { const days = monthStats.filter(d => new Date(d.dk+"T00:00:00").getDay()===dow && d.total>0); return { dow, avg: days.length>0 ? days.reduce((s,d)=>s+d.prog,0)/days.length : 0, count: days.length }; });
  const DOW_KR      = ["일","월","화","수","목","금","토"];
  const monthName   = now.toLocaleString("ko-KR", { month: "long" });

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui,sans-serif", paddingBottom: 100 }}>

      {/* ── 프로필 헤더 ── */}
      <div style={{ padding: "28px 20px 20px", position: "relative" }}>
        {/* 설정 버튼 */}
        <button onClick={() => setShowSettings(true)} style={{ position: "absolute", top: 28, right: 20, width: 34, height: 34, borderRadius: "50%", background: C.surface, border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 15, display: "flex", alignItems: "center", justifyContent: "center" }}>⚙</button>

        {/* 아바타 + 이름 */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg, #6c8fff, #c77dff)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, flexShrink: 0 }}>
            {user.avatar || user.name[0]}
          </div>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>{user.name}</div>
            <div style={{ fontSize: 12, color: C.muted, marginTop: 2 }}>{user.handle}</div>
          </div>
        </div>

        {/* 소개 */}
        {user.bio && <div style={{ fontSize: 13, color: C.muted, lineHeight: 1.6, marginBottom: 16 }}>{user.bio}</div>}

        {/* 팔로워 / 팔로잉 */}
        <div style={{ display: "flex", gap: 24 }}>
          {[
            { label: "팔로워", value: user.followers, onClick: null },
            { label: "팔로잉", value: friends?.length ?? user.following, onClick: () => onTabChange?.("search") },
            { label: "BLACK",  value: blackDays.length, onClick: null },
          ].map(({ label, value, onClick }) => (
            <div key={label} onClick={onClick} style={{ textAlign:"center", cursor: onClick ? "pointer" : "default" }}>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{value}</div>
              <div style={{ fontSize: 10, color: onClick ? C.muted : C.dim, marginTop: 2, letterSpacing: "0.06em", textDecoration: onClick ? "underline" : "none", textUnderlineOffset: 3 }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ height: 1, background: C.border, margin: "0 20px" }} />

      <div style={{ padding: "20px 20px 0" }}>
        {/* 핵심 수치 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { label: "완료한 할 일", value: totalDone,        unit: "개" },
            { label: "활동한 날",    value: activeDays.length, unit: "일" },
            { label: "BLACK 달성",   value: blackDays.length,  unit: "일" },
            { label: "연속 달성",    value: streak,            unit: "일 연속" },
          ].map(({ label, value, unit }) => (
            <div key={label} style={{ background: C.surface, borderRadius: radius.lg, padding: "14px 16px", border: `1px solid ${C.border}` }}>
              <div style={{ fontSize: 10, color: C.muted, marginBottom: 6, letterSpacing: "0.06em" }}>{label}</div>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1 }}>
                {value}<span style={{ fontSize: 12, fontWeight: 400, color: C.muted, marginLeft: 3 }}>{unit}</span>
              </div>
            </div>
          ))}
        </div>

        {/* 평균 완료율 */}
        <div style={{ background: C.surface, borderRadius: radius.lg, padding: "16px", marginBottom: 12, border: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
            <span style={{ fontSize: 12, color: C.muted }}>이번 달 평균 완료율</span>
            <span style={{ fontSize: 20, fontWeight: 700 }}>{avgProgress}%</span>
          </div>
          <div style={{ height: 5, background: C.card, borderRadius: 4, overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${avgProgress}%`, borderRadius: 4, background: "linear-gradient(90deg, #6c8fff, #c77dff)", transition: "width 1s ease" }} />
          </div>
        </div>

        {/* 요일별 차트 */}
        <div style={{ background: C.surface, borderRadius: radius.lg, padding: "16px", marginBottom: 12, border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>요일별 평균 완료율</div>
          <div style={{ display: "flex", gap: 5, alignItems: "flex-end", height: 72 }}>
            {byDow.map(({ dow, avg, count }) => (
              <div key={dow} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
                <div style={{ width: "100%", background: C.card, borderRadius: 3, height: 56, display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
                  <div style={{ width: "100%", borderRadius: 3, height: `${Math.max(avg*100, count>0?4:0)}%`, background: dow===0?"#ff7070":dow===6?"#7090ff":"#6c8fff", opacity: count>0?0.85:0.15, transition: "height 0.8s ease" }} />
                </div>
                <span style={{ fontSize: 9, color: dow===0?"#ff7070":dow===6?"#7090ff":C.muted }}>{DOW_KR[dow]}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 히트맵 */}
        <div style={{ background: C.surface, borderRadius: radius.lg, padding: "16px", border: `1px solid ${C.border}` }}>
          <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>이달 진행 현황</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 6 }}>
            {DOW_KR.map((d,i) => <div key={d} style={{ textAlign: "center", fontSize: 9, color: i===0?"#ff7070":i===6?"#7090ff":C.dim }}>{d}</div>)}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
            {Array.from({ length: new Date(year, month, 1).getDay() }).map((_,i) => <div key={`e${i}`} />)}
            {monthStats.map(({ day, prog, isBlack }) => {
              const alpha = prog > 0 ? 0.2 + prog * 0.8 : 0;
              const bg = isBlack ? "#fff" : prog > 0 ? `rgba(108,143,255,${alpha})` : C.card;
              return (
                <div key={day} style={{ aspectRatio: "1", borderRadius: 5, background: bg, display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                  <span style={{ fontSize: 9, color: isBlack?"#080808":prog>0.5?"#fff":C.muted, fontWeight: isBlack?700:400 }}>{day}</span>
                  {isBlack && <div style={{ position: "absolute", inset: 0, borderRadius: 5, border: "1px solid rgba(255,255,255,0.4)" }} />}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, alignItems: "center" }}>
            <div style={{ width: 9, height: 9, borderRadius: 2, background: C.card, border: `1px solid ${C.border}` }} />
            <span style={{ fontSize: 10, color: C.dim }}>없음</span>
            <div style={{ width: 9, height: 9, borderRadius: 2, background: "rgba(108,143,255,0.6)" }} />
            <span style={{ fontSize: 10, color: C.dim }}>진행중</span>
            <div style={{ width: 9, height: 9, borderRadius: 2, background: "#fff" }} />
            <span style={{ fontSize: 10, color: C.dim }}>BLACK</span>
          </div>
        </div>
      </div>

      {showSettings && <SettingsSheet settings={settings} updSetting={updSetting} user={user} setUser={setUser} onClose={() => setShowSettings(false)} />}
    </div>
  );
}

// ─────────────────────────────────────────────
// Team Screen
// ─────────────────────────────────────────────

// 멤버별 고유 색 계열 — 순서대로 배정
const MEMBER_HUE_PALETTE = [
  { hue: 220, label: "블루",   base: "#6c8fff" },
  { hue: 0,   label: "레드",   base: "#ff6b6b" },
  { hue: 140, label: "그린",   base: "#5ce65c" },
  { hue: 45,  label: "옐로우", base: "#ffd166" },
  { hue: 280, label: "퍼플",   base: "#c77dff" },
  { hue: 170, label: "민트",   base: "#06d6a0" },
  { hue: 25,  label: "오렌지", base: "#ffb347" },
  { hue: 340, label: "핑크",   base: "#ef476f" },
];

function getMemberColor(idx) {
  const p = MEMBER_HUE_PALETTE[idx % MEMBER_HUE_PALETTE.length];
  const rgb = hslToRgb(p.hue, 78, 58);
  return { ...p, rgb, color: `hsl(${p.hue},78%,58%)` };
}

// 팀 팔레트 Canvas — 멤버별 고유색으로 drop 렌더
function TeamPaletteCanvas({ drops, totalCount, size = 200 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) renderPalette(ref.current, drops, totalCount, size);
  }, [drops, totalCount, size]);
  return (
    <div style={{ position: "relative", width: size, height: size, borderRadius: radius.lg, overflow: "hidden", border: `1px solid ${C.border}`, margin: "0 auto" }}>
      <canvas ref={ref} width={size} height={size} style={{ width: size, height: size, display: "block" }} />
      {drops.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: C.dim, pointerEvents: "none" }}>
          할 일을 완료하면 색이 피어나요
        </div>
      )}
    </div>
  );
}

// 팀 생성 모달
function CreateTeamModal({ myHandle, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [desc, setDesc] = useState("");
  return (
    <Modal onClose={onClose} title="팀 만들기">
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 14, lineHeight: 1.7 }}>
        팀을 만들면 멤버들과 할 일을 공유하고<br />함께 팔레트를 채워나갈 수 있어요
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>팀 이름</div>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="예: 졸업 프로젝트 A팀"
          style={{ width: "100%", boxSizing: "border-box", background: C.card, border: `1px solid ${C.border2}`, borderRadius: radius.sm, padding: "10px 12px", color: C.text, fontSize: 13, outline: "none", fontFamily: "inherit" }} />
      </div>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 10, color: C.muted, marginBottom: 6 }}>설명 (선택)</div>
        <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="팀에 대한 간단한 설명"
          style={{ width: "100%", boxSizing: "border-box", background: C.card, border: `1px solid ${C.border2}`, borderRadius: radius.sm, padding: "10px 12px", color: C.text, fontSize: 13, outline: "none", fontFamily: "inherit" }} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={onClose} style={{ flex: 1, padding: "11px", background: "transparent", border: `1px solid ${C.border2}`, borderRadius: radius.md, color: C.muted, cursor: "pointer", fontFamily: "inherit" }}>취소</button>
        <button onClick={() => name.trim() && onCreate({ name: name.trim(), desc: desc.trim() })}
          style={{ flex: 1, padding: "11px", background: C.text, border: "none", borderRadius: radius.md, color: C.bg, cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>만들기</button>
      </div>
    </Modal>
  );
}

// 멤버 초대 모달
function InviteModal({ team, onClose, onInvite, friends }) {
  const [handle, setHandle] = useState("");
  const alreadyMember = (h) => team.members.some(m => m.handle === h);
  // 친구 중 아직 팀 멤버가 아닌 사람
  const invitableFriends = (friends || []).filter(f => !alreadyMember(f.handle));
  return (
    <Modal onClose={onClose} title="멤버 초대">
      {/* 아이디 직접 입력 */}
      <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>아이디로 초대</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        <input value={handle} onChange={e => setHandle(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handle.trim() && onInvite(handle.trim())}
          placeholder="@아이디"
          style={{ flex: 1, background: C.card, border: `1px solid ${C.border2}`, borderRadius: radius.sm, padding: "10px 12px", color: C.text, fontSize: 13, outline: "none", fontFamily: "inherit" }} />
        <button onClick={() => handle.trim() && onInvite(handle.trim())}
          style={{ padding: "10px 16px", background: C.text, border: "none", borderRadius: radius.sm, color: C.bg, cursor: "pointer", fontWeight: 700, fontFamily: "inherit" }}>초대</button>
      </div>
      {/* 팔로잉 친구 목록 */}
      {invitableFriends.length > 0 && (<>
        <div style={{ fontSize: 11, color: C.muted, marginBottom: 10 }}>팔로잉에서 초대</div>
        {invitableFriends.map((f, i) => (
          <div key={f.handle} style={{ display:"flex", alignItems:"center", gap:10, padding:"10px 0", borderBottom:`1px solid ${C.border}` }}>
            <div style={{ width:32, height:32, borderRadius:"50%", background:`linear-gradient(135deg,hsl(${(f.handle.length*37)%360},60%,55%),hsl(${(f.handle.length*67)%360},60%,45%))`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:13, fontWeight:700, color:"#fff" }}>{f.name[0]}</div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:13, color:C.text }}>{f.name}</div>
              <div style={{ fontSize:10, color:C.muted }}>{f.handle}</div>
            </div>
            <button onClick={() => onInvite(f.handle)} style={{ padding:"6px 12px", background:C.text, border:"none", borderRadius:radius.full, color:C.bg, cursor:"pointer", fontSize:11, fontWeight:700, fontFamily:"inherit" }}>초대</button>
          </div>
        ))}
      </>)}
      {/* 현재 멤버 */}
      <div style={{ fontSize: 11, color: C.muted, margin: "16px 0 10px" }}>현재 멤버 {team.members.length}명</div>
      {team.members.map((m, i) => {
        const mc = getMemberColor(i);
        return (
          <div key={m.handle} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: `1px solid ${C.border}` }}>
            <div style={{ width: 28, height: 28, borderRadius: "50%", background: mc.base + "33", border: `1.5px solid ${mc.base}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 700, color: mc.base }}>{m.name[0]}</div>
            <div>
              <div style={{ fontSize: 13, color: C.text }}>{m.name}</div>
              <div style={{ fontSize: 10, color: C.muted }}>{m.handle}</div>
            </div>
            {i === 0 && <span style={{ marginLeft:"auto", fontSize:9, color:C.dim, background:C.surface, padding:"2px 6px", borderRadius:4 }}>팀장</span>}
          </div>
        );
      })}
    </Modal>
  );
}

// 팀 상세 화면
function TeamDetail({ team, myHandle, onBack, onUpdate, settings, onLeave, onDelete, friends }) {
  const [activeTab, setActiveTab]     = useState("todo");   // "todo" | "calendar"
  const [selectedDate, setSelectedDate] = useState(getTodayKey);
  const [showCal, setShowCal]         = useState(false);
  const [calClosing, setCalClosing]   = useState(false);
  const [viewMonth, setViewMonth]     = useState(() => { const d=new Date(); return {y:d.getFullYear(),m:d.getMonth()}; });
  const [addingCat, setAddingCat]     = useState(false);
  const [newCatName, setNewCatName]   = useState("");
  const [addingTo, setAddingTo]       = useState(null);
  const [newTodo, setNewTodo]         = useState("");
  const [blackPhase, setBlackPhase]   = useState(null);
  const [flyOrb, setFlyOrb]           = useState(null);
  const [stampDate, setStampDate]     = useState(null);
  const [canvasVer, setCanvasVer]     = useState(0);
  const [animDrop, setAnimDrop]       = useState(null);
  const [showInvite, setShowInvite]   = useState(false);
  const [showMenu, setShowMenu]       = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  const [editingTeam, setEditingTeam]   = useState(false);
  const [editName, setEditName]         = useState(team.name);
  const [editDesc, setEditDesc]         = useState(team.desc||'');
  const inputRef   = useRef(null);
  const blackTimer = useRef(null);
  const targetCellRef = useRef(null);
  const [todayKey] = useState(getTodayKey);

  const myIdx   = team.members.findIndex(m => m.handle === myHandle);
  const myColor = getMemberColor(myIdx >= 0 ? myIdx : 0);
  const isOwner = myIdx === 0; // 첫번째 멤버가 팀장

  // 날짜별 팀 할일 가져오기
  const getTeamTodosForDate = (dk) => {
    const cats = team.cats || [];
    const base = team.todosByDate?.[dk] || {};
    const result = {};
    cats.forEach(cat => { result[cat.id] = [...(base[cat.id] || [])]; });
    // 카테고리 없는 경우 기본 카테고리
    if (cats.length === 0) result["default"] = base["default"] || [];
    return result;
  };

  const selTodos   = getTeamTodosForDate(selectedDate);
  const allTodos   = Object.values(selTodos).flat();
  const doneCount  = allTodos.filter(t => t.done).length;
  const totalCount = allTodos.length;
  const progress   = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;
  const isBlack    = progress === 100 && totalCount > 0;

  const histEntry  = (team.paletteHistory || {})[selectedDate] || { drops: [], total: 0 };
  const drops      = histEntry.drops || [];
  const isToday    = selectedDate === todayKey;

  // 팀 캘린더 월별 캐시
  const teamCalCache = useMemo(() => {
    const cache = {};
    const y = viewMonth.y, m = viewMonth.m;
    const days = new Date(y, m+1, 0).getDate();
    for (let d = 1; d <= days; d++) {
      const dk = `${y}-${String(m+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      const todos = Object.values(getTeamTodosForDate(dk)).flat();
      cache[dk] = { hasTodos: todos.length > 0, hasIncomplete: todos.some(t => !t.done) };
    }
    return cache;
  }, [viewMonth, team.todosByDate, team.cats]);

  // 선택된 날짜 변경 시 BLACK 초기화
  useEffect(() => { setBlackPhase(null); clearTimeout(blackTimer.current); setCanvasVer(v => v+1); }, [selectedDate]);

  // BLACK 달성 시퀀스
  useEffect(() => {
    if (isBlack && blackPhase === null) {
      if (!settings?.blackAnimationOn) return;
      setBlackPhase("in");
      clearTimeout(blackTimer.current);
      blackTimer.current = setTimeout(() => {
        setBlackPhase("out");
        blackTimer.current = setTimeout(() => {
          setShowCal(true);
          blackTimer.current = setTimeout(() => {
            setBlackPhase(null);
            const vw = window.innerWidth, vh = window.innerHeight;
            const rect = targetCellRef.current?.getBoundingClientRect();
            const tx = rect ? rect.left + rect.width/2 : vw/2;
            const ty = rect ? rect.top  + rect.height/2 : 120;
            setFlyOrb({ sx: vw/2, sy: vh/2, tx, ty });
            blackTimer.current = setTimeout(() => {
              setFlyOrb(null);
              setStampDate(selectedDate);
              blackTimer.current = setTimeout(() => { setStampDate(null); closeCalendar(); }, 400);
            }, 480);
          }, 250);
        }, 150);
      }, 1000);
    }
  }, [isBlack]);

  const closeCalendar = (cb) => {
    setCalClosing(true);
    setTimeout(() => { setShowCal(false); setCalClosing(false); if (cb) cb(); }, 220);
  };

  const goDay = (delta) => {
    const d = new Date(selectedDate + "T00:00:00");
    d.setDate(d.getDate() + delta);
    setSelectedDate(dateKey(d));
    setViewMonth({ y: d.getFullYear(), m: d.getMonth() });
  };
  const goMonth = (delta) => setViewMonth(({ y, m }) => { const d = new Date(y, m+delta, 1); return { y: d.getFullYear(), m: d.getMonth() }; });

  // 카테고리 추가
  const addCat = () => {
    if (!newCatName.trim()) { setAddingCat(false); return; }
    const cat = { id: uid(), name: newCatName.trim(), color: myColor.base };
    const newCats = [...(team.cats || []), cat];
    onUpdate({ ...team, cats: newCats });
    setNewCatName(""); setAddingCat(false);
  };

  // 할일 추가
  const addTodo = (catId) => {
    if (!newTodo.trim()) { setAddingTo(null); return; }
    const todo = {
      id: uid(), text: newTodo.trim(), done: false,
      author: myHandle, authorName: team.members[myIdx >= 0 ? myIdx : 0]?.name || "나",
      color: myColor.color, rgb: myColor.rgb, hue: myColor.hue,
      px: 0.12 + Math.random()*0.76, py: 0.12 + Math.random()*0.76,
      seed: uid()*19, createdAt: Date.now(),
    };
    const dk = selectedDate;
    const base = team.todosByDate?.[dk] || {};
    const catList = base[catId] || [];
    onUpdate({ ...team, todosByDate: { ...(team.todosByDate||{}), [dk]: { ...base, [catId]: [...catList, todo] } } });
    setNewTodo(""); setAddingTo(null);
  };

  // 완료 토글
  const toggleTodo = (catId, todoId) => {
    const dk = selectedDate;
    const todo = (selTodos[catId]||[]).find(t => t.id === todoId);
    if (!todo) return;
    const willDone = !todo.done;
    const base = team.todosByDate?.[dk] || {};
    const mapped = (selTodos[catId]||[]).map(t => t.id===todoId ? {...t, done: !t.done} : t);
    const newTodosByDate = { ...(team.todosByDate||{}), [dk]: { ...base, [catId]: mapped } };

    const prevHist = (team.paletteHistory||{})[dk] || { drops:[], total:0 };
    const syncTotal = allTodos.length;
    let newDrops, newAnimDrop = null;
    if (willDone) {
      if (prevHist.drops.some(d => d.id===todoId)) { onUpdate({...team, todosByDate: newTodosByDate}); return; }
      const drop = { id: todoId, rgb: todo.rgb, hue: todo.hue, color: todo.color, px: todo.px, py: todo.py, seed: todo.seed };
      newDrops = [...prevHist.drops, drop];
      newAnimDrop = drop;
      setAnimDrop(drop);
    } else {
      newDrops = prevHist.drops.filter(d => d.id !== todoId);
      setBlackPhase(null); clearTimeout(blackTimer.current);
    }
    setCanvasVer(v => v+1);
    const newPalHist = { ...(team.paletteHistory||{}), [dk]: { drops: newDrops, total: syncTotal } };
    onUpdate({ ...team, todosByDate: newTodosByDate, paletteHistory: newPalHist });
  };

  const deleteTodo = (catId, todoId) => {
    const dk = selectedDate;
    const base = team.todosByDate?.[dk] || {};
    const filtered = (selTodos[catId]||[]).filter(t => t.id !== todoId);
    const prevHist = (team.paletteHistory||{})[dk] || { drops:[], total:0 };
    const newDrops = prevHist.drops.filter(d => d.id !== todoId);
    onUpdate({
      ...team,
      todosByDate: { ...(team.todosByDate||{}), [dk]: { ...base, [catId]: filtered } },
      paletteHistory: { ...(team.paletteHistory||{}), [dk]: { ...prevHist, drops: newDrops, total: Math.max(0, prevHist.total-1) } },
    });
    setCanvasVer(v => v+1);
  };

  const inviteMember = (handle) => {
    if (team.members.some(m => m.handle === handle)) return;
    onUpdate({ ...team, members: [...team.members, { handle, name: handle.replace("@",""), avatar:"" }] });
    setShowInvite(false);
  };

  // 캘린더 계산
  const calYear = viewMonth.y, calMonth = viewMonth.m;
  const daysInMonth = new Date(calYear, calMonth+1, 0).getDate();
  const rawDow1 = new Date(calYear, calMonth, 1).getDay();
  const firstDow = settings?.calStartSunday ? rawDow1 : (rawDow1===0?6:rawDow1-1);
  const monthName = new Date(calYear, calMonth, 1).toLocaleString("ko-KR", { month:"long" });

  const doneTodos = drops;
  const progGrad  = doneTodos.length > 1
    ? `linear-gradient(90deg, ${doneTodos[0].color}, ${doneTodos[doneTodos.length-1].color})`
    : doneTodos.length===1 ? doneTodos[0].color : C.border;

  const cats = team.cats || [];

  return (
    <div style={{ height:"100vh", background:C.bg, color:C.text, fontFamily:"system-ui,sans-serif", display:"flex", flexDirection:"column", overflow:"hidden" }}>

      {/* BLACK 오버레이 */}
      {blackPhase && (
        <div onClick={() => {
          clearTimeout(blackTimer.current);
          setBlackPhase("out");
          blackTimer.current = setTimeout(() => {
            setShowCal(true);
            blackTimer.current = setTimeout(() => {
              setBlackPhase(null);
              const vw=window.innerWidth, vh=window.innerHeight;
              const rect=targetCellRef.current?.getBoundingClientRect();
              setFlyOrb({ sx:vw/2, sy:vh/2, tx:rect?rect.left+rect.width/2:vw/2, ty:rect?rect.top+rect.height/2:120 });
              blackTimer.current = setTimeout(() => {
                setFlyOrb(null); setStampDate(selectedDate);
                blackTimer.current = setTimeout(() => { setStampDate(null); closeCalendar(); }, 400);
              }, 480);
            }, 250);
          }, 150);
        }}
        style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(0,0,0,0.97)", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", cursor:"pointer",
          animation: blackPhase==="in"?"blackIn 0.4s forwards":"blackOut 0.45s ease forwards" }}>
          <div style={{ width:80, height:80, borderRadius:"50%", marginBottom:28, background:blackPhase==="out"?"#000":"#fff", boxShadow:blackPhase==="out"?"none":"0 0 40px rgba(255,255,255,0.4)", transition:"background 0.5s ease", animation:blackPhase==="in"?"pulse 2s 0.4s ease-in-out infinite":"none" }} />
          <div style={{ fontSize:28, letterSpacing:"0.55em", color:"#fff", fontWeight:200 }}>BLACK</div>
          <div style={{ fontSize:12, color:"#555", marginTop:14, letterSpacing:"0.12em" }}>팀이 해냈어요</div>
        </div>
      )}

      {/* Flying orb */}
      {flyOrb && <FlyingOrb sx={flyOrb.sx} sy={flyOrb.sy} tx={flyOrb.tx} ty={flyOrb.ty} drops={drops} totalCount={totalCount} />}

      {/* 캘린더 시트 */}
      {showCal && (
        <div style={{ position:"fixed", inset:0, zIndex:150, background:"rgba(0,0,0,0.65)", backdropFilter:"blur(10px)" }} onClick={() => closeCalendar()}>
          <div onClick={e=>e.stopPropagation()} style={{ position:"absolute", top:0, left:"50%", transform:"translateX(-50%)", width:"100%", maxWidth:480, background:C.surface, borderRadius:"0 0 28px 28px", padding:"20px 18px 28px", animation: calClosing?"slideUp 0.3s cubic-bezier(0.4,0,0.6,1) forwards":"slideDown 0.2s cubic-bezier(0.22,1,0.36,1)" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
              <button onClick={()=>goMonth(-1)} style={{ width:34, height:34, borderRadius:"50%", background:C.surface, border:`1px solid ${C.border}`, color:C.muted, cursor:"pointer", fontSize:18, fontFamily:"inherit" }}>‹</button>
              <span style={{ fontSize:15, fontWeight:700 }}>{calYear}년 {monthName}</span>
              <button onClick={()=>goMonth(1)} style={{ width:34, height:34, borderRadius:"50%", background:C.surface, border:`1px solid ${C.border}`, color:C.muted, cursor:"pointer", fontSize:18, fontFamily:"inherit" }}>›</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", marginBottom:6 }}>
              {(settings?.calStartSunday?["일","월","화","수","목","금","토"]:["월","화","수","목","금","토","일"]).map((d,i)=>{
                const isSun=settings?.calStartSunday?i===0:i===6;
                const isSat=settings?.calStartSunday?i===6:i===5;
                return <div key={d} style={{ textAlign:"center", fontSize:10, color:isSun?"#ff7070":isSat?"#7090ff":C.dim }}>{d}</div>;
              })}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
              {Array.from({length:firstDow}).map((_,i)=><div key={`e${i}`}/>)}
              {Array.from({length:daysInMonth},(_,i)=>i+1).map(day=>{
                const dk=`${calYear}-${String(calMonth+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;
                const isSel=dk===selectedDate, isTod=dk===todayKey;
                const hist=(team.paletteHistory||{})[dk];
                const dow=new Date(dk+"T00:00:00").getDay();
                const isDone=hist?.total>0&&(hist.drops?.length||0)>=hist.total;
                const _tc=teamCalCache[dk]||{hasTodos:false,hasIncomplete:false};
                const hasInc=_tc.hasIncomplete;
                const numColor=dow===0?"#ff7070":dow===6?"#7090ff":hasInc?C.text:isDone?"#444":"#3a3a3a";
                return (
                  <div key={day} ref={isSel?targetCellRef:null} onClick={()=>{setSelectedDate(dk);closeCalendar();}} style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:2, cursor:"pointer", padding:"3px 1px", borderRadius:radius.sm, background:isSel?"#222":"transparent",
                    outline:hasInc?"1px solid rgba(255,255,255,0.18)":isDone?"1px solid rgba(255,255,255,0.06)":"none" }}>
                    <div style={{ position:"relative", width:30, height:30, animation:stampDate===dk?"stamp 0.55s cubic-bezier(0.36,0.07,0.19,0.97) both":"none" }}>
                      {stampDate===dk&&<div style={{ position:"absolute", inset:-4, borderRadius:"50%", border:"1.5px solid rgba(255,255,255,0.6)", animation:"ripple 0.7s 0.15s ease-out forwards", pointerEvents:"none" }}/>}
                      {hist?.drops?.length>0
                        ?<div style={{opacity:isDone?1:0.35+(hist.drops.length/(hist.total||hist.drops.length))*0.65}}>
                          <CalendarPalette drops={hist.drops} totalCount={hist.total} size={30}/>
                          {isDone&&<div style={{position:"absolute",inset:0,borderRadius:"50%",border:"1.5px solid rgba(255,255,255,0.5)",pointerEvents:"none"}}/>}
                         </div>
                        :<div style={{width:30,height:30,borderRadius:"50%",background:isTod?"#1a1a1a":"transparent",border:isTod?`1px solid ${C.border2}`:isSel?"1px solid #444":"none",display:"flex",alignItems:"center",justifyContent:"center"}}>
                          {isTod&&<div style={{width:4,height:4,borderRadius:"50%",background:C.dim}}/>}
                         </div>
                      }
                    </div>
                    <span style={{fontSize:9,color:numColor,fontWeight:isTod?700:hasInc?600:400}}>{day}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 헤더 */}
      <div style={{ flexShrink:0, padding:"16px 18px 0" }}>
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:12 }}>
          <button onClick={onBack} style={{ background:"none", border:"none", color:C.muted, cursor:"pointer", fontSize:20, padding:0, lineHeight:1 }}>‹</button>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:17, fontWeight:700, letterSpacing:"-0.02em" }}>{team.name}</div>
            {team.desc&&<div style={{fontSize:11,color:C.muted,marginTop:1}}>{team.desc}</div>}
          </div>
          <button onClick={()=>setShowInvite(true)} style={{ height:28,padding:"0 10px",borderRadius:radius.full,background:C.surface,border:`1px solid ${C.border}`,color:C.muted,cursor:"pointer",fontSize:11,fontFamily:"inherit" }}>+ 초대</button>
          <button onClick={()=>setShowMenu(v=>!v)} style={{ width:28,height:28,borderRadius:"50%",background:C.surface,border:`1px solid ${C.border}`,color:C.muted,cursor:"pointer",fontSize:16,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>···</button>
        </div>

        {/* ··· 드롭다운 메뉴 */}
        {showMenu && (
          <div onClick={()=>setShowMenu(false)} style={{ position:"fixed",inset:0,zIndex:200 }}>
            <div onClick={e=>e.stopPropagation()} style={{ position:"absolute",top:56,right:18,background:C.surface,borderRadius:radius.md,border:`1px solid ${C.border2}`,overflow:"hidden",minWidth:140,boxShadow:"0 8px 24px rgba(0,0,0,0.4)",zIndex:201 }}>
              {isOwner && (
                <button onClick={()=>{setShowMenu(false);setEditName(team.name);setEditDesc(team.desc||'');setEditingTeam(true);}} style={{ width:"100%",padding:"13px 16px",background:"none",border:"none",borderBottom:`1px solid ${C.border}`,color:C.text,cursor:"pointer",fontSize:13,textAlign:"left",fontFamily:"inherit" }}>팀 정보 수정</button>
              )}
              {!isOwner && (
                <button onClick={()=>{setShowMenu(false);setConfirmAction("leave");}} style={{ width:"100%",padding:"13px 16px",background:"none",border:"none",borderBottom:`1px solid ${C.border}`,color:"#ff9f43",cursor:"pointer",fontSize:13,textAlign:"left",fontFamily:"inherit" }}>팀 나가기</button>
              )}
              {isOwner && (
                <button onClick={()=>{setShowMenu(false);setConfirmAction("delete");}} style={{ width:"100%",padding:"13px 16px",background:"none",border:"none",color:"#ff6b6b",cursor:"pointer",fontSize:13,textAlign:"left",fontFamily:"inherit" }}>팀 삭제</button>
              )}
            </div>
          </div>
        )}

        {/* 확인 다이얼로그 */}
        {confirmAction && (
          <div style={{ background: confirmAction==="delete"?"#1e1010":"#1a1508", border:`1px solid ${confirmAction==="delete"?"#3a1a1a":"#3a2a0a"}`, borderRadius:radius.md, padding:"14px", marginBottom:10 }}>
            <div style={{ fontSize:13, color: confirmAction==="delete"?"#ff7070":"#ff9f43", marginBottom:12 }}>
              {confirmAction==="delete" ? "팀을 삭제하면 모든 데이터가 사라져요. 정말 삭제할까요?" : "팀에서 나가면 다시 초대받아야 참여할 수 있어요. 나갈까요?"}
            </div>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setConfirmAction(null)} style={{ flex:1,padding:"9px",background:"transparent",border:`1px solid ${C.border2}`,borderRadius:radius.sm,color:C.muted,cursor:"pointer",fontFamily:"inherit",fontSize:12 }}>취소</button>
              <button onClick={()=>{ confirmAction==="delete"?onDelete(team.id):onLeave(team.id,myHandle); setConfirmAction(null); }}
                style={{ flex:1,padding:"9px",background:confirmAction==="delete"?"#ff4444":"#ff9f43",border:"none",borderRadius:radius.sm,color:"#fff",cursor:"pointer",fontWeight:700,fontFamily:"inherit",fontSize:12 }}>
                {confirmAction==="delete"?"삭제":"나가기"}
              </button>
            </div>
          </div>
        )}

        {/* 팀 정보 수정 */}
        {editingTeam && (
          <div style={{ background:C.surface, border:`1px solid ${C.border2}`, borderRadius:radius.md, padding:"14px", marginBottom:10 }}>
            <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>팀 이름</div>
            <input value={editName} onChange={e=>setEditName(e.target.value)} style={{ width:"100%", boxSizing:"border-box", background:C.card, border:`1px solid ${C.border2}`, borderRadius:radius.sm, padding:"9px 12px", color:C.text, fontSize:13, outline:"none", fontFamily:"inherit", marginBottom:10 }}/>
            <div style={{ fontSize:11, color:C.muted, marginBottom:8 }}>설명</div>
            <input value={editDesc} onChange={e=>setEditDesc(e.target.value)} placeholder="팀 설명 (선택)" style={{ width:"100%", boxSizing:"border-box", background:C.card, border:`1px solid ${C.border2}`, borderRadius:radius.sm, padding:"9px 12px", color:C.text, fontSize:13, outline:"none", fontFamily:"inherit", marginBottom:12 }}/>
            <div style={{ display:"flex", gap:8 }}>
              <button onClick={()=>setEditingTeam(false)} style={{ flex:1, padding:"9px", background:"transparent", border:`1px solid ${C.border2}`, borderRadius:radius.sm, color:C.muted, cursor:"pointer", fontFamily:"inherit", fontSize:12 }}>취소</button>
              <button onClick={()=>{ if(editName.trim()) onUpdate({...team, name:editName.trim(), desc:editDesc.trim()}); setEditingTeam(false); }} style={{ flex:1, padding:"9px", background:C.text, border:"none", borderRadius:radius.sm, color:C.bg, cursor:"pointer", fontWeight:700, fontFamily:"inherit", fontSize:12 }}>저장</button>
            </div>
          </div>
        )}

        {/* 멤버 아바타 */}
        <div style={{ display:"flex", gap:6, marginBottom:12 }}>
          {team.members.map((m,i)=>{
            const mc=getMemberColor(i);
            return <div key={m.handle} title={`${m.name} — ${mc.label}`} style={{ width:28,height:28,borderRadius:"50%",background:mc.base+"25",border:`2px solid ${mc.base}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,fontWeight:700,color:mc.base }}>{m.name[0]}</div>;
          })}
        </div>

        {/* 날짜 네비 */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
          <div style={{ display:"flex", flexDirection:"column", alignItems:"center" }}>
            <div style={{ fontSize:9, color:C.dim, letterSpacing:"0.3em", textTransform:"uppercase", marginBottom:2 }}>team</div>
            <div style={{ display:"flex", alignItems:"center", gap:4 }}>
              <button onClick={()=>goDay(-1)} style={{ background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:9,padding:0,width:13,opacity:0.55,display:"flex",alignItems:"center",justifyContent:"center" }}>◀</button>
              <div style={{ fontSize:16,fontWeight:700,letterSpacing:"-0.02em",color:C.text,whiteSpace:"nowrap",width:88,textAlign:"center" }}>
                {isToday?"오늘":new Date(selectedDate+"T00:00:00").toLocaleDateString("ko-KR",{month:"long",day:"numeric"})}
              </div>
              <button onClick={()=>goDay(1)} style={{ background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:9,padding:0,width:13,opacity:0.55,display:"flex",alignItems:"center",justifyContent:"center" }}>▶</button>
            </div>
          </div>
          <button onClick={()=>setShowCal(true)} style={{ height:26,padding:"0 10px",borderRadius:radius.full,background:C.surface,border:`1px solid ${C.border}`,color:C.muted,cursor:"pointer",fontSize:11,fontFamily:"inherit" }}>캘린더</button>
        </div>

        {/* 팔레트 */}
        <div style={{ width:160, margin:"0 auto" }}>
          <PaletteCanvas drops={drops} version={canvasVer} totalCount={totalCount} animDrop={animDrop} onAnimDone={()=>setAnimDrop(null)} />
          <div style={{ height:3,borderRadius:3,background:C.surface,overflow:"hidden",marginTop:8 }}>
            <div style={{ height:"100%",width:`${progress}%`,borderRadius:3,background:progGrad,transition:"width 0.8s ease" }}/>
          </div>
          <div style={{ display:"flex",alignItems:"center",gap:3,marginTop:5,minHeight:12 }}>
            {drops.slice(0,10).map(d=><div key={d.id} style={{width:7,height:7,borderRadius:"50%",background:d.color,boxShadow:`0 0 3px ${d.color}66`}}/>)}
            {drops.length>10&&<span style={{fontSize:9,color:C.dim}}>+{drops.length-10}</span>}
            {totalCount>0&&<span style={{fontSize:10,color:C.dim,marginLeft:"auto"}}>{doneCount}/{totalCount}</span>}
          </div>
        </div>
      </div>

      <div style={{ flexShrink:0, height:1, background:C.border, margin:"10px 18px 0" }}/>

      {/* 할일 목록 스크롤 영역 */}
      <div style={{ flex:1, overflowY:"auto", padding:"10px 18px 90px" }}>
        {/* 카테고리 없으면 안내 */}
        {cats.length===0 && !addingCat && (
          <div style={{ textAlign:"center", padding:"28px 0 10px", color:C.dim }}>
            <div style={{ fontSize:12, marginBottom:12 }}>카테고리를 만들어 할 일을 분류해보세요</div>
            <button onClick={()=>{setAddingCat(true);setTimeout(()=>inputRef.current?.focus(),50)}} style={{ padding:"9px 20px",background:C.surface,border:`1px solid ${C.border}`,borderRadius:radius.full,color:C.muted,cursor:"pointer",fontSize:12,fontFamily:"inherit" }}>+ 카테고리 추가</button>
          </div>
        )}

        {/* 카테고리 추가 인풋 */}
        {addingCat && (
          <div style={{ display:"flex", gap:7, marginBottom:14 }}>
            <input ref={inputRef} value={newCatName} onChange={e=>setNewCatName(e.target.value)}
              onKeyDown={e=>{if(e.key==="Enter")addCat();if(e.key==="Escape")setAddingCat(false);}}
              placeholder="카테고리 이름" style={{ flex:1,background:C.card,border:`1px solid ${C.border2}`,borderRadius:radius.md,padding:"10px 12px",color:C.text,fontSize:13,outline:"none",fontFamily:"inherit" }}/>
            <button onClick={addCat} style={{ width:40,height:40,background:myColor.base,border:"none",borderRadius:radius.md,cursor:"pointer",fontSize:18,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>+</button>
          </div>
        )}

        {/* 카테고리별 할일 */}
        {cats.map(cat => {
          const todos = selTodos[cat.id] || [];
          const catDone = todos.filter(t=>t.done).length;
          return (
            <div key={cat.id} style={{ marginBottom:20 }}>
              <div style={{ display:"flex",alignItems:"center",gap:8,marginBottom:8 }}>
                <div style={{ display:"flex",alignItems:"center",gap:6,padding:"3px 10px 3px 7px",background:cat.color+"15",borderRadius:radius.full,border:`1px solid ${cat.color}28` }}>
                  <div style={{ width:6,height:6,borderRadius:"50%",background:cat.color,boxShadow:`0 0 5px ${cat.color}` }}/>
                  <span style={{ fontSize:12,fontWeight:600,color:cat.color }}>{cat.name}</span>
                </div>
                {todos.length>0&&<span style={{fontSize:10,color:C.dim}}>{catDone}/{todos.length}</span>}
                <div style={{flex:1}}/>
                <button onClick={()=>{setAddingTo(cat.id);setNewTodo("");setTimeout(()=>inputRef.current?.focus(),50)}} style={{ width:24,height:24,borderRadius:"50%",background:C.surface,border:`1px solid ${C.border2}`,color:C.muted,cursor:"pointer",fontSize:15,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1 }}>+</button>
              </div>

              <div style={{ display:"flex",flexDirection:"column",gap:5 }}>
                {todos.map(todo=>{
                  const authorIdx=team.members.findIndex(m=>m.handle===todo.author);
                  const ac=getMemberColor(authorIdx>=0?authorIdx:0);
                  return (
                    <div key={todo.id} style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px",background:todo.done?"transparent":C.card,borderRadius:radius.md,border:`1px solid ${todo.done?C.border:C.border2}`,opacity:todo.done?0.45:1,transition:"all 0.2s" }}>
                      <div onClick={()=>toggleTodo(cat.id,todo.id)} style={{ width:20,height:20,borderRadius:"50%",flexShrink:0,cursor:"pointer",border:`2px solid ${todo.done?ac.base:C.border2}`,background:todo.done?ac.base:"transparent",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s" }}>
                        {todo.done&&<span style={{color:"#080808",fontSize:10,fontWeight:800}}>✓</span>}
                      </div>
                      <span style={{ flex:1,fontSize:13,color:todo.done?C.muted:C.text,textDecoration:todo.done?"line-through":"none" }}>{todo.text}</span>
                      <div style={{ width:18,height:18,borderRadius:"50%",background:ac.base+"25",border:`1.5px solid ${ac.base}`,display:"flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:700,color:ac.base,flexShrink:0 }} title={todo.authorName}>{todo.authorName[0]}</div>
                      {(todo.author===myHandle||isOwner) && (
                        <button onClick={()=>deleteTodo(cat.id,todo.id)} style={{ background:"none",border:"none",color:C.dim,cursor:"pointer",fontSize:13,padding:0,lineHeight:1,flexShrink:0 }}>✕</button>
                      )}
                    </div>
                  );
                })}
              </div>

              {addingTo===cat.id&&(
                <div style={{ display:"flex",gap:7,marginTop:7 }}>
                  <input ref={inputRef} value={newTodo} onChange={e=>setNewTodo(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter")addTodo(cat.id);if(e.key==="Escape")setAddingTo(null);}}
                    placeholder="할 일 입력..." style={{ flex:1,background:C.card,border:`1px solid ${C.border2}`,borderRadius:radius.md,padding:"10px 12px",color:C.text,fontSize:13,outline:"none",fontFamily:"inherit" }}/>
                  <button onClick={()=>addTodo(cat.id)} style={{ width:40,height:40,background:myColor.base,border:"none",borderRadius:radius.md,cursor:"pointer",fontSize:17,display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>↵</button>
                </div>
              )}
            </div>
          );
        })}

        {/* 카테고리 있을 때 하단 추가 버튼 */}
        {cats.length>0&&!addingCat&&(
          <button onClick={()=>{setAddingCat(true);setTimeout(()=>inputRef.current?.focus(),50)}} style={{ width:"100%",padding:"10px",background:"transparent",border:`1px dashed ${C.border2}`,borderRadius:radius.md,color:C.dim,cursor:"pointer",fontSize:12,fontFamily:"inherit",marginTop:4 }}>+ 카테고리 추가</button>
        )}
      </div>

      {showInvite&&<InviteModal team={team} onClose={()=>setShowInvite(false)} onInvite={inviteMember} friends={friends}/>}
    </div>
  );
}

// 팀 목록 (검색 포함)
function TeamScreen({ myHandle, myName, settings, friends }) {
  const [teams, setTeams]         = useState(DEMO_TEAMS(myHandle, myName));
  const [showCreate, setShowCreate] = useState(false);
  const [activeTeam, setActiveTeam] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const updateTeam = (updated) => {
    setTeams(ts => ts.map(t => t.id === updated.id ? updated : t));
    if (activeTeam?.id === updated.id) setActiveTeam(updated);
  };

  const createTeam = ({ name, desc }) => {
    const team = {
      id: uid(), name, desc,
      members: [{ handle: myHandle, name: myName, avatar: "" }],
      cats: [], todosByDate: {}, paletteHistory: {}, createdAt: Date.now(),
    };
    setTeams(ts => [team, ...ts]);
    setShowCreate(false);
    setActiveTeam(team);
  };

  const leaveTeam = (teamId, handle) => {
    setTeams(ts => {
      const updated = ts.map(t => t.id===teamId ? {...t, members: t.members.filter(m=>m.handle!==handle)} : t);
      // 마지막 멤버가 나가면 팀 자동 삭제
      return updated.filter(t => t.members.length > 0);
    });
    setActiveTeam(null);
  };
  const deleteTeam = (teamId) => {
    setTeams(ts => ts.filter(t => t.id !== teamId));
    setActiveTeam(null);
  };

  if (activeTeam) return <TeamDetail team={activeTeam} myHandle={myHandle} onBack={() => setActiveTeam(null)} onUpdate={updateTeam} settings={settings} onLeave={leaveTeam} onDelete={deleteTeam} friends={friends} />;

  const filtered = teams.filter(t => t.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "system-ui,sans-serif", paddingBottom: 90 }}>
      {/* 헤더 */}
      <div style={{ padding: "24px 18px 0", display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 10, color: C.dim, letterSpacing: "0.3em", textTransform: "uppercase", marginBottom: 2 }}>makeblack</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em" }}>팀</div>
        </div>
        <button onClick={() => setShowCreate(true)} style={{ height: 32, padding: "0 14px", borderRadius: radius.full, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 12, fontFamily: "inherit" }}>+ 팀 만들기</button>
      </div>

      {/* 검색 */}
      <div style={{ padding: "14px 18px 0" }}>
        <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="팀 검색..."
          style={{ width: "100%", boxSizing: "border-box", background: C.surface, border: `1px solid ${C.border}`, borderRadius: radius.md, padding: "10px 14px", color: C.text, fontSize: 13, outline: "none", fontFamily: "inherit" }} />
      </div>

      {/* 팀 목록 */}
      <div style={{ padding: "14px 18px 0" }}>
        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 0", color: C.dim }}>
            <div style={{ fontSize: 28, marginBottom: 12 }}>◈</div>
            <div style={{ fontSize: 13, marginBottom: 6 }}>{searchQuery ? "검색 결과가 없어요" : "아직 팀이 없어요"}</div>
            {!searchQuery && <div style={{ fontSize: 11, color: C.dim }}>+ 팀 만들기로 시작해보세요</div>}
          </div>
        )}
        {filtered.map(team => {
          // todosByDate 전체 집계
          const allTeamTodos = Object.values(team.todosByDate || {}).flatMap(byDate => Object.values(byDate).flat());
          const done  = allTeamTodos.filter(t => t.done).length;
          const total = allTeamTodos.length;
          const prog  = total > 0 ? done / total : 0;
          // 팔레트: 가장 최근 날짜의 drops 사용
          const latestDate = Object.keys(team.paletteHistory || {}).sort().pop();
          const latestDrops = latestDate ? (team.paletteHistory[latestDate]?.drops || []) : [];
          return (
            <div key={team.id} onClick={() => setActiveTeam(team)} style={{ padding: "14px", marginBottom: 10, background: C.surface, borderRadius: radius.lg, border: `1px solid ${C.border}`, cursor: "pointer", transition: "border-color 0.15s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                {/* 팀 팔레트 미니 */}
                <div style={{ width: 44, height: 44, borderRadius: radius.sm, overflow: "hidden", flexShrink: 0, border: `1px solid ${C.border}` }}>
                  <TeamPaletteCanvas drops={latestDrops} totalCount={total} size={44} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>{team.name}</div>
                  {team.desc && <div style={{ fontSize: 11, color: C.muted, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{team.desc}</div>}
                </div>
                <span style={{ fontSize: 11, color: C.dim, flexShrink: 0 }}>{team.members.length}명</span>
              </div>
              {/* 멤버 색 도트 */}
              <div style={{ display: "flex", gap: 5, marginBottom: 8 }}>
                {team.members.map((m, i) => {
                  const mc = getMemberColor(i);
                  return <div key={m.handle} title={m.name} style={{ width: 8, height: 8, borderRadius: "50%", background: mc.base, boxShadow: `0 0 4px ${mc.base}88` }} />;
                })}
              </div>
              {/* 진행률 */}
              {total > 0 && (
                <div>
                  <div style={{ height: 3, background: C.card, borderRadius: 3, overflow: "hidden", marginBottom: 4 }}>
                    <div style={{ height: "100%", width: `${prog * 100}%`, borderRadius: 3, background: `linear-gradient(90deg, ${getMemberColor(0).base}, ${getMemberColor(team.members.length-1).base})`, transition: "width 0.8s ease" }} />
                  </div>
                  <div style={{ fontSize: 10, color: C.dim }}>{done}/{total} 완료</div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {showCreate && <CreateTeamModal myHandle={myHandle} onClose={() => setShowCreate(false)} onCreate={createTeam} />}
    </div>
  );
}

// 팀 데이터 구조: { id, name, desc, members, cats, todosByDate, paletteHistory, createdAt }
function DEMO_TEAMS(myHandle, myName) {
  const me = { handle: myHandle, name: myName, avatar: "" };
  const b  = { handle: "@bora", name: "보라", avatar: "" };
  const ch = { handle: "@chan", name: "찬", avatar: "" };
  const today = getTodayKey();
  const cat1 = { id: 801, name: "기획", color: getMemberColor(0).base };
  const cat2 = { id: 802, name: "개발", color: getMemberColor(1).base };
  const t1 = { id: 101, text: "기획서 초안 작성",  done: true,  author: myHandle,  authorName: myName, color: getMemberColor(0).color, rgb: getMemberColor(0).rgb, hue: getMemberColor(0).hue, px: 0.3,  py: 0.4,  seed: 9901 };
  const t2 = { id: 102, text: "와이어프레임 제작", done: true,  author: "@bora",   authorName: "보라", color: getMemberColor(1).color, rgb: getMemberColor(1).rgb, hue: getMemberColor(1).hue, px: 0.65, py: 0.55, seed: 9902 };
  const t3 = { id: 103, text: "프로토타입 구현",   done: false, author: "@chan",    authorName: "찬",   color: getMemberColor(2).color, rgb: getMemberColor(2).rgb, hue: getMemberColor(2).hue, px: 0.5,  py: 0.3,  seed: 9903 };
  const t4 = { id: 104, text: "발표 자료 준비",    done: false, author: myHandle,  authorName: myName, color: getMemberColor(0).color, rgb: getMemberColor(0).rgb, hue: getMemberColor(0).hue, px: 0.4,  py: 0.7,  seed: 9904 };
  const drop1 = { id: 101, rgb: getMemberColor(0).rgb, hue: getMemberColor(0).hue, color: getMemberColor(0).color, px: 0.3,  py: 0.4,  seed: 9901 };
  const drop2 = { id: 102, rgb: getMemberColor(1).rgb, hue: getMemberColor(1).hue, color: getMemberColor(1).color, px: 0.65, py: 0.55, seed: 9902 };
  return [{
    id: 1, name: "졸업 프로젝트 A팀", desc: "UI/UX 디자인 프로젝트",
    members: [me, b, ch],
    cats: [cat1, cat2],
    todosByDate: { [today]: { [cat1.id]: [t1, t2], [cat2.id]: [t3, t4] } },
    paletteHistory: { [today]: { drops: [drop1, drop2], total: 4 } },
    createdAt: Date.now() - 86400000 * 3,
  }];
}


// ─────────────────────────────────────────────
// Search / Friend
// ─────────────────────────────────────────────
const DEMO_USERS = [
  { handle: "@bora",   name: "보라",   bio: "디자이너 🎨",          blackCount: 14, followers: 23 },
  { handle: "@chan",   name: "찬",     bio: "개발자 💻",             blackCount: 8,  followers: 11 },
  { handle: "@minjun", name: "민준",   bio: "운동 매일 하는 사람 💪", blackCount: 22, followers: 47 },
  { handle: "@sora",  name: "소라",   bio: "매일 공부 중 📚",        blackCount: 5,  followers: 9  },
  { handle: "@yuna",  name: "유나",   bio: "할 일 덕후 ✦",           blackCount: 31, followers: 88 },
  { handle: "@jinho", name: "진호",   bio: "독서 + 글쓰기",          blackCount: 17, followers: 34 },
  { handle: "@heera", name: "희라",   bio: "새벽 루틴 중",           blackCount: 9,  followers: 15 },
];

const DEMO_FRIENDS = [
  { ...DEMO_USERS[0], status: "following" },
  { ...DEMO_USERS[1], status: "following" },
];

function UserCard({ u, isSelf, isFollowing, onFollow, onUnfollow }) {
  const [confirm, setConfirm] = useState(false);
  return (
    <div style={{ padding:"14px", background:C.surface, borderRadius:radius.lg, border:`1px solid ${C.border}`, marginBottom:10 }}>
      <div style={{ display:"flex", alignItems:"center", gap:12 }}>
        {/* 아바타 */}
        <div style={{ width:44, height:44, borderRadius:"50%", background:`linear-gradient(135deg, hsl(${(u.handle.length*37)%360},60%,55%), hsl(${(u.handle.length*67)%360},60%,45%))`, display:"flex", alignItems:"center", justifyContent:"center", fontSize:18, fontWeight:700, color:"#fff", flexShrink:0 }}>
          {u.name[0]}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:700, color:C.text }}>{u.name}</div>
          <div style={{ fontSize:11, color:C.muted }}>{u.handle}</div>
          {u.bio && <div style={{ fontSize:11, color:C.dim, marginTop:2, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{u.bio}</div>}
        </div>
        {/* 팔로우 버튼 */}
        {!isSelf && (
          confirm
            ? <div style={{ display:"flex", gap:6 }}>
                <button onClick={()=>setConfirm(false)} style={{ padding:"6px 10px", background:"transparent", border:`1px solid ${C.border2}`, borderRadius:radius.full, color:C.muted, cursor:"pointer", fontSize:11, fontFamily:"inherit" }}>취소</button>
                <button onClick={()=>{onUnfollow(u.handle);setConfirm(false);}} style={{ padding:"6px 10px", background:"transparent", border:`1px solid #ff6b6b`, borderRadius:radius.full, color:"#ff6b6b", cursor:"pointer", fontSize:11, fontFamily:"inherit" }}>언팔로우</button>
              </div>
            : <button onClick={()=>isFollowing?setConfirm(true):onFollow(u)} style={{
                padding:"6px 14px", borderRadius:radius.full, cursor:"pointer", fontSize:11, fontFamily:"inherit",
                background: isFollowing ? "transparent" : C.text,
                color:      isFollowing ? C.muted        : C.bg,
                border:    `1px solid ${isFollowing ? C.border2 : C.text}`,
              }}>{isFollowing ? "팔로잉" : "팔로우"}</button>
        )}
        {isSelf && <span style={{ fontSize:11, color:C.dim, padding:"6px 10px" }}>나</span>}
      </div>
      {/* 통계 */}
      <div style={{ display:"flex", gap:16, marginTop:10, paddingLeft:56 }}>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{u.blackCount}</div>
          <div style={{ fontSize:9, color:C.muted, marginTop:1, letterSpacing:"0.05em" }}>BLACK</div>
        </div>
        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:13, fontWeight:700, color:C.text }}>{u.followers}</div>
          <div style={{ fontSize:9, color:C.muted, marginTop:1, letterSpacing:"0.05em" }}>팔로워</div>
        </div>
      </div>
    </div>
  );
}

function SearchScreen({ myHandle, friends, onAddFriend, onRemoveFriend }) {
  const [query, setQuery]   = useState("");
  const [activeTab, setActiveTab] = useState("search"); // "search" | "friends"
  const inputRef = useRef(null);

  const isFollowing = (handle) => friends.some(f => f.handle === handle);

  // 검색 결과 — 자신 제외, 쿼리 필터
  const results = query.trim().length > 0
    ? DEMO_USERS.filter(u =>
        u.handle !== myHandle &&
        (u.handle.toLowerCase().includes(query.toLowerCase()) ||
         u.name.includes(query))
      )
    : [];

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"system-ui,sans-serif", paddingBottom:90 }}>
      {/* 헤더 */}
      <div style={{ padding:"24px 18px 0" }}>
        <div style={{ fontSize:10, color:C.dim, letterSpacing:"0.3em", textTransform:"uppercase", marginBottom:4 }}>makeblack</div>
        <div style={{ fontSize:22, fontWeight:700, letterSpacing:"-0.03em", marginBottom:14 }}>검색</div>

        {/* 검색 인풋 */}
        <div style={{ position:"relative", marginBottom:16 }}>
          <input
            ref={inputRef}
            value={query}
            onChange={e=>setQuery(e.target.value)}
            placeholder="이름 또는 @아이디 검색"
            style={{ width:"100%", boxSizing:"border-box", background:C.surface, border:`1px solid ${query?C.border2:C.border}`, borderRadius:radius.md, padding:"11px 36px 11px 14px", color:C.text, fontSize:13, outline:"none", fontFamily:"inherit", transition:"border-color 0.15s" }}
          />
          {query && (
            <button onClick={()=>setQuery("")} style={{ position:"absolute", right:10, top:"50%", transform:"translateY(-50%)", background:"none", border:"none", color:C.dim, cursor:"pointer", fontSize:16, lineHeight:1, padding:2 }}>✕</button>
          )}
        </div>

        {/* 탭 */}
        <div style={{ display:"flex", gap:6, marginBottom:16 }}>
          {[["search","검색"],["friends","친구 목록"]].map(([k,l])=>(
            <button key={k} onClick={()=>setActiveTab(k)} style={{ padding:"6px 14px", borderRadius:radius.full, cursor:"pointer", fontSize:12, fontFamily:"inherit", background:activeTab===k?C.text:"transparent", color:activeTab===k?C.bg:C.muted, border:`1px solid ${activeTab===k?C.text:C.border2}`, transition:"all 0.15s" }}>
              {l}{k==="friends"&&friends.length>0&&<span style={{ marginLeft:5, fontSize:10, opacity:0.7 }}>{friends.length}</span>}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding:"0 18px" }}>
        {/* 검색 탭 */}
        {activeTab==="search" && (<>
          {query.trim()==='' && (
            <div style={{ textAlign:"center", padding:"40px 0", color:C.dim }}>
              <div style={{ fontSize:28, marginBottom:12 }}>◎</div>
              <div style={{ fontSize:13 }}>아이디나 이름으로 친구를 찾아보세요</div>
            </div>
          )}
          {query.trim()!=='' && results.length===0 && (
            <div style={{ textAlign:"center", padding:"40px 0", color:C.dim }}>
              <div style={{ fontSize:13 }}>검색 결과가 없어요</div>
              <div style={{ fontSize:11, marginTop:6 }}>정확한 아이디를 입력해보세요</div>
            </div>
          )}
          {results.map(u=>(
            <UserCard key={u.handle} u={u}
              isSelf={u.handle===myHandle}
              isFollowing={isFollowing(u.handle)}
              onFollow={onAddFriend}
              onUnfollow={onRemoveFriend}
            />
          ))}
        </>)}

        {/* 친구 목록 탭 */}
        {activeTab==="friends" && (<>
          {friends.length===0 && (
            <div style={{ textAlign:"center", padding:"40px 0", color:C.dim }}>
              <div style={{ fontSize:28, marginBottom:12 }}>◈</div>
              <div style={{ fontSize:13, marginBottom:6 }}>아직 팔로우한 친구가 없어요</div>
              <div style={{ fontSize:11 }}>검색으로 친구를 찾아 팔로우해보세요</div>
            </div>
          )}
          {friends.map(u=>(
            <UserCard key={u.handle} u={u}
              isSelf={u.handle===myHandle}
              isFollowing={true}
              onFollow={onAddFriend}
              onUnfollow={onRemoveFriend}
            />
          ))}
        </>)}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// Placeholder screens
// ─────────────────────────────────────────────
function PlaceholderScreen({ label, icon }) {
  return (
    <div style={{ minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, paddingBottom: 80 }}>
      <div style={{ width: 56, height: 56, borderRadius: radius.lg, background: C.surface, border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, color: C.dim }}>{icon}</div>
      <div style={{ fontSize: 14, color: C.dim, letterSpacing: "0.1em" }}>{label}</div>
      <div style={{ fontSize: 11, color: C.border2 }}>coming soon</div>
    </div>
  );
}
// ─────────────────────────────────────────────
// Bottom Nav
// ─────────────────────────────────────────────
function BottomNav({ tab, setTab }) {
  const items = [
    { key: "home",    icon: "⌂",  label: "홈"        },
    { key: "search",  icon: "◎",  label: "검색"      },
    { key: "team",    icon: "◈",  label: "팀"        },
    { key: "mypage",  icon: "◉",  label: "마이페이지" },
  ];
  return (
    <div style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 480,
      background: C.bg + "e0", backdropFilter: "blur(16px)",
      borderTop: `1px solid ${C.border}`,
      display: "flex", height: 68, zIndex: 100,
    }}>
      {items.map(it => {
        const active = tab === it.key;
        return (
          <button key={it.key} onClick={() => setTab(it.key)} style={{
            flex: 1, background: "none", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4, position: "relative",
          }}>
            <span style={{ fontSize: 20, color: active ? C.text : "#333", transition: "color 0.18s" }}>{it.icon}</span>
            <span style={{ fontSize: 9, color: active ? C.text : "#333", letterSpacing: "0.04em", transition: "color 0.18s" }}>{it.label}</span>
            {active && <div style={{ position: "absolute", bottom: 6, width: 3, height: 3, borderRadius: "50%", background: C.text }} />}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────
// App root
// ─────────────────────────────────────────────
export default function MakeBlack() {
  const [tab, setTab]                       = useState("home");
  const [showOnboarding, setShowOnboarding] = useState(true);
  // ── 전역 상태 (탭 전환해도 유지) ──
  const [cats, setCats]                     = useState(DEFAULT_CATEGORIES);
  const [ruts, setRuts]                     = useState(DEFAULT_ROUTINES);
  const [paletteHistory, setPaletteHistory] = useState({});
  const [todosByDate, setTodosByDate]       = useState({});
  const [selectedDate, setSelectedDate]     = useState(getTodayKey);
  // 전역 설정
  const [settings, setSettings] = useState({
    calStartSunday: true,
    use24h: false,
    language: "ko",
    reminderTime: "09:00",
    reminderOn: false,
    blackAnimationOn: true,
    teamBlackAnimationOn: true,
    paletteSize: "medium",
    pinLock: false,
    pin: "",
    privacy: "public", // public | followers | private
    theme: "dark", // dark | light
  });
  // 유저 프로필 (실제 서비스시 서버에서)
  const [user, setUser] = useState({
    name: "사용자", handle: "@user", bio: "매일 조금씩, 검정을 향해 ✦",
    avatar: "", followers: 12, following: 8,
    email: "user@makeblack.app",
  });
  const [friends, setFriends] = useState(DEMO_FRIENDS);
  const addFriend    = (u) => setFriends(fs => fs.some(f=>f.handle===u.handle) ? fs : [...fs, {...u, status:"following"}]);
  const removeFriend = (handle) => setFriends(fs => fs.filter(f=>f.handle!==handle));
  const updSetting = (key, val) => setSettings(s => ({ ...s, [key]: val }));

  // 테마 적용 — 렌더마다 C를 현재 테마로 갱신
  C = THEMES[settings.theme] || THEMES.dark;

  // PIN 잠금 — 실제 앱에서는 Keychain/Keystore로 PIN 영속 저장 필요
  // 프로토타입에서는 새로고침 시 settings가 초기화되므로 pinLock도 초기화됨
  const [pinUnlocked, setPinUnlocked] = useState(!settings.pinLock);
  const [pinEntry, setPinEntry]       = useState("");
  useEffect(() => { if (!settings.pinLock) setPinUnlocked(true); }, [settings.pinLock]);

  if (settings.pinLock && !pinUnlocked) {
    return (
      <div style={{ maxWidth: 480, margin: "0 auto", minHeight: "100vh", background: C.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 32 }}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>●</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: C.text, marginBottom: 4 }}>MakeBlack</div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 36 }}>PIN을 입력해주세요</div>
        <div style={{ display: "flex", gap: 12, marginBottom: 28 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} style={{ width: 14, height: 14, borderRadius: "50%", background: pinEntry.length > i ? C.text : C.border2, transition: "background 0.15s" }} />
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, width: 220 }}>
          {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((k, i) => (
            <button key={i} onClick={() => {
              if (!k) return;
              const next = k === "⌫" ? pinEntry.slice(0,-1) : pinEntry + k;
              setPinEntry(next);
              if (next.length === 4) {
                if (next === settings.pin) { setPinUnlocked(true); setPinEntry(""); }
                else { setTimeout(() => setPinEntry(""), 300); }
              }
            }} style={{ height: 52, borderRadius: radius.md, background: k ? C.surface : "transparent", border: k ? `1px solid ${C.border}` : "none", color: C.text, fontSize: 18, cursor: k ? "pointer" : "default", fontFamily: "inherit" }}>{k}</button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", position: "relative", minHeight: "100vh", background: C.bg }}>
      {showOnboarding && <OnboardingOverlay onDone={() => { setShowOnboarding(false); }} />}
      {!showOnboarding && (
        <div style={{ display: tab === "home" ? "block" : "none" }}>
          <HomeScreen cats={cats} setCats={setCats} ruts={ruts} setRuts={setRuts} paletteHistory={paletteHistory} setPaletteHistory={setPaletteHistory} todosByDate={todosByDate} setTodosByDate={setTodosByDate} selectedDate={selectedDate} setSelectedDate={setSelectedDate} settings={settings} />
        </div>
      )}
      {!showOnboarding && <div style={{ display: tab === "search" ? "block" : "none" }}><SearchScreen myHandle={user.handle} friends={friends} onAddFriend={addFriend} onRemoveFriend={removeFriend} /></div>}
      {!showOnboarding && <div style={{ display: tab === "team" ? "block" : "none" }}><TeamScreen myHandle={user.handle} myName={user.name} settings={settings} friends={friends} /></div>}
      {tab === "mypage"  && <MyPageScreen paletteHistory={paletteHistory} todosByDate={todosByDate} cats={cats} ruts={ruts} user={user} setUser={setUser} settings={settings} updSetting={updSetting} friends={friends} onTabChange={setTab} />}
      <BottomNav tab={tab} setTab={setTab} />
      <style>{`:root { --bg: ${C.bg}; --surface: ${C.surface}; --text: ${C.text}; --muted: ${C.muted}; --dim: ${C.dim}; --border: ${C.border}; }`}</style>
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes blackIn { from { opacity: 0; transform: scale(1.04) } to { opacity: 1; transform: scale(1) } }
        @keyframes blackOut { from { opacity: 1; transform: scale(1) } to { opacity: 0; transform: scale(0.97) } }
        @keyframes stamp {
          0%   { transform: scale(2.4); opacity: 0; }
          45%  { transform: scale(0.85); opacity: 1; }
          68%  { transform: scale(1.12); }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes ripple {
          0%   { transform: scale(1); opacity: 0.6; }
          100% { transform: scale(2.8); opacity: 0; }
        }
        @keyframes slideDown { from { transform: translateX(-50%) translateY(-100%) } to { transform: translateX(-50%) translateY(0) } }
        @keyframes slideUp { from { transform: translateX(-50%) translateY(0) } to { transform: translateX(-50%) translateY(-108%) } }
        @keyframes pulse  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.08)} }
        input::placeholder { color: var(--dim); }
        select option { background: var(--bg); color: var(--text); }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { width: 0; }
      `}</style>
    </div>
  );
}