import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

// 30-step pre-calculated bezier keyframes for native driver compatibility
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

// Animate through pre-calculated bezier keyframes using native driver
// by driving a single 0→1 Animated.Value and using interpolate with many keyframes
export default function FlyingOrb({ sx, sy, tx, ty, onDone }) {
  const STEPS = 30;
  const progress = useRef(new Animated.Value(0)).current;

  const keyframes = calcBezierKeyframes(sx, sy, tx, ty, STEPS);
  const inputRange = keyframes.map((_, i) => i / STEPS);
  const xRange = keyframes.map(p => p.x - 20); // center the 40px orb
  const yRange = keyframes.map(p => p.y - 20);

  const animX = progress.interpolate({ inputRange, outputRange: xRange });
  const animY = progress.interpolate({ inputRange, outputRange: yRange });
  const animOpacity = progress.interpolate({
    inputRange: [0, 0.75, 1],
    outputRange: [1, 1, 0],
  });
  const animSize = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [40, 16],
  });

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration: 500,
      useNativeDriver: false, // size interpolation requires false; position works fine
    }).start(({ finished }) => {
      if (finished && onDone) onDone();
    });
  }, []);

  return (
    <Animated.View
      style={[
        styles.orb,
        {
          opacity: animOpacity,
          width: animSize,
          height: animSize,
          borderRadius: Animated.divide(animSize, new Animated.Value(2)),
          transform: [
            { translateX: animX },
            { translateY: animY },
          ],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  orb: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOpacity: 0.7,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
    zIndex: 350,
  },
});
