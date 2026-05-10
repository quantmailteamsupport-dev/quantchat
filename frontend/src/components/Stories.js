import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Radio, Plus, User, X, Send, Loader } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { API } from '../lib/api';

const COLORS = ['#0066FF', '#FF3333', '#00FF66', '#FF6600', '#9933FF', '#FF0099', '#00CCFF'];

export default function Stories({ userId }) {
  const [storyGroups, setStoryGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showComposer, setShowComposer] = useState(false);
  const [content, setContent] = useState('');
  const [bgColor, setBgColor] = useState(COLORS[0]);
  const [submitting, setSubmitting] = useState(false);

  const loadStories = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('qc_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.get(`${API}/api/stories`, { headers });
      setStoryGroups(data.stories || []);
    } catch {}
    setLoading(false);
  };

  useEffect(() => { loadStories(); }, []);

  const createStory = async () => {
    if (!content.trim()) return;
    setSubmitting(true);
    try {
      const token = localStorage.getItem('qc_token');
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/api/stories`, { content: JSON.stringify({ text: content.trim(), bg: bgColor }), type: 'text' }, { headers });
      setContent('');
      setBgColor(COLORS[Math.floor(Math.random() * COLORS.length)]);
      setShowComposer(false);
      await loadStories();
    } catch {}
    setSubmitting(false);
  };

  const myStoryGroup = storyGroups.find(s => s.user_id === userId);
  const otherStoryGroups = storyGroups.filter(s => s.user_id !== userId);
  const timelineStories = [
    ...(myStoryGroup ? myStoryGroup.stories.map(story => ({ ...story, user_id: myStoryGroup.user_id, user_name: myStoryGroup.user_name, user_avatar: myStoryGroup.user_avatar })) : []),
    ...otherStoryGroups.flatMap(group => (group.stories || []).map(story => ({
      ...story,
      user_id: group.user_id,
      user_name: group.user_name,
      user_avatar: group.user_avatar,
    }))),
  ];

  return (
    <div data-testid="stories-view" className="flex flex-col h-full bg-qc-bg">
      <div className="h-14 border-b border-qc-border px-4 flex items-center justify-between bg-qc-surface flex-shrink-0">
        <div className="flex items-center gap-2">
          <Radio size={18} className="text-qc-accent" />
          <h2 className="text-white font-medium">Stories</h2>
        </div>
        <button data-testid="open-story-composer" onClick={() => setShowComposer(true)} className="w-9 h-9 flex items-center justify-center bg-qc-accent text-white rounded-sm hover:bg-qc-accent-hover">
          <Plus size={18} />
        </button>
      </div>

      {showComposer && (
        <div className="absolute inset-0 z-30 bg-black/70 flex items-end sm:items-center justify-center" onClick={() => setShowComposer(false)}>
          <div className="w-full sm:w-[420px] bg-qc-surface border border-qc-border rounded-t-lg sm:rounded-lg overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="h-12 border-b border-qc-border px-4 flex items-center justify-between">
              <span className="text-white font-medium">Create Story</span>
              <button onClick={() => setShowComposer(false)} className="text-qc-text-secondary hover:text-white"><X size={18} /></button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setBgColor(c)}
                    className={`w-8 h-8 rounded-full border-2 ${bgColor === c ? 'border-white' : 'border-transparent'}`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
              <textarea
                data-testid="story-input"
                value={content}
                onChange={e => setContent(e.target.value)}
                placeholder="What's your story?"
                className="w-full h-44 rounded-md p-4 text-white placeholder:text-white/70 resize-none outline-none"
                style={{ backgroundColor: bgColor }}
              />
              <button
                data-testid="submit-story"
                onClick={createStory}
                disabled={!content.trim() || submitting}
                className="w-full h-11 bg-qc-accent hover:bg-qc-accent-hover disabled:opacity-40 text-white rounded-sm flex items-center justify-center gap-2"
              >
                {submitting ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
                <span>{submitting ? 'Posting...' : 'Post Story'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        <section className="p-4">
          <h3 className="text-[11px] uppercase tracking-wider text-qc-text-tertiary mb-3 font-mono">Your Story</h3>
          <button className="w-full flex items-center gap-3 text-left bg-qc-surface border border-qc-border rounded-md p-3 hover:bg-qc-elevated" onClick={() => setShowComposer(true)}>
            <div className="w-12 h-12 rounded-md bg-qc-highlight flex items-center justify-center text-qc-accent relative">
              <User size={18} />
              <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-qc-accent text-white flex items-center justify-center border-2 border-qc-surface">
                <Plus size={12} />
              </div>
            </div>
            <div className="min-w-0">
              <p className="text-white text-sm font-medium">Add to your story</p>
              <p className="text-qc-text-tertiary text-xs font-mono">
                {myStoryGroup?.stories?.length > 0 ? `${myStoryGroup.stories.length} active update${myStoryGroup.stories.length > 1 ? 's' : ''}` : 'Share a text update'}
              </p>
            </div>
          </button>
        </section>

        {otherStoryGroups.length > 0 && (
          <section className="px-4 pb-2">
            <h3 className="text-[11px] uppercase tracking-wider text-qc-text-tertiary mb-3 font-mono">Story Rings</h3>
            <div className="grid grid-cols-2 gap-3">
              {otherStoryGroups.map(group => (
                <div key={group.user_id} className="rounded-md border border-qc-border bg-qc-surface p-3">
                  <div className="flex items-center gap-3 mb-2">
                    <div className="w-11 h-11 rounded-full p-[2px] bg-gradient-to-br from-qc-accent to-qc-highlight">
                      <div className="w-full h-full rounded-full bg-qc-surface overflow-hidden flex items-center justify-center">
                        {group.user_avatar ? <img src={group.user_avatar} alt="" className="w-full h-full object-cover" /> : <User size={16} className="text-qc-text-secondary" />}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-white text-sm truncate">{group.user_name || 'Unknown'}</p>
                      <p className="text-qc-text-tertiary text-[10px] font-mono">{group.stories?.length || 0} snap{(group.stories?.length || 0) === 1 ? '' : 's'}</p>
                    </div>
                  </div>
                  <p className="text-qc-text-secondary text-xs line-clamp-2">
                    {(() => {
                      const latestStory = group.stories?.[0];
                      if (!latestStory) return 'No recent update';
                      try {
                        const payload = JSON.parse(latestStory.content);
                        return payload.text;
                      } catch {
                        return latestStory.content;
                      }
                    })()}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="px-4 pb-4">
          <h3 className="text-[11px] uppercase tracking-wider text-qc-text-tertiary mb-3 font-mono">Recent Updates</h3>
          {loading ? (
            <div className="flex items-center justify-center py-10 text-qc-text-secondary"><Loader className="animate-spin" size={18} /></div>
          ) : timelineStories.length === 0 ? (
            <div className="text-center py-12 text-qc-text-secondary text-sm">No stories yet</div>
          ) : (
            <div className="space-y-3">
              {timelineStories.map(story => {
                let payload = { text: story.content, bg: COLORS[0] };
                try {
                  payload = JSON.parse(story.content);
                } catch {}
                return (
                  <div key={story.id} data-testid={`story-${story.id}`} className="rounded-md overflow-hidden border border-qc-border">
                    <div className="px-3 py-2 bg-qc-surface border-b border-qc-border flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-md bg-qc-highlight flex items-center justify-center flex-shrink-0">
                          {story.user_avatar ? <img src={story.user_avatar} alt="" className="w-full h-full object-cover rounded-md" /> : <User size={14} className="text-qc-text-secondary" />}
                        </div>
                        <div className="min-w-0">
                          <p className="text-white text-sm truncate">{story.user_name || 'Unknown'}</p>
                          <p className="text-qc-text-tertiary text-[10px] font-mono">
                            {formatDistanceToNow(new Date(story.created_at), { addSuffix: true })}
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="min-h-[160px] p-5 flex items-center justify-center text-center text-white text-lg font-semibold" style={{ backgroundColor: payload.bg || COLORS[0] }}>
                      <span className="whitespace-pre-wrap break-words">{payload.text}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
