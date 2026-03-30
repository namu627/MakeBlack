// ─────────────────────────────────────────────
// Design tokens — makeblack.jsx와 동일
// ─────────────────────────────────────────────

export const THEMES = {
  dark: {
    bg:          '#0a0a0a',
    surface:     '#141414',
    card:        '#181818',
    border:      '#242424',
    border2:     '#2e2e2e',
    text:        '#f0ece6',
    muted:       '#888888',
    dim:         '#555555',
    pill:        '#1e1e1e',
    paletteBase: '#0d0c0b',
  },
  light: {
    bg:          '#f5f4f0',
    surface:     '#ffffff',
    card:        '#f0eeea',
    border:      '#e0ddd8',
    border2:     '#d4d0cb',
    text:        '#1a1a1a',
    muted:       '#777777',
    dim:         '#aaaaaa',
    pill:        '#e8e5e0',
    paletteBase: '#f0eeea',
  },
};

export const radius = {
  sm:   10,
  md:   16,
  lg:   22,
  full: 999,
};

export const CAT_COLORS = [
  '#6c8fff', '#ff7c6e', '#a8e063', '#ffd166',
  '#c77dff', '#06d6a0', '#ffb347', '#ef476f', '#4ecdc4', '#f7b731',
];

export const MEMBER_HUE_PALETTE = [
  { hue: 220, label: '블루',   base: '#6c8fff' },
  { hue: 0,   label: '레드',   base: '#ff6b6b' },
  { hue: 140, label: '그린',   base: '#5ce65c' },
  { hue: 45,  label: '옐로우', base: '#ffd166' },
  { hue: 280, label: '퍼플',   base: '#c77dff' },
  { hue: 170, label: '민트',   base: '#06d6a0' },
  { hue: 25,  label: '오렌지', base: '#ffb347' },
  { hue: 340, label: '핑크',   base: '#ef476f' },
];

export const DEFAULT_SETTINGS = {
  calStartSunday:      true,
  use24h:              false,
  language:            'ko',
  reminderTime:        '09:00',
  reminderOn:          false,
  blackAnimationOn:    true,
  teamBlackAnimationOn:true,
  paletteSize:         'medium',
  pinLock:             false,
  pin:                 '',
  privacy:             'public',
  theme:               'dark',
};
