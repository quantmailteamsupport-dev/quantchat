import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Radio, Plus, User, X, Send, Loader } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const API = process.env.REACT_APP_BACKEND_URL;
const COLORS = ['#A7C7E7', '#FFB6C1', '#B2D8D8', '#FFCC99', '#D8B2D8'];

export default function Stories({ userId }) {
  const [stories, setStories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [content, setContent] = useState('');
  const [viewStory, setViewStory] = useState(null);
  const [storyIdx, setStoryIdx] = useState(0);
  const token = localStorage.getItem('qc_token');

  useEffect(() => { loadStories(); }, []);

  const loadStories = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/stories`, { headers });
      setStories(data.stories || []);
    } catch {}
    setLoading(false);
  };

  const createStory = async () => {
    if (!content.trim()) return;
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/api/stories`, { content, type: 'text' }, { headers });
      setContent('');
      setShowCreate(false);
      loadStories();
    } catch {}
  };

  const openStory = (s, idx = 0) => { setViewStory(s); setStoryIdx(idx); };
  const nextStory = () => {
    if (!viewStory) return;
    if (storyIdx < viewStory.stories.length - 1) setStoryIdx(storyIdx + 1);
    else setViewStory(null);
  };

  return (
    <div data-testid="stories-panel" className="flex flex-col h-full bg-qc-surface relative">
      {viewStory && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col" onClick={nextStory}>
          <div className="p-4 flex items-center gap-3 z-10 bg-gradient-to-b from-black/80 to-transparent">
            <div className="w-10 h-10 border-2 border-white bg-qc-surface flex items-center justify-center overflow-hidden">
              {viewStory.user_avatar ? <img src={viewStory.user_avatar} alt="" className="w-full h-full object-cover grayscale"/> : <User size={20}/>}
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold font-mono text-white uppercase">{viewStory.user_name}</p>
              <p className="text-[10px] font-mono text-white/70 uppercase">
                {viewStory.stories[storyIdx]?.created_at ? formatDistanceToNow(new Date(viewStory.stories[storyIdx].created_at), {addSuffix: true}) : ''}
              </p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setViewStory(null); }} className="border-2 border-white p-1 text-white hover:bg-white hover:text-black transition-colors"><X size={20}/></button>
          </div>
          <div className="flex gap-2 px-4 z-10">
            {viewStory.stories.map((_, i) => (
              <div key={i} className="flex-1 h-1.5 border border-white bg-black/50"><div className={`h-full ${i <= storyIdx ? 'bg-white' : ''}`} style={{width: i < storyIdx ? '100%' : i === storyIdx ? '100%' : '0%'}}/></div>
            ))}
          </div>
          <div className="flex-1 flex items-center justify-center p-8 border-x-4 border-b-4 border-black"
            style={{background: COLORS[viewStory.stories[storyIdx]?.content?.length % COLORS.length || 0]}}>
            <p className="text-black text-3xl font-heading font-black uppercase text-center leading-[1.2] border-4 border-black bg-white p-6 shadow-[8px_8px_0px_rgba(0,0,0,1)] max-w-md -rotate-2">
              {viewStory.stories[storyIdx]?.content}
            </p>
          </div>
        </div>
      )}

      <div className="p-5 border-b-2 border-qc-border flex items-center justify-between bg-qc-accent-secondary">
        <h2 className="font-heading font-black text-2xl text-qc-text-primary uppercase tracking-tighter">BROADCASTS</h2>
        <button data-testid="create-story-btn" onClick={() => setShowCreate(!showCreate)} className="w-8 h-8 flex items-center justify-center border-2 border-qc-border bg-qc-surface shadow-[2px_2px_0px_#0A0A0A] hover:translate-y-0.5 hover:translate-x-0.5 hover:shadow-none transition-all">
          <Plus size={18}/>
        </button>
      </div>

      {showCreate && (
        <div className="p-4 border-b-2 border-qc-border bg-qc-bg space-y-4 shadow-inner">
          <span className="font-mono text-xs font-bold uppercase tracking-widest border-b-2 border-qc-border pb-1">NEW_TRANSMISSION</span>
          <textarea data-testid="story-input" value={content} onChange={e => setContent(e.target.value)} rows={3}
            placeholder="ENTER_BROADCAST_PAYLOAD..." className="w-full bg-qc-surface border-2 border-qc-border p-3 font-mono font-bold resize-none focus:ring-2 focus:ring-qc-accent-primary"/>
          <button data-testid="post-story-btn" onClick={createStory} disabled={!content.trim()}
            className="w-full border-2 border-qc-border bg-qc-accent-tertiary font-mono font-bold uppercase py-3 flex items-center justify-center gap-2 shadow-[4px_4px_0px_#0A0A0A] hover:-translate-y-1 hover:shadow-[6px_6px_0px_#0A0A0A] active:translate-y-1 active:translate-x-1 active:shadow-none transition-all disabled:opacity-50">
            <Send size={16}/> TRANSMIT
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader size={24} className="text-qc-text-primary animate-spin"/></div>
        ) : stories.length === 0 ? (
          <div className="border-4 border-qc-border bg-qc-bg p-6 shadow-brutal text-center">
            <Radio size={32} className="mx-auto mb-2"/>
            <p className="font-heading font-black text-xl uppercase mb-1">NO_SIGNALS</p>
            <p className="font-mono text-xs font-bold uppercase text-qc-text-secondary">Wait for incoming broadcasts.</p>
          </div>
        ) : stories.map((s, i) => (
          <button key={s.user_id} data-testid={`story-${s.user_id}`} onClick={() => openStory(s)}
            className="w-full flex items-center gap-4 p-3 border-2 border-qc-border bg-qc-bg hover:bg-qc-accent-tertiary hover:shadow-[4px_4px_0px_#0A0A0A] hover:-translate-y-1 transition-all text-left">
            <div className="w-14 h-14 border-4 border-qc-accent-primary bg-qc-surface flex items-center justify-center overflow-hidden rotate-2">
              {s.user_avatar ? <img src={s.user_avatar} alt={s.user_name} className="w-full h-full object-cover grayscale contrast-125 -rotate-2"/> : <User size={24}/>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold font-mono uppercase truncate">{s.user_name}</p>
              <p className="text-[10px] font-mono font-bold uppercase text-qc-text-primary mt-1 border-2 border-qc-border px-1 w-max bg-qc-surface shadow-[1px_1px_0px_#0A0A0A]">{s.stories.length}_ITEMS</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
