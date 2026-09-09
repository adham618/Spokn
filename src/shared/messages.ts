import type { PlaybackState, ReadingMode } from './types.js';

export type Message =
  | { type: 'PLAY'; mode: ReadingMode }
  | { type: 'PAUSE' }
  | { type: 'RESUME' }
  | { type: 'STOP' }
  | { type: 'SET_VOICE'; voiceName: string }
  | { type: 'SET_SPEED'; rate: number }
  | { type: 'SET_PITCH'; pitch: number }
  | { type: 'SET_VOLUME'; volume: number }
  | { type: 'SET_THEME'; themeId: string }
  | { type: 'RESET_SETTINGS' }
  | { type: 'GET_STATE' }
  | { type: 'IS_TOOLBAR_VISIBLE' }
  | { type: 'STATE_UPDATE'; state: PlaybackState }
  | { type: 'WORD_BOUNDARY'; wordIndex: number; word: string }
  | { type: 'CLICK_TO_READ_TOGGLE'; enabled: boolean }
  | { type: 'TOGGLE_TOOLBAR' }
  | { type: 'READ_SELECTION'; selectionText?: string }
  | { type: 'OPEN_SHORTCUTS_PAGE' }
  | { type: 'OPEN_TOOLBAR' }
  // Feature: skip/rewind sentence
  | { type: 'SKIP_SENTENCE'; direction: 'next' | 'prev' }
  // Feature: auto-scroll toggle
  | { type: 'SET_AUTO_SCROLL'; enabled: boolean }
  // Feature: sleep timer
  | { type: 'SET_SLEEP_TIMER'; minutes: number }
  // Feature: per-site settings
  | { type: 'SET_SITE_SETTINGS'; domain: string; voiceName: string; rate: number }
  // Feature: open reader page
  | { type: 'OPEN_READER_PAGE' };

export type MessageResponse =
  | { success: true; state?: PlaybackState; visible?: boolean }
  | { success: false; error: string };
