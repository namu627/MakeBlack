import { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { searchUsers } from '../../lib/teamService';

const C = {
  bg: '#0a0a0a', surface: '#141414', card: '#181818',
  border: '#242424', border2: '#2e2e2e',
  text: '#f0ece6', muted: '#888888', dim: '#555555',
};

const MEMBER_COLORS = [
  '#6c8fff','#ff6b6b','#5ce65c','#ffd166',
  '#c77dff','#4ecdc4','#f77f00','#ff6eb4',
];

function avatarColor(str) {
  if (!str) return MEMBER_COLORS[0];
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffffffff;
  return MEMBER_COLORS[Math.abs(h) % MEMBER_COLORS.length];
}

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setSearched(false);
      return;
    }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      doSearch(query.trim());
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const doSearch = async (q) => {
    setLoading(true);
    setSearched(true);
    try {
      const data = await searchUsers(q);
      setResults(data ?? []);
    } catch (e) {
      setResults([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      {/* 헤더 */}
      <View style={styles.header}>
        <Text style={styles.headerLabel}>makeblack</Text>
        <Text style={styles.headerTitle}>검색</Text>
      </View>

      {/* 검색 입력 */}
      <View style={styles.searchBar}>
        <Text style={styles.searchIcon}>🔍</Text>
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="이름 또는 @아이디로 검색"
          placeholderTextColor={C.dim}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery('')} style={styles.clearBtn}>
            <Text style={styles.clearBtnTxt}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 결과 */}
      <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {loading && (
          <View style={styles.centerWrap}>
            <ActivityIndicator color={C.muted} />
          </View>
        )}

        {!loading && !searched && (
          <View style={styles.centerWrap}>
            <Text style={styles.emptyIcon}>🔎</Text>
            <Text style={styles.emptyTitle}>사람을 찾아보세요</Text>
            <Text style={styles.emptyDesc}>이름이나 @아이디로 검색할 수 있어요</Text>
          </View>
        )}

        {!loading && searched && results.length === 0 && (
          <View style={styles.centerWrap}>
            <Text style={styles.emptyIcon}>😶</Text>
            <Text style={styles.emptyTitle}>검색 결과가 없어요</Text>
            <Text style={styles.emptyDesc}>"{query}" 와 일치하는 사용자가 없어요</Text>
          </View>
        )}

        {!loading && results.length > 0 && (
          <>
            <Text style={styles.resultCount}>{results.length}명의 사용자</Text>
            {results.map(user => {
              const color = avatarColor(user.id ?? user.name);
              const letter = (user.name ?? user.email ?? '?')[0]?.toUpperCase();
              return (
                <TouchableOpacity key={user.id} style={styles.userCard} activeOpacity={0.7}>
                  {/* 아바타 */}
                  <View style={[styles.avatar, { backgroundColor: color }]}>
                    <Text style={styles.avatarText}>{letter}</Text>
                  </View>

                  {/* 정보 */}
                  <View style={styles.userInfo}>
                    <Text style={styles.userName}>{user.name ?? '이름 없음'}</Text>
                    {user.handle ? (
                      <Text style={styles.userHandle}>@{user.handle}</Text>
                    ) : null}
                  </View>

                  {/* 색 표시 */}
                  <View style={[styles.colorPip, { backgroundColor: color }]} />
                </TouchableOpacity>
              );
            })}
          </>
        )}

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg, paddingTop: 56 },

  header: { paddingHorizontal: 20, marginBottom: 16 },
  headerLabel: { color: C.dim, fontSize: 9, letterSpacing: 3, marginBottom: 2 },
  headerTitle: { color: C.text, fontSize: 24, fontWeight: '800' },

  searchBar: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 16,
    backgroundColor: C.surface, borderRadius: 14,
    borderWidth: 1, borderColor: C.border,
    paddingHorizontal: 14, paddingVertical: 2,
  },
  searchIcon: { fontSize: 14, marginRight: 8 },
  searchInput: { flex: 1, color: C.text, fontSize: 14, paddingVertical: 12 },
  clearBtn: { padding: 6 },
  clearBtnTxt: { color: C.dim, fontSize: 13 },

  scroll: { flex: 1, paddingHorizontal: 20 },

  centerWrap: { alignItems: 'center', paddingTop: 60, gap: 10 },
  emptyIcon: { fontSize: 40, marginBottom: 4 },
  emptyTitle: { color: C.muted, fontSize: 15, fontWeight: '600' },
  emptyDesc: { color: C.dim, fontSize: 13, textAlign: 'center' },

  resultCount: { color: C.dim, fontSize: 11, marginBottom: 10 },

  userCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: C.surface, borderRadius: 16,
    padding: 14, marginBottom: 10,
    borderWidth: 1, borderColor: C.border,
    gap: 12,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  userInfo: { flex: 1, gap: 2 },
  userName: { color: C.text, fontSize: 15, fontWeight: '600' },
  userHandle: { color: C.muted, fontSize: 12 },
  colorPip: { width: 8, height: 8, borderRadius: 4 },
});
