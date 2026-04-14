// ══════════════════════════════════════════════════════
// team.js — 팀 화면
// 1단계: imports + 상수
// 2단계: TeamScreen (팀 목록)
// 3단계: TeamDetailScreen (팀 상세 — state/로딩/Realtime)
// 4단계: TeamDetailScreen (액션 — 할일 CRUD, 팔레트, BLACK)
// 5단계: TeamDetailScreen (렌더 — JSX)
// 6단계: 모달 컴포넌트들 + StyleSheet
// ══════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────
// 1단계 ▼ imports + 상수
// ─────────────────────────────────────────────────────

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFocusEffect } from 'expo-router';
import {
  View, Text, ScrollView, TouchableOpacity, TextInput,
  StyleSheet, ActivityIndicator, Alert, Modal, Animated,
  Dimensions, KeyboardAvoidingView, Platform, Image, Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '../../lib/supabase';
import { dateKey, hslToRgb } from '../../lib/colorMath';
import { THEMES, radius, STORAGE_KEYS } from '../../constants/theme';
import {
  fetchMyTeams, createTeam, fetchTeamDetail,
  updateTeam, deleteTeam, leaveTeam,
  fetchTeamCategories, createTeamCategory, deleteTeamCategory,
  fetchTeamTodos, createTeamTodo, toggleTeamTodo, deleteTeamTodo,
  fetchTeamPaletteHistory, upsertTeamPaletteHistory,
  getMemberColor, searchUsers, addTeamMember,
  createJoinRequest, fetchPendingRequests, acceptJoinRequest, rejectJoinRequest,
  findTeamByCode,
} from '../../lib/teamService';
import PaletteCanvas from '../../components/PaletteCanvas';
import FlyingOrb from '../../components/FlyingOrb';

const { width: SW, height: SH } = Dimensions.get('window');

const C = THEMES.dark;
const R = radius;

const CAT_COLORS = [
  '#ff6b6b', '#ffd166', '#06d6a0', '#4ecdc4',
  '#6c8fff', '#c77dff', '#f77f00', '#4cc9f0',
];

// ── 멤버 아바타 컴포넌트 ─────────────────────────────────
const MemberAvatar = ({ member, size = 32 }) => {
  const avatarUrl = member.users?.avatar_url;
  const letter = (member.users?.name || member.users?.handle || '?')[0].toUpperCase();
  const color = getMemberColor(member?.color_index)?.color ?? '#888888';
  return (
    <View style={{
      width: size, height: size, borderRadius: size / 2,
      backgroundColor: color, overflow: 'hidden',
      alignItems: 'center', justifyContent: 'center',
    }}>
      {avatarUrl
        ? <Image source={{ uri: avatarUrl }} style={{ width: size, height: size }} />
        : <Text style={{ color: '#fff', fontSize: size * 0.4, fontWeight: '700', lineHeight: size }}>
            {letter}
          </Text>
      }
    </View>
  );
};


// 멤버 colorIndex → 팔레트 drop 데이터 생성
// getMemberColor(idx) = { hue, color(hex) } → drop { hue, rgb, color }
function memberColorToDrop(colorIndex) {
  const mc = getMemberColor(colorIndex) ?? { hue: 0, color: '#888888' };
  const rgb = hslToRgb(mc.hue, 82, 54);
  return { hue: mc.hue, rgb, color: mc.color };
}

// ══════════════════════════════════════════════════════
// 2단계 ▼ TeamScreen — 팀 목록
// ══════════════════════════════════════════════════════

export default function TeamScreen() {
  const insets = useSafeAreaInsets();

  // ── state ────────────────────────────────────────────
  const [userId, setUserId]             = useState(null);
  const [teams, setTeams]               = useState([]);
  const [loading, setLoading]           = useState(true);
  const [selectedTeam, setSelectedTeam] = useState(null);
  const [showCreate, setShowCreate]     = useState(false);
  const [searchQuery, setSearchQuery]   = useState('');
  const [teamCreatedInfo, setTeamCreatedInfo] = useState(null); // null 또는 { name, code }

  // ── 코드로 팀 참여 ────────────────────────────────────
  const [showJoin, setShowJoin]           = useState(false);
  const [joinStep, setJoinStep]           = useState('input'); // 'input' | 'preview'
  const [joinCode, setJoinCode]           = useState('');
  const [joinPreview, setJoinPreview]     = useState(null);   // { id, name, description }
  const [joinSearching, setJoinSearching] = useState(false);
  const [joinSending, setJoinSending]     = useState(false);

  // ── 세션 로드 ─────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setUserId(session.user.id);
    });
  }, []);

  useEffect(() => {
    if (!userId) return;
    loadTeams();
  }, [userId]);

  // ── Realtime: team_join_requests 변경 시 자동 새로고침 ──
  useEffect(() => {
    if (!userId) return;
    const sub = supabase
      .channel('join-requests')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'team_join_requests',
      }, () => {
        loadTeams();
      })
      .subscribe();
    return () => supabase.removeChannel(sub);
  }, [userId]);

  // ── 팀 목록 로드 ──────────────────────────────────────
  // fetchMyTeams가 team_members까지 포함하므로 fetchTeamDetail 별도 호출 불필요
  const loadTeams = async () => {
    setLoading(true);
    try {
      const data = await fetchMyTeams(userId);
      const enriched = await Promise.all(data.map(async (team) => {
        try {
          const palette = await fetchTeamPaletteHistory(team.id, dateKey());
          return {
            ...team,
            members: team.team_members ?? [],
            todayDrops: palette.drops ?? [],
            todayTotal: palette.total ?? 0,
          };
        } catch {
          return { ...team, members: team.team_members ?? [], todayDrops: [], todayTotal: 0 };
        }
      }));
      setTeams(enriched);
    } catch {
      Alert.alert('오류', '팀 목록을 불러오지 못했어요');
    } finally {
      setLoading(false);
    }
  };

  // ── 팀 생성 ──────────────────────────────────────────
  const handleCreateTeam = async ({ name, desc }) => {
    try {
      const team = await createTeam(userId, name, desc);
      setShowCreate(false);
      await loadTeams();
      const code = team.id.slice(0, 8).toUpperCase();
      setTeamCreatedInfo({ name: team.name, code });
      setSelectedTeam({ ...team, members: [], todayDrops: [], todayTotal: 0 });
    } catch {
      Alert.alert('오류', '팀 생성에 실패했어요');
    }
  };

  // ── 코드로 팀 찾기 ───────────────────────────────────
  const handleFindTeam = async () => {
    const trimmed = joinCode.trim().toUpperCase();
    if (trimmed.length < 6) {
      Alert.alert('', '팀 코드는 6자리 이상이에요');
      return;
    }
    setJoinSearching(true);
    try {
      const found = await findTeamByCode(trimmed);
      setJoinPreview(found);
      setJoinStep('preview');
    } catch (e) {
      Alert.alert('', e.message);
    } finally {
      setJoinSearching(false);
    }
  };

  // ── 참여 요청 전송 ────────────────────────────────────
  const handleSendJoinRequest = async () => {
    if (!joinPreview || !userId) return;
    const alreadyMember = teams.some(t => t.id === joinPreview.id);
    if (alreadyMember) {
      Alert.alert('', '이미 참여 중인 팀이에요');
      return;
    }
    setJoinSending(true);
    try {
      await createJoinRequest(joinPreview.id, userId);
      setShowJoin(false);
      setJoinCode('');
      setJoinStep('input');
      setJoinPreview(null);
      Alert.alert('요청 전송 완료', '방장이 수락하면 팀에 입장됩니다.');
    } catch (e) {
      Alert.alert('오류', e.message ?? '요청 전송에 실패했어요');
    } finally {
      setJoinSending(false);
    }
  };

  const closeJoinModal = () => {
    setShowJoin(false);
    setJoinCode('');
    setJoinStep('input');
    setJoinPreview(null);
  };

  // ── 팀 상세로 이동 ────────────────────────────────────
  if (selectedTeam) {
    return (
      <TeamDetailScreen
        team={selectedTeam}
        userId={userId}
        onBack={() => { setSelectedTeam(null); loadTeams(); }}
        onRefresh={loadTeams}
      />
    );
  }

  const filtered = teams.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.description ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  // ── 로딩 ─────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={C.text} />
      </View>
    );
  }

  // ── 렌더 ─────────────────────────────────────────────
  return (
    <View style={styles.root}>
      {/* 헤더 */}
      <View style={[styles.listHeader, { paddingTop: insets.top + 8 }]}>
        <View>
          <Text style={styles.listHeaderLabel}>makeblack</Text>
          <Text style={styles.listHeaderTitle}>팀</Text>
        </View>
        <View style={styles.headerBtnGroup}>
          <TouchableOpacity style={styles.joinBtn} onPress={() => setShowJoin(true)} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.joinBtnText}>코드로 참여</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={styles.createBtnText}>+ 팀 만들기</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* 검색 */}
      <View style={styles.searchWrap}>
        <TextInput
          style={styles.searchInput}
          value={searchQuery}
          onChangeText={setSearchQuery}
          placeholder="팀 검색..."
          placeholderTextColor={C.dim}
        />
      </View>

      {/* 팀 목록 */}
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
        {teams.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>◈</Text>
            <Text style={styles.emptyTitle}>아직 팀이 없어요</Text>
            <Text style={styles.emptyDesc}>+ 팀 만들기로 시작해보세요</Text>
            <TouchableOpacity style={styles.emptyBtn} onPress={() => setShowCreate(true)} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={styles.emptyBtnText}>+ 팀 만들기</Text>
            </TouchableOpacity>
          </View>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyTitle}>검색 결과가 없어요</Text>
          </View>
        ) : (
          filtered.map(team => {
            const progress = team.todayTotal > 0 ? team.todayDrops.length / team.todayTotal : 0;
            return (
              <TouchableOpacity
                key={team.id}
                style={styles.teamCard}
                onPress={() => setSelectedTeam(team)}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {/* 팔레트 미니 + 정보 */}
                <View style={styles.teamCardRow}>
                  <View style={styles.teamCardCanvas}>
                    <PaletteCanvas
                      drops={team.todayDrops}
                      totalCount={team.todayTotal}
                      size={44}
                    />
                  </View>
                  <View style={styles.teamCardInfo}>
                    <Text style={styles.teamCardName}>{team.name}</Text>
                    {team.description ? (
                      <Text style={styles.teamCardDesc} numberOfLines={1}>{team.description}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.teamCardMemberCount}>{team.members.length}명</Text>
                </View>

                {/* 멤버 색 도트 */}
                <View style={styles.memberDotsRow}>
                  {team.members.slice(0, 6).map(m => (
                    <View
                      key={m.user_id}
                      style={[styles.memberDot, { backgroundColor: getMemberColor(m?.color_index)?.color ?? '#888888' }]}
                    />
                  ))}
                  {team.members.length > 6 && (
                    <Text style={styles.memberMore}>+{team.members.length - 6}</Text>
                  )}
                </View>

                {/* 진행바 */}
                {team.todayTotal > 0 && (
                  <View style={styles.miniProgressWrap}>
                    <View style={styles.miniProgressTrack}>
                      <View style={[styles.miniProgressFill, { width: `${Math.min(progress * 100, 100)}%` }]} />
                    </View>
                    <Text style={styles.miniProgressText}>
                      {team.todayDrops.length}/{team.todayTotal} 완료
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* 팀 만들기 모달 */}
      {showCreate && (
        <CreateTeamModal
          onClose={() => setShowCreate(false)}
          onCreate={handleCreateTeam}
        />
      )}

      {/* 팀 생성 완료 모달 */}
      <Modal visible={!!teamCreatedInfo} transparent animationType="fade" onRequestClose={() => setTeamCreatedInfo(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <View style={{ backgroundColor: C.surface, borderRadius: 22, padding: 28, width: '100%', alignItems: 'center' }}>
            <Text style={{ fontSize: 32, color: '#6c8fff', marginBottom: 12 }}>◈</Text>
            <Text style={{ fontSize: 17, fontWeight: '700', color: C.text }}>팀이 만들어졌어요</Text>
            <Text style={{ fontSize: 14, color: C.muted, marginTop: 4 }}>{teamCreatedInfo?.name}</Text>
            <View style={{ backgroundColor: C.card, borderRadius: 12, padding: 14, marginTop: 16, width: '100%', alignItems: 'center' }}>
              <Text style={{ fontSize: 11, color: C.dim, marginBottom: 6 }}>팀 코드</Text>
              <Text style={{ fontSize: 24, fontWeight: '700', letterSpacing: 4, color: C.text }}>{teamCreatedInfo?.code}</Text>
            </View>
            <Text style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>코드를 멤버들에게 공유하세요</Text>
            <TouchableOpacity
              style={{ backgroundColor: C.text, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 32, marginTop: 20 }}
              onPress={() => setTeamCreatedInfo(null)}
              activeOpacity={0.7}
            >
              <Text style={{ color: C.bg, fontSize: 14, fontWeight: '600' }}>확인</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* 코드로 팀 참여 모달 */}
      {showJoin && (
        <Modal visible transparent animationType="slide" onRequestClose={closeJoinModal}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => closeJoinModal()}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <TouchableOpacity activeOpacity={1}>
                <View style={styles.modalSheet}>
                  <View style={styles.modalHandle} />

                  {/* 단계 1 — 코드 입력 */}
                  {joinStep === 'input' && (
                    <>
                      <View style={styles.modalTitleRow}>
                        <Text style={styles.modalTitle}>코드로 팀 참여</Text>
                        <TouchableOpacity onPress={() => closeJoinModal()} style={styles.modalCloseBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                          <Text style={styles.modalCloseBtnText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                      <Text style={styles.joinModalDesc}>
                        팀 코드는 팀장의 ⋯ 메뉴 → 팀 코드 보기에서 확인할 수 있어요
                      </Text>
                      <TextInput
                        style={styles.joinCodeInput}
                        value={joinCode}
                        onChangeText={t => setJoinCode(t.toUpperCase())}
                        placeholder="팀 코드 입력 (예: A1B2C3D4)"
                        placeholderTextColor={C.dim}
                        autoCapitalize="characters"
                        autoCorrect={false}
                        maxLength={8}
                        returnKeyType="search"
                        onSubmitEditing={handleFindTeam}
                      />
                      <TouchableOpacity
                        style={[styles.submitBtn, (joinCode.trim().length < 6 || joinSearching) && { opacity: 0.4 }]}
                        onPress={() => handleFindTeam()}
                        disabled={joinCode.trim().length < 6 || joinSearching}
                        activeOpacity={0.7}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      >
                        {joinSearching
                          ? <ActivityIndicator color={C.bg} />
                          : <Text style={styles.submitBtnText}>팀 찾기</Text>
                        }
                      </TouchableOpacity>
                    </>
                  )}

                  {/* 단계 2 — 팀 미리보기 */}
                  {joinStep === 'preview' && joinPreview && (
                    <>
                      <View style={styles.modalTitleRow}>
                        <TouchableOpacity
                          onPress={() => setJoinStep('input')}
                          style={styles.modalBackBtn}
                          activeOpacity={0.7}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Text style={styles.modalBackBtnText}>‹</Text>
                        </TouchableOpacity>
                        <Text style={styles.modalTitle}>팀 확인</Text>
                        <TouchableOpacity onPress={() => closeJoinModal()} style={styles.modalCloseBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                          <Text style={styles.modalCloseBtnText}>✕</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={styles.joinPreviewCard}>
                        <Text style={styles.joinPreviewName}>{joinPreview.name}</Text>
                        {joinPreview.description ? (
                          <Text style={styles.joinPreviewDesc}>{joinPreview.description}</Text>
                        ) : null}
                        <Text style={styles.joinPreviewCode}>
                          코드 {joinPreview.id.slice(0, 8).toUpperCase()}
                        </Text>
                      </View>

                      {teams.some(t => t.id === joinPreview.id) ? (
                        <View style={styles.joinAlreadyWrap}>
                          <Text style={styles.joinAlreadyText}>이미 참여 중인 팀이에요</Text>
                        </View>
                      ) : (
                        <>
                          <Text style={styles.joinPreviewNote}>
                            참여 요청을 보내면 방장이 수락 후 입장됩니다
                          </Text>
                          <TouchableOpacity
                            style={[styles.submitBtn, joinSending && { opacity: 0.4 }]}
                            onPress={() => handleSendJoinRequest()}
                            disabled={joinSending}
                            activeOpacity={0.7}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            {joinSending
                              ? <ActivityIndicator color={C.bg} />
                              : <Text style={styles.submitBtnText}>참여 요청 보내기</Text>
                            }
                          </TouchableOpacity>
                        </>
                      )}
                    </>
                  )}
                </View>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

// ══════════════════════════════════════════════════════
// 3단계 ▼ TeamDetailScreen — state + 데이터 로딩 + Realtime
// ══════════════════════════════════════════════════════

function TeamDetailScreen({ team, userId, onBack, onRefresh }) {
  const insets = useSafeAreaInsets();

  // ── 기본 데이터 state ─────────────────────────────────
  const [detail, setDetail]           = useState(null);
  const [categories, setCategories]   = useState([]);
  const [todos, setTodos]             = useState([]);
  const [paletteDrops, setPaletteDrops] = useState([]);
  const [animDrop, setAnimDrop]       = useState(null);
  const [loading, setLoading]         = useState(true);

  // ── 설정 ─────────────────────────────────────────────
  const [settings, setSettings] = useState({
    paletteSize: 'medium', teamBlackAnimationOn: true, calStartSunday: true,
  });

  const loadSettings = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (raw) setSettings(prev => ({ ...prev, ...JSON.parse(raw) }));
    } catch (_) {}
  }, []);

  useFocusEffect(useCallback(() => { loadSettings(); }, [loadSettings]));

  // ── 날짜 ─────────────────────────────────────────────
  const [selectedDate, setSelectedDate] = useState(dateKey());
  const todayKey = useMemo(() => dateKey(), []);
  // Realtime 클로저에서 최신 날짜를 참조하기 위한 ref
  const selectedDateRef = useRef(selectedDate);
  useEffect(() => { selectedDateRef.current = selectedDate; }, [selectedDate]);

  // ── BLACK 달성 ────────────────────────────────────────
  const [blackPhase, setBlackPhase]   = useState(null); // null | 'in' | 'text' | 'orb' | 'stamp'
  const blackFadeAnim  = useRef(new Animated.Value(0)).current;
  const blackTextAnim  = useRef(new Animated.Value(0)).current;
  const blackTimer     = useRef(null);
  const prevIsBlack    = useRef(false);
  const blackShownDates = useRef(new Set());

  // 토글 중복 실행 방지 (빠른 더블탭 시 낙관적 업데이트 중복 방지)
  const pendingTodoIds = useRef(new Set());

  // ── Flying Orb ───────────────────────────────────────
  const [flyOrb, setFlyOrb]           = useState(null);

  // ── 스탬프 애니메이션 ──────────────────────────────────
  const [stampDate, setStampDate]     = useState(null);
  const stampScale    = useRef(new Animated.Value(2.4)).current;
  const stampOpacity  = useRef(new Animated.Value(0)).current;
  const rippleScale   = useRef(new Animated.Value(1)).current;
  const rippleOpacity = useRef(new Animated.Value(0)).current;
  const rippleScale2  = useRef(new Animated.Value(1)).current;
  const rippleOpacity2 = useRef(new Animated.Value(0)).current;

  // ── 캘린더 ───────────────────────────────────────────
  const [showCal, setShowCal]         = useState(false);
  const [calClosing, setCalClosing]   = useState(false);
  const calTransY = useRef(new Animated.Value(-SH * 0.5)).current;
  const [viewMonth, setViewMonth]     = useState(() => {
    const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() };
  });

  const [viewingMember, setViewingMember] = useState(null);

  // ── 캘린더 셀 ref (FlyingOrb 좌표 계산용) ─────────────
  const targetCellRef = useRef(null);

  // ── 참여 요청 (방장용) ────────────────────────────────
  const [joinRequests, setJoinRequests] = useState([]);

  // ── 카테고리 모달 ─────────────────────────────────────
  const [showCatModal, setShowCatModal] = useState(false);
  const [newCatName, setNewCatName]   = useState('');
  const [newCatColor, setNewCatColor] = useState(CAT_COLORS[0]);

  // ── 할일 입력 ─────────────────────────────────────────
  const [addingCatId, setAddingCatId] = useState(null);
  const [newTodoText, setNewTodoText] = useState('');
  const inputRef = useRef(null);

  // ── 담당자 지정 ───────────────────────────────────────
  const [assigneeCatId, setAssigneeCatId] = useState(null); // 담당자 지정 중인 catId
  const [selectedAssignee, setSelectedAssignee] = useState(null); // { user_id, color_index }

  // ── 초대 모달 ─────────────────────────────────────────
  const [showInvite, setShowInvite]   = useState(false);
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteResults, setInviteResults] = useState([]);
  const [inviting, setInviting]       = useState(false);

  // ── 메뉴 / 팀 수정 ────────────────────────────────────
  const [showMenu, setShowMenu]       = useState(false);
  const [showEditTeam, setShowEditTeam] = useState(false);
  const [editName, setEditName]       = useState(team.name);
  const [editDesc, setEditDesc]       = useState(team.description ?? '');

  // ── Realtime 채널 ─────────────────────────────────────
  const channelRef = useRef(null);

  // ── 파생 값 ──────────────────────────────────────────
  const members       = detail?.team_members ?? [];
  // user_id → member 맵 (O(1) 조회용) — toggle마다 find() 반복 방지
  const membersMap    = useMemo(
    () => Object.fromEntries(members.map(m => [m.user_id, m])),
    [members],
  );
  const isOwner       = detail?.created_by === userId;
  const myColorIndex  = detail?.team_members?.find(m => m.user_id === userId)?.color_index ?? 0;
  const myColor       = getMemberColor(myColorIndex) ?? { hue: 220, color: '#6c8fff' };
  const isToday  = selectedDate === todayKey;
  const doneCount  = todos.filter(t => t.done).length;
  const totalCount = todos.length;
  const isBlack  = totalCount > 0 && doneCount === totalCount;

  // ── 초기 로드 ─────────────────────────────────────────
  useEffect(() => {
    loadAll();
    setupRealtime();
    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      clearTimeout(blackTimer.current);
    };
  }, []);

  // 날짜 변경 시 할일 + 팔레트 재로드
  useEffect(() => {
    if (!detail) return;
    loadTodos();
  }, [selectedDate, detail]);

  // 날짜 변경 시 BLACK 상태 초기화
  useEffect(() => {
    setBlackPhase(null);
    clearTimeout(blackTimer.current);
    prevIsBlack.current = false;
  }, [selectedDate]);

  // ── 팀 상세 + 카테고리 로드 ──────────────────────────
  const loadAll = async () => {
    setLoading(true);
    try {
      const [teamDetail, cats] = await Promise.all([
        fetchTeamDetail(team.id),
        fetchTeamCategories(team.id),
      ]);
      setDetail(teamDetail);
      setCategories(cats);
      // 방장이면 참여 요청도 로드
      if (teamDetail.created_by === userId) {
        fetchPendingRequests(team.id).then(setJoinRequests).catch(() => {});
      }
    } catch {
      Alert.alert('오류', '팀 정보를 불러오지 못했어요');
    } finally {
      setLoading(false);
    }
  };

  // ── 할일 + 팔레트 로드 ───────────────────────────────
  const loadTodos = async () => {
    try {
      const [todosData, palette] = await Promise.all([
        fetchTeamTodos(team.id, selectedDate),
        fetchTeamPaletteHistory(team.id, selectedDate),
      ]);
      setTodos(todosData);
      setPaletteDrops(palette.drops ?? []);
    } catch { /* 조용히 실패 */ }
  };

  // ── Supabase Realtime 구독 ────────────────────────────
  const setupRealtime = () => {
    const channel = supabase
      .channel(`team-detail:${team.id}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'team_todos',
        filter: `team_id=eq.${team.id}`,
      }, () => {
        // 낙관적 업데이트 진행 중이면 스킵 — loadTodos가 덮어쓰기 방지
        if (pendingTodoIds.current.size > 0) return;
        loadTodos();
      })
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'team_palette_history',
        filter: `team_id=eq.${team.id}`,
      }, (payload) => {
        // selectedDateRef로 최신 날짜 참조 (stale closure 방지)
        if (payload.new?.date === selectedDateRef.current) {
          setPaletteDrops(payload.new.drops ?? []);
        }
      })
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'team_members',
        filter: `team_id=eq.${team.id}`,
      }, () => loadAll())
      .subscribe();
    channelRef.current = channel;
  };

  // ── 날짜 이동 ─────────────────────────────────────────
  const goDay = (delta) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + delta);
    const dk = dateKey(d);
    setSelectedDate(dk);
    setViewMonth({ y: d.getFullYear(), m: d.getMonth() });
  };

  const goMonth = (delta) => setViewMonth(({ y, m }) => {
    const d = new Date(y, m + delta, 1);
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  // ══════════════════════════════════════════════════════
  // 4단계 ▼ 액션 핸들러
  // ══════════════════════════════════════════════════════

  /**
   * handleToggleTeamTodo
   * ① 낙관적 업데이트 (로컬 state 먼저)
   * ② 완료: 담당자(또는 작성자) colorIndex 기반 drop 생성 → animDrop 트리거
   *    취소: drop 제거 → blackShownDates key 삭제 → BLACK 초기화
   * ③ Supabase team_todos / team_palette_history 동기화
   * ④ 실패 시 롤백
   */
  const handleToggleTeamTodo = async (todo) => {
    if (pendingTodoIds.current.has(todo.id)) return;
    pendingTodoIds.current.add(todo.id);
    const willDone = !todo.done;
    const dk = selectedDate;

    // ── ① 낙관적 로컬 업데이트 ──
    const prevTodos = todos;
    const prevDrops = paletteDrops;
    setTodos(prev => prev.map(t => t.id === todo.id ? { ...t, done: willDone } : t));

    let newDrops = [...paletteDrops];
    let newAnimDrop = null;

    if (willDone) {
      // 중복 drop 방지
      if (!newDrops.some(d => d.id === todo.id)) {
        // 담당자 > 작성자 > 현재 유저 순으로 colorIndex 결정 (membersMap O(1) 조회)
        const assigneeIdx = (() => {
          if (todo.assignee_id) {
            const m = membersMap[todo.assignee_id];
            if (m) return m.color_index;
          }
          const author = membersMap[todo.author_id];
          return author ? author.color_index : myColorIndex;
        })();

        // todo에 저장된 색이 있으면 우선 사용, 없으면 담당자 색 기반 생성
        const colorData =
          todo.hue != null && Array.isArray(todo.rgb) && todo.rgb.length === 3
            ? { hue: todo.hue, rgb: todo.rgb, color: todo.color }
            : memberColorToDrop(assigneeIdx);

        const px   = 0.12 + Math.random() * 0.76;
        const py   = 0.12 + Math.random() * 0.76;
        const seed = todo.seed ?? Math.random() * 99999;
        const drop = { id: todo.id, ...colorData, px, py, seed };

        newDrops    = [...newDrops, drop];
        newAnimDrop = drop;
      }
    } else {
      // 완료 취소 → drop 제거 + BLACK 상태 초기화
      newDrops = newDrops.filter(d => d.id !== todo.id);
      const key = `${team.id}:${dk}:${totalCount}`;
      blackShownDates.current.delete(key);
      setBlackPhase(null);
      clearTimeout(blackTimer.current);
      prevIsBlack.current = false;
    }

    const newTotal = todos.length;
    const newDone  = willDone
      ? todos.filter(t => t.done).length + 1
      : todos.filter(t => t.done).length - 1;
    // isLast: 이번 toggle로 마지막 할일이 완료되는 순간
    const isLast = willDone && newDone === newTotal && newTotal > 0;

    setPaletteDrops(newDrops);

    // animDrop 트리거 — null flush 후 새 drop 주입
    if (newAnimDrop) {
      setAnimDrop(null);
      setTimeout(() => setAnimDrop({ ...newAnimDrop, isLast }), 0);
    }

    // ── ② Supabase 동기화 (백그라운드) ──
    try {
      await toggleTeamTodo(todo.id, willDone);
      await upsertTeamPaletteHistory(team.id, dk, newDrops, newTotal);
    } catch {
      // ── ③ 롤백 ──
      setTodos(prevTodos);
      setPaletteDrops(prevDrops);
      setAnimDrop(null);
      Alert.alert('오류', '업데이트에 실패했어요');
    } finally {
      pendingTodoIds.current.delete(todo.id);
    }
  };

  /**
   * handleAddTeamTodo
   * ① 담당자 지정 (selectedAssignee 또는 본인)
   * ② 담당자 colorIndex 기반 hue / rgb / color 생성
   * ③ 낙관적 로컬 추가 (임시 id) → Supabase INSERT → 실제 id 교체
   */
  const handleAddTeamTodo = async (catId) => {
    const text = newTodoText.trim();
    if (!text) { setAddingCatId(null); return; }

    // 담당자: 명시적으로 지정된 멤버 또는 현재 유저
    const assignee = selectedAssignee ?? { user_id: userId, color_index: myColorIndex };
    const colorData = memberColorToDrop(assignee.color_index);
    const seed = (Math.floor(Math.random() * 99999) + 1) * 31;
    const assigneeId = assignee.user_id !== userId ? assignee.user_id : null;

    // 낙관적 추가
    const tempId  = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const newTodo = {
      id: tempId,
      team_id: team.id,
      cat_id: catId,
      author_id: userId,
      assignee_id: assigneeId,
      date: selectedDate,
      text,
      done: false,
      ...colorData,
      seed,
    };
    setTodos(prev => [...prev, newTodo]);
    setNewTodoText('');
    setAddingCatId(null);
    setSelectedAssignee(null);

    try {
      const created = await createTeamTodo(
        team.id, catId, userId, selectedDate, text,
        { ...colorData, seed },
        assigneeId,
      );
      // 임시 id → 실제 id 교체
      setTodos(prev => prev.map(t => t.id === tempId ? created : t));
    } catch {
      // 롤백
      setTodos(prev => prev.filter(t => t.id !== tempId));
      Alert.alert('오류', '할일 추가에 실패했어요');
    }
  };

  /**
   * handleDeleteTeamTodo
   */
  const handleDeleteTeamTodo = async (todoId) => {
    const prevTodos = todos;
    const prevDrops = paletteDrops;
    setTodos(prev => prev.filter(t => t.id !== todoId));
    const newDrops = paletteDrops.filter(d => d.id !== todoId);
    setPaletteDrops(newDrops);
    try {
      await deleteTeamTodo(todoId);
      await upsertTeamPaletteHistory(team.id, selectedDate, newDrops, todos.length - 1);
    } catch {
      setTodos(prevTodos);
      setPaletteDrops(prevDrops);
      Alert.alert('오류', '삭제에 실패했어요');
    }
  };

  /**
   * handleAnimDone — PaletteCanvas 애니메이션 완료 콜백
   * wasLast이면 BLACK 달성 페이즈 시작
   */
  const handleAnimDone = useCallback(() => {
    const wasLast = animDrop?.isLast;
    setAnimDrop(null);
    if (!wasLast) return;
    if (!settings.teamBlackAnimationOn) return;
    const key = `${team.id}:${selectedDate}:${totalCount}`;
    if (!blackShownDates.current.has(key)) {
      blackShownDates.current.add(key);
      setBlackPhase('in');
    }
  }, [animDrop, selectedDate, totalCount, team.id, settings.teamBlackAnimationOn]);

  // ── 멤버 초대 ─────────────────────────────────────────
  const handleInviteSearch = async (query) => {
    setInviteQuery(query);
    if (!query.trim()) { setInviteResults([]); return; }
    try {
      const results = await searchUsers(query);
      setInviteResults(results);
    } catch (_) {}
  };

  const handleInviteUser = async (targetUser) => {
    const alreadyMember = detail?.team_members?.some(m => m.user_id === targetUser.id);
    if (alreadyMember) { Alert.alert('', '이미 팀원이에요'); return; }
    setInviting(true);
    try {
      // 방장이 초대 → 바로 팀원 추가 (참여 요청 불필요)
      await addTeamMember(team.id, targetUser.id);
      setInviteQuery('');
      setInviteResults([]);
      setShowInvite(false);
      loadAll(); // 팀 상세 새로고침
      Alert.alert('초대 완료', `${targetUser.name}님이 팀에 추가됐어요.`);
    } catch (e) {
      Alert.alert('초대 실패', e.message);
    } finally {
      setInviting(false);
    }
  };

  const handleAcceptRequest = async (req) => {
    try {
      await acceptJoinRequest(req.id, team.id, req.requester_id);
      setJoinRequests(prev => prev.filter(r => r.id !== req.id));
      loadAll();
      onRefresh?.();
    } catch (e) {
      Alert.alert('오류', '수락에 실패했어요');
    }
  };

  const handleRejectRequest = async (req) => {
    try {
      await rejectJoinRequest(req.id);
      setJoinRequests(prev => prev.filter(r => r.id !== req.id));
    } catch (e) {
      Alert.alert('오류', '거절에 실패했어요');
    }
  };

  // ══════════════════════════════════════════════════════
  // 5단계 ▼ 캘린더 + BLACK 페이즈
  // ══════════════════════════════════════════════════════

  // 팀 팔레트 히스토리 (캘린더 셀 표시용)
  const [monthHistory, setMonthHistory] = useState({});

  // 월 변경 시 team_palette_history 로드
  useEffect(() => {
    if (!detail) return;
    const { y, m } = viewMonth;
    const pad = n => String(n).padStart(2, '0');
    const startDate = `${y}-${pad(m + 1)}-01`;
    const endDate   = `${y}-${pad(m + 1)}-${new Date(y, m + 1, 0).getDate()}`;
    supabase
      .from('team_palette_history')
      .select('date, drops, total')
      .eq('team_id', team.id)
      .gte('date', startDate)
      .lte('date', endDate)
      .then(({ data }) => {
        const map = {};
        (data ?? []).forEach(row => { map[row.date] = { drops: row.drops ?? [], total: row.total ?? 0 }; });
        setMonthHistory(map);
      })
      .catch(() => {});
  }, [viewMonth, detail]);

  // 현재 날짜의 팔레트 변경 시 monthHistory 동기화
  useEffect(() => {
    setMonthHistory(prev => ({
      ...prev,
      [selectedDate]: { drops: paletteDrops, total: totalCount },
    }));
  }, [paletteDrops, totalCount]);

  // ── 캘린더 계산값 ─────────────────────────────────────
  const calYear     = viewMonth.y;
  const calMonth    = viewMonth.m;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const rawDow1  = new Date(calYear, calMonth, 1).getDay();
  const firstDow = settings.calStartSunday ? rawDow1 : (rawDow1 + 6) % 7;
  const monthName   = new Date(calYear, calMonth, 1).toLocaleString('ko-KR', { month: 'long' });

  // ── 캘린더 열기 / 닫기 ───────────────────────────────
  const openCalendar = () => {
    calTransY.setValue(-SH * 0.5);
    setShowCal(true);
    Animated.timing(calTransY, {
      toValue: 0, duration: 220,
      useNativeDriver: true,
    }).start();
  };

  const closeCalendar = (cb) => {
    setCalClosing(true);
    Animated.timing(calTransY, {
      toValue: -SH * 0.5, duration: 220,
      useNativeDriver: true,
    }).start(() => {
      setShowCal(false);
      setCalClosing(false);
      if (cb) cb();
    });
  };

  // ── getTargetCellPos — measureInWindow 없이 수학으로 셀 중심 계산 ──
  const getTargetCellPos = (dateStr) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    // calStartSunday 설정 반영 (캘린더 렌더링의 firstDow와 동일한 계산)
    const rawDow1  = new Date(y, m - 1, 1).getDay();
    const firstDay = settings.calStartSunday ? rawDow1 : (rawDow1 + 6) % 7;
    const cellIndex = firstDay + d - 1;
    const col = cellIndex % 7;
    const row = Math.floor(cellIndex / 7);

    const cellW = (SW - 36) / 7;  // paddingHorizontal 18×2 = 36
    const cellH = 50;              // paddingVertical(3*2) + circle(30) + gap(2) + dayNum(~12)
    const ROW_GAP = 3;

    // calSheet paddingTop: insets.top + 16 (inline style)
    const sheetTop = insets.top + 16;
    // calHeader(34 + marginBottom 16) + calDowRow(~14 + marginBottom 6) = 70
    const headerH  = 70;

    const cellX = 18 + col * cellW + cellW / 2;
    const cellY = sheetTop + headerH + row * (cellH + ROW_GAP) + cellH / 2;

    return { x: cellX, y: cellY };
  };

  // ── BLACK 페이즈 useEffect ────────────────────────────

  // 'in' — 검정 오버레이 페이드인 + 캘린더 열기
  useEffect(() => {
    if (blackPhase !== 'in') return;
    blackFadeAnim.setValue(0);
    openCalendar();
    Animated.timing(blackFadeAnim, {
      toValue: 0.6, duration: 300, useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setBlackPhase('text');
    });
  }, [blackPhase]);

  // 'text' — 200ms 페이드인 → 700ms 표시 → 200ms 페이드아웃 → 'orb'
  useEffect(() => {
    if (blackPhase !== 'text') return;
    let cancelled = false;
    blackTextAnim.setValue(0);
    Animated.timing(blackTextAnim, {
      toValue: 1, duration: 200, useNativeDriver: true,
    }).start(() => {
      if (cancelled) return;
      blackTimer.current = setTimeout(() => {
        if (cancelled) return;
        Animated.timing(blackTextAnim, {
          toValue: 0, duration: 200, useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished && !cancelled) setBlackPhase('orb');
        });
      }, 700);
    });
    return () => {
      cancelled = true;
      clearTimeout(blackTimer.current);
    };
  }, [blackPhase]);

  // 'orb' — measureInWindow로 선택 셀 중심 좌표 결정 (실제 레이아웃 기반)
  useEffect(() => {
    if (blackPhase !== 'orb') return;
    const measure = () => {
      if (targetCellRef.current) {
        targetCellRef.current.measureInWindow((x, y, width, height) => {
          if (width > 0 && height > 0) {
            setFlyOrb({ toX: x + width / 2, toY: y + height / 2 });
          } else {
            const pos = getTargetCellPos(selectedDate);
            setFlyOrb({ toX: pos.x, toY: pos.y });
          }
        });
      } else {
        const pos = getTargetCellPos(selectedDate);
        setFlyOrb({ toX: pos.x, toY: pos.y });
      }
    };
    const t = setTimeout(measure, 80);
    return () => clearTimeout(t);
  }, [blackPhase]);

  // 'stamp' — 스탬프 리플 + 오버레이 페이드아웃
  useEffect(() => {
    if (blackPhase !== 'stamp') return;
    setFlyOrb(null);
    setStampDate(selectedDate);

    Animated.timing(blackFadeAnim, {
      toValue: 0, duration: 500, useNativeDriver: true,
    }).start();

    stampScale.setValue(2.4);
    stampOpacity.setValue(0);
    rippleScale.setValue(1);
    rippleOpacity.setValue(0);
    rippleScale2.setValue(1);
    rippleOpacity2.setValue(0);
    Animated.parallel([
      // 스탬프 도장 애니메이션
      Animated.timing(stampScale,   { toValue: 1, duration: 300, useNativeDriver: true }),
      Animated.timing(stampOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
      // 1차 리플 — 즉시 시작, 넓게 퍼짐
      Animated.sequence([
        Animated.delay(40),
        Animated.parallel([
          Animated.timing(rippleScale,   { toValue: 5.5, duration: 550, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(rippleOpacity, { toValue: 0.85, duration: 60,  useNativeDriver: true }),
            Animated.timing(rippleOpacity, { toValue: 0,    duration: 490, useNativeDriver: true }),
          ]),
        ]),
      ]),
      // 2차 리플 — 약간 늦게, 더 크게
      Animated.sequence([
        Animated.delay(200),
        Animated.parallel([
          Animated.timing(rippleScale2,   { toValue: 4.0, duration: 480, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(rippleOpacity2, { toValue: 0.55, duration: 60,  useNativeDriver: true }),
            Animated.timing(rippleOpacity2, { toValue: 0,    duration: 420, useNativeDriver: true }),
          ]),
        ]),
      ]),
    ]).start(() => {
      blackTimer.current = setTimeout(() => {
        closeCalendar();
        setBlackPhase(null);
        setStampDate(null);
      }, 250);
    });

    return () => { if (blackTimer.current) clearTimeout(blackTimer.current); };
  }, [blackPhase, selectedDate]);

  // ── renderCalendarMiniPalette ─────────────────────────
  // index.js와 동일 — Canvas 대신 색상 blob 근사 렌더링
  const renderCalendarMiniPalette = (drops, total, isDone, size = 30) => {
    const opacity = isDone
      ? 1
      : 0.35 + (drops.length / (total || drops.length)) * 0.65;

    const positions = [
      { top: -size * 0.06, left:  -size * 0.06 },
      { top: -size * 0.06, right: -size * 0.06 },
      { bottom: -size * 0.06, left:  -size * 0.06 },
      { bottom: -size * 0.06, right: -size * 0.06 },
    ];

    return (
      <View style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', opacity }}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: '#0d0c0b', borderRadius: size / 2 }]} />
        {drops.slice(0, 4).map((d, i) => (
          <View
            key={d.id ?? i}
            style={[
              { position: 'absolute', width: size * 0.72, height: size * 0.72,
                borderRadius: size * 0.36, backgroundColor: d.color, opacity: 0.68 },
              positions[i % 4],
            ]}
          />
        ))}
        {isDone && (
          <View style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.82)', borderRadius: size / 2 }]} />
        )}
      </View>
    );
  };

  // ── renderCalendarView ─ absoluteFill (index.js와 동일) ──
  const renderCalendarView = () => {
    if (!showCal && !calClosing) return null;

    const DOW_LABELS = settings.calStartSunday
      ? ['일', '월', '화', '수', '목', '금', '토']
      : ['월', '화', '수', '목', '금', '토', '일'];
    const emptyCells = Array.from({ length: firstDow });
    const dayCells   = Array.from({ length: daysInMonth }, (_, i) => i + 1);

    return (
      <View
        style={[StyleSheet.absoluteFill, { zIndex: 100 }]}
        pointerEvents={showCal ? 'auto' : 'none'}
      >
        <TouchableOpacity style={calStyles.calOverlay} activeOpacity={1} onPress={() => closeCalendar()}>
          <Animated.View style={[calStyles.calSheet, { transform: [{ translateY: calTransY }], paddingTop: insets.top + 16 }]}>
            <TouchableOpacity activeOpacity={1} onPress={() => {}}>

              {/* 월 이동 헤더 */}
              <View style={calStyles.calHeader}>
                <TouchableOpacity onPress={() => goMonth(-1)} style={calStyles.calNavBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={calStyles.calNavText}>‹</Text>
                </TouchableOpacity>
                <Text style={calStyles.calTitle}>{calYear}년 {monthName}</Text>
                <TouchableOpacity onPress={() => goMonth(1)} style={calStyles.calNavBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={calStyles.calNavText}>›</Text>
                </TouchableOpacity>
              </View>

              {/* 요일 헤더 */}
              <View style={calStyles.calDowRow}>
                {DOW_LABELS.map((d, i) => (
                  <Text
                    key={d}
                    style={[calStyles.calDowText, i === 0 && { color: '#ff7070' }, i === 6 && { color: '#7090ff' }]}
                  >
                    {d}
                  </Text>
                ))}
              </View>

              {/* 날짜 그리드 */}
              <View style={calStyles.calGrid}>
                {emptyCells.map((_, i) => <View key={`e${i}`} style={calStyles.calCell} />)}

                {dayCells.map(day => {
                  const dk  = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                  const isSel  = dk === selectedDate;
                  const isTod  = dk === todayKey;
                  const hist   = monthHistory[dk];
                  const drops  = hist?.drops ?? [];
                  const total  = hist?.total ?? 0;
                  const dow    = new Date(dk + 'T00:00:00').getDay();
                  const isDone = total > 0 && drops.length >= total;
                  const hasDrops = drops.length > 0;
                  const isStamp  = stampDate === dk;

                  const numColor =
                    dow === 0 ? '#ff7070'
                    : dow === 6 ? '#7090ff'
                    : hasDrops && !isDone ? C.text
                    : isDone ? '#444444'
                    : '#3a3a3a';

                  const cellBorder = hasDrops && !isDone
                    ? { borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }
                    : isDone
                    ? { borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }
                    : {};

                  return (
                    <TouchableOpacity
                      key={day}
                      ref={isSel ? targetCellRef : null}
                      onPress={() => { setSelectedDate(dk); closeCalendar(); }}
                      style={[calStyles.calCell, isSel && calStyles.calCellSel, cellBorder]}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <Animated.View
                        style={[
                          calStyles.calCircle,
                          isStamp && { transform: [{ scale: stampScale }], opacity: stampOpacity },
                        ]}
                      >
                        {hasDrops ? (
                          renderCalendarMiniPalette(drops, total, isDone, 30)
                        ) : (
                          <View style={[
                            calStyles.calCirclePlain,
                            isTod && calStyles.calCircleToday,
                            isSel && !isTod && calStyles.calCircleSel,
                          ]}>
                            {isTod && <View style={calStyles.calTodayDot} />}
                          </View>
                        )}
                        {isDone && hasDrops && <View style={calStyles.calDoneRing} />}
                        {isStamp && (
                          <>
                            <Animated.View style={[
                              calStyles.calRipple,
                              { transform: [{ scale: rippleScale }], opacity: rippleOpacity },
                            ]} />
                            <Animated.View style={[
                              calStyles.calRipple,
                              calStyles.calRipple2,
                              { transform: [{ scale: rippleScale2 }], opacity: rippleOpacity2 },
                            ]} />
                          </>
                        )}
                      </Animated.View>

                      <Text
                        style={[
                          calStyles.calDayNum,
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

  // ── renderBlackModal ─ BLACK 오버레이 + FlyingOrb (index.js와 동일) ──
  const renderBlackModal = () => {
    if (blackPhase === null) return null;
    return (
      <Modal visible transparent animationType="none" statusBarTranslucent>
        {/* 검정 오버레이 */}
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: blackFadeAnim }]}
        />

        {/* 'text' 페이즈: BLACK 메시지 */}
        {blackPhase === 'text' && (
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, calStyles.blackMsgWrap, { opacity: blackTextAnim }]}
          >
            <View style={calStyles.blackOrbCircle} />
            <Text style={calStyles.blackTitle}>BLACK</Text>
            <Text style={calStyles.blackSub}>팀이 해냈어요</Text>
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

  // ══════════════════════════════════════════════════════
  // 6단계 ▼ 파생 값 + 카테고리 액션 + 렌더
  // ══════════════════════════════════════════════════════

  const PALETTE_SIZE = { small: 120, medium: 160, large: 200 }[settings.paletteSize] ?? 160;

  const todosByCat = useMemo(() => {
    const map = {};
    categories.forEach(cat => { map[cat.id] = []; });
    todos.forEach(todo => {
      if (!map[todo.cat_id]) map[todo.cat_id] = [];
      map[todo.cat_id].push(todo);
    });
    return map;
  }, [categories, todos]);

  const progress   = totalCount > 0 ? Math.round(doneCount / totalCount * 100) : 0;
  const selDateObj = new Date(selectedDate + 'T00:00:00');

  // ── 카테고리 추가 / 삭제 ──────────────────────────────
  const handleAddCategory = async () => {
    if (!newCatName.trim()) return;
    try {
      const cat = await createTeamCategory(team.id, userId, newCatName.trim(), newCatColor);
      setCategories(prev => [...prev, cat]);
      setNewCatName('');
      setShowCatModal(false);
    } catch {
      Alert.alert('오류', '카테고리 추가에 실패했어요');
    }
  };

  const handleDeleteCategory = async (catId) => {
    setCategories(prev => prev.filter(c => c.id !== catId));
    try {
      await deleteTeamCategory(catId);
    } catch {
      loadAll(); // 롤백
    }
  };

  // ── 그라데이션 프로그레스바 ──────────────────────────
  const renderProgressBar = () => {
    const barColor = isBlack
      ? '#222'
      : paletteDrops.length > 0 ? paletteDrops[paletteDrops.length - 1].color : C.border;

    return (
      <View style={[detailStyles.progressWrap, { width: PALETTE_SIZE }]}>
        <View style={detailStyles.progressTrack}>
          <View style={[detailStyles.progressFill, {
            width: `${progress}%`,
            backgroundColor: barColor,
          }]} />
        </View>
        <View style={detailStyles.progressMeta}>
          {paletteDrops.slice(0, 10).map(d => (
            <View key={d.id} style={[detailStyles.colorDot, { backgroundColor: d.color }]} />
          ))}
          {paletteDrops.length > 10 && (
            <Text style={detailStyles.dotOverflow}>+{paletteDrops.length - 10}</Text>
          )}
          {totalCount > 0 && (
            <Text style={detailStyles.countText}>{doneCount} / {totalCount}</Text>
          )}
        </View>
      </View>
    );
  };

  // ── 할일 아이템 ──────────────────────────────────────
  const renderTodoItem = (todo) => {
    const isDone = todo.done;

    // 담당자 또는 작성자 색상 (membersMap O(1) 조회)
    const targetMember = membersMap[todo.assignee_id] ?? membersMap[todo.author_id];
    const assigneeColor = targetMember
      ? getMemberColor(targetMember?.color_index)?.color ?? '#888888'
      : myColor?.color ?? '#888888';

    // 담당자 이름 (본인이 아닐 때만 표시)
    const assigneeName = targetMember && targetMember.user_id !== userId
      ? (targetMember.users?.name ?? '?')
      : null;

    // 삭제 권한: 본인 할일 또는 팀장
    const canDelete = todo.author_id === userId || isOwner;

    return (
      <View
        key={todo.id}
        style={[
          detailStyles.todoItem,
          isDone && detailStyles.todoItemDone,
          { borderLeftColor: isDone ? C.border : assigneeColor },
        ]}
      >
        {/* 체크박스 */}
        <TouchableOpacity
          onPress={() => handleToggleTeamTodo(todo)}
          style={[
            detailStyles.checkbox,
            isDone && { borderColor: assigneeColor, backgroundColor: assigneeColor },
          ]}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          {isDone && <Text style={detailStyles.checkmark}>✓</Text>}
        </TouchableOpacity>

        {/* 텍스트 */}
        <Text
          style={[detailStyles.todoText, isDone && detailStyles.todoTextDone]}
          numberOfLines={2}
        >
          {todo.text}
        </Text>

        {/* 담당자 아바타 뱃지 (본인이 아닐 때) */}
        {targetMember && targetMember.user_id !== userId && (
          <TouchableOpacity onPress={() => setViewingMember(targetMember)} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <MemberAvatar member={targetMember} size={22} />
          </TouchableOpacity>
        )}

        {/* 삭제 버튼 */}
        {canDelete && (
          <TouchableOpacity
            onPress={() => handleDeleteTeamTodo(todo.id)}
            style={detailStyles.deleteBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={detailStyles.deleteBtnText}>✕</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  // ── 카테고리 섹션 ─────────────────────────────────────
  const renderCategorySection = (cat) => {
    const catTodos = todosByCat[cat.id] || [];
    const catDone  = catTodos.filter(t => t.done).length;
    const isAdding = addingCatId === cat.id;

    return (
      <View key={cat.id} style={detailStyles.catBlock}>
        {/* 카테고리 헤더 */}
        <View style={detailStyles.catHeader}>
          <View style={[detailStyles.catPill, {
            backgroundColor: cat.color + '15',
            borderColor: cat.color + '28',
          }]}>
            <View style={[detailStyles.catDot, { backgroundColor: cat.color }]} />
            <Text style={[detailStyles.catName, { color: cat.color }]}>{cat.name}</Text>
          </View>
          {catTodos.length > 0 && (
            <Text style={detailStyles.catCount}>{catDone}/{catTodos.length}</Text>
          )}
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            onPress={() => {
              setAddingCatId(cat.id);
              setNewTodoText('');
              setSelectedAssignee(null);
              setTimeout(() => inputRef.current?.focus(), 50);
            }}
            style={detailStyles.catAddBtn}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={detailStyles.catAddBtnText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* 할일 목록 */}
        <View style={detailStyles.todoList}>
          {catTodos.map(todo => renderTodoItem(todo))}
        </View>

        {/* 할일 추가 UI */}
        {isAdding && (
          <View style={detailStyles.addTodoWrap}>
            {/* 담당자 선택 (멤버 칩) */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={detailStyles.assigneeRow}
            >
              {/* 본인 (기본) */}
              <TouchableOpacity
                onPress={() => setSelectedAssignee(null)}
                style={[
                  detailStyles.assigneeChip,
                  !selectedAssignee && {
                    backgroundColor: myColor.color + '22',
                    borderColor: myColor.color,
                  },
                ]}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View style={[detailStyles.assigneeChipDot, { backgroundColor: myColor.color }]} />
                <Text style={[detailStyles.assigneeChipText, !selectedAssignee && { color: myColor.color }]}>
                  나
                </Text>
              </TouchableOpacity>

              {/* 다른 멤버들 */}
              {members
                .filter(m => m.user_id !== userId)
                .map(m => {
                  const mc = getMemberColor(m?.color_index) ?? { hue: 0, color: '#888888' };
                  const isSelected = selectedAssignee?.user_id === m.user_id;
                  return (
                    <TouchableOpacity
                      key={m.user_id}
                      onPress={() => setSelectedAssignee(isSelected ? null : m)}
                      style={[
                        detailStyles.assigneeChip,
                        isSelected && {
                          backgroundColor: mc.color + '22',
                          borderColor: mc.color,
                        },
                      ]}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                      <View style={[detailStyles.assigneeChipDot, { backgroundColor: mc.color }]} />
                      <Text style={[detailStyles.assigneeChipText, isSelected && { color: mc.color }]}>
                        {m.users?.name ?? '?'}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>

            {/* 텍스트 입력 */}
            <View style={detailStyles.addTodoRow}>
              <TextInput
                ref={inputRef}
                value={newTodoText}
                onChangeText={setNewTodoText}
                onSubmitEditing={() => handleAddTeamTodo(cat.id)}
                onBlur={() => { if (!newTodoText.trim()) setAddingCatId(null); }}
                placeholder="할 일을 입력하고 Enter"
                placeholderTextColor={C.dim}
                style={detailStyles.addTodoInput}
                autoFocus
                returnKeyType="done"
              />
              <TouchableOpacity
                onPress={() => handleAddTeamTodo(cat.id)}
                style={[detailStyles.addTodoSubmit, { backgroundColor: myColor.color }]}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={detailStyles.addTodoSubmitText}>↵</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    );
  };

  // ── 로딩 ─────────────────────────────────────────────
  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={C.text} />
      </View>
    );
  }

  // ── 메인 렌더 ─────────────────────────────────────────
  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]}>

      {/* ══ 상단 고정 영역 ══ */}
      <View style={detailStyles.topArea}>

        {/* 헤더: 뒤로 + 팀 이름 + 캘린더/카테고리 + 메뉴 */}
        <View style={detailStyles.headerRow}>
          <TouchableOpacity onPress={() => onBack()} style={detailStyles.backBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={detailStyles.backBtnText}>‹</Text>
          </TouchableOpacity>

          <View style={detailStyles.headerTitle}>
            <Text style={detailStyles.teamName} numberOfLines={1}>{team.name}</Text>
            {team.description ? (
              <Text style={detailStyles.teamDesc} numberOfLines={1}>{team.description}</Text>
            ) : null}
          </View>

          <View style={detailStyles.headerBtns}>
            <TouchableOpacity onPress={() => setShowCal(true)} style={detailStyles.headerPill} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={detailStyles.headerPillText}>캘린더</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowCatModal(true)} style={detailStyles.headerPill} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={detailStyles.headerPillText}>카테고리</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setShowMenu(v => !v)} style={detailStyles.menuBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={detailStyles.menuBtnText}>⋯</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 멤버 아바타 행 */}
        <View style={detailStyles.memberRow}>
          {members.map(m => (
            <TouchableOpacity key={m.user_id} onPress={() => setViewingMember(m)} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <MemberAvatar member={m} size={28} />
            </TouchableOpacity>
          ))}
          <TouchableOpacity onPress={() => setShowInvite(true)} style={detailStyles.inviteBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={detailStyles.inviteBtnText}>+ 초대</Text>
          </TouchableOpacity>
        </View>

        {/* 날짜 네비 */}
        <View style={detailStyles.dateRow}>
          <View style={detailStyles.dateNav}>
            <Text style={detailStyles.dateNavLabel}>team</Text>
            <View style={detailStyles.dateNavInner}>
              <TouchableOpacity onPress={() => goDay(-1)} style={detailStyles.navBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={detailStyles.navArrow}>◀</Text>
              </TouchableOpacity>
              <Text style={detailStyles.dateText} numberOfLines={1}>
                {isToday
                  ? '오늘'
                  : selDateObj.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' })}
              </Text>
              <TouchableOpacity onPress={() => goDay(1)} style={detailStyles.navBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={detailStyles.navArrow}>▶</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* 팔레트 캔버스 */}
        <View style={detailStyles.paletteWrap}>
          <PaletteCanvas
            drops={paletteDrops}
            totalCount={totalCount}
            size={PALETTE_SIZE}
            animDrop={animDrop}
            onAnimDone={handleAnimDone}
            style={{ borderRadius: R.lg }}
          />
          {renderProgressBar()}
        </View>
      </View>

      {/* 구분선 */}
      <View style={detailStyles.divider} />

      {/* 참여 요청 배너 (방장에게만 표시) */}
      {isOwner && joinRequests.length > 0 && (
        <View style={detailStyles.requestBanner}>
          {joinRequests.map(req => (
            <View key={req.id} style={detailStyles.requestRow}>
              <Text style={detailStyles.requestName} numberOfLines={1}>
                {req.users?.name ?? '알 수 없음'}
                <Text style={detailStyles.requestHandle}> @{req.users?.handle}</Text>
                {'  참여 요청'}
              </Text>
              <View style={detailStyles.requestBtns}>
                <TouchableOpacity
                  onPress={() => handleAcceptRequest(req)}
                  style={detailStyles.acceptBtn}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={detailStyles.acceptBtnText}>수락</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleRejectRequest(req)}
                  style={detailStyles.rejectBtn}
                  activeOpacity={0.7}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={detailStyles.rejectBtnText}>거절</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ══ 할일 목록 스크롤 ══ */}
      <ScrollView
        style={detailStyles.scroll}
        contentContainerStyle={[detailStyles.scrollContent, { paddingBottom: insets.bottom + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {categories.length === 0 ? (
          <View style={detailStyles.emptyWrap}>
            <Text style={detailStyles.emptyTitle}>카테고리를 만들어 할 일을 분류해보세요</Text>
            <TouchableOpacity onPress={() => setShowCatModal(true)} style={detailStyles.emptyBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Text style={detailStyles.emptyBtnText}>+ 카테고리 추가</Text>
            </TouchableOpacity>
          </View>
        ) : (
          categories.map(cat => renderCategorySection(cat))
        )}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* 카테고리 관리 모달 */}
      <Modal
        visible={showCatModal}
        transparent
        animationType="slide"
        onRequestClose={() => setShowCatModal(false)}
      >
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowCatModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <TouchableOpacity activeOpacity={1}>
              <View style={styles.modalSheet}>
                <View style={styles.modalHandle} />
                <View style={styles.modalTitleRow}>
                  <Text style={styles.modalTitle}>카테고리 관리</Text>
                  <TouchableOpacity onPress={() => setShowCatModal(false)} style={styles.modalCloseBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={styles.modalCloseBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* 기존 카테고리 목록 */}
                {categories.length > 0 && (
                  <View style={detailStyles.modalCatList}>
                    {categories.map(cat => (
                      <View key={cat.id} style={detailStyles.modalCatRow}>
                        <View style={[detailStyles.modalCatDot, { backgroundColor: cat.color }]} />
                        <Text style={detailStyles.modalCatName}>{cat.name}</Text>
                        <TouchableOpacity
                          onPress={() => Alert.alert(
                            '카테고리 삭제',
                            `'${cat.name}'과 관련 할 일을 모두 삭제할까요?`,
                            [
                              { text: '취소', style: 'cancel' },
                              { text: '삭제', style: 'destructive', onPress: () => handleDeleteCategory(cat.id) },
                            ],
                          )}
                          activeOpacity={0.7}
                          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        >
                          <Text style={detailStyles.modalCatDelText}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    ))}
                  </View>
                )}

                {/* 색상 선택 */}
                <View style={detailStyles.catColorRow}>
                  {CAT_COLORS.map(color => (
                    <TouchableOpacity
                      key={color}
                      onPress={() => setNewCatColor(color)}
                      style={[
                        detailStyles.catColorOption,
                        { backgroundColor: color },
                        newCatColor === color && detailStyles.catColorOptionActive,
                      ]}
                      activeOpacity={0.7}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    />
                  ))}
                </View>

                {/* 이름 입력 */}
                <View style={detailStyles.modalInputRow}>
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
                  <TouchableOpacity onPress={() => handleAddCategory()} style={detailStyles.catAddModalBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                    <Text style={detailStyles.catAddModalBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      {/* ⋯ 드롭다운 메뉴 */}
      {showMenu && (
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={detailStyles.menuDropdown}>
            {/* 팀 코드 */}
            <TouchableOpacity
              onPress={() => {
                setShowMenu(false);
                const code = team.id.slice(0, 8).toUpperCase();
                Alert.alert('팀 코드', `${code}\n멤버들에게 이 코드를 공유하세요.`);
              }}
              style={detailStyles.menuItem}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={detailStyles.menuItemText}>팀 코드 보기</Text>
            </TouchableOpacity>
            {isOwner && (
              <TouchableOpacity
                onPress={() => { setShowMenu(false); setShowEditTeam(true); }}
                style={detailStyles.menuItem}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={detailStyles.menuItemText}>팀 정보 수정</Text>
              </TouchableOpacity>
            )}
            {!isOwner && (
              <TouchableOpacity
                onPress={() => {
                  setShowMenu(false);
                  Alert.alert('팀 나가기', '팀에서 나가면 다시 초대받아야 참여할 수 있어요. 나갈까요?', [
                    { text: '취소', style: 'cancel' },
                    { text: '나가기', style: 'destructive', onPress: async () => {
                      try { await leaveTeam(team.id, userId); onBack(); }
                      catch { Alert.alert('오류', '나가기에 실패했어요'); }
                    }},
                  ]);
                }}
                style={detailStyles.menuItem}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={[detailStyles.menuItemText, { color: '#ff9f43' }]}>팀 나가기</Text>
              </TouchableOpacity>
            )}
            {isOwner && (
              <TouchableOpacity
                onPress={() => {
                  setShowMenu(false);
                  Alert.alert('팀 삭제', '팀을 삭제하면 모든 데이터가 사라져요. 정말 삭제할까요?', [
                    { text: '취소', style: 'cancel' },
                    { text: '삭제', style: 'destructive', onPress: async () => {
                      try { await deleteTeam(team.id); onBack(); }
                      catch { Alert.alert('오류', '삭제에 실패했어요'); }
                    }},
                  ]);
                }}
                style={[detailStyles.menuItem, { borderBottomWidth: 0 }]}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={[detailStyles.menuItemText, { color: '#ff6b6b' }]}>팀 삭제</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      )}

      {/* 팀 정보 수정 모달 */}
      {showEditTeam && (
        <Modal visible transparent animationType="slide" onRequestClose={() => setShowEditTeam(false)}>
          <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setShowEditTeam(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <TouchableOpacity activeOpacity={1}>
                <View style={styles.modalSheet}>
                  <View style={styles.modalHandle} />
                  <View style={styles.modalTitleRow}>
                    <Text style={styles.modalTitle}>팀 정보 수정</Text>
                    <TouchableOpacity onPress={() => setShowEditTeam(false)} style={styles.modalCloseBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={styles.modalCloseBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <TextInput
                    style={styles.modalInput}
                    value={editName}
                    onChangeText={setEditName}
                    placeholder="팀 이름"
                    placeholderTextColor={C.dim}
                    autoFocus
                  />
                  <TextInput
                    style={[styles.modalInput, { marginTop: 8 }]}
                    value={editDesc}
                    onChangeText={setEditDesc}
                    placeholder="설명 (선택)"
                    placeholderTextColor={C.dim}
                  />
                  <TouchableOpacity
                    style={[styles.submitBtn, !editName.trim() && { opacity: 0.4 }]}
                    disabled={!editName.trim()}
                    activeOpacity={0.7}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    onPress={async () => {
                      try {
                        await updateTeam(team.id, editName.trim(), editDesc.trim());
                        setShowEditTeam(false);
                        loadAll();
                      } catch {
                        Alert.alert('오류', '수정에 실패했어요');
                      }
                    }}
                  >
                    <Text style={styles.submitBtnText}>저장</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </Modal>
      )}

      {/* 멤버 초대 모달 */}
      {showInvite && (
        <Modal visible transparent animationType="slide" onRequestClose={() => { setShowInvite(false); setInviteQuery(''); setInviteResults([]); }}>
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => { setShowInvite(false); setInviteQuery(''); setInviteResults([]); }}
          >
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
              <TouchableOpacity activeOpacity={1}>
                <View style={styles.modalSheet}>
                  <View style={styles.modalHandle} />
                  <View style={styles.modalTitleRow}>
                    <Text style={styles.modalTitle}>멤버 초대</Text>
                    <TouchableOpacity onPress={() => { setShowInvite(false); setInviteQuery(''); setInviteResults([]); }} style={styles.modalCloseBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                      <Text style={styles.modalCloseBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={{ fontSize: 12, color: C.muted, marginBottom: 10 }}>이름 또는 @아이디로 검색해요</Text>
                  <TextInput
                    style={styles.modalInput}
                    value={inviteQuery}
                    onChangeText={handleInviteSearch}
                    placeholder="이름 또는 @아이디"
                    placeholderTextColor={C.dim}
                    autoCapitalize="none"
                    autoFocus
                  />
                  {inviteResults.length > 0 && (
                    <View style={{ marginTop: 8, borderRadius: R.md, overflow: 'hidden', borderWidth: 1, borderColor: C.border }}>
                      {inviteResults.map(u => {
                        const alreadyMember = detail?.team_members?.some(m => m.user_id === u.id);
                        return (
                          <TouchableOpacity
                            key={u.id}
                            style={[detailStyles.inviteResultRow, alreadyMember && { opacity: 0.4 }]}
                            onPress={() => !alreadyMember && handleInviteUser(u)}
                            disabled={alreadyMember || inviting}
                            activeOpacity={0.7}
                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                          >
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, color: C.text }}>{u.name}</Text>
                              <Text style={{ fontSize: 11, color: C.muted }}>@{u.handle}</Text>
                            </View>
                            {alreadyMember
                              ? <Text style={{ fontSize: 11, color: C.dim }}>이미 팀원</Text>
                              : <Text style={{ fontSize: 13, color: C.text }}>+ 초대</Text>
                            }
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  <Text style={{ fontSize: 12, color: C.muted, marginTop: 16, marginBottom: 8 }}>
                    현재 멤버 ({detail?.team_members?.length ?? 0}명)
                  </Text>
                  {detail?.team_members?.map(m => (
                    <View key={m.user_id} style={detailStyles.memberListRow}>
                      <TouchableOpacity onPress={() => setViewingMember(m)} activeOpacity={0.8}>
                        <MemberAvatar member={m} size={28} />
                      </TouchableOpacity>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: C.text }}>{m.users?.name}</Text>
                        <Text style={{ fontSize: 11, color: C.muted }}>@{m.users?.handle}</Text>
                      </View>
                      {m.user_id === detail?.created_by && (
                        <View style={detailStyles.ownerBadge}>
                          <Text style={detailStyles.ownerBadgeText}>팀장</Text>
                        </View>
                      )}
                    </View>
                  ))}
                </View>
              </TouchableOpacity>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </Modal>
      )}

      {/* 캘린더 시트 (absoluteFill) */}
      {renderCalendarView()}

      {/* BLACK 오버레이 + FlyingOrb */}
      {renderBlackModal()}

      {/* 멤버 프로필 크게 보기 */}
      <Modal visible={!!viewingMember} transparent animationType="fade" onRequestClose={() => setViewingMember(null)}>
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center' }}
          onPress={() => setViewingMember(null)}
        >
          <View style={{ alignItems: 'center', gap: 12 }}>
            <View style={{
              width: 100, height: 100, borderRadius: 50, overflow: 'hidden',
              backgroundColor: getMemberColor(viewingMember?.color_index)?.color ?? '#888888',
              alignItems: 'center', justifyContent: 'center',
            }}>
              {viewingMember?.users?.avatar_url
                ? <Image source={{ uri: viewingMember.users.avatar_url }} style={{ width: 100, height: 100 }} />
                : <Text style={{ color: '#fff', fontSize: 40, fontWeight: '700', lineHeight: 100 }}>
                    {(viewingMember?.users?.name || viewingMember?.users?.handle || '?')[0].toUpperCase()}
                  </Text>
              }
            </View>
            <Text style={{ color: '#f0ece6', fontSize: 16, fontWeight: '600' }}>
              {viewingMember?.users?.name}
            </Text>
            <Text style={{ color: '#888', fontSize: 13 }}>
              @{viewingMember?.users?.handle}
            </Text>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

// ══════════════════════════════════════════════════════
// 모달 컴포넌트 — CreateTeamModal
// ══════════════════════════════════════════════════════

function CreateTeamModal({ onClose, onCreate }) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      await onCreate({ name: name.trim(), desc: desc.trim() });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => onClose()}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <TouchableOpacity activeOpacity={1}>
            <View style={styles.modalSheet}>
              <View style={styles.modalHandle} />
              <View style={styles.modalTitleRow}>
                <Text style={styles.modalTitle}>팀 만들기</Text>
                <TouchableOpacity onPress={() => onClose()} style={styles.modalCloseBtn} activeOpacity={0.7} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <Text style={styles.modalCloseBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
              <TextInput
                style={styles.modalInput}
                value={name}
                onChangeText={setName}
                placeholder="팀 이름 *"
                placeholderTextColor={C.dim}
                autoFocus
                returnKeyType="next"
              />
              <TextInput
                style={[styles.modalInput, { marginTop: 8 }]}
                value={desc}
                onChangeText={setDesc}
                placeholder="설명 (선택)"
                placeholderTextColor={C.dim}
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
              />
              <TouchableOpacity
                style={[styles.submitBtn, (!name.trim() || loading) && { opacity: 0.4 }]}
                onPress={() => handleSubmit()}
                disabled={!name.trim() || loading}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                {loading
                  ? <ActivityIndicator color={C.bg} />
                  : <Text style={styles.submitBtnText}>만들기</Text>}
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </TouchableOpacity>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════
// StyleSheet
// ══════════════════════════════════════════════════════

const styles = StyleSheet.create({
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

  // ── 팀 목록 헤더 ──
  listHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 0,
  },
  listHeaderLabel: {
    fontSize: 10,
    color: C.dim,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  listHeaderTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.5,
  },
  headerBtnGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  joinBtn: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: R.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  joinBtnText: {
    fontSize: 12,
    color: C.text,
  },
  createBtn: {
    height: 32,
    paddingHorizontal: 14,
    borderRadius: R.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnText: {
    fontSize: 12,
    color: C.muted,
  },

  // ── 코드 참여 모달 ──
  joinModalDesc: {
    fontSize: 12,
    color: C.muted,
    lineHeight: 18,
    marginBottom: 14,
  },
  joinCodeInput: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: R.md,
    paddingVertical: 13,
    paddingHorizontal: 16,
    color: C.text,
    fontSize: 18,
    fontWeight: '700',
    letterSpacing: 4,
    textAlign: 'center',
    marginBottom: 14,
  },
  modalBackBtn: {
    width: 32,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  modalBackBtnText: {
    fontSize: 22,
    color: C.muted,
    lineHeight: 26,
  },
  joinPreviewCard: {
    backgroundColor: C.card,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border2,
    padding: 16,
    marginBottom: 14,
    gap: 4,
  },
  joinPreviewName: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.3,
  },
  joinPreviewDesc: {
    fontSize: 13,
    color: C.muted,
  },
  joinPreviewCode: {
    fontSize: 11,
    color: C.dim,
    marginTop: 4,
    letterSpacing: 1,
  },
  joinPreviewNote: {
    fontSize: 12,
    color: C.muted,
    textAlign: 'center',
    marginBottom: 14,
  },
  joinAlreadyWrap: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  joinAlreadyText: {
    fontSize: 14,
    color: C.muted,
  },

  // ── 검색 ──
  searchWrap: {
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  searchInput: {
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    color: C.text,
    fontSize: 13,
  },

  // ── 스크롤 + 팀 카드 ──
  scroll: {
    flex: 1,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    fontSize: 28,
    marginBottom: 12,
    color: C.dim,
  },
  emptyTitle: {
    fontSize: 13,
    color: C.dim,
    marginBottom: 6,
  },
  emptyDesc: {
    fontSize: 11,
    color: C.dim,
    marginBottom: 16,
  },
  emptyBtn: {
    height: 36,
    paddingHorizontal: 18,
    borderRadius: R.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnText: {
    fontSize: 13,
    color: C.muted,
  },
  teamCard: {
    padding: 14,
    marginBottom: 10,
    backgroundColor: C.surface,
    borderRadius: R.lg,
    borderWidth: 1,
    borderColor: C.border,
  },
  teamCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  teamCardCanvas: {
    width: 44,
    height: 44,
    borderRadius: R.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: C.border,
    flexShrink: 0,
  },
  teamCardInfo: {
    flex: 1,
    minWidth: 0,
  },
  teamCardName: {
    fontSize: 14,
    fontWeight: '700',
    color: C.text,
  },
  teamCardDesc: {
    fontSize: 11,
    color: C.muted,
    marginTop: 2,
  },
  teamCardMemberCount: {
    fontSize: 11,
    color: C.dim,
    flexShrink: 0,
  },
  memberDotsRow: {
    flexDirection: 'row',
    gap: 5,
    marginBottom: 8,
  },
  memberDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  memberMore: {
    fontSize: 9,
    color: C.dim,
    alignSelf: 'center',
  },
  miniProgressWrap: {
    gap: 4,
  },
  miniProgressTrack: {
    height: 3,
    backgroundColor: C.card,
    borderRadius: 3,
    overflow: 'hidden',
  },
  miniProgressFill: {
    height: '100%',
    backgroundColor: C.text,
    borderRadius: 3,
  },
  miniProgressText: {
    fontSize: 10,
    color: C.dim,
  },

  // ── 모달 공통 ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: R.lg,
    borderTopRightRadius: R.lg,
    padding: 20,
    paddingBottom: 36,
  },
  modalHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
  },
  modalCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCloseBtnText: {
    fontSize: 13,
    color: C.muted,
  },
  modalInput: {
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: R.md,
    paddingVertical: 11,
    paddingHorizontal: 14,
    color: C.text,
    fontSize: 13,
  },
  submitBtn: {
    marginTop: 16,
    height: 46,
    borderRadius: R.md,
    backgroundColor: C.text,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.bg,
  },
});

// TeamDetailScreen 전용 스타일
const detailStyles = StyleSheet.create({

  // ── 상단 고정 영역 ──
  topArea: {
    flexShrink: 0,
    paddingHorizontal: 18,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  backBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtnText: {
    fontSize: 22,
    color: C.muted,
    lineHeight: 26,
  },
  headerTitle: {
    flex: 1,
    minWidth: 0,
  },
  teamName: {
    fontSize: 17,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.3,
  },
  teamDesc: {
    fontSize: 11,
    color: C.muted,
    marginTop: 1,
  },
  headerBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  headerPill: {
    minHeight: 44,
    paddingHorizontal: 10,
    borderRadius: R.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerPillText: {
    fontSize: 11,
    color: C.muted,
  },
  menuBtn: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuBtnText: {
    fontSize: 14,
    color: C.muted,
    letterSpacing: 1,
  },

  // ── 멤버 아바타 ──
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  memberAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarText: {
    fontSize: 11,
    fontWeight: '700',
  },
  inviteResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  memberListRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  ownerBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: R.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border2,
  },
  ownerBadgeText: {
    fontSize: 10,
    color: C.muted,
  },
  inviteBtn: {
    height: 26,
    paddingHorizontal: 10,
    borderRadius: R.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteBtnText: {
    fontSize: 11,
    color: C.muted,
  },

  // ── 날짜 네비 ──
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  dateNav: {
    alignItems: 'center',
  },
  dateNavLabel: {
    fontSize: 9,
    color: C.dim,
    letterSpacing: 3,
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  dateNavInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  navBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navArrow: {
    fontSize: 9,
    color: C.muted,
    opacity: 0.55,
  },
  dateText: {
    fontSize: 16,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.3,
    width: 120,
    textAlign: 'center',
  },

  // ── 팔레트 ──
  paletteWrap: {
    alignItems: 'center',
    marginBottom: 10,
  },
  progressWrap: {
    marginTop: 8,
  },
  progressTrack: {
    height: 3,
    backgroundColor: C.surface,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 5,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  progressMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    minHeight: 12,
  },
  colorDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
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
    marginTop: 10,
  },

  // ── 참여 요청 배너 ──
  requestBanner: {
    marginHorizontal: 18,
    marginTop: 8,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: '#ffd166' + '55',
    backgroundColor: '#ffd166' + '0d',
    overflow: 'hidden',
  },
  requestRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#ffd166' + '22',
    gap: 8,
  },
  requestName: {
    flex: 1,
    fontSize: 12,
    color: C.text,
  },
  requestHandle: {
    color: C.muted,
  },
  requestBtns: {
    flexDirection: 'row',
    gap: 6,
  },
  acceptBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: R.full,
    backgroundColor: '#ffd166' + '33',
    borderWidth: 1,
    borderColor: '#ffd166' + '88',
  },
  acceptBtnText: {
    fontSize: 11,
    color: '#ffd166',
    fontWeight: '600',
  },
  rejectBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: R.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border2,
  },
  rejectBtnText: {
    fontSize: 11,
    color: C.muted,
  },

  // ── 스크롤 / 할일 목록 ──
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  emptyTitle: {
    fontSize: 12,
    color: C.dim,
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyBtn: {
    paddingVertical: 9,
    paddingHorizontal: 20,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: R.full,
  },
  emptyBtnText: {
    fontSize: 12,
    color: C.muted,
  },

  // ── 카테고리 블록 ──
  catBlock: {
    marginBottom: 20,
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
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: R.full,
    borderWidth: 1,
  },
  catDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  catName: {
    fontSize: 12,
    fontWeight: '600',
  },
  catCount: {
    fontSize: 10,
    color: C.dim,
  },
  catAddBtn: {
    minWidth: 44,
    minHeight: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catAddBtnText: {
    fontSize: 15,
    color: C.muted,
    lineHeight: 18,
  },

  // ── 할일 아이템 ──
  todoList: {
    gap: 5,
  },
  todoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: C.card,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border2,
    borderLeftWidth: 3,
  },
  todoItemDone: {
    backgroundColor: 'transparent',
    borderColor: C.border,
    opacity: 0.45,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 10,
    flexShrink: 0,
    borderWidth: 2,
    borderColor: C.border2,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    fontSize: 10,
    fontWeight: '800',
    color: '#080808',
  },
  todoText: {
    flex: 1,
    fontSize: 13,
    color: C.text,
  },
  todoTextDone: {
    color: C.muted,
    textDecorationLine: 'line-through',
  },
  assigneeBadge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  assigneeBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  deleteBtn: {
    paddingHorizontal: 4,
    flexShrink: 0,
  },
  deleteBtnText: {
    fontSize: 13,
    color: C.dim,
  },

  // ── 할일 추가 UI ──
  addTodoWrap: {
    marginTop: 7,
    gap: 6,
  },
  assigneeRow: {
    flexDirection: 'row',
    marginBottom: 2,
  },
  assigneeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: R.full,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    marginRight: 6,
  },
  assigneeChipDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  assigneeChipText: {
    fontSize: 11,
    color: C.muted,
  },
  addTodoRow: {
    flexDirection: 'row',
    gap: 7,
  },
  addTodoInput: {
    flex: 1,
    backgroundColor: C.card,
    borderWidth: 1,
    borderColor: C.border2,
    borderRadius: R.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    color: C.text,
    fontSize: 13,
  },
  addTodoSubmit: {
    width: 40,
    height: 40,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  addTodoSubmitText: {
    fontSize: 17,
    color: '#080808',
    fontWeight: '700',
  },

  // ── 카테고리 모달 내부 ──
  modalCatList: {
    marginBottom: 16,
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
  modalCatDelText: {
    fontSize: 13,
    color: C.muted,
    paddingHorizontal: 6,
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
  catAddModalBtn: {
    width: 42,
    height: 42,
    backgroundColor: C.text,
    borderRadius: R.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  catAddModalBtnText: {
    fontSize: 20,
    fontWeight: '700',
    color: C.bg,
  },

  // ── ⋯ 드롭다운 메뉴 ──
  menuDropdown: {
    position: 'absolute',
    top: 56,
    right: 18,
    backgroundColor: C.surface,
    borderRadius: R.md,
    borderWidth: 1,
    borderColor: C.border2,
    overflow: 'hidden',
    minWidth: 140,
    zIndex: 200,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  menuItem: {
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  menuItemText: {
    fontSize: 13,
    color: C.text,
  },
});

// 캘린더 + BLACK 전용 스타일 (index.js와 수치 동일)
const calStyles = StyleSheet.create({
  calOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  calSheet: {
    backgroundColor: C.surface,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    paddingHorizontal: 18,
    paddingBottom: 28,
  },
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
  calGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 3,
    columnGap: 0,
  },
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
  calCircle: {
    width: 30,
    height: 30,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  calDoneRing: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 15,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  calRipple: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  calRipple2: {
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  calDayNum: {
    fontSize: 9,
  },

  // BLACK 메시지
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
