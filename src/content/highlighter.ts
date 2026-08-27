/**
 * highlighter.ts
 *
 * Manages the active word and sentence highlighting.
 * Called by tts.ts on every SpeechSynthesisUtterance `boundary` event.
 *
 * Responsibilities:
 *  - Apply / remove `spokn-word-active` on the current word span
 *  - Apply / remove `spokn-sentence-active` on the current sentence span
 *  - Smooth-scroll the active word into view
 */

import type { WordNode } from './textWalker.js';
import { ACTIVE_WORD_CLASS, ACTIVE_SENTENCE_CLASS, SENTENCE_CLASS } from './textWalker.js';

export class Highlighter {
  private words: WordNode[];
  private currentWordIdx = -1;
  private currentSentenceIdx = -1;

  constructor(words: WordNode[]) {
    this.words = words;
  }

  /**
   * Highlight the word at `wordIdx` and its containing sentence.
   * Safe to call with any index — out-of-bounds is silently ignored.
   */
  highlight(wordIdx: number): void {
    if (wordIdx < 0 || wordIdx >= this.words.length) return;
    if (wordIdx === this.currentWordIdx) return;

    const prev = this.currentWordIdx >= 0 ? this.words[this.currentWordIdx] : null;
    const next = this.words[wordIdx];

    // ── Word highlight ──────────────────────────────────────────────────────
    prev?.span.classList.remove(ACTIVE_WORD_CLASS);
    next.span.classList.add(ACTIVE_WORD_CLASS);
    this.currentWordIdx = wordIdx;

    // ── Sentence highlight ──────────────────────────────────────────────────
    if (next.sentenceIndex !== this.currentSentenceIdx) {
      // Remove from old sentence
      if (this.currentSentenceIdx >= 0) {
        const oldSentenceSpan = this.findSentenceSpan(prev?.span ?? null);
        oldSentenceSpan?.classList.remove(ACTIVE_SENTENCE_CLASS);
      }

      const newSentenceSpan = this.findSentenceSpan(next.span);
      newSentenceSpan?.classList.add(ACTIVE_SENTENCE_CLASS);
      this.currentSentenceIdx = next.sentenceIndex;
    }

    // ── Scroll into view ────────────────────────────────────────────────────
    this.scrollIntoView(next.span);
  }

  /** Remove all highlights — called on stop/pause */
  clearAll(): void {
    if (this.currentWordIdx >= 0 && this.currentWordIdx < this.words.length) {
      this.words[this.currentWordIdx]?.span.classList.remove(ACTIVE_WORD_CLASS);
    }

    // Clear all sentence highlights
    document.querySelectorAll(`.${ACTIVE_SENTENCE_CLASS}`).forEach(el => {
      el.classList.remove(ACTIVE_SENTENCE_CLASS);
    });

    this.currentWordIdx = -1;
    this.currentSentenceIdx = -1;
  }

  /** Reset to beginning without touching DOM */
  reset(): void {
    this.clearAll();
  }

  private findSentenceSpan(wordSpan: HTMLElement | null): HTMLElement | null {
    if (!wordSpan) return null;
    let el: HTMLElement | null = wordSpan;
    while (el) {
      if (el.classList.contains(SENTENCE_CLASS)) return el;
      el = el.parentElement;
    }
    return null;
  }

  private scrollIntoView(el: HTMLElement): void {
    try {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    } catch {
      // scrollIntoView can throw in some browser contexts — fail silently
    }
  }
}
