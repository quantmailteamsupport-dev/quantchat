import React from 'react';
import { MessageSquare, Shield, Zap } from 'lucide-react';

export default function EmptyState() {
  return (
    <div data-testid="empty-state" className="flex-1 flex items-center justify-center bg-qc-bg">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 bg-qc-surface border border-qc-border flex items-center justify-center mx-auto mb-6">
          <MessageSquare size={28} className="text-qc-accent" />
        </div>
        <h2 className="font-heading font-bold text-xl text-white mb-2">QuantChat</h2>
        <p className="text-qc-text-secondary text-sm mb-6">
          Select a conversation or search for users to start messaging.
        </p>
        <div className="flex items-center justify-center gap-6">
          <div className="flex items-center gap-2">
            <Shield size={14} className="text-qc-success" />
            <span className="font-mono text-[10px] text-qc-text-tertiary tracking-wider">E2E ENCRYPTED</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-qc-accent" />
            <span className="font-mono text-[10px] text-qc-text-tertiary tracking-wider">&lt;140MS DELIVERY</span>
          </div>
        </div>
      </div>
    </div>
  );
}
