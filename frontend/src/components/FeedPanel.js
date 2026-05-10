import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Compass, MapPinned, Plus, Camera, Sparkles } from 'lucide-react';
import { API } from '../lib/api';
import ChannelHub from './ChannelHub';

export default function FeedPanel({ token, onOpenCamera }) {
  const [posts, setPosts] = useState([]);
  const [mode, setMode] = useState('feed');
  const [content, setContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [posting, setPosting] = useState(false);

  const loadPosts = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/posts`, { headers });
      setPosts(data.posts || []);
    } catch {
      setPosts([]);
    }
  };

  useEffect(() => {
    loadPosts();
  }, [token]);

  const createPost = async () => {
    if (!content.trim()) return;
    setPosting(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/api/posts`, { content: content.trim(), media_url: mediaUrl.trim(), location_label: 'Live feed', visibility: 'public' }, { headers });
      setContent('');
      setMediaUrl('');
      await loadPosts();
    } catch {}
    setPosting(false);
  };

  const mapPins = useMemo(() => posts.filter((post) => post.lat && post.lng).slice(0, 6), [posts]);

  return (
    <div data-testid="feed-panel" className="flex flex-col h-full overflow-y-auto bg-[linear-gradient(180deg,#04070d,#090d17)]">
      <div className="px-4 py-4 border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent)]">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/46">Public lane</p>
            <h2 className="text-2xl font-semibold text-white mt-1">Feed</h2>
          </div>
          <button type="button" data-testid="feed-open-camera-button" onClick={onOpenCamera} className="h-11 px-4 rounded-2xl border border-white/10 bg-white/5 text-white inline-flex items-center gap-2">
            <Camera size={16} /> Camera
          </button>
        </div>
        <div className="mt-4 flex gap-2">
          {[
            { id: 'feed', label: 'Feed', icon: Compass },
            { id: 'map', label: 'Snap Map', icon: MapPinned },
            { id: 'channels', label: 'Channels', icon: Sparkles },
          ].map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" data-testid={`feed-mode-${id}`} onClick={() => setMode(id)} className={`rounded-full px-4 py-2 text-sm border inline-flex items-center gap-2 ${mode === id ? 'border-white bg-white text-black' : 'border-white/10 bg-white/5 text-white/76'}`}>
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 pb-[calc(env(safe-area-inset-bottom)+6.5rem)]">
        <section className="rounded-[30px] border border-white/10 bg-white/[0.04] p-4">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-white/46"><Sparkles size={12} /> Share publicly</div>
          <textarea data-testid="feed-post-input" value={content} onChange={(event) => setContent(event.target.value)} rows={3} placeholder="Post a public update, launch note, or location check-in" className="mt-3 w-full rounded-[22px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28 resize-none" />
          <input data-testid="feed-media-url-input" value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder="Optional image URL" className="mt-3 w-full rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
          <button type="button" data-testid="feed-post-submit" onClick={createPost} disabled={posting || !content.trim()} className="mt-3 h-11 px-4 rounded-full bg-white text-black font-medium disabled:opacity-40 inline-flex items-center gap-2">
            <Plus size={16} /> {posting ? 'Posting...' : 'Publish post'}
          </button>
        </section>

        {mode === 'channels' ? (
          <ChannelHub token={token} />
        ) : mode === 'map' ? (
          <section className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.04),rgba(255,255,255,0.02))] p-4 overflow-hidden">
            <div className="flex items-center justify-between gap-3 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/46">Live map</p>
                <h3 className="text-lg font-semibold text-white mt-1">Team footprints</h3>
              </div>
              <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-white/62">{mapPins.length} pins</div>
            </div>
            <div className="relative rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(0,229,255,0.12),transparent_25%),linear-gradient(180deg,#0a1320,#0e1623)] min-h-[360px] overflow-hidden">
              <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '44px 44px' }} />
              {mapPins.map((post, index) => (
                <div key={post.id} data-testid={`map-pin-${post.id}`} className="absolute" style={{ top: `${18 + (index % 4) * 18}%`, left: `${18 + (index % 3) * 26}%` }}>
                  <div className="h-4 w-4 rounded-full bg-[#00e5ff] shadow-[0_0_18px_rgba(0,229,255,0.45)]" />
                  <div className="mt-2 w-40 rounded-2xl border border-white/10 bg-black/45 px-3 py-2 text-xs text-white/72 backdrop-blur-xl">
                    <div className="font-medium text-white truncate">{post.location_label || 'Live check-in'}</div>
                    <div className="mt-1 line-clamp-2">{post.content}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <section className="space-y-4">
            {posts.map((post) => (
              <article key={post.id} data-testid={`feed-post-${post.id}`} className="rounded-[30px] border border-white/10 bg-[linear-gradient(145deg,rgba(14,18,29,0.98),rgba(18,25,41,0.96))] overflow-hidden shadow-[0_18px_48px_rgba(0,0,0,0.22)]">
                <div className="px-4 py-3 border-b border-white/8 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-2xl overflow-hidden bg-white/6">
                    {post.user_avatar ? <img src={post.user_avatar} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-white/65">{post.user_name?.[0] || 'Q'}</div>}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-white truncate">{post.user_name}</div>
                    <div className="text-[11px] uppercase tracking-[0.18em] text-white/42 truncate">{post.location_label || 'Public drop'}</div>
                  </div>
                </div>
                {post.media_url && <img src={post.media_url} alt="" className="w-full aspect-[4/3] object-cover" />}
                <div className="p-4">
                  <p className="text-sm leading-6 text-white/84">{post.content}</p>
                  <div className="mt-3 flex items-center gap-2 text-xs text-white/46">
                    <span>{post.likes_count} likes</span>
                    <span>•</span>
                    <span>{post.comments_count} comments</span>
                  </div>
                </div>
              </article>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}