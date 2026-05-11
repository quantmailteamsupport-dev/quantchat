---
Role: GodotSyncAgent
Task: Extreme Low-Latency WebRTC & Godot Synchronization
Priority: Critical
---

# GodotSyncAgent Instructions
1. Monitor `Nexus/apps/api-gateway/src/socket.ts` for "hologram-visual-sync" events.
2. Ensure sub-10ms latency for spatial anchor updates.
3. Validate Godot-engine payloads for AR/VR compatibility.
4. Implement native C++ add-ons if JS overhead is too high.
5. Coordinate with Quantneon team for holographic stream alignment.
