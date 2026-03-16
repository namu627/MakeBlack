import { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  TextInput, StyleSheet, ActivityIndicator,
  Alert, Modal, FlatList
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { generateTodoColor, dateKey, addDays, formatDateLabel } from '../../lib/colorMath';
import {
  fetchMyTeams, createTeam, fetchTeamDetail,
  updateTeam, deleteTeam, leaveTeam,
  fetchTeamCategories, createTeamCategory,
  fetchTeamTodos, createTeamTodo, toggleTeamTodo, deleteTeamTodo,
  fetchTeamPaletteHistory, upsertTeamPaletteHistory,
  getMemberColor, searchUsers,
} from '../../lib/teamService';

const CAT_COLORS = [
  '#ff6b6b','#ffd166','#06d6a0','#4ecdc4',
  '#6c8fff','#c77dff','#f77f00','#4cc9f0',
];

export default function TeamScreen() {
  const [userId, setUserId] = useState(null);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [createModalVisible, setCreateModalVisible] = useState(false);
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamDesc, setNewTeamDesc] = useState('');
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadTeams();
  }, [userId]);

  const loadTeams = async () => {
    setLoading(true);
    try {
      const data = await fetchMyTeams(userId);
      setTeams(data);
    } catch (e) {
      Alert.alert('오류', '팀 목록을 불러오지 못했어요');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeam = async () => {
    if (!newTeamName.trim()) return;
    setCreating(true);
    try {
      const team = await createTeam(userId, newTeamName.trim(), newTeamDesc.trim());
      setCreateModalVisible(false);
      setNewTeamName('');
      setNewTeamDesc('');
      await loadTeams();
      setSelectedTeam(team);
    } catch (e) {
      Alert.alert('오류', '팀 생성에 실패했어요');
    } finally {
      setCreating(false);
    }
  };

  if (selectedTeam) {
    return (
      <TeamDetailScreen
        team={selectedTeam}
        userId={userId}
        onBack={() => { setSelectedTeam(null); loadTeams(); }}
      />
    );
  }

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator color="#f0ece6" size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>팀</Text>
        <TouchableOpacity style={styles.createBtn} onPress={() => setCreateModalVisible(true)}>
          <Text style={styles.createBtnText}>+ 팀 만들기</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {teams.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>👥</Text>
            <Text style={styles.emptyTitle}>팀이 없어요</Text>
            <Text style={styles.emptyDesc}>팀을 만들어 함께{'\n'}BLACK을 향해 가보세요</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setCreateModalVisible(true)}>
              <Text style={styles.emptyBtnText}>+ 팀 만들기</Text>
            </TouchableOpacity>
          </View>
        ) : (
          teams.map(team => (
            <TouchableOpacity key={team.id} style={styles.teamCard} onPress={() => setSelectedTeam(team)}>
              <View style={styles.teamCardHeader}>
                <Text style={styles.teamCardName}>{team.name}</Text>
                <Text style={styles.teamCardArrow}>→</Text>
              </View>
              {team.description ? <Text style={styles.teamCardDesc}>{team.description}</Text> : null}
            </TouchableOpacity>
          ))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      <Modal visible={createModalVisible} animationType="slide" transparent onRequestClose={() => setCreateModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCreateModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <Text style={styles.modalTitle}>팀 만들기</Text>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>팀 이름 *</Text>
              <TextInput style={styles.input} value={newTeamName} onChangeText={setNewTeamName} placeholder="팀 이름 입력" placeholderTextColor="#555" autoFocus />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>설명 (선택)</Text>
              <TextInput style={styles.input} value={newTeamDesc} onChangeText={setNewTeamDesc} placeholder="팀 설명 입력" placeholderTextColor="#555" />
            </View>
            <TouchableOpacity style={[styles.submitBtn, creating && styles.submitBtnDisabled]} onPress={handleCreateTeam} disabled={creating}>
              {creating ? <ActivityIndicator color="#0a0a0a" /> : <Text style={styles.submitBtnText}>만들기</Text>}
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ══════════════════════════════════════════════════════
// 팀 상세 화면
// ══════════════════════════════════════════════════════
function TeamDetailScreen({ team, userId, onBack }) {
  const [detail, setDetail] = useState(null);
  const [categories, setCategories] = useState([]);
  const [todos, setTodos] = useState([]);
  const [paletteDrops, setPaletteDrops] = useState([]);
  const [selectedDate, setSelectedDate] = useState(dateKey());
  const [loading, setLoading] = useState(true);
  const [myColorIndex, setMyColorIndex] = useState(0);

  // 카테고리 모달
  const [catModalVisible, setCatModalVisible] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatColor, setNewCatColor] = useState(CAT_COLORS[0]);

  // 할일 입력
  const [addingCatId, setAddingCatId] = useState(null);
  const [newTodoText, setNewTodoText] = useState('');

  // 담당자 지정
  const [selectedAssignee, setSelectedAssignee] = useState(null);
  const [assigneeModalVisible, setAssigneeModalVisible] = useState(false);

  // 초대 모달
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteSearchResults, setInviteSearchResults] = useState([]);
  const [inviting, setInviting] = useState(false);

  // 메뉴/수정 모달
  const [menuVisible, setMenuVisible] = useState(false);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState(team.name);
  const [editDesc, setEditDesc] = useState(team.description ?? '');

  const channelRef = useRef(null);
  const isOwner = detail?.created_by === userId;

  useEffect(() => {
    loadAll();
    setupRealtime();
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  useEffect(() => {
    if (!detail) return;
    loadTodos();
  }, [selectedDate, detail]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const [teamDetail, cats] = await Promise.all([
        fetchTeamDetail(team.id),
        fetchTeamCategories(team.id),
      ]);
      setDetail(teamDetail);
      setCategories(cats);
      const me = teamDetail.team_members?.find(m => m.user_id === userId);
      if (me) setMyColorIndex(me.color_index);
    } catch (e) {
      Alert.alert('오류', '팀 정보를 불러오지 못했어요');
    } finally {
      setLoading(false);
    }
  };

  const loadTodos = async () => {
    try {
      const [todosData, palette] = await Promise.all([
        fetchTeamTodos(team.id, selectedDate),
        fetchTeamPaletteHistory(team.id, selectedDate),
      ]);
      setTodos(todosData);
      setPaletteDrops(palette.drops ?? []);
    } catch (e) {}
  };

  const setupRealtime = () => {
    const channel = supabase
      .channel(`team:${team.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'team_todos',
        filter: `team_id=eq.${team.id}`,
      }, () => loadTodos())
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'team_palette_history',
        filter: `team_id=eq.${team.id}`,
      }, (payload) => {
        if (payload.new?.drops) setPaletteDrops(payload.new.drops);
      })
      .subscribe();
    channelRef.current = channel;
  };

  const goDate = (n) => setSelectedDate(prev => addDays(prev, n));

  // 카테고리 추가
  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const cat = await createTeamCategory(team.id, userId, newCatName.trim(), newCatColor);
      setCategories(prev => [...prev, cat]);
      setNewCatName('');
    } catch (e) {
      Alert.alert('오류', '카테고리 추가에 실패했어요');
    }
  };

  // 할일 추가
  const handleAddTodo = async (catId) => {
    if (!newTodoText.trim()) { setAddingCatId(null); return; }
    const usedHues = todos.map(t => t.hue).filter(Boolean);
    const memberColor = getMemberColor(myColorIndex);
    const colorData = generateTodoColor(memberColor.color, usedHues);
    const assigneeId = selectedAssignee?.user_id ?? null;

    const tempId = 'temp_' + Date.now();
    setTodos(prev => [...prev, {
      id: tempId, cat_id: catId, text: newTodoText.trim(),
      done: false, author_id: userId, assignee_id: assigneeId, ...colorData,
    }]);
    setNewTodoText('');
    setAddingCatId(null);
    setSelectedAssignee(null);

    try {
      const saved = await createTeamTodo(team.id, catId, userId, selectedDate, newTodoText.trim(), colorData, assigneeId);
      setTodos(prev => prev.map(t => t.id === tempId ? saved : t));
      await upsertTeamPaletteHistory(team.id, selectedDate, paletteDrops, todos.length + 1);
    } catch (e) {
      setTodos(prev => prev.filter(t => t.id !== tempId));
      Alert.alert('오류', '할일 추가에 실패했어요');
    }
  };

  // 할일 완료 토글
  const handleToggleTodo = async (todo) => {
    const newDone = !todo.done;
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, done: newDone } : t));
    let newDrops = newDone
      ? [...paletteDrops, { id: todo.id, hue: todo.hue, rgb: todo.rgb, color: todo.color, seed: todo.seed, px: Math.random(), py: Math.random() }]
      : paletteDrops.filter(d => d.id !== todo.id);
    setPaletteDrops(newDrops);
    try {
      await toggleTeamTodo(todo.id, newDone);
      await upsertTeamPaletteHistory(team.id, selectedDate, newDrops, todos.length);
    } catch (e) {
      setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, done: !newDone } : t));
      setPaletteDrops(paletteDrops);
      Alert.alert('오류', '완료 처리에 실패했어요');
    }
  };

  // 할일 삭제
  const handleDeleteTodo = async (todo) => {
    if (todo.author_id !== userId && !isOwner) {
      Alert.alert('권한 없음', '본인이 작성한 할일만 삭제할 수 있어요');
      return;
    }
    setTodos(prev => prev.filter(t => t.id !== todo.id));
    const newDrops = paletteDrops.filter(d => d.id !== todo.id);
    setPaletteDrops(newDrops);
    try {
      await deleteTeamTodo(todo.id);
      await upsertTeamPaletteHistory(team.id, selectedDate, newDrops, todos.length - 1);
    } catch (e) {
      Alert.alert('오류', '삭제에 실패했어요');
      loadTodos();
    }
  };

  // 초대 검색
  const handleInviteSearch = async (query) => {
    setInviteQuery(query);
    if (!query.trim()) { setInviteSearchResults([]); return; }
    try {
      const results = await searchUsers(query);
      setInviteSearchResults(results);
    } catch (e) {}
  };

  // 초대 실행
  const handleInviteUser = async (targetUser) => {
    const alreadyMember = detail?.team_members?.some(m => m.user_id === targetUser.id);
    if (alreadyMember) { Alert.alert('', '이미 팀원이에요'); return; }
    setInviting(true);
    try {
      const { data: members } = await supabase
        .from('team_members').select('color_index').eq('team_id', team.id);
      const usedIndices = members.map(m => m.color_index);
      let idx = 0;
      while (usedIndices.includes(idx)) idx++;
      const { error } = await supabase
        .from('team_members')
        .insert({ team_id: team.id, user_id: targetUser.id, color_index: idx % 8 });
      if (error) throw error;
      Alert.alert('초대 완료', `${targetUser.name}님을 팀에 추가했어요`);
      setInviteQuery('');
      setInviteSearchResults([]);
      setInviteModalVisible(false);
      loadAll();
    } catch (e) {
      Alert.alert('초대 실패', e.message);
    } finally {
      setInviting(false);
    }
  };

  // 팀 수정
  const handleEditTeam = async () => {
    try {
      await updateTeam(team.id, editName.trim(), editDesc.trim());
      setEditModalVisible(false);
      setMenuVisible(false);
      loadAll();
    } catch (e) {
      Alert.alert('오류', '팀 정보 수정에 실패했어요');
    }
  };

  // 팀 삭제
  const handleDeleteTeam = () => {
    Alert.alert('팀 삭제', `"${team.name}"을 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => {
        try { await deleteTeam(team.id); onBack(); }
        catch (e) { Alert.alert('오류', '팀 삭제에 실패했어요'); }
      }}
    ]);
  };

  // 팀 나가기
  const handleLeaveTeam = () => {
    Alert.alert('팀 나가기', `"${team.name}"에서 나갈까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: async () => {
        try { await leaveTeam(team.id, userId); onBack(); }
        catch (e) { Alert.alert('오류', '팀 나가기에 실패했어요'); }
      }}
    ]);
  };

  const doneTodos = todos.filter(t => t.done);
  const isBlack = todos.length > 0 && todos.every(t => t.done);

  if (loading) {
    return <View style={styles.loadingContainer}><ActivityIndicator color="#f0ece6" size="large" /></View>;
  }

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.detailHeader}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backBtnText}>←</Text>
        </TouchableOpacity>
        <View style={styles.detailHeaderCenter}>
          <Text style={styles.detailTeamName}>{detail?.name ?? team.name}</Text>
          {detail?.description ? <Text style={styles.detailTeamDesc}>{detail.description}</Text> : null}
        </View>
        <TouchableOpacity onPress={() => setMenuVisible(true)} style={styles.menuBtn}>
          <Text style={styles.menuBtnText}>···</Text>
        </TouchableOpacity>
      </View>

      {/* 멤버 아바타 */}
      <View style={styles.membersRow}>
        {detail?.team_members?.map(m => (
          <View key={m.user_id} style={[styles.memberAvatar, { backgroundColor: getMemberColor(m.color_index).color }]}>
            <Text style={styles.memberAvatarText}>{m.users?.name?.[0]?.toUpperCase() ?? '?'}</Text>
          </View>
        ))}
        <TouchableOpacity style={styles.inviteBtn} onPress={() => setInviteModalVisible(true)}>
          <Text style={styles.inviteBtnText}>+ 초대</Text>
        </TouchableOpacity>
      </View>

      {/* 날짜 네비 */}
      <View style={styles.dateNav}>
        <TouchableOpacity onPress={() => goDate(-1)} style={styles.dateBtn}>
          <Text style={styles.dateBtnText}>◀</Text>
        </TouchableOpacity>
        <Text style={styles.dateLabel}>{formatDateLabel(selectedDate)}</Text>
        <TouchableOpacity onPress={() => goDate(1)} style={styles.dateBtn}>
          <Text style={styles.dateBtnText}>▶</Text>
        </TouchableOpacity>
      </View>

      {/* 팔레트 프리뷰 */}
      <View style={[styles.palettePreview, isBlack && styles.palettePreviewBlack]}>
        {doneTodos.length === 0 ? (
          <Text style={styles.paletteEmpty}>팀 할일을 완료하면 팔레트가 채워져요 🎨</Text>
        ) : (
          <View style={styles.paletteDotsRow}>
            {doneTodos.slice(0, 10).map(t => (
              <View key={t.id} style={[styles.paletteDot, { backgroundColor: t.color ?? '#888' }]} />
            ))}
            {doneTodos.length > 10 && <Text style={styles.paletteMore}>+{doneTodos.length - 10}</Text>}
            {isBlack && <Text style={styles.blackBadge}>⬛ BLACK</Text>}
          </View>
        )}
        <View style={styles.progressBar}>
          <View style={[styles.progressFill, { width: todos.length > 0 ? `${(doneTodos.length / todos.length) * 100}%` : '0%' }]} />
        </View>
        <Text style={styles.progressText}>{doneTodos.length} / {todos.length}</Text>
      </View>

      {/* 할일 목록 */}
      <View style={styles.listHeader}>
        <Text style={styles.listTitle}>팀 할일</Text>
        <TouchableOpacity style={styles.catBtn} onPress={() => setCatModalVisible(true)}>
          <Text style={styles.catBtnText}>카테고리</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {categories.length === 0 && (
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyEmoji}>📋</Text>
            <Text style={styles.emptyTitle}>카테고리를 만들어보세요</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setCatModalVisible(true)}>
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
                <TouchableOpacity style={styles.addTodoBtn} onPress={() => { setAddingCatId(cat.id); setNewTodoText(''); setSelectedAssignee(null); }}>
                  <Text style={styles.addTodoBtnText}>+</Text>
                </TouchableOpacity>
              </View>

              {/* 할일 입력 */}
              {addingCatId === cat.id && (
                <View style={styles.todoInputArea}>
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
                    <TouchableOpacity style={styles.todoInputDone} onPress={() => handleAddTodo(cat.id)}>
                      <Text style={styles.todoInputDoneText}>↵</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.todoInputCancel} onPress={() => { setAddingCatId(null); setSelectedAssignee(null); }}>
                      <Text style={styles.todoInputCancelText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  {/* 담당자 선택 */}
                  <TouchableOpacity style={styles.assigneeRow} onPress={() => setAssigneeModalVisible(true)}>
                    {selectedAssignee ? (
                      <View style={styles.assigneeSelected}>
                        <View style={[styles.assigneeDot, { backgroundColor: getMemberColor(selectedAssignee.color_index ?? 0).color }]} />
                        <Text style={styles.assigneeSelectedText}>{selectedAssignee.users?.name ?? '멤버'}</Text>
                        <TouchableOpacity onPress={() => setSelectedAssignee(null)}>
                          <Text style={styles.assigneeClear}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <Text style={styles.assigneePlaceholder}>👤 담당자 지정 (선택)</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}

              {/* 할일 목록 */}
              {catTodos.map(todo => {
                const authorMember = detail?.team_members?.find(m => m.user_id === todo.author_id);
                const assigneeMember = detail?.team_members?.find(m => m.user_id === todo.assignee_id);
                return (
                  <View key={todo.id} style={styles.todoRow}>
                    <TouchableOpacity
                      style={[styles.checkbox, todo.done && { backgroundColor: todo.color ?? '#888', borderColor: todo.color ?? '#888' }]}
                      onPress={() => handleToggleTodo(todo)}
                    >
                      {todo.done && <Text style={styles.checkmark}>✓</Text>}
                    </TouchableOpacity>
                    <Text style={[styles.todoText, todo.done && styles.todoTextDone]}>{todo.text}</Text>
                    {(() => {
  const showMember = assigneeMember ?? authorMember;
  const showColor = showMember ? getMemberColor(showMember.color_index).color : '#888';
  const isAssignee = !!assigneeMember;
  return (
    <View style={[
      styles.authorBadge,
      { backgroundColor: isAssignee ? 'transparent' : showColor },
      isAssignee && { borderWidth: 1.5, borderColor: showColor }
    ]}>
      <Text style={[styles.authorBadgeText, isAssignee && { color: showColor }]}>
        {showMember?.users?.name?.[0]?.toUpperCase() ?? '?'}
      </Text>
    </View>
  );
})()}
                    <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteTodo(todo)}>
                      <Text style={styles.deleteBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                );
              })}

              {catTodos.length === 0 && addingCatId !== cat.id && (
                <Text style={styles.catEmptyText}>+ 버튼으로 할일을 추가해요</Text>
              )}
            </View>
          );
        })}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* ── 담당자 선택 모달 ── */}
      <Modal visible={assigneeModalVisible} animationType="slide" transparent onRequestClose={() => setAssigneeModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setAssigneeModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <Text style={styles.modalTitle}>담당자 지정</Text>
            <FlatList
              data={detail?.team_members ?? []}
              keyExtractor={item => item.user_id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.memberListRow}
                  onPress={() => { setSelectedAssignee(item); setAssigneeModalVisible(false); }}
                >
                  <View style={[styles.memberAvatar, { backgroundColor: getMemberColor(item.color_index).color, width: 32, height: 32, borderRadius: 16 }]}>
                    <Text style={styles.memberAvatarText}>{item.users?.name?.[0]?.toUpperCase() ?? '?'}</Text>
                  </View>
                  <Text style={styles.memberListName}>{item.users?.name}</Text>
                  <Text style={styles.memberListHandle}>{item.users?.handle}</Text>
                  {selectedAssignee?.user_id === item.user_id && <Text style={{ color: '#f0ece6' }}>✓</Text>}
                </TouchableOpacity>
              )}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 초대 모달 ── */}
      <Modal visible={inviteModalVisible} animationType="slide" transparent onRequestClose={() => setInviteModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setInviteModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <Text style={styles.modalTitle}>멤버 초대</Text>
            <Text style={styles.modalDesc}>이름 또는 @아이디로 검색해요</Text>
            <TextInput
              style={[styles.catInput, { marginBottom: 12 }]}
              value={inviteQuery}
              onChangeText={handleInviteSearch}
              placeholder="이름 또는 @아이디"
              placeholderTextColor="#555"
              autoCapitalize="none"
              autoFocus
            />
            {/* 검색 결과 */}
            {inviteSearchResults.length > 0 && (
              <View style={styles.searchResultBox}>
                {inviteSearchResults.map(u => {
                  const alreadyMember = detail?.team_members?.some(m => m.user_id === u.id);
                  return (
                    <TouchableOpacity
                      key={u.id}
                      style={[styles.searchResultRow, alreadyMember && { opacity: 0.4 }]}
                      onPress={() => !alreadyMember && handleInviteUser(u)}
                      disabled={alreadyMember}
                    >
                      <Text style={styles.searchResultName}>{u.name}</Text>
                      <Text style={styles.searchResultHandle}>{u.handle}</Text>
                      {alreadyMember
                        ? <Text style={styles.alreadyMemberText}>이미 팀원</Text>
                        : <Text style={styles.inviteDirectText}>+ 초대</Text>
                      }
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
            {/* 현재 멤버 목록 */}
            <Text style={styles.memberListTitle}>현재 멤버 ({detail?.team_members?.length ?? 0}명)</Text>
            {detail?.team_members?.map(m => (
              <View key={m.user_id} style={styles.memberListRow}>
                <View style={[styles.memberAvatar, { backgroundColor: getMemberColor(m.color_index).color, width: 28, height: 28, borderRadius: 14 }]}>
                  <Text style={styles.memberAvatarText}>{m.users?.name?.[0]?.toUpperCase() ?? '?'}</Text>
                </View>
                <Text style={styles.memberListName}>{m.users?.name}</Text>
                <Text style={styles.memberListHandle}>{m.users?.handle}</Text>
                {m.user_id === detail?.created_by && (
                  <View style={styles.ownerBadge}><Text style={styles.ownerBadgeText}>팀장</Text></View>
                )}
              </View>
            ))}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 카테고리 모달 ── */}
      <Modal visible={catModalVisible} animationType="slide" transparent onRequestClose={() => setCatModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setCatModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <Text style={styles.modalTitle}>팀 카테고리</Text>
            <View style={styles.colorRow}>
              {CAT_COLORS.map(c => (
                <TouchableOpacity key={c} style={[styles.colorDot, { backgroundColor: c }, newCatColor === c && styles.colorDotSelected]} onPress={() => setNewCatColor(c)} />
              ))}
            </View>
            <View style={styles.catInputRow}>
              <TextInput style={styles.catInput} value={newCatName} onChangeText={setNewCatName} placeholder="카테고리 이름" placeholderTextColor="#555" onSubmitEditing={handleAddCategory} />
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
                </View>
              )}
            />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 메뉴 모달 ── */}
      <Modal visible={menuVisible} animationType="fade" transparent onRequestClose={() => setMenuVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setMenuVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.menuSheet}>
            {isOwner ? (
              <>
                <TouchableOpacity style={styles.menuItem} onPress={() => { setMenuVisible(false); setEditModalVisible(true); }}>
                  <Text style={styles.menuItemText}>팀 정보 수정</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.menuItem} onPress={handleDeleteTeam}>
                  <Text style={[styles.menuItemText, { color: '#ff6b6b' }]}>팀 삭제</Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity style={styles.menuItem} onPress={handleLeaveTeam}>
                <Text style={[styles.menuItemText, { color: '#ff6b6b' }]}>팀 나가기</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 팀 정보 수정 모달 ── */}
      <Modal visible={editModalVisible} animationType="slide" transparent onRequestClose={() => setEditModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setEditModalVisible(false)}>
          <TouchableOpacity activeOpacity={1} style={styles.modalSheet}>
            <Text style={styles.modalTitle}>팀 정보 수정</Text>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>팀 이름</Text>
              <TextInput style={styles.input} value={editName} onChangeText={setEditName} placeholderTextColor="#555" />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.label}>설명</Text>
              <TextInput style={styles.input} value={editDesc} onChangeText={setEditDesc} placeholderTextColor="#555" />
            </View>
            <TouchableOpacity style={styles.submitBtn} onPress={handleEditTeam}>
              <Text style={styles.submitBtnText}>저장</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a', paddingTop: 56 },
  loadingContainer: { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 16 },
  headerTitle: { color: '#f0ece6', fontSize: 24, fontWeight: '800' },
  createBtn: { backgroundColor: '#181818', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, borderColor: '#2a2a2a' },
  createBtnText: { color: '#f0ece6', fontSize: 13, fontWeight: '600' },
  scroll: { flex: 1, paddingHorizontal: 20 },
  emptyContainer: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyEmoji: { fontSize: 48 },
  emptyTitle: { color: '#f0ece6', fontSize: 18, fontWeight: '700' },
  emptyDesc: { color: '#555', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  emptyBtn: { marginTop: 8, backgroundColor: '#181818', borderRadius: 12, paddingHorizontal: 20, paddingVertical: 12, borderWidth: 1, borderColor: '#2a2a2a' },
  emptyBtnText: { color: '#888', fontSize: 14 },
  teamCard: { backgroundColor: '#141414', borderRadius: 16, padding: 18, marginBottom: 12, borderWidth: 1, borderColor: '#1e1e1e' },
  teamCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  teamCardName: { color: '#f0ece6', fontSize: 16, fontWeight: '700' },
  teamCardArrow: { color: '#444', fontSize: 16 },
  teamCardDesc: { color: '#666', fontSize: 13, marginTop: 6 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 12, gap: 12 },
  backBtn: { padding: 4 },
  backBtnText: { color: '#f0ece6', fontSize: 22 },
  detailHeaderCenter: { flex: 1 },
  detailTeamName: { color: '#f0ece6', fontSize: 18, fontWeight: '800' },
  detailTeamDesc: { color: '#666', fontSize: 12, marginTop: 2 },
  menuBtn: { padding: 8 },
  menuBtnText: { color: '#888', fontSize: 18, letterSpacing: 2 },
  membersRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, gap: 8, marginBottom: 16, flexWrap: 'wrap' },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, justifyContent: 'center', alignItems: 'center' },
  memberAvatarText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  inviteBtn: { backgroundColor: '#181818', borderRadius: 18, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: '#2a2a2a' },
  inviteBtnText: { color: '#888', fontSize: 12 },
  dateNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 16 },
  dateBtn: { padding: 8 },
  dateBtnText: { color: '#666', fontSize: 16 },
  dateLabel: { color: '#f0ece6', fontSize: 18, fontWeight: '700', minWidth: 120, textAlign: 'center' },
  palettePreview: { marginHorizontal: 20, marginBottom: 16, backgroundColor: '#141414', borderRadius: 16, padding: 16, gap: 10 },
  palettePreviewBlack: { backgroundColor: '#000', borderWidth: 1, borderColor: '#333' },
  paletteEmpty: { color: '#444', fontSize: 13, textAlign: 'center' },
  paletteDotsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  paletteDot: { width: 20, height: 20, borderRadius: 10 },
  paletteMore: { color: '#666', fontSize: 12 },
  blackBadge: { color: '#f0ece6', fontSize: 13, fontWeight: '700', marginLeft: 8 },
  progressBar: { height: 6, backgroundColor: '#222', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3, backgroundColor: '#f0ece6' },
  progressText: { color: '#555', fontSize: 12, textAlign: 'right' },
  listHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 8 },
  listTitle: { color: '#f0ece6', fontSize: 16, fontWeight: '700' },
  catBtn: { backgroundColor: '#181818', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: '#2a2a2a' },
  catBtnText: { color: '#888', fontSize: 13 },
  catSection: { marginBottom: 20 },
  catHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  catDot: { width: 10, height: 10, borderRadius: 5 },
  catName: { color: '#888', fontSize: 13, fontWeight: '600', flex: 1 },
  addTodoBtn: { width: 28, height: 28, borderRadius: 8, backgroundColor: '#181818', justifyContent: 'center', alignItems: 'center' },
  addTodoBtnText: { color: '#666', fontSize: 18, lineHeight: 22 },
  todoInputArea: { gap: 4, marginBottom: 6 },
  todoInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  todoInput: { flex: 1, backgroundColor: '#181818', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#f0ece6', fontSize: 14, borderWidth: 1, borderColor: '#2a2a2a' },
  todoInputDone: { padding: 8 },
  todoInputDoneText: { color: '#f0ece6', fontSize: 18 },
  todoInputCancel: { padding: 8 },
  todoInputCancelText: { color: '#555', fontSize: 14 },
  assigneeRow: { paddingHorizontal: 4, paddingVertical: 6 },
  assigneeSelected: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  assigneeDot: { width: 10, height: 10, borderRadius: 5 },
  assigneeSelectedText: { color: '#f0ece6', fontSize: 13, flex: 1 },
  assigneeClear: { color: '#555', fontSize: 13 },
  assigneePlaceholder: { color: '#444', fontSize: 13 },
  assigneeBadge: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, justifyContent: 'center', alignItems: 'center' },
  assigneeBadgeText: { fontSize: 10, fontWeight: '700' },
  todoRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  checkbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#333', justifyContent: 'center', alignItems: 'center' },
  checkmark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  todoText: { flex: 1, color: '#f0ece6', fontSize: 14 },
  todoTextDone: { color: '#444', textDecorationLine: 'line-through' },
  deleteBtn: { padding: 4 },
  deleteBtnText: { color: '#333', fontSize: 13 },
  catEmptyText: { color: '#333', fontSize: 13, paddingLeft: 18, paddingBottom: 4 },
  authorBadge: { width: 22, height: 22, borderRadius: 11, justifyContent: 'center', alignItems: 'center' },
  authorBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#141414', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '75%' },
  modalTitle: { color: '#f0ece6', fontSize: 18, fontWeight: '700', marginBottom: 8 },
  modalDesc: { color: '#666', fontSize: 13, marginBottom: 12 },
  fieldGroup: { gap: 6, marginBottom: 14 },
  label: { fontSize: 13, color: '#888', marginLeft: 4 },
  input: { backgroundColor: '#1e1e1e', borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, color: '#f0ece6', fontSize: 15, borderWidth: 1, borderColor: '#2a2a2a' },
  submitBtn: { backgroundColor: '#f0ece6', borderRadius: 12, paddingVertical: 15, alignItems: 'center', marginTop: 8 },
  submitBtnDisabled: { opacity: 0.5 },
  submitBtnText: { color: '#0a0a0a', fontSize: 15, fontWeight: '700' },
  colorRow: { flexDirection: 'row', gap: 10, marginBottom: 14 },
  colorDot: { width: 28, height: 28, borderRadius: 14 },
  colorDotSelected: { borderWidth: 3, borderColor: '#f0ece6' },
  catInputRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  catInput: { flex: 1, backgroundColor: '#1e1e1e', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 14, color: '#f0ece6', fontSize: 14, borderWidth: 1, borderColor: '#2a2a2a' },  catAddBtn: { backgroundColor: '#f0ece6', borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
  catAddBtnText: { color: '#0a0a0a', fontWeight: '700', fontSize: 14 },
  catList: { maxHeight: 200 },
  catListRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  catListName: { flex: 1, color: '#f0ece6', fontSize: 14 },
  memberListTitle: { color: '#888', fontSize: 13, marginBottom: 8, marginTop: 8 },
  memberListRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  memberListName: { color: '#f0ece6', fontSize: 14, flex: 1 },
  memberListHandle: { color: '#555', fontSize: 12 },
  ownerBadge: { backgroundColor: '#2a2a2a', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  ownerBadgeText: { color: '#888', fontSize: 11 },
  searchResultBox: { backgroundColor: '#1e1e1e', borderRadius: 10, marginBottom: 12, overflow: 'hidden' },
  searchResultRow: { flexDirection: 'row', alignItems: 'center', padding: 12, borderBottomWidth: 1, borderBottomColor: '#2a2a2a' },
  searchResultName: { color: '#f0ece6', fontSize: 14, flex: 1 },
  searchResultHandle: { color: '#555', fontSize: 12, marginRight: 8 },
  alreadyMemberText: { color: '#444', fontSize: 12 },
  inviteDirectText: { color: '#6c8fff', fontSize: 12, fontWeight: '600' },
  menuSheet: { backgroundColor: '#141414', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  menuItem: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#1e1e1e' },
  menuItemText: { color: '#f0ece6', fontSize: 16 },
});