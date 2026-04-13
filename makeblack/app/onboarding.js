import { useRef, useState } from 'react';
import {
  View, Text, FlatList, TouchableOpacity,
  StyleSheet, Dimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { markOnboardingDone } from './_layout';
import { STORAGE_KEYS } from '../constants/theme';

const { width: W } = Dimensions.get('window');

const SLIDES = [
  {
    icon: '🎨',
    title: 'MakeBlack',
    desc: '할 일을 완료할 때마다\n물감이 팔레트에 퍼져나가요',
  },
  {
    icon: '✦',
    title: '색이 섞여요',
    desc: '여러 할 일을 완료할수록\n색이 혼합되어 검정으로 가까워져요',
  },
  {
    icon: '●',
    title: 'BLACK 달성',
    desc: '모든 할 일을 완료하면\n팔레트가 BLACK이 돼요',
  },
  {
    icon: '◈',
    title: 'BLEND 소개',
    desc: '친구와 팀을 만들어 함께\n팔레트를 BLACK으로 채워요',
  },
  {
    icon: '🔑',
    title: 'BLEND 팀 코드',
    desc: '6자리 팀 코드로\n팀에 참여해요',
  },
  {
    icon: '◉',
    title: '내 색 선택',
    desc: '팀에서 나만의 색으로\n활동해요',
  },
];

export default function OnboardingScreen() {
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef(null);

  const onScroll = (e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / W);
    setActiveIndex(idx);
  };

  const goNext = () => {
    if (activeIndex < SLIDES.length - 1) {
      listRef.current?.scrollToIndex({ index: activeIndex + 1, animated: true });
    }
  };

  const finish = async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING, 'true');
    markOnboardingDone(); // _layout.js의 onboardingDone state를 true로 → 라우팅 위임
  };

  const isLast = activeIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }) => (
          <View style={styles.slide}>
            <Text style={styles.icon}>{item.icon}</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.desc}>{item.desc}</Text>
          </View>
        )}
      />

      {/* 점 인디케이터 */}
      <View style={styles.dots}>
        {SLIDES.map((_, i) => (
          <View
            key={i}
            style={[
              styles.dot,
              i === activeIndex ? styles.dotActive : styles.dotInactive,
            ]}
          />
        ))}
      </View>

      {/* 버튼 */}
      <View style={styles.btnWrap}>
        {isLast ? (
          <TouchableOpacity style={styles.btn} onPress={finish}>
            <Text style={styles.btnText}>시작하기</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.btn} onPress={goNext}>
            <Text style={styles.btnText}>다음</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#080808',
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 56,
  },
  slide: {
    width: W,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 80,
  },
  icon: {
    fontSize: 56,
    marginBottom: 24,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    color: '#f0ece6',
    marginBottom: 12,
    letterSpacing: -0.4,
  },
  desc: {
    fontSize: 14,
    color: '#4a4a4a',
    textAlign: 'center',
    lineHeight: 25,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 32,
  },
  dot: {
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    width: 20,
    backgroundColor: '#f0ece6',
  },
  dotInactive: {
    width: 6,
    backgroundColor: '#252525',
  },
  btnWrap: {
    paddingHorizontal: 28,
    width: '100%',
  },
  btn: {
    paddingVertical: 13,
    paddingHorizontal: 40,
    backgroundColor: '#f0ece6',
    borderRadius: 999,
    alignItems: 'center',
  },
  btnText: {
    color: '#080808',
    fontSize: 14,
    fontWeight: '700',
  },
});
