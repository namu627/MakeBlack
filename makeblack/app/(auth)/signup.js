import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';
import { THEMES } from '../../constants/theme';

const C = THEMES.dark;

export default function SignupScreen() {
  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const validate = () => {
    if (!name.trim())           return '이름을 입력해주세요';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '올바른 이메일을 입력해주세요';
    if (password.length < 8)    return '비밀번호는 8자 이상이어야 해요';
    return null;
  };

  const handleSignup = async () => {
    setError('');
    const errMsg = validate();
    if (errMsg) { setError(errMsg); return; }

    setLoading(true);
    const { data, error: err } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },
    });
    setLoading(false);

    if (err) {
      setError(err.message);
      return;
    }

    if (data.user && !data.session) {
      Alert.alert(
        '이메일 인증 필요',
        `${email}로 인증 메일을 보냈어요. 확인 후 로그인해주세요`,
        [{ text: '확인', onPress: () => router.replace('/(auth)/login') }]
      );
      return;
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        {/* 상단 타이틀 */}
        <Text style={styles.appTitle}>makeblack</Text>

        {/* 메인 타이틀 */}
        <View style={styles.titleArea}>
          <Text style={styles.title}>회원가입</Text>
        </View>

        {/* 폼 */}
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="이름"
            placeholderTextColor={C.dim}
            value={name}
            onChangeText={t => { setName(t); setError(''); }}
          />
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
            placeholder="비밀번호 (8자 이상)"
            placeholderTextColor={C.dim}
            value={password}
            onChangeText={t => { setPassword(t); setError(''); }}
            secureTextEntry
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color={C.text} />
              : <Text style={styles.btnText}>가입하기</Text>
            }
          </TouchableOpacity>
        </View>

        {/* 하단 링크 */}
        <View style={styles.links}>
          <TouchableOpacity onPress={() => router.replace('/(auth)/login')}>
            <Text style={styles.linkText}>이미 계정이 있으신가요? <Text style={styles.linkBold}>로그인</Text></Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  inner: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 60,
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
});
