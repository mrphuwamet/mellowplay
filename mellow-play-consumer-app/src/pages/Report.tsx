import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Play, Image, Video } from 'lucide-react';
import { useChildStore } from '../store/useChildStore';
import { useTranslation } from '../LanguageContext';

const mockReportData = [
  {
    date: 'today',
    items: [
      { id: 1, type: 'video' as const, emoji: '🏗️', color: 'from-orange-300 to-orange-400', activity: 'Block Building', skill: 'Problem Solving', skillColor: 'bg-blue-400', duration: '1:24', note: 'น้องตั้งใจสร้างตึกสูง 10 ชั้น และแก้ปัญหาเมื่อบล็อกล้มได้เองโดยไม่ขอความช่วยเหลือ' },
      { id: 2, type: 'photo' as const, emoji: '🤸', color: 'from-green-300 to-teal-400', activity: 'Movement Play', skill: 'Creativity', skillColor: 'bg-purple-400', note: 'น้องคิดท่าเต้นใหม่และสอนเพื่อน' },
    ],
  },
  {
    date: 'yesterday',
    items: [
      { id: 3, type: 'photo' as const, emoji: '🎨', color: 'from-pink-300 to-pink-400', activity: 'Color Mixing', skill: 'Creativity', skillColor: 'bg-purple-400', note: 'น้องผสมสีได้สวยงาม และอธิบายผลลัพธ์ให้เพื่อนฟัง' },
      { id: 4, type: 'video' as const, emoji: '🎭', color: 'from-violet-300 to-violet-400', activity: 'Drama Play', skill: 'Communication', skillColor: 'bg-red-400', duration: '2:05', note: 'น้องเล่นบทบาทสมมติและพูดคุยอย่างมั่นใจ' },
    ],
  },
  {
    date: '3 days ago',
    items: [
      { id: 5, type: 'photo' as const, emoji: '🤝', color: 'from-yellow-300 to-amber-400', activity: 'Team Game', skill: 'Collaboration', skillColor: 'bg-yellow-400', note: 'น้องรอคอยและช่วยเหลือเพื่อนในทีมได้ดี' },
    ],
  },
];

const Report = () => {
  const navigate = useNavigate();
  const selectedChild = useChildStore(state => state.getSelectedChild());
  const { t } = useTranslation();
  const [filter, setFilter] = useState<'all' | 'photo' | 'video'>('all');
  const [selectedItem, setSelectedItem] = useState<typeof mockReportData[0]['items'][0] | null>(null);

  const filters = [
    { key: 'all' as const, label: t.report.filterAll },
    { key: 'photo' as const, label: t.report.filterPhoto },
    { key: 'video' as const, label: t.report.filterVideo },
  ];

  const filteredData = mockReportData.map(group => ({
    ...group,
    items: group.items.filter(i => filter === 'all' || i.type === filter),
  })).filter(group => group.items.length > 0);

  return (
    <div className="mellow-page bg-[#fbfaf7]">
      {/* Detail Modal */}
      {selectedItem && (
        <div
          className="fixed inset-0 z-[100] bg-mellow-ink/90 flex flex-col backdrop-blur-sm"
          onClick={() => setSelectedItem(null)}
        >
          <div className="flex-1 flex items-center justify-center p-5" onClick={e => e.stopPropagation()}>
            <div className="w-full max-w-[400px] bg-white rounded-[32px] overflow-hidden shadow-2xl">
              <div className={`relative w-full h-[220px] bg-gradient-to-br ${selectedItem.color} flex items-center justify-center text-7xl`}>
                <span>{selectedItem.emoji}</span>
                {selectedItem.type === 'video' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                    <div className="w-14 h-14 bg-white/85 rounded-full flex items-center justify-center">
                      <Play size={24} className="text-slate-700 fill-slate-700 ml-1" />
                    </div>
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2 py-1 ${selectedItem.skillColor} text-white text-[14px] font-black rounded-full`}>
                    {selectedItem.skill}
                  </span>
                  <span className="text-[14px] text-slate-400 font-bold uppercase tracking-widest">
                    {selectedItem.date === 'today' ? t.report.today : selectedItem.date === 'yesterday' ? t.report.yesterday : selectedItem.date}
                  </span>
                </div>
                <h3 className="text-lg font-black text-mellow-ink mb-3">{selectedItem.activity}</h3>
                <div className="bg-mellow-purple/5 border border-mellow-purple/10 rounded-2xl p-4">
                  <p className="text-[14px] font-black text-mellow-purple uppercase tracking-widest mb-1">{t.report.facilitatorNote}</p>
                  <p className="text-sm text-slate-600 font-medium leading-relaxed">{selectedItem.note}</p>
                </div>
                <button
                  onClick={() => setSelectedItem(null)}
                  className="mt-4 w-full py-3 bg-slate-100 rounded-2xl text-[14px] font-black text-slate-500 uppercase tracking-widest"
                >
                  ✕ Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
          <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <div className="text-center">
          <h1 className="text-[16px] font-black tracking-tight leading-none mb-0.5">{t.report.title}</h1>
          <span className="text-[14px] font-bold text-mellow-purple uppercase tracking-[0.2em]">{selectedChild?.name}</span>
        </div>
        <div className="w-10" />
      </header>

      {/* Filter Tabs */}
      <div className="px-5 pt-4 pb-2 flex gap-2">
        {filters.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-[14px] font-black transition-all ${
              filter === f.key
                ? 'bg-mellow-purple text-white shadow-md'
                : 'bg-white text-slate-500 border border-slate-100'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <main className="px-5 pb-10 space-y-8 pt-4">
        {filteredData.map((group, gIdx) => (
          <div key={gIdx}>
            {/* Date label */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-1.5 h-5 bg-mellow-purple rounded-full" />
              <span className="text-[14px] font-black text-slate-500 uppercase tracking-widest">
                {group.date === 'today' ? t.report.today : group.date === 'yesterday' ? t.report.yesterday : group.date}
              </span>
            </div>

            {/* Items grid */}
            <div className="grid grid-cols-2 gap-3">
              {group.items.map(item => (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className="rounded-[20px] overflow-hidden shadow-md bg-white active:scale-[0.97] transition-transform text-left"
                >
                  {/* Thumbnail */}
                  <div className={`relative w-full h-[100px] bg-gradient-to-br ${item.color} flex items-center justify-center text-4xl`}>
                    <span>{item.emoji}</span>
                    {item.type === 'video' && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                        <div className="w-9 h-9 bg-white/85 rounded-full flex items-center justify-center">
                          <Play size={15} className="text-slate-700 fill-slate-700 ml-0.5" />
                        </div>
                      </div>
                    )}
                    {item.duration && (
                      <span className="absolute bottom-2 right-2 px-1.5 py-0.5 bg-black/60 rounded text-[14px] text-white font-bold">
                        {item.duration}
                      </span>
                    )}
                    <span className="absolute top-2 left-2 flex items-center gap-0.5 px-1.5 py-0.5 bg-white/80 rounded-full text-[14px] font-black text-slate-600">
                      {item.type === 'video'
                        ? <><Video size={8} className="shrink-0" /> {t.report.video}</>
                        : <><Image size={8} className="shrink-0" /> {t.report.photo}</>
                      }
                    </span>
                  </div>
                  {/* Info */}
                  <div className="p-2.5">
                    <p className="text-[14px] font-black text-mellow-ink leading-tight truncate mb-1.5">
                      {item.activity}
                    </p>
                    <span className={`inline-block px-1.5 py-0.5 ${item.skillColor} text-white text-[14px] font-black rounded-full`}>
                      {item.skill}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        ))}
      </main>
    </div>
  );
};

export default Report;
