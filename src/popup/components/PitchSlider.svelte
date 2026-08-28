<script lang="ts">
  interface Props {
    value: number;
    onchange: (value: number) => void;
  }

  let { value, onchange }: Props = $props();

  const MIN = 0.5;
  const MAX = 2.0;
  const STEP = 0.1;

  function handleInput(e: Event) {
    const input = e.target as HTMLInputElement;
    onchange(parseFloat(input.value));
  }

  let fillPct = $derived(((value - MIN) / (MAX - MIN)) * 100);
</script>

<div class="field">
  <div class="label-row">
    <label for="pitch-slider">Pitch</label>
    <span class="value-badge">{value.toFixed(1)}</span>
  </div>

  <input
    id="pitch-slider"
    type="range"
    min={MIN}
    max={MAX}
    step={STEP}
    value={value}
    oninput={handleInput}
    aria-label="Voice pitch"
    aria-valuemin={MIN}
    aria-valuemax={MAX}
    aria-valuenow={value}
    style="--fill: {fillPct}%"
  />

  <div class="ticks" aria-hidden="true">
    <span>Low</span>
    <span>Normal</span>
    <span>High</span>
  </div>
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

  .ticks {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #475569;
    padding: 0 2px;
  }
</style>
