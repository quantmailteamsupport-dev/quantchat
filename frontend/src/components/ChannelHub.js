import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { API } from '../lib/api';
import { BellOff, Megaphone, Plus, Radio, Send, Shield, Users } from 'lucide-react';

export default function ChannelHub({ token }) {
  const [channels, setChannels] = useState([]);
  const [broadcasts, setBroadcasts] = useState([]);
  const [activeChannel, setActiveChannel] = useState(null);
  const [channelName, setChannelName] = useState('');
  const [postingPermission, setPostingPermission] = useState('admins');
  const [approvalRequired, setApprovalRequired] = useState(false);
  const [drafts, setDrafts] = useState([]);
  const [publishContent, setPublishContent] = useState('');
  const [publishMedia, setPublishMedia] = useState('');
  const [publishMode, setPublishMode] = useState('instant');
  const [scheduleMinutes, setScheduleMinutes] = useState(30);
  const [broadcastName, setBroadcastName] = useState('');
  const [broadcastParticipants, setBroadcastParticipants] = useState('');
  const [broadcastContent, setBroadcastContent] = useState('');

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const loadChannels = async () => {
    try {
      const [{ data: channelData }, { data: broadcastData }] = await Promise.all([
        axios.get(`${API}/api/channels`, { headers }),
        axios.get(`${API}/api/broadcast-lists`, { headers }),
      ]);
      setChannels(channelData.channels || []);
      setBroadcasts(broadcastData.broadcast_lists || []);
      setActiveChannel((current) => (current ? (channelData.channels || []).find((item) => item.id === current.id) || null : (channelData.channels || [])[0] || null));
    } catch {
      setChannels([]);
      setBroadcasts([]);
    }
  };

  const loadDrafts = async (channelId) => {
    if (!channelId) return;
    try {
      const { data } = await axios.get(`${API}/api/channels/${channelId}/drafts`, { headers });
      setDrafts(data.drafts || []);
    } catch {
      setDrafts([]);
    }
  };

  useEffect(() => {
    loadChannels();
  }, [token]);

  useEffect(() => {
    if (activeChannel?.id) loadDrafts(activeChannel.id);
  }, [activeChannel?.id]);

  const createChannel = async () => {
    if (!channelName.trim()) return;
    await axios.post(`${API}/api/channels`, { name: channelName.trim(), participant_ids: [], is_channel: true, posting_permission: postingPermission, approval_required: approvalRequired }, { headers });
    setChannelName('');
    await loadChannels();
  };

  const updateSettings = async () => {
    if (!activeChannel) return;
    const { data } = await axios.put(`${API}/api/channels/${activeChannel.id}/settings`, { posting_permission: postingPermission, approval_required: approvalRequired, member_approval_required: approvalRequired }, { headers });
    setActiveChannel(data.channel);
    await loadChannels();
  };

  const publishToChannel = async () => {
    if (!activeChannel || !publishContent.trim()) return;
    await axios.post(`${API}/api/channels/${activeChannel.id}/publish`, { content: publishContent.trim(), media_url: publishMedia.trim(), publish_mode: publishMode, schedule_minutes: Number(scheduleMinutes) || 0 }, { headers });
    setPublishContent('');
    setPublishMedia('');
    await loadDrafts(activeChannel.id);
    await loadChannels();
  };

  const createBroadcast = async () => {
    if (!broadcastName.trim()) return;
    const participant_ids = broadcastParticipants.split(',').map((item) => item.trim()).filter(Boolean);
    await axios.post(`${API}/api/broadcast-lists`, { name: broadcastName.trim(), participant_ids }, { headers });
    setBroadcastName('');
    setBroadcastParticipants('');
    await loadChannels();
  };

  const sendBroadcast = async (broadcastId) => {
    if (!broadcastContent.trim()) return;
    await axios.post(`${API}/api/broadcast-lists/${broadcastId}/send`, { content: broadcastContent.trim(), type: 'text' }, { headers });
    setBroadcastContent('');
  };

  const toggleMute = async () => {
    if (!activeChannel) return;
    await axios.post(`${API}/api/channels/${activeChannel.id}/mute`, {}, { headers });
    await loadChannels();
  };

  return (
    <div data-testid="channel-hub" className="space-y-4">
      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
        <div className="text-[10px] uppercase tracking-[0.22em] text-white/46">Create channel</div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <input data-testid="channel-name-input" value={channelName} onChange={(event) => setChannelName(event.target.value)} placeholder="Channel name" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
          <select data-testid="channel-posting-permission" value={postingPermission} onChange={(event) => setPostingPermission(event.target.value)} className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white">
            <option value="admins" className="text-black">Admins only</option>
            <option value="members" className="text-black">Members can post</option>
          </select>
        </div>
        <label className="mt-3 flex items-center gap-2 text-sm text-white/72">
          <input data-testid="channel-approval-toggle" type="checkbox" checked={approvalRequired} onChange={(event) => setApprovalRequired(event.target.checked)} /> Member approval required
        </label>
        <button type="button" data-testid="channel-create-button" onClick={createChannel} className="mt-3 rounded-full bg-white text-black h-11 px-4 inline-flex items-center gap-2 font-medium">
          <Plus size={16} /> Create channel
        </button>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
        <div className="space-y-3">
          {channels.map((channel) => (
            <button key={channel.id} data-testid={`channel-card-${channel.id}`} onClick={() => { setActiveChannel(channel); setPostingPermission(channel.posting_permission || 'admins'); setApprovalRequired(Boolean(channel.approval_required)); }} className={`w-full rounded-[24px] border p-4 text-left ${activeChannel?.id === channel.id ? 'border-white bg-white/10' : 'border-white/10 bg-white/[0.04]'}`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{channel.name}</div>
                  <div className="text-[11px] uppercase tracking-[0.18em] text-white/42 mt-1">{channel.member_count} members</div>
                </div>
                <Radio size={16} className="text-white/56" />
              </div>
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {activeChannel ? (
            <>
              <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-white/46">Channel admin</div>
                    <div className="text-lg font-semibold text-white mt-1">{activeChannel.name}</div>
                  </div>
                  <button type="button" data-testid="channel-mute-button" onClick={toggleMute} className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white inline-flex items-center gap-2"><BellOff size={12} /> {activeChannel.is_muted ? 'Unmute' : 'Mute'}</button>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <select data-testid="channel-settings-posting" value={postingPermission} onChange={(event) => setPostingPermission(event.target.value)} className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white">
                    <option value="admins" className="text-black">Admins only</option>
                    <option value="members" className="text-black">Members can post</option>
                  </select>
                  <label className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/72 flex items-center gap-2"><Shield size={14} /> <input data-testid="channel-settings-approval" type="checkbox" checked={approvalRequired} onChange={(event) => setApprovalRequired(event.target.checked)} /> Approval required</label>
                </div>
                <button type="button" data-testid="channel-save-settings" onClick={updateSettings} className="mt-3 rounded-full border border-white/10 bg-white text-black h-11 px-4 font-medium">Save settings</button>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/46">Publish post</div>
                <textarea data-testid="channel-publish-content" value={publishContent} onChange={(event) => setPublishContent(event.target.value)} rows={3} placeholder="Write an admin update for the channel" className="mt-3 w-full rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28 resize-none" />
                <input data-testid="channel-publish-media" value={publishMedia} onChange={(event) => setPublishMedia(event.target.value)} placeholder="Optional media URL" className="mt-3 w-full rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <select data-testid="channel-publish-mode" value={publishMode} onChange={(event) => setPublishMode(event.target.value)} className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white">
                    <option value="instant" className="text-black">Instant</option>
                    <option value="scheduled" className="text-black">Scheduled</option>
                    <option value="draft" className="text-black">Draft</option>
                  </select>
                  <input data-testid="channel-publish-schedule" type="number" value={scheduleMinutes} onChange={(event) => setScheduleMinutes(event.target.value)} placeholder="Schedule minutes" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
                </div>
                <button type="button" data-testid="channel-publish-button" onClick={publishToChannel} className="mt-3 rounded-full bg-white text-black h-11 px-4 inline-flex items-center gap-2 font-medium"><Send size={16} /> Publish</button>
              </section>

              <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
                <div className="text-[10px] uppercase tracking-[0.22em] text-white/46">Drafts</div>
                <div className="mt-3 space-y-2">
                  {drafts.length === 0 ? <div className="text-sm text-white/56">No channel drafts yet.</div> : drafts.map((draft) => <div key={draft.id} data-testid={`channel-draft-${draft.id}`} className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/82">{draft.content}</div>)}
                </div>
              </section>
            </>
          ) : (
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-6 text-sm text-white/58">Create a channel to unlock admin posting, drafts, and audience controls.</div>
          )}
        </div>
      </section>

      <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
        <div className="text-[10px] uppercase tracking-[0.22em] text-white/46">Broadcast lists</div>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
          <input data-testid="broadcast-name-input" value={broadcastName} onChange={(event) => setBroadcastName(event.target.value)} placeholder="Broadcast list name" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
          <input data-testid="broadcast-participants-input" value={broadcastParticipants} onChange={(event) => setBroadcastParticipants(event.target.value)} placeholder="Participant IDs comma separated" className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28" />
        </div>
        <button type="button" data-testid="broadcast-create-button" onClick={createBroadcast} className="mt-3 rounded-full border border-white/10 bg-white text-black h-11 px-4 inline-flex items-center gap-2 font-medium"><Users size={16} /> Create broadcast</button>
        <textarea data-testid="broadcast-content-input" value={broadcastContent} onChange={(event) => setBroadcastContent(event.target.value)} rows={2} placeholder="Write a broadcast update" className="mt-4 w-full rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 text-sm text-white placeholder:text-white/28 resize-none" />
        <div className="mt-3 space-y-2">
          {broadcasts.map((broadcast) => (
            <div key={broadcast.id} data-testid={`broadcast-card-${broadcast.id}`} className="rounded-[18px] border border-white/10 bg-black/20 px-4 py-3 flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-white">{broadcast.name}</div>
                <div className="text-xs text-white/46 mt-1">{broadcast.participant_ids.length} targets</div>
              </div>
              <button type="button" data-testid={`broadcast-send-${broadcast.id}`} onClick={() => sendBroadcast(broadcast.id)} className="rounded-full bg-white text-black h-10 px-4 inline-flex items-center gap-2 text-sm font-medium"><Megaphone size={14} /> Send</button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}