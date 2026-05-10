import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Video, Heart, MessageCircle, X, Plus } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { API } from '../lib/api';

export default function Reels({ userId }) {
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newReelUrl, setNewReelUrl] = useState('');
  const [newReelCaption, setNewReelCaption] = useState('');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showComments, setShowComments] = useState(null);
  const [commentText, setCommentText] = useState('');
  const token = localStorage.getItem('qc_token');
  const containerRef = useRef(null);

  useEffect(() => {
    loadReels();
  }, []);

  const loadReels = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/reels`, { headers });
      setReels(data.reels || []);
    } catch {}
    setLoading(false);
  };

  const createReel = async () => {
    if (!newReelUrl.trim()) return;
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/api/reels`, { media_url: newReelUrl, caption: newReelCaption }, { headers });
      setNewReelUrl('');
      setNewReelCaption('');
      setShowCreate(false);
      loadReels();
    } catch {}
  };

  const handleLike = async (reelId) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.post(`${API}/api/reels/${reelId}/like`, {}, { headers });
      setReels(prev => prev.map(r => {
        if (r.id === reelId) {
          return { ...r, is_liked: data.is_liked, likes_count: data.likes_count };
        }
        return r;
      }));
    } catch {}
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || !showComments) return;
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.post(`${API}/api/reels/${showComments}/comment`, { text: commentText }, { headers });
      setReels(prev => prev.map(r => {
        if (r.id === showComments) {
          return { ...r, comments: [...r.comments, data.comment] };
        }
        return r;
      }));
      setCommentText('');
    } catch {}
  };

  const handleScroll = (e) => {
    const { scrollTop, clientHeight } = e.target;
    const index = Math.round(scrollTop / clientHeight);
    if (index !== currentIdx) {
      setCurrentIdx(index);
    }
  };

  if (loading) return <div className="h-full flex items-center justify-center text-qc-text-secondary">Loading...</div>;

  return (
    <div data-testid="reels-panel" className="flex flex-col h-full bg-black relative">
      <div className="absolute top-0 left-0 right-0 z-10 p-4 flex items-center justify-between bg-gradient-to-b from-black/60 to-transparent">
        <div>
          <p className="text-[10px] uppercase tracking-[0.24em] text-white/60">Spotlight</p>
          <h2 className="font-heading font-bold text-lg text-white drop-shadow-md">Reels</h2>
        </div>
        <button data-testid="create-reel-btn" onClick={() => setShowCreate(!showCreate)} className="w-8 h-8 flex items-center justify-center bg-white/20 hover:bg-white/30 backdrop-blur-md rounded-full text-white transition-colors">
          <Plus size={16}/>
        </button>
      </div>

      {showCreate && (
        <div className="absolute top-16 left-4 right-4 z-20 p-4 rounded-lg bg-qc-elevated border border-qc-border shadow-2xl space-y-3">
          <div className="flex justify-between items-center mb-2">
            <span className="font-mono text-[10px] text-qc-accent uppercase tracking-[0.24em]">Create Reel</span>
            <button onClick={() => setShowCreate(false)} className="text-white"><X size={14}/></button>
          </div>
          <input type="text" value={newReelUrl} onChange={e => setNewReelUrl(e.target.value)} placeholder="Video or Image URL" className="w-full bg-qc-surface border border-qc-border text-white text-sm px-3 py-2" />
          <textarea value={newReelCaption} onChange={e => setNewReelCaption(e.target.value)} placeholder="Caption..." rows={2} className="w-full bg-qc-surface border border-qc-border text-white text-sm px-3 py-2 resize-none" />
          <button onClick={createReel} disabled={!newReelUrl} className="w-full bg-qc-accent text-white py-2 text-sm disabled:opacity-50">Post</button>
        </div>
      )}

      <div ref={containerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto snap-y snap-mandatory hide-scrollbar">
        {reels.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center px-6">
            <Video size={32} className="text-white/40 mb-3" />
            <p className="text-white text-sm">No reels yet</p>
            <p className="text-white/60 text-xs mt-2">Post a quick image or video URL to start your Spotlight feed.</p>
          </div>
        ) : (
          reels.map((reel, idx) => (
            <div key={reel.id} className="h-full w-full snap-start relative flex flex-col justify-end bg-black">
              {reel.media_url.match(/\.(mp4|webm|ogg)$/i) ? (
                <video src={reel.media_url} className="absolute inset-0 w-full h-full object-cover" autoPlay={idx === currentIdx} loop muted playsInline />
              ) : (
                <img src={reel.media_url} className="absolute inset-0 w-full h-full object-cover" alt="reel" />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />
              
              <div className="relative z-10 p-4 flex items-end justify-between w-full h-full">
                <div className="flex-1 min-w-0 pr-12 pb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <img src={reel.user_avatar || 'https://via.placeholder.com/150'} alt="" className="w-8 h-8 rounded-full border border-white/30" />
                    <span className="text-white font-medium text-sm drop-shadow">{reel.user_name}</span>
                  </div>
                  <p className="text-white text-sm line-clamp-2 drop-shadow">{reel.caption}</p>
                </div>
                
                <div className="flex flex-col items-center gap-4 pb-4 w-12 flex-shrink-0">
                  <button onClick={() => handleLike(reel.id)} className="flex flex-col items-center gap-1 group">
                    <div className="w-10 h-10 rounded-full bg-black/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/40 transition">
                      <Heart size={22} className={reel.is_liked ? "text-red-500 fill-red-500" : "text-white"} />
                    </div>
                    <span className="text-white text-xs drop-shadow font-mono">{reel.likes_count}</span>
                  </button>
                  <button onClick={() => setShowComments(reel.id)} className="flex flex-col items-center gap-1 group">
                    <div className="w-10 h-10 rounded-full bg-black/20 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/40 transition">
                      <MessageCircle size={22} className="text-white" />
                    </div>
                    <span className="text-white text-xs drop-shadow font-mono">{reel.comments.length}</span>
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showComments && (
        <div className="absolute inset-x-0 bottom-0 top-1/3 bg-qc-surface rounded-t-xl z-30 flex flex-col shadow-2xl border-t border-qc-border animate-slideUp">
          <div className="p-3 border-b border-qc-border flex items-center justify-between bg-qc-elevated rounded-t-xl">
            <span className="text-white text-sm font-medium">Comments</span>
            <button onClick={() => setShowComments(null)} className="text-qc-text-secondary"><X size={18}/></button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {reels.find(r => r.id === showComments)?.comments.map(c => (
              <div key={c.id} className="flex gap-2">
                <div className="w-7 h-7 rounded bg-qc-highlight flex-shrink-0 flex items-center justify-center text-xs text-white uppercase">{c.user_name[0]}</div>
                <div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-white text-xs font-medium">{c.user_name}</span>
                    <span className="text-qc-text-tertiary text-[10px] font-mono">{formatDistanceToNow(new Date(c.created_at))} ago</span>
                  </div>
                  <p className="text-qc-text-secondary text-sm">{c.text}</p>
                </div>
              </div>
            ))}
          </div>
          <form onSubmit={handleComment} className="p-3 border-t border-qc-border flex gap-2">
            <input type="text" value={commentText} onChange={e => setCommentText(e.target.value)} placeholder="Add a comment..." className="flex-1 bg-qc-elevated border border-qc-border rounded-full px-3 py-1.5 text-sm text-white" />
            <button type="submit" disabled={!commentText.trim()} className="text-qc-accent text-sm font-medium px-2 disabled:opacity-50">Post</button>
          </form>
        </div>
      )}
    </div>
  );
}
