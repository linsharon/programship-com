import { useState, useCallback } from 'react';

export interface LyricLine {
  id: number;
  cn: string;
  no: string;
  timestamp: number;
}

export type LyricStatus = 'idle' | 'scraping' | 'translating' | 'ready' | 'error';

// ── CORS proxies (tried in order) ─────────────────────────────────────────
const PROXIES = [
  (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
  (u: string) => `https://thingproxy.freeboard.io/fetch/${u}`,
];

async function fetchViaProxy(url: string): Promise<string> {
  const errors: string[] = [];
  for (const makeUrl of PROXIES) {
    try {
      const res = await fetch(makeUrl(url));
      if (res.ok) {
        const text = await res.text();
        // If proxy returned an error page instead of the target page, skip
        if (text.length > 500) return text;
      }
    } catch (e) {
      errors.push(String(e));
    }
  }
  throw new Error(`代理访问失败（${errors[0] ?? '未知错误'}）。请改用手动粘贴歌词。`);
}

// ── Helpers ────────────────────────────────────────────────────────────────
function isChinese(text: string) { return /[一-鿿]/.test(text); }

function deepFind(obj: unknown, keys: string[], depth = 0): unknown {
  if (depth > 12 || obj === null || typeof obj !== 'object') return undefined;
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const f = deepFind(v, keys, depth + 1);
      if (f !== undefined) return f;
    }
  } else {
    const rec = obj as Record<string, unknown>;
    for (const k of keys) {
      if (k in rec && typeof rec[k] === 'string' && (rec[k] as string).length > 20)
        return rec[k];
    }
    for (const v of Object.values(rec)) {
      const f = deepFind(v, keys, depth + 1);
      if (f !== undefined) return f;
    }
  }
  return undefined;
}

function htmlToLines(html: string): string[] {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#\d+;/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && isChinese(l));
}

export function parsePlainLyrics(text: string): string[] {
  // Strip common LRC timestamps like [00:01.23]
  return text
    .split('\n')
    .map(l => l.replace(/^\[[\d:.\s]+\]/, '').trim())
    .filter(l => l.length > 0 && isChinese(l));
}

async function scrapeKkbox(url: string): Promise<string[]> {
  const html = await fetchViaProxy(url);
  const doc  = new DOMParser().parseFromString(html, 'text/html');

  // Strategy 1: Next.js __NEXT_DATA__ — most reliable if SSR includes lyrics
  const nxt = doc.querySelector('#__NEXT_DATA__');
  if (nxt?.textContent) {
    try {
      const data: unknown = JSON.parse(nxt.textContent);
      const lyricKeys = ['lyrics', 'lyric', 'lyricContent', 'songLyrics',
                         'lyricsText', 'content', 'text', 'body'];
      const raw = deepFind(data, lyricKeys);
      if (typeof raw === 'string' && isChinese(raw)) {
        const lines = htmlToLines(raw);
        if (lines.length > 2) return lines;
      }
    } catch { /* fall through */ }
  }

  // Strategy 2: JSON-LD structured data
  for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try {
      const data: unknown = JSON.parse(el.textContent ?? '');
      const raw = deepFind(data, ['lyrics', 'lyric', 'text']);
      if (typeof raw === 'string' && isChinese(raw)) {
        const lines = htmlToLines(raw);
        if (lines.length > 2) return lines;
      }
    } catch { /* fall through */ }
  }

  // Strategy 3: Common CSS selectors
  const selectors = [
    '.lyrics p', '.lyric p', '#lyrics p', '#lyric p',
    '[class*="lyrics"] p', '[class*="lyric"] p',
    '[class*="Lyrics"] p', '[class*="Lyric"] p',
    '.lyrics', '.lyric', '#lyrics', '#lyric',
    '[class*="lyrics"]', '[class*="lyric"]',
    '[class*="song-word"]', '[class*="songword"]',
    '[data-lyrics]', '[class*="lyr"]',
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (!el) continue;
    const lines = htmlToLines(el.innerHTML);
    if (lines.length > 2) return lines;
  }

  // Strategy 4: Heuristic — find the element with most Chinese characters
  // that isn't a nav/header/footer type container
  const skip = new Set(['SCRIPT','STYLE','NAV','HEADER','FOOTER','HEAD']);
  let bestEl: Element | null = null;
  let bestScore = 0;
  for (const el of doc.querySelectorAll('p, div, article, section, pre')) {
    if (skip.has(el.tagName)) continue;
    if (el.children.length > 60) continue;
    const text  = el.textContent ?? '';
    const cnLen = (text.match(/[一-鿿]/g) ?? []).length;
    // Require meaningful amount of Chinese and multiple lines
    const lineCount = text.split('\n').filter(l => l.trim()).length;
    const score = cnLen * 2 + lineCount;
    if (score > bestScore) { bestScore = score; bestEl = el; }
  }
  if (bestEl && bestScore > 40) {
    const lines = htmlToLines((bestEl as HTMLElement).innerHTML);
    if (lines.length > 2) return lines;
  }

  throw new Error(
    'KKBOX 页面未包含可解析的歌词（可能需要登录或页面动态加载）。' +
    '请改用"手动粘贴"模式直接粘贴歌词文本。',
  );
}

// ── Translation helpers ────────────────────────────────────────────────────
async function gtranslate(text: string, src: string, tgt: string): Promise<string> {
  const url =
    `https://translate.googleapis.com/translate_a/single` +
    `?client=gtx&sl=${src}&tl=${tgt}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw: unknown = await res.json();
  const parts = raw as Array<Array<Array<string | null> | null>>;
  return (parts[0] ?? [])
    .filter((s): s is Array<string | null> => Array.isArray(s))
    .map(s => s[0] ?? '')
    .join('')
    .trim();
}

async function mymemory(text: string, from: string, to: string): Promise<string> {
  const url =
    `https://api.mymemory.translated.net/get` +
    `?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
  const res  = await fetch(url);
  const json = await res.json() as { responseData: { translatedText: string } };
  return json.responseData.translatedText.trim();
}

async function translate(text: string, src: string, tgt: string): Promise<string> {
  try   { return await gtranslate(text, src, tgt); }
  catch { return mymemory(text, src, tgt); }
}

export interface WordAnalysis {
  meaning: string;
  type?: string;           // 词性（挪威语返回中文：名词/动词/形容词…）
  alternatives?: string[]; // 其他常见译法
}

export async function translateWord(word: string): Promise<WordAnalysis> {
  if (!word.trim()) return { meaning: word };
  try {
    // dt=t → 主翻译  dt=bd → 双语词典（含词性）
    const url =
      `https://translate.googleapis.com/translate_a/single` +
      `?client=gtx&sl=no&tl=zh-TW&dt=t&dt=bd&q=${encodeURIComponent(word)}`;
    const res  = await fetch(url);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const raw   = await res.json() as unknown[][];

    // 主译文
    const meaning = String(
      ((raw[0] as unknown[][])?.[0] as unknown[])?.[0] ?? word,
    ).trim();

    // 词性 + 备选译法（来自 dt=bd）
    let type: string | undefined;
    const alternatives: string[] = [];
    const bd = raw[1] as unknown[][] | undefined;
    if (Array.isArray(bd)) {
      for (const entry of bd) {
        const e = entry as unknown[];
        if (!type && typeof e[0] === 'string') type = e[0] as string;
        if (Array.isArray(e[1])) {
          for (const alt of e[1] as unknown[][]) {
            const m = (alt as unknown[])[0];
            if (typeof m === 'string' && m !== meaning) alternatives.push(m);
          }
        }
      }
    }
    return { meaning, type, alternatives: alternatives.slice(0, 3) };
  } catch {
    try {
      const m = await mymemory(word, 'no', 'zh-TW');
      return { meaning: m };
    } catch {
      return { meaning: word };
    }
  }
}

// ── Timestamp distribution ─────────────────────────────────────────────────
function distributeTimestamps(count: number, duration: number): number[] {
  const start = duration * 0.08;
  const span  = duration * 0.87;
  const step  = span / Math.max(count, 1);
  return Array.from({ length: count }, (_, i) => Math.round(start + step * i));
}

// ── Core translate-and-stream logic ───────────────────────────────────────
async function translateAndStream(
  rawLines: string[],
  duration: number,
  setLines: (l: LyricLine[]) => void,
  setProgress: (p: number) => void,
  cancelRef: { current: boolean },
): Promise<LyricLine[]> {
  const timestamps = distributeTimestamps(rawLines.length, duration);
  const draft: LyricLine[] = rawLines.map((cn, i) => ({
    id: i, cn, no: '', timestamp: timestamps[i],
  }));
  setLines([...draft]);

  const filled = [...draft];
  for (let i = 0; i < filled.length; i++) {
    if (cancelRef.current) break;
    filled[i] = { ...filled[i], no: await translate(filled[i].cn, 'zh-TW', 'no') };
    setLines([...filled]);
    setProgress(Math.round(((i + 1) / filled.length) * 100));
    if (i < filled.length - 1) await new Promise(r => setTimeout(r, 120));
  }
  return filled;
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function useLyrics() {
  const [lines,    setLines]    = useState<LyricLine[]>([]);
  const [status,   setStatus]   = useState<LyricStatus>('idle');
  const [error,    setError]    = useState('');
  const [progress, setProgress] = useState(0);
  const cancelRef = { current: false };

  /** Load from KKBOX URL — scrapes + translates */
  const loadFromUrl = useCallback(async (kkboxUrl: string, duration: number) => {
    cancelRef.current = false;
    setStatus('scraping');
    setError('');
    setLines([]);
    setProgress(0);

    let rawLines: string[];
    try {
      rawLines = await scrapeKkbox(kkboxUrl);
    } catch (e) {
      setStatus('error');
      setError(e instanceof Error ? e.message : '抓取失败');
      return;
    }

    if (rawLines.length === 0) {
      setStatus('error');
      setError('页面中未找到中文歌词，请改用手动粘贴。');
      return;
    }

    setStatus('translating');
    await translateAndStream(rawLines, duration, setLines, setProgress, cancelRef);
    setStatus('ready');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Load from pasted plain text — skips scraping, goes straight to translation */
  const loadFromText = useCallback(async (rawText: string, duration: number) => {
    cancelRef.current = false;
    const rawLines = parsePlainLyrics(rawText);

    if (rawLines.length === 0) {
      setStatus('error');
      setError('未检测到中文歌词内容，请确认粘贴了歌词文本。');
      return;
    }

    setStatus('translating');
    setError('');
    setLines([]);
    setProgress(0);
    await translateAndStream(rawLines, duration, setLines, setProgress, cancelRef);
    setStatus('ready');
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reset = useCallback(() => {
    cancelRef.current = true;
    setLines([]);
    setStatus('idle');
    setError('');
    setProgress(0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { lines, status, error, progress, loadFromUrl, loadFromText, reset };
}
