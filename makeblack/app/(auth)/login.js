import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('입력 오류', '이메일과 비밀번호를 입력해주세요');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (error) {
      Alert.alert('로그인 실패', '이메일 또는 비밀번호가 올바르지 않아요');
    }
    // 성공 시 _layout.js의 onAuthStateChange가 자동으로 탭 화면으로 이동
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        {/* 로고 */}
        <View style={styles.logoArea}>
          <Text style={styles.logoText}>MakeBlack</Text>
          <Text style={styles.logoSub}>오늘 팔레트를 채워보세요</Text>
        </View>

        {/* 입력 폼 */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="이메일"
            placeholderTextColor="#555"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="비밀번호"
            placeholderTextColor="#555"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
          />

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.btnText}>로그인</Text>
            }
          </TouchableOpacity>
        </View>

        {/* 회원가입 링크 */}
        <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
          <Text style={styles.linkText}>
            계정이 없으신가요? <Text style={styles.linkBold}>회원가입</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 32,
  },
  logoArea: { alignItems: 'center', gap: 8 },
  logoText: {
    fontSize: 36,
    fontWeight: '800',
    color: '#f0ece6',
    letterSpacing: -1,
  },
  logoSub: { fontSize: 14, color: '#666' },
  form: { gap: 12 },
  input: {
    backgroundColor: '#181818',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: '#f0ece6',
    fontSize: 15,
    borderWidth: 1,
    borderColor: '#2a2a2a',
  },
  btn: {
    backgroundColor: '#f0ece6',
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: {
    color: '#0a0a0a',
    fontSize: 15,
    fontWeight: '700',
  },
  linkText: { textAlign: 'center', color: '#555', fontSize: 14 },
  linkBold: { color: '#f0ece6', fontWeight: '600' },
});