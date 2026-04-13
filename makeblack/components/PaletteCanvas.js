/**
 * PaletteCanvas
 * WebView 기반 잉크-온-워터 팔레트 캔버스
 * makeblack.jsx의 drawInkOnWater 알고리즘 그대로 추출
 *
 * props:
 *   drops      — [{ id, rgb:[r,g,b], px, py, seed, hue, color }]
 *   totalCount — 전체 할일 수 (BLACK 오버레이 판단)
 *   size       — 캔버스 크기 (px, 정사각형)
 *   animDrop   — 단일 drop 애니메이션 트리거 (변경 시 실행)
 *   onAnimDone — 애니메이션 완료 콜백
 *   style      — View 추가 스타일
 */
import { useRef, useEffect } from 'react';
import { View } from 'react-native';
import WebView from 'react-native-webview';

// ─── WebView 내부 HTML ───────────────────────────────────
// makeblack.jsx smoothNoise / drawInkOnWater / renderPalette 그대로 추출
const HTML_CONTENT = `<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<style>
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:100%;height:100%;overflow:hidden;background:#0d0c0b}
canvas{position:absolute;top:0;left:0;width:100%;height:100%}
</style>
</head>
<body>
<canvas id="s"></canvas>
<canvas id="a"></canvas>
<script>
// ── 정적 레이어(s) + 애니메이션 레이어(a) ──
const sc  = document.getElementById('s');
const ac  = document.getElementById('a');
const ctx  = sc.getContext('2d', { willReadFrequently: true });
const actx = ac.getContext('2d', { willReadFrequently: true });
const S = 300;
sc.width = S; sc.height = S;
ac.width = S; ac.height = S;

// ── smoothNoise (makeblack.jsx 동일) ──
function smoothNoise(angle, seed, octaves) {
  octaves = octaves || 4;
  let v = 0, amp = 1, total = 0;
  for (let o = 0; o < octaves; o++) {
    v += Math.sin(angle * Math.pow(2, o) + seed * (o + 1) * 1.618) * amp;
    total += amp; amp *= 0.5;
  }
  return v / total;
}

// ── drawInkOnWater (makeblack.jsx 동일) ──
function drawInkOnWater(c, cx, cy, r, g, b, radius, seed, opacity) {
  const pad  = Math.ceil(radius * 1.35);
  const x0   = Math.max(0, Math.floor(cx - pad));
  const y0   = Math.max(0, Math.floor(cy - pad));
  const x1   = Math.min(S, Math.ceil(cx + pad));
  const y1   = Math.min(S, Math.ceil(cy + pad));
  const w = x1 - x0, h = y1 - y0;
  if (w <= 0 || h <= 0) return;
  const img  = c.getImageData(x0, y0, w, h);
  const data = img.data;
  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const dx = (x0 + px) - cx, dy = (y0 + py) - cy;
      const dist  = Math.sqrt(dx * dx + dy * dy);
      const angle = Math.atan2(dy, dx);
      const en1   = smoothNoise(angle, seed, 3) * radius * 0.12;
      const en2   = smoothNoise(angle, seed + 5.3, 2) * radius * 0.06;
      const r_edge = radius + en1 + en2;
      const nd    = dist / r_edge;
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
  c.putImageData(img, x0, y0);
}

// ── RGB 파싱 헬퍼 (hsl/hex/array 지원) ──
function hsl2rgb(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const aa = s * Math.min(l, 1 - l);
  const f  = n => l - aa * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
function getRgb(drop) {
  if (drop.rgb && drop.rgb.length === 3) return drop.rgb;
  const c = drop.color || '';
  if (c.startsWith('#')) {
    const h = c.replace('#', '');
    return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
  }
  const m = c.match(/[\\d.]+/g);
  if (m && m.length >= 3) return hsl2rgb(+m[0], +m[1], +m[2]);
  return [128, 128, 128];
}

// ── renderPalette — 증분 렌더링 캐시 ──
let cachedDropCount = 0;

function renderFull(drops, total) {
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = '#0d0c0b';
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < drops.length; i++) {
    const d = drops[i];
    const [r, g, b] = getRgb(d);
    const cx = (d.px || 0.5) * S, cy = (d.py || 0.5) * S;
    const cornerDist = Math.sqrt(Math.max(cx, S - cx) ** 2 + Math.max(cy, S - cy) ** 2);
    drawInkOnWater(ctx, cx, cy, r, g, b, cornerDist * 0.42, (d.seed || 1) * 0.001, 0.92);
  }
  // BLACK 오버레이 (makeblack.jsx 동일)
  if (total > 0 && drops.length >= total) {
    ctx.fillStyle = 'rgba(0,0,0,0.82)';
    ctx.fillRect(0, 0, S, S);
  }
  cachedDropCount = drops.length;
}

// ── animDrop — 애니메이션 레이어 (FRAMES=45, maxR=0.42) ──
let raf = null;
function animateDrop(drop) {
  if (raf) cancelAnimationFrame(raf);
  const [r, g, b] = getRgb(drop);
  const cx = (drop.px || 0.5) * S, cy = (drop.py || 0.5) * S;
  const seed = (drop.seed || 1) * 0.001;
  const cornerDist = Math.sqrt(Math.max(cx, S - cx) ** 2 + Math.max(cy, S - cy) ** 2);
  const maxR = cornerDist * 0.42;
  let frame = 0;
  const FRAMES = 45;

  function draw() {
    actx.clearRect(0, 0, S, S);
    const t = frame / FRAMES;
    const eExpand = 1 - Math.pow(1 - Math.min(t * 1.15, 1), 3.5);
    const eFade   = t < 0.52 ? 1 : Math.max(0, 1 - (t - 0.52) / 0.48);
    if (eFade <= 0) {
      actx.clearRect(0, 0, S, S);
      // RN으로 완료 신호 전송
      try { window.ReactNativeWebView.postMessage('animDone'); } catch(e) {}
      return;
    }
    const curR = eExpand * maxR;
    if (curR > 2) drawInkOnWater(actx, cx, cy, r, g, b, curR, seed, eFade * 0.85);
    frame++;
    if (frame <= FRAMES) {
      raf = requestAnimationFrame(draw);
    } else {
      actx.clearRect(0, 0, S, S);
      try { window.ReactNativeWebView.postMessage('animDone'); } catch(e) {}
    }
  }
  raf = requestAnimationFrame(draw);
}

// ── postMessage 수신 ──
function handleMessage(e) {
  try {
    const d = JSON.parse(e.data);
    if (d.type === 'render') {
      const drops = d.drops || [];
      const total = d.totalCount || 0;
      const needFull = d.forceRedraw || drops.length < cachedDropCount || cachedDropCount === 0;
      if (needFull) {
        renderFull(drops, total);
      } else if (drops.length > cachedDropCount) {
        // 증분: 새 drop만 추가
        for (let i = cachedDropCount; i < drops.length; i++) {
          const drop = drops[i];
          const [r, g, b] = getRgb(drop);
          const cx = (drop.px || 0.5) * S, cy = (drop.py || 0.5) * S;
          const cornerDist = Math.sqrt(Math.max(cx, S - cx) ** 2 + Math.max(cy, S - cy) ** 2);
          drawInkOnWater(ctx, cx, cy, r, g, b, cornerDist * 0.42, (drop.seed || 1) * 0.001, 0.92);
        }
        if (total > 0 && drops.length >= total) {
          ctx.fillStyle = 'rgba(0,0,0,0.82)';
          ctx.fillRect(0, 0, S, S);
        }
        cachedDropCount = drops.length;
      }
    } else if (d.type === 'animDrop') {
      animateDrop(d.drop);
    }
  } catch (err) {}
}

document.addEventListener('message', handleMessage);
window.addEventListener('message', handleMessage);

// 초기 배경
ctx.fillStyle = '#0d0c0b';
ctx.fillRect(0, 0, S, S);
</script>
</body>
</html>`;

// ─── RN 컴포넌트 ────────────────────────────────────────
export default function PaletteCanvas({
  drops      = [],
  totalCount = 0,
  size       = 200,
  animDrop   = null,
  onAnimDone = null,
  style,
}) {
  const webviewRef      = useRef(null);
  const prevDropCount   = useRef(0);
  const mountedRef      = useRef(false);

  const send = (data) => {
    if (!webviewRef.current) return;
    webviewRef.current.postMessage(JSON.stringify(data));
  };

  // 마운트 후 초기 렌더
  const onLoad = () => {
    mountedRef.current = true;
    send({ type: 'render', drops, totalCount, forceRedraw: true });
    prevDropCount.current = drops.length;
  };

  // drops / totalCount 변경 시 렌더
  useEffect(() => {
    if (!mountedRef.current) return;
    const forceRedraw = drops.length < prevDropCount.current;
    send({ type: 'render', drops, totalCount, forceRedraw });
    prevDropCount.current = drops.length;
  }, [drops, totalCount]);

  // animDrop 변경 시 애니메이션 트리거
  useEffect(() => {
    if (!animDrop || !mountedRef.current) return;
    send({ type: 'animDrop', drop: animDrop });
  }, [animDrop]);

  // WebView → RN 메시지 수신 (animDone)
  const onMessage = (e) => {
    if (e.nativeEvent.data === 'animDone' && onAnimDone) {
      onAnimDone();
    }
  };

  return (
    <View style={[{
      width:           size,
      height:          size,
      borderRadius:    22,
      overflow:        'hidden',
      borderWidth:     1,
      borderColor:     '#242424',
      backgroundColor: '#0d0c0b',
    }, style]}>
      <WebView
        ref={webviewRef}
        source={{ html: HTML_CONTENT, baseUrl: 'http://localhost' }}
        style={{ width: size, height: size, backgroundColor: '#0d0c0b' }}
        onLoad={onLoad}
        onMessage={onMessage}
        scrollEnabled={false}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        originWhitelist={['about:*', 'blob:*']}
        allowFileAccess={false}
        allowUniversalAccessFromFileURLs={false}
        mixedContentMode="never"
        androidLayerType="software"
      />
    </View>
  );
}
