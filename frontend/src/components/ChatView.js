import React, { useState, useRef, useEffect } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { Send, ArrowLeft, User, Check, CheckCheck, MoreVertical, Smile, Trash2, Forward, CornerUpRight, X, Edit2, Paperclip, Mic, Square } from 'lucide-react';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;
const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥', '👏', '🎉'];

function formatMsgTime(time) {
  try {
    const d = new Date(time);
    if (isToday(d)) return format(d, 'HH:mm');
    if (isYesterday(d)) return 'Yesterday ' + format(d, 'HH:mm');
    return format(d, 'dd/MM HH:mm');
  } catch { return ''; }
}

function MessageBubble({ msg, isMine, userId, onReact, onDelete, onForward, onEditSubmit, participants }) {
  const [showActions, setShowActions] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);
  const reactions = msg.reactions || {};
  const reactionList = Object.entries(reactions);
  const senderName = !isMine ? (participants?.find(p => p.user_id === msg.sender_id)?.name || '') : '';

  const handleEditSubmit = () => {
    if (editContent.trim() && editContent !== msg.content) {
      onEditSubmit(msg.id, editContent);
    }
    setIsEditing(false);
  };

  const renderContent = () => {
    if (msg.type === 'image') {
      return <img src={msg.content} alt="Attachment" className="max-w-full h-auto border-2 border-qc-border mt-1" style={{maxHeight: '300px'}}/>;
    }
    if (msg.type === 'audio') {
      return (
        <div className="mt-1">
          <audio controls src={msg.content} className="h-10 w-full max-w-[200px] border-2 border-qc-border" />
        </div>
      );
    }
    return <p className="text-sm font-mono whitespace-pre-wrap break-words text-qc-text-primary leading-relaxed">{msg.content}</p>;
  };

  return (
    <div data-testid={`message-${msg.id}`}
      className={`flex ${isMine ? 'justify-end' : 'justify-start'} animate-fadeIn group relative w-full mb-4`}
      onMouseEnter={() => setShowActions(true)} onMouseLeave={() => { setShowActions(false); setShowEmoji(false); }}
      onTouchStart={() => setShowActions(true)}>

      {showActions && !isEditing && (
        <div className={`absolute -top-10 ${isMine ? 'right-0' : 'left-0'} flex items-center gap-1 z-10 bg-qc-surface border-2 border-qc-border p-1 shadow-[2px_2px_0px_#0A0A0A]`}>
          <button onClick={() => setShowEmoji(!showEmoji)} className="w-8 h-8 flex items-center justify-center hover:bg-qc-accent-tertiary transition-colors border-2 border-transparent hover:border-qc-border"><Smile size={16}/></button>
          {isMine && msg.type === 'text' && <button onClick={() => setIsEditing(true)} className="w-8 h-8 flex items-center justify-center hover:bg-qc-accent-secondary transition-colors border-2 border-transparent hover:border-qc-border"><Edit2 size={16}/></button>}
          {isMine && <button onClick={() => onDelete(msg.id)} className="w-8 h-8 flex items-center justify-center hover:bg-[#FF3333] hover:text-white transition-colors border-2 border-transparent hover:border-qc-border"><Trash2 size={16}/></button>}
          {msg.type === 'text' && <button onClick={() => onForward(msg.id)} className="w-8 h-8 flex items-center justify-center hover:bg-qc-accent-primary transition-colors border-2 border-transparent hover:border-qc-border"><Forward size={16}/></button>}
        </div>
      )}

      {showEmoji && !isEditing && (
        <div className={`absolute -top-24 ${isMine ? 'right-0' : 'left-0'} bg-qc-surface border-2 border-qc-border p-2 flex gap-1 z-20 shadow-brutal`}>
          {EMOJIS.map(e => <button key={e} onClick={() => { onReact(msg.id, e); setShowEmoji(false); setShowActions(false); }} className="w-10 h-10 flex items-center justify-center border-2 border-qc-border bg-qc-bg hover:bg-qc-accent-primary hover:shadow-[2px_2px_0px_#0A0A0A] text-xl transition-all hover:-translate-y-1">{e}</button>)}
        </div>
      )}

      <div className={`max-w-[85%] sm:max-w-[75%] px-4 py-3 border-2 border-qc-border shadow-brutal flex flex-col ${isMine ? 'bg-qc-accent-primary ml-12' : 'bg-qc-surface mr-12'}`}>
        {!isMine && senderName && <p className="text-xs font-bold font-mono uppercase mb-1">{senderName}</p>}
        {msg.forwarded && <p className="text-[10px] font-bold font-mono uppercase flex items-center gap-1 mb-2 bg-qc-bg border-2 border-qc-border w-max px-1"><CornerUpRight size={12}/>FORWARDED</p>}
        
        {isEditing ? (
          <div className="flex flex-col gap-2">
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="w-full bg-qc-bg border-2 border-qc-border p-2 font-mono text-sm resize-none focus:ring-2 focus:ring-qc-accent-primary" rows={3}/>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setIsEditing(false)} className="px-3 py-1 font-mono text-xs border-2 border-qc-border bg-qc-surface hover:bg-gray-200 uppercase font-bold">Cancel</button>
              <button onClick={handleEditSubmit} className="px-3 py-1 font-mono text-xs border-2 border-qc-border bg-[#00FF66] hover:bg-[#00CC55] uppercase font-bold">Save</button>
            </div>
          </div>
        ) : renderContent()}

        {reactionList.length > 0 && !isEditing && (
          <div className="flex flex-wrap gap-1 mt-3">
            {reactionList.map(([uid, emoji]) => <span key={uid} className="text-xs bg-qc-bg border-2 border-qc-border px-2 py-0.5 shadow-[1px_1px_0px_#0A0A0A]">{emoji}</span>)}
          </div>
        )}
        
        <div className={`flex items-center gap-2 mt-2 ${isMine ? 'justify-end' : 'justify-start'}`}>
          {msg.is_edited && <span className="font-mono text-[9px] font-bold uppercase tracking-widest text-qc-text-secondary">EDITED</span>}
          <span className="font-mono text-[10px] font-bold uppercase tracking-widest">{formatMsgTime(msg.created_at)}</span>
          {isMine && (msg.status === 'read' ? <CheckCheck size={14} className="text-[#00CC55]"/> : <Check size={14} className="text-qc-text-secondary"/>)}
        </div>
      </div>
    </div>
  );
}

function getConvInfo(conv, userId) {
  if (conv.type === 'group') return { name: conv.name, avatar: conv.avatar, isGroup: true };
  const other = conv.other_user || conv.participants?.find(p => p.user_id !== userId);
  return { name: other?.name || 'Unknown', avatar: other?.avatar || '', user_id: other?.user_id, isGroup: false };
}

export default function ChatView({ conversation, messages, onSend, onEdit, userId, onlineUsers, typingUsers, emitTyping, onBack, conversations, token, onReloadMessages, isMobile }) {
  const [input, setInput] = useState('');
  const [forwardMsgId, setForwardMsgId] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimeout = useRef(null);
  
  // Recording states
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);

  const info = getConvInfo(conversation, userId);
  const isOnline = info.user_id ? onlineUsers.has(info.user_id) : false;
  const isTyping = typingUsers[conversation.id] && typingUsers[conversation.id] !== userId;

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  useEffect(() => {
    let interval;
    if (isRecording) {
      interval = setInterval(() => setRecordingTime(t => t + 1), 1000);
    } else {
      setRecordingTime(0);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const handleSend = (e) => {
    e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim());
    setInput('');
    emitTyping(conversation.id, false);
  };
  const handleInputChange = (e) => {
    setInput(e.target.value);
    emitTyping(conversation.id, true);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => emitTyping(conversation.id, false), 2000);
  };
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } };

  const handleReact = async (msgId, emoji) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.post(`${API}/api/messages/${msgId}/react`, { emoji }, { headers });
      if (onReloadMessages) onReloadMessages(conversation.id);
    } catch {}
  };
  const handleDelete = async (msgId) => {
    try {
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      await axios.delete(`${API}/api/messages/${msgId}`, { headers });
      if (onReloadMessages) onReloadMessages(conversation.id);
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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      onSend(ev.target.result, 'image');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = (ev) => {
          onSend(ev.target.result, 'audio');
        };
        reader.readAsDataURL(audioBlob);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert("Microphone access denied or unavailable.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      setIsRecording(false);
    }
  };

  const memberCount = conversation.participants?.length || 0;
  const onlineCount = conversation.participants?.filter(p => onlineUsers.has(p.user_id)).length || 0;

  return (
    <div data-testid="chat-view" className="flex flex-col h-full w-full relative">
      {forwardMsgId && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setForwardMsgId(null)}>
          <div className="bg-qc-surface border-4 border-qc-border shadow-brutal-lg w-full max-w-md flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b-2 border-qc-border bg-qc-accent-tertiary flex items-center justify-between">
              <span className="font-heading font-black text-xl uppercase">FORWARD_TO</span>
              <button onClick={() => setForwardMsgId(null)} className="w-8 h-8 flex items-center justify-center border-2 border-qc-border bg-qc-surface hover:bg-[#FF3333] hover:text-white transition-colors shadow-[2px_2px_0px_#0A0A0A]"><X size={18}/></button>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {(conversations || []).filter(c => c.id !== conversation.id).map(c => {
                const ci = getConvInfo(c, userId);
                return (
                  <button key={c.id} data-testid={`forward-to-${c.id}`} onClick={() => handleForward(c.id)}
                    className="w-full flex items-center gap-3 p-3 border-2 border-qc-border mb-2 hover:bg-qc-accent-primary hover:shadow-[2px_2px_0px_#0A0A0A] hover:-translate-y-0.5 transition-all text-left bg-qc-surface">
                    <div className="w-10 h-10 border-2 border-qc-border bg-qc-bg flex items-center justify-center overflow-hidden flex-shrink-0">
                      {ci.avatar ? <img src={ci.avatar} alt="" className="w-full h-full object-cover grayscale"/> : <User size={18}/>}
                    </div>
                    <span className="text-sm font-bold font-mono uppercase truncate">{ci.name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div data-testid="chat-header" className="h-16 px-4 border-b-2 border-qc-border flex items-center gap-3 bg-qc-surface flex-shrink-0 shadow-sm relative z-20">
        <button data-testid="chat-back-btn" onClick={onBack}
          className="md:hidden w-10 h-10 flex items-center justify-center border-2 border-qc-border bg-qc-bg hover:bg-qc-accent-secondary shadow-[2px_2px_0px_#0A0A0A] flex-shrink-0">
          <ArrowLeft size={20}/>
        </button>
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 border-2 border-qc-border bg-qc-accent-tertiary flex items-center justify-center overflow-hidden">
            {info.avatar ? <img src={info.avatar} alt={info.name} className="w-full h-full object-cover grayscale"/> : <User size={20}/>}
          </div>
          {isOnline && <div className="absolute -bottom-1 -right-1 w-4 h-4 bg-[#00FF66] border-2 border-qc-border shadow-[1px_1px_0px_#0A0A0A]"/>}
        </div>
        <div className="flex-1 min-w-0">
          <h3 data-testid="chat-recipient-name" className="text-base font-black font-heading uppercase truncate tracking-wide">{info.name}</h3>
          {isTyping ? <p className="text-[10px] font-bold font-mono bg-qc-accent-primary border-2 border-qc-border px-1 w-max shadow-[1px_1px_0px_#0A0A0A] uppercase animate-pulse">TYPING...</p>
            : info.isGroup ? <p className="text-[10px] font-bold font-mono uppercase tracking-widest text-qc-text-secondary">{memberCount} UNITS, {onlineCount} ACTIVE</p>
            : <p className="text-[10px] font-bold font-mono uppercase tracking-widest text-qc-text-secondary">{isOnline ? 'CONNECTION_ACTIVE' : 'OFFLINE'}</p>}
        </div>
        <button data-testid="chat-more-btn" className="w-10 h-10 flex items-center justify-center border-2 border-qc-border bg-qc-bg hover:bg-qc-accent-secondary shadow-[2px_2px_0px_#0A0A0A] flex-shrink-0">
          <MoreVertical size={20}/>
        </button>
      </div>

      {/* Messages */}
      <div data-testid="messages-container" className="flex-1 overflow-y-auto px-4 py-6 space-y-2 relative z-10">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="border-4 border-qc-border bg-qc-surface p-6 shadow-brutal-lg max-w-sm">
              <h4 className="font-heading font-black text-2xl uppercase mb-2">COMM_LINK_ESTABLISHED</h4>
              <p className="font-mono text-sm uppercase">INITIATE DATA TRANSFER.</p>
            </div>
          </div>
        ) : messages.map(msg => (
          <MessageBubble key={msg.id} msg={msg} isMine={msg.sender_id === userId} userId={userId}
            onReact={handleReact} onDelete={handleDelete} onForward={setForwardMsgId} onEditSubmit={onEdit}
            participants={conversation.participants} />
        ))}
        <div ref={messagesEndRef}/>
      </div>

      {/* Input */}
      <form data-testid="message-form" onSubmit={handleSend}
        className="border-t-2 border-qc-border bg-qc-surface p-4 flex items-center gap-2 flex-shrink-0 relative z-20">
        <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
        <button type="button" onClick={() => fileInputRef.current.click()} className="w-12 h-12 flex items-center justify-center border-2 border-qc-border bg-qc-bg hover:bg-qc-accent-secondary shadow-[2px_2px_0px_#0A0A0A] flex-shrink-0">
          <Paperclip size={20}/>
        </button>

        {isRecording ? (
          <div className="flex-1 flex items-center justify-between bg-[#FF3333] border-2 border-qc-border px-4 h-12">
            <span className="font-mono font-bold text-white uppercase animate-pulse">RECORDING: {recordingTime}s</span>
            <button type="button" onClick={stopRecording} className="text-white hover:text-black">
              <Square size={20} fill="currentColor"/>
            </button>
          </div>
        ) : (
          <textarea data-testid="message-input" value={input} onChange={handleInputChange} onKeyDown={handleKeyDown} rows={1}
            placeholder="ENTER_PAYLOAD..." className="flex-1 bg-qc-bg border-2 border-qc-border text-qc-text-primary text-sm font-mono font-bold px-4 py-3 h-12 focus:bg-qc-surface focus:ring-2 focus:ring-qc-accent-primary transition-all resize-none shadow-[inset_2px_2px_0px_rgba(0,0,0,0.05)]"/>
        )}

        {!isRecording && !input.trim() ? (
          <button type="button" onClick={startRecording}
            className="w-12 h-12 flex items-center justify-center border-2 border-qc-border bg-qc-accent-primary text-qc-text-primary shadow-brutal hover:translate-y-[-2px] hover:translate-x-[-2px] hover:shadow-brutal-lg active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all flex-shrink-0">
            <Mic size={20}/>
          </button>
        ) : (
          <button data-testid="send-message-btn" type="submit" disabled={!input.trim() && !isRecording}
            className="w-12 h-12 flex items-center justify-center border-2 border-qc-border bg-qc-accent-secondary text-qc-text-primary shadow-brutal hover:translate-y-[-2px] hover:translate-x-[-2px] hover:shadow-brutal-lg active:translate-y-[2px] active:translate-x-[2px] active:shadow-none transition-all disabled:opacity-50 disabled:pointer-events-none flex-shrink-0">
            <Send size={20} className="ml-1"/>
          </button>
        )}
      </form>
    </div>
  );
}
