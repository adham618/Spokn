import type { PlaybackState, ReadingMode } from './types.js';

export type Message =
  | { type: 'PING' }
  | { type: 'RELOAD_ACTIVE_TAB' }
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
  | { type: 'OPEN_READER_PAGE' }
  // Feature: open reader page with extracted page text
  | { type: 'OPEN_READER_PAGE_WITH_TEXT'; title: string; text: string; url: string }
  // Feature: reader requests page text from the active tab
  | { type: 'GET_PAGE_TEXT' };

export type MessageResponse =
  | { success: true; state?: PlaybackState; visible?: boolean; title?: string; text?: string }
  | { success: false; error: string };
