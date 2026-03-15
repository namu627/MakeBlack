import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, KeyboardAvoidingView, Platform,
  ActivityIndicator, Alert, ScrollView
} from 'react-native';
import { router } from 'expo-router';
import { supabase } from '../../lib/supabase';

export default function SignupScreen() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const validate = () => {
    if (!name.trim()) return '이름을 입력해주세요';
    if (!email.includes('@')) return '올바른 이메일을 입력해주세요';
    if (password.length < 8) return '비밀번호는 8자 이상이어야 해요';
    if (password !== passwordConfirm) return '비밀번호가 일치하지 않아요';
    return null;
  };

  const handleSignup = async () => {
    const errMsg = validate();
    if (errMsg) {
      Alert.alert('입력 오류', errMsg);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { name } },  // user_metadata에 이름 저장
    });
    setLoading(false);

    if (error) {
      Alert.alert('회원가입 실패', error.message);
      return;
    }

    // 이메일 인증이 필요한 경우
    if (data.user && !data.session) {
      Alert.alert(
        '이메일 인증 필요',
        `${email}로 인증 메일을 보냈어요. 확인 후 로그인해주세요`,
        [{ text: '확인', onPress: () => router.replace('/(auth)/login') }]
      );
      return;
    }

    // 이메일 인증 없이 바로 세션 생성된 경우 (Supabase 설정에 따라)
    // → _layout.js가 자동으로 핸들 설정 화면 또는 탭으로 이동
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView contentContainerStyle={styles.inner} keyboardShouldPersistTaps="handled">
        {/* 헤더 */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <Text style={styles.backText}>← 뒤로</Text>
          </TouchableOpacity>
          <Text style={styles.title}>회원가입</Text>
          <Text style={styles.sub}>팔레트를 채울 준비가 됐나요?</Text>
        </View>

        {/* 폼 */}
        <View style={styles.form}>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>이름</Text>
            <TextInput
              style={styles.input}
              placeholder="표시될 이름"
              placeholderTextColor="#555"
              value={name}
              onChangeText={setName}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>이메일</Text>
            <TextInput
              style={styles.input}
              placeholder="example@email.com"
              placeholderTextColor="#555"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>비밀번호</Text>
            <TextInput
              style={styles.input}
              placeholder="8자 이상"
              placeholderTextColor="#555"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>비밀번호 확인</Text>
            <TextInput
              style={styles.input}
              placeholder="비밀번호 재입력"
              placeholderTextColor="#555"
              value={passwordConfirm}
              onChangeText={setPasswordConfirm}
              secureTextEntry
            />
          </View>

          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            onPress={handleSignup}
            disabled={loading}
          >
            {loading
              ? <ActivityIndicator color="#0a0a0a" />
              : <Text style={styles.btnText}>시작하기</Text>
            }
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0a0a0a' },
  inner: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingTop: 60,
    paddingBottom: 40,
    gap: 32,
  },
  header: { gap: 8 },
  backBtn: { marginBottom: 8 },
  backText: { color: '#666', fontSize: 14 },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#f0ece6',
    letterSpacing: -0.5,
  },
  sub: { fontSize: 14, color: '#666' },
  form: { gap: 16 },
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, color: '#888', marginLeft: 4 },
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
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.5 },
  btnText: {
    color: '#0a0a0a',
    fontSize: 15,
    fontWeight: '700',
  },
});