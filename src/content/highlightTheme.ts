/**
 * highlightTheme.ts
 *
 * Manages the word/sentence highlight color theme.
 * Injects a <style> tag into the host page (not Shadow DOM) that overrides
 * the CSS custom properties defined in content.css.
 */

export interface HighlightTheme {
  id: string;
  label: string;
  /** Swatch color shown in the picker */
  swatch: string;
  wordBg: string;
  wordColor: string;
  sentenceBg: string;
}

export const HIGHLIGHT_THEMES: HighlightTheme[] = [
  {
    id: 'sky',
    label: 'Sky',
    swatch: '#0ea5e9',
    wordBg: '#0ea5e9',
    wordColor: '#ffffff',
    sentenceBg: 'rgba(14, 165, 233, 0.15)',
  },
  {
    id: 'yellow',
    label: 'Yellow',
    swatch: '#FFE066',
    wordBg: '#FFE066',
    wordColor: '#0d1117',
    sentenceBg: 'rgba(255, 224, 102, 0.2)',
  },
  {
    id: 'mint',
    label: 'Mint',
    swatch: '#10b981',
    wordBg: '#10b981',
    wordColor: '#ffffff',
    sentenceBg: 'rgba(16, 185, 129, 0.15)',
  },
  {
    id: 'coral',
    label: 'Coral',
    swatch: '#f87171',
    wordBg: '#f87171',
    wordColor: '#ffffff',
    sentenceBg: 'rgba(248, 113, 113, 0.15)',
  },
  {
    id: 'violet',
    label: 'Violet',
    swatch: '#a78bfa',
    wordBg: '#a78bfa',
    wordColor: '#ffffff',
    sentenceBg: 'rgba(167, 139, 250, 0.15)',
  },
  {
    id: 'warm',
    label: 'Warm',
    swatch: '#fb923c',
    wordBg: '#fb923c',
    wordColor: '#ffffff',
    sentenceBg: 'rgba(251, 146, 60, 0.15)',
  },
  {
    id: 'rose',
    label: 'Rose',
    swatch: '#fb7185',
    wordBg: '#fb7185',
    wordColor: '#ffffff',
    sentenceBg: 'rgba(251, 113, 133, 0.15)',
  },
  {
    id: 'dark',
    label: 'Dark',
    swatch: '#1e293b',
    wordBg: '#1e293b',
    wordColor: '#f1f5f9',
    sentenceBg: 'rgba(30, 41, 59, 0.25)',
  },
  {
    id: 'light',
    label: 'Light',
    swatch: '#e2e8f0',
    wordBg: '#e2e8f0',
    wordColor: '#0d1117',
    sentenceBg: 'rgba(226, 232, 240, 0.35)',
  },
  {
    id: 'none',
    label: 'None',
    swatch: 'transparent',
    wordBg: 'transparent',
    wordColor: 'inherit',
    sentenceBg: 'transparent',
  },
];

export const DEFAULT_THEME_ID = 'sky';

const STYLE_ID = 'spokn-highlight-theme';

export function applyTheme(themeId: string): void {
  const theme = HIGHLIGHT_THEMES.find(t => t.id === themeId) ?? HIGHLIGHT_THEMES[0]!;

  let el = document.getElementById(STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement('style');
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

export function removeTheme(): void {
  document.getElementById(STYLE_ID)?.remove();
}
