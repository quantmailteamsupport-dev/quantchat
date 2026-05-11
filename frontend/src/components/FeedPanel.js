import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { API } from '../lib/api';
import ChannelHub from './ChannelHub';
import { Camera, Heart, MessageCircle, PlusSquare, Send, Bookmark, MapPinned, Compass, Grid3X3, Search, MoreHorizontal } from 'lucide-react';

function formatNumber(value) {
  if (!value) return '0';
  if (value > 999) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

export default function FeedPanel({ token, onOpenCamera }) {
  const [posts, setPosts] = useState([]);
  const [stories, setStories] = useState([]);
  const [mode, setMode] = useState('feed');
  const [composerOpen, setComposerOpen] = useState(false);
  const [content, setContent] = useState('');
  const [mediaUrl, setMediaUrl] = useState('');
  const [posting, setPosting] = useState(false);
  const [likedPosts, setLikedPosts] = useState({});
  const [savedPosts, setSavedPosts] = useState({});
  const [commentPostId, setCommentPostId] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const loadFeed = async () => {
    try {
      const [{ data: postsData }, { data: storiesData }] = await Promise.all([
        axios.get(`${API}/api/posts`, { headers }),
        axios.get(`${API}/api/stories`, { headers }),
      ]);
      setPosts(postsData.posts || []);
      setStories(storiesData.stories || []);
    } catch {
      setPosts([]);
      setStories([]);
    }
  };

  useEffect(() => {
    loadFeed();
  }, [token]);

  const createPost = async () => {
    if (!content.trim()) return;
    setPosting(true);
    try {
      await axios.post(`${API}/api/posts`, {
        content: content.trim(),
        media_url: mediaUrl.trim(),
        visibility: 'public',
        audience: 'public',
        location_label: 'Quant public feed',
      }, { headers });
      setContent('');
      setMediaUrl('');
      setComposerOpen(false);
      await loadFeed();
    } catch {}
    setPosting(false);
  };

  const mapPins = useMemo(() => posts.filter((post) => post.lat && post.lng).slice(0, 8), [posts]);
  const storyRail = stories.slice(0, 10);

  return (
    <div data-testid="feed-panel" className="safe-scroll-shell h-full bg-[#050608] text-white">
      <div className="premium-divider md:sticky md:top-0 md:z-20 border-b border-white/8 bg-[rgba(5,6,8,0.92)] backdrop-blur-2xl">
        <div className="mx-auto max-w-[860px] px-4 pt-4 pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.28em] text-white/36">Quant social</div>
              <h2 className="mt-1 font-heading text-3xl text-white">Feed</h2>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" data-testid="feed-open-camera-button" onClick={onOpenCamera} className="h-11 w-11 rounded-full border border-white/10 bg-white/5 text-white flex items-center justify-center hover:bg-white/10">
                <Camera size={17} />
              </button>
              <button type="button" data-testid="feed-open-composer-button" onClick={() => setComposerOpen((value) => !value)} className="h-11 w-11 rounded-full border border-white/10 bg-white text-black flex items-center justify-center">
                <PlusSquare size={18} />
              </button>
            </div>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto hide-scrollbar">
            {[
              { id: 'feed', label: 'Feed', icon: Compass },
              { id: 'discover', label: 'Discover', icon: Search },
              { id: 'map', label: 'Map', icon: MapPinned },
              { id: 'channels', label: 'Channels', icon: Grid3X3 },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                data-testid={`feed-mode-${id}`}
                onClick={() => setMode(id)}
                className={`shrink-0 rounded-full px-4 py-2.5 text-sm border inline-flex items-center gap-2 ${mode === id ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.04] text-white/72 hover:bg-white/8'}`}
              >
                <Icon size={14} />
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-[860px] px-4 pb-[calc(env(safe-area-inset-bottom)+7rem)] md:pb-8">
        {mode === 'channels' ? (
          <div className="py-4"><ChannelHub token={token} /></div>
        ) : mode === 'map' ? (
          <div className="py-4 space-y-4">
            <div className="rounded-[34px] border border-white/10 bg-[linear-gradient(180deg,#09131f,#06080f)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.24em] text-white/42">Live snap map</div>
                  <h3 className="mt-2 text-2xl font-semibold text-white">Quantum footprints</h3>
                  <p className="mt-2 max-w-md text-sm leading-6 text-white/58">Friends, creators, and channels ki recent public activity yahin dikh rahi hai — clean map style me.</p>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/58">{mapPins.length} active pins</div>
              </div>

              <div className="relative mt-5 min-h-[520px] overflow-hidden rounded-[30px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(45,139,255,0.16),transparent_28%),linear-gradient(180deg,#0c1824,#0a1016)]">
                <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
                {mapPins.map((post, index) => (
                  <div key={post.id} data-testid={`map-pin-${post.id}`} className="absolute" style={{ top: `${18 + (index % 4) * 17}%`, left: `${16 + (index % 3) * 27}%` }}>
                    <div className="h-5 w-5 rounded-full bg-white shadow-[0_0_0_6px_rgba(255,255,255,0.08)]" />
                    <div className="mt-3 w-44 rounded-[20px] border border-white/10 bg-black/55 px-3 py-3 backdrop-blur-xl">
                      <div className="text-xs uppercase tracking-[0.2em] text-white/42">{post.location_label || 'Live'}</div>
                      <div className="mt-2 line-clamp-3 text-sm leading-6 text-white/84">{post.content}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="py-4 space-y-5">
            <section className="flex gap-4 overflow-x-auto hide-scrollbar pb-1">
              <button type="button" data-testid="feed-add-story-card" onClick={onOpenCamera} className="shrink-0 flex flex-col items-center gap-2 text-center">
                <div className="h-20 w-20 rounded-[28px] border border-dashed border-white/16 bg-white/[0.04] flex items-center justify-center text-white/72">
                  <PlusSquare size={22} />
                </div>
                <span className="text-xs text-white/56">New story</span>
              </button>
              {storyRail.map((story) => (
                <button key={story.user_id} data-testid={`feed-story-${story.user_id}`} className="shrink-0 flex flex-col items-center gap-2 text-center">
                  <div className="rounded-[30px] bg-[linear-gradient(135deg,#facc15,#f97316,#ef4444)] p-[2px] shadow-[0_10px_30px_rgba(249,115,22,0.18)]">
                    <div className="h-20 w-20 overflow-hidden rounded-[28px] bg-black">
                      {story.user_avatar ? <img src={story.user_avatar} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-white/70">{story.user_name?.[0] || 'Q'}</div>}
                    </div>
                  </div>
                  <span className="max-w-[74px] truncate text-xs text-white/56">{story.user_name}</span>
                </button>
              ))}
            </section>

            {composerOpen && (
              <section className="premium-surface rounded-[34px] border p-5 shadow-[0_24px_60px_rgba(0,0,0,0.25)]">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.24em] text-white/42">Create post</div>
                    <h3 className="mt-1 text-xl font-semibold text-white">Share to your Quant feed</h3>
                  </div>
                  <button type="button" data-testid="feed-close-composer" onClick={() => setComposerOpen(false)} className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white/64">Close</button>
                </div>
                <textarea data-testid="feed-post-input" value={content} onChange={(event) => setContent(event.target.value)} rows={4} placeholder="Write a caption, launch note, or visual update..." className="mt-4 w-full rounded-[24px] border border-white/10 bg-black/25 px-4 py-4 text-sm text-white placeholder:text-white/28 resize-none" />
                <input data-testid="feed-media-url-input" value={mediaUrl} onChange={(event) => setMediaUrl(event.target.value)} placeholder="Paste image URL (optional)" className="mt-3 w-full rounded-[20px] border border-white/10 bg-black/25 px-4 py-3 text-sm text-white placeholder:text-white/28" />
                <div className="mt-4 flex items-center justify-between gap-3">
                  <div className="text-sm text-white/48">Instagram-style post composer, cleaned for QuantChat.</div>
                  <button type="button" data-testid="feed-post-submit" onClick={createPost} disabled={posting || !content.trim()} className="h-12 rounded-full bg-white px-5 text-sm font-semibold text-black disabled:opacity-40">
                    {posting ? 'Publishing...' : 'Publish'}
                  </button>
                </div>
              </section>
            )}

            <section className="space-y-5">
              {posts.map((post) => {
                const liked = Boolean(likedPosts[post.id]);
                const saved = Boolean(savedPosts[post.id]);
                return (
                  <article key={post.id} data-testid={`feed-post-${post.id}`} className="overflow-hidden rounded-[36px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.05),rgba(255,255,255,0.025))] shadow-[0_24px_60px_rgba(0,0,0,0.24)]">
                    <div className="flex items-center gap-3 px-4 py-3.5">
                      <div className="h-11 w-11 overflow-hidden rounded-full bg-white/6 ring-1 ring-white/10">
                        {post.user_avatar ? <img src={post.user_avatar} alt="" className="h-full w-full object-cover" /> : <div className="h-full w-full flex items-center justify-center text-white/65">{post.user_name?.[0] || 'Q'}</div>}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-white">{post.user_name}</div>
                        <div className="truncate text-xs text-white/48">{post.location_label || 'Quant public lane'}</div>
                      </div>
                      <button type="button" data-testid={`feed-post-menu-${post.id}`} className="h-10 w-10 rounded-full bg-white/[0.04] text-white/72 flex items-center justify-center">
                        <MoreHorizontal size={18} />
                      </button>
                    </div>

                    {post.media_url ? (
                      <div className="overflow-hidden bg-black">
                        <img src={post.media_url} alt="" className="w-full aspect-square object-cover" />
                      </div>
                    ) : (
                      <div className="aspect-square px-6 py-8 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.05),transparent_30%),linear-gradient(180deg,#0c0f16,#08090d)] flex items-end">
                        <div className="max-w-[85%] text-[clamp(1.6rem,4vw,2.5rem)] font-semibold leading-tight text-white">{post.content}</div>
                      </div>
                    )}

                    <div className="px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5">
                          <button type="button" data-testid={`feed-like-${post.id}`} onClick={() => setLikedPosts((current) => ({ ...current, [post.id]: !current[post.id] }))} className={`h-11 w-11 rounded-full border ${liked ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.04] text-white/78'} flex items-center justify-center`}>
                            <Heart size={18} className={liked ? 'fill-black' : ''} />
                          </button>
                          <button type="button" data-testid={`feed-comment-${post.id}`} onClick={() => setCommentPostId(commentPostId === post.id ? '' : post.id)} className="h-11 w-11 rounded-full border border-white/10 bg-white/[0.04] text-white/78 flex items-center justify-center">
                            <MessageCircle size={18} />
                          </button>
                          <button type="button" data-testid={`feed-share-${post.id}`} className="h-11 w-11 rounded-full border border-white/10 bg-white/[0.04] text-white/78 flex items-center justify-center">
                            <Send size={17} />
                          </button>
                        </div>
                        <button type="button" data-testid={`feed-save-${post.id}`} onClick={() => setSavedPosts((current) => ({ ...current, [post.id]: !current[post.id] }))} className={`h-11 w-11 rounded-full border ${saved ? 'border-white bg-white text-black' : 'border-white/10 bg-white/[0.04] text-white/78'} flex items-center justify-center`}>
                          <Bookmark size={18} className={saved ? 'fill-black' : ''} />
                        </button>
                      </div>

                      <div className="mt-4 text-sm font-medium text-white">{formatNumber(post.likes_count + (liked ? 1 : 0))} likes</div>
                      <div className="mt-2 text-sm leading-6 text-white/84">
                        <span className="mr-2 font-semibold text-white">{post.user_name}</span>
                        {post.content}
                      </div>
                      <button type="button" data-testid={`feed-comments-toggle-${post.id}`} onClick={() => setCommentPostId(commentPostId === post.id ? '' : post.id)} className="mt-3 text-sm text-white/46">
                        View all {formatNumber(post.comments_count)} comments
                      </button>

                      {commentPostId === post.id && (
                        <div className="mt-3 rounded-[22px] border border-white/10 bg-black/20 p-4 text-sm text-white/62">
                          Comment UI polish next pass me aur deep kar raha hoon — abhi structure ready hai.
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
