/**
 * floatingToolbar.ts
 *
 * The full Spokn UI — injected directly into the host page via Shadow DOM.
 * No browser popup. Clicking the extension icon toggles this panel.
 * All icons are inline SVGs (Lucide style — 24px viewBox, 2px stroke, round caps/joins).
 */

import { HIGHLIGHT_THEMES } from "./highlightTheme";


export interface ToolbarCallbacks {
  onPlay: (mode: 'selection' | 'page' | 'click') => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onClose: () => void;
  onVoiceChange: (name: string) => void;
  onSpeedChange: (rate: number) => void;
  onPitchChange: (pitch: number) => void;
  onVolumeChange: (volume: number) => void;
  onModeChange: (mode: 'selection' | 'page' | 'click') => void;
  onThemeChange: (themeId: string) => void;
  onHoverBorderToggle: (enabled: boolean) => void;
  onReset: () => void;
}

export interface ToolbarState {
  status: 'playing' | 'paused' | 'stopped';
  rate: number;
  pitch: number;
  volume: number;
  voiceName: string;
  mode: 'selection' | 'page' | 'click';
  currentSentence: string;
  currentWord: string;
  wordIndex: number;
  totalWords: number;
  highlightTheme: string;
  hoverBorderEnabled: boolean;
}

// ─── SVG icon library ─────────────────────────────────────────────────────────
// All icons: viewBox="0 0 24 24", stroke="currentColor", stroke-width="2",
// stroke-linecap="round", stroke-linejoin="round", fill="none"

const SVG_ATTRS = `xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;

const ICONS = {
  play:     `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="8 4.5 11.75 15" aria-hidden="true" style="transform:translateX(2px)"><path d="M8 5.5v13a1 1 0 0 0 1.53.85l9.75-6.5a1 1 0 0 0 0-1.7l-9.75-6.5A1 1 0 0 0 8 5.5Z"/></svg>`,
  pause:    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="4.5 0 27 36" aria-hidden="true"><path d="M9,0A4.50022,4.50022,0,0,0,4.5,4.5v27a4.5,4.5,0,0,0,9,0V4.5A4.50022,4.50022,0,0,0,9,0Z"/><path d="M27,0a4.50022,4.50022,0,0,0-4.5,4.5v27a4.5,4.5,0,0,0,9,0V4.5A4.50022,4.50022,0,0,0,27,0Z"/></svg>`,
  stop:     `<svg ${SVG_ATTRS}><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`,
  settings: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.92c.04-.34.07-.68.07-1.08s-.03-.73-.07-1.08l2.32-1.81c.21-.16.27-.46.13-.7l-2.2-3.81c-.14-.24-.42-.32-.66-.24l-2.74 1.11c-.57-.44-1.18-.81-1.86-1.08L14.99 2.42C14.96 2.18 14.75 2 14.5 2h-4.4c-.25 0-.46.18-.49.42l-.38 2.47c-.68.27-1.3.64-1.86 1.08L4.63 4.86c-.24-.09-.52 0-.66.24L1.77 8.91c-.14.24-.08.54.13.7L4.22 11.42c-.04.35-.07.69-.07 1.08s.03.73.07 1.08l-2.32 1.81c-.21.16-.27.46-.13.7l2.2 3.81c.14.24.42.32.66.24l2.74-1.11c.57.44 1.18.81 1.86 1.08l.38 2.47c.03.24.24.42.49.42h4.4c.25 0 .46-.18.49-.42l.38-2.47c.68-.27 1.3-.64 1.86-1.08l2.74 1.11c.24.09.52 0 .66-.24l2.2-3.81c.14-.24.08-.54-.13-.7l-2.32-1.81Z"/></svg>`,
  close:    `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" viewBox="7.67 7.67 16.66 16.66"><path fill="currentColor" d="M23.879 21.22l-5.224-5.221 5.22-5.224c0.602-0.6 0.602-1.565 0.002-2.167l-0.485-0.486c-0.285-0.292-0.675-0.451-1.085-0.451-0.002 0-0.002 0-0.002 0-0.41 0-0.795 0.161-1.083 0.45l-5.222 5.226-5.224-5.22c-0.599-0.6-1.563-0.603-2.165-0.003l-0.486 0.481c-0.293 0.287-0.453 0.677-0.453 1.086 0 0.411 0.161 0.798 0.45 1.086l5.226 5.222-5.221 5.224c-0.602 0.6-0.602 1.565-0.002 2.169l0.485 0.485c0.287 0.292 0.676 0.451 1.086 0.451 0.408 0 0.798-0.163 1.085-0.45l5.221-5.225 5.222 5.219c0.296 0.299 0.69 0.45 1.085 0.45 0.391 0 0.783-0.149 1.082-0.447l0.485-0.484c0.294-0.285 0.453-0.675 0.453-1.085 0.002-0.41-0.159-0.797-0.448-1.086z"/></svg>`,
  grip:     `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>`,
  chevron:  `<svg  ${SVG_ATTRS} xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" viewBox="19.65 32.2 60.55 36.15"><path fill="currentColor" d="M21.364,42.218l24.329,24.329c0.026,0.027,0.034,0.065,0.061,0.091c1.146,1.146,2.659,1.715,4.17,1.711c1.511,0.004,3.023-0.564,4.17-1.711c0.027-0.027,0.034-0.064,0.061-0.091l24.329-24.329c2.285-2.285,2.285-6.024,0-8.308s-6.024-2.285-8.308,0L49.923,54.161L29.672,33.91c-2.285-2.285-6.024-2.285-8.308,0S19.079,39.934,21.364,42.218z"/></svg>`,
  coffee:   `<svg ${SVG_ATTRS}><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/><line x1="6" y1="1" x2="6" y2="4"/><line x1="10" y1="1" x2="10" y2="4"/><line x1="14" y1="1" x2="14" y2="4"/></svg>`,
  highlight:`<svg ${SVG_ATTRS}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
  filetext: `<svg ${SVG_ATTRS}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
  pointer:  `<svg ${SVG_ATTRS}><path d="M4 4l7.07 17 2.51-7.39L21 11.07z"/></svg>`,
} as const;

export class FloatingToolbar {
  private host: HTMLDivElement | null = null;
  private shadow: ShadowRoot | null = null;
  private cb: ToolbarCallbacks;
  private st: ToolbarState;
  private settingsOpen = false;

  // Drag
  private dragging = false;
  private dragDx = 0;
  private dragDy = 0;
  private posX: number | null = null;
  private posY: number | null = null;

  private static readonly POS_KEY = 'spokn-toolbar-pos';

  private boundMouseMove: (e: MouseEvent) => void;
  private boundMouseUp: () => void;

  constructor(callbacks: ToolbarCallbacks, initialState: ToolbarState) {
    this.cb = callbacks;
    this.st = { ...initialState };
    this.boundMouseMove = this.onMouseMove.bind(this);
    this.boundMouseUp   = this.onMouseUp.bind(this);
  }

  // ─── Mount / unmount ────────────────────────────────────────────────────────

  mount(): void {
    if (this.host) return;

    this.host = document.createElement('div');
    this.host.id = 'spokn-host';

    // Restore last saved position, or fall back to default (right edge, vertically centred).
    // Saved coords are in viewport space (position: fixed).
    // Clamp with generous margin so the toolbar is never off-screen.
    const MARGIN = 8;
    const savedPos = this.loadPosition();
    let defaultStyles: Partial<CSSStyleDeclaration>;
    if (savedPos) {
      const clampedX = Math.max(0, Math.min(savedPos.x, window.innerWidth  - 80));
      const clampedY = Math.max(0, Math.min(savedPos.y, window.innerHeight - 80));
      this.posX = clampedX;
      this.posY = clampedY;
      defaultStyles = { left: `${this.posX}px`, top: `${this.posY}px`, right: 'auto', transform: 'none' };
    } else {
      defaultStyles = { right: `${MARGIN}px`, top: '50%', transform: 'translateY(-50%)' };
    }

    Object.assign(this.host.style, {
      all: 'initial',
      position: 'fixed',
      zIndex: '2147483647',
      pointerEvents: 'none',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      ...defaultStyles,
    });

    this.shadow = this.host.attachShadow({ mode: 'open' });
    this.render();
    document.body.appendChild(this.host);

    requestAnimationFrame(() => {
      const panel = this.shadow?.getElementById('spokn-panel');
      if (panel) { panel.style.opacity = '1'; panel.style.transform = 'translateX(0)'; }
    });

    document.addEventListener('mousemove', this.boundMouseMove, { passive: true });
    document.addEventListener('mouseup', this.boundMouseUp);
  }

  unmount(): void {
    document.removeEventListener('mousemove', this.boundMouseMove);
    document.removeEventListener('mouseup', this.boundMouseUp);
    this.host?.remove();
    this.host = null;
    this.shadow = null;
    this.settingsOpen = false;
    this.posX = null;
    this.posY = null;
  }

  isVisible(): boolean { return this.host !== null; }

  // ─── State updates ──────────────────────────────────────────────────────────

  updateState(partial: Partial<ToolbarState>): void {
    this.st = { ...this.st, ...partial };
    if (!this.shadow) return;

    // Play/pause button — swap SVG icon
    const playBtn = this.shadow.getElementById('spokn-playpause');
    if (playBtn) {
      const isPlaying = this.st.status === 'playing';
      playBtn.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
      playBtn.setAttribute('aria-label', isPlaying ? 'Pause' : 'Play');
      playBtn.setAttribute('title',      isPlaying ? 'Pause' : 'Play');
    }

    // Slider syncs
    this.syncInput('spokn-speed-slider', this.st.rate);
    this.syncInput('spokn-pitch-slider', this.st.pitch);
    this.syncInput('spokn-vol-slider',   this.st.volume);
    this.syncSliderFill('spokn-speed-slider', this.st.rate, 0.5, 3.0);
    this.syncSliderFill('spokn-pitch-slider', this.st.pitch, 0.5, 2.0);
    this.syncSliderFill('spokn-vol-slider',   this.st.volume, 0, 1);
  }

  // ─── Full render ─────────────────────────────────────────────────────────────

  private render(): void {
    if (!this.shadow) return;
    this.shadow.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = this.css();
    this.shadow.appendChild(style);
    const panel = document.createElement('div');
    panel.id = 'spokn-panel';
    panel.innerHTML = this.html();
    this.shadow.appendChild(panel);
    this.attachListeners();
    this.populateVoices();
    this.setVoiceHelpLink();
    this.syncAllSliders();
  }

  // ─── HTML ────────────────────────────────────────────────────────────────────

  private html(): string {
    const { rate, pitch, volume, mode, status } = this.st;
    const isPlaying = status === 'playing';
    const speedPct  = ((rate   - 0.5) / 2.5)  * 100;
    const pitchPct  = ((pitch  - 0.5) / 1.5)  * 100;
    const volPct    = volume * 100;

    const modeIcon = (m: string) =>
      m === 'selection' ? ICONS.highlight : ICONS.filetext;
    const modeLabel = (m: string) =>
      m === 'selection' ? 'Selection' : 'Full Page';

    return `
      <div id="spokn-settings" class="${this.settingsOpen ? 'open' : ''}">

        <div class="settings-section">
          <div class="settings-section-title">Playback</div>

          <div class="settings-row">
            <span class="settings-label">Mode</span>
            <div class="mode-group" role="group" aria-label="Reading mode">
              ${(['selection', 'page'] as const).map(m => `
                <button class="mode-btn${mode === m ? ' mode-btn-active' : ''}"
                  data-mode="${m}" aria-pressed="${mode === m}" title="${modeLabel(m)}">
                  <span class="mode-icon">${modeIcon(m)}</span>
                  <span class="mode-label">${modeLabel(m)}</span>
                </button>
              `).join('')}
            </div>
          </div>

          <div class="settings-row">
            <label class="settings-label" for="spokn-voice-select">Voice</label>
            <div class="select-wrap">
              <select id="spokn-voice-select" aria-label="Select voice">
                <option value="">Loading voices…</option>
              </select>
              <span class="select-arrow" aria-hidden="true">${ICONS.chevron}</span>
            </div>
          </div>
          <div class="voice-hint-row">
            <span class="voice-hint-icon" aria-hidden="true">
              <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            </span>
            <a id="spokn-voice-help-link" class="voice-hint-link" href="#" target="_blank" rel="noopener noreferrer">
              How to add more voices?
            </a>
          </div>

          <div class="settings-row">
            <label class="settings-label" for="spokn-speed-slider">Speed</label>
            <div class="slider-wrap">
              <input id="spokn-speed-slider" type="range"
                min="0.5" max="3" step="0.1" value="${rate}"
                aria-label="Speed" style="--fill:${speedPct}%"/>
              <span class="slider-val">${rate.toFixed(1)}x</span>
            </div>
          </div>

          <div class="settings-row">
            <label class="settings-label" for="spokn-pitch-slider">Pitch</label>
            <div class="slider-wrap">
              <input id="spokn-pitch-slider" type="range"
                min="0.5" max="2" step="0.1" value="${pitch}"
                aria-label="Pitch" style="--fill:${pitchPct}%"/>
              <span class="slider-val">${pitch.toFixed(1)}</span>
            </div>
          </div>

          <div class="settings-row">
            <label class="settings-label" for="spokn-vol-slider">Volume</label>
            <div class="slider-wrap">
              <input id="spokn-vol-slider" type="range"
                min="0" max="1" step="0.05" value="${volume}"
                aria-label="Volume" style="--fill:${volPct}%"/>
              <span class="slider-val">${Math.round(volume * 100)}%</span>
            </div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Appearance</div>

          <div class="settings-row">
            <span class="settings-label">Highlight</span>
            <div class="theme-swatches" role="group" aria-label="Highlight color">
              ${HIGHLIGHT_THEMES.map(t => `
                <button
                  class="theme-swatch${this.st.highlightTheme === t.id ? ' theme-swatch-active' : ''}"
                  data-theme="${t.id}"
                  title="${t.label}"
                  aria-label="${t.label} highlight"
                  aria-pressed="${this.st.highlightTheme === t.id}"
                  style="--swatch:${t.swatch}">
                </button>
              `).join('')}
            </div>
          </div>

          <div class="settings-row">
            <span class="settings-label">Border</span>
            <label class="toggle-wrap" title="Show hover border around paragraphs">
              <input type="checkbox" id="spokn-hover-border-toggle"
                ${this.st.hoverBorderEnabled ? 'checked' : ''}
                aria-label="Show hover border">
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
              <span class="toggle-label">Paragraph hover border</span>
            </label>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Shortcuts</div>
          <div id="spokn-shortcuts">
            ${navigator.userAgent.toLowerCase().includes('mac') ? `
            <div class="shortcut-row">
              <span class="shortcut-keys"><kbd>⌘</kbd><kbd>Shift</kbd><kbd>9</kbd></span>
              <span class="shortcut-desc">Play / Pause</span>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-keys"><kbd>⌘</kbd><kbd>Shift</kbd><kbd>0</kbd></span>
              <span class="shortcut-desc">Stop</span>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-keys"><kbd>⌘</kbd><kbd>Shift</kbd><kbd>8</kbd></span>
              <span class="shortcut-desc">Read selection</span>
            </div>
            ` : `
            <div class="shortcut-row">
              <span class="shortcut-keys"><kbd>Alt</kbd><kbd>Shift</kbd><kbd>9</kbd></span>
              <span class="shortcut-desc">Play / Pause</span>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-keys"><kbd>Alt</kbd><kbd>Shift</kbd><kbd>0</kbd></span>
              <span class="shortcut-desc">Stop</span>
            </div>
            <div class="shortcut-row">
              <span class="shortcut-keys"><kbd>Alt</kbd><kbd>Shift</kbd><kbd>8</kbd></span>
              <span class="shortcut-desc">Read selection</span>
            </div>
            `}
          </div>
        </div>

        <div class="settings-section">
          <div id="spokn-kofi">
            <a href="${import.meta.env.VITE_KOFI_URL}" target="_blank" rel="noopener noreferrer" id="spokn-kofi-btn">
              <img src="${chrome.runtime.getURL('kofi.png')}" alt="Ko-fi" id="spokn-kofi-logo"/>
              Support me on Ko-fi
            </a>
          </div>
          <div id="spokn-version">${import.meta.env.VITE_APP_NAME} v${import.meta.env.VITE_APP_VERSION}</div>
          <button id="spokn-reset-btn" title="Reset all settings to defaults">Reset to defaults</button>
        </div>

      </div>

      <div id="spokn-pill-wrap">
        <button id="spokn-close" aria-label="Close" title="Close">
          ${ICONS.close}
        </button>

        <div id="spokn-pill" class="${this.settingsOpen ? 'settings-open' : ''}">
          <div id="spokn-toolbar">
            <div id="spokn-drag" title="Drag to move" aria-hidden="true">${ICONS.grip}</div>

            <button id="spokn-playpause" class="btn btn-play"
              aria-label="${isPlaying ? 'Pause' : 'Play'}"
              title="${isPlaying ? 'Pause' : 'Play'}">
              ${isPlaying ? ICONS.pause : ICONS.play}
            </button>

            <div id="spokn-settings-divider"></div>

            <button id="spokn-settings-toggle"
              class="btn${this.settingsOpen ? ' btn-active' : ''}"
              aria-label="Settings" title="Settings"
            aria-expanded="${this.settingsOpen}">
            ${ICONS.settings}
          </button>
        </div>
      </div>
      </div>
    `;
  }

  // ─── Listeners ───────────────────────────────────────────────────────────────

  private attachListeners(): void {
    const s = this.shadow!;

    s.getElementById('spokn-playpause')?.addEventListener('click', () => {
      if (this.st.status === 'playing')     this.cb.onPause();
      else if (this.st.status === 'paused') this.cb.onResume();
      else                                  this.cb.onPlay(this.st.mode);
    });

    s.getElementById('spokn-settings-toggle')?.addEventListener('click', () => {
      this.settingsOpen = !this.settingsOpen;
      const panel = s.getElementById('spokn-settings');
      const pill  = s.getElementById('spokn-pill');
      const btn   = s.getElementById('spokn-settings-toggle');
      if (panel) panel.classList.toggle('open', this.settingsOpen);
      if (pill)  pill.classList.toggle('settings-open', this.settingsOpen);
      if (btn) {
        btn.setAttribute('aria-expanded', String(this.settingsOpen));
        btn.classList.toggle('btn-active', this.settingsOpen);
      }
      // Reposition the settings panel so it stays within the viewport.
      // After toggling open, measure available space above/below the host
      // and pin the panel to whichever side has more room.
      if (this.settingsOpen && panel && this.host) {
        // Reset first so we can measure natural height
        panel.style.top = '';
        panel.style.bottom = '';
        panel.style.transform = '';
        requestAnimationFrame(() => {
          const hostRect   = this.host!.getBoundingClientRect();
          const panelH     = panel.offsetHeight;
          const vh         = window.innerHeight;
          const PADDING    = 8;

          // Ideal: vertically centered on the host
          let top = hostRect.top + (hostRect.height / 2) - (panelH / 2);
          // Clamp so it doesn't overflow top or bottom
          top = Math.max(PADDING, Math.min(top, vh - panelH - PADDING));

          // Convert to position relative to the host element
          const relativeTop = top - hostRect.top;
          panel.style.top = `${relativeTop}px`;
          panel.style.transform = 'none';
        });
      }
    });

    s.getElementById('spokn-close')?.addEventListener('click', () => {
      this.cb.onClose();
    });

    s.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const m = (e.currentTarget as HTMLElement).dataset.mode as 'selection' | 'page' | 'click';
        this.st.mode = m;
        s.querySelectorAll('.mode-btn').forEach(b => {
          const active = (b as HTMLElement).dataset.mode === m;
          b.classList.toggle('mode-btn-active', active);
          b.setAttribute('aria-pressed', String(active));
        });
        this.cb.onModeChange(m);
      });
    });

    s.getElementById('spokn-voice-select')?.addEventListener('change', (e) => {
      const val = (e.target as HTMLSelectElement).value;
      this.st.voiceName = val;
      this.cb.onVoiceChange(val);
    });

    // Theme swatches
    s.querySelectorAll('.theme-swatch').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const themeId = (e.currentTarget as HTMLElement).dataset.theme!;
        this.st.highlightTheme = themeId;
        s.querySelectorAll('.theme-swatch').forEach(b => {
          const active = (b as HTMLElement).dataset.theme === themeId;
          b.classList.toggle('theme-swatch-active', active);
          b.setAttribute('aria-pressed', String(active));
        });
        this.cb.onThemeChange(themeId);
      });
    });

    // Hover border toggle
    s.getElementById('spokn-hover-border-toggle')?.addEventListener('change', (e) => {
      const enabled = (e.target as HTMLInputElement).checked;
      this.st.hoverBorderEnabled = enabled;
      this.cb.onHoverBorderToggle(enabled);
    });

    // Reset button
    s.getElementById('spokn-reset-btn')?.addEventListener('click', () => {
      if (confirm('Reset all Spokn settings to defaults?')) {
        this.cb.onReset();
      }
    });

    this.attachSlider('spokn-speed-slider', 0.5, 3.0, (v) => {
      const r = Math.round(v * 10) / 10;
      this.st.rate = r;
      const val = s.querySelector('#spokn-speed-slider + .slider-val') as HTMLElement | null;
      if (val) val.textContent = `${r.toFixed(1)}x`;
      this.cb.onSpeedChange(r);
    });

    this.attachSlider('spokn-pitch-slider', 0.5, 2.0, (v) => {
      const p = Math.round(v * 10) / 10;
      this.st.pitch = p;
      const val = s.querySelector('#spokn-pitch-slider + .slider-val') as HTMLElement | null;
      if (val) val.textContent = p.toFixed(1);
      this.cb.onPitchChange(p);
    });

    this.attachSlider('spokn-vol-slider', 0, 1, (v) => {
      const vol = Math.round(v * 100) / 100;
      this.st.volume = vol;
      const val = s.querySelector('#spokn-vol-slider + .slider-val') as HTMLElement | null;
      if (val) val.textContent = `${Math.round(vol * 100)}%`;
      this.cb.onVolumeChange(vol);
    });

    s.getElementById('spokn-drag')?.addEventListener('mousedown', (e: Event) => {
      const me = e as MouseEvent;
      me.preventDefault();
      this.dragging = true;
      const rect = this.host!.getBoundingClientRect();
      // position:fixed uses viewport coords — no scroll offset needed
      if (this.posX === null) {
        this.posX = rect.left;
        this.posY = rect.top;
        Object.assign(this.host!.style, {
          left: `${this.posX}px`, top: `${this.posY}px`,
          right: 'auto', transform: 'none',
        });
      }
      this.dragDx = me.clientX - rect.left;
      this.dragDy = me.clientY - rect.top;
      this.host!.style.cursor = 'grabbing';
    });
  }

  private attachSlider(id: string, min: number, max: number, onChange: (v: number) => void): void {
    const el = this.shadow?.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    el.addEventListener('input', () => {
      const v = parseFloat(el.value);
      onChange(v);
      this.syncSliderFill(id, v, min, max);
    });
  }

  // ─── Voices ──────────────────────────────────────────────────────────────────

  private populateVoices(): void {
    const doPopulate = () => {
      const all = speechSynthesis.getVoices();
      if (all.length === 0) return;
      const select = this.shadow?.getElementById('spokn-voice-select') as HTMLSelectElement | null;
      if (!select) return;

      const seen   = new Set<string>();
      const unique = all.filter(v => { if (seen.has(v.name)) return false; seen.add(v.name); return true; });

      const groups = new Map<string, SpeechSynthesisVoice[]>();
      for (const v of unique) {
        const lang = v.lang || 'Unknown';
        if (!groups.has(lang)) groups.set(lang, []);
        groups.get(lang)!.push(v);
      }

      select.innerHTML = '';
      Array.from(groups.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .forEach(([lang, voices]) => {
          const grp = document.createElement('optgroup');
          grp.label = lang;
          for (const v of voices) {
            const opt = document.createElement('option');
            opt.value = v.name;
            opt.textContent = v.name + (v.localService ? '' : ' (cloud)');
            if (v.name === this.st.voiceName) opt.selected = true;
            grp.appendChild(opt);
          }
          select.appendChild(grp);
        });

      if (!this.st.voiceName && unique.length > 0) {
        const preferred = unique.find(v => v.lang.startsWith('en') && v.localService)
          ?? unique.find(v => v.lang.startsWith('en')) ?? unique[0];
        if (preferred) {
          select.value = preferred.name;
          this.st.voiceName = preferred.name;
          this.cb.onVoiceChange(preferred.name);
        }
      }
    };

    doPopulate();
    if (speechSynthesis.getVoices().length === 0) {
      speechSynthesis.addEventListener('voiceschanged', doPopulate, { once: true });
    }
  }

  // ─── Voice help link ─────────────────────────────────────────────────────────

  private setVoiceHelpLink(): void {
    const link = this.shadow?.getElementById('spokn-voice-help-link') as HTMLAnchorElement | null;
    if (!link) return;

    const ua = navigator.userAgent.toLowerCase();
    const os = ua.includes('mac') ? 'macOS' : ua.includes('win') ? 'Windows' : 'my device';

    const prompt = `How do I add more text-to-speech voices on ${os}? I'm using a browser extension that reads web pages aloud and I want more voice options to choose from. Please give me simple step-by-step instructions for a regular user, no code.`;
    link.href = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
  }



  private onMouseMove(e: MouseEvent): void {
    if (!this.dragging || !this.host) return;

    // position:fixed uses viewport coords — no scroll offset
    const rawX = e.clientX - this.dragDx;
    const rawY = e.clientY - this.dragDy;

    const panel = this.shadow?.getElementById('spokn-panel');
    const w = panel?.offsetWidth  ?? 80;
    const h = panel?.offsetHeight ?? 80;

    const MARGIN = 8;
    this.posX = Math.max(0, Math.min(rawX, window.innerWidth  - w - MARGIN));
    this.posY = Math.max(0, Math.min(rawY, window.innerHeight - h - MARGIN));

    this.host.style.left = `${this.posX}px`;
    this.host.style.top  = `${this.posY}px`;
  }

  private onMouseUp(): void {
    if (!this.dragging) return;
    this.dragging = false;
    if (this.host) this.host.style.cursor = '';
    // Persist position so it survives close/reopen
    if (this.posX !== null && this.posY !== null) {
      this.savePosition(this.posX, this.posY);
    }
  }

  private savePosition(x: number, y: number): void {
    try { localStorage.setItem(FloatingToolbar.POS_KEY, JSON.stringify({ x, y })); } catch { /* ignore */ }
  }

  private loadPosition(): { x: number; y: number } | null {
    try {
      const raw = localStorage.getItem(FloatingToolbar.POS_KEY);
      if (!raw) return null;
      const { x, y } = JSON.parse(raw);
      if (typeof x === 'number' && typeof y === 'number') return { x, y };
    } catch { /* ignore */ }
    return null;
  }

  // ─── Slider helpers ───────────────────────────────────────────────────────────

  private syncInput(id: string, value: number): void {
    const el = this.shadow?.getElementById(id) as HTMLInputElement | null;
    if (el) el.value = String(value);
  }

  private syncSliderFill(id: string, value: number, min: number, max: number): void {
    const el = this.shadow?.getElementById(id) as HTMLInputElement | null;
    if (!el) return;
    const pct = ((value - min) / (max - min)) * 100;
    el.style.setProperty('--fill', `${pct}%`);
  }

  private syncAllSliders(): void {
    this.syncSliderFill('spokn-speed-slider', this.st.rate,   0.5, 3.0);
    this.syncSliderFill('spokn-pitch-slider', this.st.pitch,  0.5, 2.0);
    this.syncSliderFill('spokn-vol-slider',   this.st.volume, 0,   1);
  }

  // ─── CSS ──────────────────────────────────────────────────────────────────────

  private css(): string {
    return `
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      /* ── Design tokens ───────────────────────────────────────────────────── */
      /*
        --bg:        panel background
        --surface:   slightly lighter surface for inputs/buttons
        --border:    subtle divider/border
        --accent:    primary action colour (bright indigo-blue)
        --accent-dim: muted accent for fills
        --text:      primary text
        --muted:     secondary / label text
        --subtle:    placeholder / disabled text
      */

      svg { display: block; flex-shrink: 0; }

      #spokn-panel {
        pointer-events: auto;
        position: relative;
        display: flex;
        flex-direction: row;
        align-items: flex-start;
        gap: 10px;
        background: transparent;
        overflow: visible;
        opacity: 0;
        transform: translateX(20px);
        transition: opacity 0.22s ease, transform 0.22s ease;
        user-select: none;
        --bg:         #0f1117;
        --surface:    rgba(255,255,255,0.06);
        --surface-hv: rgba(255,255,255,0.1);
        --border:     rgba(255,255,255,0.09);
        --accent:     #0277D4;
        --accent-dim: rgba(2,119,212,0.18);
        --text:       #f0f4ff;
        --muted:      #8b95a8;
        --subtle:     #4a5568;
      }

      /* ── Pill wrap — hover zone covering pill + close button area ────────── */
      #spokn-pill-wrap {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        padding-top: 20px;
        margin-top: -20px;
      }

      /* ── Pill ────────────────────────────────────────────────────────────── */
      #spokn-pill {
        background: #1B1C1F;
        border-radius: 999px;
        border: 1px solid rgba(255,255,255,0.08);
        box-shadow: 0 2px 12px rgba(0,0,0,0.2);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
        color: var(--text);
        overflow: visible;
        position: relative;
        transition: background 0.18s ease, box-shadow 0.18s ease;
      }
      #spokn-pill-wrap:hover #spokn-pill,
      #spokn-pill.settings-open {
        background: #1B1C1F;
        box-shadow: 0 2px 12px rgba(0,0,0,0.3);
      }

      /* ── Close button — absolutely above the pill, out of flow ─────────── */
      #spokn-close {
        all: unset;
        position: absolute;
        top: -14px;
        left: 50%;
        transform: translateX(-50%);
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        color: #888;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s ease, color 0.12s, transform 0.08s;
        z-index: 10;
      }
      #spokn-close svg { width: 14px; height: 14px; }
      #spokn-pill-wrap:hover #spokn-close { opacity: 1; pointer-events: auto; }
      #spokn-close:hover { color: #888; }
      #spokn-close:active { transform: translateX(-50%) scale(0.92); }

      /* ── Toolbar column ──────────────────────────────────────────────────── */
      #spokn-toolbar {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 17px 7px 11px;
      }

      #spokn-drag {
        color: #BAB9BA;
        cursor: grab;
        padding: 4px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        border-radius: 6px;
        transition: color 0.12s;
        margin-bottom: 4px;
      }
      #spokn-drag:hover  { color: #BAB9BA; }
      #spokn-drag:active { cursor: grabbing; }

      #spokn-settings-toggle {
        color: #BAB9BA;
      }
      #spokn-settings-toggle:hover { color: #BAB9BA; }
      #spokn-settings-divider {
        width: 24px;
        height: 1px;
        background: #28292C;
        margin: 4px auto 0;
      }

      /* ── Buttons ─────────────────────────────────────────────────────────── */
      .btn {
        all: unset;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 44px;
        height: 44px;
        border-radius: 10px;
        cursor: pointer;
        color: #fff;
        transition: background 0.12s, color 0.12s, transform 0.08s;
        flex-shrink: 0;
      }
      .btn:hover  { background: var(--surface-hv); color: #fff; }
      .btn:active { transform: scale(0.9); }
      .btn[disabled] { opacity: 0.28; cursor: not-allowed; pointer-events: none; }

      .btn-play {
        color: #fff;
        background: var(--accent);
        border-radius: 50%;
        width: 44px;
        height: 44px;
      }
      .btn-play:hover { background: var(--accent); filter: brightness(1.15); }

      .btn-active { background: var(--surface-hv); color: #BAB9BA; }
      .btn-active:hover { background: var(--surface-hv); color: #BAB9BA; }

      /* ── Settings panel ──────────────────────────────────────────────────── */
      #spokn-settings {
        display: none;
        flex-direction: column;
        gap: 0;
        background: #1B1C1F;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 16px;
        box-shadow: 0 2px 12px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--text);
        width: 280px;
        max-height: calc(100vh - 32px);
        overflow-y: auto;
        overflow-x: hidden;
        /* Absolute so it doesn't affect the pill position */
        position: absolute;
        right: calc(100% + 10px);
        top: 50%;
        transform: translateY(-50%);
        animation: spokn-settings-in 0.18s ease forwards;
      }
      #spokn-settings.open { display: flex; }

      @keyframes spokn-settings-in {
        from { opacity: 0; transform: translateX(12px); }
        to   { opacity: 1; transform: translateX(0); }
      }

      .settings-section {
        padding: 14px 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .settings-section + .settings-section {
        border-top: 1px solid var(--border);
      }

      .settings-section-title {
        font-size: 9px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.12em;
        color: #c0c8d8;
        margin-bottom: 2px;
      }

      .settings-row {
        display: flex;
        align-items: center;
        gap: 10px;
      }

      .settings-label {
        font-size: 11px;
        font-weight: 500;
        color: var(--muted);
        width: 46px;
        flex-shrink: 0;
      }

      /* ── Mode buttons ────────────────────────────────────────────────────── */
      .mode-group {
        display: flex;
        flex: 1;
        background: rgba(0,0,0,0.25);
        border-radius: 8px;
        padding: 3px;
        gap: 3px;
      }
      .mode-btn {
        all: unset;
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 5px;
        padding: 5px 4px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: 500;
        color: rgba(255,255,255,0.45);
        cursor: pointer;
        transition: all 0.15s;
        font-family: inherit;
        white-space: nowrap;
      }
      .mode-btn:hover { color: rgba(255,255,255,0.8); background: rgba(255,255,255,0.06); }
      .mode-btn-active {
        background: var(--accent);
        color: #fff;
        font-weight: 600;
        box-shadow: 0 1px 4px rgba(2,119,212,0.4);
      }
      .mode-btn-active:hover { background: var(--accent); color: #fff; }
      .mode-icon { display: flex; align-items: center; }
      .mode-icon svg { width: 12px; height: 12px; }

      /* ── Voice hint ──────────────────────────────────────────────────────── */
      .voice-hint-row {
        display: flex;
        align-items: center;
        gap: 4px;
        padding-left: 56px; /* align under the select, past the label width + gap */
        margin-top: -6px;
      }
      .voice-hint-icon { display: flex; align-items: center; color: var(--muted); flex-shrink: 0; }
      .voice-hint-link {
        font-size: 10px;
        color: var(--accent);
        text-decoration: none;
        opacity: 0.85;
        transition: opacity 0.12s;
        line-height: 1;
      }
      .voice-hint-link:hover { opacity: 1; text-decoration: underline; }

      /* ── Select ──────────────────────────────────────────────────────────── */
      .select-wrap { position: relative; flex: 1; }
      select {
        width: 100%;
        padding: 7px 26px 7px 10px;
        background: var(--surface);
        color: var(--text);
        border: 1px solid var(--border);
        border-radius: 8px;
        font-size: 11px;
        font-family: inherit;
        appearance: none;
        -webkit-appearance: none;
        cursor: pointer;
        outline: none;
        transition: border-color 0.15s, background 0.15s;
      }
      select:focus { border-color: var(--accent); background: var(--surface-hv); }
      .select-arrow {
        position: absolute;
        right: 7px;
        top: 50%;
        transform: translateY(-50%);
        color: var(--muted);
        pointer-events: none;
        display: flex;
        align-items: center;
      }
      .select-arrow svg { width: 12px; height: 12px; }

      /* ── Sliders ─────────────────────────────────────────────────────────── */
      .slider-wrap { display: flex; align-items: center; gap: 8px; flex: 1; }
      .slider-val {
        font-size: 10px;
        font-weight: 700;
        color: var(--accent);
        min-width: 30px;
        text-align: right;
        flex-shrink: 0;
        letter-spacing: 0.02em;
      }
      input[type=range] {
        flex: 1;
        height: 3px;
        -webkit-appearance: none;
        appearance: none;
        border-radius: 3px;
        outline: none;
        cursor: pointer;
        background: linear-gradient(
          to right,
          var(--accent) 0%,
          var(--accent) var(--fill, 50%),
          rgba(255,255,255,0.1) var(--fill, 50%),
          rgba(255,255,255,0.1) 100%
        );
      }
      input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 13px;
        height: 13px;
        border-radius: 50%;
        background: #fff;
        border: 2px solid var(--accent);
        box-shadow: 0 1px 4px rgba(0,0,0,0.6);
        transition: transform 0.1s;
      }
      input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.3); }

      /* ── Theme swatches ──────────────────────────────────────────────────── */
      .theme-swatches { display: flex; gap: 6px; flex-wrap: wrap; flex: 1; }
      .theme-swatch {
        all: unset;
        width: 18px;
        height: 18px;
        border-radius: 50%;
        background: var(--swatch);
        cursor: pointer;
        border: 2px solid transparent;
        transition: transform 0.12s, border-color 0.12s;
        flex-shrink: 0;
        box-shadow: 0 1px 3px rgba(0,0,0,0.5);
      }
      .theme-swatch:hover { transform: scale(1.25); }
      .theme-swatch-active {
        border-color: #fff;
        transform: scale(1.2);
        box-shadow: 0 0 0 2px rgba(255,255,255,0.2);
      }
      .theme-swatch[data-theme="none"] {
        background: var(--surface);
        border: 2px solid var(--border);
        position: relative;
      }
      .theme-swatch[data-theme="none"]::after {
        content: '';
        position: absolute;
        inset: 0;
        margin: auto;
        width: 7px;
        height: 2px;
        background: var(--muted);
        border-radius: 2px;
      }

      /* ── Toggle switch ───────────────────────────────────────────────────── */
      .toggle-wrap { display: flex; align-items: center; gap: 8px; cursor: pointer; flex: 1; }
      .toggle-wrap input[type=checkbox] { position: absolute; opacity: 0; width: 0; height: 0; }
      .toggle-track {
        position: relative;
        width: 28px;
        height: 16px;
        background: var(--surface-hv);
        border-radius: 99px;
        flex-shrink: 0;
        transition: background 0.15s;
        border: 1px solid var(--border);
      }
      .toggle-wrap input:checked + .toggle-track { background: var(--accent); border-color: var(--accent); }
      .toggle-thumb {
        position: absolute;
        top: 2px;
        left: 2px;
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: #fff;
        transition: transform 0.15s;
        box-shadow: 0 1px 3px rgba(0,0,0,0.4);
      }
      .toggle-wrap input:checked + .toggle-track .toggle-thumb { transform: translateX(12px); }
      .toggle-label { font-size: 11px; color: var(--muted); }

      /* ── Shortcuts ───────────────────────────────────────────────────────── */
      #spokn-shortcuts { display: flex; flex-direction: column; gap: 6px; }
      .shortcut-row { display: flex; align-items: center; justify-content: space-between; }
      .shortcut-keys { display: flex; gap: 3px; align-items: center; }
      kbd {
        display: inline-flex;
        align-items: center;
        padding: 2px 5px;
        background: var(--surface);
        border: 1px solid rgba(255,255,255,0.14);
        border-radius: 4px;
        font-family: inherit;
        font-size: 9px;
        color: var(--text);
        line-height: 1.6;
      }
      .shortcut-desc { font-size: 10px; color: var(--muted); }

      /* ── Ko-fi ───────────────────────────────────────────────────────────── */
      #spokn-kofi { display: flex; align-items: center; justify-content: center; }
      #spokn-kofi-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 13px;
        font-weight: 700;
        color: #202020;
        text-decoration: none;
        padding: 7px 16px;
        border-radius: 12px;
        background: #72A4F2;
        border: none;
        transition: filter 0.15s, transform 0.1s;
        letter-spacing: 0.01em;
      }
      #spokn-kofi-btn:hover { filter: brightness(1.12); transform: translateY(-1px); }
      #spokn-kofi-btn:active { transform: translateY(0); filter: brightness(0.95); }
      #spokn-kofi-logo { width: 24px; height: 24px; flex-shrink: 0; object-fit: contain; }
      #spokn-version { text-align: center; font-size: 10px; color: #72A4F2; margin-top: 0px; }

      #spokn-reset-btn {
        all: unset;
        display: block;
        width: 100%;
        margin-top: 10px;
        padding: 7px 0;
        text-align: center;
        font-size: 11px;
        font-family: inherit;
        color: #ef4444;
        border: 1px solid rgba(239,68,68,0.3);
        border-radius: 8px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s;
      }
      #spokn-reset-btn:hover {
        background: rgba(239,68,68,0.1);
        border-color: rgba(239,68,68,0.6);
      }
    `;
  }
}
