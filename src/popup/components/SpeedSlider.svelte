<script lang="ts">
  interface Props {
    value: number;
    onchange: (value: number) => void;
  }

  let { value, onchange }: Props = $props();

  const MIN = 0.5;
  const MAX = 3.0;
  const STEP = 0.1;

  const PRESETS = [0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];

  function handleInput(e: Event) {
    const input = e.target as HTMLInputElement;
    onchange(parseFloat(input.value));
  }

  function setPreset(preset: number) {
    onchange(preset);
  }

  // Fill percentage for the track gradient
  let fillPct = $derived(((value - MIN) / (MAX - MIN)) * 100);
</script>

<div class="field">
  <div class="label-row">
    <label for="speed-slider">Speed</label>
    <span class="value-badge">{value.toFixed(1)}x</span>
  </div>

  <input
    id="speed-slider"
    type="range"
    min={MIN}
    max={MAX}
    step={STEP}
    value={value}
    oninput={handleInput}
    aria-label="Playback speed"
    aria-valuemin={MIN}
    aria-valuemax={MAX}
    aria-valuenow={value}
    aria-valuetext="{value.toFixed(1)}x"
    style="--fill: {fillPct}%"
  />

  <div class="presets" role="group" aria-label="Speed presets">
    {#each PRESETS as preset}
      <button
        class="preset-btn"
        class:active={Math.abs(value - preset) < 0.01}
        onclick={() => setPreset(preset)}
        aria-pressed={Math.abs(value - preset) < 0.01}
        aria-label="{preset}x speed"
      >
        {preset === 1.0 ? '1x' : `${preset}x`}
      </button>
    {/each}
  </div>
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

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

  .value-badge {
    font-size: 12px;
    font-weight: 700;
    color: #7c3aed;
    background: rgba(124, 58, 237, 0.15);
    padding: 2px 8px;
    border-radius: 20px;
  }

  input[type='range'] {
    width: 100%;
    height: 4px;
    -webkit-appearance: none;
    appearance: none;
    border-radius: 4px;
    outline: none;
    cursor: pointer;
    background: linear-gradient(
      to right,
      #7c3aed 0%,
      #7c3aed var(--fill),
      rgba(255,255,255,0.12) var(--fill),
      rgba(255,255,255,0.12) 100%
    );
  }

  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #7c3aed;
    border: 2px solid #f1f5f9;
    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    transition: transform 0.1s, box-shadow 0.1s;
  }

  input[type='range']::-webkit-slider-thumb:hover {
    transform: scale(1.2);
    box-shadow: 0 0 0 4px rgba(124,58,237,0.3);
  }

  input[type='range']::-webkit-slider-thumb:active {
    transform: scale(1.1);
  }

  .presets {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .preset-btn {
    padding: 3px 8px;
    border-radius: 20px;
    border: 1px solid rgba(255,255,255,0.12);
    background: transparent;
    color: #94a3b8;
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.12s;
  }

  .preset-btn:hover {
    border-color: #7c3aed;
    color: #f1f5f9;
  }

  .preset-btn.active {
    background: #7c3aed;
    border-color: #7c3aed;
    color: #fff;
    font-weight: 600;
  }
</style>
