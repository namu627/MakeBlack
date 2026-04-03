import { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet } from 'react-native';

function calcBezierKeyframes(sx, sy, tx, ty, steps) {
  const cx1 = sx + (tx - sx) * 0.3;
  const cy1 = Math.min(sy, ty) - Math.abs(tx - sx) * 0.25;
  const cx2 = sx + (tx - sx) * 0.7;
  const cy2 = Math.min(sy, ty) - Math.abs(tx - sx) * 0.1;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const x =
      mt * mt * mt * sx +
      3 * mt * mt * t * cx1 +
      3 * mt * t * t * cx2 +
      t * t * t * tx;
    const y =
      mt * mt * mt * sy +
      3 * mt * mt * t * cy1 +
      3 * mt * t * t * cy2 +
      t * t * t * ty;
    pts.push({ x, y });
  }
  return pts;
}

export default function FlyingOrb({ sx, sy, tx, ty, onDone }) {
  const STEPS = 30;
  const progress = useRef(new Animated.Value(0)).current;

  const keyframes = calcBezierKeyframes(sx, sy, tx, ty, STEPS);
  const inputRange = keyframes.map((_, i) => i / STEPS);
  const xRange = keyframes.map(p => p.x - 20); // -20: 40px orb 중심 보정
  const yRange = keyframes.map(p => p.y - 20);

  const animX = progress.interpolate({ inputRange, outputRange: xRange });
  const animY = progress.interpolate({ inputRange, outputRange: yRange });
  const animOpacity = progress.interpolate({
    inputRange: [0, 0.05, 0.75, 1],
    outputRange: [0, 1, 1, 0],
  });

  useEffect(() => {
    progress.setValue(0);
    setTimeout(() => {
      Animated.timing(progress, {
        toValue: 1,
        duration: 500,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished && onDone) onDone();
      });
    }, 10);
  }, []);

  return (
    // 외부 View: 공간 차지 없는 고정 앵커
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.orb,
          {
            opacity: animOpacity,
            transform: [{ translateX: animX }, { translateY: animY }],
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 0,
    height: 0,
  },
  orb: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
  },
});
