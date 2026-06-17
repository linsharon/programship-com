import { useState, useCallback } from 'react';

export interface LyricLine {
  id: number;
  cn: string;
  no: string;
  timestamp: number;
}

export type LyricStatus = 'idle' | 'scraping' | 'translating' | 'ready' | 'error';

// ── CORS proxies (try in order) ────────────────────────────────────────────
const PROXIES = [
  (u: string) => `https://corsproxy.io/?${encodeURIComponent(u)}`,
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`,
];

async function fetchViaProxy(url: string): Promise<string> {
  for (const makeUrl of PROXIES) {
    try {
      const res = await fetch(makeUrl(url));
      if (res.ok) return res.text();
    } catch { /* try next */ }
  }
  throw new Error('无法通过代理访问该页面，请检查网络。');
}

// ── Deep-search helper for Next.js __NEXT_DATA__ ──────────────────────────
function deepFind(obj: unknown, key: string, depth = 0): unknown {
  if (depth > 10 || obj === null || typeof obj !== 'object') return undefined;
  if (Array.isArray(obj)) {
    for (const v of obj) {
      const found = deepFind(v, key, depth + 1);
      if (found !== undefined) return found;
    }
  } else {
    const rec = obj as Record<string, unknown>;
    if (key in rec && rec[key]) return rec[key];
    for (const v of Object.values(rec)) {
      const found = deepFind(v, key, depth + 1);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

function isChinese(text: string) { return /[一-鿿]/.test(text); }

function toLines(raw: string): string[] {
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0 && isChinese(l));
}

async function scrapeKkbox(url: string): Promise<string[]> {
  const html = await fetchViaProxy(url);
  const doc  = new DOMParser().parseFromString(html, 'text/html');

  // Strategy 1: KKBOX Next.js SSR data
  const nxt = doc.querySelector('#__NEXT_DATA__');
  if (nxt?.textContent) {
    try {
      const data: unknown = JSON.parse(nxt.textContent);
      const raw = deepFind(data, 'lyrics') ?? deepFind(data, 'lyric');
      if (typeof raw === 'string' && isChinese(raw)) {
        const lines = toLines(raw);
        if (lines.length > 2) return lines;
      }
    } catch { /* fall through */ }
  }

  // Strategy 2: common CSS selectors
  const selectors = [
    '.lyrics p', '#lyrics p',
    '[class*="lyric"] p', '[class*="Lyric"] p',
    '.lyrics', '#lyrics', '[class*="lyric"]',
  ];
  for (const sel of selectors) {
    const el = doc.querySelector(sel);
    if (!el) continue;
    const lines = toLines(el.innerHTML);
    if (lines.length > 2) return lines;
  }

  // Strategy 3: heuristic – find element with most Chinese chars
  let bestEl: Element | null = null;
  let bestScore = 0;
  for (const el of doc.querySelectorAll('p, div, section')) {
    if (el.children.length > 50) continue;
    const text  = el.textContent ?? '';
    const score = (text.match(/[一-鿿]/g)?.length ?? 0) * 2
                + text.split('\n').filter(l => l.trim()).length;
    if (score > bestScore) { bestScore = score; bestEl = el; }
  }
  if (bestEl && bestScore > 30) {
    const lines = toLines((bestEl as HTMLElement).innerHTML);
    if (lines.length > 2) return lines;
  }

  throw new Error('未能从 KKBOX 页面解析到歌词，请确认链接为歌曲详情页。');
}

// ── Translation helpers ────────────────────────────────────────────────────
async function gtranslate(text: string, src: string, tgt: string): Promise<string> {
  const url = `https://translate.googleapis.com/translate_a/single`
            + `?client=gtx&sl=${src}&tl=${tgt}&dt=t&q=${encodeURIComponent(text)}`;
  const res  = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const raw: unknown = await res.json();
  // raw[0] is an array of [translated, original, ...] pairs
  const parts = raw as Array<Array<Array<string | null> | null>>;
  return (parts[0] ?? [])
    .filter((seg): seg is Array<string | null> => Array.isArray(seg))
    .map(seg => seg[0] ?? '')
    .join('')
    .trim();
}

async function mymemory(text: string, from: string, to: string): Promise<string> {
  const url = `https://api.mymemory.translated.net/get`
            + `?q=${encodeURIComponent(text)}&langpair=${from}|${to}`;
  const res  = await fetch(url);
  const json = await res.json() as { responseData: { translatedText: string } };
  return json.responseData.translatedText.trim();
}

async function translate(text: string, src: string, tgt: string): Promise<string> {
  try   { return await gtranslate(text, src, tgt); }
  catch { return mymemory(text, src, tgt); }
}

/** Translate a Norwegian word to Chinese for the word-explanation panel */
export async function translateWord(word: string): Promise<string> {
  if (!word.trim()) return '';
  return translate(word, 'no', 'zh-TW');
}

function distributeTimestamps(count: number, duration: number): number[] {
  // Leave 8% intro + 5% outro; distribute remaining evenly
  const start = duration * 0.08;
  const span  = duration * 0.87;
  const step  = span / Math.max(count, 1);
  return Array.from({ length: count }, (_, i) => Math.round(start + step * i));
}

// ── Hook ──────────────────────────────────────────────────────────────────
export function useLyrics() {
  const [lines,  setLines]  = useState<LyricLine[]>([]);
  const [status, setStatus] = useState<LyricStatus>('idle');
  const [error,  setError]  = useState('');
  const [progress, setProgress] = useState(0);  // 0-100

  const load = useCallback(async (kkboxUrl: string, duration: number) => {
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
      setError('未找到中文歌词，请确认 KKBOX 链接。');
      return;
    }

    const timestamps = distributeTimestamps(rawLines.length, duration);

    // Seed lines with empty `no` so the list renders immediately
    const draft: LyricLine[] = rawLines.map((cn, i) => ({
      id: i, cn, no: '', timestamp: timestamps[i],
    }));
    setLines(draft);
    setStatus('translating');

    // Translate one by one, streaming into state
    const filled = [...draft];
    for (let i = 0; i < filled.length; i++) {
      filled[i] = { ...filled[i], no: await translate(filled[i].cn, 'zh-TW', 'no') };
      setLines([...filled]);
      setProgress(Math.round(((i + 1) / filled.length) * 100));
      // Tiny delay to avoid rate-limiting
      if (i < filled.length - 1) await new Promise(r => setTimeout(r, 120));
    }

    setStatus('ready');
  }, []);

  const reset = useCallback(() => {
    setLines([]);
    setStatus('idle');
    setError('');
    setProgress(0);
  }, []);

  return { lines, status, error, progress, load, reset };
}
