import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Radio, Plus, User, X, Send, Loader, ChevronLeft, ChevronRight, Clock3 } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { API } from '../lib/api';

const COLORS = ['#1D4ED8', '#FF5A36', '#0F766E', '#7C3AED', '#EA580C', '#111827', '#D946EF'];
const STORY_PREF_EVENT = 'qc-preferences-changed';

function parseStoryPayload(story) {
  try {
    const payload = JSON.parse(story.content);
    return {
      text: payload.text || '',
      bg: payload.bg || COLORS[0],
    };
  } catch {
    return {
      text: story.content,
      bg: COLORS[0],
    };
  }
}

function StoryViewer({ stories, activeIndex, onClose, autoAdvance }) {
  const [index, setIndex] = useState(activeIndex);

  useEffect(() => {
    setIndex(activeIndex);
  }, [activeIndex]);

  useEffect(() => {
    if (!autoAdvance || stories.length <= 1) return undefined;
    const timer = window.setTimeout(() => {
      setIndex((current) => (current + 1) % stories.length);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [autoAdvance, index, stories.length]);

  const currentStory = stories[index];
  if (!currentStory) return null;

  const payload = parseStoryPayload(currentStory);

  return (
    <div className="absolute inset-0 z-40 bg-[#071120]/88 backdrop-blur-md flex items-center justify-center p-4" onClick={onClose}>
      <div className="w-full max-w-3xl rounded-[32px] overflow-hidden border border-white/10 bg-[#071120] shadow-[0_30px_90px_rgba(0,0,0,0.38)]" onClick={(event) => event.stopPropagation()}>
        <div className="px-5 pt-5 pb-3 bg-black/20 border-b border-white/10">
          <div className="flex gap-2">
            {stories.map((story, storyIndex) => (
              <div key={story.id} className="h-1.5 flex-1 rounded-full overflow-hidden bg-white/15">
                <div
                  className={`h-full rounded-full transition-all ${storyIndex <= index ? 'bg-white' : 'bg-transparent'}`}
                  style={{ width: storyIndex === index ? '100%' : storyIndex < index ? '100%' : '0%' }}
                />
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-4 mt-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-2xl overflow-hidden bg-white/10 flex items-center justify-center">
                {currentStory.user_avatar ? (
                  <img src={currentStory.user_avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <User size={18} className="text-white/80" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-white font-medium truncate">{currentStory.user_name || 'Unknown'}</p>
                <p className="text-white/60 text-xs">
                  {formatDistanceToNow(new Date(currentStory.created_at), { addSuffix: true })}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {autoAdvance && (
                <div className="rounded-full border border-white/15 bg-white/10 px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-white/70">
                  Auto
                </div>
              )}
              <button onClick={onClose} className="w-10 h-10 rounded-full border border-white/15 bg-white/10 text-white hover:bg-white/20 transition-colors">
                <X size={18} className="mx-auto" />
              </button>
            </div>
          </div>
        </div>

        <div className="relative min-h-[420px] sm:min-h-[520px] flex items-center justify-center" style={{ backgroundColor: payload.bg }}>
          <div className="max-w-xl px-8 text-center">
            <p className="text-white text-2xl sm:text-4xl font-semibold whitespace-pre-wrap break-words leading-tight">
              {payload.text}
            </p>
          </div>

          {stories.length > 1 && (
            <>
              <button
                onClick={() => setIndex((current) => (current - 1 + stories.length) % stories.length)}
                className="absolute left-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/25 border border-white/15 text-white hover:bg-black/40 transition-colors"
              >
                <ChevronLeft size={20} className="mx-auto" />
              </button>
              <button
                onClick={() => setIndex((current) => (current + 1) % stories.length)}
                className="absolute right-4 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-black/25 border border-white/15 text-white hover:bg-black/40 transition-colors"
              >
                <ChevronRight size={20} className="mx-auto" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function Stories({ userId }) {
  const [storyGroups, setStoryGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [content, setContent] = useState('');
  const [bgColor, setBgColor] = useState(COLORS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [viewerIndex, setViewerIndex] = useState(null);
  const [autoAdvance, setAutoAdvance] = useState(localStorage.getItem('qc_pref_story_autoadvance') !== 'false');

  const loadStories = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('qc_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/stories`, { headers });
      setStoryGroups(data.stories || []);
    } catch {
      setStoryGroups([]);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadStories();
  }, []);

  useEffect(() => {
    const syncPreference = () => setAutoAdvance(localStorage.getItem('qc_pref_story_autoadvance') !== 'false');
    window.addEventListener(STORY_PREF_EVENT, syncPreference);
    return () => window.removeEventListener(STORY_PREF_EVENT, syncPreference);
  }, []);

  const createStory = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const token = localStorage.getItem('qc_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(
        `${API}/api/stories`,
        { content: JSON.stringify({ text: content.trim(), bg: bgColor }), type: 'text' },
        { headers }
      );
      setContent('');
      setBgColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
      setShowComposer(false);
      await loadStories();
    } catch {}
    setSubmitting(false);
  };

  const myStoryGroup = storyGroups.find((storyGroup) => storyGroup.user_id === userId);
  const otherStoryGroups = storyGroups.filter((storyGroup) => storyGroup.user_id !== userId);
  const timelineStories = useMemo(() => [
    ...(myStoryGroup
      ? myStoryGroup.stories.map((story) => ({
          ...story,
          user_id: myStoryGroup.user_id,
          user_name: myStoryGroup.user_name,
          user_avatar: myStoryGroup.user_avatar,
        }))
      : []),
    ...otherStoryGroups.flatMap((group) =>
      (group.stories || []).map((story) => ({
        ...story,
        user_id: group.user_id,
        user_name: group.user_name,
        user_avatar: group.user_avatar,
      }))
    ),
  ], [myStoryGroup, otherStoryGroups]);

  return (
    <div data-testid="stories-view" className="flex flex-col h-full bg-qc-bg relative overflow-hidden">
      <div className="px-4 py-4 sm:px-5 border-b border-qc-border bg-qc-surface">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.28em] text-qc-text-tertiary">Story deck</p>
            <div className="flex items-center gap-2 mt-1">
              <Radio size={18} className="text-qc-accent-primary" />
              <h2 className="font-heading text-2xl text-qc-text-primary">Stories</h2>
            </div>
          </div>

          <button
            data-testid="open-story-composer"
            onClick={() => setShowComposer(true)}
            className="h-11 px-3 sm:px-4 rounded-2xl bg-qc-accent-primary text-white hover:bg-qc-accent-secondary transition-colors flex items-center gap-2 shadow-glow whitespace-nowrap"
          >
            <Plus size={16} />
            <span className="text-sm font-medium">Post story</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div className="rounded-2xl border border-qc-border bg-qc-surface-hover px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary">Live updates</p>
            <p className="text-xl font-semibold text-qc-text-primary mt-1">{timelineStories.length}</p>
          </div>
          <div className="rounded-2xl border border-qc-border bg-qc-surface-hover px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary">Creators</p>
            <p className="text-xl font-semibold text-qc-text-primary mt-1">{storyGroups.length}</p>
          </div>
          <div className="rounded-2xl border border-qc-border bg-qc-surface-hover px-4 py-3">
            <p className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary">Viewer mode</p>
            <p className="text-sm font-semibold text-qc-text-primary mt-2">{autoAdvance ? 'Auto advance on' : 'Manual advance'}</p>
          </div>
        </div>
      </div>

      {showComposer && (
        <div className="absolute inset-0 z-30 bg-black/60 flex items-end sm:items-center justify-center p-4" onClick={() => setShowComposer(false)}>
          <div className="w-full max-w-[460px] bg-qc-surface border border-qc-border rounded-[28px] overflow-hidden shadow-[0_24px_70px_rgba(19,31,51,0.24)]" onClick={(event) => event.stopPropagation()}>
            <div className="h-14 border-b border-qc-border px-5 flex items-center justify-between">
              <span className="text-qc-text-primary font-heading text-xl">Create Story</span>
              <button onClick={() => setShowComposer(false)} className="text-qc-text-secondary hover:text-qc-text-primary">
                <X size={18} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-2 flex-wrap">
                {COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setBgColor(color)}
                    className={`w-9 h-9 rounded-full border-2 transition-transform ${bgColor === color ? 'border-qc-text-primary scale-110' : 'border-transparent'}`}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <textarea
                data-testid="story-input"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Share a quick update, thought, or launch note"
                className="w-full h-44 rounded-[24px] p-5 text-white placeholder:text-white/70 resize-none outline-none"
                style={{ backgroundColor: bgColor }}
              />
              <button
                data-testid="submit-story"
                onClick={createStory}
                disabled={!content.trim() || submitting}
                className="w-full h-12 bg-qc-accent-primary hover:bg-qc-accent-secondary disabled:opacity-40 text-white rounded-2xl flex items-center justify-center gap-2"
              >
                {submitting ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
                <span>{submitting ? 'Posting...' : 'Publish story'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {viewerIndex !== null && (
        <StoryViewer
          stories={timelineStories}
          activeIndex={viewerIndex}
          autoAdvance={autoAdvance}
          onClose={() => setViewerIndex(null)}
        />
      )}

      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-5 space-y-6 pb-[calc(env(safe-area-inset-bottom)+6.5rem)] md:pb-8">
        <section className="rounded-[28px] border border-qc-border bg-qc-surface p-4 shadow-sm">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary">Your lane</p>
              <h3 className="text-lg font-semibold text-qc-text-primary mt-1">Post or review your daily drop</h3>
            </div>
            <div className="rounded-full border border-qc-border bg-qc-surface-hover px-3 py-1 text-xs text-qc-text-secondary">
              {myStoryGroup?.stories?.length || 0} active
            </div>
          </div>

          <button
            className="w-full flex items-center gap-4 text-left bg-qc-surface-hover border border-qc-border rounded-[24px] p-4 hover:bg-qc-accent-tertiary transition-colors"
            onClick={() => setShowComposer(true)}
          >
            <div className="w-14 h-14 rounded-2xl bg-qc-highlight/20 flex items-center justify-center text-qc-accent-primary relative">
              <User size={20} />
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-qc-accent-primary text-white flex items-center justify-center border-2 border-qc-surface">
                <Plus size={14} />
              </div>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-qc-text-primary text-sm font-medium">Add to your story</p>
              <p className="text-qc-text-tertiary text-xs mt-1">
                {myStoryGroup?.stories?.length > 0
                  ? `${myStoryGroup.stories.length} active update${myStoryGroup.stories.length > 1 ? 's' : ''}`
                  : 'Create a text story with your own color backdrop'}
              </p>
            </div>
          </button>
        </section>

        {otherStoryGroups.length > 0 && (
          <section>
            <div className="flex items-center justify-between gap-4 mb-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary">Story rings</p>
                <h3 className="text-lg font-semibold text-qc-text-primary mt-1">Watch creators at a glance</h3>
              </div>
              <div className="rounded-full border border-qc-border bg-qc-surface px-3 py-1 text-xs text-qc-text-secondary">
                Tap any card
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {otherStoryGroups.map((group) => {
                const firstStory = timelineStories.find((story) => story.user_id === group.user_id);
                return (
                  <button
                    key={group.user_id}
                    onClick={() => {
                      const index = timelineStories.findIndex((story) => story.id === firstStory?.id);
                      if (index >= 0) setViewerIndex(index);
                    }}
                    className="rounded-[24px] border border-qc-border bg-qc-surface p-4 text-left hover:-translate-y-0.5 hover:shadow-glow transition-all"
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-12 h-12 rounded-full p-[2px] bg-gradient-to-br from-qc-accent-primary via-qc-highlight to-[#8b5cf6]">
                        <div className="w-full h-full rounded-full bg-qc-surface overflow-hidden flex items-center justify-center">
                          {group.user_avatar ? (
                            <img src={group.user_avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User size={16} className="text-qc-text-secondary" />
                          )}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <p className="text-qc-text-primary text-sm font-medium truncate">{group.user_name || 'Unknown'}</p>
                        <p className="text-qc-text-tertiary text-[11px]">
                          {group.stories?.length || 0} snap{(group.stories?.length || 0) === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>

                    <div className="rounded-[20px] p-4 min-h-[112px]" style={{ background: `linear-gradient(135deg, ${parseStoryPayload(firstStory || { content: '', bg: COLORS[0] }).bg}, rgba(17,24,39,0.35))` }}>
                      <p className="text-white text-sm line-clamp-4">
                        {firstStory ? parseStoryPayload(firstStory).text : 'No recent update'}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        <section>
          <div className="flex items-center justify-between gap-4 mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary">Timeline</p>
              <h3 className="text-lg font-semibold text-qc-text-primary mt-1">Recent story updates</h3>
            </div>
            <div className="rounded-full border border-qc-border bg-qc-surface px-3 py-1 text-xs text-qc-text-secondary flex items-center gap-2">
              <Clock3 size={12} />
              <span>24h shelf</span>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-qc-text-secondary">
              <Loader className="animate-spin" size={18} />
            </div>
          ) : timelineStories.length === 0 ? (
            <div className="rounded-[28px] border border-dashed border-qc-border bg-qc-surface px-6 py-16 text-center">
              <p className="text-qc-text-primary text-base font-medium">No stories yet</p>
              <p className="text-qc-text-secondary text-sm mt-2">Post the first update and this timeline will start feeling alive.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {timelineStories.map((story, storyIndex) => {
                const payload = parseStoryPayload(story);
                return (
                  <button
                    key={story.id}
                    data-testid={`story-${story.id}`}
                    onClick={() => setViewerIndex(storyIndex)}
                    className="w-full rounded-[28px] overflow-hidden border border-qc-border bg-qc-surface text-left shadow-sm hover:-translate-y-0.5 hover:shadow-glow transition-all"
                  >
                    <div className="px-4 py-3 bg-qc-surface border-b border-qc-border flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-2xl bg-qc-highlight/15 flex items-center justify-center flex-shrink-0 overflow-hidden">
                          {story.user_avatar ? (
                            <img src={story.user_avatar} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <User size={14} className="text-qc-text-secondary" />
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-qc-text-primary text-sm truncate">{story.user_name || 'Unknown'}</p>
                          <p className="text-qc-text-tertiary text-[11px]">
                            {formatDistanceToNow(new Date(story.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>

                      <div className="text-[11px] uppercase tracking-[0.22em] text-qc-text-tertiary">View</div>
                    </div>

                    <div className="min-h-[180px] p-6 flex items-center justify-center text-center text-white text-xl font-semibold" style={{ backgroundColor: payload.bg || COLORS[0] }}>
                      <span className="whitespace-pre-wrap break-words">{payload.text}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
