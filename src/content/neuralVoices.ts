/**
 * neuralVoices.ts — Kokoro-82M voices only.
 * One model download (fp32: 310 MB on WebGPU, q8: 90 MB on WASM), 13 voices, works offline forever.
 */

export type NeuralEngine = 'kokoro';

export interface NeuralVoice {
  id: string;
  name: string;
  lang: string;
  langLabel: string;
  gender: 'male' | 'female';
  grade: 'A' | 'B' | 'C';
  engine: NeuralEngine;
  voiceKey: string;
}

export const ALL_NEURAL_VOICES: NeuralVoice[] = [
  // American Female
  { id: 'neural:kokoro:af_heart',    name: 'Heart',    lang: 'en-US', langLabel: 'English (US)', gender: 'female', grade: 'A', engine: 'kokoro', voiceKey: 'af_heart' },
  { id: 'neural:kokoro:af_bella',    name: 'Bella',    lang: 'en-US', langLabel: 'English (US)', gender: 'female', grade: 'A', engine: 'kokoro', voiceKey: 'af_bella' },
  { id: 'neural:kokoro:af_nicole',   name: 'Nicole',   lang: 'en-US', langLabel: 'English (US)', gender: 'female', grade: 'B', engine: 'kokoro', voiceKey: 'af_nicole' },
  { id: 'neural:kokoro:af_aoede',    name: 'Aoede',    lang: 'en-US', langLabel: 'English (US)', gender: 'female', grade: 'B', engine: 'kokoro', voiceKey: 'af_aoede' },
  { id: 'neural:kokoro:af_kore',     name: 'Kore',     lang: 'en-US', langLabel: 'English (US)', gender: 'female', grade: 'B', engine: 'kokoro', voiceKey: 'af_kore' },
  { id: 'neural:kokoro:af_sarah',    name: 'Sarah',    lang: 'en-US', langLabel: 'English (US)', gender: 'female', grade: 'B', engine: 'kokoro', voiceKey: 'af_sarah' },
  // American Male
  { id: 'neural:kokoro:am_puck',     name: 'Puck',     lang: 'en-US', langLabel: 'English (US)', gender: 'male',   grade: 'B', engine: 'kokoro', voiceKey: 'am_puck' },
  { id: 'neural:kokoro:am_fenrir',   name: 'Fenrir',   lang: 'en-US', langLabel: 'English (US)', gender: 'male',   grade: 'B', engine: 'kokoro', voiceKey: 'am_fenrir' },
  { id: 'neural:kokoro:am_michael',  name: 'Michael',  lang: 'en-US', langLabel: 'English (US)', gender: 'male',   grade: 'B', engine: 'kokoro', voiceKey: 'am_michael' },
  // British Female
  { id: 'neural:kokoro:bf_emma',     name: 'Emma',     lang: 'en-GB', langLabel: 'English (GB)', gender: 'female', grade: 'B', engine: 'kokoro', voiceKey: 'bf_emma' },
  { id: 'neural:kokoro:bf_isabella', name: 'Isabella', lang: 'en-GB', langLabel: 'English (GB)', gender: 'female', grade: 'B', engine: 'kokoro', voiceKey: 'bf_isabella' },
  // British Male
  { id: 'neural:kokoro:bm_george',   name: 'George',   lang: 'en-GB', langLabel: 'English (GB)', gender: 'male',   grade: 'B', engine: 'kokoro', voiceKey: 'bm_george' },
  { id: 'neural:kokoro:bm_fable',    name: 'Fable',    lang: 'en-GB', langLabel: 'English (GB)', gender: 'male',   grade: 'B', engine: 'kokoro', voiceKey: 'bm_fable' },
];

export function isNeuralVoiceId(id: string): boolean {
  return id.startsWith('neural:');
}

export function getNeuralVoice(id: string): NeuralVoice | undefined {
  return ALL_NEURAL_VOICES.find(v => v.id === id);
}
