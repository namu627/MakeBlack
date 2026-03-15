import { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator,
  Alert, Modal, FlatList, Animated
} from 'react-native';
import { supabase } from '../../lib/supabase';
import {
  generateTodoColor, mixRgbList, rgbToHex,
  dateKey, addDays, formatDateLabel
} from '../../lib/colorMath';
import {
  fetchCategories, createCategory, deleteCategory,
  fetchTodos, createTodo, toggleTodo, deleteTodo,
  updateTodoText, fetchPaletteHistory, upsertPaletteHistory
} from '../../lib/todoService';

const CAT_COLORS = [
  '#ff6b6b','#ffd166','#06d6a0','#4ecdc4',
  '#6c8fff','#c77dff','#f77f00','#4cc9f0',
];

export default function HomeScreen() {
  const [userId, setUserId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(dateKey());
  const [categories, setCategories] = useState([]);
  const [todos, setTodos] = useState([]);
  const [paletteDrops, setPaletteDrops] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showBlack, setShowBlack] = useState(false);
  const [blackAnim] = useState(new Animated.Value(0));

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

  // 유저 세션
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id);
    });
  }, []);

  // 날짜 변경 시 데이터 로드
  useEffect(() => {
    if (!userId) return;
    loadData();
  }, [userId, selectedDate]);

  // BLACK 달성 감지
  useEffect(() => {
    if (todos.length > 0 && todos.every(t => t.done)) {
      setShowBlack(true);
      Animated.sequence([
        Animated.timing(blackAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]).start();
    } else {
      setShowBlack(false);
      blackAnim.setValue(0);
    }
  }, [todos]);

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
      setPaletteDrops(palette.drops ?? []);
    } catch (e) {
      Alert.alert('오류', '데이터를 불러오지 못했어요');
    } finally {
      setLoading(false);
    }
  };

  // ── 날짜 이동 ────────────────────────────────────────
  const goDate = (n) => setSelectedDate(prev => addDays(prev, n));

  // ── 카테고리 추가 ────────────────────────────────────
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

  // ── 카테고리 삭제 ────────────────────────────────────
  const handleDeleteCategory = (cat) => {
    Alert.alert('카테고리 삭제', `"${cat.name}"을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => {
          try {
            await deleteCategory(cat.id);
            setCategories(prev => prev.filter(c => c.id !== cat.id));
            setTodos(prev => prev.filter(t => t.cat_id !== cat.id));
          } catch (e) {
            Alert.alert('오류', '삭제에 실패했어요');
          }
        }
      }
    ]);
  };

  // ── 할일 추가 ────────────────────────────────────────
  const handleAddTodo = async (catId) => {
    if (!newTodoText.trim()) { setAddingCatId(null); return; }

    const usedHues = todos.map(t => t.hue).filter(Boolean);
    const cat = categories.find(c => c.id === catId);
    const colorData = generateTodoColor(cat?.color, usedHues);

    const tempId = 'temp_' + Date.now();
    const tempTodo = {
      id: tempId, cat_id: catId, text: newTodoText.trim(),
      done: false, date: selectedDate, ...colorData,
    };
    setTodos(prev => [...prev, tempTodo]);
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

  // ── 할일 완료 토글 ───────────────────────────────────
  const handleToggleTodo = async (todo) => {
    const newDone = !todo.done;
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, done: newDone } : t));

    let newDrops;
    if (newDone) {
      newDrops = [...paletteDrops, {
        id: todo.id, hue: todo.hue, rgb: todo.rgb,
        color: todo.color, seed: todo.seed,
        px: Math.random(), py: Math.random(),
      }];
    } else {
      newDrops = paletteDrops.filter(d => d.id !== todo.id);
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

  // ── 할일 삭제 ────────────────────────────────────────
  const handleDeleteTodo = async (todo) => {
    setTodos(prev => prev.filter(t => t.id !== todo.id));
    const newDrops = paletteDrops.filter(d => d.id !== todo.id);
    setPaletteDrops(newDrops);

    try {
      await deleteTodo(todo.id);
      await upsertPaletteHistory(userId, selectedDate, newDrops, todos.length - 1);
    } catch (e) {
      Alert.alert('오류', '삭제에 실패했어요');
      loadData();
    }
  };

  // ── 할일 텍스트 편집 ─────────────────────────────────
  const handleEditSave = async (todo) => {
    if (!editingText.trim() || editingText === todo.text) {
      setEditingId(null); return;
    }
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, text: editingText } : t));
    setEditingId(null);
    try {
      await updateTodoText(todo.id, editingText.trim());
    } catch (e) {
      Alert.alert('오류', '수정에 실패했어요');
      loadData();
    }
  };

  // ── 완료된 할일 색상 믹스 ────────────────────────────
  const doneTodos = todos.filter(t => t.done);
  const mixedColor = doneTodos.length > 0
    ? rgbToHex(...mixRgbList(doneTodos.map(t => t.rgb ?? [128,128,128])))
    : null;
  const isBlack = todos.length > 0 && todos.every(t => t.done);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#f0ece6" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ── 날짜 네비게이션 ── */}
      <View style={styles.dateNav}>
        <TouchableOpacity onPress={() => goDate(-1)} style={styles.dateBtn}>
          <Text style={styles.dateBtnText}>◀</Text>
        </TouchableOpacity>
        <Text style={styles.dateLabel}>{formatDateLabel(selectedDate)}</Text>
        <TouchableOpacity onPress={() => goDate(1)} style={styles.dateBtn}>
          <Text style={styles.dateBtnText}>▶</Text>
        </TouchableOpacity>
      </View>

      {/* ── 팔레트 프리뷰 ── */}
      <View style={[styles.palettePreview, isBlack && styles.palettePreviewBlack]}>
        {doneTodos.length === 0 ? (
          <Text style={styles.paletteEmpty}>할일을 완료하면 팔레트가 채워져요 🎨</Text>
        ) : (
          <View style={styles.paletteDotsRow}>
            {doneTodos.slice(0,10).map(t => (
              <View key={t.id} style={[styles.paletteDot, { backgroundColor: t.color ?? '#888' }]} />
            ))}
            {doneTodos.length > 10 && (
              <Text style={styles.paletteMore}>+{doneTodos.length - 10}</Text>
            )}
          </View>
        )}
        <View style={styles.progressBar}>
          <View style={[
            styles.progressFill,
            {
              width: todos.length > 0 ? `${(doneTodos.length / todos.length) * 100}%` : '0%',
              backgroundColor: mixedColor ?? '#333',
            }
          ]} />
        </View>
        <Text style={styles.progressText}>
          {doneTodos.length} / {todos.length}
        </Text>
      </View>

      {/* ── 할일 목록 ── */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>할일</Text>
        <TouchableOpacity
          style={styles.catBtn}
          onPress={() => setCatModalVisible(true)}
        >
          <Text style={styles.catBtnText}>카테고리</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {categories.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>🎨</Text>
            <Text style={styles.emptyTitle}>카테고리를 만들어보세요</Text>
            <Text style={styles.emptyDesc}>오른쪽 위 "카테고리" 버튼을 눌러{'\n'}첫 카테고리를 추가해요</Text>
            <TouchableOpacity
              style={styles.emptyBtn}
              onPress={() => setCatModalVisible(true)}
            >
              <Text style={styles.emptyBtnText}>+ 카테고리 추가</Text>
            </TouchableOpacity>
          </View>
        )}

        {categories.map(cat => {
          const catTodos = todos.filter(t => t.cat_id === cat.id);
          return (
            <View key={cat.id} style={styles.catSection}>
              <View style={styles.catHeader}>
                <View style={[styles.catDot, { backgroundColor: cat.color }]} />
                <Text style={styles.catName}>{cat.name}</Text>
                <TouchableOpacity
                  style={styles.addTodoBtn}
                  onPress={() => { setAddingCatId(cat.id); setNewTodoText(''); }}
                >
                  <Text style={styles.addTodoBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              {addingCatId === cat.id && (
                <View style={styles.todoInputRow}>
                  <TextInput
                    style={styles.todoInput}
                    value={newTodoText}
                    onChangeText={setNewTodoText}
                    placeholder="할일 입력..."
                    placeholderTextColor="#555"
                    autoFocus
                    onSubmitEditing={() => handleAddTodo(cat.id)}
                    returnKeyType="done"
                  />
                  <TouchableOpacity
                    style={styles.todoInputDone}
                    onPress={() => handleAddTodo(cat.id)}
                  >
                    <Text style={styles.todoInputDoneText}>↵</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.todoInputCancel}
                    onPress={() => setAddingCatId(null)}
                  >
                    <Text style={styles.todoInputCancelText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}

              {catTodos.map(todo => (
                <View key={todo.id} style={styles.todoRow}>
                  <TouchableOpacity
                    style={[
                      styles.checkbox,
                      todo.done && { backgroundColor: todo.color ?? '#888', borderColor: todo.color ?? '#888' }
                    ]}
                    onPress={() => handleToggleTodo(todo)}
                  >
                    {todo.done && <Text style={styles.checkmark}>✓</Text>}
                  </TouchableOpacity>

                  {editingId === todo.id ? (
                    <TextInput
                      style={styles.todoEditInput}
                      value={editingText}
                      onChangeText={setEditingText}
                      autoFocus
                      onSubmitEditing={() => handleEditSave(todo)}
                      onBlur={() => handleEditSave(todo)}
                    />
                  ) : (
                    <Text
                      style={[styles.todoText, todo.done && styles.todoTextDone]}
                      onLongPress={() => {
                        setEditingId(todo.id);
                        setEditingText(todo.text);
                      }}
                    >
                      {todo.text}
                    </Text>
                  )}

                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => handleDeleteTodo(todo)}
                  >
                    <Text style={styles.deleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              {catTodos.length === 0 && addingCatId !== cat.id && (
                <Text style={styles.catEmptyText}>+ 버튼으로 할일을 추가해요</Text>
              )}
            </View>
          );
        })}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── BLACK 달성 오버레이 ── */}
      {showBlack && (
        <Animated.View
          style={[styles.blackOverlay, { opacity: blackAnim }]}
        >
          <TouchableOpacity
            style={styles.blackContent}
            activeOpacity={1}
            onPress={() => setShowBlack(false)}
          >
            <Text style={styles.blackTitle}>BLACK</Text>
            <Text style={styles.blackSub}>모든 색이 하나가 됐어요</Text>
            <Text style={styles.blackHint}>탭하여 닫기</Text>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── 카테고리 관리 모달 ── */}
      <Modal
        visible={catModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setCatModalVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setCatModalVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <Text style={styles.modalTitle}>카테고리</Text>

            <View style={styles.colorRow}>
              {CAT_COLORS.map(c => (
                <TouchableOpacity
                  key={c}
                  style={[
                    styles.colorDot,
                    { backgroundColor: c },
                    newCatColor === c && styles.colorDotSelected,
                  ]}
                  onPress={() => setNewCatColor(c)}
                />
              ))}
            </View>

            <View style={styles.catInputRow}>
              <TextInput
                style={styles.catInput}
                value={newCatName}
                onChangeText={setNewCatName}
                placeholder="카테고리 이름"
                placeholderTextColor="#555"
                onSubmitEditing={handleAddCategory}
              />
              <TouchableOpacity style={styles.catAddBtn} onPress={handleAddCategory}>
                <Text style={styles.catAddBtnText}>추가</Text>
              </TouchableOpacity>
            </View>

            <FlatList
              data={categories}
              keyExtractor={item => item.id}
              style={styles.catList}
              renderItem={({ item }) => (
                <View style={styles.catListRow}>
                  <View style={[styles.catDot, { backgroundColor: item.color }]} />
                  <Text style={styles.catListName}>{item.name}</Text>
                  <TouchableOpacity onPress={() => handleDeleteCategory(item)}>
                    <Text style={styles.catDeleteText}>✕</Text>
                  </TouchableOpacity>
                </View>
              )}
              ListEmptyComponent={
                <Text style={styles.catEmptyText}>카테고리가 없어요</Text>
              }
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', paddingTop: 56 },
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' },

  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 20 },
  dateBtn: { padding: 8 },
  dateBtnText: { color: '#666', fontSize: 16 },
  dateLabel: { color: '#f0ece6', fontSize: 20, fontWeight: '700', minWidth: 120, textAlign: 'center' },

  palettePreview: {
    marginHorizontal: 20, marginBottom: 20,
    backgroundColor: '#141414', borderRadius: 16,
    padding: 16, gap: 10,
  },
  palettePreviewBlack: {
    backgroundColor: '#000',
    borderWidth: 1,
    borderColor: '#333',
  },
  paletteEmpty: { color: '#444', fontSize: 13, textAlign: 'center' },
  paletteDotsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  paletteDot: { width: 20, height: 20, borderRadius: 10 },
  paletteMore: { color: '#666', fontSize: 12 },
  progressBar: { height: 6, backgroundColor: '#222', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { color: '#555', fontSize: 12, textAlign: 'right' },

  listHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', paddingHorizontal: 20, marginBottom: 8,
  },
  listTitle: { color: '#f0ece6', fontSize: 16, fontWeight: '700' },
  catBtn: {
    backgroundColor: '#181818', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 6,
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  catBtnText: { color: '#888', fontSize: 13 },

  scroll: { flex: 1, paddingHorizontal: 20 },

  // 빈 화면
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { color: '#f0ece6', fontSize: 18, fontWeight: '700' },
  emptyDesc: { color: '#555', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  emptyBtn: {
    marginTop: 8, backgroundColor: '#181818',
    borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12,
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  emptyBtnText: { color: '#888', fontSize: 14 },

  catSection: { marginBottom: 20 },
  catHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catName: { color: '#888', fontSize: 13, fontWeight: '600', flex: 1 },
  addTodoBtn: {
    width: 28, height: 28, borderRadius: 8,
    backgroundColor: '#181818', justifyContent: 'center', alignItems: 'center',
  },
  addTodoBtnText: { color: '#666', fontSize: 18, lineHeight: 22 },

  todoInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  todoInput: {
    flex: 1, backgroundColor: '#181818', borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 10,
    color: '#f0ece6', fontSize: 14,
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  todoInputDone: { padding: 8 },
  todoInputDoneText: { color: '#f0ece6', fontSize: 18 },
  todoInputCancel: { padding: 8 },
  todoInputCancelText: { color: '#555', fontSize: 14 },

  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  checkbox: {
    width: 22, height: 22, borderRadius: 11,
    borderWidth: 2, borderColor: '#333',
    justifyContent: 'center', alignItems: 'center',
  },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  todoText: { flex: 1, color: '#f0ece6', fontSize: 14 },
  todoTextDone: { color: '#444', textDecorationLine: 'line-through' },
  todoEditInput: {
    flex: 1, color: '#f0ece6', fontSize: 14,
    borderBottomWidth: 1, borderBottomColor: '#444', paddingVertical: 2,
  },
  deleteBtn: { padding: 4 },
  deleteBtnText: { color: '#333', fontSize: 13 },
  catEmptyText: { color: '#333', fontSize: 13, paddingLeft: 18, paddingBottom: 4 },

  // BLACK 오버레이
  blackOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: '#000',
    justifyContent: 'center', alignItems: 'center',
    zIndex: 100,
  },
  blackContent: { alignItems: 'center', gap: 12 },
  blackTitle: {
    fontSize: 64, fontWeight: '900', color: '#f0ece6',
    letterSpacing: 8,
  },
  blackSub: { fontSize: 16, color: '#666' },
  blackHint: { fontSize: 12, color: '#333', marginTop: 40 },

  // 카테고리 모달
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: {
    backgroundColor: '#141414', borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, maxHeight: '70%',
  },
  modalTitle: { color: '#f0ece6', fontSize: 18, fontWeight: '700', marginBottom: 16 },
  colorRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  colorDotSelected: { borderWidth: 3, borderColor: '#f0ece6' },
  catInputRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  catInput: {
    flex: 1, backgroundColor: '#1e1e1e', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    color: '#f0ece6', fontSize: 14,
    borderWidth: 1, borderColor: '#2a2a2a',
  },
  catAddBtn: {
    backgroundColor: '#f0ece6', borderRadius: 10,
    paddingHorizontal: 16, justifyContent: 'center',
  },
  catAddBtnText: { color: '#0a0a0a', fontWeight: '700', fontSize: 14 },
  catList: { maxHeight: 200 },
  catListRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e1e1e',
  },
  catListName: { flex: 1, color: '#f0ece6', fontSize: 14 },
  catDeleteText: { color: '#555', fontSize: 14, padding: 4 },
});