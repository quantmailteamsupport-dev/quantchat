import React from 'react';
import { Terminal } from 'lucide-react';

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-[#050608] p-8 text-center relative overflow-hidden">
      <div className="w-24 h-24 bg-[rgba(255,255,255,0.03)] border-4 border-white/8 shadow-brutal-lg flex items-center justify-center mb-8 rotate-3 relative z-10">
        <Terminal size={48} className="text-white/88" />
      </div>
      <h2 className="font-heading font-black text-5xl text-white/88 uppercase tracking-tighter mb-4 relative z-10 bg-[#4f8cff] border-2 border-white/8 px-4 py-2 shadow-brutal -rotate-1">
        NO TARGET SELECTED
      </h2>
      <p className="font-mono text-sm text-white/88 bg-[rgba(255,255,255,0.03)] border-2 border-white/8 p-3 shadow-[2px_2px_0px_#0A0A0A] max-w-sm uppercase font-bold relative z-10">
        INITIALIZE A CONNECTION FROM THE SIDEBAR TO BEGIN TRANSMISSION.
      </p>
    </div>
  );
}
