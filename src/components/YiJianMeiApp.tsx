import {
  useState, useRef, useEffect,
  type FormEvent, type ReactNode,
} from 'react';
import {
  Compass, PenTool, Trees, BookOpen,
  Volume2, VolumeX, CornerDownLeft,
  Play, Pause, Repeat, Loader2, X,
  Bookmark, BookmarkCheck, Trash2,
} from 'lucide-react';
import { useAudio, speakNorwegian } from '../hooks/useAudio';
import { useYouTubePlayer, extractVideoId } from '../hooks/useYouTubePlayer';
import {
  useLyrics, translateWord, parsePlainLyrics,
  type LyricLine, type WordAnalysis,
} from '../hooks/useLyrics';
import { useSongLibrary, type SongEntry } from '../hooks/useSongLibrary';

type TabId = 'listen' | 'forest' | 'write' | 'library';

interface WordTooltip {
  word: string;
  analysis: WordAnalysis | null;
  x: number;
  y: number;
  yBottom: number;
}

const FOREST_CONCEPTS = [
  { title: 'Snø (雪)',        desc: '挪威语对雪有极细腻的分类。Nysnø = 新雪，Slaps = 泥浆雪，Fonner = 风吹积成的雪堆。北欧人把每种雪都给了独立的名字，仿佛拒绝让任何一场降雪被遗忘。' },
  { title: 'Vind (风)',       desc: '北欧神话里，北风 Nordavinden 是奥丁的使者。现代挪威语保留了这份崇敬：Vindstille（无风时刻）常被用来形容罕见的平静，有种近乎神圣的稀缺感。' },
  { title: 'Ensomhet (孤独)', desc: '挪威语区分孤独的两种质地：Ensomhet（孤寂，无人相伴的空洞感）与 Alenetid（独处时光，主动选择的内省空间）。后者甚至被视为一种精神财富。' },
];

export default function YiJianMeiApp() {
  // ── URL / lyrics inputs ────────────────────────────────────────────────
  const [ytUrl,        setYtUrl]        = useState('');
  const [kkboxUrl,     setKkboxUrl]     = useState('');
  const [manualLyrics, setManualLyrics] = useState('');
  const [lyricsMode,   setLyricsMode]   = useState<'url' | 'paste'>('url');
  const [inputErr,     setInputErr]     = useState('');
  const [starting,     setStarting]     = useState(false);

  // ── Playback ───────────────────────────────────────────────────────────
  const [currentLine,  setCurrentLine]  = useState<number | null>(null);
  const [repeatIdx,    setRepeatIdx]    = useState<number | null>(null);
  const [showPlayer,   setShowPlayer]   = useState(true);
  const [offsetDelta,  setOffsetDelta]  = useState(0);

  // ── Norwegian TTS ──────────────────────────────────────────────────────
  const [isPlayingNo, setIsPlayingNo] = useState(false);

  // ── Word tooltip ───────────────────────────────────────────────────────
  const [wordTooltip, setWordTooltip] = useState<WordTooltip | null>(null);
  const [wordLoading, setWordLoading] = useState(false);

  // ── Library save feedback ──────────────────────────────────────────────
  const [justSaved, setJustSaved] = useState(false);

  // ── Deferred player init (needed when loading from library) ───────────
  const [pendingVideoId, setPendingVideoId] = useState<string | null>(null);

  // ── Tabs / ambient / journal ───────────────────────────────────────────
  const [activeTab,    setActiveTab]    = useState<TabId>('listen');
  const [isMuted,      setIsMuted]      = useState(true);
  const [journalInput, setJournalInput] = useState('');
  const [aiResponse,   setAiResponse]   = useState('');

  // ── Refs ───────────────────────────────────────────────────────────────
  const repeatIdxRef     = useRef<number | null>(null);
  const playbackRef      = useRef(false);
  const norwegianModeRef = useRef(false);
  const offsetDeltaRef   = useRef(0);
  const lineRefs         = useRef<(HTMLDivElement | null)[]>([]);
  const ytContainerRef   = useRef<HTMLDivElement>(null);
  const tooltipRef       = useRef<HTMLDivElement>(null);

  // ── Hooks ──────────────────────────────────────────────────────────────
  const { start, stop } = useAudio();
  const { initPlayer, seekAndPlay, getCurrentTime, getDuration, isReady: ytReady } =
    useYouTubePlayer(ytContainerRef);
  const { lines, status, error, progress, loadFromUrl, loadFromText, reset, loadFromSaved } =
    useLyrics();
  const { entries: library, save: saveEntry, remove: removeEntry } = useSongLibrary();

  // ── Auto-scroll active lyric line ──────────────────────────────────────
  useEffect(() => {
    if (currentLine !== null)
      lineRefs.current[currentLine]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [currentLine]);

  // ── Cancel Norwegian TTS when leaving listen tab ───────────────────────
  useEffect(() => {
    if (activeTab !== 'listen') {
      playbackRef.current = false;
      norwegianModeRef.current = false;
      window.speechSynthesis?.cancel();
      setIsPlayingNo(false);
      setCurrentLine(null);
    }
  }, [activeTab]);

  // ── Close word tooltip on outside click ───────────────────────────────
  useEffect(() => {
    if (!wordTooltip) return;
    const handler = (e: globalThis.MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node))
        setWordTooltip(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [wordTooltip]);

  // ── Deferred player init after library load ────────────────────────────
  // After loadFromSaved sets status='ready', React re-renders and the
  // ytContainerRef div enters the DOM. This effect fires after that render.
  useEffect(() => {
    if (!pendingVideoId) return;
    const vid = pendingVideoId;
    setPendingVideoId(null);
    void initPlayer(vid);
  }, [pendingVideoId, initPlayer]);

  // ── YouTube position polling + repeat logic ────────────────────────────
  useEffect(() => {
    if (!ytReady || lines.length === 0) return;
    const id = setInterval(() => {
      if (norwegianModeRef.current) return;
      const t = getCurrentTime();
      if (t <= 0) return;

      const off = offsetDeltaRef.current;
      let active: number | null = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].timestamp + off <= t) { active = i; break; }
      }
      setCurrentLine(active);

      const ri = repeatIdxRef.current;
      if (ri !== null) {
        const nextTs = (lines[ri + 1]?.timestamp ?? Infinity) + off;
        if (t >= nextTs) seekAndPlay(lines[ri].timestamp + off);
      }
    }, 300);
    return () => clearInterval(id);
  }, [ytReady, lines, getCurrentTime, seekAndPlay]);

  // ── Cleanup on unmount ────────────────────────────────────────────────
  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    playbackRef.current = false;
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────────
  const handleMuteToggle = () => {
    if (isMuted) { start(); setIsMuted(false); }
    else          { stop();  setIsMuted(true);  }
  };

  const doReset = () => {
    reset();
    repeatIdxRef.current = null;
    offsetDeltaRef.current = 0;
    setRepeatIdx(null);
    setCurrentLine(null);
    setIsPlayingNo(false);
    setWordTooltip(null);
    setOffsetDelta(0);
    setJustSaved(false);
    playbackRef.current = false;
    norwegianModeRef.current = false;
    window.speechSynthesis?.cancel();
  };

  const handleStart = async () => {
    setInputErr('');
    const vid = extractVideoId(ytUrl);
    if (!vid) { setInputErr('YouTube 链接无效，请粘贴完整网址。'); return; }

    if (lyricsMode === 'url' && !kkboxUrl.trim()) {
      setInputErr('请粘贴 KKBOX 歌曲页面链接，或切换到「手动粘贴」模式。');
      return;
    }
    if (lyricsMode === 'paste' && parsePlainLyrics(manualLyrics).length === 0) {
      setInputErr('请粘贴歌词文本（每行一句，需含中文）。');
      return;
    }

    setStarting(true);
    try {
      await initPlayer(vid);
      let dur = getDuration();
      if (dur <= 0) {
        await new Promise(r => setTimeout(r, 1200));
        dur = getDuration();
      }
      const duration = dur > 0 ? dur : 240;
      if (lyricsMode === 'url') {
        await loadFromUrl(kkboxUrl, duration);
      } else {
        await loadFromText(manualLyrics, duration);
      }
    } catch (e) {
      setInputErr(e instanceof Error ? e.message : '发生错误，请重试。');
    } finally {
      setStarting(false);
    }
  };

  const handleSeek = (line: LyricLine) => {
    if (!ytReady) return;
    repeatIdxRef.current = null;
    setRepeatIdx(null);
    seekAndPlay(line.timestamp + offsetDeltaRef.current);
  };

  const handleToggleRepeat = (e: { stopPropagation(): void }, index: number) => {
    e.stopPropagation();
    const next = repeatIdxRef.current === index ? null : index;
    repeatIdxRef.current = next;
    setRepeatIdx(next);
    if (next !== null) seekAndPlay(lines[next].timestamp + offsetDeltaRef.current);
  };

  const handleNorwegianSingle = (e: { stopPropagation(): void }, line: LyricLine, index: number) => {
    e.stopPropagation();
    window.speechSynthesis?.cancel();
    playbackRef.current = false;
    norwegianModeRef.current = false;
    setIsPlayingNo(false);
    repeatIdxRef.current = null;
    setRepeatIdx(null);
    setCurrentLine(index);
    speakNorwegian(line.no || line.cn, () => {
      if (!norwegianModeRef.current) setCurrentLine(null);
    });
  };

  const handlePlayNorwegian = async () => {
    if (isPlayingNo) {
      window.speechSynthesis?.cancel();
      playbackRef.current = false;
      norwegianModeRef.current = false;
      setIsPlayingNo(false);
      setCurrentLine(null);
      return;
    }
    setIsPlayingNo(true);
    playbackRef.current = true;
    norwegianModeRef.current = true;

    for (let i = 0; i < lines.length; i++) {
      if (!playbackRef.current) break;
      setCurrentLine(i);
      await new Promise<void>(res => speakNorwegian(lines[i].no || lines[i].cn, res));
      if (!playbackRef.current) break;
      await new Promise(r => setTimeout(r, 350));
    }

    if (playbackRef.current) { setIsPlayingNo(false); setCurrentLine(null); }
    playbackRef.current = false;
    norwegianModeRef.current = false;
  };

  const handleWordClick = async (
    word: string,
    e: { stopPropagation(): void; currentTarget: EventTarget | null },
  ) => {
    e.stopPropagation();
    const clean = word.replace(/[,.'!?，。！？]/g, '').trim();
    if (!clean || clean.length < 2) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setWordTooltip({ word: clean, analysis: null, x: rect.left, y: rect.top, yBottom: rect.bottom });
    setWordLoading(true);
    const analysis = await translateWord(clean);
    setWordTooltip(prev => prev?.word === clean ? { ...prev, analysis } : prev);
    setWordLoading(false);
  };

  const handleAdjustOffset = (delta: number) => {
    const next = offsetDeltaRef.current + delta;
    offsetDeltaRef.current = next;
    setOffsetDelta(next);
  };

  const handleSave = () => {
    if (!lines.length) return;
    const title = lines[0].cn.slice(0, 18);
    saveEntry(title, ytUrl, lines);
    setJustSaved(true);
    setTimeout(() => setJustSaved(false), 2500);
  };

  const handleLoadSaved = (entry: SongEntry) => {
    const vid = extractVideoId(entry.ytUrl);
    setYtUrl(entry.ytUrl);
    setActiveTab('listen');
    doReset();
    loadFromSaved(entry.lines);
    if (vid) setPendingVideoId(vid);
  };

  const handleWriteSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!journalInput.trim()) return;
    setAiResponse(
      'Vintersnøen gjemmer alt, men den gjemmer ikke din sjel. ' +
      '（冬雪掩盖了一切，但掩盖不了你的灵魂。此时此刻，北风亦在为你伴奏。）',
    );
  };

  // ── Derived ──────────────────────────────────────────────────────────
  const isSetup       = status === 'idle'  || status === 'error';
  const isLoading     = starting           || status === 'scraping';
  const isTranslating = status === 'translating';
  const isReady       = status === 'ready';

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden flex flex-col selection:bg-emerald-800 selection:text-emerald-100">

      {/* 飘雪背景 */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[10%]  w-2   h-2   bg-white rounded-full animate-[ping_4s_infinite]" />
        <div className="absolute top-[-5%]  left-[40%]  w-1.5 h-1.5 bg-white rounded-full animate-[ping_6s_infinite]" />
        <div className="absolute top-[-12%] left-[75%]  w-2   h-2   bg-white rounded-full animate-[ping_5s_infinite]" />
        <div className="absolute top-[20%]  left-[25%]  w-1   h-1   bg-white rounded-full opacity-50" />
        <div className="absolute top-[50%]  left-[80%]  w-1.5 h-1.5 bg-white rounded-full opacity-40" />
      </div>

      {/* Floating word tooltip */}
      {wordTooltip && (
        <div
          ref={tooltipRef}
          style={{
            position: 'fixed',
            left: Math.min(Math.max(wordTooltip.x, 8), window.innerWidth - 272),
            top: wordTooltip.y > 200 ? wordTooltip.y - 8 : wordTooltip.yBottom + 8,
            transform: wordTooltip.y > 200 ? 'translateY(-100%)' : 'none',
            zIndex: 50,
          }}
          className="w-64 p-3 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/60 animate-fadeIn"
        >
          <div className="flex items-start justify-between mb-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-emerald-400 font-medium text-base">{wordTooltip.word}</span>
              {wordTooltip.analysis?.type && (
                <span className="text-[10px] text-slate-500 font-mono bg-slate-800 px-1.5 py-0.5 rounded">
                  {wordTooltip.analysis.type}
                </span>
              )}
            </div>
            <button
              onClick={() => setWordTooltip(null)}
              className="text-slate-600 hover:text-slate-400 transition-colors shrink-0 mt-0.5 ml-2"
            >
              <X size={12} />
            </button>
          </div>
          {wordLoading ? (
            <p className="text-xs text-slate-600 animate-pulse">查询中…</p>
          ) : wordTooltip.analysis ? (
            <div className="space-y-1.5">
              <p className="text-sm text-slate-300">{wordTooltip.analysis.meaning}</p>
              {(wordTooltip.analysis.alternatives ?? []).length > 0 && (
                <p className="text-xs text-slate-500">
                  亦可译：{(wordTooltip.analysis.alternatives ?? []).join('、')}
                </p>
              )}
            </div>
          ) : null}
          <button
            onClick={() => speakNorwegian(wordTooltip.word)}
            className="mt-2.5 flex items-center gap-1.5 text-xs text-slate-500 hover:text-emerald-400 transition-colors"
          >
            <Volume2 size={11} />
            <span>朗读挪威语</span>
          </button>
        </div>
      )}

      {/* 顶栏 */}
      <header className="p-5 flex justify-between items-center z-10 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]" />
          <span className="text-sm tracking-widest text-slate-400 font-light">PROSJEKT VINTERSNØ // 歌词学习</span>
        </div>
        <button
          onClick={handleMuteToggle}
          className="p-2 rounded-full hover:bg-slate-900 transition-colors text-slate-400 hover:text-slate-200"
          title={isMuted ? '开启北风环境音' : '静音'}
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} className="text-emerald-400" />}
        </button>
      </header>

      {/* 主区域 */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-5 py-4 flex flex-col z-10 min-h-0">

        {/* ── Tab 1: 歌词学习 ── */}
        {activeTab === 'listen' && (
          <div className="flex flex-col gap-3 h-full animate-fadeIn">

            {/* YouTube container — always mounted in listen tab so initPlayer finds a live DOM node */}
            <div
              ref={ytContainerRef}
              style={{ display: (isTranslating || isReady) && showPlayer ? 'block' : 'none' }}
              className="shrink-0 rounded-xl overflow-hidden bg-slate-900 border border-slate-800 w-full aspect-video"
            />

            {/* ── 设置卡片 (idle / error) ── */}
            {isSetup && (
              <div className="my-auto space-y-5">
                <div>
                  <h2 className="text-lg font-light text-slate-200 mb-1">导入歌曲</h2>
                  <p className="text-xs text-slate-500">选择歌词来源，自动翻译成挪威语并对齐歌曲。</p>
                </div>
                <div className="space-y-3">

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">YouTube 链接</label>
                    <input
                      type="text"
                      value={ytUrl}
                      onChange={e => setYtUrl(e.target.value)}
                      placeholder="https://www.youtube.com/watch?v=..."
                      className="w-full bg-slate-900/80 border border-slate-800 focus:border-emerald-900 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition-colors"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-1 p-1 bg-slate-900/60 rounded-lg border border-slate-800/60 w-fit">
                      {(['url', 'paste'] as const).map(mode => (
                        <button
                          key={mode}
                          onClick={() => { setLyricsMode(mode); setInputErr(''); }}
                          className={`px-3 py-1.5 rounded-md text-xs transition-all ${
                            lyricsMode === mode
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-900'
                              : 'text-slate-500 hover:text-slate-300'
                          }`}
                        >
                          {mode === 'url' ? 'KKBOX 链接' : '手动粘贴歌词'}
                        </button>
                      ))}
                    </div>

                    {lyricsMode === 'url' ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={kkboxUrl}
                          onChange={e => setKkboxUrl(e.target.value)}
                          placeholder="https://www.kkbox.com/tw/tc/song/..."
                          className="w-full bg-slate-900/80 border border-slate-800 focus:border-emerald-900 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition-colors"
                        />
                        <p className="text-[10px] text-slate-700">
                          若提取失败（登录限制/动态加载），请切换到「手动粘贴」。
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <textarea
                          value={manualLyrics}
                          onChange={e => setManualLyrics(e.target.value)}
                          placeholder={"在此粘贴歌词文本，每行一句。\n支持 LRC 格式或纯文本。\n\n例：\n雪花飘飘，北风萧萧\n天地一片苍茫\n一剪寒梅，傲立雪中"}
                          rows={8}
                          className="w-full bg-slate-900/80 border border-slate-800 focus:border-emerald-900 rounded-lg px-3 py-2.5 text-sm text-slate-300 placeholder-slate-700 focus:outline-none transition-colors resize-none font-light leading-relaxed"
                        />
                        {manualLyrics && (
                          <p className="text-[10px] text-emerald-700">
                            检测到 {parsePlainLyrics(manualLyrics).length} 行中文歌词
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {(inputErr || error) && (
                    <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2 leading-relaxed">
                      {inputErr || error}
                    </p>
                  )}
                  <button
                    onClick={() => void handleStart()}
                    className="w-full py-2.5 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-900 hover:bg-emerald-900/40 transition-all text-sm tracking-wider"
                  >
                    开始翻译 &amp; 对齐歌曲
                  </button>
                </div>
              </div>
            )}

            {/* ── 加载中 ── */}
            {isLoading && (
              <div className="my-auto flex flex-col items-center gap-4 text-slate-400">
                <Loader2 size={28} className="animate-spin text-emerald-500" />
                <p className="text-sm">正在加载 YouTube 播放器…</p>
              </div>
            )}

            {/* ── 翻译中 + 歌词区 ── */}
            {(isTranslating || isReady) && (
              <div className="flex flex-col gap-3 h-full">

                {/* Controls row */}
                <div className="flex items-center justify-between shrink-0 flex-wrap gap-y-2">
                  <div className="flex items-center gap-3 flex-wrap">
                    <button
                      onClick={() => setShowPlayer(v => !v)}
                      className="text-[10px] text-slate-600 hover:text-slate-400 transition-colors"
                    >
                      {showPlayer ? '收起播放器 ↑' : '展开播放器 ↓'}
                    </button>

                    {isTranslating && (
                      <span className="text-[10px] text-emerald-600 font-mono flex items-center gap-1">
                        <Loader2 size={9} className="animate-spin" />
                        翻译中 {progress}%
                      </span>
                    )}

                    {/* Timing offset controls */}
                    <div className="flex items-center gap-1">
                      <span className="text-[10px] text-slate-600">对齐</span>
                      <button
                        onClick={() => handleAdjustOffset(-5)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-500 hover:text-slate-300 transition-colors"
                      >−5s</button>
                      <span className="text-[10px] text-slate-500 font-mono w-8 text-center">
                        {offsetDelta > 0 ? '+' : ''}{offsetDelta}s
                      </span>
                      <button
                        onClick={() => handleAdjustOffset(5)}
                        className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-500 hover:text-slate-300 transition-colors"
                      >+5s</button>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Save to library */}
                    {isReady && (
                      <button
                        onClick={handleSave}
                        title="保存到歌单"
                        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs border transition-all ${
                          justSaved
                            ? 'bg-emerald-950 text-emerald-400 border-emerald-900'
                            : 'bg-slate-900/80 text-slate-500 border-slate-800 hover:text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        {justSaved ? <BookmarkCheck size={11} /> : <Bookmark size={11} />}
                        <span>{justSaved ? '已保存' : '保存'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => void handlePlayNorwegian()}
                      disabled={isTranslating && lines.filter(l => l.no).length === 0}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs tracking-wider border transition-all ${
                        isPlayingNo
                          ? 'bg-emerald-950 text-emerald-400 border-emerald-900'
                          : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700 disabled:opacity-30'
                      }`}
                    >
                      {isPlayingNo ? <Pause size={10} /> : <Play size={10} />}
                      <span>{isPlayingNo ? '暂停' : '全文朗读'}</span>
                    </button>
                    <button
                      onClick={doReset}
                      className="text-[10px] text-slate-700 hover:text-slate-500 transition-colors border border-slate-800 hover:border-slate-700 px-2.5 py-1.5 rounded-full"
                    >
                      重新设置
                    </button>
                  </div>
                </div>

                {/* Lyrics list — clicking any row seeks to that line */}
                <div className="overflow-y-auto flex-1 space-y-0.5 pr-1 min-h-0">
                  {lines.map((line, index) => {
                    const isActive = currentLine === index;
                    const isRepeat = repeatIdx === index;
                    return (
                      <div
                        key={line.id}
                        ref={el => { lineRefs.current[index] = el; }}
                        onClick={() => handleSeek(line)}
                        className={`group px-4 py-3 rounded-xl transition-all duration-300 border-l-2 cursor-pointer select-none ${
                          isActive
                            ? 'border-emerald-500 bg-emerald-950/25'
                            : 'border-transparent hover:bg-slate-900/40 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <span className={`text-[10px] font-mono mt-0.5 shrink-0 w-5 text-right ${
                            isActive ? 'text-emerald-500' : 'text-slate-700'
                          }`}>{index + 1}</span>

                          <div className="flex-1 min-w-0">
                            <p className={`text-base leading-snug transition-colors ${
                              isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'
                            }`}>
                              {line.cn}
                            </p>

                            <div className="flex flex-wrap gap-x-1 gap-y-0.5 mt-1 min-h-[1.2rem]">
                              {line.no ? (
                                line.no.split(' ').map((word, wi) => (
                                  <span
                                    key={wi}
                                    onClick={e => void handleWordClick(word, e)}
                                    className={`text-xs leading-relaxed cursor-pointer transition-colors select-text ${
                                      wordTooltip?.word === word.replace(/[,.'!?，。！？]/g, '')
                                        ? 'text-emerald-400 underline underline-offset-2'
                                        : isActive
                                          ? 'text-slate-400 hover:text-emerald-400'
                                          : 'text-slate-600 hover:text-slate-400'
                                    }`}
                                  >
                                    {word}
                                  </span>
                                ))
                              ) : (
                                <span className="text-[11px] text-slate-700 italic animate-pulse">翻译中…</span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                            <button
                              onClick={e => { e.stopPropagation(); handleSeek(line); }}
                              title={ytReady ? `跳至 ${line.timestamp + offsetDelta}s` : '播放器未就绪'}
                              className={`p-1.5 rounded-full transition-all ${
                                ytReady
                                  ? 'text-slate-600 hover:text-emerald-400 hover:bg-slate-800/60'
                                  : 'text-slate-800 cursor-not-allowed'
                              }`}
                            >
                              <Play size={10} />
                            </button>
                            <button
                              onClick={e => handleToggleRepeat(e, index)}
                              title={isRepeat ? '取消循环' : '单句循环'}
                              className={`p-1.5 rounded-full transition-all ${
                                isRepeat
                                  ? 'text-emerald-400 bg-emerald-950/50'
                                  : 'text-slate-700 hover:text-emerald-500 hover:bg-slate-800/60'
                              }`}
                            >
                              <Repeat size={10} />
                            </button>
                            <button
                              onClick={e => handleNorwegianSingle(e, line, index)}
                              title="朗读挪威语"
                              className={`p-1.5 rounded-full transition-all ${
                                isActive && !isPlayingNo
                                  ? 'text-emerald-400 animate-pulse'
                                  : 'text-slate-700 hover:text-emerald-500 hover:bg-slate-800/60'
                              }`}
                            >
                              <Volume2 size={10} />
                            </button>
                          </div>
                        </div>

                        {isActive && (
                          <div className="mt-2 ml-8 flex gap-0.5 items-end h-3">
                            {[0, 1, 2, 3, 4].map(i => (
                              <div
                                key={i}
                                className="w-0.5 bg-emerald-500 rounded-full opacity-70 animate-soundwave"
                                style={{ animationDelay: `${i * 0.14}s` }}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Tab 2: 意象森林 ── */}
        {activeTab === 'forest' && (
          <div className="grid md:grid-cols-3 gap-6 my-auto animate-fadeIn">
            {FOREST_CONCEPTS.map((concept, index) => (
              <div
                key={index}
                className="p-6 rounded-2xl bg-slate-900/40 border border-slate-900 hover:border-emerald-950 transition-all flex flex-col space-y-4"
              >
                <div>
                  <span className="text-xs text-emerald-500 uppercase tracking-widest font-mono">挪威语意象 {index + 1}</span>
                  <div className="flex items-center justify-between mt-1">
                    <h3 className="text-xl font-light text-slate-200">{concept.title}</h3>
                    <button
                      onClick={() => speakNorwegian(concept.title.split(' ')[0])}
                      title="听发音"
                      className="p-1.5 rounded-full text-slate-600 hover:text-emerald-500 hover:bg-slate-800 transition-all"
                    >
                      <Volume2 size={13} />
                    </button>
                  </div>
                  <p className="text-sm text-slate-400 mt-3 font-light leading-relaxed">{concept.desc}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Tab 3: 微写作 ── */}
        {activeTab === 'write' && (
          <div className="max-w-xl w-full mx-auto space-y-6 my-auto animate-fadeIn">
            <div className="space-y-2">
              <h2 className="text-lg font-light text-slate-300">Skriveplass // 微写作空间</h2>
              <p className="text-xs text-slate-500">借用今日歌词里的北欧意境，记录此刻的感受。允许中挪混杂，自由落笔。</p>
            </div>
            <form onSubmit={handleWriteSubmit} className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 focus-within:border-emerald-900 transition-all">
                <div className="text-sm text-emerald-500/70 font-mono mb-2">
                  I kveld suser nordavinden, og jeg føler...
                </div>
                <textarea
                  value={journalInput}
                  onChange={e => setJournalInput(e.target.value)}
                  placeholder="在这里输入你的情绪碎片..."
                  className="w-full bg-transparent border-none text-slate-200 placeholder-slate-600 focus:outline-none resize-none h-28 text-sm font-light leading-relaxed"
                />
                <div className="flex justify-end">
                  <button type="submit" className="flex items-center space-x-1 text-xs text-emerald-400 hover:text-emerald-300 transition-colors">
                    <span>寄出给森林</span>
                    <CornerDownLeft size={12} />
                  </button>
                </div>
              </div>
            </form>
            {aiResponse && (
              <div className="p-5 rounded-xl bg-emerald-950/10 border border-emerald-900/20 text-sm font-light text-slate-400 leading-relaxed animate-fadeIn">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-emerald-500 font-mono">来自森林木屋的回响：</span>
                  <button
                    onClick={() => speakNorwegian(aiResponse.split('（')[0].trim())}
                    className="p-1 rounded-full text-slate-600 hover:text-emerald-500 transition-all"
                  >
                    <Volume2 size={12} />
                  </button>
                </div>
                {aiResponse}
              </div>
            )}
          </div>
        )}

        {/* ── Tab 4: 我的歌单 ── */}
        {activeTab === 'library' && (
          <div className="flex flex-col gap-4 h-full animate-fadeIn">
            <div className="shrink-0">
              <h2 className="text-lg font-light text-slate-200">我的歌单</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                {library.length === 0
                  ? '还没有保存的歌曲。在歌词学习页面翻译完成后点击「保存」。'
                  : `已保存 ${library.length} 首歌曲，点击「加载」可直接恢复，无需重新翻译。`}
              </p>
            </div>

            <div className="overflow-y-auto flex-1 space-y-3 min-h-0">
              {library.map(entry => (
                <div
                  key={entry.id}
                  className="p-4 rounded-xl bg-slate-900/50 border border-slate-800 hover:border-slate-700 transition-all"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-slate-200 font-light truncate">{entry.title}</p>
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        {entry.lines.length} 行歌词 · {new Date(entry.savedAt).toLocaleDateString('zh-TW')}
                      </p>
                      <p className="text-[10px] text-slate-700 font-mono mt-0.5 truncate">
                        {entry.ytUrl}
                      </p>
                    </div>
                    <button
                      onClick={() => removeEntry(entry.id)}
                      title="删除"
                      className="p-1.5 rounded-full text-slate-700 hover:text-red-400 hover:bg-red-950/30 transition-all shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>

                  <button
                    onClick={() => handleLoadSaved(entry)}
                    className="mt-3 w-full py-1.5 rounded-lg bg-emerald-950/60 text-emerald-400 border border-emerald-900/60 hover:bg-emerald-900/40 transition-all text-xs tracking-wider flex items-center justify-center gap-1.5"
                  >
                    <Play size={10} />
                    加载这首歌
                  </button>
                </div>
              ))}

              {library.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 gap-3 text-slate-700">
                  <BookOpen size={32} className="opacity-40" />
                  <p className="text-sm">歌单是空的</p>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* 底部导航 */}
      <footer className="p-5 flex justify-center z-10 shrink-0">
        <nav className="flex space-x-1.5 bg-slate-900/60 backdrop-blur-md p-1.5 rounded-full border border-slate-800/80">
          {(
            [
              { id: 'listen',  icon: <Compass size={14} />,  label: '歌词学习' },
              { id: 'forest',  icon: <Trees size={14} />,    label: '意象森林' },
              { id: 'write',   icon: <PenTool size={14} />,  label: '微写作'  },
              { id: 'library', icon: <BookOpen size={14} />, label: '我的歌单',
                badge: library.length > 0 ? library.length : undefined },
            ] as { id: TabId; icon: ReactNode; label: string; badge?: number }[]
          ).map(({ id, icon, label, badge }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`relative flex items-center space-x-2 px-3.5 py-2 rounded-full text-xs tracking-wider transition-all ${
                activeTab === id
                  ? 'bg-emerald-950 text-emerald-400 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {icon}
              <span>{label}</span>
              {badge !== undefined && (
                <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-emerald-600 text-white text-[9px] flex items-center justify-center font-mono">
                  {badge > 9 ? '9+' : badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </footer>
    </div>
  );
}
