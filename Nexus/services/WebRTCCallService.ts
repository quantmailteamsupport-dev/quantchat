/**
 * WebRTC Call Service
 * Handles voice and video calling functionality using WebRTC
 */

type EventCallback = (...args: any[]) => void;

class EventEmitter {
  private events: Map<string, EventCallback[]> = new Map();

  on(event: string, callback: EventCallback): void {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    this.events.get(event)!.push(callback);
  }

  emit(event: string, ...args: any[]): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => callback(...args));
    }
  }

  off(event: string, callback: EventCallback): void {
    const callbacks = this.events.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index > -1) {
        callbacks.splice(index, 1);
      }
    }
  }
}

interface CallParticipant {
  userId: string;
  socketId: string;
  stream?: MediaStream;
  peerConnection?: RTCPeerConnection;
}

interface CallSession {
  callId: string;
  initiator: CallParticipant;
  receiver: CallParticipant;
  type: 'voice' | 'video';
  status: 'ringing' | 'active' | 'ended';
  startTime?: Date;
  endTime?: Date;
}

const RINGING_TIMEOUT_MS = 45_000;

export class WebRTCCallService extends EventEmitter {
  private activeCalls: Map<string, CallSession> = new Map();
  private ringTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];

  constructor() {
    super();
  }

  /**
   * Initialize a new call
   */
  async initiateCall(
    callId: string,
    initiatorId: string,
    receiverId: string,
    type: 'voice' | 'video',
    initiatorSocketId: string,
    receiverSocketId: string
  ): Promise<CallSession> {
    const callSession: CallSession = {
      callId,
      initiator: {
        userId: initiatorId,
        socketId: initiatorSocketId,
      },
      receiver: {
        userId: receiverId,
        socketId: receiverSocketId,
      },
      type,
      status: 'ringing',
    };

    this.activeCalls.set(callId, callSession);
    this.emit('call:initiated', callSession);

    // Auto-end calls that are never answered
    const timeout = setTimeout(() => {
      const call = this.activeCalls.get(callId);
      if (call && call.status === 'ringing') {
        call.status = 'ended';
        call.endTime = new Date();
        this.emit('call:timeout', call);
        this.activeCalls.delete(callId);
      }
      this.ringTimeouts.delete(callId);
    }, RINGING_TIMEOUT_MS);
    this.ringTimeouts.set(callId, timeout);

    return callSession;
  }

  /**
   * Accept an incoming call
   */
  async acceptCall(callId: string): Promise<CallSession | null> {
    const call = this.activeCalls.get(callId);
    if (!call) {
      throw new Error('Call not found');
    }

    clearTimeout(this.ringTimeouts.get(callId));
    this.ringTimeouts.delete(callId);

    call.status = 'active';
    call.startTime = new Date();

    this.activeCalls.set(callId, call);
    this.emit('call:accepted', call);

    return call;
  }

  /**
   * Reject an incoming call
   */
  async rejectCall(callId: string): Promise<void> {
    const call = this.activeCalls.get(callId);
    if (!call) {
      throw new Error('Call not found');
    }

    clearTimeout(this.ringTimeouts.get(callId));
    this.ringTimeouts.delete(callId);

    call.status = 'ended';
    call.endTime = new Date();

    this.emit('call:rejected', call);
    this.activeCalls.delete(callId);
  }

  /**
   * End an active call
   */
  async endCall(callId: string): Promise<void> {
    const call = this.activeCalls.get(callId);
    if (!call) {
      throw new Error('Call not found');
    }

    clearTimeout(this.ringTimeouts.get(callId));
    this.ringTimeouts.delete(callId);

    call.status = 'ended';
    call.endTime = new Date();

    this.emit('call:ended', call);
    this.activeCalls.delete(callId);
  }

  /**
   * Create WebRTC peer connection
   */
  createPeerConnection(callId: string): RTCPeerConnection {
    const peerConnection = new RTCPeerConnection({
      iceServers: this.iceServers,
    });

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.emit('ice:candidate', {
          callId,
          candidate: event.candidate,
        });
      }
    };

    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
      this.emit('connection:state', {
        callId,
        state: peerConnection.connectionState,
      });
    };

    return peerConnection;
  }

  /**
   * Create offer for call initiation
   */
  async createOffer(
    peerConnection: RTCPeerConnection
  ): Promise<RTCSessionDescriptionInit> {
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });

    await peerConnection.setLocalDescription(offer);
    return offer;
  }

  /**
   * Create answer for call acceptance
   */
  async createAnswer(
    peerConnection: RTCPeerConnection
  ): Promise<RTCSessionDescriptionInit> {
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    return answer;
  }

  /**
   * Set remote description
   */
  async setRemoteDescription(
    peerConnection: RTCPeerConnection,
    description: RTCSessionDescriptionInit
  ): Promise<void> {
    try {
      await peerConnection.setRemoteDescription(new RTCSessionDescription(description));
    } catch (err) {
      console.error('[WebRTC] setRemoteDescription failed:', err);
      throw err;
    }
  }

  /**
   * Add ICE candidate
   */
  async addIceCandidate(
    peerConnection: RTCPeerConnection,
    candidate: RTCIceCandidateInit
  ): Promise<void> {
    try {
      await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (err) {
      console.error('[WebRTC] addIceCandidate failed:', err);
      throw err;
    }
  }

  /**
   * Get active call by ID
   */
  getCall(callId: string): CallSession | undefined {
    return this.activeCalls.get(callId);
  }

  /**
   * Get all active calls for a user
   */
  getUserCalls(userId: string): CallSession[] {
    return Array.from(this.activeCalls.values()).filter(
      (call) =>
        call.initiator.userId === userId || call.receiver.userId === userId
    );
  }

  /**
   * Get call statistics
   */
  async getCallStats(
    peerConnection: RTCPeerConnection
  ): Promise<RTCStatsReport> {
    return await peerConnection.getStats();
  }

  /**
   * Toggle audio mute
   */
  toggleAudio(stream: MediaStream, mute: boolean): void {
    stream.getAudioTracks().forEach((track) => {
      track.enabled = !mute;
    });
  }

  /**
   * Toggle video
   */
  toggleVideo(stream: MediaStream, enable: boolean): void {
    stream.getVideoTracks().forEach((track) => {
      track.enabled = enable;
    });
  }

  /**
   * Get media stream
   */
  async getMediaStream(
    constraints: MediaStreamConstraints
  ): Promise<MediaStream> {
    return await navigator.mediaDevices.getUserMedia(constraints);
  }

  /**
   * Clean up resources
   */
  cleanup(callId: string): void {
    const call = this.activeCalls.get(callId);
    if (call) {
      // Close peer connections
      if (call.initiator.peerConnection) {
        call.initiator.peerConnection.close();
      }
      if (call.receiver.peerConnection) {
        call.receiver.peerConnection.close();
      }

      // Stop media streams
      if (call.initiator.stream) {
        call.initiator.stream.getTracks().forEach((track) => track.stop());
      }
      if (call.receiver.stream) {
        call.receiver.stream.getTracks().forEach((track) => track.stop());
      }

      this.activeCalls.delete(callId);
    }
  }

  /**
   * Get total active calls count
   */
  getActiveCallsCount(): number {
    return this.activeCalls.size;
  }
}

export default new WebRTCCallService();

// Made with Bob
