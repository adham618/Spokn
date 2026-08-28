<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    value: string;
    onchange: (voiceName: string) => void;
  }

  let { value, onchange }: Props = $props();

  interface VoiceGroup {
    lang: string;
    voices: SpeechSynthesisVoice[];
  }

  let groups: VoiceGroup[] = $state([]);
  let loaded = $state(false);

  function loadVoices() {
    const all = speechSynthesis.getVoices();
    if (all.length === 0) return;

    // Group by language, sorted alphabetically
    const map = new Map<string, SpeechSynthesisVoice[]>();
    for (const v of all) {
      const lang = v.lang || 'Unknown';
      if (!map.has(lang)) map.set(lang, []);
      map.get(lang)!.push(v);
    }

    const sorted = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([lang, voices]) => ({ lang, voices }));

    groups = sorted;
    loaded = true;

    // If no voice is selected yet, auto-pick first English local voice
    if (!value && sorted.length > 0) {
      const enGroup = sorted.find(g => g.lang.startsWith('en'));
      const preferred = enGroup?.voices.find(v => v.localService) ?? enGroup?.voices[0] ?? sorted[0]?.voices[0];
      if (preferred) onchange(preferred.name);
    }
  }

  onMount(() => {
    loadVoices();
    if (!loaded) {
      speechSynthesis.addEventListener('voiceschanged', loadVoices, { once: true });
    }
    return () => {
      speechSynthesis.removeEventListener('voiceschanged', loadVoices);
    };
  });

  function handleChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    onchange(select.value);
  }
</script>

<div class="field">
  <label for="voice-picker">Voice</label>
  <div class="select-wrapper">
    {#if !loaded}
      <select id="voice-picker" disabled aria-busy="true">
        <option>Loading voices…</option>
      </select>
    {:else}
      <select id="voice-picker" value={value} onchange={handleChange} aria-label="Select voice">
        {#each groups as group}
          <optgroup label={group.lang}>
            {#each group.voices as voice}
              <option value={voice.name}>
                {voice.name}{voice.localService ? '' : ' ☁'}
              </option>
            {/each}
          </optgroup>
        {/each}
      </select>
    {/if}
    <span class="select-arrow" aria-hidden="true">▾</span>
  </div>
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #94a3b8;
  }

  .select-wrapper {
    position: relative;
  }

  select {
    width: 100%;
    padding: 8px 32px 8px 12px;
    background: #0f172a;
    color: #f1f5f9;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
    appearance: none;
    -webkit-appearance: none;
    cursor: pointer;
    transition: border-color 0.15s;
    outline: none;
  }

  select:focus {
    border-color: #0ea5e9;
    box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.25);
  }

  select:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .select-arrow {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    color: #94a3b8;
    font-size: 11px;
    pointer-events: none;
  }
</style>
