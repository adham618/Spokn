export type PlaybackStatus = 'stopped' | 'playing' | 'paused' | 'loading';

export type ReadingMode = 'selection' | 'page' | 'click';

export interface PlaybackState {
  status: PlaybackStatus;
  mode: ReadingMode;
  voiceName: string;
  rate: number;
  pitch: number;
  volume: number;
  currentWord: string;
  wordIndex: number;
  totalWords: number;
  currentSentence: string;
  // Feature: auto-scroll
  autoScroll: boolean;
  // Feature: sleep timer (minutes, 0 = off)
  sleepTimerMinutes: number;
  sleepTimerEndsAt: number; // epoch ms, 0 = not running
}

export interface SpoknSettings {
  voiceName: string;
  rate: number;
  pitch: number;
  volume: number;
  mode: ReadingMode;
  favoriteVoices: string[];
}

export const DEFAULT_SETTINGS: SpoknSettings = {
  voiceName: '',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  mode: 'page',
  favoriteVoices: [],
};

export const DEFAULT_STATE: PlaybackState = {
  status: 'stopped',
  mode: 'page',
  voiceName: '',
  rate: 1.0,
  pitch: 1.0,
  volume: 1.0,
  currentWord: '',
  wordIndex: 0,
  totalWords: 0,
  currentSentence: '',
  autoScroll: true,
  sleepTimerMinutes: 0,
  sleepTimerEndsAt: 0,
};
