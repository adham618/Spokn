<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { Message } from '../shared/messages.js';
  import type { PlaybackState, ReadingMode } from '../shared/types.js';
  import { DEFAULT_STATE } from '../shared/types.js';
  import PitchSlider from './components/PitchSlider.svelte';
  import PlaybackControls from './components/PlaybackControls.svelte';
  import SpeedSlider from './components/SpeedSlider.svelte';
  import VoicePicker from './components/VoicePicker.svelte';
  import VolumeSlider from './components/VolumeSlider.svelte';

  // ── Reactive state ───────────────────────────────────────────────────────
  let playbackState: PlaybackState = $state({ ...DEFAULT_STATE });
  let settingsOpen = $state(false);
  let toastMsg = $state('');
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  // ── Helpers ──────────────────────────────────────────────────────────────

  function toast(msg: string, duration = 2000) {
    toastMsg = msg;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (toastMsg = ''), duration);
  }

  async function sendToBackground(msg: Message): Promise<void> {
    try {
      await chrome.runtime.sendMessage(msg);
    } catch (err) {
      console.warn('[Spokn popup] sendMessage failed:', err);
    }
  }

  async function sendToTab(msg: Message): Promise<void> {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await chrome.tabs.sendMessage(tab.id, msg);
    } catch (err) {
      console.warn('[Spokn popup] tab sendMessage failed:', err);
    }
  }

  // ── Load persisted settings on open ─────────────────────────────────────

  onMount(async () => {
    // Pull last-known state from background
    try {
      const res = await chrome.runtime.sendMessage({ type: 'GET_STATE' } satisfies Message);
      if (res?.success && res.state) {
        playbackState = res.state;
      }
    } catch { /* background may not be ready */ }

    // Pull settings from storage
    const stored = await chrome.storage.sync.get(['voiceName', 'rate', 'pitch', 'volume', 'mode']);
    if (stored.voiceName)  playbackState.voiceName = stored.voiceName as string;
    if (stored.rate != null) playbackState.rate = stored.rate as number;
    if (stored.pitch != null) playbackState.pitch = stored.pitch as number;
    if (stored.volume != null) playbackState.volume = stored.volume as number;
    if (stored.mode) playbackState.mode = stored.mode as ReadingMode;

    // Listen for state updates pushed from content script via background
    chrome.runtime.onMessage.addListener(handleBackgroundMessage);
  });

  onDestroy(() => {
    chrome.runtime.onMessage.removeListener(handleBackgroundMessage);
    if (toastTimer) clearTimeout(toastTimer);
  });

  function handleBackgroundMessage(msg: unknown) {
    const m = msg as Message;
    if (m.type === 'STATE_UPDATE' && m.state) {
      playbackState = { ...m.state };
    }
  }

  // ── Playback actions ─────────────────────────────────────────────────────

  async function handlePlay(mode: ReadingMode) {
    if (mode === 'click') {
      await sendToTab({ type: 'PLAY', mode: 'click' });
      await sendToTab({ type: 'CLICK_TO_READ_TOGGLE', enabled: true });
      toast('Click any paragraph to start reading');
      return;
    }

    if (mode === 'selection') {
      // Check if there is a selection
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;
      await sendToTab({ type: 'PLAY', mode: 'selection' });
    } else {
      await sendToTab({ type: 'PLAY', mode: 'page' });
    }
  }

  async function handlePause() {
    await sendToTab({ type: 'PAUSE' });
  }

  async function handleResume() {
    await sendToTab({ type: 'RESUME' });
  }

  async function handleStop() {
    await sendToTab({ type: 'STOP' });
    await sendToTab({ type: 'CLICK_TO_READ_TOGGLE', enabled: false });
  }

  async function handleModeChange(mode: ReadingMode) {
    playbackState = { ...playbackState, mode };
    await chrome.storage.sync.set({ mode });
    // If switching away from click mode while it's active, disable it
    if (mode !== 'click') {
      await sendToTab({ type: 'CLICK_TO_READ_TOGGLE', enabled: false });
    }
  }

  // ── Settings changes ─────────────────────────────────────────────────────

  async function handleVoiceChange(voiceName: string) {
    playbackState = { ...playbackState, voiceName };
    await sendToTab({ type: 'SET_VOICE', voiceName });
  }

  async function handleSpeedChange(rate: number) {
    rate = Math.round(rate * 10) / 10;
    playbackState = { ...playbackState, rate };
    await sendToTab({ type: 'SET_SPEED', rate });
    await chrome.storage.sync.set({ rate });
  }

  async function handlePitchChange(pitch: number) {
    pitch = Math.round(pitch * 10) / 10;
    playbackState = { ...playbackState, pitch };
    await sendToTab({ type: 'SET_PITCH', pitch });
    await chrome.storage.sync.set({ pitch });
  }

  async function handleVolumeChange(volume: number) {
    volume = Math.round(volume * 100) / 100;
    playbackState = { ...playbackState, volume };
    await sendToTab({ type: 'SET_VOLUME', volume });
    await chrome.storage.sync.set({ volume });
  }
</script>

<main class="popup">
  <!-- Header -->
  <header class="header">
    <div class="logo">
      <span class="logo-icon" aria-hidden="true">🔊</span>
      <span class="logo-name">Spokn</span>
    </div>
    <div class="header-actions">
      <button
        class="icon-btn"
        class:active={settingsOpen}
        onclick={() => (settingsOpen = !settingsOpen)}
        aria-label={settingsOpen ? 'Hide settings' : 'Show settings'}
        aria-expanded={settingsOpen}
        title="Settings"
      >
        <span aria-hidden="true">&#9881;</span>
      </button>
    </div>
  </header>

  <!-- Playback Controls (always visible) -->
  <section class="section" aria-label="Playback">
    <PlaybackControls
      status={playbackState.status}
      mode={playbackState.mode}
      wordIndex={playbackState.wordIndex}
      totalWords={playbackState.totalWords}
      currentWord={playbackState.currentWord}
      currentSentence={playbackState.currentSentence}
      onplay={handlePlay}
      onpause={handlePause}
      onresume={handleResume}
      onstop={handleStop}
      onmodechange={handleModeChange}
    />
  </section>

  <!-- Settings panel (collapsible) -->
  {#if settingsOpen}
    <section class="section settings-panel" aria-label="Voice settings">
      <div class="settings-grid">
        <VoicePicker
          value={playbackState.voiceName}
          onchange={handleVoiceChange}
        />

        <SpeedSlider
          value={playbackState.rate}
          onchange={handleSpeedChange}
        />

        <PitchSlider
          value={playbackState.pitch}
          onchange={handlePitchChange}
        />

        <VolumeSlider
          value={playbackState.volume}
          onchange={handleVolumeChange}
        />
      </div>
    </section>
  {/if}

  <!-- Keyboard shortcuts hint -->
  <section class="section shortcuts" aria-label="Keyboard shortcuts">
    <p class="shortcuts-title">Keyboard shortcuts</p>
    <div class="shortcut-list">
      <span class="shortcut"><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>P</kbd> Play / Pause</span>
      <span class="shortcut"><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>S</kbd> Stop</span>
      <span class="shortcut"><kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>R</kbd> Read selection</span>
    </div>
  </section>

  <!-- Footer: Ko-fi donation -->
  <footer class="footer">
    <a
      href={import.meta.env.VITE_KOFI_URL}
      target="_blank"
      rel="noopener noreferrer"
      class="kofi-btn"
      aria-label="Support {import.meta.env.VITE_APP_NAME} on Ko-fi"
    >
      <img src="/kofi.png" alt="" width="20" height="20" aria-hidden="true" />
      Support me on Ko-fi
    </a>
    <span class="version">v{import.meta.env.VITE_APP_VERSION}</span>
  </footer>

  <!-- Toast notification -->
  {#if toastMsg}
    <div class="toast" role="status" aria-live="polite">{toastMsg}</div>
  {/if}
</main>

<style>
  :global(*, *::before, *::after) {
    box-sizing: border-box;
  }

  .popup {
    width: 360px;
    min-height: 480px;
    background: #0a0a0f;
    color: #f1f5f9;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    font-size: 13px;
    display: flex;
    flex-direction: column;
    gap: 0;
    position: relative;
    overflow: hidden;
  }

  /* ── Header ── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 18px 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    background: #111118;
  }

  .logo {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .logo-icon {
    font-size: 20px;
    line-height: 1;
  }

  .logo-name {
    font-size: 18px;
    font-weight: 700;
    color: #f1f5f9;
    letter-spacing: -0.3px;
    background: linear-gradient(135deg, #f1f5f9 0%, #38bdf8 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .header-actions {
    display: flex;
    gap: 4px;
  }

  .icon-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid rgba(255,255,255,0.1);
    background: transparent;
    color: #94a3b8;
    cursor: pointer;
    font-size: 15px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s;
  }

  .icon-btn:hover {
    background: rgba(255,255,255,0.08);
    color: #f1f5f9;
    border-color: rgba(255,255,255,0.2);
  }

  .icon-btn.active {
    background: rgba(14, 165, 233, 0.2);
    color: #38bdf8;
    border-color: rgba(14, 165, 233, 0.4);
  }

  /* ── Sections ── */
  .section {
    padding: 14px 18px;
    border-bottom: 1px solid rgba(255,255,255,0.05);
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  /* ── Settings panel ── */
  .settings-panel {
    background: rgba(255,255,255,0.02);
    animation: slideDown 0.18s ease;
  }

  @keyframes slideDown {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .settings-grid {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* ── Keyboard shortcuts ── */
  .shortcuts {
    padding: 10px 18px;
  }

  .shortcuts-title {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #475569;
    margin-bottom: 6px;
  }

  .shortcut-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .shortcut {
    font-size: 11px;
    color: #64748b;
    display: flex;
    align-items: center;
    gap: 3px;
  }

  kbd {
    display: inline-flex;
    align-items: center;
    padding: 1px 5px;
    background: rgba(255,255,255,0.07);
    border: 1px solid rgba(255,255,255,0.12);
    border-radius: 4px;
    font-family: inherit;
    font-size: 10px;
    color: #94a3b8;
  }

  /* ── Footer ── */
  .footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 18px 14px;
    margin-top: auto;
  }

  .kofi-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    font-weight: 600;
    color: #000;
    text-decoration: none;
    padding: 8px 16px;
    border-radius: 20px;
    border: none;
    transition: all 0.15s;
    background: #72A4F2;
    box-shadow: 0 2px 8px rgba(255, 153, 0, 0.35);
  }

  .kofi-btn:hover {
    background: #ffb733;
    color: #1a1a1a;
    box-shadow: 0 4px 14px rgba(255, 153, 0, 0.5);
    transform: translateY(-1px);
  }

  .version {
    font-size: 10px;
    color: #334155;
  }

  /* ── Toast ── */
  .toast {
    position: absolute;
    bottom: 60px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(30, 30, 46, 0.95);
    color: #f1f5f9;
    padding: 7px 14px;
    border-radius: 20px;
    font-size: 12px;
    white-space: nowrap;
    border: 1px solid rgba(14, 165, 233, 0.4);
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    animation: fadeIn 0.15s ease;
    pointer-events: none;
    z-index: 100;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateX(-50%) translateY(4px); }
    to   { opacity: 1; transform: translateX(-50%) translateY(0); }
  }
</style>
