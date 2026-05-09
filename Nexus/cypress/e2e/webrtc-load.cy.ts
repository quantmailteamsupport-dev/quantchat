import { io, type Socket } from "socket.io-client";

type SignalEvent = {
  fromUserId: string;
  signal: {
    signalId: string;
    sentAt: number;
    candidate: string;
  };
  type: "offer" | "answer" | "ice-candidate";
};

describe("WebRTC signaling load suite", () => {
  it("sustains concurrent signaling traffic with high reliability and low latency", () => {
    const wsUrl = (Cypress.env("wsUrl") as string) || "http://localhost:4000";
    const virtualUsers = Number(Cypress.env("virtualUsers") || 50);
    const signalsPerUser = Number(Cypress.env("signalsPerUser") || 5);
    const maxSignalLatencyMs = Number(Cypress.env("maxSignalLatencyMs") || 300);
    const minSuccessRate = Number(Cypress.env("minSuccessRate") || 0.99);
    const authToken = (Cypress.env("authToken") as string) || "";

    const sockets: Socket[] = [];
    const latencies: number[] = [];
    let sentSignals = 0;
    let deliveredSignals = 0;

    cy.then(
      () =>
        new Cypress.Promise<void>((resolve, reject) => {
          const expectedSignals = virtualUsers * signalsPerUser;
          const users = Array.from({ length: virtualUsers }, (_, idx) => `load-user-${idx + 1}`);
          const expectedIds = new Set<string>();
          const deliveredIds = new Set<string>();
          let authenticated = 0;
          let settled = false;

          const timeout = setTimeout(() => {
            if (settled) return;
            cleanup();
            reject(
              new Error(
                `Timed out waiting for signal delivery. sent=${sentSignals}, delivered=${deliveredSignals}, expected=${expectedSignals}`,
              ),
            );
          }, 30000);

          const cleanup = () => {
            settled = true;
            clearTimeout(timeout);
            sockets.forEach((socket) => socket.disconnect());
          };

          const finish = () => {
            if (settled) return;
            cleanup();
            resolve();
          };

          const fail = (error: unknown) => {
            if (settled) return;
            cleanup();
            reject(error);
          };

          for (let idx = 0; idx < users.length; idx++) {
            const userId = users[idx];
            const socket = io(wsUrl, {
              transports: ["websocket"],
              forceNew: true,
              reconnection: false,
            });

            sockets.push(socket);

            socket.on("connect", () => {
              socket.emit("auth", {
                userId,
                token: authToken || undefined,
              });
            });

            socket.on("authenticated", () => {
              authenticated += 1;
              if (authenticated !== users.length) return;

              setTimeout(() => {
                users.forEach((senderId, senderIdx) => {
                  const sender = sockets[senderIdx];
                  const targetUserId = users[(senderIdx + 1) % users.length];

                  for (let count = 0; count < signalsPerUser; count++) {
                    const signalId = `${senderId}-${count}`;
                    expectedIds.add(signalId);
                    sentSignals += 1;
                    sender.emit("webrtc-signal", {
                      targetUserId,
                      signal: {
                        signalId,
                        sentAt: Date.now(),
                        candidate: `candidate-${signalId}`,
                      },
                      type: "ice-candidate",
                    });
                  }
                });
              }, 250);
            });

            socket.on("webrtc-signal", (event: SignalEvent) => {
              if (event.type !== "ice-candidate" || !event.signal?.signalId) return;
              if (!expectedIds.has(event.signal.signalId)) return;
              if (deliveredIds.has(event.signal.signalId)) return;

              deliveredIds.add(event.signal.signalId);
              deliveredSignals += 1;
              latencies.push(Date.now() - event.signal.sentAt);

              if (deliveredSignals === expectedSignals) {
                finish();
              }
            });

            socket.on("connect_error", (err) => {
              fail(new Error(`Socket connect_error for ${userId}: ${err.message}`));
            });

            socket.on("error", (err) => {
              const message = typeof err === "string" ? err : JSON.stringify(err);
              fail(new Error(`Socket error for ${userId}: ${message}`));
            });
          }
        }),
    );

    cy.then(() => {
      const expectedSignals = virtualUsers * signalsPerUser;
      expect(expectedSignals, "expected signals must be greater than zero").to.be.greaterThan(0);
      const successRate = deliveredSignals / expectedSignals;
      let maxLatency = 0;
      for (const latency of latencies) {
        if (latency > maxLatency) {
          maxLatency = latency;
        }
      }
      latencies.sort((a, b) => a - b);
      const p95Latency = latencies.length > 0 ? latencies[Math.floor((latencies.length - 1) * 0.95)] : 0;

      cy.task(
        "log",
        `[webrtc-load] users=${virtualUsers} expected=${expectedSignals} delivered=${deliveredSignals} successRate=${successRate.toFixed(4)} maxLatencyMs=${maxLatency} p95LatencyMs=${p95Latency}`,
      );

      expect(sentSignals, "signals emitted").to.eq(expectedSignals);
      expect(deliveredSignals, "signals delivered").to.eq(expectedSignals);
      expect(successRate, "delivery success rate").to.be.gte(minSuccessRate);
      expect(maxLatency, "max signaling latency (ms)").to.be.lte(maxSignalLatencyMs);
    });
  });
});
