import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Video, Heart, MessageCircle, X, Plus, Sparkles, Play, Pause, Volume2, VolumeX, User, UploadCloud, Send, Link2 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { API } from '../lib/api';

const PREF_EVENT = 'qc-preferences-changed';

export default function Reels({ userId, onStartConversation }) {
  const [reels, setReels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [newReelUrl, setNewReelUrl] = useState('');
  const [newReelCaption, setNewReelCaption] = useState('');
  const [currentIdx, setCurrentIdx] = useState(0);
  const [showComments, setShowComments] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [autoplay, setAutoplay] = useState(localStorage.getItem('qc_pref_autoplay_reels') !== 'false');
  const [isMuted, setIsMuted] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [feedMode, setFeedMode] = useState('for_you');
  const [detailTab, setDetailTab] = useState('comments');
  const [shareStatus, setShareStatus] = useState('');
  const token = localStorage.getItem('qc_token');
  const containerRef = useRef(null);
  const uploadInputRef = useRef(null);
  const videoRefs = useRef({});

  useEffect(() => {
    loadReels();
  }, []);

  useEffect(() => {
    const syncPreference = () => setAutoplay(localStorage.getItem('qc_pref_autoplay_reels') !== 'false');
    window.addEventListener(PREF_EVENT, syncPreference);
    return () => window.removeEventListener(PREF_EVENT, syncPreference);
  }, []);

  const loadReels = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/reels`, { headers });
      setReels(data.reels || []);
    } catch {
      setReels([]);
    }
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

  const handleLocalMedia = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      setNewReelUrl(loadEvent.target?.result || '');
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleLike = async (reelId) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.post(`${API}/api/reels/${reelId}/like`, {}, { headers });
      setReels((previous) =>
        previous.map((reel) => (
          reel.id === reelId
            ? { ...reel, is_liked: data.is_liked, likes_count: data.likes_count }
            : reel
        ))
      );
    } catch {}
  };

  const handleComment = async (event) => {
    event.preventDefault();
    if (!commentText.trim() || !showComments) return;
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.post(`${API}/api/reels/${showComments}/comment`, { text: commentText }, { headers });
      setReels((previous) =>
        previous.map((reel) => (
          reel.id === showComments
            ? { ...reel, comments: [...reel.comments, data.comment] }
            : reel
        ))
      );
      setCommentText('');
    } catch {}
  };

  const handleScroll = (event) => {
    const { scrollTop, clientHeight } = event.target;
    const index = Math.round(scrollTop / clientHeight);
    if (index !== currentIdx) {
      setCurrentIdx(index);
    }
  };

  useEffect(() => {
    Object.entries(videoRefs.current).forEach(([key, element]) => {
      if (!element) return;
      const shouldPlay = Number(key) === currentIdx && autoplay && !isPaused;
      element.muted = isMuted;
      if (shouldPlay) {
        element.play().catch(() => {});
      } else {
        element.pause();
      }
    });
  }, [autoplay, currentIdx, isMuted, isPaused, reels.length]);

  const togglePlayback = () => {
    setIsPaused((current) => !current);
  };

  const handleMessageCreator = async (reel) => {
    if (!reel?.user_id || reel.user_id === userId || !onStartConversation) return;
    await onStartConversation(reel.user_id, `About your reel: ${reel.caption || 'Loved this drop'}`);
  };

  const visibleReels = useMemo(() => {
    if (feedMode === 'posted') {
      return reels.filter((reel) => reel.user_id === userId);
    }
    if (feedMode === 'trending') {
      return [...reels].sort((a, b) => (b.likes_count + b.comments.length) - (a.likes_count + a.comments.length));
    }
    return reels;
  }, [feedMode, reels, userId]);

  useEffect(() => {
    setCurrentIdx(0);
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'instant' });
    }
  }, [feedMode]);

  const currentReel = visibleReels[currentIdx];
  const yourReelsCount = useMemo(() => reels.filter((reel) => reel.user_id === userId).length, [reels, userId]);
  const spotlightCategories = [
    { id: 'for_you', label: 'For You' },
    { id: 'trending', label: 'Trending' },
    { id: 'posted', label: 'Posted' },
  ];

  const handleShare = async (reel) => {
    const shareUrl = `${window.location.origin}/?spotlight=${reel.id}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: reel.caption || 'QuantChat Spotlight', text: reel.caption || 'Check this drop', url: shareUrl });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
      }
      setShareStatus('Link copied');
    } catch {
      setShareStatus('Share cancelled');
    }
    window.setTimeout(() => setShareStatus(''), 1800);
  };

  if (loading) {
    return <div className="h-full flex items-center justify-center text-qc-text-secondary">Loading...</div>;
  }

  return (
    <div data-testid="reels-panel" className="flex flex-col h-full bg-[linear-gradient(180deg,#09111f_0%,#13203a_100%)] relative overflow-y-auto">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,107,61,0.18),transparent_28%),radial-gradient(circle_at_top_left,rgba(79,124,255,0.18),transparent_32%)] pointer-events-none" />

      <div className="relative z-10 px-4 py-4 sm:px-5 border-b border-white/10">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/55">Spotlight feed</p>
            <div className="flex items-center gap-2 mt-1">
              <Sparkles size={18} className="text-[#ff8f5a]" />
              <h2 className="font-heading text-2xl text-white">Reels</h2>
            </div>
          </div>

          <button
            data-testid="create-reel-btn"
            onClick={() => setShowCreate((value) => !value)}
            className="h-11 px-3 sm:px-4 rounded-2xl bg-white/10 hover:bg-white/16 border border-white/10 text-white transition-colors flex items-center gap-2 whitespace-nowrap"
          >
            <Plus size={16} />
            <span className="text-sm">New reel</span>
          </button>
        </div>

        <div className="flex gap-2 overflow-x-auto hide-scrollbar mt-4">
          {spotlightCategories.map((category) => (
            <button
              key={category.id}
              onClick={() => setFeedMode(category.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
                feedMode === category.id
                  ? 'border-white bg-white text-[#05070c]'
                  : 'border-white/14 bg-transparent text-white/85 hover:bg-white/8'
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/50">Feed size</p>
            <p className="text-xl font-semibold text-white mt-1">{visibleReels.length}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/50">Your posts</p>
            <p className="text-xl font-semibold text-white mt-1">{yourReelsCount}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-white/50">Playback</p>
            <p className="text-sm font-semibold text-white mt-2">{autoplay ? 'Autoplay on' : 'Tap to play'}</p>
          </div>
        </div>
      </div>

      {showCreate && (
        <div className="absolute inset-0 z-20 bg-[#020814]/72 backdrop-blur-sm flex items-end md:items-start md:justify-end" onClick={() => setShowCreate(false)}>
          <div className="w-full md:w-[420px] md:mt-28 md:mr-5 max-h-[100dvh] md:max-h-[min(760px,88dvh)] rounded-t-[28px] md:rounded-[28px] bg-[#0e1930] border border-white/10 shadow-[0_30px_90px_rgba(0,0,0,0.34)] flex flex-col overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <div className="flex justify-between items-center p-5 border-b border-white/10 flex-shrink-0">
              <span className="font-heading text-lg text-white">Create Reel</span>
              <button onClick={() => setShowCreate(false)} className="text-white/75 hover:text-white">
                <X size={16} />
              </button>
            </div>
            <div className="p-5 space-y-4 flex-1 overflow-y-auto pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
              <input type="file" accept="video/*,image/*" ref={uploadInputRef} className="hidden" onChange={handleLocalMedia} />
              <button
                type="button"
                onClick={() => uploadInputRef.current?.click()}
                className="w-full rounded-2xl border border-dashed border-white/15 bg-white/5 px-4 py-4 text-left text-white/80 hover:bg-white/10 transition-colors flex items-center gap-3"
              >
                <UploadCloud size={18} />
                <span className="text-sm">Upload from device</span>
              </button>
              <input
                type="text"
                value={newReelUrl}
                onChange={(event) => setNewReelUrl(event.target.value)}
                placeholder="Video or image URL"
                className="w-full bg-white/8 border border-white/10 text-white text-sm px-4 py-3 rounded-2xl"
              />
              <textarea
                value={newReelCaption}
                onChange={(event) => setNewReelCaption(event.target.value)}
                placeholder="Caption..."
                rows={4}
                className="w-full bg-white/8 border border-white/10 text-white text-sm px-4 py-3 resize-none rounded-2xl"
              />
              {newReelUrl && (
                <div className="rounded-[24px] overflow-hidden border border-white/10 bg-black/30">
                  {/\.(mp4|webm|ogg)$/i.test(newReelUrl) || newReelUrl.startsWith('data:video') ? (
                    <video src={newReelUrl} className="w-full max-h-56 object-cover" controls muted playsInline />
                  ) : (
                    <img src={newReelUrl} alt="Reel preview" className="w-full max-h-56 object-cover" />
                  )}
                </div>
              )}
            </div>
            <div className="p-5 pt-4 border-t border-white/10 bg-[#0e1930] flex-shrink-0 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">
              <button
                onClick={createReel}
                disabled={!newReelUrl}
                className="w-full bg-qc-accent-primary hover:bg-qc-accent-secondary text-white py-3 rounded-2xl text-sm disabled:opacity-50"
              >
                Publish reel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative z-10 flex-1 overflow-hidden px-4 py-5 sm:px-5 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] md:pb-6">
        {visibleReels.length === 0 ? (
          <div className="h-full rounded-[32px] border border-white/10 bg-white/5 flex flex-col items-center justify-center text-center px-6">
            <Video size={34} className="text-white/40 mb-3" />
            <p className="text-white text-base font-medium">No reels yet</p>
            <p className="text-white/60 text-sm mt-2 max-w-sm">Drop a media URL and turn Spotlight into a vertical showcase for the team.</p>
          </div>
        ) : (
          <div className="h-full grid grid-cols-1 xl:grid-cols-[300px_minmax(0,1fr)] gap-5">
            <div className="hidden xl:flex flex-col gap-4">
              <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/50">Now playing</p>
                <p className="text-white text-lg font-semibold mt-2 line-clamp-2">{currentReel?.caption || 'Untitled reel'}</p>
                <p className="text-white/60 text-sm mt-2">{currentReel?.user_name || 'Unknown creator'}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] text-white/74">Comments {currentReel?.comments?.length || 0}</span>
                  <span className="rounded-full border border-white/10 bg-white/8 px-3 py-1 text-[11px] text-white/74">Likes {currentReel?.likes_count || 0}</span>
                </div>
                {currentReel?.user_id !== userId && (
                  <button
                    onClick={() => handleMessageCreator(currentReel)}
                    className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/16 transition-colors"
                  >
                    <Send size={14} />
                    Message creator
                  </button>
                )}
              </div>

              <div className="rounded-[28px] border border-white/10 bg-white/5 p-4">
                <p className="text-[10px] uppercase tracking-[0.22em] text-white/50 mb-3">Queue</p>
                <div className="space-y-2">
                  {visibleReels.slice(0, 5).map((reel, index) => (
                    <button
                      key={reel.id}
                      onClick={() => {
                        setCurrentIdx(index);
                        containerRef.current?.scrollTo({ top: containerRef.current.clientHeight * index, behavior: 'smooth' });
                      }}
                      className={`w-full rounded-2xl border px-3 py-3 text-left transition-colors ${
                        currentIdx === index
                          ? 'border-white/20 bg-white/14 text-white'
                          : 'border-white/10 bg-white/5 text-white/72 hover:bg-white/10'
                      }`}
                    >
                      <p className="text-sm font-medium truncate">{reel.caption || 'Untitled reel'}</p>
                      <p className="text-[11px] text-white/55 mt-1">{reel.user_name}</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div ref={containerRef} onScroll={handleScroll} className="h-full overflow-y-auto snap-y snap-mandatory hide-scrollbar">
              {visibleReels.map((reel, index) => {
                const isVideo = /\.(mp4|webm|ogg)$/i.test(reel.media_url) || reel.media_url.startsWith('data:video');
                return (
                  <div key={reel.id} className="h-full snap-start flex items-center justify-center pb-4">
                    <div className="relative w-full max-w-[430px] h-full min-h-[min(520px,calc(100dvh-270px))] rounded-[34px] overflow-hidden border border-white/10 shadow-[0_30px_90px_rgba(0,0,0,0.38)] bg-black">
                      {isVideo ? (
                        <video
                          src={reel.media_url}
                          ref={(element) => {
                            videoRefs.current[index] = element;
                          }}
                          className="absolute inset-0 w-full h-full object-cover"
                          onClick={togglePlayback}
                          autoPlay={autoplay && index === currentIdx && !isPaused}
                          loop
                          muted={isMuted}
                          controls={!autoplay}
                          playsInline
                        />
                      ) : (
                        <img src={reel.media_url} className="absolute inset-0 w-full h-full object-cover" alt="reel" onClick={togglePlayback} />
                      )}

                      <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/18 to-transparent pointer-events-none" />

                      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10">
                        <div className="rounded-full border border-white/10 bg-black/25 backdrop-blur-md px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/75">
                          {index + 1} / {visibleReels.length}
                        </div>
                        <div className="rounded-full border border-white/10 bg-black/25 backdrop-blur-md px-3 py-1 text-[11px] uppercase tracking-[0.22em] text-white/75 flex items-center gap-2">
                          {isPaused ? <Pause size={12} /> : <Play size={12} />}
                          <span>{isPaused ? 'Paused' : autoplay ? 'Autoplay' : 'Manual'}</span>
                        </div>
                      </div>

                      <div className="relative z-10 p-5 flex items-end justify-between w-full h-full">
                        <div className="flex-1 min-w-0 pr-12 pb-4">
                          <div className="flex items-center gap-3 mb-3">
                            <div className="w-10 h-10 rounded-full overflow-hidden border border-white/20 bg-white/10 flex items-center justify-center">
                              {reel.user_avatar ? (
                                <img src={reel.user_avatar} alt="" className="w-full h-full object-cover" />
                              ) : (
                                <User size={16} className="text-white/80" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <span className="text-white font-medium text-sm block drop-shadow truncate">{reel.user_name}</span>
                              <span className="text-white/65 text-[11px]">
                                {formatDistanceToNow(new Date(reel.created_at), { addSuffix: true })}
                              </span>
                            </div>
                          </div>
                          <p className="text-white text-sm leading-relaxed drop-shadow whitespace-pre-wrap line-clamp-4">
                            {reel.caption || 'No caption'}
                          </p>
                        </div>

                        <div className="flex flex-col items-center gap-4 pb-4 w-12 flex-shrink-0">
                          <button onClick={() => setIsMuted((current) => !current)} className="flex flex-col items-center gap-1 group relative z-10">
                            <div className="w-11 h-11 rounded-full bg-black/22 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/40 transition">
                              {isMuted ? <VolumeX size={20} className="text-white" /> : <Volume2 size={20} className="text-white" />}
                            </div>
                            <span className="text-white text-[11px] drop-shadow font-mono">{isMuted ? 'Muted' : 'Sound'}</span>
                          </button>
                          {reel.user_id !== userId && (
                            <button onClick={() => handleMessageCreator(reel)} className="flex flex-col items-center gap-1 group relative z-10">
                              <div className="w-11 h-11 rounded-full bg-black/22 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/40 transition">
                                <Send size={20} className="text-white" />
                              </div>
                              <span className="text-white text-[11px] drop-shadow font-mono">Chat</span>
                            </button>
                          )}
                          <button onClick={() => handleShare(reel)} className="flex flex-col items-center gap-1 group relative z-10">
                            <div className="w-11 h-11 rounded-full bg-black/22 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/40 transition">
                              <Link2 size={20} className="text-white" />
                            </div>
                            <span className="text-white text-[11px] drop-shadow font-mono">Share</span>
                          </button>
                          <button onClick={() => handleLike(reel.id)} className="flex flex-col items-center gap-1 group relative z-10">
                            <div className="w-11 h-11 rounded-full bg-black/22 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/40 transition">
                              <Heart size={22} className={reel.is_liked ? 'text-red-500 fill-red-500' : 'text-white'} />
                            </div>
                            <span className="text-white text-xs drop-shadow font-mono">{reel.likes_count}</span>
                          </button>
                          <button onClick={() => setShowComments(reel.id)} className="flex flex-col items-center gap-1 group relative z-10">
                            <div className="w-11 h-11 rounded-full bg-black/22 backdrop-blur-sm flex items-center justify-center group-hover:bg-black/40 transition">
                              <MessageCircle size={22} className="text-white" />
                            </div>
                            <span className="text-white text-xs drop-shadow font-mono">{reel.comments.length}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {showComments && (
        <div className="absolute inset-x-0 bottom-0 top-1/3 bg-[#0f1a31] rounded-t-[32px] z-30 flex flex-col shadow-[0_-20px_70px_rgba(0,0,0,0.35)] border-t border-white/10 animate-slideUp">
          <div className="p-4 border-b border-white/10 bg-white/5 rounded-t-[32px]">
            <div className="flex items-center justify-between">
              <span className="text-white text-sm font-medium">Spotlight panel</span>
              <button onClick={() => setShowComments(null)} className="text-white/75">
                <X size={18} />
              </button>
            </div>
            <div className="mt-4 flex gap-2">
              {[
                { id: 'comments', label: 'Comments' },
                { id: 'up_next', label: 'Up Next' },
                { id: 'details', label: 'Details' },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setDetailTab(tab.id)}
                  className={`rounded-full px-3 py-1.5 text-sm ${
                    detailTab === tab.id
                      ? 'bg-white text-[#05070c]'
                      : 'bg-white/6 text-white/75'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          {detailTab === 'comments' && (
            <>
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {(visibleReels.find((reel) => reel.id === showComments)?.comments || []).map((comment) => (
                  <div key={comment.id} className="flex gap-3">
                    <div className="w-8 h-8 rounded-2xl bg-qc-highlight flex-shrink-0 flex items-center justify-center text-xs text-white uppercase">
                      {comment.user_name?.[0] || '?'}
                    </div>
                    <div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-white text-xs font-medium">{comment.user_name}</span>
                        <span className="text-white/45 text-[10px] font-mono">{formatDistanceToNow(new Date(comment.created_at))} ago</span>
                      </div>
                      <p className="text-white/72 text-sm">{comment.text}</p>
                    </div>
                  </div>
                ))}
              </div>
              <form onSubmit={handleComment} className="p-4 border-t border-white/10 flex gap-2">
                <input
                  type="text"
                  value={commentText}
                  onChange={(event) => setCommentText(event.target.value)}
                  placeholder="Add a comment..."
                  className="flex-1 bg-white/8 border border-white/10 rounded-full px-4 py-2 text-sm text-white"
                />
                <button type="submit" disabled={!commentText.trim()} className="text-qc-accent-primary text-sm font-medium px-2 disabled:opacity-50">
                  Post
                </button>
              </form>
            </>
          )}
          {detailTab === 'up_next' && (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3">
                {visibleReels.filter((reel) => reel.id !== showComments).slice(0, 6).map((reel) => (
                  <button
                    key={reel.id}
                    onClick={() => {
                      const nextIndex = visibleReels.findIndex((item) => item.id === reel.id);
                      setCurrentIdx(nextIndex);
                      setShowComments(null);
                      containerRef.current?.scrollTo({ top: containerRef.current.clientHeight * nextIndex, behavior: 'smooth' });
                    }}
                    className="rounded-[22px] overflow-hidden border border-white/10 bg-white/6 text-left"
                  >
                    <div className="aspect-[3/4] bg-black/25">
                      <img src={reel.media_url} alt="" className="w-full h-full object-cover" />
                    </div>
                    <div className="p-3">
                      <p className="text-sm text-white line-clamp-2">{reel.caption || 'Untitled reel'}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {detailTab === 'details' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm">
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <p className="text-white/50 uppercase tracking-[0.22em] text-[10px]">Creator</p>
                <p className="mt-2 text-white font-medium">{visibleReels.find((reel) => reel.id === showComments)?.user_name || 'Unknown creator'}</p>
              </div>
              <div className="rounded-[24px] border border-white/10 bg-white/5 p-4">
                <p className="text-white/50 uppercase tracking-[0.22em] text-[10px]">Caption</p>
                <p className="mt-2 text-white/80">{visibleReels.find((reel) => reel.id === showComments)?.caption || 'No caption added yet.'}</p>
              </div>
            </div>
          )}
        </div>
      )}
      {shareStatus && (
        <div className="absolute top-4 right-4 z-40 rounded-full border border-white/10 bg-black/55 px-4 py-2 text-sm text-white shadow-xl">
          {shareStatus}
        </div>
      )}
    </div>
  );
}
