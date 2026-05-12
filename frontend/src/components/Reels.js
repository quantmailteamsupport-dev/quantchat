import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import {
  Heart,
  Link2,
  MessageCircle,
  Pause,
  Play,
  Plus,
  Send,
  Sparkles,
  UploadCloud,
  User,
  Video,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { API } from '../lib/api';

const PREF_EVENT = 'qc-preferences-changed';

function isVideoUrl(url = '') {
  return /\.(mp4|webm|ogg|mov|m4v)$/i.test(url) || url.startsWith('data:video');
}

function MetricPill({ children }) {
  return (
    <span className="rounded-full border border-white/12 bg-black/35 px-3 py-1.5 text-[11px] font-mono uppercase tracking-[0.18em] text-white/72 backdrop-blur-xl">
      {children}
    </span>
  );
}

function ReelActionButton({ dataTestId, icon, label, value, onClick }) {
  return (
    <button
      type="button"
      data-testid={dataTestId}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="group flex flex-col items-center gap-1.5"
    >
      <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-black/35 text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-colors group-hover:bg-black/55">
        {icon}
      </div>
      <span className="min-h-[16px] text-[11px] font-mono text-white drop-shadow">{value ?? label}</span>
    </button>
  );
}

function CreateReelSheet({
  newReelCaption,
  newReelUrl,
  onCaptionChange,
  onClose,
  onOpenUploader,
  onPublish,
  onSelectUpload,
  onUrlChange,
  uploadInputRef,
}) {
  return (
    <div
      className="absolute inset-0 z-40 flex items-end bg-black/72 backdrop-blur-md"
      onClick={onClose}
    >
      <div
        data-testid="create-reel-sheet"
        className="w-full rounded-t-[34px] border-t border-white/10 bg-[#08090d] shadow-[0_-28px_90px_rgba(0,0,0,0.38)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pb-4 pt-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.26em] text-white/38">Spotlight studio</div>
            <h3 className="mt-2 font-heading text-2xl text-white">Create Reel</h3>
          </div>
          <button
            type="button"
            data-testid="create-reel-close-button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/78"
          >
            <X size={16} />
          </button>
        </div>

        <div className="space-y-4 px-5 pb-[calc(env(safe-area-inset-bottom)+1.25rem)]">
          <input
            ref={uploadInputRef}
            type="file"
            accept="video/*,image/*"
            className="hidden"
            onChange={onSelectUpload}
          />

          <button
            type="button"
            data-testid="create-reel-upload-button"
            onClick={onOpenUploader}
            className="flex w-full items-center gap-3 rounded-[28px] border border-dashed border-white/12 bg-white/[0.04] px-4 py-4 text-left text-white/84 transition-colors hover:bg-white/[0.08]"
          >
            <UploadCloud size={18} />
            <span className="text-sm">Upload from device</span>
          </button>

          <input
            type="text"
            data-testid="create-reel-url-input"
            value={newReelUrl}
            onChange={(event) => onUrlChange(event.target.value)}
            placeholder="Paste image/video URL"
            className="w-full rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/28"
          />

          <textarea
            data-testid="create-reel-caption-input"
            value={newReelCaption}
            onChange={(event) => onCaptionChange(event.target.value)}
            rows={4}
            placeholder="Write a caption for your Spotlight drop..."
            className="w-full resize-none rounded-[24px] border border-white/10 bg-white/[0.04] px-4 py-4 text-sm text-white placeholder:text-white/28"
          />

          {newReelUrl && (
            <div className="overflow-hidden rounded-[28px] border border-white/10 bg-black/30">
              <div className="aspect-[9/16] w-full bg-black">
                {isVideoUrl(newReelUrl) ? (
                  <video src={newReelUrl} className="h-full w-full object-cover" controls muted playsInline />
                ) : (
                  <img src={newReelUrl} alt="Reel preview" className="h-full w-full object-cover" />
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            data-testid="create-reel-publish-button"
            onClick={onPublish}
            disabled={!newReelUrl.trim()}
            className="h-12 w-full rounded-full bg-white text-sm font-semibold text-black transition-opacity disabled:opacity-40"
          >
            Publish reel
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentsSheet({
  commentText,
  detailTab,
  onClose,
  onCommentChange,
  onSubmit,
  onTabChange,
  reel,
  visibleReels,
  onJumpToReel,
}) {
  return (
    <div className="absolute inset-x-0 bottom-0 top-[28%] z-40 flex flex-col rounded-t-[34px] border-t border-white/10 bg-[#08090d] shadow-[0_-28px_90px_rgba(0,0,0,0.38)]">
      <div className="rounded-t-[34px] border-b border-white/8 bg-white/[0.03] px-4 pb-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.24em] text-white/40">Spotlight panel</div>
            <div className="mt-2 text-base font-semibold text-white">{reel?.user_name || 'Creator'} · details</div>
          </div>
          <button
            type="button"
            data-testid="reels-comments-close-button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/78"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-4 flex gap-2 overflow-x-auto hide-scrollbar">
          {[
            { id: 'comments', label: 'Comments' },
            { id: 'up_next', label: 'Up next' },
            { id: 'details', label: 'Details' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-testid={`spotlight-detail-tab-${tab.id}`}
              onClick={() => onTabChange(tab.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm ${
                detailTab === tab.id
                  ? 'border-white bg-white text-black'
                  : 'border-white/10 bg-white/[0.04] text-white/74'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {detailTab === 'comments' && (
        <>
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {(reel?.comments || []).length === 0 ? (
              <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4 text-sm text-white/58">
                Abhi koi comment nahi hai — first reply drop karo.
              </div>
            ) : (
              (reel?.comments || []).map((comment) => (
                <div key={comment.id} className="flex gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-xs uppercase text-white/84">
                    {comment.user_name?.[0] || 'Q'}
                  </div>
                  <div className="min-w-0 flex-1 rounded-[22px] border border-white/8 bg-white/[0.03] px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-white">{comment.user_name}</span>
                      <span className="text-[11px] font-mono text-white/40">
                        {formatDistanceToNow(new Date(comment.created_at), { addSuffix: true })}
                      </span>
                    </div>
                    <p className="mt-2 text-sm leading-6 text-white/78">{comment.text}</p>
                  </div>
                </div>
              ))
            )}
          </div>

          <form onSubmit={onSubmit} className="flex gap-2 border-t border-white/8 px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
            <input
              type="text"
              data-testid="reels-comment-input"
              value={commentText}
              onChange={(event) => onCommentChange(event.target.value)}
              placeholder="Add a comment..."
              className="flex-1 rounded-full border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-white/28"
            />
            <button
              type="submit"
              data-testid="reels-comment-submit-button"
              disabled={!commentText.trim()}
              className="h-11 rounded-full bg-white px-4 text-sm font-semibold text-black disabled:opacity-40"
            >
              Post
            </button>
          </form>
        </>
      )}

      {detailTab === 'up_next' && (
        <div className="grid flex-1 grid-cols-2 gap-3 overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">
          {visibleReels.filter((item) => item.id !== reel?.id).slice(0, 6).map((item) => (
            <button
              key={item.id}
              type="button"
              data-testid={`reels-up-next-${item.id}`}
              onClick={() => onJumpToReel(item.id)}
              className="overflow-hidden rounded-[26px] border border-white/10 bg-white/[0.03] text-left"
            >
              <div className="aspect-[9/14] bg-black">
                <img src={item.media_url} alt="" className="h-full w-full object-cover" />
              </div>
              <div className="p-3">
                <div className="line-clamp-2 text-sm text-white">{item.caption || 'Untitled reel'}</div>
                <div className="mt-2 text-[11px] text-white/40">{item.user_name}</div>
              </div>
            </button>
          ))}
        </div>
      )}

      {detailTab === 'details' && (
        <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] text-sm">
          <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">Creator</div>
            <div className="mt-2 text-base font-semibold text-white">{reel?.user_name || 'Unknown creator'}</div>
          </div>
          <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">Caption</div>
            <div className="mt-2 whitespace-pre-wrap leading-6 text-white/78">{reel?.caption || 'No caption added yet.'}</div>
          </div>
          <div className="rounded-[26px] border border-white/10 bg-white/[0.03] p-4">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/40">Stats</div>
            <div className="mt-3 flex flex-wrap gap-2">
              <MetricPill>Likes {reel?.likes_count || 0}</MetricPill>
              <MetricPill>Comments {(reel?.comments || []).length}</MetricPill>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Reels({ userId, onStartConversation }) {
  const [reels, setReels] = useState(() => {
    try {
      return JSON.parse(sessionStorage.getItem('qc_cache_reels') || '{}').reels || [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(() => {
    try {
      return !(JSON.parse(sessionStorage.getItem('qc_cache_reels') || '{}').reels || []).length;
    } catch {
      return true;
    }
  });
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
      sessionStorage.setItem('qc_cache_reels', JSON.stringify(data));
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
      await loadReels();
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
      setReels((previous) => previous.map((reel) => (
        reel.id === reelId
          ? { ...reel, is_liked: data.is_liked, likes_count: data.likes_count }
          : reel
      )));
    } catch {}
  };

  const handleComment = async (event) => {
    event.preventDefault();
    if (!commentText.trim() || !showComments) return;
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.post(`${API}/api/reels/${showComments}/comment`, { text: commentText }, { headers });
      setReels((previous) => previous.map((reel) => (
        reel.id === showComments
          ? { ...reel, comments: [...(reel.comments || []), data.comment] }
          : reel
      )));
      setCommentText('');
    } catch {}
  };

  const handleScroll = (event) => {
    const { scrollTop, clientHeight } = event.target;
    const index = Math.round(scrollTop / Math.max(clientHeight, 1));
    if (index !== currentIdx) setCurrentIdx(index);
  };

  const visibleReels = useMemo(() => {
    if (feedMode === 'posted') return reels.filter((reel) => reel.user_id === userId);
    if (feedMode === 'trending') {
      return [...reels].sort((a, b) => ((b.likes_count || 0) + (b.comments?.length || 0)) - ((a.likes_count || 0) + (a.comments?.length || 0)));
    }
    return reels;
  }, [feedMode, reels, userId]);

  useEffect(() => {
    setCurrentIdx(0);
    if (containerRef.current) {
      containerRef.current.scrollTo({ top: 0, behavior: 'auto' });
    }
  }, [feedMode]);

  useEffect(() => {
    if (!visibleReels.length) return;
    if (currentIdx > visibleReels.length - 1) setCurrentIdx(visibleReels.length - 1);
  }, [currentIdx, visibleReels.length]);

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

  const spotlightCategories = [
    { id: 'for_you', label: 'For You' },
    { id: 'trending', label: 'Trending' },
    { id: 'posted', label: 'Posted' },
  ];

  const currentReel = visibleReels[currentIdx] || null;
  const yourReelsCount = useMemo(() => reels.filter((reel) => reel.user_id === userId).length, [reels, userId]);
  const detailReel = visibleReels.find((reel) => reel.id === showComments) || null;

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

  const openComments = (reelId) => {
    setShowComments(reelId);
    setDetailTab('comments');
  };

  const jumpToReel = (reelId) => {
    const nextIndex = visibleReels.findIndex((item) => item.id === reelId);
    if (nextIndex === -1 || !containerRef.current) return;
    setCurrentIdx(nextIndex);
    setShowComments(null);
    containerRef.current.scrollTo({ top: containerRef.current.clientHeight * nextIndex, behavior: 'smooth' });
  };

  if (loading) {
    return <div className="flex h-full items-center justify-center text-white/50">Loading...</div>;
  }

  return (
    <div data-testid="reels-panel" className="relative h-full overflow-hidden bg-[#050505] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(37,99,235,0.18),transparent_30%),radial-gradient(circle_at_bottom,rgba(250,204,21,0.08),transparent_20%)]" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-black/88 via-black/35 to-transparent px-4 pb-8 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto mx-auto max-w-md">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-[10px] uppercase tracking-[0.26em] text-white/38">Quant spotlight</div>
              <div className="mt-2 flex items-center gap-2">
                <Sparkles size={16} className="text-[#facc15]" />
                <h2 className="font-heading text-3xl text-white">Reels</h2>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/54">
                <span>{visibleReels.length} drops</span>
                <span>·</span>
                <span>{yourReelsCount} yours</span>
              </div>
            </div>

            <button
              type="button"
              data-testid="create-reel-btn"
              onClick={() => setShowCreate(true)}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-white/12 bg-white/10 px-4 text-sm text-white backdrop-blur-xl transition-colors hover:bg-white/16"
            >
              <Plus size={15} /> New reel
            </button>
          </div>

          <div className="mt-4 flex gap-2 overflow-x-auto hide-scrollbar">
            {spotlightCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                data-testid={`reels-mode-${category.id}`}
                onClick={() => setFeedMode(category.id)}
                className={`shrink-0 rounded-full border px-4 py-2 text-sm transition-colors ${
                  feedMode === category.id
                    ? 'border-white bg-white text-black'
                    : 'border-white/10 bg-white/[0.04] text-white/78'
                }`}
              >
                {category.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateReelSheet
          newReelCaption={newReelCaption}
          newReelUrl={newReelUrl}
          onCaptionChange={setNewReelCaption}
          onClose={() => setShowCreate(false)}
          onOpenUploader={() => uploadInputRef.current?.click()}
          onPublish={createReel}
          onSelectUpload={handleLocalMedia}
          onUrlChange={setNewReelUrl}
          uploadInputRef={uploadInputRef}
        />
      )}

      {visibleReels.length === 0 ? (
        <div data-testid="reels-empty-state" className="flex h-full items-center justify-center px-6 pt-24 text-center">
          <div className="w-full max-w-sm rounded-[34px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/68">
              <Video size={26} />
            </div>
            <h3 className="mt-5 text-xl font-semibold text-white">No reels yet</h3>
            <p className="mt-3 text-sm leading-6 text-white/58">Spotlight ko Instagram-style vertical feed banane ke liye apna first reel drop karo.</p>
          </div>
        </div>
      ) : (
        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="relative h-full overflow-y-auto snap-y snap-mandatory hide-scrollbar"
        >
          {visibleReels.map((reel, index) => {
            const isVideo = isVideoUrl(reel.media_url);
            return (
              <section
                key={reel.id}
                data-testid={`reel-slide-${reel.id}`}
                className="relative h-full snap-start overflow-hidden"
              >
                {isVideo ? (
                  <video
                    src={reel.media_url}
                    ref={(element) => {
                      videoRefs.current[index] = element;
                    }}
                    className="absolute inset-0 h-full w-full object-cover"
                    onClick={togglePlayback}
                    autoPlay={autoplay && index === currentIdx && !isPaused}
                    loop
                    muted={isMuted}
                    playsInline
                  />
                ) : (
                  <img
                    src={reel.media_url}
                    alt={reel.caption || 'reel'}
                    className="absolute inset-0 h-full w-full object-cover"
                    onClick={togglePlayback}
                  />
                )}

                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.72),rgba(0,0,0,0.06)_24%,rgba(0,0,0,0.1)_52%,rgba(0,0,0,0.84)_100%)]" />

                {isPaused && index === currentIdx && (
                  <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
                    <div className="flex h-16 w-16 items-center justify-center rounded-full border border-white/12 bg-black/35 text-white backdrop-blur-xl">
                      <Play size={24} className="ml-1" />
                    </div>
                  </div>
                )}

                <div className="absolute left-4 right-4 top-[calc(env(safe-area-inset-top)+6.75rem)] z-10 flex items-center justify-between md:left-6 md:right-6">
                  <MetricPill>{index + 1} / {visibleReels.length}</MetricPill>
                  <MetricPill>{autoplay && !isPaused ? 'Autoplay on' : isPaused ? 'Paused' : 'Manual'}</MetricPill>
                </div>

                <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+1.4rem)] left-4 right-[4.8rem] z-10 md:left-6 md:right-24">
                  <div className="flex items-center gap-3">
                    <div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-full border border-white/14 bg-white/[0.07] text-white shadow-[0_10px_30px_rgba(0,0,0,0.24)]">
                      {reel.user_avatar ? (
                        <img src={reel.user_avatar} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <User size={16} />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-white">{reel.user_name}</div>
                      <div className="text-[11px] font-mono text-white/54">
                        {formatDistanceToNow(new Date(reel.created_at), { addSuffix: true })}
                      </div>
                    </div>
                    {reel.user_id !== userId && (
                      <button
                        type="button"
                        data-testid={`reel-chat-inline-${reel.id}`}
                        onClick={() => handleMessageCreator(reel)}
                        className="ml-auto rounded-full border border-white/12 bg-white/10 px-4 py-2 text-sm text-white backdrop-blur-xl transition-colors hover:bg-white/16"
                      >
                        Message
                      </button>
                    )}
                  </div>

                  <p className="mt-4 max-w-[92%] whitespace-pre-wrap text-sm leading-6 text-white drop-shadow-sm">
                    {reel.caption || 'No caption'}
                  </p>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <MetricPill>Likes {reel.likes_count || 0}</MetricPill>
                    <MetricPill>Comments {(reel.comments || []).length}</MetricPill>
                    {currentReel?.id === reel.id && currentReel?.user_id === userId && <MetricPill>Your post</MetricPill>}
                  </div>
                </div>

                <div className="absolute bottom-[calc(env(safe-area-inset-bottom)+1.8rem)] right-3 z-10 flex w-14 flex-col items-center gap-4 md:right-5">
                  <button
                    type="button"
                    data-testid={`reel-audio-${reel.id}`}
                    onClick={() => setIsMuted((current) => !current)}
                    className="group flex flex-col items-center gap-1.5"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-black/35 text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-colors group-hover:bg-black/55">
                      {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                    </div>
                    <span className="text-[11px] font-mono text-white drop-shadow">{isMuted ? 'Mute' : 'Sound'}</span>
                  </button>

                  {reel.user_id !== userId && (
                    <ReelActionButton
                      dataTestId={`reel-chat-${reel.id}`}
                      icon={<Send size={20} />}
                      label="Chat"
                      onClick={() => handleMessageCreator(reel)}
                    />
                  )}

                  <ReelActionButton
                    dataTestId={`reel-like-${reel.id}`}
                    icon={<Heart size={22} className={reel.is_liked ? 'fill-[#ef4444] text-[#ef4444]' : ''} />}
                    label="Like"
                    value={reel.likes_count || 0}
                    onClick={() => handleLike(reel.id)}
                  />

                  <ReelActionButton
                    dataTestId={`reel-comments-${reel.id}`}
                    icon={<MessageCircle size={21} />}
                    label="Comments"
                    value={(reel.comments || []).length}
                    onClick={() => openComments(reel.id)}
                  />

                  <ReelActionButton
                    dataTestId={`reel-share-${reel.id}`}
                    icon={<Link2 size={20} />}
                    label="Share"
                    onClick={() => handleShare(reel)}
                  />

                  <button
                    type="button"
                    data-testid={`reel-pause-${reel.id}`}
                    onClick={togglePlayback}
                    className="group flex flex-col items-center gap-1.5"
                  >
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/12 bg-black/35 text-white shadow-[0_10px_30px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-colors group-hover:bg-black/55">
                      {isPaused ? <Play size={20} className="ml-0.5" /> : <Pause size={20} />}
                    </div>
                    <span className="text-[11px] font-mono text-white drop-shadow">{isPaused ? 'Play' : 'Pause'}</span>
                  </button>
                </div>
              </section>
            );
          })}
        </div>
      )}

      {showComments && (
        <CommentsSheet
          commentText={commentText}
          detailTab={detailTab}
          onClose={() => setShowComments(null)}
          onCommentChange={setCommentText}
          onSubmit={handleComment}
          onTabChange={setDetailTab}
          reel={detailReel}
          visibleReels={visibleReels}
          onJumpToReel={jumpToReel}
        />
      )}

      {shareStatus && (
        <div className="absolute bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full border border-white/10 bg-black/60 px-4 py-2 text-sm text-white shadow-[0_20px_50px_rgba(0,0,0,0.35)] backdrop-blur-xl">
          {shareStatus}
        </div>
      )}
    </div>
  );
}