import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, Play, Image, Video, Hammer, Palette, Activity, Smile, Users, Loader2 } from 'lucide-react';
import { useChildStore } from '../store/useChildStore';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';

interface ReportItem {
  id: number;
  type: 'photo' | 'video';
  mediaUrl: string;
  activity: string;
  skill: string;
  allSkills: string[];
  note: string;
  date: string;
  completed_at: string;
}

interface ReportGroup {
  date: string;
  items: ReportItem[];
}

const Report = () => {
  const navigate = useNavigate();
  const selectedChild = useChildStore(state => state.getSelectedChild());
  const { t, lang } = useTranslation();
  const [filter, setFilter] = useState<'all' | 'photo' | 'video'>('all');
  const [selectedItem, setSelectedItem] = useState<ReportItem | null>(null);
  const [reportData, setReportData] = useState<ReportGroup[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const filters = [
    { key: 'all' as const, label: t.report.filterAll },
    { key: 'photo' as const, label: t.report.filterPhoto },
    { key: 'video' as const, label: t.report.filterVideo },
  ];

  useEffect(() => {
    const fetchReport = async () => {
      if (!selectedChild) return;
      setIsLoading(true);
      try {
        const response = await apiClient.get(`/journey/progress/${selectedChild.id}`);
        if (response.data.success) {
          const groupedByDate: Record<string, ReportItem[]> = {};
          
          response.data.progress.forEach((p: any) => {
            const dateObj = new Date(p.completed_at);
            const today = new Date();
            const yesterday = new Date();
            yesterday.setDate(today.getDate() - 1);
            
            let dateLabel = dateObj.toLocaleDateString(lang === 'th' ? 'th-TH' : 'en-GB', {
              day: 'numeric', month: 'short', year: 'numeric'
            });
            
            if (dateObj.toDateString() === today.toDateString()) {
              dateLabel = 'today';
            } else if (dateObj.toDateString() === yesterday.toDateString()) {
              dateLabel = 'yesterday';
            }
            
            if (!groupedByDate[dateLabel]) {
              groupedByDate[dateLabel] = [];
            }
            
            const hasVideo = p.media && p.media.some((m: any) => m.type === 'video');
            const mediaUrl = p.media && p.media.length > 0 ? p.media[0].url : '';
            
            let skills: string[] = [];
            try {
              if (p.skills_learned) {
                skills = JSON.parse(p.skills_learned);
              }
            } catch (e) {
              if (Array.isArray(p.skills_learned)) {
                skills = p.skills_learned;
              } else if (typeof p.skills_learned === 'string') {
                skills = [p.skills_learned];
              }
            }
            
            groupedByDate[dateLabel].push({
              id: p.id,
              type: hasVideo ? 'video' : 'photo',
              mediaUrl,
              activity: p.node_title || 'Mellow Play Activity',
              skill: skills.length > 0 ? skills[0] : 'Learning',
              allSkills: skills,
              note: p.teacher_comment || 'ไม่มีบันทึกคุณครู',
              date: dateLabel,
              completed_at: p.completed_at
            });
          });
          
          const formatted = Object.keys(groupedByDate).map(dateKey => ({
            date: dateKey,
            items: groupedByDate[dateKey]
          }));
          
          setReportData(formatted);
        }
      } catch (err) {
        console.error('Failed to fetch report data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchReport();
  }, [selectedChild, lang]);

  const getSkillIcon = (skill: string) => {
    const s = skill.toLowerCase();
    if (s.includes('problem') || s.includes('solve') || s.includes('แก้ปัญหา')) {
      return <Hammer size={16} />;
    }
    if (s.includes('creative') || s.includes('art') || s.includes('สร้างสรรค์')) {
      return <Palette size={16} />;
    }
    if (s.includes('collab') || s.includes('team') || s.includes('ร่วมมือ')) {
      return <Users size={16} />;
    }
    if (s.includes('communicat') || s.includes('speak') || s.includes('สื่อสาร')) {
      return <Smile size={16} />;
    }
    return <Activity size={16} />;
  };

  const getSkillColor = (skill: string) => {
    const s = skill.toLowerCase();
    if (s.includes('problem') || s.includes('solve') || s.includes('แก้ปัญหา')) return 'bg-blue-400';
    if (s.includes('creative') || s.includes('art') || s.includes('สร้างสรรค์')) return 'bg-purple-400';
    if (s.includes('collab') || s.includes('team') || s.includes('ร่วมมือ')) return 'bg-yellow-500';
    if (s.includes('communicat') || s.includes('speak') || s.includes('สื่อสาร')) return 'bg-red-400';
    return 'bg-emerald-400';
  };

  const filteredData = reportData.map(group => ({
    ...group,
    items: group.items.filter(i => filter === 'all' || i.type === filter),
  })).filter(group => group.items.length > 0);

  if (isLoading) {
    return (
      <div className="mellow-page flex items-center justify-center">
        <Loader2 className="animate-spin text-mellow-purple" size={40} />
      </div>
    );
  }

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
              {/* Media Thumbnail in Modal */}
              <div className={`relative w-full h-[220px] bg-gradient-to-br from-slate-100 to-slate-200 flex items-center justify-center`}>
                {selectedItem.mediaUrl ? (
                  <img src={selectedItem.mediaUrl} alt={selectedItem.activity} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-slate-900/10 flex items-center justify-center text-slate-500">
                    {getSkillIcon(selectedItem.skill)}
                  </div>
                )}
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
                  <span className={`px-2 py-1 ${getSkillColor(selectedItem.skill)} text-white text-[14px] font-black rounded-full`}>
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
        {filteredData.length === 0 ? (
          <div className="text-center py-10">
            <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">{t.report.noLearningData}</p>
          </div>
        ) : (
          filteredData.map((group, gIdx) => (
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
                    <div className="relative w-full h-[100px] bg-gradient-to-br from-indigo-50 to-purple-100 flex items-center justify-center overflow-hidden">
                      {item.mediaUrl ? (
                        <img src={item.mediaUrl} alt={item.activity} className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-slate-400 p-2 bg-white/60 rounded-full">
                          {getSkillIcon(item.skill)}
                        </div>
                      )}
                      
                      {item.type === 'video' && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <div className="w-9 h-9 bg-white/85 rounded-full flex items-center justify-center">
                            <Play size={15} className="text-slate-700 fill-slate-700 ml-0.5" />
                          </div>
                        </div>
                      )}
                      
                      <span className="absolute top-2 left-2 flex items-center gap-1 px-1.5 py-0.5 bg-white/80 rounded-full text-[10px] font-black text-slate-600">
                        {item.type === 'video'
                          ? <><Video size={10} className="shrink-0" /> {t.report.video}</>
                          : <><Image size={10} className="shrink-0" /> {t.report.photo}</>
                        }
                      </span>
                    </div>
                    
                    {/* Info */}
                    <div className="p-2.5">
                      <p className="text-[13px] font-black text-mellow-ink leading-tight truncate mb-1.5">
                        {item.activity}
                      </p>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 ${getSkillColor(item.skill)} text-white text-[10px] font-black rounded-full`}>
                        {item.skill}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))
        )}
      </main>
    </div>
  );
};

export default Report;
