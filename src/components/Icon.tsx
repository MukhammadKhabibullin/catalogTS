import type { CSSProperties } from 'react';

const paths = {
  left: 'm14 6-6 6 6 6', right: 'm10 6 6 6-6 6',
  close: 'm6 6 12 12M18 6 6 18', plus: 'M12 5v14M5 12h14', minus: 'M5 12h14',
  expand: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',
  collapse: 'M3 8h5V3m13 5h-5V3M8 21v-5H3m13 5v-5h5',
  search: 'm21 21-4.4-4.4M19 10.5a8.5 8.5 0 1 1-17 0 8.5 8.5 0 0 1 17 0',
  upload: 'M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5',
  download: 'M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4',
  book: 'M12 5v16m0-16C8 2 3 3 2 4v15c4-2 7-1 10 2 3-3 6-4 10-2V4c-4-2-7-1-10 1',
  list: 'M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01',
  settings: 'M4 7h16M4 17h16M8 4v6m8 4v6',
  check: 'm5 12 4 4L19 6', up: 'm6 14 6-6 6 6', down: 'm6 10 6 6 6-6',
  image: 'M3 3h18v18H3zM3 17l6-6 5 5 3-3 4 4M16 7h.01',
  info: 'M12 11v6m0-10h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  mail: 'M3 5h18v14H3zM3 5l9 8 9-8',
  phone: 'M8 3H4v4c0 7 6 13 13 13h4v-4l-5-2-2 2a15 15 0 0 1-6-6l2-2z',
  pin: 'M19 10c0 6-7 12-7 12S5 16 5 10a7 7 0 0 1 14 0M12 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6',
  reset: 'M3 11a9 9 0 1 1 3 8M3 4v7h7',
} satisfies Record<string, string>;

export function Icon({ name, size = 20, style }: { name: keyof typeof paths; size?: number; style?: CSSProperties }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={style}><path d={paths[name]} /></svg>;
}
