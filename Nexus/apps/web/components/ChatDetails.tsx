"use client";
import React from "react";
import { Icon, Avatar, Btn, Card, FingerprintGrid, makeCode, Pill, Switch, hashHue } from "./qc-shared";

export default function ChatDetails({ contact }: { contact: any }) {
  if (!contact) return <aside style={{ borderLeft: "1px solid var(--qc-line)", background: "var(--qc-bg-2)", minWidth: 280 }} />;
  const isGroup = contact.isGroup;
  
  return (
    <aside className="qc-scroll" style={{
      borderLeft: "1px solid var(--qc-line)",
      background: "var(--qc-bg-2)",
      overflowY: "auto", minHeight: 0,
      padding: "16px 16px 24px",
      display: "flex", flexDirection: "column", gap: 14,
    }}>
      <div style={{ textAlign: "center", padding: "6px 0 4px" }}>
        {isGroup ? (
          <div style={{ width: 56, height: 56, borderRadius: 14, margin: "0 auto",
            background: "var(--qc-bg-3)", display: "flex", alignItems: "center", justifyContent: "center",
            color: "var(--qc-ink-2)", fontWeight: 700, fontSize: 18, border: "1px solid var(--qc-line)",
          }}><Icon name="hash" size={20}/></div>
        ) : (
          <Avatar contact={{ ...contact, avatarHue: hashHue(contact.name), isBot: contact.kind === "bot" }} size={56}/>
        )}
        <div style={{ marginTop: 8, fontSize: 14, fontWeight: 600 }}>{contact.name}</div>
        <div style={{ fontSize: 11, color: "var(--qc-ink-3)", marginTop: 2 }}>
          {isGroup ? `Active session` : contact.role || 'Member'}
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 6 }}>
        <Btn size="sm" icon="phone" variant="ghost">Call</Btn>
        <Btn size="sm" icon="video" variant="ghost">Video</Btn>
        <Btn size="sm" icon="bell" variant="ghost">Mute</Btn>
      </div>

      <Card title="Encryption" subtitle="end-to-end · audited">
        <div style={{ padding: 14, display: "flex", gap: 12, alignItems: "center" }}>
          <FingerprintGrid seed={contact.id || "demo"} cell={7}/>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="mono" style={{ fontSize: 10.5, lineHeight: 1.5, wordBreak: "break-all" }}>
              {makeCode(contact.id || "demo", 4, 4)}
            </div>
            <div style={{ fontSize: 10.5, color: "var(--qc-accent-ink)", marginTop: 4, display: "inline-flex", alignItems: "center", gap: 4 }}>
              <Icon name="shield-check" size={11}/> verified
            </div>
          </div>
        </div>
      </Card>

      <Card title="Shared" action={<button className="qc-btn qc-btn-ghost qc-btn-sm">all</button>}>
        <div style={{ padding: 12, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
          <div className="qc-placeholder" style={{ aspectRatio: "1" }}>file1.png</div>
          <div className="qc-placeholder" style={{ aspectRatio: "1" }}>data.csv</div>
          <div className="qc-placeholder" style={{ aspectRatio: "1" }}>doc.pdf</div>
        </div>
      </Card>

      <Card title="Privacy" subtitle="this conversation">
        <div className="qc-srow">
          <div>
            <div className="qc-srow-label">Read receipts</div>
            <div className="qc-srow-help">visible to all members</div>
          </div>
          <Switch checked={true} onChange={() => {}}/>
        </div>
        <div className="qc-srow">
          <div>
            <div className="qc-srow-label">Smart replies</div>
            <div className="qc-srow-help">opt-in · scoped to thread</div>
          </div>
          <Switch checked={true} onChange={() => {}}/>
        </div>
        <div className="qc-srow">
          <div>
            <div className="qc-srow-label">Disappearing</div>
            <div className="qc-srow-help">off</div>
          </div>
          <Btn size="sm" variant="ghost" iconRight="chevron-r">edit</Btn>
        </div>
      </Card>
    </aside>
  );
}
