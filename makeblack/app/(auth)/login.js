import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { THEMES } from '../../constants/theme';

const C = THEMES.dark;

export default function LoginScreen() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const handleLogin = async () => {
    setError('');
    if (!email || !password) {
      setError('이메일과 비밀번호를 입력해주세요');
      return;
    }

    setLoading(true);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);

    if (err) {
      // Supabase 에러 코드별 구체적인 메시지
      if (err.message?.includes('Email not confirmed')) {
        setError('이메일 인증이 필요해요. 받으신 인증 메일을 확인해주세요');
      } else if (err.message?.includes('Invalid login credentials')) {
        setError('이메일 또는 비밀번호가 올바르지 않아요');
      } else {
        setError('로그인에 실패했어요. 잠시 후 다시 시도해주세요');
      }
    }
    // 성공 시 _layout.js의 onAuthStateChange가 자동으로 탭 화면으로 이동
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.inner}>
        {/* 상단 타이틀 */}
        <Text style={styles.appTitle}>makeblack</Text>

        {/* 메인 타이틀 */}
        <View style={styles.titleArea}>
          <Text style={styles.title}>로그인</Text>
        </View>

        {/* 입력 폼 */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="이메일"
            placeholderTextColor={C.dim}
            value={email}
            onChangeText={t => { setEmail(t); setError(''); }}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={styles.input}
            placeholder="비밀번호"
            placeholderTextColor={C.dim}
            value={password}
            onChangeText={t => { setPassword(t); setError(''); }}
            secureTextEntry
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={C.text} />
              : <Text style={styles.btnText}>로그인</Text>
            }
          </TouchableOpacity>
        </View>

        {/* 하단 링크 */}
        <View style={styles.links}>
          <TouchableOpacity onPress={() => router.push('/(auth)/signup')}>
            <Text style={styles.linkText}>계정이 없으신가요? <Text style={styles.linkBold}>회원가입</Text></Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() =>
            Alert.alert('비밀번호 재설정', '가입하신 이메일 주소를 이메일 입력란에 입력 후 아래 버튼을 눌러주세요', [
              { text: '취소', style: 'cancel' },
              {
                text: '재설정 메일 발송',
                onPress: async () => {
                  if (!email) {
                    Alert.alert('이메일 입력 필요', '위 이메일 입력란에 가입한 이메일을 먼저 입력해주세요');
                    return;
                  }
                  const { error: resetErr } = await supabase.auth.resetPasswordForEmail(email);
                  if (resetErr) {
                    Alert.alert('발송 실패', '잠시 후 다시 시도해주세요');
                  } else {
                    Alert.alert('발송 완료', `${email}로 재설정 링크를 보냈어요`);
                  }
                },
              },
            ])
          }>
            <Text style={styles.linkMuted}>비밀번호를 잊으셨나요?</Text>
          </TouchableOpacity>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    gap: 32,
  },
  appTitle: {
    fontSize: 9,
    color: C.dim,
    letterSpacing: 2,
    textAlign: 'center',
    textTransform: 'lowercase',
  },
  titleArea: { alignItems: 'center' },
  title: {
    fontSize: 26,
    fontWeight: '700',
    color: C.text,
    letterSpacing: -0.5,
  },
  form: { gap: 10 },
  input: {
    backgroundColor: C.surface,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    color: C.text,
    fontSize: 14,
    borderWidth: 1,
    borderColor: C.border,
  },
  errorText: {
    color: '#ff5555',
    fontSize: 12,
    marginLeft: 4,
  },
  btn: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 4,
    borderWidth: 1,
    borderColor: C.text,
  },
  btnDisabled: { opacity: 0.4 },
  btnText: {
    color: C.text,
    fontSize: 14,
    fontWeight: '600',
  },
  links: {
    alignItems: 'center',
    gap: 12,
  },
  linkText: {
    textAlign: 'center',
    color: C.dim,
    fontSize: 13,
  },
  linkBold: {
    color: C.muted,
    fontWeight: '600',
  },
  linkMuted: {
    color: C.dim,
    fontSize: 12,
  },
});
