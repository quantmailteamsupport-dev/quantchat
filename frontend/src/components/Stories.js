import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Radio, Plus, User, X, Send, Loader } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { API } from '../lib/api';
const COLORS = ['#0066FF', '#FF3333', '#00FF66', '#FF6600', '#9933FF', '#FF0099', '#00CCFF'];

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
    <div data-testid="stories-panel" className="flex flex-col h-full relative">
      {/* Story Viewer */}
      {viewStory && (
        <div className="absolute inset-0 z-50 bg-black flex flex-col" onClick={nextStory}>
          <div className="p-3 flex items-center gap-2 z-10">
            <div className="w-8 h-8 rounded-md overflow-hidden bg-qc-highlight flex items-center justify-center">
              {viewStory.user_avatar ? <img src={viewStory.user_avatar} alt="" className="w-full h-full object-cover"/> : <User size={14} className="text-qc-text-secondary"/>}
            </div>
            <div className="flex-1">
              <p className="text-sm text-white font-medium">{viewStory.user_name}</p>
              <p className="text-[10px] text-qc-text-tertiary font-mono">
                {viewStory.stories[storyIdx]?.created_at ? formatDistanceToNow(new Date(viewStory.stories[storyIdx].created_at), {addSuffix: true}) : ''}
              </p>
            </div>
            <button onClick={(e) => { e.stopPropagation(); setViewStory(null); }} className="text-white"><X size={20}/></button>
          </div>
          {/* Progress bars */}
          <div className="flex gap-1 px-3">
            {viewStory.stories.map((_, i) => (
              <div key={i} className="flex-1 h-0.5 bg-white/20"><div className={`h-full ${i <= storyIdx ? 'bg-white' : ''}`} style={{width: i < storyIdx ? '100%' : i === storyIdx ? '100%' : '0%'}}/></div>
            ))}
          </div>
          <div className="flex-1 flex items-center justify-center p-8"
            style={{background: COLORS[viewStory.stories[storyIdx]?.content?.length % COLORS.length || 0]}}>
            <p className="text-white text-2xl font-heading font-bold text-center leading-relaxed max-w-md">{viewStory.stories[storyIdx]?.content}</p>
          </div>
        </div>
      )}

      <div className="p-4 border-b border-qc-border flex items-center justify-between">
        <h2 className="font-heading font-bold text-lg text-white">Stories</h2>
        <button data-testid="create-story-btn" onClick={() => setShowCreate(!showCreate)} className="w-8 h-8 flex items-center justify-center bg-qc-accent hover:bg-qc-accent-hover text-white transition-colors duration-150">
          <Plus size={16}/>
        </button>
      </div>

      {showCreate && (
        <div className="p-4 border-b border-qc-border bg-qc-elevated space-y-3">
          <span className="font-mono text-[10px] text-qc-accent tracking-widest uppercase">New Story</span>
          <textarea data-testid="story-input" value={content} onChange={e => setContent(e.target.value)} rows={3}
            placeholder="What's on your mind?" className="w-full bg-qc-surface border border-qc-border text-white text-sm px-3 py-2 resize-none focus:border-qc-accent transition-colors duration-150"/>
          <button data-testid="post-story-btn" onClick={createStory} disabled={!content.trim()}
            className="w-full bg-qc-accent hover:bg-qc-accent-hover text-white text-sm py-2 flex items-center justify-center gap-2 disabled:opacity-40 transition-colors duration-150">
            <Send size={14}/> Post Story
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-8"><Loader size={18} className="text-qc-accent animate-spin"/></div>
        ) : stories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-6">
            <Radio size={28} className="text-qc-text-tertiary mb-3"/>
            <p className="text-qc-text-secondary text-sm">No stories yet</p>
            <p className="text-qc-text-tertiary text-xs mt-1">Post a story to share with everyone</p>
          </div>
        ) : stories.map(s => (
          <button key={s.user_id} data-testid={`story-${s.user_id}`} onClick={() => openStory(s)}
            className="w-full flex items-center gap-3 px-4 py-3 border-b border-qc-border hover:bg-qc-elevated transition-colors duration-150 text-left">
            <div className="w-12 h-12 rounded-md overflow-hidden ring-2 ring-qc-accent ring-offset-2 ring-offset-qc-surface flex items-center justify-center bg-qc-highlight">
              {s.user_avatar ? <img src={s.user_avatar} alt={s.user_name} className="w-full h-full object-cover"/> : <User size={20} className="text-qc-text-secondary"/>}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-white truncate">{s.user_name} {s.user_id === userId ? '(You)' : ''}</p>
              <p className="text-xs text-qc-text-secondary">{s.stories.length} {s.stories.length === 1 ? 'story' : 'stories'}</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
