import React, { useState, useRef, useEffect } from 'react';
import { format, isToday, isYesterday } from 'date-fns';
import { Send, ArrowLeft, User, Check, CheckCheck, MoreVertical, Smile, Trash2, Forward, X, Edit2, Paperclip, Mic, Square, CornerDownRight, Search, Phone, Video } from 'lucide-react';
import axios from 'axios';

const API = process.env.REACT_APP_BACKEND_URL;
const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

function formatMsgTime(time) {
  try {
    const d = new Date(time);
    return format(d, 'HH:mm');
  } catch { return ''; }
}

function MessageBubble({ msg, isMine, userId, onReact, onDelete, onForward, onEditSubmit, onReply, participants, repliedMsg }) {
  const [showMenu, setShowMenu] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(msg.content);
  const menuRef = useRef(null);
  
  const reactions = msg.reactions || {};
  const reactionList = Object.entries(reactions);
  const senderName = !isMine ? (participants?.find(p => p.user_id === msg.sender_id)?.name || '') : '';

  useEffect(() => {
    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setShowMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleEditSubmit = () => {
    if (editContent.trim() && editContent !== msg.content) {
      onEditSubmit(msg.id, editContent);
    }
    setIsEditing(false);
  };

  const renderContent = () => {
    if (msg.type === 'image') {
      return <img src={msg.content} alt="Attachment" className="max-w-xs md:max-w-sm h-auto rounded-md mt-1 cursor-pointer" />;
    }
    if (msg.type === 'audio') {
      return (
        <div className="mt-1 flex items-center gap-2">
          <audio controls src={msg.content} className="h-10 w-[200px]" />
        </div>
      );
    }
    return <p className="text-[14.2px] whitespace-pre-wrap break-words leading-snug">{msg.content}</p>;
  };

  return (
    <div className={`flex ${isMine ? 'justify-end' : 'justify-start'} w-full mb-1 group relative`} onMouseLeave={() => setShowMenu(false)}>
      
      <div className={`max-w-[85%] sm:max-w-[65%] px-2 py-1.5 rounded-lg shadow-sm relative flex flex-col ${isMine ? 'bg-qc-bubble-mine rounded-tr-none text-[#111B21]' : 'bg-qc-bubble-other rounded-tl-none text-[#111B21]'}`}>
        
        {/* Context Menu Trigger (Chevron) */}
        <div className={`absolute top-0 right-0 p-1 cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity z-10 ${isMine ? 'bg-gradient-to-l from-qc-bubble-mine to-transparent' : 'bg-gradient-to-l from-qc-bubble-other to-transparent'}`} onClick={() => setShowMenu(!showMenu)}>
          <svg viewBox="0 0 18 18" width="18" height="18" className="text-gray-500"><path fill="currentColor" d="M3.3 4.6 9 10.3l5.7-5.7 1.6 1.6L9 13.4 1.7 6.2l1.6-1.6z"></path></svg>
        </div>

        {/* Context Menu */}
        {showMenu && !isEditing && (
          <div ref={menuRef} className="absolute top-6 right-2 w-40 bg-qc-surface shadow-lg rounded-md py-2 z-50 text-qc-text-primary text-sm border border-qc-border">
            <div className="flex justify-around px-2 py-2 border-b border-qc-border">
               {EMOJIS.map(e => <button key={e} onClick={() => { onReact(msg.id, e); setShowMenu(false); }} className="hover:scale-125 transition-transform">{e}</button>)}
            </div>
            <button onClick={() => { onReply(msg); setShowMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-qc-surface-hover">Reply</button>
            <button onClick={() => { onForward(msg.id); setShowMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-qc-surface-hover">Forward message</button>
            {isMine && msg.type === 'text' && <button onClick={() => { setIsEditing(true); setShowMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-qc-surface-hover">Edit</button>}
            {isMine && <button onClick={() => { onDelete(msg.id); setShowMenu(false); }} className="w-full text-left px-4 py-2 hover:bg-qc-surface-hover text-red-500">Delete message</button>}
          </div>
        )}

        {/* Sender Name for Groups */}
        {!isMine && senderName && <span className="text-[12.5px] font-medium text-blue-500 mb-0.5">{senderName}</span>}
        
        {/* Forwarded Tag */}
        {msg.forwarded && <div className="flex items-center gap-1 text-[12px] text-gray-500 mb-1 italic"><Forward size={12}/> Forwarded</div>}

        {/* Replied Message Snippet */}
        {repliedMsg && (
          <div className="bg-black/5 border-l-4 border-qc-accent-primary rounded p-1.5 mb-1 cursor-pointer">
            <p className="text-[12px] font-medium text-qc-accent-secondary">{repliedMsg.sender_id === userId ? 'You' : (participants?.find(p => p.user_id === repliedMsg.sender_id)?.name || 'Unknown')}</p>
            <p className="text-[13px] text-gray-600 truncate">{repliedMsg.type === 'text' ? repliedMsg.content : (repliedMsg.type === 'image' ? '📷 Photo' : '🎵 Audio')}</p>
          </div>
        )}
        
        {isEditing ? (
          <div className="flex flex-col gap-1 min-w-[200px]">
            <textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="w-full bg-white/50 border border-gray-300 rounded p-1 text-[14.2px] resize-none focus:outline-none focus:ring-1 focus:ring-qc-accent-primary" rows={2}/>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setIsEditing(false)} className="text-[12px] text-gray-600 hover:underline">Cancel</button>
              <button onClick={handleEditSubmit} className="text-[12px] text-qc-accent-secondary font-medium hover:underline">Save</button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col">
            {renderContent()}
            <div className="flex items-center justify-end gap-1 mt-0.5 ml-4 self-end -mb-1">
              {msg.is_edited && <span className="text-[11px] text-gray-500 italic mr-1">Edited</span>}
              <span className="text-[11px] text-gray-500">{formatMsgTime(msg.created_at)}</span>
              {isMine && (msg.status === 'read' ? <CheckCheck size={14} className="text-[#53bdeb]"/> : <Check size={14} className="text-gray-500"/>)}
            </div>
          </div>
        )}

        {reactionList.length > 0 && !isEditing && (
          <div className="absolute -bottom-3 right-0 flex bg-white rounded-full px-1 shadow border border-gray-100 z-10">
            {reactionList.map(([uid, emoji]) => <span key={uid} className="text-[12px]">{emoji}</span>)}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ChatArea({ conversation, messages, onSend, onEdit, userId, onlineUsers, typingUsers, emitTyping, onBack, conversations, token, onReloadMessages, isMobile }) {
  const [input, setInput] = useState('');
  const [forwardMsgId, setForwardMsgId] = useState(null);
  const [replyToMsg, setReplyToMsg] = useState(null);
  const messagesEndRef = useRef(null);
  const typingTimeout = useRef(null);
  
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);

  const isGroup = conversation.type === 'group';
  const otherUser = isGroup ? null : (conversation.other_user || conversation.participants?.find(p => p.user_id !== userId));
  const isOnline = otherUser ? onlineUsers.has(otherUser.user_id) : false;
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
    if (e) e.preventDefault();
    if (!input.trim()) return;
    onSend(input.trim(), 'text', replyToMsg?.id);
    setInput('');
    setReplyToMsg(null);
    emitTyping(conversation.id, false);
  };

  const handleInputChange = (e) => {
    setInput(e.target.value);
    emitTyping(conversation.id, true);
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => emitTyping(conversation.id, false), 2000);
  };
  const handleKeyDown = (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } };

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
      onSend(ev.target.result, 'image', replyToMsg?.id);
      setReplyToMsg(null);
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
      mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data); };
      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const reader = new FileReader();
        reader.onload = (ev) => {
          onSend(ev.target.result, 'audio', replyToMsg?.id);
          setReplyToMsg(null);
        };
        reader.readAsDataURL(audioBlob);
      };
      mediaRecorder.start();
      setIsRecording(true);
    } catch (err) {
      alert("Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      setIsRecording(false);
    }
  };

  // Group messages by date
  let lastDate = null;

  return (
    <div className="flex flex-col h-full w-full relative bg-qc-bg overflow-hidden">
      {/* Wallpaper */}
      <div className="absolute inset-0 chat-bg-pattern z-0 pointer-events-none" />

      {forwardMsgId && (
        <div className="absolute inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setForwardMsgId(null)}>
          <div className="bg-qc-surface w-full max-w-sm rounded-lg shadow-xl flex flex-col max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-qc-border flex items-center justify-between bg-qc-surface-hover">
              <span className="font-medium text-qc-text-primary text-lg">Forward message to</span>
              <button onClick={() => setForwardMsgId(null)} className="text-qc-text-secondary hover:text-qc-text-primary"><X size={24}/></button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {(conversations || []).filter(c => c.id !== conversation.id).map(c => {
                const isG = c.type === 'group';
                const name = isG ? c.name : (c.other_user?.name || c.participants?.find(p => p.user_id !== userId)?.name || 'Unknown');
                const avatar = isG ? c.avatar : (c.other_user?.avatar || c.participants?.find(p => p.user_id !== userId)?.avatar || '');
                return (
                  <button key={c.id} onClick={() => handleForward(c.id)}
                    className="w-full flex items-center gap-3 p-3 hover:bg-qc-surface-hover transition-colors text-left border-b border-qc-border">
                    <div className="w-10 h-10 rounded-full bg-qc-surface-hover flex items-center justify-center overflow-hidden flex-shrink-0">
                      {avatar ? <img src={avatar} alt="" className="w-full h-full object-cover"/> : <User size={20} className="text-qc-text-secondary"/>}
                    </div>
                    <span className="text-[15px] text-qc-text-primary font-medium truncate">{name}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="h-16 px-4 bg-qc-surface-hover flex items-center gap-3 flex-shrink-0 shadow-sm relative z-20 border-b border-qc-border">
        {isMobile && (
          <button onClick={onBack} className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-black/5 text-qc-text-secondary -ml-2">
            <ArrowLeft size={24}/>
          </button>
        )}
        <div className="w-10 h-10 rounded-full overflow-hidden bg-qc-bg flex items-center justify-center flex-shrink-0 cursor-pointer">
          {isGroup ? (conversation.avatar ? <img src={conversation.avatar} alt="" className="w-full h-full object-cover"/> : <User size={24} className="text-qc-text-secondary"/>) : (otherUser?.avatar ? <img src={otherUser.avatar} alt="" className="w-full h-full object-cover"/> : <User size={24} className="text-qc-text-secondary"/>)}
        </div>
        <div className="flex-1 min-w-0 cursor-pointer">
          <h3 className="text-base font-medium text-qc-text-primary truncate">{isGroup ? conversation.name : (otherUser?.name || 'Unknown')}</h3>
          {isTyping ? <p className="text-[13px] text-qc-accent-primary font-medium">typing...</p> : 
            isGroup ? <p className="text-[13px] text-qc-text-secondary truncate">{conversation.participants.map(p=>p.name).join(', ')}</p> :
            <p className="text-[13px] text-qc-text-secondary">{isOnline ? 'online' : 'offline'}</p>
          }
        </div>
        <div className="flex items-center gap-2 text-qc-text-secondary">
          <button className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5"><Video size={20}/></button>
          <button className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5"><Search size={20}/></button>
          <button className="w-10 h-10 rounded-full flex items-center justify-center hover:bg-black/5"><MoreVertical size={20}/></button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-[5%] md:px-[10%] space-y-1 relative z-10">
        {messages.length === 0 ? (
          <div className="flex justify-center mt-10">
            <div className="bg-[#FFEECD] text-[#54656F] text-[12.5px] px-4 py-2 rounded-lg shadow-sm text-center max-w-sm">
              <span className="block mb-1">🔒 Messages and calls are end-to-end encrypted. No one outside of this chat, not even QuantChat, can read or listen to them.</span>
            </div>
          </div>
        ) : messages.map(msg => {
          const msgDate = new Date(msg.created_at).toDateString();
          const showDate = msgDate !== lastDate;
          lastDate = msgDate;
          
          let repliedMsg = null;
          if (msg.reply_to) {
             repliedMsg = messages.find(m => m.id === msg.reply_to);
          }

          return (
            <React.Fragment key={msg.id}>
              {showDate && (
                <div className="flex justify-center my-4">
                  <span className="bg-qc-surface border border-qc-border shadow-sm text-qc-text-secondary text-[12px] uppercase font-medium px-3 py-1 rounded-lg">
                    {isToday(new Date(msg.created_at)) ? 'Today' : isYesterday(new Date(msg.created_at)) ? 'Yesterday' : format(new Date(msg.created_at), 'MMMM d, yyyy')}
                  </span>
                </div>
              )}
              <MessageBubble msg={msg} isMine={msg.sender_id === userId} userId={userId}
                onReact={handleReact} onDelete={handleDelete} onForward={setForwardMsgId} onEditSubmit={onEdit} onReply={setReplyToMsg}
                participants={conversation.participants} repliedMsg={repliedMsg} />
            </React.Fragment>
          );
        })}
        <div ref={messagesEndRef}/>
      </div>

      {/* Reply Preview Box */}
      {replyToMsg && (
        <div className="bg-qc-surface-hover px-4 py-2 flex items-center justify-between border-l-4 border-qc-accent-primary relative z-20 shadow-sm border-t border-qc-border">
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-medium text-qc-accent-secondary">{replyToMsg.sender_id === userId ? 'You' : (conversation.participants?.find(p => p.user_id === replyToMsg.sender_id)?.name || 'Unknown')}</p>
            <p className="text-[13px] text-qc-text-secondary truncate">{replyToMsg.type === 'text' ? replyToMsg.content : (replyToMsg.type === 'image' ? '📷 Photo' : '🎵 Audio')}</p>
          </div>
          <button onClick={() => setReplyToMsg(null)} className="text-qc-text-secondary hover:text-qc-text-primary p-2"><X size={20}/></button>
        </div>
      )}

      {/* Input */}
      <div className="bg-qc-surface-hover px-4 py-2.5 flex items-end gap-2 flex-shrink-0 relative z-20 border-t border-qc-border">
        <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
        
        <button className="p-2 text-qc-text-secondary hover:text-qc-text-primary rounded-full"><Smile size={24}/></button>
        <button onClick={() => fileInputRef.current.click()} className="p-2 text-qc-text-secondary hover:text-qc-text-primary rounded-full"><Paperclip size={24}/></button>

        <div className="flex-1 bg-qc-surface rounded-lg flex items-center min-h-[40px] px-2 shadow-sm border border-qc-border">
          {isRecording ? (
            <div className="flex-1 flex items-center gap-3 px-2 text-[#FF3333] animate-pulse font-medium text-[15px]">
              <Mic size={20} className="fill-current"/> Recording {Math.floor(recordingTime/60)}:{(recordingTime%60).toString().padStart(2,'0')}
            </div>
          ) : (
            <textarea value={input} onChange={handleInputChange} onKeyDown={handleKeyDown} 
              placeholder="Type a message" className="flex-1 bg-transparent text-qc-text-primary text-[15px] px-2 py-2.5 resize-none max-h-[100px] focus:outline-none overflow-y-auto" rows={1} style={{minHeight: '40px'}}/>
          )}
        </div>

        {input.trim() ? (
          <button onClick={handleSend} className="p-2.5 bg-qc-accent-primary text-white rounded-full hover:bg-qc-accent-secondary transition-colors"><Send size={20} className="ml-0.5"/></button>
        ) : isRecording ? (
          <button onClick={stopRecording} className="p-2.5 bg-[#FF3333] text-white rounded-full hover:bg-red-600 transition-colors"><Square size={20} className="fill-current"/></button>
        ) : (
          <button onClick={startRecording} className="p-2.5 text-qc-text-secondary hover:text-qc-text-primary rounded-full"><Mic size={24}/></button>
        )}
      </div>
    </div>
  );
}
