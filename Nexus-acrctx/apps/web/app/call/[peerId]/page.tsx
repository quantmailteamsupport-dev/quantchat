"use client";

/**
 * app/call/[peerId]/page.tsx
 *
 * Holographic WebRTC video call route. Drops the user directly into
 * a peer-to-peer video call with the target user id from the URL.
 * Uses the existing webrtc-signal signaling channel via useWebRTC.
 */

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import HolographicVideoCall from "@/components/HolographicVideoCall";
import ConversationHandoffPanel, { type HandoffPreview } from "@/components/ConversationHandoffPanel";
import SurfaceSwitchRail from "@/components/SurfaceSwitchRail";
import { useFrontendPreferences, type ReadReceiptMode } from "@/lib/useFrontendPreferences";
import type { MessageStatus } from "@/lib/db";

// TODO: pull from auth context once SSO lands (see TASKS.md Phase 1).
const MY_USER_ID = "local-user";

function resolveChannelHref(peerId: string): string {
  if (peerId.includes("dev") || peerId.includes("work")) return "/channels/work";
  if (peerId.includes("class") || peerId.includes("school")) return "/channels/school";
  return "/channels/family";
}

function deliveryStatus(readReceiptsEnabled: boolean, readReceiptMode: ReadReceiptMode): MessageStatus {
  return readReceiptsEnabled && readReceiptMode === "instant" ? "read" : "delivered";
}

export default function CallPage() {
  return (
    <Suspense fallback={null}>
      <CallPageContent />
    </Suspense>
  );
}

function CallPageContent() {
  const params = useParams<{ peerId: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { preferences } = useFrontendPreferences();
  const [noteDraft, setNoteDraft] = useState("");

  const peerId = typeof params?.peerId === "string" ? params.peerId : "";
  const peerName = searchParams?.get("name") ?? peerId;
  const channelHref = useMemo(() => resolveChannelHref(peerId), [peerId]);
  const callHref = useMemo(
    () => `/call/${encodeURIComponent(peerId)}?name=${encodeURIComponent(peerName)}`,
    [peerId, peerName],
  );
  const [handoffPreview, setHandoffPreview] = useState<HandoffPreview>(() => ({
    text: `Call connected with ${peerName || "peer"}.`,
    targetLabel: "In-call note",
    status: deliveryStatus(true, "instant"),
    timestamp: Date.now(),
  }));
  const compactLayout = preferences.compactChatLayout;

  const handleClose = useCallback(() => {
    router.back();
  }, [router]);

  useEffect(() => {
    setHandoffPreview((existing) => ({
      ...existing,
      status: deliveryStatus(preferences.readReceiptsEnabled, preferences.readReceiptMode),
    }));
  }, [preferences.readReceiptMode, preferences.readReceiptsEnabled]);

  useEffect(() => {
    setHandoffPreview((existing) => ({
      ...existing,
      text: existing.text.startsWith("Call connected with ") ? `Call connected with ${peerName || "peer"}.` : existing.text,
    }));
  }, [peerName]);

  const publishHandoff = useCallback(
    (targetLabel: string, override?: string) => {
      const nextText = override?.trim() || noteDraft.trim() || `Call update from ${peerName}`;
      setHandoffPreview({
        text: nextText,
        targetLabel,
        status: deliveryStatus(preferences.readReceiptsEnabled, preferences.readReceiptMode),
        timestamp: Date.now(),
      });
      setNoteDraft("");
    },
    [noteDraft, peerName, preferences.readReceiptMode, preferences.readReceiptsEnabled],
  );

  if (!peerId) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "#8696a0",
          fontFamily: "-apple-system, sans-serif",
          background: "#05060b",
        }}
      >
        Missing peer id.
      </div>
    );
  }

  return (
    <>
      <HolographicVideoCall
        myUserId={MY_USER_ID}
        peerId={peerId}
        peerName={peerName}
        onClose={handleClose}
      />

      <div
        style={{
          position: "fixed",
          top: 76,
          left: 12,
          right: 12,
          zIndex: 70,
          display: "flex",
          justifyContent: "center",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            width: "min(430px, 100%)",
            display: "flex",
            flexDirection: "column",
            gap: compactLayout ? 6 : 8,
            pointerEvents: "auto",
          }}
        >
          <SurfaceSwitchRail
            active="call"
            callHref={callHref}
            channelHref={channelHref}
            compact={compactLayout}
          />

          <ConversationHandoffPanel
            title="Live Call Bridge"
            subtitle="Keep call updates synchronized with chat surfaces."
            preview={handoffPreview}
            reactionsEnabled={preferences.reactionsEnabled}
            readReceiptsEnabled={preferences.readReceiptsEnabled}
            readReceiptMode={preferences.readReceiptMode}
            compactLayout={compactLayout}
            accent="#8fe4ff"
          />

          <div
            style={{
              borderRadius: 12,
              background: "rgba(6,10,18,0.78)",
              border: "1px solid rgba(255,255,255,0.16)",
              backdropFilter: "blur(14px)",
              padding: compactLayout ? "8px 9px" : "9px 10px",
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <input
              value={noteDraft}
              onChange={(event) => setNoteDraft(event.target.value)}
              placeholder="Type a call note"
              style={{
                flex: 1,
                minWidth: 0,
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.16)",
                background: "rgba(255,255,255,0.08)",
                color: "#e9edef",
                outline: "none",
                padding: compactLayout ? "7px 10px" : "8px 11px",
                fontSize: compactLayout ? 12 : 12.5,
                fontFamily: "-apple-system, sans-serif",
              }}
            />
            <button
              type="button"
              onClick={() => publishHandoff("In-call note")}
              style={{
                borderRadius: 10,
                border: "1px solid rgba(143,228,255,0.72)",
                background: "rgba(143,228,255,0.22)",
                color: "#e8fbff",
                padding: compactLayout ? "7px 9px" : "8px 10px",
                fontSize: compactLayout ? 11 : 11.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Note
            </button>
            <button
              type="button"
              onClick={() => {
                publishHandoff("Shared to DM");
                router.push("/chat");
              }}
              style={{
                borderRadius: 10,
                border: "1px solid rgba(0,168,132,0.72)",
                background: "rgba(0,168,132,0.24)",
                color: "#d9fff4",
                padding: compactLayout ? "7px 9px" : "8px 10px",
                fontSize: compactLayout ? 11 : 11.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              DM
            </button>
            <button
              type="button"
              onClick={() => {
                publishHandoff("Shared to feed");
                router.push("/feed");
              }}
              style={{
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.22)",
                background: "rgba(255,255,255,0.1)",
                color: "#e9edef",
                padding: compactLayout ? "7px 9px" : "8px 10px",
                fontSize: compactLayout ? 11 : 11.5,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Feed
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
