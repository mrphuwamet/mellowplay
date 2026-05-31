import React, { useRef, useEffect, useState } from 'react';
import { useChildStore } from '../store/useChildStore';
import { ChevronLeft, Star, Camera, Lock, CheckCircle2, Flag, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import { useTranslation } from '../LanguageContext';

const Roadmap = () => {
  const navigate = useNavigate();
  const selectedChild = useChildStore(state => state.getSelectedChild());
  const [nodes, setNodes] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { t } = useTranslation();

  useEffect(() => {
    const fetchJourney = async () => {
      if (!selectedChild) return;
      setIsLoading(true);
      try {
        // 1. Fetch Master Nodes
        const nodesRes = await apiClient.get('/journey/nodes');
        // 2. Fetch Child Progress
        const progressRes = await apiClient.get(`/journey/progress/${selectedChild.id}`);
        
        if (nodesRes.data.success && progressRes.data.success) {
          const masterNodes = nodesRes.data.nodes;
          const childProgress = progressRes.data.progress;
          
          // Map progress to master nodes
          const mappedNodes = masterNodes.map((node: any, index: number) => {
            const progress = childProgress.find((p: any) => p.node_id === node.id);
            const isCompleted = !!progress;
            const isNext = !isCompleted && (index === 0 || childProgress.some((p: any) => {
               const prevNode = masterNodes[index - 1];
               return prevNode && p.node_id === prevNode.id;
            }));

            return {
              ...node,
              status: isCompleted ? 'completed' : (isNext ? 'active' : 'locked'),
              icon: index % 3 === 0 ? '🐰' : (index % 3 === 1 ? '🎨' : '🦦'), // Cycle icons for now
              type: index === masterNodes.length - 1 ? 'milestone' : (index % 2 === 0 ? 'play' : 'grow')
            };
          });
          setNodes(mappedNodes);
        }
      } catch (err) {
        console.error('Failed to fetch roadmap:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchJourney();
  }, [selectedChild]);

  // Auto-scroll to active node on mount
  useEffect(() => {
    if (!isLoading) {
      const activeNode = document.getElementById('node-active');
      if (activeNode) {
        activeNode.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [isLoading]);

  const getBgColor = (type: string, status: string) => {
    if (status === 'locked') return 'bg-slate-200 text-slate-400 border-slate-300';
    switch (type) {
      case 'play': return 'bg-mellow-red text-white border-mellow-red-soft shadow-mellow-red/30';
      case 'create': return 'bg-mellow-yellow text-white border-mellow-yellow-soft shadow-mellow-yellow/30';
      case 'grow': return 'bg-mellow-blue text-white border-mellow-blue-soft shadow-mellow-blue/30';
      case 'milestone': return 'bg-mellow-purple text-white border-mellow-purple-soft shadow-mellow-purple/30';
      default: return 'bg-slate-400';
    }
  };

  return (
    <div className="mellow-page bg-gradient-to-b from-[#eef6ff] via-[#fbfaf7] to-[#fff7df]">
      {/* Dynamic Header */}
      <header className="h-[64px] px-5 bg-white/80 backdrop-blur-xl sticky top-0 z-30 border-b border-black/5 flex items-center justify-between">
        <button onClick={() => navigate('/')} className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center active:scale-90 transition-transform">
           <ChevronLeft size={24} className="mr-0.5" />
        </button>
        <div className="flex-1">
          <h1 className="text-[16px] font-black tracking-tight leading-none mb-0.5">{t.roadmap.title}</h1>
        </div>
        <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-mellow-yellow shadow-sm">
           <div className="w-full h-full bg-[#fff3d8] flex items-center justify-center text-xl">
             {selectedChild?.avatar}
           </div>
        </div>
      </header>

      {/* Game Map Area */}
      <div className="relative pt-12 pb-20 px-6 min-h-[120vh]">
        
        {/* Floating Decorative Elements */}
        <div className="absolute top-20 left-10 opacity-20 animate-pulse text-4xl">☁️</div>
        <div className="absolute top-80 right-10 opacity-20 animate-bounce text-4xl" style={{animationDuration: '4s'}}>🎈</div>
        <div className="absolute top-[600px] left-12 opacity-20 text-4xl">🌳</div>
        <div className="absolute top-[900px] right-14 opacity-20 animate-pulse text-4xl">⭐</div>

        {/* The Zig-Zag Path SVG */}
        <svg className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20" preserveAspectRatio="none">
           <path 
             d="M 50% 50 L 50% 100 Q 80% 150 50% 200 T 20% 300 T 50% 400 T 80% 500 T 50% 600 T 20% 700 T 50% 800 T 80% 900 T 50% 1000" 
             stroke="#94a3b8" 
             strokeWidth="8" 
             fill="none" 
             strokeDasharray="12 12"
             className="w-full"
           />
        </svg>

        <div className="flex flex-col gap-20 relative z-10">
          {nodes.map((node, index) => {
            const isLeft = index % 2 === 0;
            const isActive = node.status === 'active';
            
            return (
              <div 
                key={node.id} 
                id={isActive ? 'node-active' : `node-${node.id}`}
                className={`flex items-center gap-6 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}
              >
                {/* Node Main Circle */}
                <div className="relative">
                  {/* Current Position Pin */}
                  {isActive && (
                    <div className="absolute -top-12 left-1/2 -translate-x-1/2 flex flex-col items-center animate-bounce z-20">
                      <div className="bg-white px-2 py-1 rounded-lg shadow-xl text-[14px] font-black border-2 border-mellow-yellow whitespace-nowrap mb-1 uppercase tracking-tighter">
                         {selectedChild?.name} {t.roadmap.isHere}
                      </div>
                      <div className="w-10 h-10 rounded-full bg-mellow-yellow border-2 border-white shadow-lg flex items-center justify-center text-xl">
                        {selectedChild?.avatar}
                      </div>
                    </div>
                  )}

                  <button className={`
                    w-20 h-20 rounded-[28px] border-4 flex items-center justify-center text-4xl shadow-2xl transition-all 
                    active:scale-90 z-10 relative
                    ${getBgColor(node.type, node.status)}
                  `}>
                    {node.status === 'locked' ? <Lock size={28} /> : node.icon}
                  </button>

                  {/* Status Ring */}
                  {isActive && (
                    <div className="absolute -inset-2 border-4 border-mellow-yellow rounded-[36px] animate-ping opacity-30 pointer-events-none" />
                  )}
                </div>

                {/* Node Info Cloud */}
                <div className={`
                   flex-1 p-5 rounded-[24px] border border-white shadow-xl backdrop-blur-sm transition-all
                   ${node.status === 'locked' ? 'bg-white/40 grayscale opacity-60' : 'bg-white/90 scale-105 border-mellow-line'}
                `}>
                  <div className="flex justify-between items-start mb-1">
                    <h3 className="font-black text-[15px] leading-tight text-mellow-ink uppercase tracking-tight">{node.title}</h3>
                    {node.status === 'completed' && <CheckCircle2 size={16} className="text-mellow-green" />}
                  </div>
                  <p className="text-[14px] text-mellow-muted font-bold leading-relaxed">{node.desc}</p>
                  
                  {isActive && (
                    <div className="mt-3 flex gap-2">
                       <button className="flex-1 py-1.5 rounded-lg bg-mellow-red text-white text-[14px] font-black uppercase tracking-wider shadow-sm">
                          {t.roadmap.playNow}
                       </button>
                    </div>
                  )}
                  
                  {node.status === 'completed' && (
                    <div className="mt-3 flex items-center gap-2">
                       <div className="flex -space-x-2">
                          <div className="w-6 h-6 rounded-lg bg-slate-100 border border-white flex items-center justify-center text-xs">📸</div>
                          <div className="w-6 h-6 rounded-lg bg-slate-200 border border-white flex items-center justify-center text-[14px] font-bold">+2</div>
                       </div>
                       <span className="text-[14px] font-black text-slate-400 uppercase tracking-widest">{t.roadmap.albumUpdated}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* End Goal */}
          <div className="flex flex-col items-center gap-4 mt-10">
             <div className="w-24 h-24 rounded-full bg-slate-100 border-4 border-dashed border-slate-300 flex items-center justify-center">
                <Flag size={40} className="text-slate-300" />
             </div>
             <b className="text-slate-400 text-xs font-black uppercase tracking-[0.2em]">{t.roadmap.secretStage}</b>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Roadmap;
