import { useState, type FormEvent, type ReactNode } from 'react';
import { Compass, PenTool, Trees, Volume2, VolumeX, CornerDownLeft } from 'lucide-react';

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

const LYRICS_DATA: LyricItem[] = [
  {
    id: 1,
    cn: "雪花飘飘，北风萧萧",
    no: "Snøen faller lett, nordavinden suser.",
    analysis: [
      { word: "Snøen", detail: "Snø（雪） + 后置定冠词 -en（这/那）。在挪威语里，雪长出了尾巴，特指此时此刻落在你眼前的这场冬雪。" },
      { word: "faller lett", detail: "意为'轻盈地落下'。挪威语用现在时动词 faller 传达动作的正在进行，比生硬的背诵更具画面感。" },
      { word: "nordavinden", detail: "Nordavind（北风） + 后置定冠词 -en。在北欧神话语境中，北风带着清冽、让人清醒的孤寂感。" },
      { word: "suser", detail: "动词，特指风吹过松林、峡湾时发出的沙沙声或呼啸声，自带听觉通感。" }
    ]
  },
  {
    id: 2,
    cn: "天地一片苍茫",
    no: "Mellom himmel og jord, alt er tåke og uendelighet.",
    analysis: [
      { word: "Mellom", detail: "介词'在……之间'。挪威语习惯先为你建立一个空间坐标轴体系。" },
      { word: "himmel og jord", detail: "天空（himmel）与大地（jord）。在人类共识中独一无二的宏大抽象概念，在挪威语中不需要加定冠词。" },
      { word: "alt er", detail: "'一切皆是'。中文可以省略系动词，但日耳曼语族必须用一个强烈的系动词 er (is) 来撑起句子的骨架。" },
      { word: "tåke og uendelighet", detail: "迷雾（tåke）与无垠（uendelighet）。挪威人倾向于用具体的名词实体，来具象化中文里'苍茫'的虚无意境。" }
    ]
  },
  {
    id: 3,
    cn: "一剪梅，傲立雪中",
    no: "En ensom plommeblomst står stolt i vintersnøen.",
    analysis: [
      { word: "En", detail: "阳性不定冠词（相当于 a/an）。挪威语没有中国复杂的'剪、阵、场'等量词，万物根据词性归于三类，极简纯粹。" },
      { word: "plommeblomst", detail: "梅花。挪威本土没有梅花，这是一个充满诗意的复合词：plomme（李树） + blomst（花）。" },
      { word: "står stolt", detail: "骄傲地站立。挪威语对物体的空间姿态（站står、躺ligger）极度敏感，傲立在风雪中，必须稳稳地'站着'。" },
      { word: "i vintersnøen", detail: "在冬雪之中。介词 i (在...里) + vintersnø（冬雪） + 尾巴 -en，将情感融于特定时空。" }
    ]
  }
];

export default function YiJianMeiApp() {
  const [activeTab, setActiveTab] = useState<TabId>('listen');
  const [isMuted, setIsMuted] = useState(true);
  const [hoveredWord, setHoveredWord] = useState<HoveredWord | null>(null);
  const [activeSentence, setActiveSentence] = useState<LyricItem>(LYRICS_DATA[0]);
  const [journalInput, setJournalInput] = useState('');
  const [aiResponse, setAiResponse] = useState('');

  const handleWriteSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!journalInput.trim()) return;
    setAiResponse("Vintersnøen gjemmer alt, men den gjemmer ikke din sjel. (冬雪掩盖了一切，但掩盖不了你的灵魂。此时此刻，北风亦在为你伴奏。)");
  };

  return (
    <div className="relative min-h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden flex flex-col justify-between selection:bg-emerald-800 selection:text-emerald-100">

      {/* 极简慢速飘雪背景 */}
      <div className="absolute inset-0 pointer-events-none opacity-20">
        <div className="absolute top-[-10%] left-[10%] w-2 h-2 bg-white rounded-full animate-[ping_4s_infinite]"></div>
        <div className="absolute top-[-5%] left-[40%] w-1.5 h-1.5 bg-white rounded-full animate-[ping_6s_infinite]"></div>
        <div className="absolute top-[-12%] left-[75%] w-2 h-2 bg-white rounded-full animate-[ping_5s_infinite]"></div>
        <div className="absolute top-[20%] left-[25%] w-1 h-1 bg-white rounded-full opacity-50"></div>
        <div className="absolute top-[50%] left-[80%] w-1.5 h-1.5 bg-white rounded-full opacity-40"></div>
      </div>

      {/* 顶栏 */}
      <header className="p-6 flex justify-between items-center z-10 border-b border-slate-900 bg-slate-950/80 backdrop-blur-md">
        <div className="flex items-center space-x-3">
          <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
          <span className="text-sm tracking-widest text-slate-400 font-light">PROSJEKT VINTERSNØ // 一剪梅</span>
        </div>
        <button
          onClick={() => setIsMuted(!isMuted)}
          className="p-2 rounded-full hover:bg-slate-900 transition-colors text-slate-400 hover:text-slate-200"
          title={isMuted ? "开启环境白噪音" : "静音"}
        >
          {isMuted ? <VolumeX size={18} /> : <Volume2 size={18} className="text-emerald-400" />}
        </button>
      </header>

      {/* 主交互区 */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 flex flex-col justify-center z-10">

        {/* Tab 1: 听觉与意境通感 */}
        {activeTab === 'listen' && (
          <div className="space-y-12 my-auto animate-fadeIn">
            <div className="space-y-8">
              {LYRICS_DATA.map((item) => (
                <div
                  key={item.id}
                  className={`p-6 rounded-2xl transition-all duration-500 cursor-pointer border ${
                    activeSentence.id === item.id
                      ? 'bg-slate-900/60 border-emerald-900/50 shadow-lg'
                      : 'bg-transparent border-transparent opacity-50 hover:opacity-80'
                  }`}
                  onClick={() => setActiveSentence(item)}
                >
                  <p className="text-xs text-slate-500 tracking-wider mb-2">{item.cn}</p>
                  <div className="text-xl md:text-2xl font-light tracking-wide flex flex-wrap gap-x-2 gap-y-1">
                    {item.no.split(' ').map((word, index) => {
                      const cleanWord = word.replace(/[,.]/g, '');
                      const isTarget = item.analysis.some(a => a.word.includes(cleanWord));
                      return (
                        <span
                          key={index}
                          className={`transition-colors duration-200 ${isTarget ? 'underline decoration-emerald-800 decoration-2 underline-offset-4 hover:text-emerald-400 cursor-pointer' : ''}`}
                          onMouseEnter={() => { if (isTarget) setHoveredWord({ id: item.id, word: cleanWord }); }}
                          onMouseLeave={() => setHoveredWord(null)}
                          onClick={(e) => { e.stopPropagation(); if (isTarget) setHoveredWord(hoveredWord?.word === cleanWord ? null : { id: item.id, word: cleanWord }); }}
                        >
                          {word}
                        </span>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {/* 语法气泡面板 */}
            <div className="min-h-[80px] p-4 rounded-xl bg-emerald-950/20 border border-emerald-900/30 text-sm text-slate-400 font-light transition-all">
              {hoveredWord ? (
                <p className="animate-fadeIn">
                  <strong className="text-emerald-400 font-medium">{hoveredWord.word}</strong>: {
                    LYRICS_DATA.find(l => l.id === hoveredWord.id)?.analysis.find(a => a.word.includes(hoveredWord.word))?.detail
                  }
                </p>
              ) : (
                <p className="text-slate-500 italic flex items-center justify-center h-full py-2">
                  轻触或将鼠标悬停在带下划线的挪威语单词上，倾听它背后的世界观...
                </p>
              )}
            </div>
          </div>
        )}

        {/* Tab 2: 意象发散森林 */}
        {activeTab === 'forest' && (
          <div className="grid md:grid-cols-3 gap-6 my-auto animate-fadeIn">
            {LYRICS_DATA.map((item, index) => {
              const coreConcepts = [
                { title: "Snø (雪)", desc: "衍生出 Morgensnø（清晨刚落未被惊扰的初雪）。挪威人用无数种词汇形容雪，如同他们对自然万物的细腻感知。" },
                { title: "Vind (风)", desc: "衍生出 Nordavinden（北风）。在北欧神话里，北风常带着洗涤灵魂的冰冷力量，是散步时的极佳伴侣。" },
                { title: "Ensomhet (孤独)", desc: "挪威人眼中的孤独并非凄凉，而是 Mørketid（极夜）里在小木屋中点起蜡烛、向内探索的自我庇护所。" }
              ];
              const concept = coreConcepts[index];
              return (
                <div key={item.id} className="p-6 rounded-2xl bg-slate-900/40 border border-slate-900 hover:border-emerald-950 transition-all flex flex-col justify-between space-y-4">
                  <div>
                    <span className="text-xs text-emerald-500 uppercase tracking-widest font-mono">意象 {index + 1}</span>
                    <h3 className="text-xl font-light mt-1 text-slate-200">{concept.title}</h3>
                    <p className="text-sm text-slate-400 mt-3 font-light leading-relaxed">{concept.desc}</p>
                  </div>
                  <div className="pt-4 border-t border-slate-900 text-xs text-slate-500 italic">
                    源自歌词：{item.cn}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Tab 3: 微写作 */}
        {activeTab === 'write' && (
          <div className="max-w-xl w-full mx-auto space-y-6 my-auto animate-fadeIn">
            <div className="space-y-2">
              <h2 className="text-lg font-light text-slate-300">Skriveplass // 微写作空间</h2>
              <p className="text-xs text-slate-500">借用学到的北欧意境，记录你此刻作为 INFP 的敏锐感受。允许中挪混杂，自由落笔。</p>
            </div>

            <form onSubmit={handleWriteSubmit} className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 focus-within:border-emerald-900 transition-all">
                <div className="text-sm text-emerald-500/70 font-mono mb-2">
                  I kveld suser nordavinden, og jeg føler... (今晚北风呼啸，我感到...)
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
                <div className="text-xs text-emerald-500 font-mono mb-1">来自森林木屋的回响：</div>
                {aiResponse}
              </div>
            )}
          </div>
        )}

      </main>

      {/* 底部导航栏 */}
      <footer className="p-6 flex justify-center z-10">
        <nav className="flex space-x-2 bg-slate-900/60 backdrop-blur-md p-1.5 rounded-full border border-slate-800/80">
          {(
            [
              { id: 'listen', icon: <Compass size={14} />, label: '听觉通感' },
              { id: 'forest', icon: <Trees size={14} />, label: '意象森林' },
              { id: 'write',  icon: <PenTool size={14} />, label: '微写作' },
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
