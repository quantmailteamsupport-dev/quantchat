import React, { useEffect, useMemo, useRef, useState } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import {
  Send,
  ArrowLeft,
  User,
  Users,
  Check,
  CheckCheck,
  MoreVertical,
  Smile,
  Forward,
  X,
  Paperclip,
  Mic,
  Square,
  Search,
  Phone,
  Video,
  Pin,
  UploadCloud,
  PhoneOff,
  MicOff,
  VideoOff,
  Image as ImageIcon,
  FileText,
  Zap,
  ChevronDown,
  Download,
  Clock3,
  Star,
  Grid3X3,
  ImagePlus,
} from 'lucide-react';
import axios from 'axios';
import { API } from '../lib/api';

const EMOJIS = ['\u{1F44D}', '\u2764\uFE0F', '\u{1F602}', '\u{1F62E}', '\u{1F622}', '\u{1F525}', '\u{1F389}', '\u{1F4AF}', '\u{1F64F}', '\u{1F440}', '\u2728', '\u{1F91D}'];
const FIRE = '\u{1F525}';
const QUICK_REPLIES = ['On my way', 'Seen', 'Give me 5', 'Call me', 'Send photo'];
const DISAPPEARING_OPTIONS = [
  { label: 'Off', minutes: 0 },
  { label: '5 min', minutes: 5 },
  { label: '1 hour', minutes: 60 },
  { label: '24 hours', minutes: 24 * 60 },
];

function formatMsgTime(time) {
  try {
    return format(new Date(time), 'HH:mm');
  } catch {
    return '';
  }
}

function formatDisappearingLabel(minutes) {
  if (!minutes) return 'Off';
  if (minutes < 60) return `${minutes}m`;
  if (minutes < 24 * 60) return `${Math.round(minutes / 60)}h`;
  return `${Math.round(minutes / (24 * 60))}d`;
}

function formatExpiry(time) {
  if (!time) return null;
  try {
    return format(new Date(time), 'HH:mm');
  } catch {
    return null;
  }
}

function formatFileSize(size = 0) {
  if (!size) return 'Unknown size';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function parseAttachmentPayload(content) {
  if (!content || typeof content !== 'string') return null;
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === 'object' && parsed.name) {
      return parsed;
    }
  } catch {}
  return null;
}

function buildConversationSubtitle({ isGroup, conversation, isOnline, isTyping }) {
  if (isTyping) return 'typing...';
  const streakText = conversation.streak_count ? ` • ${conversation.streak_count} day streak` : '';
  if (isGroup) {
    const names = (conversation.participants || []).map((participant) => participant.name).join(', ');
    return `${names}${streakText}`;
  }
  return `${isOnline ? 'online now' : 'offline'}${streakText}`;
}

function MessageBubble({
  msg,
  isMine,
  userId,
  onReact,
  onDelete,
  onForward,
  onEditSubmit,
  onReply,
  onPin,
  onSave,
  participants,
  repliedMsg,
  isPinned,
  isMobile,
  onPreviewImage,
}) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);
  const menuRef = useRef(null);
  const reactions = msg.reactions || {};
  const reactionList = Object.entries(reactions);
  const senderName = !isMine ? (participants?.find((participant) => participant.user_id === msg.sender_id)?.name || '') : '';

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    }

    document.addEventListener('pointerdown', handleClickOutside);
    return () => document.removeEventListener('pointerdown', handleClickOutside);
  }, []);

  const handleEditSubmit = () => {
    if (editContent.trim() && editContent !== msg.content) {
      onEditSubmit(msg.id, editContent);
    }
    setIsEditing(false);
  };

  const renderContent = () => {
    if (msg.type === 'image') {
      return (
        <img
          src={msg.content}
          alt="Attachment"
          className="max-w-[220px] sm:max-w-xs md:max-w-sm h-auto rounded-2xl mt-1 cursor-pointer"
          onClick={() => onPreviewImage?.(msg.content)}
        />
      );
    }

    if (msg.type === 'audio') {
      return (
        <div className="mt-1 flex items-center gap-2 bg-black/10 rounded-full p-1 pr-3">
          <audio controls src={msg.content} className={`${isMobile ? 'w-[180px]' : 'w-[220px]'} h-10`} />
        </div>
      );
    }

    if (msg.type === 'file') {
      const attachment = parseAttachmentPayload(msg.content);
      return (
        <div className="mt-1 rounded-2xl border border-black/10 bg-black/5 p-3 min-w-[220px]">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-qc-surface flex items-center justify-center text-qc-accent-primary flex-shrink-0">
              <FileText size={18} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-current truncate">{attachment?.name || 'Shared file'}</p>
              <p className="text-[12px] text-gray-500 mt-1">
                {attachment?.mime || 'File'} · {formatFileSize(attachment?.size)}
              </p>
            </div>
            {attachment?.url && (
              <a
                href={attachment.url}
                download={attachment?.name || 'attachment'}
                className="w-9 h-9 rounded-full bg-qc-surface flex items-center justify-center text-qc-text-primary hover:bg-qc-surface-hover"
              >
                <Download size={16} />
              </a>
            )}
          </div>
        </div>
      );
    }

    return <p className={`${isMobile ? 'text-[15px]' : 'text-[14.2px]'} whitespace-pre-wrap break-words leading-snug`}>{msg.content}</p>;
  };

  return (
    <div id={`msg-${msg.id}`} className={`flex ${isMine ? 'justify-end' : 'justify-start'} w-full mb-2 group relative`} onMouseLeave={() => setShowMenu(false)}>
      <div
        className={`max-w-[92%] sm:max-w-[72%] px-3 py-2 rounded-[22px] shadow-sm relative flex flex-col transition-all ${
          isPinned ? 'ring-2 ring-qc-accent-primary ring-offset-2 ring-offset-qc-bg' : ''
        } ${isMine ? 'bg-qc-bubble-mine rounded-tr-md text-[#111B21]' : 'bg-qc-bubble-other rounded-tl-md text-white/92'}`}
      >
        <div
          className={`absolute top-1 right-1 p-1 cursor-pointer ${isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity z-10 ${
            isMine ? 'bg-gradient-to-l from-qc-bubble-mine to-transparent' : 'bg-gradient-to-l from-qc-bubble-other to-transparent'
          }`}
          onClick={() => setShowMenu((value) => !value)}
        >
          <svg viewBox="0 0 18 18" width="18" height="18" className="text-gray-500">
            <path fill="currentColor" d="M3.3 4.6 9 10.3l5.7-5.7 1.6 1.6L9 13.4 1.7 6.2l1.6-1.6z" />
          </svg>
        </div>

        {showMenu && !isEditing && (
          <div
            ref={menuRef}
            className={`absolute top-8 ${isMobile ? 'right-0 w-48' : 'right-2 w-52'} bg-qc-surface shadow-lg rounded-2xl py-2 z-50 text-qc-text-primary text-sm border border-qc-border animate-fadeIn origin-top-right`}
          >
            <div className="flex flex-wrap justify-around px-2 py-2 border-b border-qc-border gap-2">
              {EMOJIS.slice(0, 8).map((emoji) => (
                <button key={emoji} onClick={() => { onReact(msg.id, emoji); setShowMenu(false); }} className="hover:scale-125 transition-transform text-lg">
                  {emoji}
                </button>
              ))}
            </div>
            <button onClick={() => { onReply(msg); setShowMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-qc-surface-hover">Reply</button>
            <button onClick={() => { onForward(msg.id); setShowMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-qc-surface-hover">Forward message</button>
            <button onClick={() => { onSave(msg.id); setShowMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-qc-surface-hover">Save message</button>
            <button onClick={() => { onPin(isPinned ? null : msg.id); setShowMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-qc-surface-hover flex justify-between items-center">
              {isPinned ? 'Unpin' : 'Pin'} <Pin size={14} />
            </button>
            {isMine && msg.type === 'text' && (
              <button onClick={() => { setIsEditing(true); setShowMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-qc-surface-hover">
                Edit
              </button>
            )}
            {isMine && (
              <button onClick={() => { onDelete(msg.id); setShowMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-qc-surface-hover text-red-500">
                Delete message
              </button>
            )}
          </div>
        )}

        {!isMine && senderName && <span className="text-[12.5px] font-medium text-blue-500 mb-0.5">{senderName}</span>}
        {msg.forwarded && <div className="flex items-center gap-1 text-[12px] text-gray-500 mb-1 italic"><Forward size={12} /> Forwarded</div>}

        {repliedMsg && (
          <div className="bg-black/5 border-l-4 border-qc-accent-primary rounded-xl p-2 mb-1 cursor-pointer hover:bg-black/10 transition-colors" onClick={() => document.getElementById(`msg-${repliedMsg.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
            <p className="text-[12px] font-medium text-qc-accent-secondary">{repliedMsg.sender_id === userId ? 'You' : (participants?.find((participant) => participant.user_id === repliedMsg.sender_id)?.name || 'Unknown')}</p>
            <p className="text-[13px] text-gray-600 truncate">{repliedMsg.type === 'text' ? repliedMsg.content : (repliedMsg.type === 'image' ? 'Photo' : 'Audio')}</p>
          </div>
        )}

        {isEditing ? (
          <div className="flex flex-col gap-2 min-w-[200px]">
            <textarea
              value={editContent}
              onChange={(event) => setEditContent(event.target.value)}
              className="w-full bg-white/70 border border-gray-300 rounded-xl p-2 text-[14.2px] text-slate-900 placeholder:text-slate-500 resize-none focus:outline-none focus:ring-1 focus:ring-qc-accent-primary"
              rows={2}
            />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setIsEditing(false)} className="text-[12px] text-gray-600 hover:underline">Cancel</button>
              <button onClick={handleEditSubmit} className="text-[12px] text-qc-accent-secondary font-medium hover:underline">Save</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            {renderContent()}
            <div className="flex items-center justify-end gap-1 mt-1 ml-4 self-end -mb-1 flex-wrap">
              {msg.expires_at && <span className="text-[11px] text-qc-accent-primary mr-1">Vanishes {formatExpiry(msg.expires_at)}</span>}
              {msg.is_edited && <span className="text-[11px] text-gray-500 italic mr-1">Edited</span>}
              <span className="text-[11px] text-gray-500">{formatMsgTime(msg.created_at)}</span>
              {isMine && (msg.status === 'read' ? <CheckCheck size={14} className="text-[#53bdeb]" /> : <Check size={14} className="text-gray-500" />)}
            </div>
          </div>
        )}

        {reactionList.length > 0 && !isEditing && (
          <div className="absolute -bottom-3 right-0 flex bg-white rounded-full px-1.5 shadow border border-gray-200 z-10">
            {reactionList.map(([reactionUserId, emoji]) => (
              <span key={reactionUserId} className="text-[12px]">{emoji}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatArea({
  conversation,
  messages,
  onSend,
  onEdit,
  userId,
  onlineUsers,
  typingUsers,
  emitTyping,
  onBack,
  conversations,
  token,
  onReloadMessages,
  onReloadConversations,
  isMobile,
  keyboardOpen,
  onConversationUpdate,
}) {
  const [input, setInput] = useState('');
  const [forwardMsgId, setForwardMsgId] = useState(null);
  const [replyToMsg, setReplyToMsg] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [searchCursor, setSearchCursor] = useState(0);
  const [showChatMenu, setShowChatMenu] = useState(false);
  const [showDisappearingMenu, setShowDisappearingMenu] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [quickNoteDraft, setQuickNoteDraft] = useState('');
  const [showQuickNote, setShowQuickNote] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [permissionNotice, setPermissionNotice] = useState('');
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [isScheduling, setIsScheduling] = useState(false);
  const [showInfoSheet, setShowInfoSheet] = useState(false);
  const messagesContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeout = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const isGroup = conversation.type === 'group';
  const otherUser = isGroup ? null : (conversation.other_user || conversation.participants?.find((participant) => participant.user_id !== userId));
  const isOnline = otherUser ? onlineUsers.has(otherUser.user_id) : false;
  const isTyping = typingUsers[conversation.id] && typingUsers[conversation.id] !== userId;
  const matchingMessages = useMemo(() => (
    searchTerm.trim()
      ? messages.filter((message) => (message.content || '').toLowerCase().includes(searchTerm.toLowerCase()))
      : []
  ), [messages, searchTerm]);
  const draftKey = `qc_draft_${conversation.id}`;

  useEffect(() => {
    if (!messagesContainerRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 180;
    if (isNearBottom) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setShowJumpToBottom(false);
    }
  }, [messages]);

  useEffect(() => {
    setInput(localStorage.getItem(draftKey) || '');
    setReplyToMsg(null);
    setShowEmojiPicker(false);
    setShowAttachMenu(false);
    setShowJumpToBottom(false);
    setPendingAttachment(null);
    setShowInfoSheet(false);
  }, [draftKey]);

  useEffect(() => {
    if (input.trim()) {
      localStorage.setItem(draftKey, input);
    } else {
      localStorage.removeItem(draftKey);
    }
  }, [draftKey, input]);

  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => setRecordingTime((value) => value + 1), 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  useEffect(() => {
    if (!showSearch || matchingMessages.length === 0) return;
    const currentMatch = matchingMessages[Math.min(searchCursor, matchingMessages.length - 1)];
    document.getElementById(`msg-${currentMatch.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [matchingMessages, searchCursor, showSearch]);

  const handleSend = (event) => {
    if (event) event.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim(), 'text', replyToMsg?.id);
    setInput('');
    localStorage.removeItem(draftKey);
    setReplyToMsg(null);
    setShowEmojiPicker(false);
    emitTyping(conversation.id, false);
  };

  const sendPendingAttachment = () => {
    if (!pendingAttachment) return;
    onSend(pendingAttachment.payload, pendingAttachment.messageType, replyToMsg?.id);
    setPendingAttachment(null);
    setReplyToMsg(null);
    setShowAttachMenu(false);
  };

  const handleQuickReply = (reply) => {
    setInput((current) => (current.trim() ? `${current.trim()} ${reply}` : reply));
    setShowEmojiPicker(false);
    setShowAttachMenu(false);
  };

  const handleInputChange = (event) => {
    setInput(event.target.value);
    emitTyping(conversation.id, true);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => emitTyping(conversation.id, false), 2000);
  };

  const handleKeyDown = (event) => {
    if (!isMobile && event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  };

  const handleReact = async (msgId, emoji) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/api/messages/${msgId}/react`, { emoji }, { headers });
      onReloadMessages?.(conversation.id);
    } catch {}
  };

  const handleDelete = async (msgId) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.delete(`${API}/api/messages/${msgId}`, { headers });
      onReloadMessages?.(conversation.id);
      onReloadConversations?.();
    } catch {}
  };

  const handleSaveMessage = async (msgId) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/api/messages/${msgId}/save`, {}, { headers });
    } catch {}
  };

  const handleForward = async (targetConvId) => {
    if (!forwardMsgId) return;
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/api/messages/${forwardMsgId}/forward`, { conversation_id: targetConvId }, { headers });
      setForwardMsgId(null);
    } catch {}
  };

  const handlePin = async (msgId) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/api/conversations/${conversation.id}/pin_message`, { message_id: msgId }, { headers });
      onReloadConversations?.();
    } catch {}
  };

  const handleToggleStar = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.post(`${API}/api/conversations/${conversation.id}/star`, {}, { headers });
      onConversationUpdate?.({ ...conversation, is_starred: data.is_starred });
      onReloadConversations?.();
    } catch {}
  };

  const handleScheduleSend = async (delayMinutes = 5) => {
    if (!input.trim()) return;
    setIsScheduling(true);
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/api/conversations/${conversation.id}/schedule-message`, { content: input.trim(), delay_minutes: delayMinutes, type: 'text', reply_to: replyToMsg?.id }, { headers });
      setInput('');
      setReplyToMsg(null);
      localStorage.removeItem(draftKey);
    } catch {}
    setIsScheduling(false);
  };

  const handleSetDisappearing = async (minutes) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const { data } = await axios.post(`${API}/api/conversations/${conversation.id}/disappearing`, { minutes }, { headers });
      onConversationUpdate?.(data.conversation);
      onReloadConversations?.();
      setShowDisappearingMenu(false);
      setShowChatMenu(false);
    } catch {}
  };

  const processFile = (file, mode = 'file') => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result;
      if (mode === 'image' || file.type.startsWith('image/')) {
        setPendingAttachment({
          messageType: 'image',
          payload: result,
          fileName: file.name,
          mime: file.type,
          previewUrl: result,
        });
        setShowAttachMenu(false);
        return;
      }

      setPendingAttachment({
        messageType: 'file',
        payload: JSON.stringify({
          name: file.name,
          size: file.size,
          mime: file.type || 'application/octet-stream',
          url: file.size <= 2 * 1024 * 1024 ? result : '',
        }),
        fileName: file.name,
        mime: file.type || 'application/octet-stream',
      });
      setShowAttachMenu(false);
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (event, mode = 'file') => {
    const file = event.target.files[0];
    if (!file) return;
    processFile(file, mode);
    event.target.value = '';
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragging(false);
    if (event.dataTransfer.files && event.dataTransfer.files.length > 0) {
      processFile(event.dataTransfer.files[0], event.dataTransfer.files[0].type.startsWith('image/') ? 'image' : 'file');
      event.dataTransfer.clearData();
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunksRef.current.push(event.data);
      };
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = (event) => {
          onSend(event.target.result, 'audio', replyToMsg?.id);
          setReplyToMsg(null);
        };
        reader.readAsDataURL(audioBlob);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch {
      setPermissionNotice('Microphone permission is blocked. Enable it in browser or app settings to send voice notes.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop());
      setIsRecording(false);
    }
  };

  const handleQuickNote = () => {
    setQuickNoteDraft('');
    setShowQuickNote(true);
    setShowAttachMenu(false);
  };

  const sendQuickNote = (note = quickNoteDraft) => {
    if (!note.trim()) return;
    onSend(`Snap note: ${note.trim()}`, 'text', replyToMsg?.id);
    setReplyToMsg(null);
    setQuickNoteDraft('');
    setShowQuickNote(false);
  };

  const handleClearChat = async () => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/api/conversations/${conversation.id}/clear`, {}, { headers });
      setShowChatMenu(false);
      setShowClearConfirm(false);
      onReloadMessages?.(conversation.id);
      onReloadConversations?.();
    } catch {}
  };

  const handleMessagesScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    setShowJumpToBottom(scrollHeight - scrollTop - clientHeight > 220);
  };

  const jumpToLatest = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowJumpToBottom(false);
  };

  let lastDate = null;
  const pinnedMessage = conversation.pinned_message_id
    ? (messages.find((message) => message.id === conversation.pinned_message_id) || conversation.pinned_message)
    : conversation.pinned_message;
  const sharedMedia = messages.filter((message) => message.type === 'image').slice().reverse().slice(0, 8);
  const sharedFiles = messages
    .filter((message) => message.type === 'file')
    .map((message) => ({ message, attachment: parseAttachmentPayload(message.content) }))
    .filter((entry) => entry.attachment)
    .slice()
    .reverse()
    .slice(0, 5);
  const highlightedPeople = isGroup ? (conversation.participants || []).slice(0, 6) : [otherUser].filter(Boolean);
  const draftCount = input.trim().length;
  const inboundCount = messages.filter((message) => message.sender_id !== userId).length;

  return (
    <div data-testid="chat-view" className="flex min-h-0 flex-col h-full w-full relative bg-qc-bg overflow-hidden" onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}>
      <div className="absolute inset-0 chat-bg-pattern z-0 pointer-events-none" />

      {isDragging && (
        <div className="absolute inset-0 bg-qc-accent-primary/90 z-50 flex items-center justify-center backdrop-blur-sm transition-all border-4 border-dashed border-white m-4 rounded-xl">
          <div className="flex flex-col items-center text-white">
            <UploadCloud size={64} className="mb-4 animate-bounce" />
            <h2 className="text-3xl font-bold uppercase tracking-wider">Drop to Upload</h2>
          </div>
        </div>
      )}

      {activeCall && (
        <div className="absolute inset-0 bg-[#0A1014]/95 z-50 flex flex-col items-center justify-between py-12 px-6 backdrop-blur-md animate-fadeIn text-white">
          <div className="text-center mt-10">
            <div className="w-32 h-32 rounded-full overflow-hidden mb-6 mx-auto border-4 border-qc-accent-primary shadow-[0_0_30px_rgba(255,107,61,0.4)] animate-pulse">
              {isGroup
                ? (conversation.avatar ? <img src={conversation.avatar} alt="" className="w-full h-full object-cover" /> : <Users size={64} className="m-auto mt-8 text-gray-400" />)
                : (otherUser?.avatar ? <img src={otherUser.avatar} alt="" className="w-full h-full object-cover" /> : <User size={64} className="m-auto mt-8 text-gray-400" />)}
            </div>
            <h2 className="text-3xl font-medium mb-2">{isGroup ? conversation.name : (otherUser?.name || 'Unknown')}</h2>
            <p className="text-gray-400 uppercase tracking-widest text-sm">{activeCall.status === 'ringing' ? 'Connecting preview...' : 'Live preview'}</p>
            <p className="text-white/50 text-xs mt-3 uppercase tracking-[0.28em]">Call preview mode</p>
          </div>

          <div className="flex items-center gap-8 mb-10">
            <button className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
              <MicOff size={24} />
            </button>
            <button className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors">
              <VideoOff size={24} />
            </button>
            <button onClick={() => setActiveCall(null)} className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-colors shadow-lg hover:scale-105 transform">
              <PhoneOff size={28} />
            </button>
          </div>
        </div>
      )}

      {forwardMsgId && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setForwardMsgId(null)}>
          <div className="bg-qc-surface w-full max-w-sm rounded-2xl shadow-xl flex flex-col max-h-[80vh] overflow-hidden" onClick={(event) => event.stopPropagation()}>
            <div className="p-4 border-b border-qc-border flex items-center justify-between bg-qc-surface-hover">
              <span className="font-medium text-qc-text-primary text-lg">Forward message to</span>
              <button onClick={() => setForwardMsgId(null)} className="text-qc-text-secondary hover:text-qc-text-primary"><X size={24} /></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {(conversations || []).filter((conv) => conv.id !== conversation.id).map((conv) => {
                const isGroupConversation = conv.type === 'group';
                const name = isGroupConversation ? conv.name : (conv.other_user?.name || conv.participants?.find((participant) => participant.user_id !== userId)?.name || 'Unknown');
                const avatar = isGroupConversation ? conv.avatar : (conv.other_user?.avatar || conv.participants?.find((participant) => participant.user_id !== userId)?.avatar || '');
                return (
                  <button key={conv.id} onClick={() => handleForward(conv.id)} className="w-full flex items-center gap-3 p-3 hover:bg-qc-surface-hover transition-colors text-left border-b border-qc-border">
                    <div className="w-10 h-10 rounded-full bg-qc-surface-hover flex items-center justify-center overflow-hidden flex-shrink-0">
                      {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover" /> : <User size={20} className="text-qc-text-secondary" />}
                    </div>
                    <span className="text-[15px] text-qc-text-primary font-medium truncate">{name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      <div className={`premium-divider px-3 md:px-4 bg-qc-surface-hover/96 backdrop-blur-xl flex items-center gap-3 flex-shrink-0 shadow-sm relative z-20 border-b border-qc-border ${isMobile ? 'h-14' : 'sticky top-0 h-16'}`}>
        {isMobile && (
          <button data-testid="chat-back-button" onClick={onBack} className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-black/5 text-qc-text-secondary -ml-1">
            <ArrowLeft size={22} />
          </button>
        )}
        <button
          data-testid="chat-info-toggle-avatar"
          onClick={() => setShowInfoSheet(true)}
          className={`${isMobile ? 'w-9 h-9' : 'w-10 h-10'} rounded-full overflow-hidden bg-qc-bg flex items-center justify-center flex-shrink-0 cursor-pointer`}
        >
          {isGroup
            ? (conversation.avatar ? <img src={conversation.avatar} alt="" className="w-full h-full object-cover" /> : <Users size={24} className="text-qc-text-secondary" />)
            : (otherUser?.avatar ? <img src={otherUser.avatar} alt="" className="w-full h-full object-cover" /> : <User size={24} className="text-qc-text-secondary" />)}
        </button>
        <button data-testid="chat-info-toggle" onClick={() => setShowInfoSheet(true)} className="flex-1 min-w-0 cursor-pointer text-left">
          <h3 className={`${isMobile ? 'text-[15px]' : 'text-base'} font-medium text-qc-text-primary truncate`}>{isGroup ? conversation.name : (otherUser?.name || 'Unknown')}</h3>
          <p className="text-[13px] text-qc-text-secondary truncate">{buildConversationSubtitle({ isGroup, conversation, isOnline, isTyping })}</p>
        </button>

        <div className="flex items-center gap-1 md:gap-2 text-qc-text-secondary relative">
          {!isMobile && <button onClick={() => setActiveCall({ type: 'video', status: 'ringing' })} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5"><Video size={20} /></button>}
          {!isMobile && <button onClick={() => setActiveCall({ type: 'audio', status: 'ringing' })} className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5"><Phone size={18} /></button>}
          <button data-testid="chat-star-toggle" onClick={handleToggleStar} className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center hover:bg-black/5 ${conversation.is_starred ? 'text-[#ffe56a]' : ''}`}><Star size={18} className={conversation.is_starred ? 'fill-[#ffe56a]' : ''} /></button>
          <button data-testid="chat-search-toggle" onClick={() => setShowSearch((value) => !value)} className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center hover:bg-black/5 ${showSearch ? 'text-qc-accent-primary' : ''}`}><Search size={18} /></button>
          {!isMobile && <button data-testid="chat-details-toggle-desktop" onClick={() => setShowInfoSheet(true)} className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center hover:bg-black/5 ${showInfoSheet ? 'text-qc-accent-primary' : ''}`}><Grid3X3 size={18} /></button>}
          <button data-testid="chat-menu-toggle" onClick={() => { setShowChatMenu((value) => !value); setShowDisappearingMenu(false); }} className={`w-9 h-9 md:w-10 md:h-10 rounded-full flex items-center justify-center hover:bg-black/5 ${showChatMenu ? 'text-qc-accent-primary' : ''}`}><MoreVertical size={18} /></button>

          {showChatMenu && (
            <div className={`absolute top-12 right-0 rounded-2xl border border-qc-border bg-qc-surface shadow-xl overflow-hidden z-30 animate-fadeIn ${isMobile ? 'w-48' : 'w-56'}`}>
              {isMobile && (
                <>
                  <button onClick={() => { setActiveCall({ type: 'audio', status: 'ringing' }); setShowChatMenu(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-qc-surface-hover">Start audio call</button>
                  <button onClick={() => { setActiveCall({ type: 'video', status: 'ringing' }); setShowChatMenu(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-qc-surface-hover">Start video call</button>
                </>
              )}
              <button onClick={() => { setShowSearch(true); setShowChatMenu(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-qc-surface-hover">Search in conversation</button>
              <button onClick={() => setShowDisappearingMenu((value) => !value)} className="w-full text-left px-4 py-3 text-sm hover:bg-qc-surface-hover flex items-center justify-between">
                <span>Disappearing messages</span>
                <span className="text-qc-text-tertiary text-xs">{formatDisappearingLabel(conversation.disappearing_minutes)}</span>
              </button>
              <button onClick={() => { onReloadMessages?.(conversation.id); setShowChatMenu(false); }} className="w-full text-left px-4 py-3 text-sm hover:bg-qc-surface-hover">Reload messages</button>
              <button onClick={() => { setShowClearConfirm(true); setShowChatMenu(false); }} className="w-full text-left px-4 py-3 text-sm text-red-500 hover:bg-qc-surface-hover">Clear chat</button>
            </div>
          )}

          {showDisappearingMenu && (
            <div className={`absolute top-12 rounded-2xl border border-qc-border bg-qc-surface shadow-xl overflow-hidden z-30 animate-fadeIn ${isMobile ? 'right-0 w-44' : 'right-60 w-40'}`}>
              {DISAPPEARING_OPTIONS.map((option) => (
                <button
                  key={option.minutes}
                  onClick={() => handleSetDisappearing(option.minutes)}
                  className={`w-full text-left px-4 py-3 text-sm hover:bg-qc-surface-hover ${conversation.disappearing_minutes === option.minutes ? 'text-qc-accent-primary font-medium' : ''}`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {isMobile && (
        <div className="premium-divider px-3 py-2 border-b border-qc-border bg-qc-surface/92 backdrop-blur-md flex gap-2 overflow-x-auto hide-scrollbar relative z-20">
          <button data-testid="chat-mobile-search-toggle" onClick={() => setShowSearch((value) => !value)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs border ${showSearch ? 'bg-qc-accent-tertiary text-qc-accent-primary border-qc-border' : 'bg-qc-surface-hover text-qc-text-secondary border-qc-border'}`}>
            Search
          </button>
          <button data-testid="chat-mobile-media-toggle" onClick={() => { setShowAttachMenu((value) => !value); setShowEmojiPicker(false); }} className={`shrink-0 rounded-full px-3 py-1.5 text-xs border ${showAttachMenu ? 'bg-qc-accent-tertiary text-qc-accent-primary border-qc-border' : 'bg-qc-surface-hover text-qc-text-secondary border-qc-border'}`}>
            Media
          </button>
          <button data-testid="chat-mobile-vanish-toggle" onClick={() => { setShowDisappearingMenu((value) => !value); setShowChatMenu(false); }} className={`shrink-0 rounded-full px-3 py-1.5 text-xs border ${showDisappearingMenu ? 'bg-qc-accent-tertiary text-qc-accent-primary border-qc-border' : 'bg-qc-surface-hover text-qc-text-secondary border-qc-border'}`}>
            Vanish {formatDisappearingLabel(conversation.disappearing_minutes)}
          </button>
          <button data-testid="chat-mobile-call-button" onClick={() => setActiveCall({ type: 'audio', status: 'ringing' })} className="shrink-0 rounded-full px-3 py-1.5 text-xs border border-qc-border bg-qc-surface-hover text-qc-text-secondary">
            Call
          </button>
          <button data-testid="chat-mobile-info-toggle" onClick={() => setShowInfoSheet(true)} className="shrink-0 rounded-full px-3 py-1.5 text-xs border border-qc-border bg-qc-surface-hover text-qc-text-secondary">
            Details
          </button>
        </div>
      )}

      {showSearch && (
        <div className={`bg-qc-surface px-3 md:px-4 py-3 border-b border-qc-border flex items-center gap-3 relative z-20 ${isMobile ? 'flex-wrap' : ''}`}>
          <div className="flex-1 rounded-2xl bg-qc-surface-hover border border-qc-border px-3 py-2 flex items-center gap-2 min-w-0">
            <Search size={16} className="text-qc-text-secondary" />
            <input
              data-testid="chat-search-input"
              value={searchTerm}
              onChange={(event) => {
                setSearchTerm(event.target.value);
                setSearchCursor(0);
              }}
              placeholder="Find a message"
              className="w-full bg-transparent text-sm text-qc-text-primary"
            />
          </div>
          {matchingMessages.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-qc-text-secondary">
              <button onClick={() => setSearchCursor((value) => Math.max(value - 1, 0))} className="px-2 py-1 rounded-full bg-qc-surface-hover border border-qc-border">Prev</button>
              <span>{Math.min(searchCursor + 1, matchingMessages.length)}/{matchingMessages.length}</span>
              <button onClick={() => setSearchCursor((value) => Math.min(value + 1, matchingMessages.length - 1))} className="px-2 py-1 rounded-full bg-qc-surface-hover border border-qc-border">Next</button>
            </div>
          )}
          <button onClick={() => { setShowSearch(false); setSearchTerm(''); setSearchCursor(0); }} className="text-qc-text-secondary hover:text-qc-text-primary">
            <X size={18} />
          </button>
        </div>
      )}

      {(conversation.disappearing_minutes > 0 || conversation.streak_count > 0) && (
        <div className={`bg-qc-surface px-4 py-2 border-b border-qc-border text-xs text-qc-text-secondary relative z-10 ${isMobile ? 'flex flex-col items-start gap-1' : 'flex items-center justify-between'}`}>
          <span>{conversation.disappearing_minutes > 0 ? `Snaps vanish after ${formatDisappearingLabel(conversation.disappearing_minutes)}` : 'Disappear timer off'}</span>
          {conversation.streak_count > 0 && <span className="text-qc-accent-primary font-medium">{FIRE} {conversation.streak_count} day streak</span>}
        </div>
      )}

      {pinnedMessage && (
        <div className="bg-qc-surface-hover px-4 py-2 border-b border-qc-border flex items-center gap-3 relative z-10 cursor-pointer hover:bg-black/5 transition-colors" onClick={() => document.getElementById(`msg-${pinnedMessage.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}>
          <Pin size={16} className="text-qc-text-secondary rotate-45" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-qc-accent-primary font-medium">Pinned Message</p>
            <p className="text-[13px] text-qc-text-secondary truncate">{pinnedMessage.type === 'text' ? pinnedMessage.content : 'Attachment'}</p>
          </div>
          <button onClick={(event) => { event.stopPropagation(); handlePin(null); }} className="text-qc-text-secondary hover:text-qc-text-primary"><X size={18} /></button>
        </div>
      )}

      <div
        ref={messagesContainerRef}
        onScroll={handleMessagesScroll}
        className={`safe-scroll-shell flex-1 py-4 space-y-1 relative z-10 ${isMobile ? 'px-3 pt-3 pb-28' : 'px-4 sm:px-[5%] md:px-[10%] pb-8'}`}
      >
        {messages.length === 0 ? (
          <div className="flex justify-center mt-10">
            <div className="rounded-[24px] border border-qc-border bg-qc-surface px-5 py-4 shadow-sm text-center max-w-sm">
              <span className="block mb-1 text-sm text-qc-text-primary font-medium">Start this lane</span>
              <span className="block text-[12.5px] text-qc-text-secondary">Messages and calls are end-to-end encrypted. No one outside this chat, not even QuantChat, can read or listen to them.</span>
            </div>
          </div>
        ) : messages.map((message) => {
          const msgDate = new Date(message.created_at).toDateString();
          const showDate = msgDate !== lastDate;
          lastDate = msgDate;
          const repliedMsg = message.reply_to ? messages.find((current) => current.id === message.reply_to) : null;

          return (
            <React.Fragment key={message.id}>
              {showDate && (
                <div className="flex justify-center my-4">
                  <span className="bg-qc-surface border border-qc-border shadow-sm text-qc-text-secondary text-[12px] uppercase font-medium px-3 py-1 rounded-lg">
                    {isToday(new Date(message.created_at)) ? 'Today' : isYesterday(new Date(message.created_at)) ? 'Yesterday' : format(new Date(message.created_at), 'MMMM d, yyyy')}
                  </span>
                </div>
              )}
              <MessageBubble
                msg={message}
                isMine={message.sender_id === userId}
                userId={userId}
                onReact={handleReact}
                onDelete={handleDelete}
                onForward={setForwardMsgId}
                onEditSubmit={onEdit}
                onReply={setReplyToMsg}
                onPin={handlePin}
                onSave={handleSaveMessage}
                participants={conversation.participants}
                repliedMsg={repliedMsg}
                isPinned={conversation.pinned_message_id === message.id}
                isMobile={isMobile}
                onPreviewImage={setPreviewImage}
              />
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {showJumpToBottom && (
        <button
          data-testid="chat-jump-latest-button"
          onClick={jumpToLatest}
          className={`absolute right-4 z-30 h-10 w-10 rounded-full border border-qc-border bg-qc-surface text-qc-text-primary shadow-xl flex items-center justify-center hover:bg-qc-surface-hover ${isMobile ? 'bottom-[calc(var(--mobile-nav-height)+5.75rem)]' : 'bottom-24'}`}
          title="Jump to latest"
        >
          <ChevronDown size={19} />
        </button>
      )}

      {replyToMsg && (
        <div className="bg-qc-surface-hover px-4 py-2 flex items-center justify-between border-l-4 border-qc-accent-primary relative z-20 shadow-sm border-t border-qc-border">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-qc-accent-secondary">{replyToMsg.sender_id === userId ? 'You' : (conversation.participants?.find((participant) => participant.user_id === replyToMsg.sender_id)?.name || 'Unknown')}</p>
            <p className="text-[13px] text-qc-text-secondary truncate">{replyToMsg.type === 'text' ? replyToMsg.content : (replyToMsg.type === 'image' ? 'Photo' : 'Audio')}</p>
          </div>
          <button data-testid="chat-cancel-reply-button" onClick={() => setReplyToMsg(null)} className="text-qc-text-secondary hover:text-qc-text-primary p-2"><X size={20} /></button>
        </div>
      )}

      {pendingAttachment && (
        <div className="bg-qc-surface-hover px-4 py-3 border-t border-qc-border relative z-20">
          <div className="rounded-[22px] border border-qc-border bg-qc-surface p-3 flex items-center gap-3">
            {pendingAttachment.previewUrl ? (
              <img src={pendingAttachment.previewUrl} alt={pendingAttachment.fileName} className="w-14 h-14 rounded-2xl object-cover flex-shrink-0" />
            ) : (
              <div className="w-14 h-14 rounded-2xl bg-qc-accent-tertiary text-qc-accent-primary flex items-center justify-center flex-shrink-0">
                <FileText size={20} />
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-qc-text-primary truncate">{pendingAttachment.fileName}</p>
              <p className="text-xs text-qc-text-secondary mt-1">{pendingAttachment.mime || 'Attachment ready'}</p>
            </div>
            <button data-testid="chat-cancel-attachment-button" onClick={() => setPendingAttachment(null)} className="w-9 h-9 rounded-full border border-qc-border text-qc-text-secondary hover:text-qc-text-primary">
              <X size={16} className="mx-auto" />
            </button>
            <button data-testid="chat-send-attachment-button" onClick={sendPendingAttachment} className="h-10 px-4 rounded-full bg-qc-accent-primary text-white text-sm font-medium hover:bg-qc-accent-secondary">
              Send
            </button>
          </div>
        </div>
      )}

      {showInfoSheet && (
        <div className="absolute inset-0 z-40 bg-black/55 backdrop-blur-sm flex items-end md:items-stretch md:justify-end" onClick={() => setShowInfoSheet(false)}>
          <div className="w-full md:max-w-[380px] h-[86%] md:h-full rounded-t-[30px] md:rounded-none md:border-l border-qc-border bg-qc-surface shadow-[0_-20px_70px_rgba(0,0,0,0.36)] overflow-hidden animate-slideUp md:animate-slideIn" onClick={(event) => event.stopPropagation()}>
            <div className="sticky top-0 z-10 border-b border-qc-border bg-qc-surface/96 backdrop-blur-xl px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-[0.24em] text-qc-text-tertiary">Lane details</p>
                  <h3 className="mt-1 text-xl font-semibold text-qc-text-primary truncate">{isGroup ? conversation.name : (otherUser?.name || 'Unknown')}</h3>
                  <p className="mt-1 text-sm text-qc-text-secondary">{isGroup ? `${conversation.participants?.length || 0} members` : isOnline ? 'online now' : 'last seen offline'}</p>
                </div>
                <button onClick={() => setShowInfoSheet(false)} className="w-10 h-10 rounded-full border border-qc-border text-qc-text-secondary hover:text-qc-text-primary">
                  <X size={18} className="mx-auto" />
                </button>
              </div>
            </div>

            <div className="h-full overflow-y-auto px-4 py-4 space-y-4 pb-16">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-[22px] border border-qc-border bg-qc-surface-hover px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary">Messages</p>
                  <p className="mt-2 text-lg font-semibold text-qc-text-primary">{messages.length}</p>
                </div>
                <div className="rounded-[22px] border border-qc-border bg-qc-surface-hover px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary">Replies</p>
                  <p className="mt-2 text-lg font-semibold text-qc-text-primary">{inboundCount}</p>
                </div>
                <div className="rounded-[22px] border border-qc-border bg-qc-surface-hover px-3 py-3">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary">Media</p>
                  <p className="mt-2 text-lg font-semibold text-qc-text-primary">{sharedMedia.length + sharedFiles.length}</p>
                </div>
              </div>

              <div className="rounded-[24px] border border-qc-border bg-qc-surface-hover p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary">Conversation mode</p>
                    <h4 className="mt-1 text-sm font-semibold text-qc-text-primary">Quick controls</h4>
                  </div>
                  {conversation.is_starred && (
                    <span className="rounded-full bg-[#ffe56a]/18 px-2 py-1 text-[10px] text-[#ffe56a]">Pinned lane</span>
                  )}
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button onClick={handleToggleStar} className="rounded-2xl border border-qc-border px-3 py-3 text-left text-sm text-qc-text-primary hover:bg-qc-surface">
                    {conversation.is_starred ? 'Unpin lane' : 'Pin lane'}
                  </button>
                  <button onClick={() => handleSetDisappearing(conversation.disappearing_minutes ? 0 : 60)} className="rounded-2xl border border-qc-border px-3 py-3 text-left text-sm text-qc-text-primary hover:bg-qc-surface">
                    {conversation.disappearing_minutes ? 'Disable vanish' : 'Enable vanish'}
                  </button>
                  <button onClick={() => { setShowQuickNote(true); setShowInfoSheet(false); }} className="rounded-2xl border border-qc-border px-3 py-3 text-left text-sm text-qc-text-primary hover:bg-qc-surface">
                    Quick note
                  </button>
                  <button onClick={() => { jumpToLatest(); setShowInfoSheet(false); }} className="rounded-2xl border border-qc-border px-3 py-3 text-left text-sm text-qc-text-primary hover:bg-qc-surface">
                    Jump latest
                  </button>
                </div>
              </div>

              <div className="rounded-[24px] border border-qc-border bg-qc-surface-hover p-4">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary">People</p>
                  <h4 className="mt-1 text-sm font-semibold text-qc-text-primary">{isGroup ? 'Members' : 'Contact card'}</h4>
                </div>
                <div className="mt-3 space-y-2">
                  {highlightedPeople.map((participant, index) => (
                    <div key={participant?.user_id || participant?.id || index} className="flex items-center gap-3 rounded-2xl border border-qc-border bg-qc-surface px-3 py-3">
                      <div className="h-11 w-11 overflow-hidden rounded-2xl bg-qc-accent-tertiary flex items-center justify-center">
                        {participant?.avatar ? <img src={participant.avatar} alt="" className="h-full w-full object-cover" /> : <User size={18} className="text-qc-text-secondary" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-qc-text-primary">{participant?.name || 'Unknown'}</p>
                        <p className="text-xs text-qc-text-secondary truncate">{participant?.user_id === userId ? 'You' : 'Reachable now'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[24px] border border-qc-border bg-qc-surface-hover p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary">Shared media</p>
                    <h4 className="mt-1 text-sm font-semibold text-qc-text-primary">Recent drops</h4>
                  </div>
                  <ImagePlus size={16} className="text-qc-text-secondary" />
                </div>
                {sharedMedia.length === 0 ? (
                  <p className="mt-3 text-sm text-qc-text-secondary">No media shared yet in this lane.</p>
                ) : (
                  <div className="mt-3 grid grid-cols-3 gap-2">
                    {sharedMedia.map((message) => (
                      <button key={`media-${message.id}`} onClick={() => setPreviewImage(message.content)} className="aspect-square overflow-hidden rounded-2xl border border-qc-border bg-qc-surface">
                        <img src={message.content} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-[24px] border border-qc-border bg-qc-surface-hover p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.22em] text-qc-text-tertiary">Files</p>
                    <h4 className="mt-1 text-sm font-semibold text-qc-text-primary">Recent attachments</h4>
                  </div>
                  <FileText size={16} className="text-qc-text-secondary" />
                </div>
                {sharedFiles.length === 0 ? (
                  <p className="mt-3 text-sm text-qc-text-secondary">No file attachments yet.</p>
                ) : (
                  <div className="mt-3 space-y-2">
                    {sharedFiles.map(({ message, attachment }) => (
                      <a
                        key={`file-${message.id}`}
                        href={attachment?.url || '#'}
                        download={attachment?.name || 'attachment'}
                        className="flex items-center gap-3 rounded-2xl border border-qc-border bg-qc-surface px-3 py-3"
                      >
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-qc-accent-tertiary text-qc-accent-primary">
                          <FileText size={18} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-qc-text-primary">{attachment?.name || 'Attachment'}</p>
                          <p className="text-xs text-qc-text-secondary">{attachment?.mime || 'file'}</p>
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {(showQuickNote || showClearConfirm || permissionNotice) && (
        <div className="absolute inset-0 z-50 bg-black/45 backdrop-blur-sm flex items-end sm:items-center justify-center p-3" onClick={() => { setShowQuickNote(false); setShowClearConfirm(false); setPermissionNotice(''); }}>
          <div className="w-full max-w-sm rounded-[24px] border border-qc-border bg-qc-surface shadow-xl overflow-hidden animate-slideUp" onClick={(event) => event.stopPropagation()}>
            {showQuickNote && (
              <>
                <div className="px-4 py-3 border-b border-qc-border flex items-center justify-between">
                  <span className="text-sm font-semibold text-qc-text-primary">Quick note</span>
                  <button onClick={() => setShowQuickNote(false)} className="text-qc-text-secondary"><ChevronDown size={18} /></button>
                </div>
                <div className="p-4 space-y-3">
                  <textarea
                    value={quickNoteDraft}
                    onChange={(event) => setQuickNoteDraft(event.target.value)}
                    placeholder="Write a short snap note"
                    className="w-full min-h-[96px] rounded-2xl border border-qc-border bg-qc-surface-hover px-4 py-3 text-sm text-qc-text-primary resize-none"
                  />
                  <div className="flex gap-2 overflow-x-auto hide-scrollbar">
                    {QUICK_REPLIES.map((reply) => (
                      <button key={reply} onClick={() => sendQuickNote(reply)} className="rounded-full border border-qc-border bg-qc-surface-hover px-3 py-2 text-xs text-qc-text-primary whitespace-nowrap">
                        {reply}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => sendQuickNote()} disabled={!quickNoteDraft.trim()} className="w-full rounded-2xl bg-qc-accent-primary py-3 text-sm font-semibold text-white disabled:opacity-40">
                    Send note
                  </button>
                </div>
              </>
            )}
            {showClearConfirm && (
              <div className="p-4">
                <h3 className="text-base font-semibold text-qc-text-primary">Clear this chat?</h3>
                <p className="mt-2 text-sm text-qc-text-secondary">This removes the visible messages in this conversation.</p>
                <div className="mt-4 grid grid-cols-2 gap-2">
                  <button onClick={() => setShowClearConfirm(false)} className="rounded-2xl border border-qc-border py-3 text-sm text-qc-text-primary">Cancel</button>
                  <button onClick={handleClearChat} className="rounded-2xl bg-red-500 py-3 text-sm font-semibold text-white">Clear</button>
                </div>
              </div>
            )}
            {permissionNotice && (
              <div className="p-4">
                <h3 className="text-base font-semibold text-qc-text-primary">Permission needed</h3>
                <p className="mt-2 text-sm text-qc-text-secondary">{permissionNotice}</p>
                <button onClick={() => setPermissionNotice('')} className="mt-4 w-full rounded-2xl bg-qc-accent-primary py-3 text-sm font-semibold text-white">Okay</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className={`premium-surface px-3 md:px-4 py-2.5 flex items-end gap-2 flex-shrink-0 relative z-20 border-t border-qc-border backdrop-blur-xl ${isMobile && !keyboardOpen ? 'pb-[calc(0.7rem+env(safe-area-inset-bottom))]' : ''}`}>
        <input type="file" accept="image/*" className="hidden" ref={imageInputRef} onChange={(event) => handleFileChange(event, 'image')} />
        <input type="file" accept=".pdf,.txt,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip" className="hidden" ref={fileInputRef} onChange={(event) => handleFileChange(event, 'file')} />

        {(input.trim() || pendingAttachment) && (
          <div className={`${isMobile ? 'absolute left-3 right-3 bottom-[calc(100%+0.55rem)]' : 'absolute bottom-16 left-4 right-4'} z-30 rounded-[24px] border border-qc-border bg-qc-surface/94 backdrop-blur-xl px-3 py-2 shadow-[0_18px_50px_rgba(0,0,0,0.22)]`}>
            <div className="flex items-center justify-between gap-3 text-[11px] text-qc-text-secondary">
              <div className="flex items-center gap-2 min-w-0">
                <span className="rounded-full bg-qc-accent-tertiary px-2 py-1 text-qc-text-primary">{pendingAttachment ? 'Attachment ready' : 'Draft live'}</span>
                <span className="truncate">{draftCount > 0 ? `${draftCount} chars ready to send` : 'Preview before you send'}</span>
              </div>
              {input.trim() && (
                <div className="flex items-center gap-1">
                  {[5, 30].map((minutes) => (
                    <button
                      key={minutes}
                      onClick={() => handleScheduleSend(minutes)}
                      disabled={isScheduling}
                      className="rounded-full border border-qc-border px-2.5 py-1 text-[10px] text-qc-text-primary hover:bg-qc-surface-hover disabled:opacity-40"
                    >
                      Later {minutes}m
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {!input.trim() && !isRecording && !showEmojiPicker && !showAttachMenu && !pendingAttachment && (
          <div className={`${isMobile ? 'absolute left-3 right-3 bottom-[calc(100%+0.55rem)]' : 'absolute bottom-16 left-4 right-4'} z-30 flex gap-2 overflow-x-auto hide-scrollbar pointer-events-auto`}>
            {QUICK_REPLIES.map((reply) => (
              <button
                key={reply}
                onClick={() => handleQuickReply(reply)}
                className="shrink-0 rounded-full border border-qc-border bg-qc-surface px-3 py-1.5 text-xs text-qc-text-secondary shadow-sm hover:bg-qc-surface-hover hover:text-qc-text-primary"
              >
                {reply}
              </button>
            ))}
          </div>
        )}

        <div className="relative">
          <button data-testid="chat-emoji-toggle" onClick={() => { setShowEmojiPicker((value) => !value); setShowAttachMenu(false); }} className={`p-2 rounded-full ${showEmojiPicker ? 'text-qc-accent-primary' : 'text-qc-text-secondary hover:text-qc-text-primary'}`}><Smile size={24} /></button>
        </div>

        <div className="relative">
          <button data-testid="chat-attach-toggle" onClick={() => { setShowAttachMenu((value) => !value); setShowEmojiPicker(false); }} className={`p-2 rounded-full ${showAttachMenu ? 'text-qc-accent-primary' : 'text-qc-text-secondary hover:text-qc-text-primary'}`}><Paperclip size={24} /></button>
        </div>

        <div className={`flex-1 bg-qc-surface rounded-2xl flex items-center px-2 shadow-sm border border-qc-border ${isMobile ? 'min-h-[46px]' : 'min-h-[40px]'}`}>
          {isRecording ? (
            <div className="flex-1 flex items-center gap-3 px-2 text-[#FF3333] animate-pulse font-medium text-[15px]">
              <Mic size={20} className="fill-current" /> Recording {Math.floor(recordingTime / 60)}:{(recordingTime % 60).toString().padStart(2, '0')}
            </div>
          ) : (
            <textarea
              data-testid="chat-message-input"
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              enterKeyHint="send"
              placeholder="Type a message"
              className={`flex-1 bg-transparent text-qc-text-primary px-2 py-2.5 resize-none max-h-[120px] focus:outline-none overflow-y-auto ${isMobile ? 'text-base' : 'text-[15px]'}`}
              rows={1}
              style={{ minHeight: isMobile ? '46px' : '40px' }}
            />
          )}
        </div>

        {input.trim() && !pendingAttachment && (
          <button data-testid="chat-schedule-5m-button" onClick={() => handleScheduleSend(5)} disabled={isScheduling} className="p-2.5 text-qc-text-secondary hover:text-qc-text-primary rounded-full disabled:opacity-40" title="Schedule in 5 min">
            <Clock3 size={20} />
          </button>
        )}

        {pendingAttachment ? (
          <button data-testid="chat-send-attachment-icon-button" onClick={sendPendingAttachment} className="p-2.5 bg-qc-accent-primary text-white rounded-full hover:bg-qc-accent-secondary transition-colors"><Send size={20} className="ml-0.5" /></button>
        ) : input.trim() ? (
          <button data-testid="chat-send-button" onClick={handleSend} className="p-2.5 bg-qc-accent-primary text-white rounded-full hover:bg-qc-accent-secondary transition-colors"><Send size={20} className="ml-0.5" /></button>
        ) : isRecording ? (
          <button data-testid="chat-stop-recording-button" onClick={stopRecording} className="p-2.5 bg-[#FF3333] text-white rounded-full hover:bg-red-600 transition-colors"><Square size={20} className="fill-current" /></button>
        ) : (
          <button data-testid="chat-record-button" onClick={startRecording} className="p-2.5 text-qc-text-secondary hover:text-qc-text-primary rounded-full"><Mic size={24} /></button>
        )}

        {showEmojiPicker && (
          <div className={`${isMobile ? 'absolute inset-x-3 bottom-[calc(100%+0.55rem)]' : 'absolute bottom-14 left-4'} rounded-2xl border border-qc-border bg-qc-surface shadow-xl p-3 grid grid-cols-4 gap-2 animate-fadeIn z-40`}>
            {EMOJIS.map((emoji) => (
              <button key={emoji} onClick={() => setInput((current) => `${current}${emoji}`)} className="h-11 rounded-xl hover:bg-qc-surface-hover text-2xl">
                {emoji}
              </button>
            ))}
          </div>
        )}

        {showAttachMenu && (
          <div className={`${isMobile ? 'absolute inset-x-3 bottom-[calc(100%+0.55rem)]' : 'absolute bottom-14 left-14 w-56'} rounded-2xl border border-qc-border bg-qc-surface shadow-xl p-2 animate-fadeIn z-40`}>
            <button onClick={() => imageInputRef.current?.click()} className="w-full text-left px-3 py-3 rounded-xl hover:bg-qc-surface-hover text-sm flex items-center gap-3"><ImageIcon size={17} /> Attach photo</button>
            <button onClick={() => fileInputRef.current?.click()} className="w-full text-left px-3 py-3 rounded-xl hover:bg-qc-surface-hover text-sm flex items-center gap-3"><FileText size={17} /> Attach file</button>
            <button onClick={handleQuickNote} className="w-full text-left px-3 py-3 rounded-xl hover:bg-qc-surface-hover text-sm flex items-center gap-3"><Zap size={17} /> Drop quick note</button>
          </div>
        )}

        {previewImage && (
          <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setPreviewImage(null)}>
            <img src={previewImage} alt="Preview" className="max-h-full max-w-full rounded-[28px] shadow-[0_24px_80px_rgba(0,0,0,0.45)]" />
          </div>
        )}
      </div>
    </div>
  );
}
