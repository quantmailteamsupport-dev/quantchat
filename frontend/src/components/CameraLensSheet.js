import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, CameraOff, RotateCcw, Sparkles, Upload, X, Download } from 'lucide-react';

const LENSES = [
  { id: 'none', label: 'Clean', filter: 'none' },
  { id: 'neon', label: 'Neon', filter: 'contrast(1.15) saturate(1.35) hue-rotate(12deg)' },
  { id: 'mono', label: 'Mono', filter: 'grayscale(1) contrast(1.1)' },
  { id: 'warm', label: 'Warm', filter: 'sepia(0.3) saturate(1.15) brightness(1.02)' },
  { id: 'dream', label: 'Dream', filter: 'saturate(1.22) brightness(1.08) blur(0.2px)' },
];

export default function CameraLensSheet({ open, onClose, onPublish }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const [lens, setLens] = useState('neon');
  const [streamError, setStreamError] = useState('');
  const [capturedImage, setCapturedImage] = useState('');
  const [publishing, setPublishing] = useState('');

  const activeFilter = useMemo(() => LENSES.find((item) => item.id === lens)?.filter || 'none', [lens]);

  useEffect(() => {
    if (!open) return undefined;
    let stream;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setStreamError('');
      } catch {
        setStreamError('Camera permission blocked. Upload a photo or allow camera access.');
      }
    };

    startCamera();
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [open]);

  if (!open) return null;

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 720;
    canvas.height = video.videoHeight || 1280;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.filter = activeFilter;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    setCapturedImage(canvas.toDataURL('image/png'));
  };

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (loadEvent) => setCapturedImage(loadEvent.target?.result || '');
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handlePublish = async (mode) => {
    if (!capturedImage || !onPublish) return;
    setPublishing(mode);
    try {
      await onPublish(mode, capturedImage);
      setCapturedImage('');
      onClose?.();
    } catch {}
    setPublishing('');
  };

  return (
    <div className="fixed inset-0 z-[80] bg-black/78 backdrop-blur-md flex items-end md:items-center justify-center" onClick={onClose}>
      <div data-testid="camera-lens-sheet" className="w-full md:max-w-[430px] md:h-[86vh] h-[100dvh] rounded-t-[34px] md:rounded-[34px] overflow-hidden border border-white/10 bg-[#05070d] shadow-[0_24px_80px_rgba(0,0,0,0.48)] flex flex-col" onClick={(event) => event.stopPropagation()}>
        <div className="px-4 py-4 border-b border-white/8 flex items-center justify-between bg-[linear-gradient(180deg,rgba(255,255,255,0.04),transparent)]">
          <div>
            <p className="text-[10px] uppercase tracking-[0.24em] text-white/46">Snap camera</p>
            <h3 className="text-xl font-semibold text-white mt-1">Lenses</h3>
          </div>
          <button type="button" data-testid="camera-close-button" onClick={onClose} className="h-10 w-10 rounded-full border border-white/10 bg-white/5 text-white/80 flex items-center justify-center">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 p-4 space-y-4 overflow-y-auto">
          <div className="rounded-[30px] overflow-hidden border border-white/10 bg-[#090b12] aspect-[9/16] relative">
            {capturedImage ? (
              <img src={capturedImage} alt="Captured" className="absolute inset-0 h-full w-full object-cover" style={{ filter: activeFilter }} />
            ) : streamError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center text-white/64">
                <CameraOff size={28} />
                <p>{streamError}</p>
              </div>
            ) : (
              <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 h-full w-full object-cover" style={{ filter: activeFilter }} />
            )}
            <canvas ref={canvasRef} className="hidden" />
            <div className="absolute inset-x-0 bottom-0 p-4 bg-[linear-gradient(180deg,transparent,rgba(0,0,0,0.72))]">
              <div className="rounded-full border border-white/10 bg-black/28 px-3 py-2 inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] text-white/66">
                <Sparkles size={12} />
                {LENSES.find((item) => item.id === lens)?.label} lens
              </div>
            </div>
          </div>

          <div className="flex gap-2 overflow-x-auto hide-scrollbar">
            {LENSES.map((item) => (
              <button key={item.id} type="button" data-testid={`camera-lens-${item.id}`} onClick={() => setLens(item.id)} className={`shrink-0 rounded-full border px-4 py-2 text-sm ${lens === item.id ? 'border-white bg-white text-black' : 'border-white/10 bg-white/5 text-white/78'}`}>
                {item.label}
              </button>
            ))}
          </div>

          {capturedImage && (
            <div className="rounded-[28px] border border-white/10 bg-white/[0.04] p-4">
              <div className="text-[10px] uppercase tracking-[0.22em] text-white/46">Publish capture</div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {[
                  ['snap', 'Snap streak'],
                  ['story', 'Story'],
                  ['feed', 'Feed'],
                  ['reel', 'Reel'],
                ].map(([id, label]) => (
                  <button key={id} type="button" data-testid={`camera-publish-${id}`} onClick={() => handlePublish(id)} disabled={publishing === id} className="rounded-[18px] border border-white/10 bg-black/22 px-4 py-3 text-sm text-white disabled:opacity-40">
                    {publishing === id ? 'Publishing...' : label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-4 border-t border-white/8 bg-[#06080f] flex items-center justify-between gap-3 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
          <button type="button" data-testid="camera-upload-button" onClick={() => fileInputRef.current?.click()} className="h-12 px-4 rounded-full border border-white/10 bg-white/5 text-white inline-flex items-center gap-2">
            <Upload size={16} /> Upload
          </button>
          <button type="button" data-testid="camera-capture-button" onClick={handleCapture} className="h-16 w-16 rounded-full border-[6px] border-white/16 bg-white flex items-center justify-center text-black shadow-[0_0_0_8px_rgba(255,255,255,0.05)]">
            <Camera size={20} />
          </button>
          <button type="button" data-testid="camera-reset-button" onClick={() => setCapturedImage('')} className="h-12 px-4 rounded-full border border-white/10 bg-white/5 text-white inline-flex items-center gap-2">
            {capturedImage ? <Download size={16} /> : <RotateCcw size={16} />} {capturedImage ? 'Retake' : 'Reset'}
          </button>
        </div>
      </div>
    </div>
  );
}