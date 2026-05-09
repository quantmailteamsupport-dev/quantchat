import React from 'react';
import { Terminal } from 'lucide-react';

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full w-full bg-qc-bg p-8 text-center relative overflow-hidden">
      <div className="w-24 h-24 bg-qc-surface border-4 border-qc-border shadow-brutal-lg flex items-center justify-center mb-8 rotate-3 relative z-10">
        <Terminal size={48} className="text-qc-text-primary" />
      </div>
      <h2 className="font-heading font-black text-5xl text-qc-text-primary uppercase tracking-tighter mb-4 relative z-10 bg-qc-accent-primary border-2 border-qc-border px-4 py-2 shadow-brutal -rotate-1">
        NO TARGET SELECTED
      </h2>
      <p className="font-mono text-sm text-qc-text-primary bg-qc-surface border-2 border-qc-border p-3 shadow-[2px_2px_0px_#0A0A0A] max-w-sm uppercase font-bold relative z-10">
        INITIALIZE A CONNECTION FROM THE SIDEBAR TO BEGIN TRANSMISSION.
      </p>
    </div>
  );
}
