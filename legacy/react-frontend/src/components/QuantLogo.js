import React from 'react';

export default function QuantLogo({ compact = false }) {
  return (
    <div data-testid="quantchat-3d-logo" className={`relative ${compact ? 'h-11 w-11' : 'h-14 w-14'} rounded-[18px] overflow-hidden border border-white/10 bg-[linear-gradient(145deg,#04050a,#11141d)] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_24px_50px_rgba(0,0,0,0.35)]`}>
      <div className="absolute inset-[3px] rounded-[15px] bg-[radial-gradient(circle_at_28%_28%,rgba(0,229,255,0.5),transparent_30%),linear-gradient(160deg,rgba(255,255,255,0.18),rgba(0,0,0,0.12)_32%,rgba(10,13,20,0.96))]" />
      <div className="absolute inset-[8px] rounded-[13px] border border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.02))]" />
      <div className="absolute inset-0 flex items-center justify-center">
        <div className={`relative ${compact ? 'h-6 w-6' : 'h-8 w-8'}`}>
          <div className="absolute inset-0 rounded-full border-[4px] border-[#9cefff] opacity-90 shadow-[0_0_25px_rgba(0,229,255,0.35)]" />
          <div className="absolute right-[-1px] top-[10px] h-[4px] w-[12px] rounded-full bg-[#9cefff] shadow-[0_0_18px_rgba(0,229,255,0.45)]" />
          <div className="absolute right-[1px] bottom-[-1px] h-[12px] w-[4px] rounded-full bg-[#9cefff] shadow-[0_0_18px_rgba(0,229,255,0.45)]" />
        </div>
      </div>
    </div>
  );
}