import { View, Text, StyleSheet } from 'react-native';
export default function SearchScreen() {
  return (
    <View style={styles.c}>
      <Text style={styles.t}>검색 — Week 3에서 구현</Text>
    </View>
  );
}
const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'center', alignItems: 'center' },
  t: { color: '#555', fontSize: 14 },
});