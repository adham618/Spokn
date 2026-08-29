/**
 * textWalker.ts
 *
 * Walks the DOM and collects all readable text nodes in document order.
 * Supports two modes:
 *   - 'page'      : skip non-content elements, collect body text
 *   - 'selection' : collect only the user's current text selection
 *
 * Returns a flat array of WordNode objects — one per word — each holding
 * a reference to the span element that will be highlighted.
 */

export interface WordNode {
  word: string;
  span: HTMLSpanElement;
  sentenceIndex: number;
}

/** Elements whose text we never want to read aloud */
const SKIP_TAGS = new Set([
  'SCRIPT', 'STYLE', 'NOSCRIPT', 'IFRAME', 'OBJECT', 'EMBED',
  'NAV', 'HEADER', 'FOOTER', 'ASIDE',
  'BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'OPTION',
  'CODE', 'PRE', 'FIGURE', 'FIGCAPTION',
  'AUDIO', 'VIDEO', 'CANVAS', 'SVG', 'MATH',
]);

/** spokn- prefixed class so we never clash with host page styles */
export const WORD_CLASS = 'spokn-word';
export const ACTIVE_WORD_CLASS = 'spokn-word-active';
export const SENTENCE_CLASS = 'spokn-sentence';
export const ACTIVE_SENTENCE_CLASS = 'spokn-sentence-active';

// ─── Sentence splitting ───────────────────────────────────────────────────────

/** Naive but effective sentence splitter. Returns array of sentence strings. */
function splitIntoSentences(text: string): string[] {
  // Split on .  !  ?  followed by whitespace or end-of-string
  const raw = text.match(/[^.!?]+[.!?]+[\s]*/g) ?? [text];
  return raw.map(s => s.trim()).filter(Boolean);
}

// ─── DOM wrapping ─────────────────────────────────────────────────────────────

/**
 * Takes a text node, wraps every word in a <span class="spokn-word">,
 * and groups them by sentence with <span class="spokn-sentence">.
 * Returns the array of WordNode objects created.
 */
function wrapTextNode(textNode: Text, sentenceOffset: number): WordNode[] {
  const text = textNode.textContent ?? '';
  if (!text.trim()) return [];

  const parent = textNode.parentNode;
  if (!parent) return [];

  const sentences = splitIntoSentences(text);
  const wordNodes: WordNode[] = [];

  const fragment = document.createDocumentFragment();

  sentences.forEach((sentence, sIdx) => {
    const sentenceSpan = document.createElement('span');
    sentenceSpan.className = SENTENCE_CLASS;

    const words = sentence.split(/(\s+)/);
    words.forEach(token => {
      if (/^\s+$/.test(token)) {
        // Preserve whitespace as a text node
        sentenceSpan.appendChild(document.createTextNode(token));
      } else if (token.length > 0) {
        const wordSpan = document.createElement('span');
        wordSpan.className = WORD_CLASS;
        wordSpan.textContent = token;
        wordSpan.dataset.spoknWord = token;
        sentenceSpan.appendChild(wordSpan);

        wordNodes.push({
          word: token,
          span: wordSpan,
          sentenceIndex: sentenceOffset + sIdx,
        });
      }
    });

    fragment.appendChild(sentenceSpan);
  });

  parent.replaceChild(fragment, textNode);
  return wordNodes;
}

// ─── DOM walker — full page ───────────────────────────────────────────────────

function shouldSkipElement(el: Element): boolean {
  if (SKIP_TAGS.has(el.tagName)) return true;
  // Skip hidden elements
  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden') return true;
  // Skip elements that are aria-hidden
  if (el.getAttribute('aria-hidden') === 'true') return true;
  return false;
}

/** Collect all leaf text nodes in document order, skipping non-content elements */
function collectTextNodes(root: Element | DocumentFragment): Text[] {
  const result: Text[] = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ALL,
    {
      acceptNode(node) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          if (shouldSkipElement(node as Element)) {
            return NodeFilter.FILTER_REJECT; // skip subtree
          }
          return NodeFilter.FILTER_SKIP;     // check children
        }
        if (node.nodeType === Node.TEXT_NODE) {
          const text = (node as Text).textContent ?? '';
          if (text.trim().length > 0) return NodeFilter.FILTER_ACCEPT;
          return NodeFilter.FILTER_SKIP;
        }
        return NodeFilter.FILTER_SKIP;
      },
    },
  );

  let current: Node | null;
  while ((current = walker.nextNode())) {
    result.push(current as Text);
  }
  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export interface WalkResult {
  words: WordNode[];
  /** Flat string of all words joined by spaces — fed to SpeechSynthesisUtterance */
  fullText: string;
  /** Offsets into fullText where each word starts — used for charIndex mapping */
  charOffsets: number[];
  /** Restore function — removes all spokn spans and puts original text nodes back */
  restore: () => void;
}

/**
 * Builds a WalkResult from a plain string — no DOM mutation.
 * Used as a fallback when the right-click context menu cleared the live
 * selection before the content script received the READ_SELECTION message.
 * Word spans are created but never inserted into the page, so restore() is a
 * no-op.
 */
export function walkText(text: string): WalkResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { words: [], fullText: '', charOffsets: [], restore: () => {} };
  }

  const sentences = splitIntoSentences(trimmed);
  const allWords: WordNode[] = [];
  let sentenceOffset = 0;

  for (const sentence of sentences) {
    const tokens = sentence.split(/(\s+)/);
    for (const token of tokens) {
      if (/^\s+$/.test(token) || token.length === 0) continue;
      const span = document.createElement('span');
      span.className = WORD_CLASS;
      span.textContent = token;
      span.dataset.spoknWord = token;
      allWords.push({ word: token, span, sentenceIndex: sentenceOffset });
    }
    sentenceOffset++;
  }

  const parts: string[] = [];
  const charOffsets: number[] = [];
  let cursor = 0;
  for (const w of allWords) {
    charOffsets.push(cursor);
    parts.push(w.word);
    cursor += w.word.length + 1;
  }

  return {
    words: allWords,
    fullText: parts.join(' '),
    charOffsets,
    restore: () => {},
  };
}

/**
 * Wraps all page text in spokn word spans and returns structured walk result.
 * Call result.restore() to undo all DOM mutations.
 */
export function walkPage(): WalkResult {
  const textNodes = collectTextNodes(document.body);
  return buildResult(textNodes);
}

/**
 * Async version of walkPage — processes text nodes in chunks so the main
 * thread stays interactive. Use this from startReading() on page mode.
 */
export async function walkPageAsync(): Promise<WalkResult> {
  const textNodes = collectTextNodes(document.body);
  return buildResultAsync(textNodes);
}

/**
 * Wraps only the current selection's text in spokn word spans.
 */
export function walkSelection(): WalkResult {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return { words: [], fullText: '', charOffsets: [], restore: () => {} };
  }

  // Expand selection to a temporary fragment, collect text nodes within it
  const range = selection.getRangeAt(0);
  const fragment = range.cloneContents();
  const tempDiv = document.createElement('div');
  tempDiv.appendChild(fragment);

  // We need real DOM nodes (not clones) to wrap, so we iterate the actual
  // selected text nodes via a TreeWalker on the live document within the range
  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode(node) {
        if (!range.intersectsNode(node)) return NodeFilter.FILTER_REJECT;
        const text = (node as Text).textContent ?? '';
        if (text.trim().length === 0) return NodeFilter.FILTER_SKIP;
        return NodeFilter.FILTER_ACCEPT;
      },
    },
  );

  let n: Node | null;
  while ((n = walker.nextNode())) {
    textNodes.push(n as Text);
  }

  return buildResult(textNodes);
}

function buildResult(textNodes: Text[]): WalkResult {
  const allWords: WordNode[] = [];
  let sentenceOffset = 0;

  // Keep originals so we can restore them
  const originals: Array<{ parent: Node; nodes: ChildNode[]; refNode: ChildNode | null }> = [];

  for (const tn of textNodes) {
    const parent = tn.parentNode;
    if (!parent) continue;

    // Record snapshot before mutation
    const beforeChildren = Array.from(parent.childNodes);
    const idx = beforeChildren.indexOf(tn);

    const words = wrapTextNode(tn, sentenceOffset);
    if (words.length === 0) continue;

    sentenceOffset = (words[words.length - 1]?.sentenceIndex ?? sentenceOffset) + 1;
    allWords.push(...words);

    // Record the spans we just inserted so we can remove them later
    const afterChildren = Array.from(parent.childNodes);
    const inserted = afterChildren.slice(idx, idx + (afterChildren.length - beforeChildren.length + 1));
    originals.push({ parent, nodes: inserted, refNode: inserted[inserted.length - 1]?.nextSibling ?? null });
  }

  // Build flat text and charOffset map
  const parts: string[] = [];
  const charOffsets: number[] = [];
  let cursor = 0;

  for (const w of allWords) {
    charOffsets.push(cursor);
    parts.push(w.word);
    cursor += w.word.length + 1; // +1 for the space separator
  }

  const fullText = parts.join(' ');

  function restore() {
    for (const { parent, nodes, refNode } of originals) {
      // Collect the text content of all word spans in this group
      let text = '';
      for (const node of nodes) {
        text += node.textContent ?? '';
      }
      const textNode = document.createTextNode(text);
      // Insert the restored text node and remove the span groups
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

/**
 * Async version of buildResult — processes text nodes in chunks, yielding
 * between each chunk so the browser stays responsive during long page walks.
 * CHUNK_SIZE controls how many text nodes are wrapped per frame.
 */
const CHUNK_SIZE = 50;

async function buildResultAsync(textNodes: Text[]): Promise<WalkResult> {
  const allWords: WordNode[] = [];
  let sentenceOffset = 0;
  const originals: Array<{ parent: Node; nodes: ChildNode[]; refNode: ChildNode | null }> = [];

  for (let i = 0; i < textNodes.length; i += CHUNK_SIZE) {
    const chunk = textNodes.slice(i, i + CHUNK_SIZE);

    for (const tn of chunk) {
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

    // Yield to the browser between chunks so UI stays interactive
    if (i + CHUNK_SIZE < textNodes.length) {
      await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
  }

  const parts: string[] = [];
  const charOffsets: number[] = [];
  let cursor = 0;
  for (const w of allWords) {
    charOffsets.push(cursor);
    parts.push(w.word);
    cursor += w.word.length + 1;
  }

  const fullText = parts.join(' ');

  function restore() {
    for (const { parent, nodes, refNode } of originals) {
      let text = '';
      for (const node of nodes) text += node.textContent ?? '';
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
