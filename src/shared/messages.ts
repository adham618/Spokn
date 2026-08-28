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
  | { type: 'GET_STATE' }
  | { type: 'STATE_UPDATE'; state: PlaybackState }
  | { type: 'WORD_BOUNDARY'; wordIndex: number; word: string }
  | { type: 'CLICK_TO_READ_TOGGLE'; enabled: boolean }
  | { type: 'TOGGLE_TOOLBAR' }
  | { type: 'READ_SELECTION' };

export type MessageResponse =
  | { success: true; state?: PlaybackState }
  | { success: false; error: string };
