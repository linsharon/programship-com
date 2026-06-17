import {
  useState, useRef, useEffect,
  type FormEvent, type ReactNode,
} from 'react';
import {
  Compass, PenTool, Trees,
  Volume2, VolumeX, CornerDownLeft,
  Play, Pause, Repeat, Loader2,
} from 'lucide-react';
import { useAudio, speakNorwegian } from '../hooks/useAudio';
import { useYouTubePlayer, extractVideoId } from '../hooks/useYouTubePlayer';
import { useLyrics, translateWord, type LyricLine } from '../hooks/useLyrics';

type TabId = 'listen' | 'forest' | 'write';

const FOREST_CONCEPTS = [
  { title: 'Snø (雪)',        desc: '挪威语对雪有极细腻的分类。Nysnø = 新雪，Slaps = 泥浆雪，Fonner = 风吹积成的雪堆。北欧人把每种雪都给了独立的名字，仿佛拒绝让任何一场降雪被遗忘。' },
  { title: 'Vind (风)',       desc: '北欧神话里，北风 Nordavinden 是奥丁的使者。现代挪威语保留了这份崇敬：Vindstille（无风时刻）常被用来形容罕见的平静，有种近乎神圣的稀缺感。' },
  { title: 'Ensomhet (孤独)', desc: '挪威语区分孤独的两种质地：Ensomhet（孤寂，无人相伴的空洞感）与 Alenetid（独处时光，主动选择的内省空间）。后者甚至被视为一种精神财富。' },
];

export default function YiJianMeiApp() {
  // ── URL inputs ─────────────────────────────────────────────────────────
  const [ytUrl,     setYtUrl]     = useState('');
  const [kkboxUrl,  setKkboxUrl]  = useState('');
  const [inputErr,  setInputErr]  = useState('');
  const [starting,  setStarting]  = useState(false);

  // ── Playback ───────────────────────────────────────────────────────────
  const [currentLine,  setCurrentLine]  = useState<number | null>(null);
  const [repeatIdx,    setRepeatIdx]    = useState<number | null>(null);
  const [showPlayer,   setShowPlayer]   = useState(true);

  // ── Norwegian TTS ──────────────────────────────────────────────────────
  const [isPlayingNo, setIsPlayingNo] = useState(false);

  // ── Word analysis ──────────────────────────────────────────────────────
  const [wordInfo, setWordInfo] = useState<{ word: string; meaning: string } | null>(null);
  const [wordLoading, setWordLoading] = useState(false);

  // ── Tabs / ambient / journal ───────────────────────────────────────────
  const [activeTab,    setActiveTab]    = useState<TabId>('listen');
  const [isMuted,      setIsMuted]      = useState(true);
  const [journalInput, setJournalInput] = useState('');
  const [aiResponse,   setAiResponse]   = useState('');

  // ── Refs ───────────────────────────────────────────────────────────────
  const repeatIdxRef     = useRef<number | null>(null);   // stable inside interval
  const playbackRef      = useRef(false);
  const norwegianModeRef = useRef(false);
  const lineRefs         = useRef<(HTMLDivElement | null)[]>([]);
  const ytContainerRef   = useRef<HTMLDivElement>(null);

  // ── Hooks ──────────────────────────────────────────────────────────────
  const { start, stop } = useAudio();
  const { initPlayer, seekAndPlay, getCurrentTime, getDuration, isReady: ytReady } =
    useYouTubePlayer(ytContainerRef);
  const { lines, status, error, progress, load, reset } = useLyrics();

  // ── Auto-scroll ────────────────────────────────────────────────────────
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

  // ── YouTube position polling + repeat logic ────────────────────────────
  useEffect(() => {
    if (!ytReady || lines.length === 0) return;
    const id = setInterval(() => {
      if (norwegianModeRef.current) return;
      const t = getCurrentTime();
      if (t <= 0) return;

      // Find current lyric line
      let active: number | null = null;
      for (let i = lines.length - 1; i >= 0; i--) {
        if (lines[i].timestamp <= t) { active = i; break; }
      }
      setCurrentLine(active);

      // Single-line repeat: seek back when the next line starts
      const ri = repeatIdxRef.current;
      if (ri !== null) {
        const nextTs = lines[ri + 1]?.timestamp ?? Infinity;
        if (t >= nextTs) seekAndPlay(lines[ri].timestamp);
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

  const handleStart = async () => {
    setInputErr('');
    const vid = extractVideoId(ytUrl);
    if (!vid)          { setInputErr('YouTube 链接无效，请粘贴完整网址。'); return; }
    if (!kkboxUrl.trim()) { setInputErr('请粘贴 KKBOX 歌曲页面链接。');    return; }

    setStarting(true);
    try {
      await initPlayer(vid);
      let dur = getDuration();
      // getDuration may be 0 immediately after onReady on some embeds
      if (dur <= 0) {
        await new Promise(r => setTimeout(r, 1200));
        dur = getDuration();
      }
      await load(kkboxUrl, dur > 0 ? dur : 240);
    } catch (e) {
      setInputErr(e instanceof Error ? e.message : '发生错误，请重试。');
    } finally {
      setStarting(false);
    }
  };

  const handleReset = () => {
    reset();
    repeatIdxRef.current = null;
    setRepeatIdx(null);
    setCurrentLine(null);
    setIsPlayingNo(false);
    setWordInfo(null);
    playbackRef.current = false;
    norwegianModeRef.current = false;
    window.speechSynthesis?.cancel();
  };

  const handleSeek = (line: LyricLine) => {
    if (!ytReady) return;
    repeatIdxRef.current = null;
    setRepeatIdx(null);
    seekAndPlay(line.timestamp);
  };

  const handleToggleRepeat = (index: number) => {
    const next = repeatIdxRef.current === index ? null : index;
    repeatIdxRef.current = next;
    setRepeatIdx(next);
    if (next !== null) seekAndPlay(lines[next].timestamp);
  };

  const handleNorwegianSingle = (line: LyricLine, index: number) => {
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

  const handleWordClick = async (word: string) => {
    const clean = word.replace(/[,.'!?，。！？]/g, '').trim();
    if (!clean || clean.length < 2) return;
    setWordInfo({ word: clean, meaning: '…' });
    setWordLoading(true);
    const meaning = await translateWord(clean);
    setWordInfo({ word: clean, meaning });
    setWordLoading(false);
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
  const isSetup    = status === 'idle'  || status === 'error';
  const isLoading  = starting           || status === 'scraping';
  const isTranslating = status === 'translating';
  const isReady    = status === 'ready';

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

            {/* ── 设置卡片 (idle / error) ── */}
            {isSetup && (
              <div className="my-auto space-y-5">
                <div>
                  <h2 className="text-lg font-light text-slate-200 mb-1">导入歌曲</h2>
                  <p className="text-xs text-slate-500">粘贴 YouTube 链接与 KKBOX 歌词页面，自动抓取并翻译成挪威语。</p>
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
                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-500 font-mono tracking-widest uppercase">KKBOX 歌词页面</label>
                    <input
                      type="text"
                      value={kkboxUrl}
                      onChange={e => setKkboxUrl(e.target.value)}
                      placeholder="https://www.kkbox.com/tw/tc/song/..."
                      className="w-full bg-slate-900/80 border border-slate-800 focus:border-emerald-900 rounded-lg px-3 py-2.5 text-sm text-slate-200 placeholder-slate-600 focus:outline-none transition-colors"
                    />
                  </div>
                  {(inputErr || error) && (
                    <p className="text-xs text-red-400 bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
                      {inputErr || error}
                    </p>
                  )}
                  <button
                    onClick={() => void handleStart()}
                    className="w-full py-2.5 rounded-xl bg-emerald-950 text-emerald-400 border border-emerald-900 hover:bg-emerald-900/40 transition-all text-sm tracking-wider"
                  >
                    抓取歌词 &amp; 翻译挪威语
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

                {/* YouTube player container — always in DOM once loaded */}
                <div className={showPlayer ? 'shrink-0' : 'hidden'}>
                  <div className="rounded-xl overflow-hidden bg-slate-900 border border-slate-800">
                    <div ref={ytContainerRef} className="w-full aspect-video" />
                  </div>
                </div>
                {/* Keep the ref alive even when hidden */}
                {!showPlayer && <div ref={ytContainerRef} className="hidden" />}

                {/* Controls row */}
                <div className="flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-3">
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
                  </div>
                  <div className="flex items-center gap-2">
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
                      onClick={handleReset}
                      className="text-[10px] text-slate-700 hover:text-slate-500 transition-colors border border-slate-800 hover:border-slate-700 px-2.5 py-1.5 rounded-full"
                    >
                      重新设置
                    </button>
                  </div>
                </div>

                {/* Lyrics list */}
                <div className="overflow-y-auto flex-1 space-y-0.5 pr-1 min-h-0">
                  {lines.map((line, index) => {
                    const isActive  = currentLine === index;
                    const isRepeat  = repeatIdx === index;
                    return (
                      <div
                        key={line.id}
                        ref={el => { lineRefs.current[index] = el; }}
                        className={`group px-4 py-3 rounded-xl transition-all duration-300 border-l-2 ${
                          isActive
                            ? 'border-emerald-500 bg-emerald-950/25'
                            : 'border-transparent hover:bg-slate-900/40 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          {/* Line number */}
                          <span className={`text-[10px] font-mono mt-0.5 shrink-0 w-5 text-right ${
                            isActive ? 'text-emerald-500' : 'text-slate-700'
                          }`}>{index + 1}</span>

                          {/* Text */}
                          <div className="flex-1 min-w-0">
                            <p className={`text-base leading-snug transition-colors ${
                              isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'
                            }`}>
                              {line.cn}
                            </p>

                            {/* Norwegian translation */}
                            <div className="flex flex-wrap gap-x-1 gap-y-0.5 mt-1 min-h-[1.2rem]">
                              {line.no ? (
                                line.no.split(' ').map((word, wi) => (
                                  <span
                                    key={wi}
                                    onClick={() => void handleWordClick(word)}
                                    className={`text-xs leading-relaxed cursor-pointer transition-colors ${
                                      wordInfo?.word === word.replace(/[,.'!?，。！？]/g, '')
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

                          {/* Per-line controls */}
                          <div className="flex items-center gap-0.5 shrink-0 mt-0.5">
                            {/* Seek YouTube */}
                            <button
                              onClick={() => handleSeek(line)}
                              title={ytReady ? `跳至 ${line.timestamp}s` : '播放器未就绪'}
                              className={`p-1.5 rounded-full transition-all ${
                                ytReady
                                  ? 'text-slate-600 hover:text-emerald-400 hover:bg-slate-800/60'
                                  : 'text-slate-800 cursor-not-allowed'
                              }`}
                            >
                              <Play size={10} />
                            </button>

                            {/* Single-line repeat */}
                            <button
                              onClick={() => handleToggleRepeat(index)}
                              title={isRepeat ? '取消循环' : '单句循环'}
                              className={`p-1.5 rounded-full transition-all ${
                                isRepeat
                                  ? 'text-emerald-400 bg-emerald-950/50'
                                  : 'text-slate-700 hover:text-emerald-500 hover:bg-slate-800/60'
                              }`}
                            >
                              <Repeat size={10} />
                            </button>

                            {/* Norwegian TTS */}
                            <button
                              onClick={() => handleNorwegianSingle(line, index)}
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

                        {/* Soundwave bars */}
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

                {/* Word analysis bubble */}
                <div className="shrink-0 min-h-[52px] p-4 rounded-xl bg-emerald-950/20 border border-emerald-900/30 text-sm text-slate-400 font-light">
                  {wordInfo ? (
                    <p className="animate-fadeIn leading-relaxed">
                      <strong className="text-emerald-400 font-medium">{wordInfo.word}</strong>
                      {wordLoading
                        ? <span className="ml-2 text-slate-600 text-xs animate-pulse">查询中…</span>
                        : <span className="text-slate-400"> — {wordInfo.meaning}</span>
                      }
                    </p>
                  ) : (
                    <p className="text-slate-700 italic text-xs text-center py-1">
                      点击挪威语单词查看中文释义 · 点 <Play size={9} className="inline mb-0.5" /> 跳到对应位置 · <Repeat size={9} className="inline mb-0.5" /> 单句循环
                    </p>
                  )}
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
      </main>

      {/* 底部导航 */}
      <footer className="p-5 flex justify-center z-10 shrink-0">
        <nav className="flex space-x-2 bg-slate-900/60 backdrop-blur-md p-1.5 rounded-full border border-slate-800/80">
          {(
            [
              { id: 'listen', icon: <Compass size={14} />, label: '歌词学习' },
              { id: 'forest', icon: <Trees size={14} />,   label: '意象森林' },
              { id: 'write',  icon: <PenTool size={14} />, label: '微写作'  },
            ] as { id: TabId; icon: ReactNode; label: string }[]
          ).map(({ id, icon, label }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex items-center space-x-2 px-4 py-2 rounded-full text-xs tracking-wider transition-all ${
                activeTab === id
                  ? 'bg-emerald-950 text-emerald-400 font-medium'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {icon}
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </footer>
    </div>
  );
}
