/**
 * floatingToolbar.ts
 *
 * Injects a draggable floating mini-player into the host page when reading starts.
 * - Dark pill design: #1e1e2e background, white text, border-radius: 50px
 * - Default position: bottom-center
 * - z-index: 2147483647
 * - Draggable via mouse
 * - Play/Pause, Stop, speed display, current sentence preview
 * - Slide-up animation on appear
 * - Synced with popup state via callbacks
 */

export interface ToolbarCallbacks {
  onPlayPause: () => void;
  onStop: () => void;
}

export class FloatingToolbar {
  private root: HTMLDivElement | null = null;
  private shadowRoot: ShadowRoot | null = null;
  private callbacks: ToolbarCallbacks;
  private isDragging = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private currentX = 0;
  private currentY = 0;

  constructor(callbacks: ToolbarCallbacks) {
    this.callbacks = callbacks;
  }

  mount(): void {
    if (this.root) return;

    // Use a Shadow DOM so our styles never collide with the host page
    this.root = document.createElement('div');
    this.root.id = 'spokn-toolbar-host';
    this.root.style.cssText = `
      all: initial;
      position: fixed;
      bottom: 28px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483647;
      pointer-events: none;
    `;

    this.shadowRoot = this.root.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = this.getStyles();

    const toolbar = this.buildToolbar();

    this.shadowRoot.appendChild(style);
    this.shadowRoot.appendChild(toolbar);
    document.body.appendChild(this.root);

    // Trigger slide-up animation
    requestAnimationFrame(() => {
      const el = this.shadowRoot?.querySelector('.spokn-toolbar') as HTMLElement | null;
      if (el) el.classList.add('spokn-toolbar--visible');
    });

    this.setupDrag();
  }

  unmount(): void {
    this.root?.remove();
    this.root = null;
    this.shadowRoot = null;
    this.removeDragListeners();
  }

  updateState(opts: {
    status: 'playing' | 'paused' | 'stopped';
    rate: number;
    currentSentence: string;
    currentWord: string;
  }): void {
    if (!this.shadowRoot) return;

    const playBtn = this.shadowRoot.querySelector<HTMLButtonElement>('.spokn-btn-play');
    const sentenceEl = this.shadowRoot.querySelector<HTMLElement>('.spokn-sentence-preview');
    const speedEl = this.shadowRoot.querySelector<HTMLElement>('.spokn-speed');

    if (playBtn) {
      playBtn.textContent = opts.status === 'playing' ? '⏸' : '▶';
      playBtn.title = opts.status === 'playing' ? 'Pause' : 'Play';
      playBtn.setAttribute('aria-label', opts.status === 'playing' ? 'Pause' : 'Play');
    }

    if (sentenceEl) {
      const preview = opts.currentSentence
        ? opts.currentSentence.slice(0, 60) + (opts.currentSentence.length > 60 ? '…' : '')
        : opts.currentWord || 'Reading…';
      sentenceEl.textContent = preview;
    }

    if (speedEl) {
      speedEl.textContent = `${opts.rate.toFixed(1)}x`;
    }
  }

  private buildToolbar(): HTMLElement {
    const toolbar = document.createElement('div');
    toolbar.className = 'spokn-toolbar';
    toolbar.setAttribute('role', 'toolbar');
    toolbar.setAttribute('aria-label', 'Spokn reader controls');

    toolbar.innerHTML = `
      <div class="spokn-drag-handle" title="Drag to move" aria-hidden="true">⠿</div>
      <span class="spokn-sentence-preview">Loading…</span>
      <span class="spokn-speed">1.0x</span>
      <button class="spokn-btn spokn-btn-play" title="Play" aria-label="Play">▶</button>
      <button class="spokn-btn spokn-btn-stop" title="Stop" aria-label="Stop">⏹</button>
      <button class="spokn-btn spokn-btn-close" title="Close toolbar" aria-label="Close toolbar">✕</button>
    `;

    toolbar.querySelector('.spokn-btn-play')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onPlayPause();
    });

    toolbar.querySelector('.spokn-btn-stop')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onStop();
      this.unmount();
    });

    toolbar.querySelector('.spokn-btn-close')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.callbacks.onStop();
      this.unmount();
    });

    return toolbar;
  }

  // ─── Drag support ─────────────────────────────────────────────────────────

  private boundMouseMove: ((e: MouseEvent) => void) | null = null;
  private boundMouseUp: ((e: MouseEvent) => void) | null = null;

  private setupDrag(): void {
    if (!this.shadowRoot) return;

    const handle = this.shadowRoot.querySelector<HTMLElement>('.spokn-drag-handle');
    if (!handle) return;

    // Get initial position from host element
    const hostRect = this.root!.getBoundingClientRect();
    this.currentX = hostRect.left;
    this.currentY = hostRect.top;

    handle.addEventListener('mousedown', (e: MouseEvent) => {
      e.preventDefault();
      this.isDragging = true;

      const rect = this.root!.getBoundingClientRect();
      this.dragOffsetX = e.clientX - rect.left;
      this.dragOffsetY = e.clientY - rect.top;

      // Switch to absolute positioning for drag
      this.root!.style.left = `${rect.left}px`;
      this.root!.style.top = `${rect.top}px`;
      this.root!.style.bottom = 'auto';
      this.root!.style.transform = 'none';
    });

    this.boundMouseMove = (e: MouseEvent) => {
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

    document.addEventListener('mousemove', this.boundMouseMove, { passive: false });
    document.addEventListener('mouseup', this.boundMouseUp);

    // Allow clicking through the host wrapper when not hovering toolbar
    if (this.root) {
      this.root.style.pointerEvents = 'none';
      const toolbar = this.shadowRoot?.querySelector<HTMLElement>('.spokn-toolbar');
      if (toolbar) toolbar.style.pointerEvents = 'auto';
    }
  }

  private removeDragListeners(): void {
    if (this.boundMouseMove) {
      document.removeEventListener('mousemove', this.boundMouseMove);
    }
    if (this.boundMouseUp) {
      document.removeEventListener('mouseup', this.boundMouseUp);
    }
  }

  // ─── Styles ───────────────────────────────────────────────────────────────

  private getStyles(): string {
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
