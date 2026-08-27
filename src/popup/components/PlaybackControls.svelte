<script lang="ts">
  import type { PlaybackStatus, ReadingMode } from '../../shared/types.js';

  interface Props {
    status: PlaybackStatus;
    mode: ReadingMode;
    wordIndex: number;
    totalWords: number;
    currentWord: string;
    currentSentence: string;
    onplay: (mode: ReadingMode) => void;
    onpause: () => void;
    onresume: () => void;
    onstop: () => void;
    onmodechange: (mode: ReadingMode) => void;
  }

  let {
    status,
    mode,
    wordIndex,
    totalWords,
    currentWord,
    currentSentence,
    onplay,
    onpause,
    onresume,
    onstop,
    onmodechange,
  }: Props = $props();

  const MODES: { value: ReadingMode; label: string; icon: string; title: string }[] = [
    { value: 'selection', label: 'Selection', icon: '✏️', title: 'Read selected text' },
    { value: 'page',      label: 'Full Page',  icon: '📄', title: 'Read entire page' },
    { value: 'click',     label: 'Click',      icon: '👆', title: 'Click any element to start reading' },
  ];

  let progressPct = $derived(totalWords > 0 ? (wordIndex / totalWords) * 100 : 0);

  let statusLabel = $derived(
    status === 'playing' ? 'Reading…'
    : status === 'paused' ? 'Paused'
    : 'Stopped'
  );

  let statusColor = $derived(
    status === 'playing' ? '#22c55e'
    : status === 'paused' ? '#f59e0b'
    : '#94a3b8'
  );

  function handleMainButton() {
    if (status === 'stopped') {
      onplay(mode);
    } else if (status === 'playing') {
      onpause();
    } else if (status === 'paused') {
      onresume();
    }
  }

  let mainBtnLabel = $derived(
    status === 'playing' ? 'Pause' : status === 'paused' ? 'Resume' : 'Play'
  );

  let mainBtnIcon = $derived(
    status === 'playing' ? '⏸' : status === 'paused' ? '▶' : '▶'
  );
</script>

<!-- Mode selector -->
<div class="mode-selector" role="group" aria-label="Reading mode">
  {#each MODES as m}
    <button
      class="mode-btn"
      class:active={mode === m.value}
      onclick={() => onmodechange(m.value)}
      aria-pressed={mode === m.value}
      title={m.title}
      disabled={status === 'playing' || status === 'paused'}
    >
      <span aria-hidden="true">{m.icon}</span>
      {m.label}
    </button>
  {/each}
</div>

<!-- Progress bar -->
{#if totalWords > 0}
  <div class="progress-bar" role="progressbar" aria-valuenow={wordIndex} aria-valuemax={totalWords} aria-label="Reading progress">
    <div class="progress-fill" style="width: {progressPct}%"></div>
  </div>
{/if}

<!-- Status line -->
<div class="status-row">
  <span class="status-dot" style="background: {statusColor}" aria-hidden="true"></span>
  <span class="status-text">{statusLabel}</span>
  {#if currentWord && status === 'playing'}
    <span class="current-word" aria-live="polite" aria-label="Current word: {currentWord}">"{currentWord}"</span>
  {/if}
  {#if totalWords > 0}
    <span class="progress-text">{wordIndex} / {totalWords}</span>
  {/if}
</div>

<!-- Sentence preview -->
{#if currentSentence && status !== 'stopped'}
  <div class="sentence-preview" aria-live="polite" aria-label="Current sentence">
    {currentSentence.length > 80 ? currentSentence.slice(0, 80) + '…' : currentSentence}
  </div>
{/if}

<!-- Controls -->
<div class="controls">
  <button
    class="btn btn-play"
    class:btn-pause={status === 'playing'}
    onclick={handleMainButton}
    aria-label={mainBtnLabel}
    title={mainBtnLabel}
    disabled={mode === 'click' && status === 'stopped'}
  >
    <span aria-hidden="true">{mainBtnIcon}</span>
    {mainBtnLabel}
  </button>

  <button
    class="btn btn-stop"
    onclick={onstop}
    aria-label="Stop"
    title="Stop reading"
    disabled={status === 'stopped'}
  >
    <span aria-hidden="true">⏹</span>
    Stop
  </button>
</div>

<style>
  .mode-selector {
    display: flex;
    gap: 4px;
    background: rgba(255,255,255,0.05);
    padding: 4px;
    border-radius: 10px;
  }

  .mode-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 6px 4px;
    border-radius: 7px;
    border: none;
    background: transparent;
    color: #94a3b8;
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s;
    font-weight: 500;
  }

  .mode-btn:hover:not(:disabled) {
    color: #f1f5f9;
    background: rgba(255,255,255,0.07);
  }

  .mode-btn.active {
    background: #7c3aed;
    color: #fff;
    font-weight: 600;
  }

  .mode-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .progress-bar {
    height: 3px;
    background: rgba(255,255,255,0.1);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #7c3aed, #a855f7);
    border-radius: 3px;
    transition: width 0.3s ease;
  }

  .status-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
  }

  .status-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
    transition: background 0.2s;
  }

  .status-text {
    color: #94a3b8;
    font-weight: 500;
  }

  .current-word {
    color: #f1f5f9;
    font-weight: 600;
    font-style: italic;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .progress-text {
    color: #475569;
    font-size: 11px;
    margin-left: auto;
    white-space: nowrap;
  }

  .sentence-preview {
    font-size: 11px;
    color: #64748b;
    background: rgba(255,255,255,0.04);
    border-radius: 6px;
    padding: 6px 10px;
    border-left: 2px solid rgba(124, 58, 237, 0.4);
    line-height: 1.4;
    font-style: italic;
  }

  .controls {
    display: flex;
    gap: 8px;
  }

  .btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 0;
    border-radius: 10px;
    border: none;
    font-size: 13px;
    font-weight: 600;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s;
    flex: 1;
  }

  .btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .btn-play {
    background: #7c3aed;
    color: #fff;
  }

  .btn-play:hover:not(:disabled) {
    background: #6d28d9;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(124, 58, 237, 0.4);
  }

  .btn-play:active:not(:disabled) {
    transform: translateY(0);
  }

  .btn-pause {
    background: rgba(124, 58, 237, 0.2);
    color: #a78bfa;
    border: 1px solid rgba(124, 58, 237, 0.4);
  }

  .btn-pause:hover:not(:disabled) {
    background: rgba(124, 58, 237, 0.3);
  }

  .btn-stop {
    background: rgba(255, 255, 255, 0.06);
    color: #94a3b8;
    border: 1px solid rgba(255,255,255,0.1);
    flex: 0 0 auto;
    padding: 10px 16px;
    flex: initial;
    min-width: 80px;
  }

  .btn-stop:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.15);
    color: #fca5a5;
    border-color: rgba(239, 68, 68, 0.3);
  }
</style>
