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
      id: "yellow",
      label: "Yellow",
      swatch: "#FFE066",
      wordBg: "#FFE066",
      wordColor: "#0d1117",
      sentenceBg: "rgba(255, 224, 102, 0.2)"
    },
    {
      id: "sky",
      label: "Sky",
      swatch: "#0ea5e9",
      wordBg: "#0ea5e9",
      wordColor: "#ffffff",
      sentenceBg: "rgba(14, 165, 233, 0.15)"
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
  const DEFAULT_THEME_ID = "yellow";
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
  const SVG_ATTRS = `xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
  const ICONS = {
    play: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true" viewBox="0.89 0.89 14.17 14.23"><path fill="currentColor" d="M 8,0.88671875 C 4.0832548,0.88671875 0.88671875,4.0832548 0.88671875,8 C 0.88671881,11.916745 4.0832548,15.113281 8,15.113281 c 1.9370568,0 3.674673,-0.793691 4.941406,-2.064453 v -0.002 c 0.177377,-0.175751 0.343653,-0.361313 0.501953,-0.554687 c 0.01459,-0.01807 0.02855,-0.03648 0.04297,-0.05469 c 0.16478,-0.205303 0.315402,-0.421643 0.457031,-0.644531 c 0.0067,-0.01075 0.0148,-0.02046 0.02149,-0.03125 v -0.0039 C 14.650217,10.665341 15.054688,9.3797667 15.054688,8 c 0,-1.3797667 -0.404471,-2.6653405 -1.089844,-3.7578125 v -0.00391 c -0.0067,-0.010785 -0.01475,-0.020503 -0.02149,-0.03125 C 13.80173,3.9841434 13.651108,3.7678028 13.486328,3.5625 C 13.471912,3.5442884 13.457947,3.5258787 13.443359,3.5078125 C 13.285059,3.314438 13.118783,3.128876 12.941406,2.953125 C 11.674593,1.6817746 9.9375455,0.88671878 8,0.88671875 Z M 6.9414062,5.4003906 a 1.0001,1.0001 0 0 1 0.00977,0 a 1.0001,1.0001 0 0 1 0.5625,0.1425782 l 2.6679691,1.5996093 a 1.0001,1.0001 0 0 1 0,1.7148438 L 7.5136719,10.457031 A 1.0001,1.0001 0 0 1 6,9.5996094 V 6.4003906 a 1.0001,1.0001 0 0 1 0.9414062,-1 Z"/></svg>`,
    pause: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true" viewBox="1.59 1.07 5.29 6.35"><g transform="translate(-110.41692,-114.44801)"><path fill="currentColor" d="M 115.97265 115.51358 C 115.53748 115.51358 115.17994 115.87165 115.17994 116.30681 L 115.17994 121.07034 C 115.17994 121.5055 115.53748 121.86306 115.97265 121.86306 L 116.50182 121.86306 C 116.93699 121.86306 117.29711 121.5055 117.29712 121.07034 L 117.29712 116.30681 C 117.29712 115.87165 116.93699 115.51358 116.50182 115.51358 L 115.97265 115.51358 Z" stroke="none"/><path fill="currentColor" d="M 112.79869 115.51358 C 112.36353 115.51358 112.0039 115.87165 112.0039 116.30681 L 112.0039 121.07034 C 112.0039 121.5055 112.36353 121.86306 112.79869 121.86306 L 113.32837 121.86306 C 113.76353 121.86306 114.12109 121.5055 114.12109 121.07034 L 114.12109 116.30681 C 114.12109 115.87165 113.76353 115.51358 113.32837 115.51358 L 112.79869 115.51358 Z" stroke="none"/></g></svg>`,
    stop: `<svg ${SVG_ATTRS}><rect x="3" y="3" width="18" height="18" rx="2"/></svg>`,
    settings: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 15.5A3.5 3.5 0 0 1 8.5 12 3.5 3.5 0 0 1 12 8.5a3.5 3.5 0 0 1 3.5 3.5 3.5 3.5 0 0 1-3.5 3.5m7.43-2.92c.04-.34.07-.68.07-1.08s-.03-.73-.07-1.08l2.32-1.81c.21-.16.27-.46.13-.7l-2.2-3.81c-.14-.24-.42-.32-.66-.24l-2.74 1.11c-.57-.44-1.18-.81-1.86-1.08L14.99 2.42C14.96 2.18 14.75 2 14.5 2h-4.4c-.25 0-.46.18-.49.42l-.38 2.47c-.68.27-1.3.64-1.86 1.08L4.63 4.86c-.24-.09-.52 0-.66.24L1.77 8.91c-.14.24-.08.54.13.7L4.22 11.42c-.04.35-.07.69-.07 1.08s.03.73.07 1.08l-2.32 1.81c-.21.16-.27.46-.13.7l2.2 3.81c.14.24.42.32.66.24l2.74-1.11c.57.44 1.18.81 1.86 1.08l.38 2.47c.03.24.24.42.49.42h4.4c.25 0 .46-.18.49-.42l.38-2.47c.68-.27 1.3-.64 1.86-1.08l2.74 1.11c.24.09.52 0 .66-.24l2.2-3.81c.14-.24.08-.54-.13-.7l-2.32-1.81Z"/></svg>`,
    close: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true" viewBox="7.67 7.67 16.66 16.66"><path fill="currentColor" d="M23.879 21.22l-5.224-5.221 5.22-5.224c0.602-0.6 0.602-1.565 0.002-2.167l-0.485-0.486c-0.285-0.292-0.675-0.451-1.085-0.451-0.002 0-0.002 0-0.002 0-0.41 0-0.795 0.161-1.083 0.45l-5.222 5.226-5.224-5.22c-0.599-0.6-1.563-0.603-2.165-0.003l-0.486 0.481c-0.293 0.287-0.453 0.677-0.453 1.086 0 0.411 0.161 0.798 0.45 1.086l5.226 5.222-5.221 5.224c-0.602 0.6-0.602 1.565-0.002 2.169l0.485 0.485c0.287 0.292 0.676 0.451 1.086 0.451 0.408 0 0.798-0.163 1.085-0.45l5.221-5.225 5.222 5.219c0.296 0.299 0.69 0.45 1.085 0.45 0.391 0 0.783-0.149 1.082-0.447l0.485-0.484c0.294-0.285 0.453-0.675 0.453-1.085 0.002-0.41-0.159-0.797-0.448-1.086z"/></svg>`,
    grip: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>`,
    chevron: `<svg  ${SVG_ATTRS} xmlns="http://www.w3.org/2000/svg" width="16" height="16" aria-hidden="true" viewBox="19.65 32.2 60.55 36.15"><path fill="currentColor" d="M21.364,42.218l24.329,24.329c0.026,0.027,0.034,0.065,0.061,0.091c1.146,1.146,2.659,1.715,4.17,1.711c1.511,0.004,3.023-0.564,4.17-1.711c0.027-0.027,0.034-0.064,0.061-0.091l24.329-24.329c2.285-2.285,2.285-6.024,0-8.308s-6.024-2.285-8.308,0L49.923,54.161L29.672,33.91c-2.285-2.285-6.024-2.285-8.308,0S19.079,39.934,21.364,42.218z"/></svg>`,
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
      Object.assign(this.host.style, {
        all: "initial",
        position: "fixed",
        right: "16px",
        top: "50%",
        transform: "translateY(-50%)",
        zIndex: "2147483647",
        pointerEvents: "none",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
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
      const stopBtn = this.shadow.getElementById("spokn-stop");
      if (stopBtn) stopBtn.disabled = this.st.status === "stopped";
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
      <div id="spokn-toolbar">
        <div id="spokn-drag" title="Drag to move" aria-hidden="true">${ICONS.grip}</div>

        <button id="spokn-playpause" class="btn btn-play"
          aria-label="${isPlaying ? "Pause" : "Play"}"
          title="${isPlaying ? "Pause" : "Play"}">
          ${isPlaying ? ICONS.pause : ICONS.play}
        </button>

        <button id="spokn-stop" class="btn"
          aria-label="Stop" title="Stop"
          ${status === "stopped" ? "disabled" : ""}>
          ${ICONS.stop}
        </button>

        <button id="spokn-settings-toggle"
          class="btn${this.settingsOpen ? " btn-active" : ""}"
          aria-label="Settings" title="Settings"
          aria-expanded="${this.settingsOpen}">
          ${ICONS.settings}
        </button>

        <button id="spokn-close" class="btn btn-close" aria-label="Close" title="Close">
          ${ICONS.close}
        </button>
      </div>

      <div id="spokn-settings" style="display:${this.settingsOpen ? "flex" : "none"}">

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
          <label class="toggle-wrap" title="Show hover border around paragraphs when hovering">
            <input type="checkbox" id="spokn-hover-border-toggle"
              ${this.st.hoverBorderEnabled ? "checked" : ""}
              aria-label="Show hover border">
            <span class="toggle-track"><span class="toggle-thumb"></span></span>
            <span class="toggle-label">Paragraph hover border</span>
          </label>
        </div>

        <div id="spokn-shortcuts">
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>Alt</kbd><kbd>Shift</kbd><kbd>P</kbd></span>
            <span class="shortcut-desc">Play / Pause</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>Alt</kbd><kbd>Shift</kbd><kbd>S</kbd></span>
            <span class="shortcut-desc">Stop</span>
          </div>
          <div class="shortcut-row">
            <span class="shortcut-keys"><kbd>Alt</kbd><kbd>Shift</kbd><kbd>R</kbd></span>
            <span class="shortcut-desc">Read selection</span>
          </div>
        </div>

        <div id="spokn-kofi">
          <a href="${"https://ko-fi.com/adham_dev"}" target="_blank" rel="noopener noreferrer" id="spokn-kofi-btn">
            <svg id="spokn-kofi-logo" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" aria-hidden="true">
              <path fill="#fff" d="M23.881 8.948c-.773-4.085-4.859-4.593-4.859-4.593H.723c-.604 0-.679.798-.679.798s-.082 9.298 0 11.906c.198 2.826 2.dive 2.951 2.151 2.954h10.123c2.253-.026 2.886-1.729 2.886-1.729.498.638 1.611 1.729 3.495 1.729 0 0 3.947.005 5.458-3.322.085-.199.173-.419.252-.641.604-1.666.604-3.366-.528-6.102zm-2.652 4.118c-.458 1.095-1.535 1.636-2.66 1.636-1.087 0-1.801-.761-1.801-.761v.654h-1.596V7.509h1.611v3.917c0 0 .747-.802 1.786-.802 1.083 0 2.073.562 2.465 1.563.205.521.303 1.082.197 1.879h-.002zm-12.74-6.223c-.09-.341-.449-.611-.838-.637-.264-.018-.616-.015-1.063-.013L5.747 6.2c-.551.003-.604.601-.604.601v6.702h1.596v-2.514h1.001c.671 0 1.209-.078 1.617-.282.752-.375 1.102-1.046 1.102-1.992 0-.892-.311-1.508-.97-1.872zM7.74 9.499h-.997V7.722l1.027-.002c.678.003.96.316.96.876 0 .592-.367.903-.99.903zm9.26.717c-.413 0-.799.194-.799.194v2.055s.376.216.799.216c.599 0 1.009-.496 1.009-1.23 0-.736-.41-1.235-1.009-1.235z"/>
            </svg>
            Support me on Ko-fi
          </a>
          <span>${"Spokn"} v${"1.0.0"}</span>
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
      s.getElementById("spokn-stop")?.addEventListener("click", () => this.cb.onStop());
      s.getElementById("spokn-settings-toggle")?.addEventListener("click", () => {
        this.settingsOpen = !this.settingsOpen;
        const panel = s.getElementById("spokn-settings");
        const btn = s.getElementById("spokn-settings-toggle");
        if (panel) panel.style.display = this.settingsOpen ? "flex" : "none";
        if (btn) {
          btn.setAttribute("aria-expanded", String(this.settingsOpen));
          btn.classList.toggle("btn-active", this.settingsOpen);
        }
      });
      s.getElementById("spokn-close")?.addEventListener("click", () => {
        this.cb.onStop();
        this.unmount();
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
            left: `${rect.left}px`,
            top: `${rect.top}px`,
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
    // ─── Drag ─────────────────────────────────────────────────────────────────────
    onMouseMove(e) {
      if (!this.dragging || !this.host) return;
      this.posX = e.clientX - this.dragDx;
      this.posY = e.clientY - this.dragDy;
      this.host.style.left = `${this.posX}px`;
      this.host.style.top = `${this.posY}px`;
    }
    onMouseUp() {
      if (!this.dragging) return;
      this.dragging = false;
      if (this.host) this.host.style.cursor = "";
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

      /* SVG icons inherit color from parent */
      svg { display: block; flex-shrink: 0; }

      #spokn-panel {
        pointer-events: auto;
        background: #0a0a0f;
        border-radius: 16px;
        border: 1px solid rgba(39,103,183,0.35);
        box-shadow: 0 12px 40px rgba(0,0,0,0.55), 0 2px 8px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        font-size: 13px;
        color: #f1f5f9;
        overflow: hidden;
        opacity: 0;
        transform: translateX(20px);
        transition: opacity 0.2s ease, transform 0.2s ease;
        user-select: none;
      }

      /* Toolbar column */
      #spokn-toolbar {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 2px;
        padding: 8px 6px;
      }

      #spokn-drag {
        color: #374151;
        cursor: grab;
        padding: 4px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        border-radius: 6px;
        transition: color 0.12s;
        margin-bottom: 2px;
      }
      #spokn-drag:hover  { color: #6b7280; }
      #spokn-drag:active { cursor: grabbing; }

      /* Buttons */
      .btn {
        all: unset;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border-radius: 8px;
        cursor: pointer;
        color: #94a3b8;
        transition: background 0.12s, color 0.12s, transform 0.08s;
        flex-shrink: 0;
      }
      .btn:hover  { background: rgba(255,255,255,0.08); color: #f1f5f9; }
      .btn:active { transform: scale(0.9); }
      .btn[disabled] { opacity: 0.28; cursor: not-allowed; pointer-events: none; }

      .btn-accent {
        background: #2767B7;
        color: #fff;
        width: 32px;
        height: 32px;
        border-radius: 10px;
      }
      .btn-accent:hover { background: #1d52a0; color: #fff; }

      .btn-play {
        color: #2767B7;
        width: 32px;
        height: 32px;
      }
      .btn-play:hover { background: transparent; color: #5b8fd4; }

      .btn-active { background: rgba(39,103,183,0.2); color: #5b8fd4; }
      .btn-active:hover { background: rgba(39,103,183,0.3); color: #a8c4e8; }

      .btn-close:hover { background: rgba(239,68,68,0.15); color: #f87171; }

      /* Settings panel — opens to the left */
      #spokn-settings {
        border-top: 1px solid rgba(255,255,255,0.06);
        padding: 12px 14px 14px;
        flex-direction: column;
        gap: 10px;
        background: rgba(0,0,0,0.15);
        min-width: 260px;
        max-width: 300px;
      }

      .settings-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .settings-label {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: #475569;
        width: 42px;
        flex-shrink: 0;
      }

      /* Mode buttons */
      .mode-group {
        display: flex;
        gap: 4px;
        flex: 1;
      }
      .mode-btn {
        all: unset;
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        padding: 5px 4px;
        border-radius: 7px;
        border: 1px solid rgba(255,255,255,0.08);
        font-size: 10px;
        color: #64748b;
        cursor: pointer;
        transition: all 0.12s;
        font-family: inherit;
        white-space: nowrap;
      }
      .mode-btn:hover { border-color: rgba(39,103,183,0.5); color: #f1f5f9; }
      .mode-btn-active {
        background: #2767B7;
        border-color: #2767B7;
        color: #fff;
        font-weight: 600;
      }
      .mode-icon { display: flex; align-items: center; }
      .mode-icon svg { width: 12px; height: 12px; }

      /* Select */
      .select-wrap {
        position: relative;
        flex: 1;
      }
      select {
        width: 100%;
        padding: 6px 26px 6px 10px;
        background: rgba(0,0,0,0.3);
        color: #f1f5f9;
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 8px;
        font-size: 12px;
        font-family: inherit;
        appearance: none;
        -webkit-appearance: none;
        cursor: pointer;
        outline: none;
        transition: border-color 0.15s;
      }
      select:focus { border-color: #2767B7; }
      .select-arrow {
        position: absolute;
        right: 6px;
        top: 50%;
        transform: translateY(-50%);
        color: #475569;
        pointer-events: none;
        display: flex;
        align-items: center;
      }
      .select-arrow svg { width: 14px; height: 14px; }

      /* Sliders */
      .slider-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
      }
      .slider-val {
        font-size: 10px;
        font-weight: 700;
        color: #2767B7;
        min-width: 32px;
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
          #2767B7 0%,
          #2767B7 var(--fill, 50%),
          rgba(255,255,255,0.1) var(--fill, 50%),
          rgba(255,255,255,0.1) 100%
        );
      }
      input[type=range]::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 13px;
        height: 13px;
        border-radius: 50%;
        background: #2767B7;
        border: 2px solid #a8c4e8;
        box-shadow: 0 1px 4px rgba(0,0,0,0.5);
        transition: transform 0.1s;
      }
      input[type=range]::-webkit-slider-thumb:hover { transform: scale(1.3); }

      /* Theme swatches */
      .theme-swatches {
        display: flex;
        gap: 5px;
        flex-wrap: wrap;
        flex: 1;
      }
      .theme-swatch {
        all: unset;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: var(--swatch);
        cursor: pointer;
        border: 2px solid transparent;
        transition: transform 0.12s, border-color 0.12s;
        flex-shrink: 0;
        box-shadow: 0 1px 3px rgba(0,0,0,0.4);
      }
      .theme-swatch:hover { transform: scale(1.2); }
      .theme-swatch-active {
        border-color: #f1f5f9;
        transform: scale(1.15);
        box-shadow: 0 0 0 2px rgba(255,255,255,0.25);
      }
      /* "None" swatch — show a dash */
      .theme-swatch[data-theme="none"] {
        background: rgba(255,255,255,0.06);
        border: 2px solid rgba(255,255,255,0.15);
        position: relative;
      }
      .theme-swatch[data-theme="none"]::after {
        content: '';
        position: absolute;
        inset: 0;
        margin: auto;
        width: 8px;
        height: 2px;
        background: #64748b;
        border-radius: 2px;
      }

      /* Shortcuts */
      #spokn-shortcuts {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 8px 0 4px;
        border-top: 1px solid rgba(255,255,255,0.05);
      }
      .shortcut-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
      }
      .shortcut-keys {
        display: flex;
        gap: 3px;
        align-items: center;
      }
      kbd {
        display: inline-flex;
        align-items: center;
        padding: 1px 5px;
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(255,255,255,0.12);
        border-radius: 4px;
        font-family: inherit;
        font-size: 9px;
        color: #94a3b8;
        line-height: 1.6;
      }
      .shortcut-desc {
        font-size: 10px;
        color: #475569;
        text-align: right;
      }

      /* Toggle switch */
      .toggle-wrap {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        flex: 1;
      }
      .toggle-wrap input[type=checkbox] {
        position: absolute;
        opacity: 0;
        width: 0;
        height: 0;
      }
      .toggle-track {
        position: relative;
        width: 28px;
        height: 16px;
        background: rgba(255,255,255,0.1);
        border-radius: 99px;
        flex-shrink: 0;
        transition: background 0.15s;
        border: 1px solid rgba(255,255,255,0.08);
      }
      .toggle-wrap input:checked + .toggle-track {
        background: #2767B7;
        border-color: #2767B7;
      }
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
      .toggle-wrap input:checked ~ .toggle-track .toggle-thumb,
      .toggle-wrap input:checked + .toggle-track .toggle-thumb {
        transform: translateX(12px);
      }
      .toggle-label {
        font-size: 11px;
        color: #94a3b8;
      }

      /* Ko-fi */
      #spokn-kofi {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-top: 6px;
        border-top: 1px solid rgba(255,255,255,0.05);
        margin-top: 2px;
      }
      #spokn-kofi-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        font-weight: 600;
        color: #fff;
        text-decoration: none;
        padding: 5px 10px;
        border-radius: 6px;
        background: #FF5E5B;
        border: none;
        transition: background 0.15s, transform 0.1s;
        letter-spacing: 0.01em;
      }
      #spokn-kofi-btn:hover {
        background: #ff4541;
        transform: translateY(-1px);
      }
      #spokn-kofi-btn:active {
        transform: translateY(0);
      }
      #spokn-kofi-logo {
        width: 16px;
        height: 16px;
        flex-shrink: 0;
      }
      #spokn-kofi > span { font-size: 10px; color: #1e293b; }
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
    constructor(words) {
      this.words = words;
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
    /** Remove all highlights — called on stop/pause */
    clearAll() {
      if (this.currentWordIdx >= 0 && this.currentWordIdx < this.words.length) {
        this.words[this.currentWordIdx]?.span.classList.remove(ACTIVE_WORD_CLASS);
      }
      document.querySelectorAll(`.${ACTIVE_SENTENCE_CLASS}`).forEach((el) => {
        el.classList.remove(ACTIVE_SENTENCE_CLASS);
      });
      this.currentWordIdx = -1;
      this.currentSentenceIdx = -1;
    }
    /** Reset to beginning without touching DOM */
    reset() {
      this.clearAll();
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
        el.scrollIntoView({ behavior: "smooth", block: "center", inline: "nearest" });
      } catch {
      }
    }
  }
  const MAX_CHUNK_WORDS = 50;
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
    WATCHDOG_MS = 3e3;
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
    async play(words) {
      this.stop();
      if (words.length === 0) return;
      this.chunks = buildChunks(words);
      this.chunkIndex = 0;
      this.highlighter = new Highlighter(words);
      this.isPaused = false;
      this.isStopped = false;
      this.emit({ type: "start" });
      await this.playChunk(0);
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
      if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
        setTimeout(() => speechSynthesis.speak(utter), 80);
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
          speechSynthesis.cancel();
          setTimeout(() => {
            if (!this.isStopped && !this.isPaused) {
              this.speakChunk(chunkIndex);
            }
          }, 200);
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
        onVoiceChange: async (voiceName) => {
          state.voiceName = voiceName;
          tts?.updateOptions({ voiceName });
          await chrome.storage.sync.set({ voiceName });
        },
        onSpeedChange: async (rate) => {
          state.rate = rate;
          tts?.updateOptions({ rate });
          await chrome.storage.sync.set({ rate });
        },
        onPitchChange: async (pitch) => {
          state.pitch = pitch;
          tts?.updateOptions({ pitch });
          await chrome.storage.sync.set({ pitch });
        },
        onVolumeChange: async (volume) => {
          state.volume = volume;
          tts?.updateOptions({ volume });
          await chrome.storage.sync.set({ volume });
        },
        onModeChange: async (mode) => {
          state.mode = mode;
          await chrome.storage.sync.set({ mode });
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
    try {
      if (mode === "selection") {
        walkResult?.restore();
        walkResult = null;
        const sel = window.getSelection();
        LOG("selection:", sel?.toString().slice(0, 60));
        walkResult = walkSelection();
      } else if (!walkResult) {
        const all = walkPage();
        LOG("walkPage words:", all.words.length);
        walkResult = fromElement ? sliceFrom(all, fromElement) : all;
      } else if (fromElement) {
        walkResult = sliceFrom(walkResult, fromElement);
      }
    } catch (e) {
      ERR("DOM walk failed:", e);
      showToolbarError("Could not read page content. Try a different page.");
      return;
    }
    if (walkResult.words.length === 0) {
      ERR("No readable words found for mode:", mode);
      if (mode === "selection") {
        showToolbarError("No text selected. Highlight some text first.");
      } else {
        showToolbarError("No readable text found on this page.");
      }
      return;
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
            totalWords: walkResult?.words.length ?? 0
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
      await tts.play(walkResult.words);
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
  function sliceFrom(all, from) {
    const idx = all.words.findIndex((w) => from.contains(w.span));
    if (idx <= 0) return all;
    all.words.slice(0, idx).forEach((w) => {
      const parent = w.span.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(w.word), w.span);
    });
    const offsetBase = all.charOffsets[idx] ?? 0;
    return {
      words: all.words.slice(idx),
      fullText: all.words.slice(idx).map((w) => w.word).join(" "),
      charOffsets: all.charOffsets.slice(idx).map((o) => o - offsetBase),
      restore: all.restore
    };
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
    e.target.closest(CLICKABLE)?.classList.add("spokn-clickable-hover");
  }
  function onHoverOut(e) {
    e.target.classList.remove("spokn-clickable-hover");
  }
  function onClickRead(e) {
    if (e.target.closest("#spokn-host")) return;
    const el = e.target.closest(CLICKABLE);
    if (!el) return;
    if (!toolbar?.isVisible() || state.mode === "selection") return;
    e.preventDefault();
    e.stopPropagation();
    el.classList.remove("spokn-clickable-hover");
    startReading("page", el).catch((ex) => ERR("click-to-read threw:", ex));
  }
  function toggleToolbar() {
    LOG("toggleToolbar() — visible:", toolbar?.isVisible());
    if (toolbarMounting) return;
    if (toolbar?.isVisible()) {
      stopReading();
      disableClickToRead();
      disableWordHover();
      walkResult?.restore();
      walkResult = null;
      toolbar.unmount();
      toolbar = null;
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
      if (stored.mode) state.mode = stored.mode;
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
