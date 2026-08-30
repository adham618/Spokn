<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    value: string;
    favorites: string[];
    onchange: (voiceName: string) => void;
    onfavoriteschange: (favorites: string[]) => void;
  }

  let { value, favorites, onchange, onfavoriteschange }: Props = $props();

  // ── Voice data ────────────────────────────────────────────────────────────

  interface VoiceGroup {
    lang: string;       // BCP-47 tag e.g. "en-US"
    label: string;      // Human-readable e.g. "English (United States)"
    voices: SpeechSynthesisVoice[];
  }

  let allVoices: SpeechSynthesisVoice[] = $state([]);
  let loaded = $state(false);
  let search = $state('');

  // Intl.DisplayNames for language labels
  const langNames = new Intl.DisplayNames([navigator.language, 'en'], { type: 'language' });

  function getLangLabel(tag: string): string {
    try {
      return langNames.of(tag) ?? tag;
    } catch {
      return tag;
    }
  }

  function loadVoices() {
    const all = speechSynthesis.getVoices();
    if (all.length === 0) return;
    allVoices = all;
    loaded = true;

    // Auto-pick first English local voice if nothing selected
    if (!value && all.length > 0) {
      const preferred =
        all.find(v => v.lang.startsWith('en') && v.localService) ??
        all.find(v => v.lang.startsWith('en')) ??
        all[0];
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

  // ── Derived: filtered + grouped ───────────────────────────────────────────

  // Normalise search query
  let query = $derived(search.trim().toLowerCase());

  // Voices matching the search query
  let matchedVoices: SpeechSynthesisVoice[] = $derived(
    query
      ? allVoices.filter(v =>
          v.name.toLowerCase().includes(query) ||
          v.lang.toLowerCase().includes(query) ||
          getLangLabel(v.lang).toLowerCase().includes(query)
        )
      : allVoices
  );

  // Favorite voices (matched)
  let favVoices: SpeechSynthesisVoice[] = $derived(
    matchedVoices.filter(v => favorites.includes(v.name))
  );

  // Groups for non-favorite voices, sorted by display label
  let groups: VoiceGroup[] = $derived((() => {
    const map = new Map<string, SpeechSynthesisVoice[]>();
    for (const v of matchedVoices) {
      if (favorites.includes(v.name)) continue; // already in favorites group
      const tag = v.lang || 'Unknown';
      if (!map.has(tag)) map.set(tag, []);
      map.get(tag)!.push(v);
    }
    return Array.from(map.entries())
      .map(([lang, voices]) => ({ lang, label: getLangLabel(lang), voices }))
      .sort((a, b) => a.label.localeCompare(b.label));
  })());

  // ── Interactions ──────────────────────────────────────────────────────────

  function handleSelectChange(e: Event) {
    const select = e.target as HTMLSelectElement;
    onchange(select.value);
  }

  function toggleFavorite(voiceName: string, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const next = favorites.includes(voiceName)
      ? favorites.filter(n => n !== voiceName)
      : [...favorites, voiceName];
    onfavoriteschange(next);
  }

  // The voice object for the currently selected value (for the star button)
  let selectedVoice = $derived(allVoices.find(v => v.name === value) ?? null);
  let isFav = $derived(value ? favorites.includes(value) : false);
</script>

<!-- ── Label row ─────────────────────────────────────────────────────────── -->
<div class="field">
  <div class="label-row">
    <label for="voice-search">Voice</label>
    {#if loaded && selectedVoice}
      <button
        class="fav-star"
        class:active={isFav}
        onclick={(e) => toggleFavorite(value, e)}
        title={isFav ? 'Remove from favorites' : 'Add to favorites'}
        aria-label={isFav ? `Unpin ${value}` : `Pin ${value}`}
        aria-pressed={isFav}
      >
        {isFav ? '★' : '☆'}
      </button>
    {/if}
  </div>

  <!-- ── Search input ──────────────────────────────────────────────────── -->
  {#if loaded}
    <div class="search-wrapper">
      <span class="search-icon" aria-hidden="true">⌕</span>
      <input
        id="voice-search"
        type="search"
        placeholder="Search voices or language…"
        bind:value={search}
        autocomplete="off"
        spellcheck="false"
        aria-label="Search voices"
      />
      {#if search}
        <button class="search-clear" onclick={() => (search = '')} aria-label="Clear search">✕</button>
      {/if}
    </div>
  {/if}

  <!-- ── Select ────────────────────────────────────────────────────────── -->
  <div class="select-wrapper">
    {#if !loaded}
      <select id="voice-picker" disabled aria-busy="true">
        <option>Loading voices…</option>
      </select>
    {:else if matchedVoices.length === 0}
      <select id="voice-picker" disabled>
        <option>No voices match "{search}"</option>
      </select>
    {:else}
      <select id="voice-picker" value={value} onchange={handleSelectChange} aria-label="Select voice">
        <!-- Pinned / Favorites group -->
        {#if favVoices.length > 0}
          <optgroup label="★ Favorites">
            {#each favVoices as voice}
              <option value={voice.name}>
                {voice.name}{voice.localService ? '' : ' ☁'}
              </option>
            {/each}
          </optgroup>
        {/if}

        <!-- Language groups -->
        {#each groups as group}
          <optgroup label={group.label}>
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

  <!-- Selected voice meta -->
  {#if loaded && selectedVoice}
    <p class="voice-meta">
      <span class="voice-lang">{getLangLabel(selectedVoice.lang)}</span>
      <span class="voice-badge">{selectedVoice.localService ? 'Local' : 'Network ☁'}</span>
    </p>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  /* ── Label row ── */
  .label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  label {
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #94a3b8;
  }

  /* ── Favorite star ── */
  .fav-star {
    background: none;
    border: none;
    padding: 0 2px;
    font-size: 16px;
    line-height: 1;
    color: #475569;
    cursor: pointer;
    transition: color 0.15s, transform 0.15s;
  }

  .fav-star:hover {
    color: #fbbf24;
    transform: scale(1.2);
  }

  .fav-star.active {
    color: #fbbf24;
  }

  /* ── Search ── */
  .search-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: 10px;
    color: #475569;
    font-size: 15px;
    pointer-events: none;
    line-height: 1;
  }

  input[type="search"] {
    width: 100%;
    padding: 6px 30px 6px 30px;
    background: #0f172a;
    color: #f1f5f9;
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 8px;
    font-size: 12px;
    font-family: inherit;
    outline: none;
    transition: border-color 0.15s;
    /* hide browser's native search decorations */
    -webkit-appearance: none;
    appearance: none;
  }

  input[type="search"]::-webkit-search-decoration,
  input[type="search"]::-webkit-search-cancel-button {
    display: none;
  }

  input[type="search"]:focus {
    border-color: #0ea5e9;
    box-shadow: 0 0 0 2px rgba(14, 165, 233, 0.2);
  }

  .search-clear {
    position: absolute;
    right: 8px;
    background: none;
    border: none;
    color: #475569;
    font-size: 11px;
    cursor: pointer;
    padding: 2px 3px;
    line-height: 1;
    transition: color 0.12s;
  }

  .search-clear:hover {
    color: #94a3b8;
  }

  /* ── Select ── */
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

  /* ── Voice meta ── */
  .voice-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    padding: 0 2px;
  }

  .voice-lang {
    font-size: 11px;
    color: #64748b;
  }

  .voice-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.06);
    color: #64748b;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }
</style>
