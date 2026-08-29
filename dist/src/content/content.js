(function() {
  "use strict";
  const DEFAULT_STATE = {
    status: "stopped",
    mode: "page",
    voiceName: "",
    rate: 1,
    pitch: 1,
    volume: 1,
    currentWord: "",
    wordIndex: 0,
    totalWords: 0,
    currentSentence: ""
  };
  const HIGHLIGHT_THEMES = [
    {
      id: "sky",
      label: "Sky",
      swatch: "#0ea5e9",
      wordBg: "#0ea5e9",
      wordColor: "#ffffff",
      sentenceBg: "rgba(14, 165, 233, 0.15)"
    },
    {
      id: "yellow",
      label: "Yellow",
      swatch: "#FFE066",
      wordBg: "#FFE066",
      wordColor: "#0d1117",
      sentenceBg: "rgba(255, 224, 102, 0.2)"
    },
    {
      id: "mint",
      label: "Mint",
      swatch: "#10b981",
      wordBg: "#10b981",
      wordColor: "#ffffff",
      sentenceBg: "rgba(16, 185, 129, 0.15)"
    },
    {
      id: "coral",
      label: "Coral",
      swatch: "#f87171",
      wordBg: "#f87171",
      wordColor: "#ffffff",
      sentenceBg: "rgba(248, 113, 113, 0.15)"
    },
    {
      id: "violet",
      label: "Violet",
      swatch: "#a78bfa",
      wordBg: "#a78bfa",
      wordColor: "#ffffff",
      sentenceBg: "rgba(167, 139, 250, 0.15)"
    },
    {
      id: "warm",
      label: "Warm",
      swatch: "#fb923c",
      wordBg: "#fb923c",
      wordColor: "#ffffff",
      sentenceBg: "rgba(251, 146, 60, 0.15)"
    },
    {
      id: "rose",
      label: "Rose",
      swatch: "#fb7185",
      wordBg: "#fb7185",
      wordColor: "#ffffff",
      sentenceBg: "rgba(251, 113, 133, 0.15)"
    },
    {
      id: "dark",
      label: "Dark",
      swatch: "#1e293b",
      wordBg: "#1e293b",
      wordColor: "#f1f5f9",
      sentenceBg: "rgba(30, 41, 59, 0.25)"
    },
    {
      id: "light",
      label: "Light",
      swatch: "#e2e8f0",
      wordBg: "#e2e8f0",
      wordColor: "#0d1117",
      sentenceBg: "rgba(226, 232, 240, 0.35)"
    },
    {
      id: "none",
      label: "None",
      swatch: "transparent",
      wordBg: "transparent",
      wordColor: "inherit",
      sentenceBg: "transparent"
    }
  ];
  const DEFAULT_THEME_ID = "sky";
  const STYLE_ID = "spokn-highlight-theme";
  function applyTheme(themeId) {
    const theme = HIGHLIGHT_THEMES.find((t) => t.id === themeId) ?? HIGHLIGHT_THEMES[0];
    let el = document.getElementById(STYLE_ID);
    if (!el) {
      el = document.createElement("style");
      el.id = STYLE_ID;
      document.head.appendChild(el);
    }
    el.textContent = `
    :root {
      --spokn-word-bg:     ${theme.wordBg};
      --spokn-word-color:  ${theme.wordColor};
      --spokn-sentence-bg: ${theme.sentenceBg};
    }
  `;
  }
  function removeTheme() {
    document.getElementById(STYLE_ID)?.remove();
  }
  const SVG_ATTRS = `xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const ICONS = {
    play: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="8 4.5 11.75 15" aria-hidden="true" style="transform:translateX(2px)"><path d="M8 5.5v13a1 1 0 0 0 1.53.85l9.75-6.5a1 1 0 0 0 0-1.7l-9.75-6.5A1 1 0 0 0 8 5.5Z"/></svg>`,
    pause: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="4.5 0 27 36" aria-hidden="true"><path d="M9,0A4.50022,4.50022,0,0,0,4.5,4.5v27a4.5,4.5,0,0,0,9,0V4.5A4.50022,4.50022,0,0,0,9,0Z"/><path d="M27,0a4.50022,4.50022,0,0,0-4.5,4.5v27a4.5,4.5,0,0,0,9,0V4.5A4.50022,4.50022,0,0,0,27,0Z"/></svg>`,
    settings: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.92c.04-.34.07-.68.07-1.08s-.03-.73-.07-1.08l2.32-1.81c.21-.16.27-.46.13-.7l-2.2-3.81c-.14-.24-.42-.32-.66-.24l-2.74 1.11c-.57-.44-1.18-.81-1.86-1.08L14.99 2.42C14.96 2.18 14.75 2 14.5 2h-4.4c-.25 0-.46.18-.49.42l-.38 2.47c-.68.27-1.3.64-1.86 1.08L4.63 4.86c-.24-.09-.52 0-.66.24L1.77 8.91c-.14.24-.08.54.13.7L4.22 11.42c-.04.35-.07.69-.07 1.08s.03.73.07 1.08l-2.32 1.81c-.21.16-.27.46-.13.7l2.2 3.81c.14.24.42.32.66.24l2.74-1.11c.57.44 1.18.81 1.86 1.08l.38 2.47c.03.24.24.42.49.42h4.4c.25 0 .46-.18.49-.42l.38-2.47c.68-.27 1.3-.64 1.86-1.08l2.74 1.11c.24.09.52 0 .66-.24l2.2-3.81c.14-.24.08-.54-.13-.7l-2.32-1.81Z"/></svg>`,
    close: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" viewBox="7.67 7.67 16.66 16.66"><path fill="currentColor" d="M23.879 21.22l-5.224-5.221 5.22-5.224c0.602-0.6 0.602-1.565 0.002-2.167l-0.485-0.486c-0.285-0.292-0.675-0.451-1.085-0.451-0.002 0-0.002 0-0.002 0-0.41 0-0.795 0.161-1.083 0.45l-5.222 5.226-5.224-5.22c-0.599-0.6-1.563-0.603-2.165-0.003l-0.486 0.481c-0.293 0.287-0.453 0.677-0.453 1.086 0 0.411 0.161 0.798 0.45 1.086l5.226 5.222-5.221 5.224c-0.602 0.6-0.602 1.565-0.002 2.169l0.485 0.485c0.287 0.292 0.676 0.451 1.086 0.451 0.408 0 0.798-0.163 1.085-0.45l5.221-5.225 5.222 5.219c0.296 0.299 0.69 0.45 1.085 0.45 0.391 0 0.783-0.149 1.082-0.447l0.485-0.484c0.294-0.285 0.453-0.675 0.453-1.085 0.002-0.41-0.159-0.797-0.448-1.086z"/></svg>`,
    grip: `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>`,
    chevron: `<svg  ${SVG_ATTRS} xmlns="http://www.w3.org/2000/svg" width="20" height="20" aria-hidden="true" viewBox="19.65 32.2 60.55 36.15"><path fill="currentColor" d="M21.364,42.218l24.329,24.329c0.026,0.027,0.034,0.065,0.061,0.091c1.146,1.146,2.659,1.715,4.17,1.711c1.511,0.004,3.023-0.564,4.17-1.711c0.027-0.027,0.034-0.064,0.061-0.091l24.329-24.329c2.285-2.285,2.285-6.024,0-8.308s-6.024-2.285-8.308,0L49.923,54.161L29.672,33.91c-2.285-2.285-6.024-2.285-8.308,0S19.079,39.934,21.364,42.218z"/></svg>`,
    highlight: `<svg ${SVG_ATTRS}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    filetext: `<svg ${SVG_ATTRS}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`
  };
  class FloatingToolbar {
    host = null;
    shadow = null;
    cb;
    st;
    settingsOpen = false;
    // Drag
    dragging = false;
    dragDx = 0;
    dragDy = 0;
    posX = null;
    posY = null;
    static POS_KEY = "spokn-toolbar-pos";
    boundMouseMove;
    boundMouseUp;
    constructor(callbacks, initialState) {
      this.cb = callbacks;
      this.st = { ...initialState };
      this.boundMouseMove = this.onMouseMove.bind(this);
      this.boundMouseUp = this.onMouseUp.bind(this);
    }
    // ─── Mount / unmount ────────────────────────────────────────────────────────
    mount() {
      if (this.host) return;
      this.host = document.createElement("div");
      this.host.id = "spokn-host";
      const MARGIN = 8;
      const savedPos = this.loadPosition();
      let defaultStyles;
      if (savedPos) {
        const clampedX = Math.max(0, Math.min(savedPos.x, window.innerWidth - 80));
        const clampedY = Math.max(0, Math.min(savedPos.y, window.innerHeight - 80));
        this.posX = clampedX;
        this.posY = clampedY;
        defaultStyles = { left: `${this.posX}px`, top: `${this.posY}px`, right: "auto", transform: "none" };
      } else {
        defaultStyles = { right: `${MARGIN}px`, top: "50%", transform: "translateY(-50%)" };
      }
      Object.assign(this.host.style, {
        all: "initial",
        position: "fixed",
        zIndex: "2147483647",
        pointerEvents: "none",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        ...defaultStyles
      });
      this.shadow = this.host.attachShadow({ mode: "open" });
      this.render();
      document.body.appendChild(this.host);
      requestAnimationFrame(() => {
        const panel = this.shadow?.getElementById("spokn-panel");
        if (panel) {
          panel.style.opacity = "1";
          panel.style.transform = "translateX(0)";
        }
      });
      document.addEventListener("mousemove", this.boundMouseMove, { passive: true });
      document.addEventListener("mouseup", this.boundMouseUp);
    }
    unmount() {
      document.removeEventListener("mousemove", this.boundMouseMove);
      document.removeEventListener("mouseup", this.boundMouseUp);
      this.host?.remove();
      this.host = null;
      this.shadow = null;
      this.settingsOpen = false;
      this.posX = null;
      this.posY = null;
    }
    isVisible() {
      return this.host !== null;
    }
    // ─── State updates ──────────────────────────────────────────────────────────
    updateState(partial) {
      this.st = { ...this.st, ...partial };
      if (!this.shadow) return;
      const playBtn = this.shadow.getElementById("spokn-playpause");
      if (playBtn) {
        const isPlaying = this.st.status === "playing";
        playBtn.innerHTML = isPlaying ? ICONS.pause : ICONS.play;
        playBtn.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
        playBtn.setAttribute("title", isPlaying ? "Pause" : "Play");
      }
      this.syncInput("spokn-speed-slider", this.st.rate);
      this.syncInput("spokn-pitch-slider", this.st.pitch);
      this.syncInput("spokn-vol-slider", this.st.volume);
      this.syncSliderFill("spokn-speed-slider", this.st.rate, 0.5, 3);
      this.syncSliderFill("spokn-pitch-slider", this.st.pitch, 0.5, 2);
      this.syncSliderFill("spokn-vol-slider", this.st.volume, 0, 1);
    }
    // ─── Full render ─────────────────────────────────────────────────────────────
    render() {
      if (!this.shadow) return;
      this.shadow.innerHTML = "";
      const style = document.createElement("style");
      style.textContent = this.css();
      this.shadow.appendChild(style);
      const panel = document.createElement("div");
      panel.id = "spokn-panel";
      panel.innerHTML = this.html();
      this.shadow.appendChild(panel);
      this.attachListeners();
      this.populateVoices();
      this.setVoiceHelpLink();
      this.syncAllSliders();
    }
    // ─── HTML ────────────────────────────────────────────────────────────────────
    html() {
      const { rate, pitch, volume, mode, status } = this.st;
      const isPlaying = status === "playing";
      const speedPct = (rate - 0.5) / 2.5 * 100;
      const pitchPct = (pitch - 0.5) / 1.5 * 100;
      const volPct = volume * 100;
      const modeIcon = (m) => m === "selection" ? ICONS.highlight : ICONS.filetext;
      const modeLabel = (m) => m === "selection" ? "Selection" : "Full Page";
      return `
      <div id="spokn-settings" class="${this.settingsOpen ? "open" : ""}">

        <div class="settings-section">
          <div class="settings-section-title">Playback</div>

          <div class="settings-row">
            <span class="settings-label">Mode</span>
            <div class="mode-group" role="group" aria-label="Reading mode">
              ${["selection", "page"].map((m) => `
                <button class="mode-btn${mode === m ? " mode-btn-active" : ""}"
                  data-mode="${m}" aria-pressed="${mode === m}" title="${modeLabel(m)}">
                  <span class="mode-icon">${modeIcon(m)}</span>
                  <span class="mode-label">${modeLabel(m)}</span>
                </button>
              `).join("")}
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
              ${HIGHLIGHT_THEMES.map((t) => `
                <button
                  class="theme-swatch${this.st.highlightTheme === t.id ? " theme-swatch-active" : ""}"
                  data-theme="${t.id}"
                  title="${t.label}"
                  aria-label="${t.label} highlight"
                  aria-pressed="${this.st.highlightTheme === t.id}"
                  style="--swatch:${t.swatch}">
                </button>
              `).join("")}
            </div>
          </div>

          <div class="settings-row">
            <span class="settings-label">Border</span>
            <label class="toggle-wrap" title="Show hover border around paragraphs">
              <input type="checkbox" id="spokn-hover-border-toggle"
                ${this.st.hoverBorderEnabled ? "checked" : ""}
                aria-label="Show hover border">
              <span class="toggle-track"><span class="toggle-thumb"></span></span>
              <span class="toggle-label">Paragraph hover border</span>
            </label>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Shortcuts</div>
          <div id="spokn-shortcuts">
            ${navigator.userAgent.toLowerCase().includes("mac") ? `
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
            <a href="${"https://ko-fi.com/adham_dev"}" target="_blank" rel="noopener noreferrer" id="spokn-kofi-btn">
              <img src="${chrome.runtime.getURL("kofi.png")}" alt="Ko-fi" id="spokn-kofi-logo"/>
              Support me on Ko-fi
            </a>
          </div>
          <div id="spokn-version">${"Spokn"} v${"1.0.1"}</div>
          <button id="spokn-reset-btn" title="Reset all settings to defaults">Reset to defaults</button>
        </div>

      </div>

      <div id="spokn-pill-wrap">
        <button id="spokn-close" aria-label="Close" title="Close">
          ${ICONS.close}
        </button>

        <div id="spokn-pill" class="${this.settingsOpen ? "settings-open" : ""}">
          <div id="spokn-toolbar">
            <div id="spokn-drag" title="Drag to move" aria-hidden="true">${ICONS.grip}</div>

            <button id="spokn-playpause" class="btn btn-play"
              aria-label="${isPlaying ? "Pause" : "Play"}"
              title="${isPlaying ? "Pause" : "Play"}">
              ${isPlaying ? ICONS.pause : ICONS.play}
            </button>

            <div id="spokn-settings-divider"></div>

            <button id="spokn-settings-toggle"
              class="btn${this.settingsOpen ? " btn-active" : ""}"
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
    attachListeners() {
      const s = this.shadow;
      s.getElementById("spokn-playpause")?.addEventListener("click", () => {
        if (this.st.status === "playing") this.cb.onPause();
        else if (this.st.status === "paused") this.cb.onResume();
        else this.cb.onPlay(this.st.mode);
      });
      s.getElementById("spokn-settings-toggle")?.addEventListener("click", () => {
        this.settingsOpen = !this.settingsOpen;
        const panel = s.getElementById("spokn-settings");
        const pill = s.getElementById("spokn-pill");
        const btn = s.getElementById("spokn-settings-toggle");
        if (panel) panel.classList.toggle("open", this.settingsOpen);
        if (pill) pill.classList.toggle("settings-open", this.settingsOpen);
        if (btn) {
          btn.setAttribute("aria-expanded", String(this.settingsOpen));
          btn.classList.toggle("btn-active", this.settingsOpen);
        }
        if (this.settingsOpen && panel && this.host) {
          panel.style.top = "";
          panel.style.bottom = "";
          panel.style.transform = "";
          requestAnimationFrame(() => {
            const hostRect = this.host.getBoundingClientRect();
            const panelH = panel.offsetHeight;
            const vh = window.innerHeight;
            const PADDING = 8;
            let top = hostRect.top + hostRect.height / 2 - panelH / 2;
            top = Math.max(PADDING, Math.min(top, vh - panelH - PADDING));
            const relativeTop = top - hostRect.top;
            panel.style.top = `${relativeTop}px`;
            panel.style.transform = "none";
          });
        }
      });
      s.getElementById("spokn-close")?.addEventListener("click", () => {
        this.cb.onClose();
      });
      s.querySelectorAll(".mode-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const m = e.currentTarget.dataset.mode;
          this.st.mode = m;
          s.querySelectorAll(".mode-btn").forEach((b) => {
            const active = b.dataset.mode === m;
            b.classList.toggle("mode-btn-active", active);
            b.setAttribute("aria-pressed", String(active));
          });
          this.cb.onModeChange(m);
        });
      });
      s.getElementById("spokn-voice-select")?.addEventListener("change", (e) => {
        const val = e.target.value;
        this.st.voiceName = val;
        this.cb.onVoiceChange(val);
      });
      s.querySelectorAll(".theme-swatch").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          const themeId = e.currentTarget.dataset.theme;
          this.st.highlightTheme = themeId;
          s.querySelectorAll(".theme-swatch").forEach((b) => {
            const active = b.dataset.theme === themeId;
            b.classList.toggle("theme-swatch-active", active);
            b.setAttribute("aria-pressed", String(active));
          });
          this.cb.onThemeChange(themeId);
        });
      });
      s.getElementById("spokn-hover-border-toggle")?.addEventListener("change", (e) => {
        const enabled = e.target.checked;
        this.st.hoverBorderEnabled = enabled;
        this.cb.onHoverBorderToggle(enabled);
      });
      s.getElementById("spokn-reset-btn")?.addEventListener("click", () => {
        if (confirm("Reset all Spokn settings to defaults?")) {
          this.cb.onReset();
        }
      });
      this.attachSlider("spokn-speed-slider", 0.5, 3, (v) => {
        const r = Math.round(v * 10) / 10;
        this.st.rate = r;
        const val = s.querySelector("#spokn-speed-slider + .slider-val");
        if (val) val.textContent = `${r.toFixed(1)}x`;
        this.cb.onSpeedChange(r);
      });
      this.attachSlider("spokn-pitch-slider", 0.5, 2, (v) => {
        const p = Math.round(v * 10) / 10;
        this.st.pitch = p;
        const val = s.querySelector("#spokn-pitch-slider + .slider-val");
        if (val) val.textContent = p.toFixed(1);
        this.cb.onPitchChange(p);
      });
      this.attachSlider("spokn-vol-slider", 0, 1, (v) => {
        const vol = Math.round(v * 100) / 100;
        this.st.volume = vol;
        const val = s.querySelector("#spokn-vol-slider + .slider-val");
        if (val) val.textContent = `${Math.round(vol * 100)}%`;
        this.cb.onVolumeChange(vol);
      });
      s.getElementById("spokn-drag")?.addEventListener("mousedown", (e) => {
        const me = e;
        me.preventDefault();
        this.dragging = true;
        const rect = this.host.getBoundingClientRect();
        if (this.posX === null) {
          this.posX = rect.left;
          this.posY = rect.top;
          Object.assign(this.host.style, {
            left: `${this.posX}px`,
            top: `${this.posY}px`,
            right: "auto",
            transform: "none"
          });
        }
        this.dragDx = me.clientX - rect.left;
        this.dragDy = me.clientY - rect.top;
        this.host.style.cursor = "grabbing";
      });
    }
    attachSlider(id, min, max, onChange) {
      const el = this.shadow?.getElementById(id);
      if (!el) return;
      el.addEventListener("input", () => {
        const v = parseFloat(el.value);
        onChange(v);
        this.syncSliderFill(id, v, min, max);
      });
    }
    // ─── Voices ──────────────────────────────────────────────────────────────────
    populateVoices() {
      const doPopulate = () => {
        const all = speechSynthesis.getVoices();
        if (all.length === 0) return;
        const select = this.shadow?.getElementById("spokn-voice-select");
        if (!select) return;
        const seen = /* @__PURE__ */ new Set();
        const unique = all.filter((v) => {
          if (seen.has(v.name)) return false;
          seen.add(v.name);
          return true;
        });
        const groups = /* @__PURE__ */ new Map();
        for (const v of unique) {
          const lang = v.lang || "Unknown";
          if (!groups.has(lang)) groups.set(lang, []);
          groups.get(lang).push(v);
        }
        select.innerHTML = "";
        Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b)).forEach(([lang, voices]) => {
          const grp = document.createElement("optgroup");
          grp.label = lang;
          for (const v of voices) {
            const opt = document.createElement("option");
            opt.value = v.name;
            opt.textContent = v.name + (v.localService ? "" : " (cloud)");
            if (v.name === this.st.voiceName) opt.selected = true;
            grp.appendChild(opt);
          }
          select.appendChild(grp);
        });
        if (!this.st.voiceName && unique.length > 0) {
          const preferred = unique.find((v) => v.lang.startsWith("en") && v.localService) ?? unique.find((v) => v.lang.startsWith("en")) ?? unique[0];
          if (preferred) {
            select.value = preferred.name;
            this.st.voiceName = preferred.name;
            this.cb.onVoiceChange(preferred.name);
          }
        }
      };
      doPopulate();
      if (speechSynthesis.getVoices().length === 0) {
        speechSynthesis.addEventListener("voiceschanged", doPopulate, { once: true });
      }
    }
    // ─── Voice help link ─────────────────────────────────────────────────────────
    setVoiceHelpLink() {
      const link = this.shadow?.getElementById("spokn-voice-help-link");
      if (!link) return;
      const ua = navigator.userAgent.toLowerCase();
      const os = ua.includes("mac") ? "macOS" : ua.includes("win") ? "Windows" : "my device";
      const prompt = `How do I add more text-to-speech voices on ${os}? I'm using a browser extension that reads web pages aloud and I want more voice options to choose from. Please give me simple step-by-step instructions for a regular user, no code.`;
      link.href = `https://chatgpt.com/?q=${encodeURIComponent(prompt)}`;
    }
    onMouseMove(e) {
      if (!this.dragging || !this.host) return;
      const rawX = e.clientX - this.dragDx;
      const rawY = e.clientY - this.dragDy;
      const panel = this.shadow?.getElementById("spokn-panel");
      const w = panel?.offsetWidth ?? 80;
      const h = panel?.offsetHeight ?? 80;
      const MARGIN = 8;
      this.posX = Math.max(0, Math.min(rawX, window.innerWidth - w - MARGIN));
      this.posY = Math.max(0, Math.min(rawY, window.innerHeight - h - MARGIN));
      this.host.style.left = `${this.posX}px`;
      this.host.style.top = `${this.posY}px`;
    }
    onMouseUp() {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.host) this.host.style.cursor = "";
      if (this.posX !== null && this.posY !== null) {
        this.savePosition(this.posX, this.posY);
      }
    }
    savePosition(x, y) {
      try {
        localStorage.setItem(FloatingToolbar.POS_KEY, JSON.stringify({ x, y }));
      } catch {
      }
    }
    loadPosition() {
      try {
        const raw = localStorage.getItem(FloatingToolbar.POS_KEY);
        if (!raw) return null;
        const { x, y } = JSON.parse(raw);
        if (typeof x === "number" && typeof y === "number") return { x, y };
      } catch {
      }
      return null;
    }
    // ─── Slider helpers ───────────────────────────────────────────────────────────
    syncInput(id, value) {
      const el = this.shadow?.getElementById(id);
      if (el) el.value = String(value);
    }
    syncSliderFill(id, value, min, max) {
      const el = this.shadow?.getElementById(id);
      if (!el) return;
      const pct = (value - min) / (max - min) * 100;
      el.style.setProperty("--fill", `${pct}%`);
    }
    syncAllSliders() {
      this.syncSliderFill("spokn-speed-slider", this.st.rate, 0.5, 3);
      this.syncSliderFill("spokn-pitch-slider", this.st.pitch, 0.5, 2);
      this.syncSliderFill("spokn-vol-slider", this.st.volume, 0, 1);
    }
    // ─── CSS ──────────────────────────────────────────────────────────────────────
    css() {
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
  const SKIP_TAGS = /* @__PURE__ */ new Set([
    "SCRIPT",
    "STYLE",
    "NOSCRIPT",
    "IFRAME",
    "OBJECT",
    "EMBED",
    "NAV",
    "HEADER",
    "FOOTER",
    "ASIDE",
    "BUTTON",
    "INPUT",
    "SELECT",
    "TEXTAREA",
    "OPTION",
    "CODE",
    "PRE",
    "FIGURE",
    "FIGCAPTION",
    "AUDIO",
    "VIDEO",
    "CANVAS",
    "SVG",
    "MATH"
  ]);
  const WORD_CLASS = "spokn-word";
  const ACTIVE_WORD_CLASS = "spokn-word-active";
  const HOVER_WORD_CLASS = "spokn-word-hover";
  const SENTENCE_CLASS = "spokn-sentence";
  const ACTIVE_SENTENCE_CLASS = "spokn-sentence-active";
  function splitIntoSentences(text) {
    const raw = text.match(/[^.!?]+[.!?]+[\s]*/g) ?? [text];
    return raw.map((s) => s.trim()).filter(Boolean);
  }
  function wrapTextNode(textNode, sentenceOffset) {
    const text = textNode.textContent ?? "";
    if (!text.trim()) return [];
    const parent = textNode.parentNode;
    if (!parent) return [];
    const sentences = splitIntoSentences(text);
    const wordNodes = [];
    const fragment = document.createDocumentFragment();
    sentences.forEach((sentence, sIdx) => {
      const sentenceSpan = document.createElement("span");
      sentenceSpan.className = SENTENCE_CLASS;
      const words = sentence.split(/(\s+)/);
      words.forEach((token) => {
        if (/^\s+$/.test(token)) {
          sentenceSpan.appendChild(document.createTextNode(token));
        } else if (token.length > 0) {
          const wordSpan = document.createElement("span");
          wordSpan.className = WORD_CLASS;
          wordSpan.textContent = token;
          wordSpan.dataset.spoknWord = token;
          sentenceSpan.appendChild(wordSpan);
          wordNodes.push({
            word: token,
            span: wordSpan,
            sentenceIndex: sentenceOffset + sIdx
          });
        }
      });
      fragment.appendChild(sentenceSpan);
    });
    parent.replaceChild(fragment, textNode);
    return wordNodes;
  }
  function shouldSkipElement(el) {
    if (SKIP_TAGS.has(el.tagName)) return true;
    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden") return true;
    if (el.getAttribute("aria-hidden") === "true") return true;
    return false;
  }
  function collectTextNodes(root) {
    const result = [];
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_ALL,
      {
        acceptNode(node) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            if (shouldSkipElement(node)) {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_SKIP;
          }
          if (node.nodeType === Node.TEXT_NODE) {
            const text = node.textContent ?? "";
            if (text.trim().length > 0) return NodeFilter.FILTER_ACCEPT;
            return NodeFilter.FILTER_SKIP;
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );
    let current;
    while (current = walker.nextNode()) {
      result.push(current);
    }
    return result;
  }
  function walkPage() {
    const textNodes = collectTextNodes(document.body);
    return buildResult(textNodes);
  }
  function walkSelection() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return { words: [], fullText: "", charOffsets: [], restore: () => {
      } };
    }
    const range = selection.getRangeAt(0);
    const fragment = range.cloneContents();
    const tempDiv = document.createElement("div");
    tempDiv.appendChild(fragment);
    const textNodes = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
          const text = node.textContent ?? "";
          if (text.trim().length === 0) return NodeFilter.FILTER_SKIP;
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );
    let n;
    while (n = walker.nextNode()) {
      textNodes.push(n);
    }
    return buildResult(textNodes);
  }
  function buildResult(textNodes) {
    const allWords = [];
    let sentenceOffset = 0;
    const originals = [];
    for (const tn of textNodes) {
      const parent = tn.parentNode;
      if (!parent) continue;
      const beforeChildren = Array.from(parent.childNodes);
      const idx = beforeChildren.indexOf(tn);
      const words = wrapTextNode(tn, sentenceOffset);
      if (words.length === 0) continue;
      sentenceOffset = (words[words.length - 1]?.sentenceIndex ?? sentenceOffset) + 1;
      allWords.push(...words);
      const afterChildren = Array.from(parent.childNodes);
      const inserted = afterChildren.slice(idx, idx + (afterChildren.length - beforeChildren.length + 1));
      originals.push({ parent, nodes: inserted, refNode: inserted[inserted.length - 1]?.nextSibling ?? null });
    }
    const parts = [];
    const charOffsets = [];
    let cursor = 0;
    for (const w of allWords) {
      charOffsets.push(cursor);
      parts.push(w.word);
      cursor += w.word.length + 1;
    }
    const fullText = parts.join(" ");
    function restore() {
      for (const { parent, nodes, refNode } of originals) {
        let text = "";
        for (const node of nodes) {
          text += node.textContent ?? "";
        }
        const textNode = document.createTextNode(text);
        if (refNode && parent.contains(refNode)) {
          parent.insertBefore(textNode, refNode);
        } else {
          parent.appendChild(textNode);
        }
        for (const node of nodes) {
          if (parent.contains(node)) parent.removeChild(node);
        }
      }
    }
    return { words: allWords, fullText, charOffsets, restore };
  }
  class Highlighter {
    words;
    currentWordIdx = -1;
    currentSentenceIdx = -1;
    // Suppress auto-scroll for a few seconds after the user manually scrolls.
    // We use a flag + timestamp to distinguish user-initiated scrolls from the
    // programmatic scrollIntoView calls we make ourselves.
    userScrolledAt = 0;
    USER_SCROLL_SUPPRESS_MS = 3e3;
    // Set to true while we are programmatically scrolling so the scroll listener
    // doesn't mistake our own scroll for a user scroll.
    isProgrammaticScroll = false;
    scrollListener = null;
    constructor(words) {
      this.words = words;
      this.scrollListener = () => {
        if (this.isProgrammaticScroll) return;
        this.userScrolledAt = Date.now();
      };
      window.addEventListener("scroll", this.scrollListener, { passive: true, capture: true });
    }
    /**
     * Scroll to the word at `wordIdx` without changing the highlight state.
     * Used when a new chunk starts speaking so the page scrolls before the
     * first boundary event arrives.
     */
    scrollToWord(wordIdx) {
      if (wordIdx < 0 || wordIdx >= this.words.length) return;
      this.scrollIntoView(this.words[wordIdx].span);
    }
    /**
     * Highlight the word at `wordIdx` and its containing sentence.
     * Safe to call with any index — out-of-bounds is silently ignored.
     */
    highlight(wordIdx) {
      if (wordIdx < 0 || wordIdx >= this.words.length) return;
      if (wordIdx === this.currentWordIdx) return;
      const prev = this.currentWordIdx >= 0 ? this.words[this.currentWordIdx] : null;
      const next = this.words[wordIdx];
      prev?.span.classList.remove(ACTIVE_WORD_CLASS);
      next.span.classList.add(ACTIVE_WORD_CLASS);
      this.currentWordIdx = wordIdx;
      if (next.sentenceIndex !== this.currentSentenceIdx) {
        if (this.currentSentenceIdx >= 0) {
          const oldSentenceSpan = this.findSentenceSpan(prev?.span ?? null);
          oldSentenceSpan?.classList.remove(ACTIVE_SENTENCE_CLASS);
        }
        const newSentenceSpan = this.findSentenceSpan(next.span);
        newSentenceSpan?.classList.add(ACTIVE_SENTENCE_CLASS);
        this.currentSentenceIdx = next.sentenceIndex;
      }
      this.scrollIntoView(next.span);
    }
    /** Remove all highlights and detach scroll listener — called on stop/pause */
    clearAll() {
      if (this.currentWordIdx >= 0 && this.currentWordIdx < this.words.length) {
        this.words[this.currentWordIdx]?.span.classList.remove(ACTIVE_WORD_CLASS);
      }
      document.querySelectorAll(`.${ACTIVE_SENTENCE_CLASS}`).forEach((el) => {
        el.classList.remove(ACTIVE_SENTENCE_CLASS);
      });
      this.currentWordIdx = -1;
      this.currentSentenceIdx = -1;
      this.detachScrollListener();
    }
    /** Reset to beginning without touching DOM */
    reset() {
      this.clearAll();
    }
    detachScrollListener() {
      if (this.scrollListener) {
        window.removeEventListener("scroll", this.scrollListener, { capture: true });
        this.scrollListener = null;
      }
    }
    findSentenceSpan(wordSpan) {
      if (!wordSpan) return null;
      let el = wordSpan;
      while (el) {
        if (el.classList.contains(SENTENCE_CLASS)) return el;
        el = el.parentElement;
      }
      return null;
    }
    scrollIntoView(el) {
      try {
        const timeSinceUserScroll = Date.now() - this.userScrolledAt;
        if (timeSinceUserScroll < this.USER_SCROLL_SUPPRESS_MS) return;
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const inView = rect.top >= 50 && rect.bottom <= vh - 150;
        if (inView) return;
        this.isProgrammaticScroll = true;
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
        setTimeout(() => {
          this.isProgrammaticScroll = false;
        }, 1e3);
      } catch {
        this.isProgrammaticScroll = false;
      }
    }
  }
  const MAX_CHUNK_WORDS = 25;
  function buildChunks(words) {
    const chunks = [];
    let i = 0;
    while (i < words.length) {
      const start = i;
      let end = Math.min(i + MAX_CHUNK_WORDS, words.length);
      if (end < words.length) {
        const targetSentence = words[end - 1].sentenceIndex;
        while (end < words.length && words[end].sentenceIndex === targetSentence) {
          end++;
        }
      }
      chunks.push({ words: words.slice(start, end), globalOffset: start });
      i = end;
    }
    return chunks;
  }
  function getVoices() {
    return new Promise((resolve) => {
      const voices = speechSynthesis.getVoices();
      if (voices.length > 0) {
        resolve(voices);
        return;
      }
      const handler = () => {
        resolve(speechSynthesis.getVoices());
        speechSynthesis.removeEventListener("voiceschanged", handler);
      };
      speechSynthesis.addEventListener("voiceschanged", handler);
      setTimeout(() => {
        speechSynthesis.removeEventListener("voiceschanged", handler);
        resolve(speechSynthesis.getVoices());
      }, 3e3);
    });
  }
  class TTS {
    chunks = [];
    chunkIndex = 0;
    highlighter = null;
    listeners = [];
    options;
    isPaused = false;
    isStopped = true;
    // Watchdog for the tab-switch stall bug
    watchdogTimer = null;
    lastBoundaryTime = 0;
    WATCHDOG_MS = 2e3;
    // macOS can stall quickly — check every 2 s
    // Tracks charIndex offset for the current chunk
    chunkCharOffset = 0;
    constructor(options) {
      this.options = { ...options };
    }
    on(listener) {
      this.listeners.push(listener);
      return () => {
        this.listeners = this.listeners.filter((l) => l !== listener);
      };
    }
    emit(event) {
      this.listeners.forEach((l) => l(event));
    }
    updateOptions(opts) {
      this.options = { ...this.options, ...opts };
    }
    /** Update options and restart the current chunk if playing */
    updateOptionsAndRestart(opts) {
      this.options = { ...this.options, ...opts };
      if (this.isStopped || this.isPaused) return;
      speechSynthesis.cancel();
      setTimeout(() => {
        if (!this.isStopped && !this.isPaused) {
          this.speakChunk(this.chunkIndex);
        }
      }, 80);
    }
    async play(words, startWordIndex = 0) {
      this.stop();
      if (words.length === 0) return;
      speechSynthesis.cancel();
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
      const clampedStart = Math.max(0, Math.min(startWordIndex, words.length - 1));
      this.chunks = buildChunks(words);
      const startChunkIndex = this.chunks.findIndex(
        (c) => c.globalOffset + c.words.length > clampedStart
      );
      this.chunkIndex = startChunkIndex >= 0 ? startChunkIndex : 0;
      const startChunk = this.chunks[this.chunkIndex];
      if (startChunk && clampedStart > startChunk.globalOffset) {
        const localOffset = clampedStart - startChunk.globalOffset;
        this.chunks[this.chunkIndex] = {
          words: startChunk.words.slice(localOffset),
          globalOffset: clampedStart
        };
      }
      this.highlighter = new Highlighter(words);
      this.isPaused = false;
      this.isStopped = false;
      this.emit({ type: "start" });
      await this.playChunk(this.chunkIndex);
    }
    pause() {
      if (this.isStopped || this.isPaused) return;
      this.isPaused = true;
      speechSynthesis.pause();
      this.clearWatchdog();
      this.highlighter?.clearAll();
      this.emit({ type: "pause" });
    }
    resume() {
      if (this.isStopped || !this.isPaused) return;
      this.isPaused = false;
      const chunk = this.chunks[this.chunkIndex];
      if (!chunk) return;
      speechSynthesis.cancel();
      setTimeout(() => {
        this.speakChunk(this.chunkIndex);
        this.emit({ type: "resume" });
      }, 100);
    }
    stop() {
      if (this.isStopped) return;
      this.isStopped = true;
      this.isPaused = false;
      this.clearWatchdog();
      speechSynthesis.cancel();
      setTimeout(() => speechSynthesis.cancel(), 150);
      this.highlighter?.clearAll();
      this.highlighter = null;
      this.emit({ type: "stop" });
    }
    get status() {
      if (this.isStopped) return "stopped";
      if (this.isPaused) return "paused";
      return "playing";
    }
    // ─── Internal ────────────────────────────────────────────────────────────
    async playChunk(index) {
      if (this.isStopped || index >= this.chunks.length) {
        if (!this.isStopped) {
          this.isStopped = true;
          this.highlighter?.clearAll();
          this.emit({ type: "end" });
        }
        return;
      }
      this.chunkIndex = index;
      this.speakChunk(index);
    }
    speakChunk(index) {
      if (this.isStopped) return;
      const chunk = this.chunks[index];
      if (!chunk) return;
      const text = chunk.words.map((w) => w.word).join(" ");
      const utter = new SpeechSynthesisUtterance(text);
      utter.rate = this.options.rate;
      utter.pitch = this.options.pitch;
      utter.volume = this.options.volume;
      const voices = speechSynthesis.getVoices();
      const voice = voices.find((v) => v.name === this.options.voiceName);
      if (voice) utter.voice = voice;
      let charCursor = 0;
      const localOffsets = [];
      for (const w of chunk.words) {
        localOffsets.push(charCursor);
        charCursor += w.word.length + 1;
      }
      utter.onboundary = (event) => {
        if (event.name !== "word") return;
        this.lastBoundaryTime = Date.now();
        const charIdx = event.charIndex;
        let lo = 0;
        let hi = localOffsets.length - 1;
        while (lo < hi) {
          const mid = lo + hi + 1 >> 1;
          if (localOffsets[mid] <= charIdx) lo = mid;
          else hi = mid - 1;
        }
        const localWordIdx = lo;
        const globalWordIdx = chunk.globalOffset + localWordIdx;
        const word = chunk.words[localWordIdx]?.word ?? "";
        this.highlighter?.highlight(globalWordIdx);
        this.emit({ type: "word", wordIndex: globalWordIdx, word });
      };
      utter.onstart = () => {
        this.lastBoundaryTime = Date.now();
        this.startWatchdog(index, text);
        if (index > 0) {
          this.highlighter?.scrollToWord(chunk.globalOffset);
        }
        this.emit({
          type: "start",
          chunkIndex: index,
          totalChunks: this.chunks.length
        });
      };
      utter.onend = () => {
        this.clearWatchdog();
        if (!this.isStopped && !this.isPaused) {
          this.playChunk(index + 1);
        }
      };
      utter.onerror = (e) => {
        if (e.error === "interrupted" || e.error === "canceled") return;
        console.error("[Spokn TTS] SpeechSynthesisUtterance error:", e.error, "— chunk:", index);
        this.clearWatchdog();
        if (!this.isStopped && !this.isPaused) {
          this.playChunk(index + 1);
        }
      };
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
        setTimeout(() => speechSynthesis.speak(utter), 200);
      } else {
        speechSynthesis.speak(utter);
      }
    }
    // ─── Watchdog (tab-switch stall fix) ────────────────────────────────────
    startWatchdog(chunkIndex, chunkText) {
      this.clearWatchdog();
      this.watchdogTimer = setInterval(() => {
        if (this.isStopped || this.isPaused) {
          this.clearWatchdog();
          return;
        }
        const elapsed = Date.now() - this.lastBoundaryTime;
        if (elapsed > this.WATCHDOG_MS && speechSynthesis.speaking) {
          this.clearWatchdog();
          speechSynthesis.cancel();
          setTimeout(() => {
            if (!this.isStopped && !this.isPaused) {
              this.lastBoundaryTime = Date.now();
              this.speakChunk(chunkIndex);
            }
          }, 300);
        }
      }, this.WATCHDOG_MS);
    }
    clearWatchdog() {
      if (this.watchdogTimer !== null) {
        clearInterval(this.watchdogTimer);
        this.watchdogTimer = null;
      }
    }
  }
  const LOG = () => {
  };
  const ERR = (...args) => console.error("[Spokn]", ...args);
  let tts = null;
  let walkResult = null;
  let toolbar = null;
  let clickToReadEnabled = false;
  let state = { ...DEFAULT_STATE };
  let toolbarMounting = false;
  let currentTheme = DEFAULT_THEME_ID;
  let hoverBorderEnabled = true;
  function buildToolbarState() {
    return {
      status: state.status,
      rate: state.rate,
      pitch: state.pitch,
      volume: state.volume,
      voiceName: state.voiceName,
      mode: state.mode,
      currentSentence: state.currentSentence,
      currentWord: state.currentWord,
      wordIndex: state.wordIndex,
      totalWords: state.totalWords,
      highlightTheme: currentTheme,
      hoverBorderEnabled
    };
  }
  function createToolbar() {
    LOG("createToolbar() — mode:", state.mode);
    return new FloatingToolbar(
      {
        onPlay: (mode) => {
          if (mode === "selection") {
            startReading("selection").catch((e) => ERR("startReading threw:", e));
          } else {
            startReading("page").catch((e) => ERR("startReading threw:", e));
          }
        },
        onPause: () => {
          tts?.pause();
        },
        onResume: () => {
          tts?.resume();
        },
        onStop: () => {
          stopReading();
        },
        onClose: () => {
          teardown();
        },
        onVoiceChange: async (voiceName) => {
          state.voiceName = voiceName;
          tts?.updateOptions({ voiceName });
          await chrome.storage.sync.set({ voiceName });
        },
        onSpeedChange: async (rate) => {
          state.rate = rate;
          tts?.updateOptionsAndRestart({ rate });
          await chrome.storage.sync.set({ rate });
        },
        onPitchChange: async (pitch) => {
          state.pitch = pitch;
          tts?.updateOptionsAndRestart({ pitch });
          await chrome.storage.sync.set({ pitch });
        },
        onVolumeChange: async (volume) => {
          state.volume = volume;
          tts?.updateOptionsAndRestart({ volume });
          await chrome.storage.sync.set({ volume });
        },
        onModeChange: async (mode) => {
          state.mode = mode;
          if (mode !== "selection") {
            await chrome.storage.sync.set({ mode });
          }
        },
        onThemeChange: async (themeId) => {
          currentTheme = themeId;
          applyTheme(themeId);
          await chrome.storage.sync.set({ highlightTheme: themeId });
        },
        onHoverBorderToggle: async (enabled) => {
          hoverBorderEnabled = enabled;
          if (!enabled) {
            document.querySelectorAll(".spokn-clickable-hover").forEach((el) => el.classList.remove("spokn-clickable-hover"));
          }
          await chrome.storage.sync.set({ hoverBorderEnabled: enabled });
        },
        onReset: async () => {
          await chrome.storage.sync.clear();
          try {
            localStorage.removeItem("spokn-toolbar-pos");
          } catch {
          }
          state.voiceName = "";
          state.rate = 1;
          state.pitch = 1;
          state.volume = 1;
          state.mode = "page";
          hoverBorderEnabled = true;
          currentTheme = DEFAULT_THEME_ID;
          applyTheme(DEFAULT_THEME_ID);
          teardown();
          toolbar = createToolbar();
          toolbar.mount();
          enableClickToRead();
        }
      },
      buildToolbarState()
    );
  }
  function broadcastState() {
    chrome.runtime.sendMessage({ type: "STATE_UPDATE", state }).catch(() => {
    });
  }
  function setState(partial) {
    state = { ...state, ...partial };
    broadcastState();
    toolbar?.updateState(buildToolbarState());
  }
  async function startReading(mode, fromElement) {
    if (tts) {
      tts.stop();
      tts = null;
    }
    let startWordIndex = 0;
    try {
      if (mode === "selection") {
        walkResult?.restore();
        walkResult = null;
        const sel = window.getSelection();
        LOG("selection:", sel?.toString().slice(0, 60));
        walkResult = walkSelection();
      } else if (!walkResult) {
        walkResult = walkPage();
        LOG("walkPage words:", walkResult.words.length);
      }
      if (fromElement && walkResult) {
        const idx = walkResult.words.findIndex(
          (w) => w.span.isSameNode(fromElement) || fromElement.contains(w.span)
        );
        if (idx > 0) startWordIndex = idx;
      }
    } catch (e) {
      ERR("DOM walk failed:", e);
      showToolbarError("Could not read page content. Try a different page.");
      return;
    }
    if (walkResult.words.length === 0) {
      ERR("No readable words found for mode:", mode);
      if (mode === "selection") {
        try {
          walkResult = walkPage();
          LOG("walkPage fallback words:", walkResult.words.length);
        } catch (e) {
          ERR("DOM walk fallback failed:", e);
          showToolbarError("Could not read page content. Try a different page.");
          return;
        }
        if (walkResult.words.length === 0) {
          showToolbarError("No readable text found on this page.");
          return;
        }
        mode = "page";
      } else {
        showToolbarError("No readable text found on this page.");
        return;
      }
    }
    LOG("words to speak:", walkResult.words.length, "— first:", walkResult.words[0]?.word);
    enableWordHover();
    if (typeof speechSynthesis === "undefined") {
      ERR("speechSynthesis not available on this page");
      showToolbarError("Speech not available on this page.");
      return;
    }
    const stored = await chrome.storage.sync.get(["voiceName", "rate", "pitch", "volume"]);
    const voiceName = stored.voiceName || state.voiceName || "";
    const rate = stored.rate ?? state.rate ?? 1;
    const pitch = stored.pitch ?? state.pitch ?? 1;
    const volume = stored.volume ?? state.volume ?? 1;
    tts = new TTS({ voiceName, rate, pitch, volume });
    tts.on((event) => {
      switch (event.type) {
        case "start":
          setState({
            status: "playing",
            mode,
            voiceName,
            rate,
            pitch,
            volume,
            totalWords: walkResult?.words.length ?? 0,
            wordIndex: startWordIndex
          });
          break;
        case "word": {
          const idx = event.wordIndex ?? 0;
          const word = event.word ?? "";
          const sentIdx = walkResult?.words[idx]?.sentenceIndex ?? 0;
          const sentence = walkResult?.words.filter((w) => w.sentenceIndex === sentIdx).map((w) => w.word).join(" ") ?? "";
          setState({ currentWord: word, wordIndex: idx, currentSentence: sentence });
          chrome.runtime.sendMessage({
            type: "WORD_BOUNDARY",
            wordIndex: idx,
            word
          }).catch(() => {
          });
          break;
        }
        case "pause":
          setState({ status: "paused" });
          break;
        case "resume":
          setState({ status: "playing" });
          break;
        case "stop":
        case "end":
          LOG("TTS", event.type);
          setState({ status: "stopped", currentWord: "", wordIndex: 0, currentSentence: "" });
          tts = null;
          break;
      }
    });
    try {
      await tts.play(walkResult.words, startWordIndex);
    } catch (e) {
      ERR("tts.play() threw:", e);
      showToolbarError("Playback failed. Check console for details.");
    }
  }
  function stopReading() {
    tts?.stop();
    tts = null;
    state = {
      ...DEFAULT_STATE,
      voiceName: state.voiceName,
      rate: state.rate,
      pitch: state.pitch,
      volume: state.volume,
      mode: state.mode
    };
    broadcastState();
    toolbar?.updateState(buildToolbarState());
  }
  function showToolbarError(msg) {
    ERR("UI error:", msg);
    if (!toolbar?.isVisible()) return;
    const preview = toolbar["shadow"]?.getElementById("spokn-preview");
    if (preview) {
      preview.textContent = "⚠ " + msg;
      preview.style.color = "#f87171";
      setTimeout(() => {
        if (preview) {
          preview.textContent = "Ready";
          preview.style.color = "";
        }
      }, 4e3);
    }
  }
  let wordHoverEnabled = false;
  function onWordMouseOver(e) {
    const target = e.target;
    if (target.classList.contains(WORD_CLASS)) {
      target.classList.add(HOVER_WORD_CLASS);
    }
  }
  function onWordMouseOut(e) {
    const target = e.target;
    if (target.classList.contains(WORD_CLASS)) {
      target.classList.remove(HOVER_WORD_CLASS);
    }
  }
  function enableWordHover() {
    if (wordHoverEnabled) return;
    wordHoverEnabled = true;
    document.addEventListener("mouseover", onWordMouseOver);
    document.addEventListener("mouseout", onWordMouseOut);
  }
  function disableWordHover() {
    if (!wordHoverEnabled) return;
    wordHoverEnabled = false;
    document.removeEventListener("mouseover", onWordMouseOver);
    document.removeEventListener("mouseout", onWordMouseOut);
    document.querySelectorAll(`.${HOVER_WORD_CLASS}`).forEach((el) => el.classList.remove(HOVER_WORD_CLASS));
  }
  const CLICKABLE = "p,h1,h2,h3,h4,h5,h6,li,blockquote,td,th,article,section,main";
  function enableClickToRead() {
    if (clickToReadEnabled) return;
    clickToReadEnabled = true;
    document.addEventListener("mouseover", onHover);
    document.addEventListener("mouseout", onHoverOut);
    document.addEventListener("click", onClickRead, true);
  }
  function disableClickToRead() {
    if (!clickToReadEnabled) return;
    clickToReadEnabled = false;
    document.removeEventListener("mouseover", onHover);
    document.removeEventListener("mouseout", onHoverOut);
    document.removeEventListener("click", onClickRead, true);
    document.querySelectorAll(".spokn-clickable-hover").forEach((el) => el.classList.remove("spokn-clickable-hover"));
  }
  function onHover(e) {
    if (!hoverBorderEnabled) return;
    const next = e.target.closest(CLICKABLE);
    document.querySelectorAll(".spokn-clickable-hover").forEach((el) => {
      if (el !== next) el.classList.remove("spokn-clickable-hover");
    });
    next?.classList.add("spokn-clickable-hover");
  }
  function onHoverOut(e) {
    const related = e.relatedTarget;
    const highlighted = e.target.closest(CLICKABLE);
    if (highlighted && (!related || !highlighted.contains(related))) {
      highlighted.classList.remove("spokn-clickable-hover");
    }
  }
  function onClickRead(e) {
    if (e.target.closest("#spokn-host")) return;
    const el = e.target.closest(CLICKABLE);
    if (!el) return;
    if (!toolbar?.isVisible() || state.mode === "selection") return;
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove("spokn-clickable-hover");
    const target = e.target;
    const clickedSpan = target.classList.contains(WORD_CLASS) ? target : target.closest(`.${WORD_CLASS}`);
    if (!clickedSpan) return;
    startReading("page", clickedSpan).catch((ex) => ERR("click-to-read threw:", ex));
  }
  function teardown() {
    const t = toolbar;
    toolbar = null;
    try {
      tts?.stop();
    } catch {
    }
    tts = null;
    disableClickToRead();
    disableWordHover();
    try {
      if (walkResult) {
        walkResult.restore();
      } else {
        document.querySelectorAll(".spokn-sentence").forEach((el) => {
          const parent = el.parentNode;
          if (!parent) return;
          parent.replaceChild(document.createTextNode(el.textContent ?? ""), el);
        });
        document.querySelectorAll(".spokn-word").forEach((el) => {
          const parent = el.parentNode;
          if (!parent) return;
          parent.replaceChild(document.createTextNode(el.textContent ?? ""), el);
        });
      }
    } catch (e) {
      ERR("teardown: DOM restore failed:", e);
    }
    walkResult = null;
    document.querySelectorAll(".spokn-clickable-hover, .spokn-word-hover, .spokn-word-active, .spokn-sentence-active").forEach((el) => el.classList.remove("spokn-clickable-hover", "spokn-word-hover", "spokn-word-active", "spokn-sentence-active"));
    removeTheme();
    state = {
      ...DEFAULT_STATE,
      voiceName: state.voiceName,
      rate: state.rate,
      pitch: state.pitch,
      volume: state.volume,
      mode: state.mode
    };
    t?.unmount();
  }
  function toggleToolbar() {
    LOG("toggleToolbar() — visible:", toolbar?.isVisible());
    if (toolbarMounting) return;
    if (toolbar?.isVisible()) {
      teardown();
      return;
    }
    toolbarMounting = true;
    try {
      toolbar = createToolbar();
      toolbar.mount();
      enableClickToRead();
      if (!walkResult && state.mode !== "selection") {
        try {
          walkResult = walkPage();
          enableWordHover();
        } catch (e) {
          ERR("initial walkPage failed:", e);
        }
      }
      applyTheme(currentTheme);
      LOG("toolbar mounted");
    } catch (e) {
      ERR("toolbar mount failed:", e);
    } finally {
      toolbarMounting = false;
    }
  }
  chrome.runtime.onMessage.addListener(
    (rawMsg, _sender, sendResponse) => {
      const msg = rawMsg;
      LOG("message received:", msg.type);
      (async () => {
        try {
          switch (msg.type) {
            case "TOGGLE_TOOLBAR":
              if (window.self === window.top) {
                toggleToolbar();
              }
              sendResponse({ success: true });
              break;
            case "READ_SELECTION": {
              const sel = window.getSelection();
              const hasSelection = sel && !sel.isCollapsed && sel.toString().trim().length > 0;
              if (window.self !== window.top && !hasSelection) {
                sendResponse({ success: true });
                break;
              }
              if (!toolbar?.isVisible() && window.self === window.top) {
                toolbar = createToolbar();
                toolbar.mount();
              }
              state.mode = "selection";
              toolbar?.updateState(buildToolbarState());
              await startReading("selection");
              sendResponse({ success: true });
              break;
            }
            case "PLAY": {
              if (window.self === window.top) {
                if (!toolbar?.isVisible()) {
                  toolbar = createToolbar();
                  toolbar.mount();
                  enableClickToRead();
                }
                await startReading(msg.mode === "click" ? "page" : msg.mode);
              }
              sendResponse({ success: true });
              break;
            }
            case "PAUSE":
              if (tts && state.status === "playing") tts.pause();
              sendResponse({ success: true });
              break;
            case "RESUME":
              if (tts && state.status === "paused") tts.resume();
              sendResponse({ success: true });
              break;
            case "STOP":
              stopReading();
              disableClickToRead();
              disableWordHover();
              sendResponse({ success: true });
              break;
            case "SET_VOICE":
              state.voiceName = msg.voiceName;
              tts?.updateOptions({ voiceName: msg.voiceName });
              await chrome.storage.sync.set({ voiceName: msg.voiceName });
              sendResponse({ success: true });
              break;
            case "SET_SPEED":
              state.rate = msg.rate;
              tts?.updateOptions({ rate: msg.rate });
              toolbar?.updateState(buildToolbarState());
              await chrome.storage.sync.set({ rate: msg.rate });
              sendResponse({ success: true });
              break;
            case "SET_PITCH":
              state.pitch = msg.pitch;
              tts?.updateOptions({ pitch: msg.pitch });
              await chrome.storage.sync.set({ pitch: msg.pitch });
              sendResponse({ success: true });
              break;
            case "SET_VOLUME":
              state.volume = msg.volume;
              tts?.updateOptions({ volume: msg.volume });
              await chrome.storage.sync.set({ volume: msg.volume });
              sendResponse({ success: true });
              break;
            case "GET_STATE":
              sendResponse({ success: true, state });
              break;
            case "IS_TOOLBAR_VISIBLE":
              sendResponse({ success: true, visible: toolbar?.isVisible() ?? false });
              break;
            case "CLICK_TO_READ_TOGGLE":
              msg.enabled ? enableClickToRead() : disableClickToRead();
              sendResponse({ success: true });
              break;
            default:
              sendResponse({ success: false, error: "Unknown message" });
          }
        } catch (err) {
          ERR("message handler threw for", msg.type, ":", err);
          sendResponse({ success: false, error: String(err) });
        }
      })();
      return true;
    }
  );
  (async () => {
    try {
      const stored = await chrome.storage.sync.get(["voiceName", "rate", "pitch", "volume", "mode", "highlightTheme", "hoverBorderEnabled"]);
      if (stored.voiceName) state.voiceName = stored.voiceName;
      if (stored.rate != null) state.rate = stored.rate;
      if (stored.pitch != null) state.pitch = stored.pitch;
      if (stored.volume != null) state.volume = stored.volume;
      if (stored.mode && stored.mode !== "selection") state.mode = stored.mode;
      if (stored.mode === "selection") {
        await chrome.storage.sync.set({ mode: "page" });
      }
      if (stored.hoverBorderEnabled != null) hoverBorderEnabled = stored.hoverBorderEnabled;
      if (stored.highlightTheme) {
        currentTheme = stored.highlightTheme;
        applyTheme(currentTheme);
      } else {
        applyTheme(DEFAULT_THEME_ID);
      }
      const voices = await getVoices();
      LOG("voices loaded:", voices.length);
      if (voices.length > 0 && !state.voiceName) {
        const preferred = voices.find((v) => v.lang.startsWith("en") && v.localService) ?? voices.find((v) => v.lang.startsWith("en")) ?? voices[0];
        if (preferred) {
          state.voiceName = preferred.name;
          LOG("auto-selected voice:", preferred.name);
        }
      }
    } catch (e) {
      ERR("init failed:", e);
    }
  })();
})();
