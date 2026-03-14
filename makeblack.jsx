import { useState, useEffect, useRef, useCallback } from "react";

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
  const r = rgbList.reduce((a, c) => a + c[0], 0) / n;
  const g = rgbList.reduce((a, c) => a + c[1], 0) / n;
  const b = rgbList.reduce((a, c) => a + c[2], 0) / n;
  const progress = totalCount ? n / totalCount : Math.min(1, (n - 1) * 0.13);
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

function renderPalette(canvas, drops, totalCount, size = S) {
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#0d0c0b";
  ctx.fillRect(0, 0, size, size);
  if (!drops.length) return;
  for (let i = 0; i < drops.length; i++) {
    const mixed = mixRgbList(drops.slice(0, i + 1).map(d => d.rgb), totalCount);
    if (!mixed) continue;
    const [r, g, b] = mixed;
    const cx = drops[i].px * size, cy = drops[i].py * size;
    const cornerDist = Math.sqrt(Math.max(cx, size - cx) ** 2 + Math.max(cy, size - cy) ** 2);
    drawInkOnWater(ctx, cx, cy, r, g, b, cornerDist * 0.55, drops[i].seed * 0.001, 0.92, size);
  }
  if (totalCount && drops.length >= totalCount) {
    ctx.fillStyle = "rgba(0,0,0,0.82)";
    ctx.fillRect(0, 0, size, size);
  }
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
      {drops.length === 0 && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "#2a2a2a", pointerEvents: "none" }}>
          완료하면 색이 퍼집니다
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// Date helpers
// ─────────────────────────────────────────────
const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const getTodayKey = () => dateKey(new Date());

// ─────────────────────────────────────────────
// localStorage persistence
// ─────────────────────────────────────────────
const LS = {
  get: (key, fallback) => {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
  },
  set: (key, val) => {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
  },
};

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
function mockHistory() { return {}; }

// ─── Onboarding ───
function OnboardingOverlay({ onDone }) {
  const [step, setStep] = useState(0);
  const steps = [
    { icon: "🎨", title: "MakeBlack", desc: "할 일을 완료할 때마다\n물감이 팔레트에 퍼져나가요" },
    { icon: "✦",  title: "색이 섞여요", desc: "여러 할 일을 완료할수록\n색이 혼합되어 검정으로 가까워져요" },
    { icon: "●",  title: "BLACK 달성", desc: "모든 할 일을 완료하면\n팔레트가 BLACK이 돼요" },
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
const C = {
  bg:      "#0a0a0a",
  surface: "#141414",
  card:    "#181818",
  border:  "#242424",
  border2: "#2e2e2e",
  text:    "#f0ece6",
  muted:   "#888888",   // was #4a4a4a — lifted for WCAG AA
  dim:     "#555555",   // was #2a2a2a — lifted for readability
  pill:    "#1e1e1e",
};
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
        width: "100%", background: "#111",
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
  const delCat = id => { setCategories(c => c.filter(x => x.id !== id)); setRoutines(r => r.filter(x => x.catId !== id)); };
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
        {/* list */}
        {categories.length === 0 && <div style={{ textAlign: "center", color: C.dim, fontSize: 13, padding: "20px 0" }}>아직 카테고리가 없어요</div>}
        {categories.map(cat => (
          <div key={cat.id} style={{
            display: "flex", alignItems: "center", gap: 12,
            padding: "13px 14px", marginBottom: 6,
            background: C.card, borderRadius: radius.md,
            border: `1px solid ${C.border}`,
          }}>
            <div style={{ width: 10, height: 10, borderRadius: "50%", background: cat.color, boxShadow: `0 0 8px ${cat.color}88`, flexShrink: 0 }} />
            <span style={{ flex: 1, color: C.text, fontSize: 14 }}>{cat.name}</span>
            <button onClick={() => delCat(cat.id)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 16, padding: 0, lineHeight: 1 }}>✕</button>
          </div>
        ))}
      </>)}

      {tab === "routines" && (<>
        <button onClick={() => setRoutineForm({ catId: categories[0]?.id, name: "", days: [], dates: [] })} style={{
          width: "100%", padding: "12px", background: C.surface,
          border: `1px dashed ${C.border2}`, borderRadius: radius.md,
          color: C.muted, cursor: "pointer", fontSize: 13,
          marginBottom: 14, fontFamily: "inherit",
        }}>+ 루틴 추가하기</button>

        {routines.map(r => {
          const cat = categories.find(c => c.id === r.catId);
          return (
            <div key={r.id} style={{ padding: "13px 14px", marginBottom: 8, background: C.card, borderRadius: radius.md, border: `1px solid ${C.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: cat?.color ?? "#888" }} />
                <span style={{ fontSize: 11, color: C.muted }}>{cat?.name}</span>
                <span style={{ flex: 1, fontSize: 14, color: C.text }}>{r.name}</span>
                <button onClick={() => setRoutineForm({...r})} style={{ background: "none", border: "none", color: C.muted, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>편집</button>
                <button onClick={() => setRoutines(rs => rs.filter(x => x.id !== r.id))} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 14, lineHeight: 1 }}>✕</button>
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                {["일","월","화","수","목","금","토"].map((d,i) => (
                  <div key={i} style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: r.days.includes(i) ? "#ede8e2" : C.surface,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, color: r.days.includes(i) ? "#080808" : C.dim,
                  }}>{d}</div>
                ))}
              </div>
            </div>
          );
        })}

        {routineForm && (
          <div style={{ marginTop: 16, background: C.surface, borderRadius: radius.lg, padding: 16, border: `1px solid ${C.border2}` }}>
            <div style={{ fontSize: 12, color: C.muted, marginBottom: 12 }}>루틴 {routineForm.id ? "편집" : "추가"}</div>
            <select value={routineForm.catId} onChange={e => setRoutineForm(f => ({...f, catId: Number(e.target.value)}))}
              style={{ width: "100%", background: C.card, border: `1px solid ${C.border2}`, borderRadius: radius.sm, padding: "10px 12px", color: C.text, fontSize: 13, marginBottom: 10, outline: "none", fontFamily: "inherit" }}>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <input value={routineForm.name} onChange={e => setRoutineForm(f => ({...f, name: e.target.value}))}
              placeholder="루틴 이름" style={{ width: "100%", boxSizing: "border-box", background: C.card, border: `1px solid ${C.border2}`, borderRadius: radius.sm, padding: "10px 12px", color: C.text, fontSize: 13, marginBottom: 12, outline: "none", fontFamily: "inherit" }} />
            <div style={{ fontSize: 11, color: C.muted, marginBottom: 8 }}>반복 요일</div>
            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
              {["일","월","화","수","목","금","토"].map((d,i) => (
                <div key={i} onClick={() => toggleDay(i)} style={{
                  flex: 1, height: 34, borderRadius: radius.sm,
                  background: routineForm.days.includes(i) ? C.text : C.card,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 12, color: routineForm.days.includes(i) ? "#080808" : C.dim,
                  cursor: "pointer", transition: "all 0.15s",
                }}>{d}</div>
              ))}
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
// Home Screen
// ─────────────────────────────────────────────
function HomeScreen({ categories, routines, paletteHistory, setPaletteHistory }) {
  // Dynamic today — refreshes at midnight
  const [todayKey, setTodayKey]         = useState(getTodayKey);
  useEffect(() => {
    const tick = () => { const nk = getTodayKey(); if (nk !== todayKey) setTodayKey(nk); };
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [todayKey]);

  const [showCatMgr,   setShowCatMgr]   = useState(false);
  const [cats, setCats]   = useState(() => LS.get("mb_cats", categories));
  const [ruts, setRuts]   = useState(() => LS.get("mb_ruts", routines));
  const [selectedDate, setSelectedDate] = useState(getTodayKey);
  const [viewMonth, setViewMonth]       = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() }; });
  const [todosByDate, setTodosByDate]   = useState(() => LS.get("mb_todos", {}));
  const [toast, setToast]               = useState(null); // { msg, undoFn }
  const [addingTo, setAddingTo]         = useState(null);
  const [newTodoText, setNewTodoText]   = useState("");
  const [animDrop, setAnimDrop]         = useState(null);
  const [canvasVer, setCanvasVer]       = useState(0);
  const [blackDone, setBlackDone]       = useState(false);
  const [usedHues, setUsedHues]         = useState([]);
  const [showCal, setShowCal]           = useState(false);
  const inputRef = useRef(null);

  const selDateObj = new Date(selectedDate + "T00:00:00");

  const getDateTodos = useCallback((dk) => {
    const base = todosByDate[dk] || {};
    const result = {};
    cats.forEach(cat => { result[cat.id] = [...(base[cat.id] || [])]; });
    ruts.forEach(rut => {
      const dow = new Date(dk + "T00:00:00").getDay();
      if (!rut.days.includes(dow) && !rut.dates.includes(dk)) return;
      const catTodos = result[rut.catId] || [];
      if (!catTodos.some(t => t.routineId === rut.id)) {
        result[rut.catId] = [{ id: `r${rut.id}-${dk}`, text: rut.name, done: false, routineId: rut.id, hue: 0, rgb: [160,160,160], color: "#888", seed: rut.id * 7 }, ...catTodos];
      }
    });
    return result;
  }, [todosByDate, cats, ruts]);

  const selTodos   = getDateTodos(selectedDate);
  const allTodos   = Object.values(selTodos).flat();
  const doneCount  = allTodos.filter(t => t.done).length;
  const totalCount = allTodos.length;
  const progress   = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;
  const isBlack    = progress === 100 && totalCount > 0;
  const histEntry  = paletteHistory[selectedDate] || { drops: [], total: 0 };
  const drops      = histEntry.drops || [];

  useEffect(() => { if (isBlack && !blackDone) setBlackDone(true); }, [isBlack]);
  useEffect(() => { setBlackDone(false); setCanvasVer(v => v + 1); }, [selectedDate]);
  useEffect(() => { LS.set("mb_cats", cats); }, [cats]);
  useEffect(() => { LS.set("mb_ruts", ruts); }, [ruts]);
  useEffect(() => { LS.set("mb_todos", todosByDate); }, [todosByDate]);
  useEffect(() => { LS.set("mb_palette", paletteHistory); }, [paletteHistory]);

  const toggleTodo = (catId, todoId) => {
    const dk = selectedDate;
    const todo = (selTodos[catId] || []).find(t => t.id === todoId);
    if (!todo) return;
    const willDone = !todo.done;
    setTodosByDate(prev => {
      const base = prev[dk] || {};
      const allCat = selTodos[catId] || [];
      const mapped = allCat.map(t => t.id === todoId ? { ...t, done: !t.done } : t);
      return { ...prev, [dk]: { ...base, [catId]: mapped } };
    });
    setPaletteHistory(prev => {
      const entry = prev[dk] || { drops: [], total: totalCount };
      if (willDone) {
        if (entry.drops.some(d => d.id === todoId)) return prev;
        const { hue, rgb, color } = generateUniqueColor(entry.drops.map(d => d.hue));
        const seed = uid() * 17;
        const drop = { id: todoId, hue, rgb, color, px: 0.12 + Math.random() * 0.76, py: 0.12 + Math.random() * 0.76, seed };
        setAnimDrop(drop); setCanvasVer(v => v + 1);
        // Undo toast
        const snapshot = { todoState: { ...prev }, paletteState: prev };
        setToast({ msg: `"${todo.text}" 완료!`, undoFn: () => {
          setTodosByDate(s => { const b = s[dk]||{}; const mapped2 = (selTodos[catId]||[]).map(t => t.id===todoId?{...t,done:false}:t); return {...s,[dk]:{...b,[catId]:mapped2}}; });
          setPaletteHistory(p => { const e2 = p[dk]||{drops:[]}; return {...p,[dk]:{...e2,drops:e2.drops.filter(d=>d.id!==todoId)}}; });
          setCanvasVer(v => v + 1);
        }});
        return { ...prev, [dk]: { drops: [...entry.drops, drop], total: totalCount } };
      } else {
        setCanvasVer(v => v + 1); setBlackDone(false);
        return { ...prev, [dk]: { ...entry, drops: entry.drops.filter(d => d.id !== todoId) } };
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
      const entry = prev[selectedDate] || { drops: [] };
      return { ...prev, [selectedDate]: { ...entry, drops: entry.drops.filter(d => d.id !== todoId) } };
    });
    setCanvasVer(v => v + 1);
  };

  // Calendar — driven by viewMonth, independent of selectedDate
  const calYear     = viewMonth.y;
  const calMonth    = viewMonth.m;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDow    = new Date(calYear, calMonth, 1).getDay();
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
    <div style={{ height: "100dvh", background: C.bg, color: C.text, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── BLACK overlay ── */}
      {blackDone && (
        <div onClick={() => setBlackDone(false)} style={{ position: "fixed", inset: 0, zIndex: 300, background: "rgba(0,0,0,0.97)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", animation: "fadeIn 1.2s ease", cursor: "pointer" }}>
          <div style={{ fontSize: 88, lineHeight: 1, animation: "pulse 2.8s ease-in-out infinite" }}>●</div>
          <div style={{ fontSize: 28, letterSpacing: "0.55em", color: "#fff", fontWeight: 200, marginTop: 28 }}>BLACK</div>
          <div style={{ fontSize: 12, color: "#383838", marginTop: 14, letterSpacing: "0.12em" }}>모든 색이 하나가 됐어요</div>
          <div style={{ fontSize: 10, color: "#1c1c1c", marginTop: 56 }}>tap to close</div>
        </div>
      )}

      {/* ── Calendar sheet ── */}
      {showCal && (
        <div style={{ position: "fixed", inset: 0, zIndex: 150, background: "rgba(0,0,0,0.65)", backdropFilter: "blur(10px)" }} onClick={() => setShowCal(false)}>
          <div onClick={e => e.stopPropagation()} style={{ position: "absolute", top: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 480, background: "#111", borderRadius: "0 0 28px 28px", padding: "20px 18px 28px", animation: "slideDown 0.22s ease" }}>
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
                const prog  = hist?.total > 0 ? (hist.drops?.length||0) / hist.total : 0;
                const isDone = prog >= 1 && hist?.total > 0;
                return (
                  <div key={day} onClick={() => { setSelectedDate(dk); setShowCal(false); }} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2, cursor: "pointer", padding: "3px 1px", borderRadius: radius.sm, background: isSel ? "#222" : "transparent", transition: "background 0.15s" }}>
                    <div style={{ position: "relative", width: 30, height: 30 }}>
                      {hist?.drops?.length > 0
                        ? <>
                            <CalendarPalette drops={hist.drops} totalCount={hist.total} size={30} />
                            <div style={{ position: "absolute", inset: 0, borderRadius: "50%",
                              background: isDone ? "rgba(0,0,0,0.45)" : `rgba(0,0,0,${0.5 - prog*0.5})`,
                              border: isDone ? "1.5px solid rgba(255,255,255,0.5)" : "none",
                              pointerEvents: "none" }} />
                          </>
                        : <div style={{ width: 30, height: 30, borderRadius: "50%",
                            background: isTod ? "#1a1a1a" : "transparent",
                            border: isTod ? `1px solid ${C.border2}` : isSel ? `1px solid #444` : "none",
                            display: "flex", alignItems: "center", justifyContent: "center" }}>
                            {isTod && <div style={{ width: 4, height: 4, borderRadius: "50%", background: C.dim }} />}
                          </div>
                      }
                    </div>
                    <span style={{ fontSize: 9, color: dow===0?"#ff7070":dow===6?"#7090ff":isSel?C.text:"#3a3a3a", fontWeight: isTod?700:400 }}>{day}</span>
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
          {/* 날짜 + 이전/다음 화살표 */}
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => goDay(-1)} style={{ width: 26, height: 26, borderRadius: "50%", background: C.surface, border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>‹</button>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 9, color: C.dim, letterSpacing: "0.3em", textTransform: "uppercase" }}>makeblack</div>
              <div style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-0.02em", color: C.text, marginTop: 1, whiteSpace: "nowrap" }}>
                {isToday ? "오늘" : selDateObj.toLocaleDateString("ko-KR", { month: "long", day: "numeric" })}
                <span style={{ fontSize: 10, color: C.dim, marginLeft: 5, fontWeight: 400 }}>{calYear}.{String(calMonth+1).padStart(2,"0")}</span>
              </div>
            </div>
            <button onClick={() => goDay(1)} style={{ width: 26, height: 26, borderRadius: "50%", background: C.surface, border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>›</button>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            {/* 진행률 pill */}
            <div style={{ padding: "5px 11px", borderRadius: radius.full, background: C.surface, border: `1px solid ${C.border}`, fontSize: 11, fontWeight: 600, color: isBlack ? "#aaa" : mixedCss || C.dim, letterSpacing: "-0.01em" }}>
              {isBlack ? "●" : totalCount > 0 ? `${progress}%` : "—"}
            </div>
            <button onClick={() => setShowCal(true)} style={{ height: 28, padding: "0 11px", borderRadius: radius.full, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>캘린더</button>
            <button onClick={() => setShowCatMgr(true)} style={{ height: 28, padding: "0 11px", borderRadius: radius.full, background: C.surface, border: `1px solid ${C.border}`, color: C.muted, cursor: "pointer", fontSize: 11, fontFamily: "inherit" }}>카테고리</button>
          </div>
        </div>

        {/* 팔레트 캔버스 */}
        <div style={{ width: "min(52vw, 200px)", aspectRatio: "1", borderRadius: radius.lg, overflow: "hidden", border: `1px solid ${C.border}`, position: "relative", margin: "0 auto" }}>
          <PaletteCanvas drops={drops} version={canvasVer} totalCount={totalCount} animDrop={animDrop} onAnimDone={() => setAnimDrop(null)} />
          {drops.length === 0 && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", pointerEvents: "none" }}>
              <div style={{ fontSize: 11, color: "#1e1e1e", letterSpacing: "0.12em" }}>완료하면 색이 피어나요</div>
            </div>
          )}
        </div>

        {/* 그라데이션 프로그레스바 */}
        <div style={{ margin: "10px auto 0", width: "min(52vw, 200px)" }}>
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
            {drops.map(d => (
              <div key={d.id} style={{ width: 8, height: 8, borderRadius: "50%", background: d.color, boxShadow: `0 0 4px ${d.color}66`, flexShrink: 0 }} />
            ))}
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
        {/* Toast */}
        {toast && (
          <div style={{ position: "fixed", bottom: 82, left: "50%", transform: "translateX(-50%)", zIndex: 250, background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: radius.full, padding: "10px 16px", display: "flex", alignItems: "center", gap: 12, boxShadow: "0 4px 24px rgba(0,0,0,0.6)", animation: "fadeIn 0.2s ease", whiteSpace: "nowrap" }}>
            <span style={{ fontSize: 12, color: "#d0ccc6" }}>{toast.msg}</span>
            <button onClick={() => { toast.undoFn(); setToast(null); }} style={{ fontSize: 11, color: "#6c8fff", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", fontWeight: 600 }}>실행 취소</button>
          </div>
        )}

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
                {todos.map(todo => (
                  <div key={todo.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 13px", background: todo.done ? "transparent" : C.card, borderRadius: radius.md, border: `1px solid ${todo.done ? C.border : C.border2}`, opacity: todo.done ? 0.42 : 1, transition: "all 0.25s" }}>
                    <div onClick={() => toggleTodo(cat.id, todo.id)} style={{ width: 20, height: 20, borderRadius: "50%", flexShrink: 0, cursor: "pointer", border: `2px solid ${todo.done ? todo.color : C.border2}`, background: todo.done ? todo.color : "transparent", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>
                      {todo.done && <span style={{ color: "#080808", fontSize: 10, fontWeight: 800 }}>✓</span>}
                    </div>
                    <span style={{ flex: 1, fontSize: 13, color: todo.done ? C.muted : C.text, textDecoration: todo.done ? "line-through" : "none", transition: "all 0.2s" }}>{todo.text}</span>
                    {todo.routineId && <span style={{ fontSize: 9, color: C.dim, background: C.surface, padding: "2px 6px", borderRadius: 4 }}>루틴</span>}
                    {!todo.routineId && (
                      <button onClick={() => deleteTodo(cat.id, todo.id)} style={{ background: "none", border: "none", color: C.dim, cursor: "pointer", fontSize: 14, padding: 0, lineHeight: 1 }}>✕</button>
                    )}
                  </div>
                ))}
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
    { key: "friends", icon: "◈",  label: "친구"      },
    { key: "mypage",  icon: "◉",  label: "마이페이지" },
  ];
  return (
    <div style={{
      position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)",
      width: "100%", maxWidth: 480,
      background: "rgba(10,10,10,0.88)", backdropFilter: "blur(16px)",
      borderTop: `1px solid ${C.border}`,
      display: "flex", height: 68, zIndex: 100,
    }}>
      {items.map(it => {
        const active = tab === it.key;
        return (
          <button key={it.key} onClick={() => setTab(it.key)} style={{
            flex: 1, background: "none", border: "none", cursor: "pointer",
            display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          }}>
            <span style={{ fontSize: 20, color: active ? C.text : "#2a2a2a", transition: "color 0.18s" }}>{it.icon}</span>
            <span style={{ fontSize: 9, color: active ? C.text : "#2a2a2a", letterSpacing: "0.04em", transition: "color 0.18s" }}>{it.label}</span>
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
  const [showOnboarding, setShowOnboarding] = useState(() => !LS.get("mb_onboarded", false));
  const [categories]                        = useState(() => LS.get("mb_cats", DEFAULT_CATEGORIES));
  const [routines]                          = useState(() => LS.get("mb_ruts", DEFAULT_ROUTINES));
  const [paletteHistory, setPaletteHistory] = useState(() => LS.get("mb_palette", {}));

  return (
    <div style={{ maxWidth: 480, margin: "0 auto", position: "relative", minHeight: "100vh", background: C.bg }}>
      {showOnboarding && <OnboardingOverlay onDone={() => { LS.set("mb_onboarded", true); setShowOnboarding(false); }} />}
      {!showOnboarding && tab === "home"    && <HomeScreen categories={categories} routines={routines} paletteHistory={paletteHistory} setPaletteHistory={setPaletteHistory} />}
      {tab === "search"  && <PlaceholderScreen label="검색" icon="◎" />}
      {tab === "friends" && <PlaceholderScreen label="친구" icon="◈" />}
      {tab === "mypage"  && <PlaceholderScreen label="마이페이지" icon="◉" />}
      <BottomNav tab={tab} setTab={setTab} />
      <style>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideDown { from { transform: translateX(-50%) translateY(-100%) } to { transform: translateX(-50%) translateY(0) } }
        @keyframes pulse  { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(1.08)} }
        input::placeholder { color: #2a2a2a; }
        select option { background: #111; }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { width: 0; }
      `}</style>
    </div>
  );
}