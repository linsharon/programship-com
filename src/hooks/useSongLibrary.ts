import { useState, useCallback } from 'react';
import type { LyricLine } from './useLyrics';

export interface SongEntry {
  id: string;
  title: string;
  ytUrl: string;
  lines: LyricLine[];
  savedAt: number;
}

const KEY = 'vintersnow_library';
const MAX = 50;

function readLib(): SongEntry[] {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') as SongEntry[]; }
  catch { return []; }
}

function writeLib(entries: SongEntry[]) {
  try { localStorage.setItem(KEY, JSON.stringify(entries)); }
  catch { /* quota exceeded */ }
}

export function useSongLibrary() {
  const [entries, setEntries] = useState<SongEntry[]>(readLib);

  const save = useCallback((title: string, ytUrl: string, lines: LyricLine[]): void => {
    const entry: SongEntry = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      title,
      ytUrl,
      lines,
      savedAt: Date.now(),
    };
    setEntries(prev => {
      const next = [entry, ...prev].slice(0, MAX);
      writeLib(next);
      return next;
    });
  }, []);

  const remove = useCallback((id: string) => {
    setEntries(prev => {
      const next = prev.filter(e => e.id !== id);
      writeLib(next);
      return next;
    });
  }, []);

  return { entries, save, remove };
}
