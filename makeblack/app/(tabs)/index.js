import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator,
  Alert, Modal, FlatList, Animated, Dimensions,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import {
  generateTodoColor, mixRgbList, rgbToHex,
  dateKey, addDays, formatDateLabel,
} from '../../lib/colorMath';
import {
  fetchCategories, createCategory, deleteCategory,
  fetchTodos, createTodo, toggleTodo, deleteTodo,
  updateTodoText, fetchPaletteHistory, upsertPaletteHistory,
} from '../../lib/todoService';
import PaletteCanvas from '../../components/PaletteCanvas';

const { width: SW, height: SH } = Dimensions.get('window');
const PALETTE_SIZE = Math.min(SW * 0.52, 200);

// 색상 토큰 (스펙 §1)
const C = {
  bg: '#0a0a0a', surface: '#141414', card: '#181818',
  border: '#242424', border2: '#2e2e2e',
  text: '#f0ece6', muted: '#888888', dim: '#555555',
  pill: '#1e1e1e', paletteBase: '#0d0c0b',
};

// Border radius (스펙 §2)
const R = { sm: 10, md: 16, lg: 22, full: 999 };

const CAT_COLORS = [
  '#6c8fff','#ff7c6e','#a8e063','#ffd166',
  '#c77dff','#06d6a0','#ffb347','#ef476f','#4ecdc4',
];

export default function HomeScreen() {
  const [userId, setUserId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(dateKey());
  const [categories, setCategories] = useState([]);
  const [todos, setTodos] = useState([]);
  const [paletteDrops, setPaletteDrops] = useState([]);
  const [paletteHistory, setPaletteHistory] = useState({});
  const [loading, setLoading] = useState(true);
  const [animDrop, setAnimDrop] = useState(null);

  // BLACK 달성
  const [blackPhase, setBlackPhase] = useState(null);
  const blackAnim = useRef(new Animated.Value(0)).current;
  const blackScaleAnim = useRef(new Animated.Value(1.04)).current;
  const blackOrbAnim = useRef(new Animated.Value(1)).current; // 1=white, 0=black
  const blackTimer = useRef(null);
  const prevIsBlack = useRef(false);
  const [stampDate, setStampDate] = useState(null);
  const stampScale = useRef(new Animated.Value(2.4)).current;
  const stampOpacity = useRef(new Animated.Value(0)).current;
  const rippleScale = useRef(new Animated.Value(1)).current;
  const rippleOpacity = useRef(new Animated.Value(0.6)).current;

  // 캘린더
  const [showCal, setShowCal] = useState(false);
  const calTransY = useRef(new Animated.Value(-SH)).current;
  const [viewMonth, setViewMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });
  const targetCellPos = useRef({ x: SW / 2, y: 120 });

  // Flying Orb
  const [flyOrb, setFlyOrb] = useState(false);
  const orbProgress = useRef(new Animated.Value(0)).current;

  // 카테고리 모달
  const [catModalVisible, setCatModalVisible] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(CAT_COLORS[0]);

  // 할일 입력
  const [addingCatId, setAddingCatId] = useState(null);
  const [newTodoText, setNewTodoText] = useState('');

  // 인라인 편집
  const [editingId, setEditingId] = useState(null);
  const [editingText, setEditingText] = useState('');

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id);
    });
  }, []);

  useEffect(() => {
  if (!userId) return;
  loadMonthHistory(viewMonth.y, viewMonth.m);
}, [viewMonth, userId]);

  useEffect(() => {
    if (!userId) return;
    loadData();
  }, [userId, selectedDate]);

  const loadData = async () => {
  setLoading(true);
  prevIsBlack.current = false;
  clearTimeout(blackTimer.current);
  setBlackPhase(null);
  blackAnim.setValue(0);
  try {
    const [cats, todosData, palette] = await Promise.all([
      fetchCategories(userId),
      fetchTodos(userId, selectedDate),
      fetchPaletteHistory(userId, selectedDate),
    ]);
    setCategories(cats);
    setTodos(todosData);
    setPaletteDrops(palette.drops ?? []);

    // 캘린더용 이번 달 팔레트 히스토리 로드
    await loadMonthHistory(viewMonth.y, viewMonth.m);
  } catch (e) {
    Alert.alert('오류', '데이터를 불러오지 못했어요');
  } finally {
    setLoading(false);
  }
};
const loadMonthHistory = async (y, m) => {
  try {
    const { data, error } = await supabase
      .from('palette_history')
      .select('date, drops, total')
      .eq('user_id', userId)
      .gte('date', `${y}-${String(m+1).padStart(2,'0')}-01`)
      .lte('date', `${y}-${String(m+1).padStart(2,'0')}-${new Date(y, m+1, 0).getDate()}`);
    if (error) throw error;
    const hist = {};
    (data || []).forEach(row => { hist[row.date] = row; });
    setPaletteHistory(hist);
  } catch (e) {}
};

  // BLACK 감지
  const isBlack = todos.length > 0 && todos.every(t => t.done);
  useEffect(() => {
    if (isBlack && !prevIsBlack.current) {
      prevIsBlack.current = true;
      startBlackSequence();
    } else if (!isBlack) {
      prevIsBlack.current = false;
    }
  }, [isBlack]);

  // ── BLACK 달성 시퀀스 (스펙 §7) ──
  const startBlackSequence = () => {
    // 0ms: blackIn
    setBlackPhase('in');
    blackAnim.setValue(0);
    blackScaleAnim.setValue(1.04);
    Animated.parallel([
      Animated.timing(blackAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
      Animated.timing(blackScaleAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
    ]).start();

    // 1000ms: blackOut
    blackTimer.current = setTimeout(() => {
      setBlackPhase('out');
      Animated.parallel([
        Animated.timing(blackAnim, { toValue: 0, duration: 450, useNativeDriver: true }),
        Animated.timing(blackScaleAnim, { toValue: 0.97, duration: 450, useNativeDriver: true }),
      ]).start();

      // 1150ms: 캘린더 열림
      blackTimer.current = setTimeout(() => {
        openCalendar();

        // 1400ms: orb 발사
        blackTimer.current = setTimeout(() => {
          setBlackPhase(null);
          launchOrb();
        }, 250);
      }, 150);
    }, 1000);
  };

  const skipBlackSequence = () => {
    clearTimeout(blackTimer.current);
    setBlackPhase('out');
    Animated.timing(blackAnim, { toValue: 0, duration: 450, useNativeDriver: true }).start(() => {
      setBlackPhase(null);
    });
    openCalendar();
    blackTimer.current = setTimeout(() => launchOrb(), 250);
  };

  const launchOrb = () => {
    // 캘린더 셀 위치를 수학적으로 계산 (spring 애니메이션 진행 중 measure() 오류 방지)
    const [y, m, d] = selectedDate.split('-').map(Number);
    const fDow = new Date(y, m - 1, 1).getDay();
    const cellW = SW / 7;
    const cellH = cellW / 0.9;
    // calSheet paddingTop(20) + calHeader(34+marginBottom16=50) + calDowRow(13+marginBottom6=19) ≈ 89
    const gridTopY = 89;
    const cellIdx = fDow + d - 1;
    const col = cellIdx % 7;
    const row = Math.floor(cellIdx / 7);
    targetCellPos.current = {
      x: col * cellW + cellW / 2,
      y: gridTopY + row * cellH + cellH / 2,
    };

    setFlyOrb(true);
    orbProgress.setValue(0);
    Animated.timing(orbProgress, { toValue: 1, duration: 480, useNativeDriver: true }).start(({ finished }) => {
      if (finished) {
        setFlyOrb(false);
        // 1880ms: 스탬프
        setStampDate(selectedDate);
        stampScale.setValue(2.4);
        stampOpacity.setValue(0);
        rippleScale.setValue(1);
        rippleOpacity.setValue(0.6);
        Animated.parallel([
          Animated.sequence([
            Animated.spring(stampScale, { toValue: 0.85, useNativeDriver: true, friction: 8 }),
            Animated.spring(stampScale, { toValue: 1.12, useNativeDriver: true }),
            Animated.spring(stampScale, { toValue: 1, useNativeDriver: true }),
          ]),
          Animated.timing(stampOpacity, { toValue: 1, duration: 250, useNativeDriver: true }),
        ]).start();
        // 리플
        blackTimer.current = setTimeout(() => {
          Animated.parallel([
            Animated.timing(rippleScale, { toValue: 2.8, duration: 700, useNativeDriver: true }),
            Animated.timing(rippleOpacity, { toValue: 0, duration: 700, useNativeDriver: true }),
          ]).start();
        }, 150);
        // 2280ms: 닫기
        blackTimer.current = setTimeout(() => {
          setStampDate(null);
          closeCalendar();
        }, 400);
      }
    });
  };

  const openCalendar = () => {
    setShowCal(true);
    calTransY.setValue(-SH);
    Animated.spring(calTransY, {
      toValue: 0, useNativeDriver: true,
      tension: 80, friction: 12,
    }).start();
  };

  const closeCalendar = () => {
    Animated.timing(calTransY, {
      toValue: -SH, duration: 300, useNativeDriver: true,
    }).start(() => setShowCal(false));
  };

  const goDate = (n) => setSelectedDate(prev => addDays(prev, n));

  // 카테고리 추가
  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const cat = await createCategory(userId, newCatName.trim(), newCatColor);
      setCategories(prev => [...prev, cat]);
      setNewCatName('');
      setNewCatColor(CAT_COLORS[0]);
    } catch (e) {
      Alert.alert('오류', '카테고리 추가에 실패했어요');
    }
  };

  // 카테고리 삭제
  const handleDeleteCategory = (cat) => {
    Alert.alert('카테고리 삭제', `"${cat.name}"을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        try {
          await deleteCategory(cat.id);
          setCategories(prev => prev.filter(c => c.id !== cat.id));
          setTodos(prev => prev.filter(t => t.cat_id !== cat.id));
        } catch (e) { Alert.alert('오류', '삭제에 실패했어요'); }
      }}
    ]);
  };

  // 할일 추가
  const handleAddTodo = async (catId) => {
    if (!newTodoText.trim()) { setAddingCatId(null); return; }
    const usedHues = todos.map(t => t.hue).filter(Boolean);
    const cat = categories.find(c => c.id === catId);
    const colorData = generateTodoColor(cat?.color, usedHues);
    const tempId = 'temp_' + Date.now();
    setTodos(prev => [...prev, { id: tempId, cat_id: catId, text: newTodoText.trim(), done: false, ...colorData }]);
    setNewTodoText('');
    setAddingCatId(null);
    try {
      const saved = await createTodo(userId, catId, selectedDate, newTodoText.trim(), colorData);
      setTodos(prev => prev.map(t => t.id === tempId ? saved : t));
      await upsertPaletteHistory(userId, selectedDate, paletteDrops, todos.length + 1);
    } catch (e) {
      setTodos(prev => prev.filter(t => t.id !== tempId));
      Alert.alert('오류', '할일 추가에 실패했어요');
    }
  };

  // 할일 완료 토글
  const handleToggleTodo = async (todo) => {
    const newDone = !todo.done;
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, done: newDone } : t));
    let newDrops;
    if (newDone) {
      const newDrop = {
        id: todo.id, hue: todo.hue, rgb: todo.rgb,
        color: todo.color, seed: todo.seed,
        px: 0.12 + Math.random() * 0.76,
        py: 0.12 + Math.random() * 0.76,
      };
      newDrops = [...paletteDrops, newDrop];
      setAnimDrop(newDrop);
    } else {
      newDrops = paletteDrops.filter(d => d.id !== todo.id);
      setAnimDrop(null);
    }
    setPaletteDrops(newDrops);
    try {
      await toggleTodo(todo.id, newDone);
      await upsertPaletteHistory(userId, selectedDate, newDrops, todos.length);
    } catch (e) {
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, done: !newDone } : t));
      setPaletteDrops(paletteDrops);
      Alert.alert('오류', '완료 처리에 실패했어요');
    }
  };

  // 할일 삭제
  const handleDeleteTodo = async (todo) => {
    setTodos(prev => prev.filter(t => t.id !== todo.id));
    const newDrops = paletteDrops.filter(d => d.id !== todo.id);
    setPaletteDrops(newDrops);
    setAnimDrop(null);
    try {
      await deleteTodo(todo.id);
      await upsertPaletteHistory(userId, selectedDate, newDrops, todos.length - 1);
    } catch (e) {
      Alert.alert('오류', '삭제에 실패했어요');
      loadData();
    }
  };

  // 인라인 편집
  const handleEditSave = async (todo) => {
    if (!editingText.trim() || editingText === todo.text) { setEditingId(null); return; }
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, text: editingText } : t));
    setEditingId(null);
    try { await updateTodoText(todo.id, editingText.trim()); }
    catch (e) { Alert.alert('오류', '수정에 실패했어요'); loadData(); }
  };

  // 완료된 할일 색상 믹스 (스펙 §12)
  const doneTodos = todos.filter(t => t.done);
  const firstDropColor = paletteDrops[0]?.color ?? null;
  const mixedRgb = doneTodos.length > 0 ? mixRgbList(doneTodos.map(t => t.rgb ?? [128,128,128])) : null;
  const mixedColor = mixedRgb ? rgbToHex(...mixedRgb) : null;
  const progressGradient = paletteDrops.length === 0 ? C.border
    : paletteDrops.length === 1 ? paletteDrops[0].color
    : { colors: [firstDropColor, mixedColor], start: { x: 0, y: 0 }, end: { x: 1, y: 0 } };

  // Orb 위치 보간
  const orbX = orbProgress.interpolate({ inputRange: [0, 1], outputRange: [SW / 2, targetCellPos.current.x] });
  const orbY = orbProgress.interpolate({ inputRange: [0, 1], outputRange: [SH / 2, targetCellPos.current.y] });
  const orbSize = orbProgress.interpolate({ inputRange: [0, 1], outputRange: [40, 16] });
  const orbOpacity = orbProgress.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] });

  // 캘린더 계산
  const calYear = viewMonth.y, calMonth = viewMonth.m;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const firstDow = new Date(calYear, calMonth, 1).getDay();
  const todayStr = dateKey();

  if (loading) {
    return (
      <View style={s.loading}>
        <ActivityIndicator color={C.text} size="large" />
      </View>
    );
  }

  return (
    <View style={s.root}>

      {/* ── 상단 고정 영역 (스펙 §4) ── */}
      <View style={s.topFixed}>
        {/* 헤더 */}
        <View style={s.header}>
          {/* 날짜 영역 - 왼쪽 */}
          <View style={s.dateArea}>
            <Text style={s.appLabel}>MAKEBLACK</Text>
            <View style={s.dateRow}>
              <TouchableOpacity onPress={() => goDate(-1)} style={s.dateArrow}>
                <Text style={s.dateArrowTxt}>◀</Text>
              </TouchableOpacity>
              <Text style={s.dateTxt}>{formatDateLabel(selectedDate)}</Text>
              <TouchableOpacity onPress={() => goDate(1)} style={s.dateArrow}>
                <Text style={s.dateArrowTxt}>▶</Text>
              </TouchableOpacity>
            </View>
          </View>
          {/* 버튼들 - 오른쪽 */}
          <View style={s.headerBtns}>
            <TouchableOpacity style={s.headerBtn} onPress={openCalendar}>
              <Text style={s.headerBtnTxt}>캘린더</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.headerBtn} onPress={() => setCatModalVisible(true)}>
              <Text style={s.headerBtnTxt}>카테고리</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 팔레트 캔버스 (스펙 §5) */}
        <View style={s.paletteWrap}>
          <PaletteCanvas
            drops={paletteDrops}
            totalCount={todos.length}
            size={PALETTE_SIZE}
            animDrop={animDrop}
          />
        </View>

        {/* 프로그레스바 (스펙 §12) */}
        <View style={[s.progressWrap, { width: PALETTE_SIZE }]}>
          <View style={s.progressTrack}>
            <View style={[s.progressFill, {
              width: todos.length > 0 ? `${(doneTodos.length / todos.length) * 100}%` : '0%',
              backgroundColor: isBlack ? '#333' : (mixedColor ?? C.border),
            }]} />
          </View>
          <View style={s.progressInfo}>
            <View style={s.dotsRow}>
              {paletteDrops.slice(0, 10).map(d => (
                <View key={d.id} style={[s.dot, { backgroundColor: d.color }]} />
              ))}
              {paletteDrops.length > 10 && <Text style={s.dotMore}>+{paletteDrops.length - 10}</Text>}
            </View>
            {todos.length > 0 && (
              <Text style={s.countTxt}>{doneTodos.length} / {todos.length}</Text>
            )}
          </View>
        </View>
      </View>

      {/* 구분선 */}
      <View style={s.divider} />

      {/* ── 할일 목록 (스크롤) ── */}
      <ScrollView style={s.scroll} showsVerticalScrollIndicator={false}>
        {categories.length === 0 && (
          <View style={s.emptyWrap}>
            <Text style={s.emptyEmoji}>🎨</Text>
            <Text style={s.emptyTitle}>아직 카테고리가 없어요</Text>
            <Text style={s.emptyDesc}>상단 오른쪽 카테고리 버튼을 눌러서{'\n'}첫 번째 카테고리를 만들어보세요</Text>
            <TouchableOpacity style={s.emptyBtn} onPress={() => setCatModalVisible(true)}>
              <Text style={s.emptyBtnTxt}>카테고리 만들기</Text>
            </TouchableOpacity>
          </View>
        )}

        {categories.map(cat => {
          const catTodos = todos.filter(t => t.cat_id === cat.id);
          const catDone = catTodos.filter(t => t.done).length;
          return (
            <View key={cat.id} style={s.catSection}>
              {/* 카테고리 헤더 (스펙 §9) */}
              <View style={s.catHeader}>
                <View style={[s.catPill, { backgroundColor: cat.color + '15', borderColor: cat.color + '28' }]}>
                  <View style={[s.catDot, { backgroundColor: cat.color }]} />
                  <Text style={[s.catName, { color: cat.color }]}>{cat.name}</Text>
                </View>
                {catTodos.length > 0 && (
                  <Text style={s.catCount}>{catDone}/{catTodos.length}</Text>
                )}
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  style={s.addBtn}
                  onPress={() => { setAddingCatId(cat.id); setNewTodoText(''); }}
                >
                  <Text style={s.addBtnTxt}>+</Text>
                </TouchableOpacity>
              </View>

              {/* 할일 아이템들 (스펙 §10) */}
              <View style={s.todoList}>
                {catTodos.map(todo => {
                  const isEditing = editingId === todo.id;
                  return (
                    <View key={todo.id} style={[
                      s.todoItem,
                      {
                        backgroundColor: isEditing ? C.surface : todo.done ? 'transparent' : C.card,
                        borderColor: isEditing ? C.border2 : todo.done ? C.border : C.border2,
                        opacity: todo.done && !isEditing ? 0.42 : 1,
                      }
                    ]}>
                      <TouchableOpacity
                        style={[s.checkbox, {
                          borderColor: todo.done ? (todo.color ?? C.muted) : C.border2,
                          backgroundColor: todo.done ? (todo.color ?? C.muted) : 'transparent',
                        }]}
                        onPress={() => !isEditing && handleToggleTodo(todo)}
                      >
                        {todo.done && <Text style={s.checkmark}>✓</Text>}
                      </TouchableOpacity>

                      {isEditing ? (
                        <TextInput
                          style={s.editInput}
                          value={editingText}
                          onChangeText={setEditingText}
                          autoFocus
                          onSubmitEditing={() => handleEditSave(todo)}
                          onBlur={() => handleEditSave(todo)}
                        />
                      ) : (
                        <Text
                          style={[s.todoTxt, todo.done && s.todoTxtDone]}
                          onLongPress={() => {
                            if (!todo.done) {
                              setEditingId(todo.id);
                              setEditingText(todo.text);
                            }
                          }}
                        >
                          {todo.text}
                        </Text>
                      )}

                      {isEditing ? (
                        <TouchableOpacity onPress={() => handleEditSave(todo)}>
                          <Text style={s.saveTxt}>저장</Text>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity onPress={() => handleDeleteTodo(todo)}>
                          <Text style={s.deleteTxt}>✕</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  );
                })}
              </View>

              {/* 할일 입력창 (스펙 §11) */}
              {addingCatId === cat.id && (
                <View style={s.inputRow}>
                  <TextInput
                    style={s.input}
                    value={newTodoText}
                    onChangeText={setNewTodoText}
                    placeholder="할 일을 입력하고 Enter"
                    placeholderTextColor={C.dim}
                    autoFocus
                    onSubmitEditing={() => handleAddTodo(cat.id)}
                    returnKeyType="done"
                  />
                  <TouchableOpacity style={s.inputDoneBtn} onPress={() => handleAddTodo(cat.id)}>
                    <Text style={s.inputDoneTxt}>↵</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          );
        })}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── BLACK 오버레이 (스펙 §7) ── */}
      {blackPhase && (
        <Animated.View style={[s.blackOverlay, {
          opacity: blackAnim,
          transform: [{ scale: blackScaleAnim }],
        }]}>
          <TouchableOpacity style={s.blackContent} activeOpacity={1} onPress={skipBlackSequence}>
            <Animated.View style={[s.blackOrb, {
              backgroundColor: blackPhase === 'out' ? '#000' : '#fff',
              shadowOpacity: blackPhase === 'out' ? 0 : 0.4,
            }]} />
            <Text style={s.blackTitle}>BLACK</Text>
            <Text style={s.blackSub}>모든 색이 하나가 됐어요</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── Flying Orb ── */}
      {flyOrb && (
        <Animated.View style={[s.orbBase, {
          opacity: orbOpacity,
          transform: [
            { translateX: Animated.subtract(orbX, new Animated.Value(20)) },
            { translateY: Animated.subtract(orbY, new Animated.Value(20)) },
          ],
        }]} />
      )}

      {/* ── 캘린더 시트 (스펙 §8) ── */}
      {showCal && (
        <TouchableOpacity style={s.calOverlay} activeOpacity={1} onPress={closeCalendar}>
          <Animated.View style={[s.calSheet, { transform: [{ translateY: calTransY }] }]}>
            <TouchableOpacity activeOpacity={1}>
              {/* 헤더 */}
              <View style={s.calHeader}>
                <TouchableOpacity style={s.calNavBtn} onPress={() => setViewMonth(({ y, m }) => { const d = new Date(y, m-1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}>
                  <Text style={s.calNavTxt}>‹</Text>
                </TouchableOpacity>
                <Text style={s.calTitle}>{calYear}년 {new Date(calYear, calMonth, 1).toLocaleString('ko-KR', { month: 'long' })}</Text>
                <TouchableOpacity style={s.calNavBtn} onPress={() => setViewMonth(({ y, m }) => { const d = new Date(y, m+1, 1); return { y: d.getFullYear(), m: d.getMonth() }; })}>
                  <Text style={s.calNavTxt}>›</Text>
                </TouchableOpacity>
              </View>

              {/* 요일 */}
              <View style={s.calDowRow}>
                {['일','월','화','수','목','금','토'].map((d, i) => (
                  <Text key={d} style={[s.calDow, i===0 && {color:'#ff7070'}, i===6 && {color:'#7090ff'}]}>{d}</Text>
                ))}
              </View>

              {/* 날짜 그리드 */}
              <View style={s.calGrid}>
  {Array.from({ length: firstDow }).map((_, i) => (
    <View key={`e${i}`} style={s.calCell} />
  ))}
  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(day => {
    const dk = `${calYear}-${String(calMonth+1).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const isSel = dk === selectedDate;
    const isTod = dk === todayStr;
    const dow = new Date(dk + 'T00:00:00').getDay();
    const hist = paletteHistory[dk];
    const isDone = hist?.total > 0 && (hist.drops?.length ?? 0) >= hist.total;
    const hasDrops = (hist?.drops?.length ?? 0) > 0;
    const dropOpacity = isDone ? 1 : hasDrops
      ? 0.35 + (hist.drops.length / (hist.total || hist.drops.length)) * 0.65
      : 1;

    // 날짜 숫자 색상 (스펙 §8)
    const numColor = dow === 0 ? '#ff7070'
      : dow === 6 ? '#7090ff'
      : hasDrops && !isDone ? '#f0ece6'   // 미완료 → 흰색
      : isDone ? '#444'                    // 완료 → 흐림
      : isSel ? '#f0ece6'
      : '#3a3a3a';

    // 셀 테두리
    const cellBorder = hasDrops && !isDone
      ? 'rgba(255,255,255,0.18)'   // 미완료 → 흰 테두리
      : isDone
      ? 'rgba(255,255,255,0.06)'   // 완료 → 연한 테두리
      : 'transparent';

    const isStamp = stampDate === dk;

    return (
      <TouchableOpacity
        key={day}
        style={[
          s.calCell,
          isSel && s.calCellSel,
          { borderWidth: 1, borderColor: cellBorder, borderRadius: 8 },
        ]}
        onPress={() => { setSelectedDate(dk); closeCalendar(); }}
      >
        <Animated.View style={[
          s.calDayCircle,
          isTod && s.calDayToday,
          isStamp && {
            transform: [{ scale: stampScale }],
            opacity: stampOpacity,
          },
        ]}>
          {/* 팔레트 미니 원 */}
          {hasDrops ? (
            <View style={{ width: 30, height: 30, borderRadius: 15, overflow: 'hidden', opacity: dropOpacity }}>
              <PaletteCanvas
                drops={hist.drops}
                totalCount={hist.total}
                size={30}
              />
              {/* 완료 링 */}
              {isDone && (
                <View style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  borderRadius: 15,
                  borderWidth: 1.5,
                  borderColor: 'rgba(255,255,255,0.5)',
                }} />
              )}
              {/* 완료 시 검정 오버레이 */}
              {isDone && (
                <View style={{
                  position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                  borderRadius: 15,
                  backgroundColor: 'rgba(0,0,0,0.82)',
                }} />
              )}
            </View>
          ) : (
            <View style={[s.calDayCircle, isTod && s.calDayToday]}>
              {isTod && <View style={s.calTodayDot} />}
            </View>
          )}

          {/* 리플 */}
          {isStamp && (
            <Animated.View style={[s.ripple, {
              transform: [{ scale: rippleScale }],
              opacity: rippleOpacity,
            }]} />
          )}
        </Animated.View>

        <Text style={[
          s.calDayNum,
          { color: numColor },
          isTod && { fontWeight: '700' },
          hasDrops && !isDone && { fontWeight: '600' },
        ]}>
          {day}
        </Text>
      </TouchableOpacity>
    );
  })}
</View>
            </TouchableOpacity>
          </Animated.View>
        </TouchableOpacity>
      )}

      {/* ── 카테고리 모달 ── */}
      <Modal visible={catModalVisible} animationType="slide" transparent onRequestClose={() => setCatModalVisible(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setCatModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={s.modalSheet}>
            <View style={s.modalHandle} />
            <View style={s.modalTitleRow}>
              <Text style={s.modalTitle}>카테고리 관리</Text>
              <TouchableOpacity style={s.modalCloseBtn} onPress={() => setCatModalVisible(false)}>
                <Text style={s.modalCloseTxt}>✕</Text>
              </TouchableOpacity>
            </View>
            <View style={s.colorRow}>
              {CAT_COLORS.map(c => (
                <TouchableOpacity key={c} style={[s.colorDot, { backgroundColor: c }, newCatColor === c && s.colorDotSel]} onPress={() => setNewCatColor(c)} />
              ))}
            </View>
            <View style={s.catInputRow}>
              <TextInput
                style={s.catInput}
                value={newCatName}
                onChangeText={setNewCatName}
                placeholder="새 카테고리 이름"
                placeholderTextColor={C.dim}
                onSubmitEditing={handleAddCategory}
              />
              <TouchableOpacity style={s.catInputBtn} onPress={handleAddCategory}>
                <Text style={s.catInputBtnTxt}>+</Text>
              </TouchableOpacity>
            </View>
            <FlatList
              data={categories}
              keyExtractor={item => item.id}
              style={{ maxHeight: 300 }}
              renderItem={({ item }) => (
                <View style={s.catListRow}>
                  <View style={[s.catListDot, { backgroundColor: item.color }]} />
                  <Text style={s.catListName}>{item.name}</Text>
                  <TouchableOpacity onPress={() => handleDeleteCategory(item)}>
                    <Text style={s.catDeleteTxt}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={<Text style={s.catEmptyTxt}>카테고리가 없어요</Text>}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loading: { flex: 1, backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },

  // 상단 고정
  topFixed: { flexShrink: 0, paddingTop: 52, paddingHorizontal: 18, paddingBottom: 0 },

  // 헤더 (스펙 §4)
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  dateArea: { alignItems: 'center' },
  appLabel: { fontSize: 9, color: C.dim, letterSpacing: 3, marginBottom: 2 },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dateArrow: { width: 13, opacity: 0.55 },
  dateArrowTxt: { color: C.muted, fontSize: 9 },
  dateTxt: { fontSize: 17, fontWeight: '700', color: C.text, letterSpacing: -0.5, width: 88, textAlign: 'center' },
  headerBtns: { flexDirection: 'row', gap: 6 },
  headerBtn: { height: 28, paddingHorizontal: 11, borderRadius: R.full, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center' },
  headerBtnTxt: { color: C.muted, fontSize: 11 },

  // 팔레트
  paletteWrap: { alignItems: 'center', marginBottom: 0 },

  // 프로그레스바 (스펙 §12)
  progressWrap: { alignSelf: 'center', marginTop: 10 },
  progressTrack: { height: 4, borderRadius: 4, backgroundColor: C.surface, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 4 },
  progressInfo: { flexDirection: 'row', alignItems: 'center', marginTop: 6, minHeight: 14 },
  dotsRow: { flexDirection: 'row', alignItems: 'center', gap: 4, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  dotMore: { fontSize: 9, color: C.dim },
  countTxt: { fontSize: 10, color: C.dim, marginLeft: 'auto' },

  // 구분선
  divider: { height: 1, backgroundColor: C.border, marginHorizontal: 18, marginTop: 12 },

  // 스크롤
  scroll: { flex: 1, paddingHorizontal: 18, paddingTop: 12 },

  // 빈 화면
  emptyWrap: { alignItems: 'center', paddingTop: 48, paddingHorizontal: 24, gap: 8 },
  emptyEmoji: { fontSize: 36, marginBottom: 6 },
  emptyTitle: { fontSize: 14, color: C.dim, fontWeight: '600' },
  emptyDesc: { fontSize: 12, color: C.dim, textAlign: 'center', lineHeight: 20 },
  emptyBtn: { marginTop: 12, paddingHorizontal: 28, paddingVertical: 11, backgroundColor: C.text, borderRadius: R.full },
  emptyBtnTxt: { color: '#080808', fontSize: 13, fontWeight: '700' },

  // 카테고리 (스펙 §9)
  catSection: { marginBottom: 22 },
  catHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  catPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 8, paddingRight: 12, paddingVertical: 4, borderRadius: R.full, borderWidth: 1 },
  catDot: { width: 6, height: 6, borderRadius: 3 },
  catName: { fontSize: 12, fontWeight: '600' },
  catCount: { fontSize: 10, color: C.dim },
  addBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border2, justifyContent: 'center', alignItems: 'center' },
  addBtnTxt: { color: C.muted, fontSize: 16, lineHeight: 20 },

  // 할일 아이템 (스펙 §10)
  todoList: { gap: 5 },
  todoItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13, paddingVertical: 11, borderRadius: R.md, borderWidth: 1 },
  checkbox: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
  checkmark: { color: '#080808', fontSize: 10, fontWeight: '800' },
  todoTxt: { flex: 1, fontSize: 13, color: C.text },
  todoTxtDone: { color: C.muted, textDecorationLine: 'line-through' },
  editInput: { flex: 1, fontSize: 13, color: C.text, padding: 0 },
  saveTxt: { color: '#6c8fff', fontSize: 11, fontWeight: '600', flexShrink: 0 },
  deleteTxt: { color: C.dim, fontSize: 14, padding: 2 },

  // 할일 입력창 (스펙 §11)
  inputRow: { flexDirection: 'row', gap: 7, marginTop: 7 },
  input: { flex: 1, backgroundColor: C.surface, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 11, color: C.text, fontSize: 13, borderWidth: 1, borderColor: C.border2 },
  inputDoneBtn: { width: 42, height: 42, backgroundColor: C.text, borderRadius: R.md, justifyContent: 'center', alignItems: 'center' },
  inputDoneTxt: { color: C.bg, fontSize: 18, fontWeight: '700' },

  // BLACK 오버레이 (스펙 §7)
  blackOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.97)', justifyContent: 'center', alignItems: 'center', zIndex: 300 },
  blackContent: { alignItems: 'center' },
  blackOrb: { width: 80, height: 80, borderRadius: 40, marginBottom: 28, shadowColor: '#fff', shadowRadius: 40, shadowOffset: { width: 0, height: 0 }, elevation: 10 },
  blackTitle: { fontSize: 28, letterSpacing: 8, color: '#fff', fontWeight: '200' },
  blackSub: { fontSize: 12, color: '#555', marginTop: 14, letterSpacing: 2 },

  // Flying Orb
  orbBase: { position: 'absolute', width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', shadowColor: '#fff', shadowOpacity: 0.4, shadowRadius: 20, zIndex: 350 },

  // 캘린더 (스펙 §8)
  calOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 150 },
  calSheet: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: C.surface, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, padding: 20, paddingBottom: 28 },
  calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  calNavBtn: { width: 34, height: 34, borderRadius: 17, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  calNavTxt: { color: C.muted, fontSize: 18 },
  calTitle: { fontSize: 15, fontWeight: '700', letterSpacing: -0.5, color: C.text },
  calDowRow: { flexDirection: 'row', marginBottom: 6 },
  calDow: { flex: 1, textAlign: 'center', fontSize: 10, color: C.dim },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: { width: `${100/7}%`, aspectRatio: 0.9, alignItems: 'center', justifyContent: 'center', paddingVertical: 3, paddingHorizontal: 1, borderRadius: R.sm },
  calCellSel: { backgroundColor: '#222' },
  calDayCircle: { width: 30, height: 30, borderRadius: 15, justifyContent: 'center', alignItems: 'center' },
  calDayToday: { backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: C.border2 },
  calTodayDot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.dim },
  calDayNum: { fontSize: 9, marginTop: 2 },
  ripple: { position: 'absolute', top: -4, left: -4, right: -4, bottom: -4, borderRadius: 19, borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.6)' },

  // 카테고리 모달
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: C.surface, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 48, maxHeight: '90%' },
  modalHandle: { width: 34, height: 4, borderRadius: 2, backgroundColor: '#252525', alignSelf: 'center', marginBottom: 18 },
  modalTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: C.text, letterSpacing: -0.5 },
  modalCloseBtn: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, justifyContent: 'center', alignItems: 'center' },
  modalCloseTxt: { color: C.muted, fontSize: 14 },
  colorRow: { flexDirection: 'row', gap: 7, marginBottom: 14, flexWrap: 'wrap' },
  colorDot: { width: 26, height: 26, borderRadius: 13 },
  colorDotSel: { borderWidth: 2, borderColor: '#fff' },
  catInputRow: { flexDirection: 'row', gap: 8, marginBottom: 20 },
  catInput: { flex: 1, backgroundColor: C.card, borderRadius: R.md, paddingHorizontal: 14, paddingVertical: 11, color: C.text, fontSize: 13, borderWidth: 1, borderColor: C.border2 },
  catInputBtn: { width: 42, height: 42, backgroundColor: C.text, borderRadius: R.md, justifyContent: 'center', alignItems: 'center' },
  catInputBtnTxt: { color: '#080808', fontSize: 20, fontWeight: '700' },
  catListRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, paddingHorizontal: 14, marginBottom: 6, backgroundColor: C.card, borderRadius: R.md, borderWidth: 1, borderColor: C.border },
  catListDot: { width: 10, height: 10, borderRadius: 5 },
  catListName: { flex: 1, color: C.text, fontSize: 14 },
  catDeleteTxt: { color: C.dim, fontSize: 16 },
  catEmptyTxt: { color: C.dim, fontSize: 13, textAlign: 'center', paddingVertical: 20 },
});