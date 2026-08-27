(function() {
  "use strict";
  const DEFAULT_STATE = {
    status: "stopped",
    mode: "selection",
    voiceName: "",
    rate: 1,
    pitch: 1,
    volume: 1,
    currentWord: "",
    wordIndex: 0,
    totalWords: 0,
    currentSentence: ""
  };
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
        console.warn("[Spokn] TTS error:", e.error);
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
  class FloatingToolbar {
    root = null;
    shadowRoot = null;
    callbacks;
    isDragging = false;
    dragOffsetX = 0;
    dragOffsetY = 0;
    currentX = 0;
    currentY = 0;
    constructor(callbacks) {
      this.callbacks = callbacks;
    }
    mount() {
      if (this.root) return;
      this.root = document.createElement("div");
      this.root.id = "spokn-toolbar-host";
      this.root.style.cssText = `
      all: initial;
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      pointer-events: none;
    `;
      this.shadowRoot = this.root.attachShadow({ mode: "closed" });
      const style = document.createElement("style");
      style.textContent = this.getStyles();
      const toolbar2 = this.buildToolbar();
      this.shadowRoot.appendChild(style);
      this.shadowRoot.appendChild(toolbar2);
      document.body.appendChild(this.root);
      requestAnimationFrame(() => {
        const el = this.shadowRoot?.querySelector(".spokn-toolbar");
        if (el) el.classList.add("spokn-toolbar--visible");
      });
      this.setupDrag();
    }
    unmount() {
      this.root?.remove();
      this.root = null;
      this.shadowRoot = null;
      this.removeDragListeners();
    }
    updateState(opts) {
      if (!this.shadowRoot) return;
      const playBtn = this.shadowRoot.querySelector(".spokn-btn-play");
      const sentenceEl = this.shadowRoot.querySelector(".spokn-sentence-preview");
      const speedEl = this.shadowRoot.querySelector(".spokn-speed");
      if (playBtn) {
        playBtn.textContent = opts.status === "playing" ? "⏸" : "▶";
        playBtn.title = opts.status === "playing" ? "Pause" : "Play";
        playBtn.setAttribute("aria-label", opts.status === "playing" ? "Pause" : "Play");
      }
      if (sentenceEl) {
        const preview = opts.currentSentence ? opts.currentSentence.slice(0, 60) + (opts.currentSentence.length > 60 ? "…" : "") : opts.currentWord || "Reading…";
        sentenceEl.textContent = preview;
      }
      if (speedEl) {
        speedEl.textContent = `${opts.rate.toFixed(1)}x`;
      }
    }
    buildToolbar() {
      const toolbar2 = document.createElement("div");
      toolbar2.className = "spokn-toolbar";
      toolbar2.setAttribute("role", "toolbar");
      toolbar2.setAttribute("aria-label", "Spokn reader controls");
      toolbar2.innerHTML = `
      <div class="spokn-drag-handle" title="Drag to move" aria-hidden="true">⠿</div>
      <span class="spokn-sentence-preview">Loading…</span>
      <span class="spokn-speed">1.0x</span>
      <button class="spokn-btn spokn-btn-play" title="Play" aria-label="Play">▶</button>
      <button class="spokn-btn spokn-btn-stop" title="Stop" aria-label="Stop">⏹</button>
      <button class="spokn-btn spokn-btn-close" title="Close toolbar" aria-label="Close toolbar">✕</button>
    `;
      toolbar2.querySelector(".spokn-btn-play")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callbacks.onPlayPause();
      });
      toolbar2.querySelector(".spokn-btn-stop")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callbacks.onStop();
        this.unmount();
      });
      toolbar2.querySelector(".spokn-btn-close")?.addEventListener("click", (e) => {
        e.stopPropagation();
        this.callbacks.onStop();
        this.unmount();
      });
      return toolbar2;
    }
    // ─── Drag support ─────────────────────────────────────────────────────────
    boundMouseMove = null;
    boundMouseUp = null;
    setupDrag() {
      if (!this.shadowRoot) return;
      const handle = this.shadowRoot.querySelector(".spokn-drag-handle");
      if (!handle) return;
      const hostRect = this.root.getBoundingClientRect();
      this.currentX = hostRect.left;
      this.currentY = hostRect.top;
      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        this.isDragging = true;
        const rect = this.root.getBoundingClientRect();
        this.dragOffsetX = e.clientX - rect.left;
        this.dragOffsetY = e.clientY - rect.top;
        this.root.style.left = `${rect.left}px`;
        this.root.style.top = `${rect.top}px`;
        this.root.style.bottom = "auto";
        this.root.style.transform = "none";
      });
      this.boundMouseMove = (e) => {
        if (!this.isDragging || !this.root) return;
        e.preventDefault();
        const x = e.clientX - this.dragOffsetX;
        const y = e.clientY - this.dragOffsetY;
        this.root.style.left = `${x}px`;
        this.root.style.top = `${y}px`;
      };
      this.boundMouseUp = () => {
        this.isDragging = false;
      };
      document.addEventListener("mousemove", this.boundMouseMove, { passive: false });
      document.addEventListener("mouseup", this.boundMouseUp);
      if (this.root) {
        this.root.style.pointerEvents = "none";
        const toolbar2 = this.shadowRoot?.querySelector(".spokn-toolbar");
        if (toolbar2) toolbar2.style.pointerEvents = "auto";
      }
    }
    removeDragListeners() {
      if (this.boundMouseMove) {
        document.removeEventListener("mousemove", this.boundMouseMove);
      }
      if (this.boundMouseUp) {
        document.removeEventListener("mouseup", this.boundMouseUp);
      }
    }
    // ─── Styles ───────────────────────────────────────────────────────────────
    getStyles() {
      return `
      .spokn-toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        background: #1e1e2e;
        border-radius: 50px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.45), 0 2px 8px rgba(0,0,0,0.3);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 13px;
        color: #f1f5f9;
        user-select: none;
        opacity: 0;
        transform: translateY(16px);
        transition: opacity 0.22s ease, transform 0.22s ease;
        border: 1px solid rgba(124, 58, 237, 0.3);
        max-width: 420px;
      }

      .spokn-toolbar--visible {
        opacity: 1;
        transform: translateY(0);
      }

      .spokn-drag-handle {
        color: #94a3b8;
        font-size: 16px;
        cursor: grab;
        padding: 0 2px;
        line-height: 1;
        letter-spacing: -1px;
      }

      .spokn-drag-handle:active {
        cursor: grabbing;
      }

      .spokn-sentence-preview {
        flex: 1;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        color: #cbd5e1;
        font-size: 12px;
        max-width: 200px;
      }

      .spokn-speed {
        color: #7c3aed;
        font-weight: 600;
        font-size: 12px;
        min-width: 34px;
        text-align: center;
      }

      .spokn-btn {
        all: unset;
        display: flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border-radius: 50%;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.15s ease, transform 0.1s ease;
        color: #f1f5f9;
      }

      .spokn-btn:hover {
        background: rgba(255,255,255,0.1);
        transform: scale(1.1);
      }

      .spokn-btn:active {
        transform: scale(0.95);
      }

      .spokn-btn-close {
        color: #94a3b8;
        font-size: 12px;
      }

      .spokn-btn-close:hover {
        color: #f1f5f9;
        background: rgba(239, 68, 68, 0.25);
      }
    `;
    }
  }
  let tts = null;
  let walkResult = null;
  let toolbar = null;
  let state = { ...DEFAULT_STATE };
  function broadcastState() {
    chrome.runtime.sendMessage({ type: "STATE_UPDATE", state }).catch(() => {
    });
  }
  function setState(partial) {
    state = { ...state, ...partial };
    broadcastState();
    toolbar?.updateState({
      status: state.status,
      rate: state.rate,
      currentSentence: state.currentSentence,
      currentWord: state.currentWord
    });
  }
  async function startReading(mode, fromElement) {
    stopReading();
    if (mode === "selection") {
      walkResult = walkSelection();
    } else {
      if (fromElement) {
        walkResult = walkPageFrom(fromElement);
      } else {
        walkResult = walkPage();
      }
    }
    if (walkResult.words.length === 0) {
      console.warn("[Spokn] No readable text found for mode:", mode);
      return;
    }
    const stored = await chrome.storage.sync.get(["voiceName", "rate", "pitch", "volume"]);
    const voiceName = stored.voiceName || "";
    const rate = stored.rate ?? 1;
    const pitch = stored.pitch ?? 1;
    const volume = stored.volume ?? 1;
    tts = new TTS({ voiceName, rate, pitch, volume });
    toolbar = new FloatingToolbar({
      onPlayPause: () => {
        if (state.status === "playing") {
          tts?.pause();
        } else {
          tts?.resume();
        }
      },
      onStop: () => {
        stopReading();
      }
    });
    toolbar.mount();
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
          const wordIdx = event.wordIndex ?? 0;
          const word = event.word ?? "";
          const sentenceIdx = walkResult?.words[wordIdx]?.sentenceIndex ?? 0;
          const sentenceWords = walkResult?.words.filter((w) => w.sentenceIndex === sentenceIdx).map((w) => w.word).join(" ") ?? "";
          setState({
            currentWord: word,
            wordIndex: wordIdx,
            currentSentence: sentenceWords
          });
          chrome.runtime.sendMessage({
            type: "WORD_BOUNDARY",
            wordIndex: wordIdx,
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
          setState({ status: "stopped", currentWord: "", wordIndex: 0, currentSentence: "" });
          toolbar?.unmount();
          toolbar = null;
          walkResult?.restore();
          walkResult = null;
          break;
      }
    });
    await tts.play(walkResult.words);
  }
  function stopReading() {
    tts?.stop();
    tts = null;
    walkResult?.restore();
    walkResult = null;
    toolbar?.unmount();
    toolbar = null;
    state = { ...DEFAULT_STATE };
    broadcastState();
  }
  function walkPageFrom(fromElement) {
    const allResult = walkPage();
    const idx = allResult.words.findIndex((w) => fromElement.contains(w.span) || fromElement === w.span.closest("[data-spokn-root]"));
    if (idx <= 0) return allResult;
    const before = allResult.words.slice(0, idx);
    before.forEach((w) => {
      const parent = w.span.parentNode;
      if (!parent) return;
      const text = document.createTextNode(w.word);
      parent.replaceChild(text, w.span);
    });
    return {
      words: allResult.words.slice(idx),
      fullText: allResult.words.slice(idx).map((w) => w.word).join(" "),
      charOffsets: allResult.charOffsets.slice(idx).map((o) => o - (allResult.charOffsets[idx] ?? 0)),
      restore: allResult.restore
    };
  }
  const CLICKABLE_TAGS = /* @__PURE__ */ new Set(["P", "H1", "H2", "H3", "H4", "H5", "H6", "LI", "BLOCKQUOTE", "TD", "TH", "ARTICLE", "SECTION", "MAIN", "DIV"]);
  function enableClickToRead() {
    document.addEventListener("mouseover", onClickToReadHover);
    document.addEventListener("mouseout", onClickToReadOut);
    document.addEventListener("click", onClickToReadClick, true);
  }
  function disableClickToRead() {
    document.removeEventListener("mouseover", onClickToReadHover);
    document.removeEventListener("mouseout", onClickToReadOut);
    document.removeEventListener("click", onClickToReadClick, true);
    document.querySelectorAll(".spokn-clickable-hover").forEach((el) => {
      el.classList.remove("spokn-clickable-hover");
    });
  }
  function onClickToReadHover(e) {
    const target = e.target;
    if (CLICKABLE_TAGS.has(target.tagName)) {
      target.classList.add("spokn-clickable-hover");
    }
  }
  function onClickToReadOut(e) {
    const target = e.target;
    target.classList.remove("spokn-clickable-hover");
  }
  function onClickToReadClick(e) {
    const target = e.target;
    const readable = target.closest(Array.from(CLICKABLE_TAGS).join(","));
    if (!readable) return;
    if (e.target.closest("#spokn-toolbar-host")) return;
    e.preventDefault();
    e.stopPropagation();
    readable.classList.remove("spokn-clickable-hover");
    startReading("click", readable);
  }
  chrome.runtime.onMessage.addListener(
    (rawMsg, _sender, sendResponse) => {
      const msg = rawMsg;
      (async () => {
        try {
          switch (msg.type) {
            case "PLAY": {
              const mode = msg.mode;
              if (mode === "click") {
                enableClickToRead();
                setState({ mode: "click", status: "stopped" });
              } else {
                await startReading(mode);
              }
              sendResponse({ success: true });
              break;
            }
            case "PAUSE": {
              if (tts && state.status === "playing") {
                tts.pause();
              }
              sendResponse({ success: true });
              break;
            }
            case "RESUME": {
              if (tts && state.status === "paused") {
                tts.resume();
              }
              sendResponse({ success: true });
              break;
            }
            case "STOP": {
              stopReading();
              disableClickToRead();
              sendResponse({ success: true });
              break;
            }
            case "SET_VOICE": {
              state.voiceName = msg.voiceName;
              tts?.updateOptions({ voiceName: msg.voiceName });
              await chrome.storage.sync.set({ voiceName: msg.voiceName });
              sendResponse({ success: true });
              break;
            }
            case "SET_SPEED": {
              state.rate = msg.rate;
              tts?.updateOptions({ rate: msg.rate });
              toolbar?.updateState({ status: state.status, rate: msg.rate, currentSentence: state.currentSentence, currentWord: state.currentWord });
              await chrome.storage.sync.set({ rate: msg.rate });
              sendResponse({ success: true });
              break;
            }
            case "SET_PITCH": {
              state.pitch = msg.pitch;
              tts?.updateOptions({ pitch: msg.pitch });
              await chrome.storage.sync.set({ pitch: msg.pitch });
              sendResponse({ success: true });
              break;
            }
            case "SET_VOLUME": {
              state.volume = msg.volume;
              tts?.updateOptions({ volume: msg.volume });
              await chrome.storage.sync.set({ volume: msg.volume });
              sendResponse({ success: true });
              break;
            }
            case "GET_STATE": {
              sendResponse({ success: true, state });
              break;
            }
            case "CLICK_TO_READ_TOGGLE": {
              if (msg.enabled) {
                enableClickToRead();
              } else {
                disableClickToRead();
              }
              sendResponse({ success: true });
              break;
            }
            default:
              sendResponse({ success: false, error: "Unknown message" });
          }
        } catch (err) {
          sendResponse({ success: false, error: String(err) });
        }
      })();
      return true;
    }
  );
  getVoices().then((voices) => {
    if (voices.length > 0 && !state.voiceName) {
      const preferred = voices.find((v) => v.lang.startsWith("en") && !v.name.includes("Google"));
      if (preferred) {
        state.voiceName = preferred.name;
      }
    }
  });
  console.debug("[Spokn] Content script loaded on", location.hostname);
})();
