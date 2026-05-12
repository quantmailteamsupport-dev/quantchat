import React, { useMemo, useState } from 'react';
import { ArrowLeft, Hash, MapPin, Send, Users2 } from 'lucide-react';

const AUDIENCE_OPTIONS = {
  snap: ['Selected chat', 'Close friends'],
  story: ['Friends', 'Close friends', 'Public'],
  feed: ['Public', 'Followers', 'Inner circle'],
  reel: ['Public', 'Followers'],
};

const TITLES = {
  snap: 'Send Snap Streak',
  story: 'Publish Story',
  feed: 'Publish Feed Post',
  reel: 'Publish Reel',
};

export default function CapturePublishComposer({ mode, imageData, onBack, onClose, onSubmit, loading }) {
  const [caption, setCaption] = useState('');
  const [location, setLocation] = useState('');
  const [tags, setTags] = useState('');
  const [audience, setAudience] = useState(AUDIENCE_OPTIONS[mode]?.[0] || 'Public');
  const [scheduleMinutes, setScheduleMinutes] = useState(0);

  const placeholder = useMemo(() => {
    if (mode === 'story') return 'Add a short story caption';
    if (mode === 'reel') return 'Write a reel caption';
    if (mode === 'snap') return 'Add a snap note';
    return 'Write a public post caption';
  }, [mode]);

  const handleSubmit = () => {
    onSubmit({
      mode,
      imageData,
      caption: caption.trim(),
      locationLabel: location.trim(),
      tags: tags.split(',').map((tag) => tag.trim()).filter(Boolean),
      audience,
      scheduleMinutes: Number(scheduleMinutes) || 0,
    });
  };

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/[0.04] overflow-hidden">
      <div className="px-4 py-3 border-b border-white/8 flex items-center justify-between gap-3">
        <button type="button" data-testid="camera-composer-back" onClick={onBack} className="h-10 w-10 rounded-full border border-white/10 bg-white/5 text-white flex items-center justify-center">
          <ArrowLeft size={16} />
        </button>
        <div className="flex-1">
          <div className="text-[10px] uppercase tracking-[0.22em] text-white/46">Media composer</div>
          <div data-testid="camera-composer-title" className="text-base font-semibold text-white mt-1">{TITLES[mode]}</div>
        </div>
        <button type="button" data-testid="camera-composer-close" onClick={onClose} className="text-xs text-white/58">Close</button>
      </div>

      <div className="p-4 space-y-4">
        <div className="rounded-[24px] overflow-hidden border border-white/10 bg-black/20 aspect-[3/4]">
          <img src={imageData} alt="capture" className="h-full w-full object-cover" />
        </div>

        <textarea
          data-testid="camera-composer-caption"
          value={caption}
          onChange={(event) => setCaption(event.target.value)}
          rows={mode === 'reel' ? 4 : 3}
          placeholder={placeholder}
          className="w-full rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28 resize-none"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/72 block">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/42"><Users2 size={12} /> Audience</div>
            <select data-testid="camera-composer-audience" value={audience} onChange={(event) => setAudience(event.target.value)} className="mt-2 w-full bg-transparent text-white outline-none">
              {(AUDIENCE_OPTIONS[mode] || ['Public']).map((item) => <option key={item} value={item} className="text-black">{item}</option>)}
            </select>
          </label>

          <label className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/72 block">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/42"><MapPin size={12} /> Location</div>
            <input data-testid="camera-composer-location" value={location} onChange={(event) => setLocation(event.target.value)} placeholder="Add location" className="mt-2 w-full bg-transparent text-white placeholder:text-white/28 outline-none" />
          </label>
        </div>

        {mode !== 'snap' && (
          <label className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/72 block">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/42"><Hash size={12} /> Tags</div>
            <input data-testid="camera-composer-tags" value={tags} onChange={(event) => setTags(event.target.value)} placeholder="launch, design, update" className="mt-2 w-full bg-transparent text-white placeholder:text-white/28 outline-none" />
          </label>
        )}

        {mode !== 'story' && mode !== 'snap' && (
          <label className="rounded-[20px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/72 block">
            <div className="text-[11px] uppercase tracking-[0.18em] text-white/42">Schedule</div>
            <input data-testid="camera-composer-schedule" type="number" min="0" value={scheduleMinutes} onChange={(event) => setScheduleMinutes(event.target.value)} placeholder="0 for now" className="mt-2 w-full bg-transparent text-white placeholder:text-white/28 outline-none" />
          </label>
        )}

        <button type="button" data-testid="camera-composer-submit" onClick={handleSubmit} disabled={loading} className="w-full rounded-full bg-white text-black h-12 font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-40">
          <Send size={16} /> {loading ? 'Publishing...' : 'Publish now'}
        </button>
      </div>
    </div>
  );
}