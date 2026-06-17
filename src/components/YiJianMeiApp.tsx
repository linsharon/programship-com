import { useState, useRef, useEffect, type FormEvent, type ReactNode } from 'react';
import {
  Compass, PenTool, Trees, Volume2, VolumeX,
  CornerDownLeft, Play, Pause,
} from 'lucide-react';
import { useAudio, speakNorwegian, speakChinese } from '../hooks/useAudio';

interface AnalysisItem {
  word: string;
  detail: string;
}

interface LyricItem {
  id: number;
  cn: string;
  no: string;
  analysis: AnalysisItem[];
}

interface HoveredWord {
  id: number;
  word: string;
}

type TabId = 'listen' | 'forest' | 'write';

// ─── 完整歌词 + 挪威语逐句对译 ────────────────────────────────────────────
const LYRICS_DATA: LyricItem[] = [
  {
    id: 1,
    cn: "雪花飘飘，北风萧萧",
    no: "Snøen faller lett, nordavinden suser.",
    analysis: [
      { word: "Snøen", detail: "Snø（雪） + 后置定冠词 -en。在挪威语里，雪长出了尾巴，特指此时此刻落在你眼前的这场冬雪。" },
      { word: "faller lett", detail: "轻盈地落下。faller 是现在时，传达动作正在发生的画面感；lett 是副词，让雪花有了重量——极轻的重量。" },
      { word: "nordavinden", detail: "Nordavind（北风） + 定冠词 -en。北欧神话里，北风是洗涤灵魂的冰冷信使。" },
      { word: "suser", detail: "拟声动词，专指风穿过松林或峡湾时发出的沙沙/呼啸声，自带听觉通感。" },
    ],
  },
  {
    id: 2,
    cn: "天地一片苍茫",
    no: "Mellom himmel og jord, alt er tåke og uendelighet.",
    analysis: [
      { word: "Mellom", detail: "介词'在……之间'。挪威语习惯先建立空间坐标轴，再填充内容。" },
      { word: "himmel og jord", detail: "天空（himmel）与大地（jord）。人类共识中的宏大概念在挪威语里无需冠词——天地就是天地。" },
      { word: "tåke og uendelighet", detail: "迷雾（tåke）与无垠（uendelighet）。挪威人用具体名词把中文'苍茫'的虚无感具象化。" },
    ],
  },
  {
    id: 3,
    cn: "一剪寒梅，傲立雪中",
    no: "En ensom plommeblomst står stolt i vintersnøen.",
    analysis: [
      { word: "En", detail: "阳性不定冠词（≈ a/an）。挪威语没有中文'剪、枝'等量词，万物按词性分三类，极简。" },
      { word: "plommeblomst", detail: "梅花。挪威无梅，取道复合词：plomme（李树）+ blomst（花）——诗意的跨文化借用。" },
      { word: "står stolt", detail: "骄傲地站立。挪威语对物体姿态极敏感：站 står、躺 ligger、坐 sitter，傲立必须稳稳地'站着'。" },
      { word: "i vintersnøen", detail: "在冬雪之中。i（在）+ vintersnø（冬雪）+ 定冠词 -en，将情感锚定于特定时空。" },
    ],
  },
  {
    id: 4,
    cn: "只为伊人飘香",
    no: "Alt for å spre sin duft til den elskede.",
    analysis: [
      { word: "sin duft", detail: "它的芬芳（飘香）。sin 是反身所有格，duft 是香气——这是属于花自己、只为那人散发的香。" },
      { word: "den elskede", detail: "所爱之人（伊人）。den（定冠词）+ elskede（elske'爱'的过去分词）= 被爱着的那个人。" },
    ],
  },
  {
    id: 5,
    cn: "爱我所爱，无怨无悔",
    no: "Å elske det jeg elsker, uten anger, uten bitterhet.",
    analysis: [
      { word: "uten anger", detail: "无悔（uten = 没有，anger = 后悔/懊恼）。anger 描述那种从内心深处咬噬的遗憾感。" },
      { word: "uten bitterhet", detail: "无怨（bitterhet = 苦涩/怨恨）。bitter（苦）+ -het（名词后缀）——北欧人把苦字写进了词的骨架里。" },
    ],
  },
  {
    id: 6,
    cn: "此情长留心间",
    no: "Denne kjærligheten lever evig i mitt hjerte.",
    analysis: [
      { word: "kjærligheten", detail: "爱情（kjærlighet）+ 定冠词 -en。字面义是'亲爱之物的本质'，是挪威语里最郑重的'爱'。" },
      { word: "evig", detail: "永远地、长存（长留）。维京人凝视无尽峡湾时感受到的那种绵延不绝——evig 装载着这份永恒。" },
      { word: "i mitt hjerte", detail: "在我心间。hjerte（心）是情感居所，而非跳动的器官；mitt（我的）+ i（在里）完成了归属。" },
    ],
  },
  {
    id: 7,
    cn: "一生一世等待着你",
    no: "I hele mitt liv venter jeg på deg.",
    analysis: [
      { word: "I hele mitt liv", detail: "在我整个一生中（一生一世）。hele = 全部/整个，强调无一例外；mitt liv = 我的生命。" },
      { word: "venter", detail: "等待（vente 的现在时）。挪威语的等待是主动的——极夜里点着蜡烛守候，而不是被动消耗。" },
      { word: "på deg", detail: "等待你（på + deg 宾格）。på 在这里表示等待'朝向'某人的指向感，比中文'等你'多一层方向性。" },
    ],
  },
  {
    id: 8,
    cn: "愿化彩蝶翩翩",
    no: "Jeg ønsker å bli en fargerik sommerfugl, svevende lett.",
    analysis: [
      { word: "fargerik", detail: "色彩丰富的（彩）。farge（颜色）+ rik（丰富）——直接描述视觉感受，不借用任何文化符号。" },
      { word: "sommerfugl", detail: "蝴蝶（蝶）。字面意思：sommer（夏天）+ fugl（鸟）= 夏天的鸟。北欧人用季节定义这种生命的短暂与轻盈。" },
      { word: "svevende lett", detail: "轻盈飘舞（翩翩）。svevende = 飘浮着的（现在分词），lett = 轻盈，两词叠加传递出翩翩起舞的失重自由感。" },
    ],
  },
];

const FOREST_CONCEPTS = [
  { title: "Snø (雪)", desc: "衍生出 Morgensnø（清晨刚落未被惊扰的初雪）。挪威人用无数词汇形容雪，如同他们对自然万物的细腻感知。" },
  { title: "Vind (风)", desc: "衍生出 Nordavinden（北风）。北欧神话里，北风常带着洗涤灵魂的冰冷力量，是散步时的极佳伴侣。" },
  { title: "Ensomhet (孤独)", desc: "挪威人眼中的孤独并非凄凉，而是 Mørketid（极夜）里在小木屋点起蜡烛、向内探索的自我庇护所。" },
];

export default function YiJianMeiApp() {
  const [activeTab, setActiveTab]             = useState<TabId>('listen');
  const [isMuted, setIsMuted]                 = useState(true);
  const [hoveredWord, setHoveredWord]         = useState<HoveredWord | null>(null);
  const [journalInput, setJournalInput]       = useState('');
  const [aiResponse, setAiResponse]           = useState('');
  const [speaking, setSpeaking]               = useState<number | null>(null);
  const [currentLine, setCurrentLine]         = useState<number | null>(null);
  const [isPlaying, setIsPlaying]             = useState(false);

  const { start, stop } = useAudio();
  const playbackRef = useRef(false);
  const lineRefs    = useRef<(HTMLDivElement | null)[]>([]);

  // Auto-scroll to active line
  useEffect(() => {
    if (currentLine !== null) {
      lineRefs.current[currentLine]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [currentLine]);

  // Cancel playback when leaving the listen tab
  useEffect(() => {
    if (activeTab !== 'listen') {
      playbackRef.current = false;
      window.speechSynthesis?.cancel();
      setIsPlaying(false);
      setCurrentLine(null);
    }
  }, [activeTab]);

  // Cancel on unmount
  useEffect(() => () => {
    window.speechSynthesis?.cancel();
    playbackRef.current = false;
  }, []);

  const handleMuteToggle = () => {
    if (isMuted) { start(); setIsMuted(false); }
    else          { stop();  setIsMuted(true);  }
  };

  // Play a single Chinese line (also cancels any running sequence)
  const handleSpeakSingle = (item: LyricItem, index: number) => {
    playbackRef.current = false;
    setIsPlaying(false);
    setCurrentLine(index);
    speakChinese(item.cn, () => setCurrentLine(null));
  };

  // Speak Norwegian sentence with pulse feedback
  const handleSpeak = (item: LyricItem) => {
    setSpeaking(item.id);
    speakNorwegian(item.no, () => setSpeaking(null));
  };

  // Full sequential playback
  const handlePlayAll = async () => {
    if (isPlaying) {
      window.speechSynthesis?.cancel();
      playbackRef.current = false;
      setIsPlaying(false);
      setCurrentLine(null);
      return;
    }
    if (isMuted) { start(); setIsMuted(false); }

    setIsPlaying(true);
    playbackRef.current = true;

    for (let i = 0; i < LYRICS_DATA.length; i++) {
      if (!playbackRef.current) break;
      setCurrentLine(i);
      await new Promise<void>(resolve => speakChinese(LYRICS_DATA[i].cn, resolve));
      if (!playbackRef.current) break;
      await new Promise(r => setTimeout(r, 550));
    }

    if (playbackRef.current) { setIsPlaying(false); setCurrentLine(null); }
    playbackRef.current = false;
  };

  const handleWriteSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!journalInput.trim()) return;
    setAiResponse(
      "Vintersnøen gjemmer alt, men den gjemmer ikke din sjel. " +
      "（冬雪掩盖了一切，但掩盖不了你的灵魂。此时此刻，北风亦在为你伴奏。）",
    );
  };

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
          <span className="text-sm tracking-widest text-slate-400 font-light">PROSJEKT VINTERSNØ // 一剪梅</span>
        </div>
        <button
          onClick={handleMuteToggle}
          className="p-2 rounded-full hover:bg-slate-900 transition-colors text-slate-400 hover:text-slate-200"
          title={isMuted ? "开启北风声与冬日旋律" : "静音"}
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} className="text-emerald-400" />}
        </button>
      </header>

      {/* 主区域 */}
      <main className="flex-1 max-w-3xl w-full mx-auto px-5 py-4 flex flex-col z-10 min-h-0">

        {/* ── Tab 1: 全词卡拉OK ── */}
        {activeTab === 'listen' && (
          <div className="flex flex-col gap-4 h-full animate-fadeIn">

            {/* 歌曲信息 + 全曲播放按钮 */}
            <div className="flex items-center justify-between shrink-0">
              <div>
                <p className="text-[10px] text-emerald-600 font-mono tracking-widest mb-0.5">1983 · 台湾经典民谣</p>
                <h2 className="text-base font-light text-slate-200 tracking-wide">一剪梅 · Yi Jian Mei</h2>
              </div>
              <button
                onClick={handlePlayAll}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-xs tracking-wider border transition-all ${
                  isPlaying
                    ? 'bg-emerald-950 text-emerald-400 border-emerald-900'
                    : 'bg-slate-900/80 text-slate-400 border-slate-800 hover:text-slate-200 hover:border-slate-700'
                }`}
              >
                {isPlaying ? <Pause size={11} /> : <Play size={11} />}
                <span>{isPlaying ? '暂停' : '全曲朗读'}</span>
              </button>
            </div>

            {/* 歌词列表 */}
            <div className="overflow-y-auto flex-1 space-y-0.5 pr-1 min-h-0">
              {LYRICS_DATA.map((item, index) => {
                const isActive = currentLine === index;
                return (
                  <div
                    key={item.id}
                    ref={(el) => { lineRefs.current[index] = el; }}
                    onClick={() => handleSpeakSingle(item, index)}
                    className={`group px-4 py-3 rounded-xl cursor-pointer transition-all duration-300 border-l-2 ${
                      isActive
                        ? 'border-emerald-500 bg-emerald-950/25 shadow-[inset_0_0_20px_rgba(16,185,129,0.04)]'
                        : 'border-transparent hover:bg-slate-900/40 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      {/* 行号 */}
                      <span className={`text-[10px] font-mono mt-0.5 shrink-0 w-4 text-right transition-colors ${
                        isActive ? 'text-emerald-500' : 'text-slate-700'
                      }`}>{index + 1}</span>

                      {/* 歌词 */}
                      <div className="flex-1 min-w-0">
                        {/* 中文 */}
                        <p className={`text-base leading-snug transition-all duration-300 ${
                          isActive ? 'text-white' : 'text-slate-400 group-hover:text-slate-300'
                        }`}>
                          {item.cn}
                        </p>

                        {/* 挪威语（带可悬停单词） */}
                        <div className="flex flex-wrap gap-x-1 gap-y-0.5 mt-1">
                          {item.no.split(' ').map((word, wi) => {
                            const clean    = word.replace(/[,.]/g, '');
                            const isTarget = item.analysis.some(a => a.word.includes(clean));
                            return (
                              <span
                                key={wi}
                                className={`text-xs leading-relaxed transition-colors duration-200 ${
                                  isTarget
                                    ? 'text-emerald-700 hover:text-emerald-400 underline decoration-emerald-900 underline-offset-2 cursor-pointer'
                                    : isActive ? 'text-slate-500' : 'text-slate-600'
                                }`}
                                onMouseEnter={() => { if (isTarget) setHoveredWord({ id: item.id, word: clean }); }}
                                onMouseLeave={() => setHoveredWord(null)}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (!isTarget) return;
                                  const next = hoveredWord?.word === clean ? null : { id: item.id, word: clean };
                                  setHoveredWord(next);
                                  if (next) speakNorwegian(clean);
                                }}
                              >
                                {word}
                              </span>
                            );
                          })}
                        </div>
                      </div>

                      {/* 朗读挪威语按钮 */}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleSpeak(item); }}
                        title="朗读挪威语"
                        className={`shrink-0 p-1.5 rounded-full transition-all mt-0.5 ${
                          speaking === item.id
                            ? 'text-emerald-400 animate-pulse'
                            : 'text-slate-700 hover:text-emerald-500 hover:bg-slate-800/60'
                        }`}
                      >
                        <Volume2 size={12} />
                      </button>
                    </div>

                    {/* 播放中波纹条 */}
                    {isActive && (
                      <div className="mt-2 ml-7 flex gap-0.5 items-end h-3">
                        {[0, 1, 2, 3, 4].map(i => (
                          <div
                            key={i}
                            className="w-0.5 bg-emerald-500 rounded-full opacity-70"
                            style={{
                              height: `${40 + Math.sin(i * 1.3) * 40}%`,
                              animation: `ping ${0.6 + i * 0.1}s ease-in-out infinite alternate`,
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* 语法气泡 */}
            <div className="shrink-0 min-h-[58px] p-4 rounded-xl bg-emerald-950/20 border border-emerald-900/30 text-sm text-slate-400 font-light">
              {hoveredWord ? (
                <p className="animate-fadeIn leading-relaxed">
                  <strong className="text-emerald-400 font-medium">{hoveredWord.word}</strong>
                  {' — '}
                  {LYRICS_DATA
                    .find(l => l.id === hoveredWord.id)
                    ?.analysis.find(a => a.word.includes(hoveredWord.word))
                    ?.detail}
                </p>
              ) : (
                <p className="text-slate-600 italic text-xs text-center py-1">
                  点击歌词行 → 朗读中文 · 点 <Volume2 size={10} className="inline mb-0.5" /> → 朗读挪威语 · 悬停绿色词 → 语法解析
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Tab 2: 意象森林 ── */}
        {activeTab === 'forest' && (
          <div className="grid md:grid-cols-3 gap-6 my-auto animate-fadeIn">
            {FOREST_CONCEPTS.map((concept, index) => (
              <div
                key={index}
                className="p-6 rounded-2xl bg-slate-900/40 border border-slate-900 hover:border-emerald-950 transition-all flex flex-col justify-between space-y-4"
              >
                <div>
                  <span className="text-xs text-emerald-500 uppercase tracking-widest font-mono">意象 {index + 1}</span>
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
                <div className="pt-4 border-t border-slate-900 text-xs text-slate-500 italic">
                  源自歌词：{LYRICS_DATA[index].cn}
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
              <p className="text-xs text-slate-500">借用学到的北欧意境，记录你此刻的感受。允许中挪混杂，自由落笔。</p>
            </div>

            <form onSubmit={handleWriteSubmit} className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 focus-within:border-emerald-900 transition-all">
                <div className="text-sm text-emerald-500/70 font-mono mb-2">
                  I kveld suser nordavinden, og jeg føler...
                </div>
                <textarea
                  value={journalInput}
                  onChange={(e) => setJournalInput(e.target.value)}
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
                    title="朗读挪威语回应"
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
              { id: 'listen', icon: <Compass size={14} />, label: '全词聆听' },
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
