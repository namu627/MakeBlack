/**
 * HomeScreen — index.js
 * makeblack.jsx HomeScreen을 React Native로 재작성
 *
 * 섹션:
 *   1) imports / state 선언 / useEffect (데이터 로딩)  ← 현재
 *   2) toggleTodo / addTodo / deleteTodo / 팔레트 drop 로직
 *   3) 날짜 헤더 + 카테고리/할일 렌더링
 *   4) 팔레트 캔버스 + 캘린더 시트
 *   5) BLACK 달성 오버레이 + FlyingOrb + 전체 return
 */

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, Alert, Animated, Dimensions, Platform,
  Modal, FlatList, KeyboardAvoidingView, Pressable,
} from 'react-native';
import DraggableFlatList, { ScaleDecorator } from 'react-native-draggable-flatlist';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import {
  generateUniqueColor, hslToRgb,
  mixRgbList, rgbToHsl, getTodayKey, dateKey, addDays,
} from '../../lib/colorMath';
import {
  fetchCategories, createCategory, deleteCategory,
  fetchTodos, createTodo,
  toggleTodo as toggleTodoSvc, deleteTodo as deleteTodoSvc,
  updateTodoText, fetchPaletteHistory, upsertPaletteHistory,
} from '../../lib/todoService';
import PaletteCanvas from '../../components/PaletteCanvas';
import FlyingOrb from '../../components/FlyingOrb';
import { THEMES, radius, CAT_COLORS } from '../../constants/theme';

const { width: SW, height: SH } = Dimensions.get('window');

// ── 색상 토큰 (다크 고정 — 추후 settings 연결) ──────────
const C = THEMES.dark;
const R = radius;

// ─────────────────────────────────────────────────────
// catColorToDrop — makeblack.jsx 루틴 todo 색상 로직에서 추출
// catColor: hex(#rrggbb) 또는 hsl() 문자열
// → { hue, rgb:[r,g,b], color } — 팔레트 drop에 바로 사용
// ─────────────────────────────────────────────────────
function catColorToDrop(catColor, fallbackHue = 200) {
  try {
    if (catColor && catColor.startsWith('#')) {
      const hex = catColor.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const [h] = rgbToHsl(r, g, b);
      const rgb = hslToRgb(h, 82, 54);
      return { hue: h, rgb, color: `hsl(${Math.round(h)},82%,54%)` };
    }
    if (catColor && catColor.startsWith('hsl')) {
      const m = catColor.match(/[\d.]+/g);
      if (m && m.length >= 3) {
        const h = Number(m[0]);
        const rgb = hslToRgb(h, 82, 54);
        return { hue: h, rgb, color: `hsl(${Math.round(h)},82%,54%)` };
      }
    }
  } catch (_) {}
  const rgb = hslToRgb(fallbackHue, 82, 54);
  return { hue: fallbackHue, rgb, color: `hsl(${Math.round(fallbackHue)},82%,54%)` };
}

// ── 팔레트 크기 계산 ───────────────────────────────────
function getPaletteSize(sizeKey) {
  if (sizeKey === 'small') return Math.min(SW * 0.38, 140);
  if (sizeKey === 'large') return Math.min(SW * 0.66, 260);
  return Math.min(SW * 0.52, 200);
}

// ─────────────────────────────────────────────────────
// HomeScreen
// ─────────────────────────────────────────────────────
export default function HomeScreen() {

  // ── Safe Area ────────────────────────────────────────
  const insets = useSafeAreaInsets();

  // ── 사용자 ──────────────────────────────────────────
  const [userId, setUserId] = useState(null);

  // ── 날짜 ────────────────────────────────────────────
  const [todayKey_state, setTodayKey_state] = useState(getTodayKey());
  const [selectedDate, setSelectedDate]     = useState(getTodayKey());
  const [viewMonth, setViewMonth]           = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // ── 데이터 ──────────────────────────────────────────
  const [categories, setCategories]       = useState([]);
  const [todos, setTodos]                 = useState([]);
  const [paletteDrops, setPaletteDrops]   = useState([]);
  const [paletteHistory, setPaletteHistory] = useState({}); // date → { drops, total }
  const [loading, setLoading]             = useState(true);

  // ── 팔레트 / 색상 ────────────────────────────────────
  const [animDrop, setAnimDrop]     = useState(null);
  const [canvasVer, setCanvasVer]   = useState(0);
  const [usedHues, setUsedHues]     = useState([]);

  // ── 입력 ─────────────────────────────────────────────
  const [addingCatId, setAddingCatId]   = useState(null);
  const [newTodoText, setNewTodoText]   = useState('');
  const [editingId, setEditingId]       = useState(null);
  const [editingText, setEditingText]   = useState('');
  const inputRef     = useRef(null);
  const editInputRef = useRef(null);

  // ── 카테고리 모달 ─────────────────────────────────────
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName]     = useState('');
  const [newCatColor, setNewCatColor]   = useState(CAT_COLORS[0]);
  const [confirmDelCat, setConfirmDelCat] = useState(null);

  // ── 캘린더 ───────────────────────────────────────────
  const [showCal, setShowCal]       = useState(false);
  const [calClosing, setCalClosing] = useState(false);
  const calTransY = useRef(new Animated.Value(-SH * 0.5)).current;

  // 캘린더 셀 ref — isSel 표시용 (측정에는 미사용)
  const targetCellRef = useRef(null);

  // ── getTargetCellPos — measureInWindow 없이 수학으로 셀 중심 계산 ──
  const getTargetCellPos = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const firstDay  = new Date(y, m - 1, 1).getDay(); // 0=일
    const cellIndex = firstDay + d - 1;
    const col = cellIndex % 7;
    const row = Math.floor(cellIndex / 7);

    const cellW = (SW - 36) / 7;  // paddingHorizontal 18×2 = 36
    const cellH = 50;              // paddingVertical(6) + circle(30) + gap(2) + dayNum(12)
    const ROW_GAP = 3;             // calGrid rowGap

    // calSheet 상단 Y: 상태바 + calSheet paddingTop
    const sheetTop = insets.top + 20;
    // 헤더 높이: calHeader(NavBtn 34 + marginBottom 16) + calDowRow(~14 + marginBottom 6)
    const headerH = 70;

    const cellX = 18 + col * cellW + cellW / 2;
    const cellY = sheetTop + headerH + row * (cellH + ROW_GAP) + cellH / 2;

    return { x: cellX, y: cellY };
  };

  // ── BLACK 달성 ────────────────────────────────────────
  const [blackPhase, setBlackPhase] = useState(null); // null | 'in' | 'text' | 'orb' | 'stamp'
  const blackFadeAnim  = useRef(new Animated.Value(0)).current;
  const blackTextAnim  = useRef(new Animated.Value(0)).current;
  const blackScaleAnim = useRef(new Animated.Value(1.04)).current;
  const blackOrbAnim   = useRef(new Animated.Value(1)).current; // 1=white, 0=black
  const blackPulseAnim = useRef(new Animated.Value(1)).current;
  const blackTimer     = useRef(null);
  const prevIsBlack    = useRef(false);
  const pulseLoop      = useRef(null);

  // ── Flying Orb ───────────────────────────────────────
  const [flyOrb, setFlyOrb] = useState(null); // { sx, sy, tx, ty }

  // ── 스탬프 애니메이션 ─────────────────────────────────
  const [stampDate, setStampDate] = useState(null);
  const stampScale   = useRef(new Animated.Value(2.4)).current;
  const stampOpacity = useRef(new Animated.Value(0)).current;
  const rippleScale  = useRef(new Animated.Value(1)).current;
  const rippleOpacity = useRef(new Animated.Value(0.6)).current;

  // ── 팔레트 설정 ──────────────────────────────────────
  const paletteSize = 'medium'; // TODO: settings 연결
  const PALETTE_SIZE = getPaletteSize(paletteSize);

  // ── 파생값 ───────────────────────────────────────────
  const doneCount  = todos.filter(t => t.done).length;
  const totalCount = todos.length;
  const progress   = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;
  const isBlack    = progress === 100 && totalCount > 0;
  const isToday    = selectedDate === todayKey_state;

  const selDateObj = new Date(selectedDate + 'T00:00:00');

  // 혼합 RGB 계산
  const mixedRgb = useMemo(
    () => mixRgbList(paletteDrops.map(d => d.rgb), totalCount),
    [paletteDrops, totalCount],
  );
  const mixedHsl = mixedRgb ? rgbToHsl(...mixedRgb) : null;
  const mixedCss = mixedHsl
    ? `hsl(${mixedHsl[0] | 0},${mixedHsl[1] | 0}%,${mixedHsl[2] | 0}%)`
    : null;

  // 그라데이션 프로그레스바 색상
  const progressColor = (() => {
    if (paletteDrops.length === 0) return C.border;
    if (paletteDrops.length === 1) return paletteDrops[0].color;
    return paletteDrops[0].color; // LinearGradient는 5단계에서 처리
  })();

  // 캘린더 월 계산
  const calYear     = viewMonth.y;
  const calMonth    = viewMonth.m;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const rawDow1     = new Date(calYear, calMonth, 1).getDay();
  const firstDow    = rawDow1; // 일요일 시작 고정
  const monthName   = new Date(calYear, calMonth, 1)
    .toLocaleString('ko-KR', { month: 'long' });

  // ─────────────────────────────────────────────────────
  // Effects
  // ─────────────────────────────────────────────────────

  // 자정 날짜 자동 갱신
  useEffect(() => {
    const tick = () => {
      const nk = getTodayKey();
      if (nk !== todayKey_state) setTodayKey_state(nk);
    };
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [todayKey_state]);

  // 세션 로드
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id);
    });
  }, []);

  // 날짜 변경 시 usedHues / BLACK 상태 초기화
  useEffect(() => {
    setUsedHues([]);
    setBlackPhase(null);
    clearTimeout(blackTimer.current);
    prevIsBlack.current = false;
    setAnimDrop(null);
    setCanvasVer(v => v + 1);
  }, [selectedDate]);

  // 날짜 / userId 변경 시 데이터 로드
  useEffect(() => {
    if (!userId) return;
    loadData();
  }, [userId, selectedDate]);

  // 월 변경 시 월별 히스토리 로드
  useEffect(() => {
    if (!userId) return;
    loadMonthHistory(viewMonth.y, viewMonth.m);
  }, [viewMonth, userId]);

  // 캘린더 열기 애니메이션 + spring 완료 시 셀 좌표 캐싱
  useEffect(() => {
    if (showCal) {
      calTransY.setValue(-SH * 0.5);
      Animated.spring(calTransY, {
        toValue: 0, damping: 20, stiffness: 200, useNativeDriver: true,
      }).start();
    }
  }, [showCal]);

  // ─────────────────────────────────────────────────────
  // 데이터 로딩
  // ─────────────────────────────────────────────────────

  const loadData = async () => {
    setLoading(true);
    try {
      const [cats, todosData, palette] = await Promise.all([
        fetchCategories(userId),
        fetchTodos(userId, selectedDate),
        fetchPaletteHistory(userId, selectedDate),
      ]);
      setCategories(cats);
      setTodos(todosData);
      const drops = palette.drops ?? [];
      setPaletteDrops(drops);
      // 기존 drops의 hue 동기화 (usedHues)
      setUsedHues(drops.map(d => d.hue).filter(h => h != null));
      // 오늘 날짜의 팔레트 히스토리도 업데이트
      if (palette.drops) {
        setPaletteHistory(prev => ({
          ...prev,
          [selectedDate]: { drops: palette.drops, total: palette.total ?? 0 },
        }));
      }
    } catch (e) {
      Alert.alert('오류', '데이터를 불러오지 못했어요');
    } finally {
      setLoading(false);
    }
  };

  const loadMonthHistory = async (y, m) => {
    if (!userId) return;
    try {
      const startDate = `${y}-${String(m + 1).padStart(2, '0')}-01`;
      const lastDay   = new Date(y, m + 1, 0).getDate();
      const endDate   = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      const { data, error } = await supabase
        .from('palette_history')
        .select('date, drops, total')
        .eq('user_id', userId)
        .gte('date', startDate)
        .lte('date', endDate);
      if (error) throw error;
      const histMap = {};
      (data || []).forEach(row => {
        histMap[row.date] = { drops: row.drops ?? [], total: row.total ?? 0 };
      });
      setPaletteHistory(prev => ({ ...prev, ...histMap }));
    } catch (_) {
      // 히스토리 로드 실패 — UI에 영향 없음
    }
  };

  // ─────────────────────────────────────────────────────
  // 날짜 이동
  // ─────────────────────────────────────────────────────
  const goDay = (delta) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    const dk = dateKey(d);
    setSelectedDate(dk);
    setViewMonth({ y: d.getFullYear(), m: d.getMonth() });
  };

  const goMonth = (delta) => {
    setViewMonth(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  };

  const closeCalendar = (cb) => {
    setCalClosing(true);
    Animated.timing(calTransY, {
      toValue: -SH * 0.5, duration: 220,
      easing: t => t * (2 - t), useNativeDriver: true,
    }).start(() => {
      setShowCal(false);
      setCalClosing(false);
      if (cb) cb();
    });
  };

  // ─────────────────────────────────────────────────────
  // 2단계 ▼ toggleTodo / addTodo / deleteTodo / saveEdit
  // ─────────────────────────────────────────────────────

  /**
   * toggleTodo
   * ① 낙관적 업데이트 (로컬 state 먼저)
   * ② 완료: drop 생성 → setPaletteDrops → animDrop 트리거
   *    취소: drop 제거 → BLACK 초기화
   * ③ Supabase todos / palette_history 동기화
   * ④ 실패 시 롤백
   */
  const handleToggleTodo = async (todo, catColor) => {
    if (!userId) return;
    const willDone = !todo.done;
    const dk = selectedDate;

    // ── ① 낙관적 로컬 업데이트 ──
    const prevTodos = todos;
    const prevDrops = paletteDrops;
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, done: willDone } : t));

    let newDrops = [...paletteDrops];
    let newAnimDrop = null;

    if (willDone) {
      // 중복 방지
      if (!newDrops.some(d => d.id === todo.id)) {
        // todo에 저장된 색 사용, 없으면 catColorToDrop fallback
        const colorData =
          todo.hue != null && todo.rgb && todo.rgb.length === 3
            ? { hue: todo.hue, rgb: todo.rgb, color: todo.color }
            : catColorToDrop(catColor, 200);

        const seed = todo.seed || Math.random() * 99999;
        const px   = 0.12 + Math.random() * 0.76;
        const py   = 0.12 + Math.random() * 0.76;
        const drop = { id: todo.id, ...colorData, px, py, seed };

        newDrops    = [...newDrops, drop];
        newAnimDrop = drop;
      }
    } else {
      // 완료 취소 → drop 제거 + BLACK 초기화
      newDrops = newDrops.filter(d => d.id !== todo.id);
      blackShownDates.current.delete(`${selectedDate}:${totalCount}`);
      setBlackPhase(null);
      clearTimeout(blackTimer.current);
      prevIsBlack.current = false;
    }

    const newTotal = todos.length; // 전체 할일 수는 불변
    // isLast: 이번 toggle로 마지막 할일이 완료되는 순간
    const newDone = willDone
      ? todos.filter(t => t.done).length + 1
      : todos.filter(t => t.done).length - 1;
    const isLast = willDone && newDone === newTotal && newTotal > 0;

    setPaletteDrops(newDrops);
    setCanvasVer(v => v + 1);

    // animDrop 트리거 (PaletteCanvas에 postMessage)
    if (newAnimDrop) {
      setAnimDrop(null); // 먼저 null로 flush
      setTimeout(() => setAnimDrop({ ...newAnimDrop, isLast }), 0);
    }

    // ── ② Supabase 동기화 (백그라운드) ──
    try {
      await toggleTodoSvc(todo.id, willDone);
      await upsertPaletteHistory(userId, dk, newDrops, newTotal);
      // 캘린더 히스토리 업데이트
      setPaletteHistory(prev => ({
        ...prev,
        [dk]: { drops: newDrops, total: newTotal },
      }));
    } catch (_) {
      // ── ③ 롤백 ──
      setTodos(prevTodos);
      setPaletteDrops(prevDrops);
      setAnimDrop(null);
      Alert.alert('오류', '업데이트에 실패했어요');
    }
  };

  /**
   * addTodo
   * ① usedHues 기반 generateUniqueColor (카테고리 무관 고유색)
   * ② 낙관적 로컬 추가 (임시 id) → Supabase INSERT → 실제 id로 교체
   */
  const handleAddTodo = async (catId, catColor) => {
    const text = newTodoText.trim();
    if (!text) { setAddingCatId(null); return; }
    if (!userId) return;

    // 색상 생성 — usedHues 중복 28도 이상 차이 보장
    const { hue, rgb, color } = generateUniqueColor(usedHues);
    const seed = (Math.floor(Math.random() * 99999) + 1) * 31;

    // 낙관적 추가
    const tempId  = `temp_${Date.now()}`;
    const newTodo = {
      id: tempId, user_id: userId,
      cat_id: catId, date: selectedDate,
      text, done: false,
      hue, rgb, color, seed,
      categories: { name: '', color: catColor },
    };
    setTodos(prev => [...prev, newTodo]);
    setUsedHues(h => [...h, hue]);
    setNewTodoText('');
    setAddingCatId(null);

    try {
      const created = await createTodo(userId, catId, selectedDate, text, {
        hue, rgb, color, seed,
      });
      // 임시 id → 실제 id 교체
      setTodos(prev =>
        prev.map(t =>
          t.id === tempId
            ? { ...created, categories: { name: '', color: catColor } }
            : t,
        ),
      );
    } catch (_) {
      // 롤백
      setTodos(prev => prev.filter(t => t.id !== tempId));
      setUsedHues(h => h.filter(uh => uh !== hue));
      Alert.alert('오류', '할 일을 추가하지 못했어요');
    }
  };

  /**
   * deleteTodo
   * 낙관적 삭제 → palette drop도 같이 제거 → Supabase 동기화
   */
  const handleDeleteTodo = async (todo) => {
    if (!userId) return;
    const prevTodos = todos;
    const prevDrops = paletteDrops;

    const newTodos = todos.filter(t => t.id !== todo.id);
    const newDrops = paletteDrops.filter(d => d.id !== todo.id);
    const newTotal = Math.max(0, newTodos.length);

    setTodos(newTodos);
    setPaletteDrops(newDrops);
    setCanvasVer(v => v + 1);

    try {
      await deleteTodoSvc(todo.id);
      // drop이 있었던 경우 palette_history도 업데이트
      if (prevDrops.length !== newDrops.length) {
        await upsertPaletteHistory(userId, selectedDate, newDrops, newTotal);
        setPaletteHistory(prev => ({
          ...prev,
          [selectedDate]: { drops: newDrops, total: newTotal },
        }));
      }
    } catch (_) {
      setTodos(prevTodos);
      setPaletteDrops(prevDrops);
      Alert.alert('오류', '삭제에 실패했어요');
    }
  };

  /**
   * saveEdit — 텍스트 인라인 편집 저장
   */
  const handleSaveEdit = async () => {
    if (!editingId) return;
    const text = editingText.trim();
    setEditingId(null);
    if (!text) return;

    setTodos(prev => prev.map(t =>
      t.id === editingId ? { ...t, text } : t,
    ));

    try {
      await updateTodoText(editingId, text);
    } catch (_) {
      // 서버 실패 시 재로드
      loadData();
    }
  };

  /**
   * addCategory — 카테고리 추가
   */
  const handleAddCategory = async () => {
    const name = newCatName.trim();
    if (!name || !userId) return;
    try {
      const created = await createCategory(userId, name, newCatColor);
      setCategories(prev => [...prev, created]);
      setNewCatName('');
      setNewCatColor(CAT_COLORS[0]);
      setShowCatModal(false);
    } catch (_) {
      Alert.alert('오류', '카테고리 추가에 실패했어요');
    }
  };

  /**
   * deleteCategory — 카테고리 삭제 (확인 후)
   */
  const handleDeleteCategory = async (catId) => {
    try {
      await deleteCategory(catId);
      setCategories(prev => prev.filter(c => c.id !== catId));
      setConfirmDelCat(null);
    } catch (_) {
      Alert.alert('오류', '카테고리 삭제에 실패했어요');
    }
  };

  // ─────────────────────────────────────────────────────
  // 3단계 ▼ state / memos / effects / helpers
  // ─────────────────────────────────────────────────────

  // 인라인 색상 피커 열린 카테고리 id
  const [colorPickerCatId, setColorPickerCatId] = useState(null);

  // 더블탭 감지용 타이머 맵 { [todoId]: timestamp }
  const doubleTapTimers = useRef({});

  // 마지막 미완료 할일 글로우 펄스 애니메이션
  const glowAnim = useRef(new Animated.Value(0)).current;
  const glowLoop = useRef(null);

  // 카테고리별 todo 그룹
  const todosByCat = useMemo(() => {
    const map = {};
    categories.forEach(c => { map[c.id] = []; });
    todos.forEach(t => {
      if (map[t.cat_id]) map[t.cat_id].push(t);
      else map[t.cat_id] = [t];
    });
    return map;
  }, [categories, todos]);

  // 미완료 할일 수
  const remainingCount = useMemo(
    () => todos.filter(t => !t.done).length,
    [todos],
  );

  // 마지막 미완료 1개 남았을 때 글로우 펄스 시작
  useEffect(() => {
    if (remainingCount === 1 && totalCount > 1) {
      glowLoop.current = Animated.loop(
        Animated.sequence([
          Animated.timing(glowAnim, { toValue: 1, duration: 900, useNativeDriver: false }),
          Animated.timing(glowAnim, { toValue: 0, duration: 900, useNativeDriver: false }),
        ]),
      );
      glowLoop.current.start();
    } else {
      glowLoop.current?.stop();
      glowAnim.setValue(0);
    }
    return () => glowLoop.current?.stop();
  }, [remainingCount, totalCount]);

  // 더블탭 감지
  const handleTodoTap = (todoId, onDoubleTap) => {
    const now = Date.now();
    if (doubleTapTimers.current[todoId] && now - doubleTapTimers.current[todoId] < 320) {
      delete doubleTapTimers.current[todoId];
      onDoubleTap();
    } else {
      doubleTapTimers.current[todoId] = now;
      setTimeout(() => { delete doubleTapTimers.current[todoId]; }, 380);
    }
  };

  // 카테고리 색상 인라인 변경
  const handleCategoryColorChange = async (catId, color) => {
    setCategories(prev => prev.map(c => c.id === catId ? { ...c, color } : c));
    setColorPickerCatId(null);
    try {
      await supabase.from('categories').update({ color }).eq('id', catId);
    } catch (_) { loadData(); }
  };

  // 카테고리 드래그 순서 변경 저장
  const handleCategoryReorder = async (newOrder) => {
    setCategories(newOrder);
    try {
      await Promise.all(
        newOrder.map((cat, idx) =>
          supabase.from('categories')
            .update({ sort_order: idx })
            .eq('id', cat.id),
        ),
      );
    } catch (_) {}
  };

  // ─────────────────────────────────────────────────────
  // 3단계 ▼ 렌더 헬퍼
  // ─────────────────────────────────────────────────────

  // ── 그라데이션 프로그레스바 ──────────────────────────
  const renderProgressBar = () => {
    const barColor = isBlack
      ? '#222'
      : paletteDrops.length > 0 ? (mixedCss || paletteDrops[0].color) : C.border;
    const glowColor = paletteDrops.length > 0 && !isBlack ? mixedCss : null;

    return (
      <View style={[styles.progressWrap, { width: PALETTE_SIZE }]}>
        {/* 바 트랙 */}
        <View style={styles.progressTrack}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width:           `${progress}%`,
                backgroundColor: barColor,
                shadowColor:     glowColor || 'transparent',
                shadowRadius:    glowColor ? 6 : 0,
                shadowOpacity:   glowColor ? 0.5 : 0,
              },
            ]}
          />
        </View>
        {/* 색 도트 + 완료 카운트 */}
        <View style={styles.progressMeta}>
          {paletteDrops.slice(0, 10).map(d => (
            <View
              key={d.id}
              style={[styles.colorDot, {
                backgroundColor: d.color,
                shadowColor: d.color,
              }]}
            />
          ))}
          {paletteDrops.length > 10 && (
            <Text style={styles.dotOverflow}>+{paletteDrops.length - 10}</Text>
          )}
          {totalCount > 0 && (
            <Text style={styles.countText}>{doneCount} / {totalCount}</Text>
          )}
        </View>
      </View>
    );
  };

  // ── 카테고리 없을 때 빈 상태 ──────────────────────────
  const renderEmptyState = () => (
    <View style={styles.emptyWrap}>
      <Text style={styles.emptyIcon}>🎨</Text>
      <Text style={styles.emptyTitle}>아직 카테고리가 없어요</Text>
      <Text style={styles.emptyDesc}>
        상단 오른쪽 카테고리 버튼을 눌러서{'\n'}첫 번째 카테고리를 만들어보세요
      </Text>
      <TouchableOpacity onPress={() => setShowCatModal(true)} style={styles.emptyBtn}>
        <Text style={styles.emptyBtnText}>카테고리 만들기</Text>
      </TouchableOpacity>
    </View>
  );

  // ── 할일 아이템 ──────────────────────────────────────
  const renderTodoItem = (todo, cat) => {
    const isEditing = editingId === todo.id;
    const isDone    = todo.done;
    // 글로우 펄스: 마지막 1개 미완료인 경우
    const isLastRemaining = remainingCount === 1 && !isDone;
    const todoColor = todo.color || cat.color;

    const glowBorderColor = isLastRemaining
      ? glowAnim.interpolate({ inputRange: [0, 1], outputRange: [C.border2, todoColor || '#6c8fff'] })
      : undefined;

    return (
      <Animated.View
        key={todo.id}
        style={[
          styles.todoItem,
          isDone && !isEditing && styles.todoItemDone,
          isEditing && styles.todoItemEditing,
          isLastRemaining && glowBorderColor && { borderColor: glowBorderColor },
        ]}
      >
        {/* 체크박스 */}
        <TouchableOpacity
          onPress={() => !isEditing && handleToggleTodo(todo, cat.color)}
          style={[
            styles.checkbox,
            isDone && { borderColor: todoColor, backgroundColor: todoColor },
          ]}
          activeOpacity={0.7}
        >
          {isDone && <Text style={styles.checkmark}>✓</Text>}
        </TouchableOpacity>

        {/* 텍스트 / 편집 인풋 */}
        {isEditing ? (
          <TextInput
            ref={editInputRef}
            value={editingText}
            onChangeText={setEditingText}
            onSubmitEditing={handleSaveEdit}
            onBlur={handleSaveEdit}
            autoFocus
            style={styles.editInput}
            placeholderTextColor={C.dim}
          />
        ) : (
          <TouchableOpacity
            style={{ flex: 1 }}
            activeOpacity={1}
            onPress={() =>
              handleTodoTap(todo.id, () => {
                if (!isDone && !todo.routine_id) {
                  setEditingId(todo.id);
                  setEditingText(todo.text);
                  setTimeout(() => editInputRef.current?.focus(), 50);
                }
              })
            }
          >
            <Text
              style={[
                styles.todoText,
                isDone && styles.todoTextDone,
              ]}
              numberOfLines={2}
            >
              {todo.text}
            </Text>
          </TouchableOpacity>
        )}

        {/* 루틴 뱃지 */}
        {todo.routine_id && (
          <View style={styles.routineBadge}>
            <Text style={styles.routineBadgeText}>↻</Text>
          </View>
        )}

        {/* 편집 저장 / 삭제 버튼 */}
        {isEditing ? (
          <TouchableOpacity onPress={handleSaveEdit} style={styles.saveBtn}>
            <Text style={styles.saveBtnText}>저장</Text>
          </TouchableOpacity>
        ) : !todo.routine_id ? (
          <TouchableOpacity
            onPress={() => handleDeleteTodo(todo)}
            style={styles.deleteBtn}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.deleteBtnText}>✕</Text>
          </TouchableOpacity>
        ) : null}
      </Animated.View>
    );
  };

  // ── 카테고리 + 할일 목록 ─────────────────────────────
  const renderCategoryItem = ({ item: cat, drag, isActive }) => {
    const catTodos = todosByCat[cat.id] || [];
    const catDone  = catTodos.filter(t => t.done).length;
    const isPickerOpen = colorPickerCatId === cat.id;

    return (
      <ScaleDecorator>
        <View style={[styles.catBlock, isActive && { opacity: 0.85 }]}>
          {/* 카테고리 헤더 */}
          <View style={styles.catHeader}>
            {/* 색 도트 (탭 → 인라인 색상 피커) */}
            <TouchableOpacity
              onPress={() => setColorPickerCatId(isPickerOpen ? null : cat.id)}
              style={[
                styles.catPill,
                { backgroundColor: cat.color + '15', borderColor: cat.color + '28' },
              ]}
              activeOpacity={0.7}
            >
              <View style={[styles.catDot, {
                backgroundColor: cat.color,
                shadowColor: cat.color,
              }]} />
              <Text style={[styles.catName, { color: cat.color }]}>{cat.name}</Text>
            </TouchableOpacity>

            {catTodos.length > 0 && (
              <Text style={styles.catCount}>{catDone}/{catTodos.length}</Text>
            )}
            <View style={{ flex: 1 }} />

            {/* 드래그 핸들 */}
            <TouchableOpacity onLongPress={drag} style={styles.dragHandle}>
              <Text style={styles.dragHandleText}>⠿</Text>
            </TouchableOpacity>

            {/* 할일 추가 버튼 */}
            <TouchableOpacity
              onPress={() => {
                setAddingCatId(cat.id);
                setNewTodoText('');
                setTimeout(() => inputRef.current?.focus(), 50);
              }}
              style={styles.catAddBtn}
            >
              <Text style={styles.catAddBtnText}>+</Text>
            </TouchableOpacity>
          </View>

          {/* 인라인 색상 피커 */}
          {isPickerOpen && (
            <View style={styles.colorPicker}>
              {CAT_COLORS.map(color => (
                <TouchableOpacity
                  key={color}
                  onPress={() => handleCategoryColorChange(cat.id, color)}
                  style={[
                    styles.colorPickerDot,
                    { backgroundColor: color },
                    cat.color === color && styles.colorPickerDotActive,
                  ]}
                />
              ))}
            </View>
          )}

          {/* 할일 목록 */}
          <View style={styles.todoList}>
            {catTodos.map(todo => renderTodoItem(todo, cat))}
          </View>

          {/* 할일 추가 인풋 */}
          {addingCatId === cat.id && (
            <View style={styles.addTodoRow}>
              <TextInput
                ref={inputRef}
                value={newTodoText}
                onChangeText={setNewTodoText}
                onSubmitEditing={() => handleAddTodo(cat.id, cat.color)}
                onBlur={() => { if (!newTodoText.trim()) setAddingCatId(null); }}
                placeholder="할 일을 입력하고 Enter"
                placeholderTextColor={C.dim}
                style={styles.addTodoInput}
                autoFocus
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={() => handleAddTodo(cat.id, cat.color)}
                style={styles.addTodoSubmit}
              >
                <Text style={styles.addTodoSubmitText}>↵</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </ScaleDecorator>
    );
  };

  // ── 카테고리 관리 모달 ───────────────────────────────
  const renderCatModal = () => (
    <Modal
      visible={showCatModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowCatModal(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowCatModal(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <TouchableOpacity activeOpacity={1} onPress={() => {}}>
            <View style={styles.modalSheet}>
              {/* 드래그 바 */}
              <View style={styles.modalHandle} />
              {/* 타이틀 */}
              <View style={styles.modalTitleRow}>
                <Text style={styles.modalTitle}>카테고리 관리</Text>
                <TouchableOpacity
                  onPress={() => setShowCatModal(false)}
                  style={styles.modalCloseBtn}
                >
                  <Text style={styles.modalCloseBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
              {/* 기존 카테고리 목록 */}
              {categories.length > 0 && (
                <View style={styles.modalCatList}>
                  {categories.map(cat => (
                    <View key={cat.id} style={styles.modalCatRow}>
                      <View style={[styles.modalCatDot, { backgroundColor: cat.color }]} />
                      <Text style={styles.modalCatName}>{cat.name}</Text>
                      <TouchableOpacity
                        onPress={() =>
                          Alert.alert(
                            '카테고리 삭제',
                            `'${cat.name}'과 관련 할 일을 모두 삭제할까요?`,
                            [
                              { text: '취소', style: 'cancel' },
                              { text: '삭제', style: 'destructive', onPress: () => handleDeleteCategory(cat.id) },
                            ]
                          )
                        }
                        style={styles.modalCatDelBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Text style={styles.modalCatDelBtnText}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </View>
              )}
              {/* 색상 팔레트 */}
              <View style={styles.catColorRow}>
                {CAT_COLORS.map(color => (
                  <TouchableOpacity
                    key={color}
                    onPress={() => setNewCatColor(color)}
                    style={[
                      styles.catColorOption,
                      { backgroundColor: color },
                      newCatColor === color && styles.catColorOptionActive,
                    ]}
                  />
                ))}
              </View>
              {/* 이름 입력 */}
              <View style={styles.modalInputRow}>
                <TextInput
                  value={newCatName}
                  onChangeText={setNewCatName}
                  onSubmitEditing={handleAddCategory}
                  placeholder="카테고리 이름"
                  placeholderTextColor={C.dim}
                  style={styles.modalInput}
                  autoFocus
                  returnKeyType="done"
                />
                <TouchableOpacity onPress={handleAddCategory} style={styles.modalAddBtn}>
                  <Text style={styles.modalAddBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );

  // ─────────────────────────────────────────────────────
  // 4단계 ▼ 팔레트 + 캘린더
  // ─────────────────────────────────────────────────────

  // 날짜별 BLACK 애니메이션 이미 재생된 날 추적 (5단계 트리거용)
  const blackShownDates = useRef(new Set());

  // PaletteCanvas onAnimDone 콜백 ── animDrop 정리 + BLACK 체크
  const handleAnimDone = useCallback(() => {
    const wasLast = animDrop?.isLast;
    setAnimDrop(null);
    if (wasLast && !blackShownDates.current.has(`${selectedDate}:${totalCount}`)) {
      blackShownDates.current.add(`${selectedDate}:${totalCount}`);
      // BLACK 달성 애니메이션 트리거 (5단계 blackPhase)
      setBlackPhase('in');
    }
  }, [animDrop, selectedDate, totalCount]);

  // ─────────────────────────────────────────────────────
  // 5단계 ▼ BLACK 달성 페이즈 관리
  // ─────────────────────────────────────────────────────

  // 'in' — 검정 오버레이 페이드인 + 캘린더 열기
  useEffect(() => {
    if (blackPhase !== 'in') return;
    blackFadeAnim.setValue(0);
    if (!showCal) setShowCal(true);
    Animated.timing(blackFadeAnim, {
      toValue: 0.6, duration: 300, useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setBlackPhase('text');
    });
  }, [blackPhase]);

  // 'text' — 200ms 페이드인 → 700ms 표시 → 200ms 페이드아웃 → 'orb'
  useEffect(() => {
    if (blackPhase !== 'text') return;
    blackTextAnim.setValue(0);
    Animated.timing(blackTextAnim, {
      toValue: 1, duration: 200, useNativeDriver: true,
    }).start(() => {
      blackTimer.current = setTimeout(() => {
        Animated.timing(blackTextAnim, {
          toValue: 0, duration: 200, useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished) setBlackPhase('orb');
        });
      }, 700);
    });
    return () => clearTimeout(blackTimer.current);
  }, [blackPhase]);

  // 'orb' — 수학 계산으로 셀 중심 좌표 결정 (measureInWindow 없음)
  useEffect(() => {
    if (blackPhase !== 'orb') return;
    const pos = getTargetCellPos(selectedDate);
    console.log('[FlyingOrb] from:', SW / 2, SH / 2, '→ to:', pos.x, pos.y);
    setFlyOrb({ toX: pos.x, toY: pos.y });
  }, [blackPhase]);

  // 'stamp' — 스탬프 리플 + 오버레이 페이드아웃
  useEffect(() => {
    if (blackPhase !== 'stamp') return;
    setFlyOrb(null);
    setStampDate(selectedDate);

    // 오버레이 페이드아웃 (캘린더 stamp 보이도록)
    Animated.timing(blackFadeAnim, {
      toValue: 0, duration: 500, useNativeDriver: true,
    }).start();

    // 스탬프 + 리플 애니메이션
    stampScale.setValue(2.4);
    stampOpacity.setValue(0);
    rippleScale.setValue(1);
    rippleOpacity.setValue(0.6);
    Animated.parallel([
      Animated.timing(stampScale, {
        toValue: 1, duration: 300, useNativeDriver: true,
      }),
      Animated.timing(stampOpacity, {
        toValue: 1, duration: 300, useNativeDriver: true,
      }),
      Animated.sequence([
        Animated.delay(80),
        Animated.parallel([
          Animated.timing(rippleScale, {
            toValue: 2.2, duration: 300, useNativeDriver: true,
          }),
          Animated.timing(rippleOpacity, {
            toValue: 0, duration: 300, useNativeDriver: true,
          }),
        ]),
      ]),
    ]).start(() => {
      blackTimer.current = setTimeout(() => {
        closeCalendar();
        setBlackPhase(null);
        setStampDate(null);
      }, 250);
    });

    return () => {
      if (blackTimer.current) clearTimeout(blackTimer.current);
    };
  }, [blackPhase, selectedDate]);

  // ── CalendarMiniPalette ─ 캘린더 셀 안 미니 팔레트 ──
  // 성능상 Canvas 대신 색상 blob 근사 렌더링
  const renderCalendarMiniPalette = (drops, totalCount, isDone, size = 30) => {
    const opacity = isDone
      ? 1
      : 0.35 + (drops.length / (totalCount || drops.length)) * 0.65;

    // 최대 4 drop, 사분면 배치
    const positions = [
      { top: -size * 0.06, left: -size * 0.06 },   // NW
      { top: -size * 0.06, right: -size * 0.06 },   // NE
      { bottom: -size * 0.06, left: -size * 0.06 }, // SW
      { bottom: -size * 0.06, right: -size * 0.06 },// SE
    ];

    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', opacity }}>
        {/* 팔레트 어두운 배경 */}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0d0c0b', borderRadius: size / 2 }]} />
        {/* Drop 색상 blob */}
        {drops.slice(0, 4).map((d, i) => (
          <View
            key={d.id}
            style={[
              {
                position: 'absolute',
                width: size * 0.72,
                height: size * 0.72,
                borderRadius: size * 0.36,
                backgroundColor: d.color,
                opacity: 0.68,
              },
              positions[i % 4],
            ]}
          />
        ))}
        {/* BLACK 완료 오버레이 */}
        {isDone && (
          <View style={[
            StyleSheet.absoluteFill,
            { backgroundColor: 'rgba(0,0,0,0.82)', borderRadius: size / 2 },
          ]} />
        )}
      </View>
    );
  };

  // ── renderCalendarView ─ main View 안 absolute (Modal 밖 → 올바른 좌표계) ──
  const renderCalendarView = () => {
    if (!showCal && !calClosing) return null;

    const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
    const emptyCells = Array.from({ length: firstDow });
    const dayCells   = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return (
      <View
        style={[StyleSheet.absoluteFill, { zIndex: 100 }]}
        pointerEvents={showCal ? 'auto' : 'none'}
      >
        <TouchableOpacity
          style={styles.calOverlay}
          activeOpacity={1}
          onPress={closeCalendar}
        >
          <Animated.View
            style={[styles.calSheet, { transform: [{ translateY: calTransY }] }]}
          >
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>

              {/* 월 이동 헤더 */}
              <View style={styles.calHeader}>
                <TouchableOpacity onPress={() => goMonth(-1)} style={styles.calNavBtn}>
                  <Text style={styles.calNavText}>‹</Text>
                </TouchableOpacity>
                <Text style={styles.calTitle}>{calYear}년 {monthName}</Text>
                <TouchableOpacity onPress={() => goMonth(1)} style={styles.calNavBtn}>
                  <Text style={styles.calNavText}>›</Text>
                </TouchableOpacity>
              </View>

              {/* 요일 헤더 */}
              <View style={styles.calDowRow}>
                {DOW_LABELS.map((d, i) => (
                  <Text
                    key={d}
                    style={[
                      styles.calDowText,
                      i === 0 && { color: '#ff7070' },
                      i === 6 && { color: '#7090ff' },
                    ]}
                  >
                    {d}
                  </Text>
                ))}
              </View>

              {/* 날짜 그리드 */}
              <View style={styles.calGrid}>
                {emptyCells.map((_, i) => (
                  <View key={`e${i}`} style={styles.calCell} />
                ))}

                {dayCells.map(day => {
                  const dk  = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isSel  = dk === selectedDate;
                  const isTod  = dk === todayKey_state;
                  const hist   = paletteHistory[dk];
                  const drops  = hist?.drops ?? [];
                  const total  = hist?.total ?? 0;
                  const dow    = new Date(dk + 'T00:00:00').getDay();
                  const isDone = total > 0 && drops.length >= total;
                  const hasDrops = drops.length > 0;

                  const numColor =
                    dow === 0 ? '#ff7070'
                    : dow === 6 ? '#7090ff'
                    : hasDrops && !isDone ? C.text
                    : isDone              ? '#444444'
                    : '#3a3a3a';

                  const cellBorder = hasDrops && !isDone
                    ? { borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }
                    : isDone
                    ? { borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }
                    : {};

                  const isStamp = stampDate === dk;

                  return (
                    <TouchableOpacity
                      key={day}
                      ref={isSel ? targetCellRef : null}
                      onPress={() => {
                        setSelectedDate(dk);
                        closeCalendar();
                      }}
                      style={[styles.calCell, isSel && styles.calCellSel, cellBorder]}
                      activeOpacity={0.7}
                    >
                      <Animated.View
                        style={[
                          styles.calCircle,
                          isStamp && {
                            transform: [{ scale: stampScale }],
                            opacity: stampOpacity,
                          },
                        ]}
                      >
                        {hasDrops ? (
                          renderCalendarMiniPalette(drops, total, isDone, 30)
                        ) : (
                          <View style={[
                            styles.calCirclePlain,
                            isTod  && styles.calCircleToday,
                            isSel  && !isTod && styles.calCircleSel,
                          ]}>
                            {isTod && <View style={styles.calTodayDot} />}
                          </View>
                        )}
                        {isDone && hasDrops && <View style={styles.calDoneRing} />}
                        {isStamp && (
                          <Animated.View style={[
                            styles.calRipple,
                            { transform: [{ scale: rippleScale }], opacity: rippleOpacity },
                          ]} />
                        )}
                      </Animated.View>

                      <Text
                        style={[
                          styles.calDayNum,
                          { color: numColor },
                          (isTod || (hasDrops && !isDone)) && { fontWeight: '600' },
                        ]}
                      >
                        {day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      </View>
    );
  };

  // ── renderBlackModal ─ BLACK 오버레이 + FlyingOrb (별도 Modal) ──
  const renderBlackModal = () => {
    if (blackPhase === null) return null;
    return (
      <Modal
        visible
        transparent
        animationType="none"
        statusBarTranslucent
      >
        {/* BLACK 오버레이 */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: blackFadeAnim }]}
        />

        {/* BLACK 메시지 — 'text' 페이즈만, blackTextAnim으로 개별 페이드 */}
        {blackPhase === 'text' && (
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, styles.blackMsgWrap, { opacity: blackTextAnim }]}
          >
            <View style={styles.blackOrbCircle} />
            <Text style={styles.blackTitle}>BLACK</Text>
            <Text style={styles.blackSub}>모든 색이 하나가 됐어요</Text>
          </Animated.View>
        )}

        {/* FlyingOrb */}
        {flyOrb && blackPhase === 'orb' && (
          <FlyingOrb
            sx={SW / 2}
            sy={SH / 2}
            tx={flyOrb.toX}
            ty={flyOrb.toY}
            onDone={() => setTimeout(() => setBlackPhase('stamp'), 400)}
          />
        )}
      </Modal>
    );
  };

  // ─────────────────────────────────────────────────────
  // ▼▼▼ 3·4·5단계 return JSX  ▼▼▼
  // ─────────────────────────────────────────────────────

  // 로딩 중
  if (loading && todos.length === 0 && categories.length === 0) {
    return (
      <View style={styles.loadingWrap}>
        <Text style={styles.loadingText}>●</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>

      {/* ══ 상단 고정 영역 (팔레트 + 헤더) ══ */}
      <View style={styles.topArea}>

        {/* 날짜 헤더 */}
        <View style={styles.headerRow}>
          {/* Left: makeblack 타이틀 + 날짜 네비 */}
          <View style={styles.dateCol}>
            <Text style={styles.appTitle}>MAKEBLACK</Text>
            <View style={styles.dateNav}>
              <TouchableOpacity onPress={() => goDay(-1)} style={styles.navBtn} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                <Text style={styles.navArrow}>◀</Text>
              </TouchableOpacity>
              <Text style={styles.dateText} numberOfLines={1}>
                {isToday
                  ? '오늘'
                  : selDateObj.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
              </Text>
              <TouchableOpacity onPress={() => goDay(1)} style={styles.navBtn} hitSlop={{ top:8, bottom:8, left:8, right:8 }}>
                <Text style={styles.navArrow}>▶</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Right: 캘린더 + 카테고리 버튼 */}
          <View style={styles.headerBtns}>
            <TouchableOpacity onPress={() => setShowCal(true)} style={styles.headerPill}>
              <Text style={styles.headerPillText}>캘린더</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCatModal(true)} style={styles.headerPill}>
              <Text style={styles.headerPillText}>카테고리</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 팔레트 캔버스 */}
        <View style={styles.paletteWrap}>
          <PaletteCanvas
            drops={paletteDrops}
            totalCount={totalCount}
            size={PALETTE_SIZE}
            animDrop={animDrop}
            onAnimDone={handleAnimDone}
            style={{ borderRadius: R.lg }}
          />
        </View>

        {/* 그라데이션 프로그레스바 */}
        {renderProgressBar()}
      </View>

      {/* 구분선 */}
      <View style={styles.divider} />

      {/* ══ TODO LIST ══ */}
      {categories.length === 0 ? (
        <ScrollView contentContainerStyle={{ flex: 1 }}>
          {renderEmptyState()}
        </ScrollView>
      ) : (
        <View style={{ flex: 1 }}>
          <DraggableFlatList
            data={categories}
            keyExtractor={item => String(item.id)}
            onDragEnd={({ data }) => handleCategoryReorder(data)}
            renderItem={renderCategoryItem}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          />
        </View>
      )}

      {/* 카테고리 관리 모달 */}
      {renderCatModal()}

      {/* 캘린더 — main View 안 absolute (Modal 밖 좌표계) */}
      {renderCalendarView()}

      {/* BLACK 오버레이 + FlyingOrb — 별도 Modal */}
      {renderBlackModal()}
    </View>
  );
}

// ─────────────────────────────────────────────────────
// Styles — makeblack.jsx 수치 그대로 추출
// ─────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── Root ──
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  loadingWrap: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 32,
    color: C.dim,
  },

  // ── 상단 영역 ──
  topArea: {
    flexShrink: 0,
    paddingTop: 14,
    paddingHorizontal: 18,
  },

  // ── 날짜 헤더 ──
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  dateCol: {
    alignItems: 'center',
  },
  appTitle: {
    fontSize: 9,
    color: C.dim,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  navBtn: {
    width: 13,
    height: 13,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.55,
  },
  navArrow: {
    fontSize: 9,
    color: C.muted,
    lineHeight: 9,
  },
  dateText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.34,
    color: C.text,
    width: 120,
    textAlign: 'center',
  },
  headerBtns: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  headerPill: {
    height: 28,
    paddingHorizontal: 11,
    borderRadius: R.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerPillText: {
    fontSize: 11,
    color: C.muted,
  },

  // ── 팔레트 ──
  paletteWrap: {
    borderRadius: R.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.paletteBase,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    // size는 PALETTE_SIZE를 직접 넘기므로 width/height 생략
  },

  // 혼합색 pill
  mixedPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'center',
    marginTop: 6,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: R.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
  },
  mixedPillDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  mixedPillText: {
    fontSize: 10,
  },

  // ── 캘린더 ──
  // 딤 오버레이
  calOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  // 슬라이드 시트 (상단에서 아래로)
  calSheet: {
    backgroundColor: C.surface,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingTop: 20,
    paddingHorizontal: 18,
    paddingBottom: 28,
    // iOS safe area용 추가 패딩은 필요 시 Platform으로 조정
  },
  // 월 이동 헤더
  calHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  calNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calNavText: {
    fontSize: 18,
    color: C.muted,
    lineHeight: 20,
  },
  calTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: -0.3,
    color: C.text,
  },
  // 요일 헤더
  calDowRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  calDowText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 10,
    color: C.dim,
  },
  // 날짜 그리드
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 3,
    columnGap: 0,
  },
  // 날짜 셀 (7등분)
  calCell: {
    width: '14.285%',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 3,
    paddingHorizontal: 1,
    borderRadius: R.sm,
  },
  calCellSel: {
    backgroundColor: '#222222',
  },
  // 셀 안 30×30 원 컨테이너
  calCircle: {
    width: 30,
    height: 30,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // 팔레트 없을 때 기본 원
  calCirclePlain: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calCircleToday: {
    backgroundColor: '#1a1a1a',
    borderWidth: 1,
    borderColor: C.border2,
  },
  calCircleSel: {
    borderWidth: 1,
    borderColor: '#444444',
  },
  calTodayDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.dim,
  },
  // 완료일 흰 링
  calDoneRing: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  // 스탬프 리플
  calRipple: {
    position: 'absolute',
    top: -4, left: -4, right: -4, bottom: -4,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  // 날짜 숫자
  calDayNum: {
    fontSize: 9,
  },

  // ── 프로그레스바 ──
  progressWrap: {
    marginTop: 10,
    alignSelf: 'center',
    marginBottom: 0,
  },
  progressTrack: {
    height: 4,
    borderRadius: 4,
    backgroundColor: C.surface,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
    minHeight: 14,
  },
  colorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 4,
    shadowOpacity: 0.4,
    elevation: 2,
  },
  dotOverflow: {
    fontSize: 9,
    color: C.dim,
  },
  countText: {
    fontSize: 10,
    color: C.dim,
    marginLeft: 'auto',
  },

  // ── 구분선 ──
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: 18,
    marginTop: 12,
  },

  // ── 스크롤 영역 ──
  scrollContent: {
    paddingTop: 12,
    paddingHorizontal: 18,
    paddingBottom: 110,
  },

  // ── 빈 상태 ──
  emptyWrap: {
    alignItems: 'center',
    paddingTop: 48,
    paddingHorizontal: 24,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 14,
  },
  emptyTitle: {
    fontSize: 14,
    color: '#555',
    fontWeight: '600',
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 12,
    color: C.dim,
    lineHeight: 21.6,
    textAlign: 'center',
    marginBottom: 20,
  },
  emptyBtn: {
    paddingVertical: 11,
    paddingHorizontal: 28,
    backgroundColor: '#f0ece6',
    borderRadius: R.full,
  },
  emptyBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#080808',
  },

  // ── 카테고리 블록 ──
  catBlock: {
    marginBottom: 22,
  },
  catHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: R.full,
    borderWidth: 1,
  },
  catDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 5,
    shadowOpacity: 1,
    elevation: 2,
  },
  catName: {
    fontSize: 12,
    fontWeight: '600',
  },
  catCount: {
    fontSize: 10,
    color: C.dim,
  },
  dragHandle: {
    padding: 4,
  },
  dragHandleText: {
    fontSize: 14,
    color: C.dim,
    letterSpacing: 0.7,
  },
  catDeleteBtn: {
    padding: 4,
  },
  catDeleteBtnText: {
    fontSize: 16,
    color: C.dim,
  },
  catAddBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catAddBtnText: {
    fontSize: 16,
    color: C.muted,
    lineHeight: 18,
  },

  // ── 인라인 색상 피커 ──
  colorPicker: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 10,
    paddingLeft: 8,
  },
  colorPickerDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  colorPickerDotActive: {
    borderWidth: 2,
    borderColor: '#fff',
  },

  // ── 삭제 확인 박스 ──
  confirmDelBox: {
    backgroundColor: '#1e1010',
    borderWidth: 1,
    borderColor: '#3a1a1a',
    borderRadius: R.md,
    padding: 14,
    marginBottom: 10,
  },
  confirmDelText: {
    fontSize: 13,
    color: '#ff7070',
    marginBottom: 12,
  },
  confirmDelBtns: {
    flexDirection: 'row',
    gap: 8,
  },
  confirmCancelBtn: {
    flex: 1,
    padding: 9,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: R.sm,
    alignItems: 'center',
  },
  confirmCancelBtnText: {
    fontSize: 12,
    color: C.muted,
  },
  confirmDeleteBtn: {
    flex: 1,
    padding: 9,
    backgroundColor: '#ff4444',
    borderRadius: R.sm,
    alignItems: 'center',
  },
  confirmDeleteBtnText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '700',
  },

  // ── 할일 목록 ──
  todoList: {
    gap: 5,
  },

  // ── 할일 아이템 ──
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 11,
    paddingHorizontal: 13,
    backgroundColor: C.card,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border2,
  },
  todoItemDone: {
    backgroundColor: 'transparent',
    borderColor: C.border,
    opacity: 0.42,
  },
  todoItemEditing: {
    backgroundColor: C.surface,
    borderColor: C.border2,
    opacity: 1,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: C.border2,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  checkmark: {
    color: '#080808',
    fontSize: 10,
    fontWeight: '800',
  },
  todoText: {
    fontSize: 13,
    color: C.text,
    flex: 1,
  },
  todoTextDone: {
    color: C.muted,
    textDecorationLine: 'line-through',
  },
  editInput: {
    flex: 1,
    fontSize: 13,
    color: C.text,
    padding: 0,
    backgroundColor: 'transparent',
  },
  routineBadge: {
    backgroundColor: C.surface,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 4,
  },
  routineBadgeText: {
    fontSize: 9,
    color: C.dim,
  },
  saveBtn: {
    paddingHorizontal: 4,
  },
  saveBtnText: {
    fontSize: 11,
    color: '#6c8fff',
    fontWeight: '600',
  },
  deleteBtn: {
    padding: 2,
  },
  deleteBtnText: {
    fontSize: 14,
    color: C.dim,
    lineHeight: 14,
  },

  // ── 할일 추가 인풋 ──
  addTodoRow: {
    flexDirection: 'row',
    gap: 7,
    marginTop: 7,
  },
  addTodoInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: R.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    color: C.text,
    fontSize: 13,
  },
  addTodoSubmit: {
    width: 42,
    height: 42,
    backgroundColor: C.text,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTodoSubmitText: {
    fontSize: 18,
    fontWeight: '700',
    color: C.bg,
  },

  // ── 카테고리 관리 모달 ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 20,
    paddingBottom: 48,
  },
  modalHandle: {
    width: 34,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#252525',
    alignSelf: 'center',
    marginTop: 14,
    marginBottom: 18,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.32,
  },
  modalCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtnText: {
    fontSize: 14,
    color: C.muted,
  },
  catColorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
    marginBottom: 14,
  },
  catColorOption: {
    width: 26,
    height: 26,
    borderRadius: 13,
  },
  catColorOptionActive: {
    borderWidth: 2,
    borderColor: '#fff',
  },
  modalInputRow: {
    flexDirection: 'row',
    gap: 8,
  },
  modalInput: {
    flex: 1,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: R.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    color: C.text,
    fontSize: 13,
  },
  modalAddBtn: {
    width: 42,
    height: 42,
    backgroundColor: C.text,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAddBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: C.bg,
  },
  modalCatList: {
    marginBottom: 16,
    gap: 2,
  },
  modalCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  modalCatDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
  },
  modalCatName: {
    flex: 1,
    fontSize: 14,
    color: C.text,
  },
  modalCatDelBtn: {
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  modalCatDelBtnText: {
    fontSize: 13,
    color: C.muted,
  },

  // ── BLACK 달성 메시지 (makeblack.jsx 동일) ──
  blackMsgWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  blackOrbCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#fff',
    marginBottom: 28,
  },
  blackTitle: {
    fontSize: 28,
    letterSpacing: 15,
    color: '#fff',
    fontWeight: '200',
  },
  blackSub: {
    fontSize: 12,
    color: '#555',
    marginTop: 14,
    letterSpacing: 1.4,
  },
});
