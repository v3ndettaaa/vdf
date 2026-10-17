/**
 * Lightweight inline text editor overlaying a canvas annotation.
 * A floating textarea committed with Esc/Enter/blur and cancelled with
 * Ctrl+Z-style Tab-out. Used by the text tool.
 */

export interface InlineEditorOptions {
  /** Screen-space rect (CSS px) to cover. */
  rect: { left: number; top: number; width: number; height: number };
  value: string;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
  textAlign?: 'left' | 'center' | 'right';
  fontFamily?: string;
  padding?: number;
  placeholder?: string;
  selectAllOnOpen?: boolean;
  onCommit: (text: string) => void;
  onCancel?: () => void;
}

let activeInlineEditorFinish: ((commit: boolean) => void) | null = null;

/** Commits and closes any currently open inline text editor. */
export function closeActiveInlineEditor(commit: boolean = true): void {
  if (activeInlineEditorFinish) {
    const fn = activeInlineEditorFinish;
    activeInlineEditorFinish = null;
    fn(commit);
  }
}

function isVeryLightColor(hex: string): boolean {
  const clean = hex.trim().replace('#', '');
  if (clean.length !== 6 && clean.length !== 3) return false;
  const full = clean.length === 3
    ? clean.split('').map(c => c + c).join('')
    : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (!Number.isFinite(r) || !Number.isFinite(g) || !Number.isFinite(b)) return false;
  // Relative luminance check so white/near-white text gets a dark backdrop while typing
  return (r * 0.299 + g * 0.587 + b * 0.114) > 220;
}

export function openInlineEditor(options: InlineEditorOptions): void {
  closeActiveInlineEditor(true);

  const { rect, value, onCommit, onCancel } = options;
  const fontSize = Math.max(11, Math.round(options.fontSize ?? 16));
  const fontFamily = options.fontFamily ?? 'Inter';
  const pad = Math.max(4, Math.round(options.padding ?? 8));
  const textColor = options.color || '#111827';
  const hasBg = !!options.backgroundColor && options.backgroundColor !== 'transparent';
  const editorBg = hasBg
    ? options.backgroundColor!
    : (isVeryLightColor(textColor) ? 'rgba(15, 23, 42, 0.92)' : 'rgba(255, 255, 255, 0.96)');

  const area = document.createElement('textarea');
  area.className = 'inline-annotation-editor';
  area.value = value;
  area.spellcheck = false;
  area.placeholder = options.placeholder ?? 'Type text… (Shift+Enter for new line)';

  const minW = Math.max(140, Math.round(rect.width));
  const minH = Math.max(Math.round(fontSize * 1.35 + pad * 2 + 4), Math.round(rect.height));

  Object.assign(area.style, {
    position: 'fixed',
    left: `${Math.max(8, Math.min(window.innerWidth - 160, Math.round(rect.left)))}px`,
    top: `${Math.max(8, Math.min(window.innerHeight - 60, Math.round(rect.top)))}px`,
    width: `${minW}px`,
    height: `${minH}px`,
    zIndex: '2500',
    resize: 'both',
    overflow: 'hidden',
    boxSizing: 'border-box',
    border: '2px solid var(--accent, #6366f1)',
    borderRadius: '6px',
    padding: `${pad}px`,
    background: editorBg,
    color: textColor,
    textAlign: options.textAlign || 'left',
    font: `${fontSize}px "${fontFamily}", sans-serif`,
    lineHeight: '1.35',
    outline: 'none',
    boxShadow: '0 10px 28px rgba(0, 0, 0, 0.28), 0 0 0 3px rgba(99, 102, 241, 0.22)'
  });

  let done = false;
  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    if (activeInlineEditorFinish === finish) {
      activeInlineEditorFinish = null;
    }
    const text = area.value;
    area.remove();
    document.removeEventListener('pointerdown', onOutside, true);
    if (commit) onCommit(text);
    else onCancel?.();
  };
  activeInlineEditorFinish = finish;

  const autoGrow = () => {
    const lines = (area.value || area.placeholder || ' ').split('\n');
    const longest = lines.reduce((m, l) => Math.max(m, l.length), 1);
    const estW = Math.max(minW, Math.min(window.innerWidth - 32, Math.ceil(longest * fontSize * 0.62 + pad * 2 + 24)));
    area.style.width = `${estW}px`;
    area.style.height = 'auto';
    area.style.height = `${Math.max(minH, area.scrollHeight + 4)}px`;
  };

  const onOutside = (e: PointerEvent) => {
    if (!area.contains(e.target as Node)) finish(true);
  };

  area.addEventListener('pointerdown', (e) => e.stopPropagation());
  area.addEventListener('click', (e) => e.stopPropagation());
  area.addEventListener('dblclick', (e) => e.stopPropagation());
  area.addEventListener('keyup', (e) => e.stopPropagation());
  area.addEventListener('input', autoGrow);
  area.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(false);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      finish(true);
    } else {
      e.stopPropagation();
    }
  });

  // Defer so the pointerdown that created the editor doesn't immediately close it.
  window.setTimeout(() => {
    if (!done) {
      document.addEventListener('pointerdown', onOutside, true);
    }
  }, 40);

  document.body.appendChild(area);
  autoGrow();
  area.focus();
  if (options.selectAllOnOpen !== false && value.length > 0) {
    area.select();
  }
}
