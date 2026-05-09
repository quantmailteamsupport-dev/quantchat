"use client";

/**
 * components/ServersSidebar.tsx
 *
 * Servers / Spaces sidebar — Professional Redesign
 * Shows server list with channels, integrated into the hybrid chat layout.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Volume2, Video, Hash, Plus } from "lucide-react";
import type { MockServer, MockChannel } from "@/lib/mockChatData";
import ChillRoomModal from "@/components/ChillRoomModal";

interface ServersSidebarProps {
  servers: MockServer[];
  activeServerId?: string;
  activeChannelId?: string;
  onSelectChannel: (serverId: string, channelId: string) => void;
}

function ChannelIcon({ type }: { type: MockChannel["type"] }) {
  if (type === "voice") return <Volume2 size={14} />;
  if (type === "video") return <Video size={14} />;
  return <Hash size={14} />;
}

function ServerItem({
  server,
  isActive,
  activeChannelId,
  onSelectChannel,
}: {
  server: MockServer;
  isActive: boolean;
  activeChannelId?: string;
  onSelectChannel: (channelId: string) => void;
}) {
  const [expanded, setExpanded] = useState(isActive);
  const [chillRoomOpen, setChillRoomOpen] = useState(false);

  return (
    <>
      <ChillRoomModal
        isOpen={chillRoomOpen}
        onClose={() => setChillRoomOpen(false)}
        spaceName={`${server.name} Chill Room`}
        participantCount={Math.floor(Math.random() * 8)}
      />

      <div>
        {/* Server header row */}
        <motion.button
          onClick={() => setExpanded((v) => !v)}
          whileTap={{ scale: 0.98 }}
          style={{
            width: "100%",
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "8px 12px",
            background: "none",
            border: "none",
            cursor: "pointer",
            borderRadius: 8,
            transition: "background 0.12s",
          }}
        >
          {/* Server icon */}
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: server.color,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              flexShrink: 0,
            }}
          >
            {server.icon}
          </div>

          <span
            style={{
              flex: 1,
              fontSize: 13,
              fontWeight: 600,
              color: isActive ? "#E6EDF7" : "#93A1BC",
              textAlign: "left",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontFamily: "'Inter', sans-serif",
            }}
          >
            {server.name}
          </span>

          {server.unreadCount > 0 && !expanded && (
            <div
              style={{
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                background: "#2DD4BF",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 10,
                fontWeight: 700,
                color: "#0B1220",
                flexShrink: 0,
              }}
            >
              {server.unreadCount}
            </div>
          )}

          <motion.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            style={{ color: "#5B6B82", flexShrink: 0 }}
          >
            <ChevronDown size={14} />
          </motion.div>
        </motion.button>

        {/* Channel list */}
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              style={{ overflow: "hidden", paddingLeft: 16 }}
            >
              {server.channels.map((channel) => {
                const isVideoChannel = channel.type === "video";
                const isChannelActive = activeChannelId === channel.id;

                return (
                  <motion.button
                    key={channel.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => {
                      if (isVideoChannel) {
                        setChillRoomOpen(true);
                      } else {
                        onSelectChannel(channel.id);
                      }
                    }}
                    style={{
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 10px",
                      background: isChannelActive
                        ? "rgba(45, 212, 191, 0.1)"
                        : "none",
                      border: "none",
                      cursor: "pointer",
                      borderRadius: 6,
                      marginBottom: 2,
                      transition: "background 0.12s",
                    }}
                  >
                    <span
                      style={{
                        color: isChannelActive ? "#2DD4BF" : "#5B6B82",
                        display: "flex",
                        flexShrink: 0,
                      }}
                    >
                      <ChannelIcon type={channel.type} />
                    </span>

                    <span
                      style={{
                        flex: 1,
                        fontSize: 13,
                        color: isChannelActive ? "#E6EDF7" : "#93A1BC",
                        textAlign: "left",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      {channel.name}
                    </span>

                    {isVideoChannel && (
                      <span
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          color: "#A78BFA",
                          textTransform: "uppercase",
                          letterSpacing: "0.08em",
                          background: "rgba(167, 139, 250, 0.12)",
                          borderRadius: 4,
                          padding: "2px 5px",
                          flexShrink: 0,
                        }}
                      >
                        XR
                      </span>
                    )}

                    {channel.unread && channel.unread > 0 && (
                      <div
                        style={{
                          minWidth: 16,
                          height: 16,
                          borderRadius: 8,
                          background: "#2DD4BF",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 9,
                          fontWeight: 700,
                          color: "#0B1220",
                          flexShrink: 0,
                        }}
                      >
                        {channel.unread}
                      </div>
                    )}
                  </motion.button>
                );
              })}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

export default function ServersSidebar({
  servers,
  activeServerId,
  activeChannelId,
  onSelectChannel,
}: ServersSidebarProps) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 2,
        padding: "4px 0",
      }}
    >
      {/* Section header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px 4px",
          marginBottom: 2,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "#5B6B82",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Servers & Spaces
        </span>
        <button
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "#5B6B82",
            display: "flex",
            alignItems: "center",
            padding: 2,
            borderRadius: 4,
          }}
        >
          <Plus size={14} />
        </button>
      </div>

      {servers.map((server) => (
        <ServerItem
          key={server.id}
          server={server}
          isActive={server.id === activeServerId}
          activeChannelId={activeChannelId}
          onSelectChannel={(channelId) => onSelectChannel(server.id, channelId)}
        />
      ))}
    </div>
  );
}
