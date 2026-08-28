<script lang="ts">
  interface Props {
    value: number;
    onchange: (value: number) => void;
  }

  let { value, onchange }: Props = $props();

  const MIN = 0;
  const MAX = 1;
  const STEP = 0.05;

  function handleInput(e: Event) {
    const input = e.target as HTMLInputElement;
    onchange(parseFloat(input.value));
  }

  let fillPct = $derived(((value - MIN) / (MAX - MIN)) * 100);

  // Icon changes based on volume level
  let icon = $derived(
    value === 0 ? '🔇' : value < 0.4 ? '🔈' : value < 0.75 ? '🔉' : '🔊'
  );
</script>

<div class="field">
  <div class="label-row">
    <label for="volume-slider">
      <span aria-hidden="true">{icon}</span> Volume
    </label>
    <span class="value-badge">{Math.round(value * 100)}%</span>
  </div>

  <input
    id="volume-slider"
    type="range"
    min={MIN}
    max={MAX}
    step={STEP}
    value={value}
    oninput={handleInput}
    aria-label="Volume"
    aria-valuemin={MIN}
    aria-valuemax={MAX}
    aria-valuenow={value}
    aria-valuetext="{Math.round(value * 100)}%"
    style="--fill: {fillPct}%"
  />
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
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
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .value-badge {
    font-size: 12px;
    font-weight: 700;
    color: #0ea5e9;
    background: rgba(14, 165, 233, 0.15);
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
      #0ea5e9 0%,
      #0ea5e9 var(--fill),
      rgba(255,255,255,0.12) var(--fill),
      rgba(255,255,255,0.12) 100%
    );
  }

  input[type='range']::-webkit-slider-thumb {
    -webkit-appearance: none;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: #0ea5e9;
    border: 2px solid #f1f5f9;
    box-shadow: 0 1px 4px rgba(0,0,0,0.4);
    transition: transform 0.1s, box-shadow 0.1s;
  }

  input[type='range']::-webkit-slider-thumb:hover {
    transform: scale(1.2);
    box-shadow: 0 0 0 4px rgba(14,165,233,0.3);
  }
</style>
