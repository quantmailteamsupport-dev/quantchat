/**
 * Call Signaling Service
 * Handles WebSocket-based signaling for WebRTC calls
 */

import WebRTCCallService from './WebRTCCallService';

interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'call-request' | 'call-accept' | 'call-reject' | 'call-end';
  callId: string;
  from: string;
  to: string;
  data?: any;
}

interface SocketConnection {
  userId: string;
  socketId: string;
  socket: any; // WebSocket or Socket.IO socket
}

export class CallSignalingService {
  private connections: Map<string, SocketConnection> = new Map();
  private userSockets: Map<string, string> = new Map(); // userId -> socketId

  constructor(private callService: typeof WebRTCCallService) {
    this.setupCallServiceListeners();
  }

  /**
   * Register a new socket connection
   */
  registerConnection(userId: string, socketId: string, socket: any): void {
    this.connections.set(socketId, { userId, socketId, socket });
    this.userSockets.set(userId, socketId);
    
    console.log(`User ${userId} connected with socket ${socketId}`);
  }

  /**
   * Unregister a socket connection
   */
  unregisterConnection(socketId: string): void {
    const connection = this.connections.get(socketId);
    if (connection) {
      this.userSockets.delete(connection.userId);
      this.connections.delete(socketId);
      
      // End any active calls for this user
      const userCalls = this.callService.getUserCalls(connection.userId);
      userCalls.forEach(call => {
        this.callService.endCall(call.callId);
      });
      
      console.log(`User ${connection.userId} disconnected`);
    }
  }

  /**
   * Handle incoming signaling messages
   */
  async handleSignalingMessage(socketId: string, message: SignalingMessage): Promise<void> {
    const connection = this.connections.get(socketId);
    if (!connection) {
      console.error('Connection not found for socket:', socketId);
      return;
    }

    try {
      switch (message.type) {
        case 'call-request':
          await this.handleCallRequest(connection, message);
          break;
        
        case 'call-accept':
          await this.handleCallAccept(connection, message);
          break;
        
        case 'call-reject':
          await this.handleCallReject(connection, message);
          break;
        
        case 'call-end':
          await this.handleCallEnd(connection, message);
          break;
        
        case 'offer':
          await this.handleOffer(connection, message);
          break;
        
        case 'answer':
          await this.handleAnswer(connection, message);
          break;
        
        case 'ice-candidate':
          await this.handleIceCandidate(connection, message);
          break;
        
        default:
          console.warn('Unknown signaling message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling signaling message:', error);
      this.sendError(socketId, 'Failed to process signaling message');
    }
  }

  /**
   * Handle call request
   */
  private async handleCallRequest(
    connection: SocketConnection,
    message: SignalingMessage
  ): Promise<void> {
    const { to, data } = message;
    const callType = data?.type || 'voice';
    
    // Get receiver's socket
    const receiverSocketId = this.userSockets.get(to);
    if (!receiverSocketId) {
      this.sendError(connection.socketId, 'User is not online');
      return;
    }

    // Create call session
    const callId = this.generateCallId();
    await this.callService.initiateCall(
      callId,
      connection.userId,
      to,
      callType,
      connection.socketId,
      receiverSocketId
    );

    // Notify receiver
    this.sendToUser(to, {
      type: 'incoming-call',
      callId,
      from: connection.userId,
      callType,
      timestamp: new Date().toISOString(),
    });

    // Confirm to caller
    this.sendToSocket(connection.socketId, {
      type: 'call-initiated',
      callId,
      status: 'ringing',
    });
  }

  /**
   * Handle call accept
   */
  private async handleCallAccept(
    connection: SocketConnection,
    message: SignalingMessage
  ): Promise<void> {
    const { callId } = message;
    
    const call = await this.callService.acceptCall(callId);
    if (!call) {
      this.sendError(connection.socketId, 'Call not found');
      return;
    }

    // Notify both parties
    this.sendToUser(call.initiator.userId, {
      type: 'call-accepted',
      callId,
      by: connection.userId,
    });

    this.sendToSocket(connection.socketId, {
      type: 'call-accepted',
      callId,
      status: 'active',
    });
  }

  /**
   * Handle call reject
   */
  private async handleCallReject(
    connection: SocketConnection,
    message: SignalingMessage
  ): Promise<void> {
    const { callId } = message;
    
    await this.callService.rejectCall(callId);
    const call = this.callService.getCall(callId);
    
    if (call) {
      // Notify initiator
      this.sendToUser(call.initiator.userId, {
        type: 'call-rejected',
        callId,
        by: connection.userId,
      });
    }
  }

  /**
   * Handle call end
   */
  private async handleCallEnd(
    connection: SocketConnection,
    message: SignalingMessage
  ): Promise<void> {
    const { callId } = message;
    
    const call = this.callService.getCall(callId);
    if (call) {
      // Notify other party
      const otherUserId = call.initiator.userId === connection.userId
        ? call.receiver.userId
        : call.initiator.userId;
      
      this.sendToUser(otherUserId, {
        type: 'call-ended',
        callId,
        by: connection.userId,
      });
    }
    
    await this.callService.endCall(callId);
    this.callService.cleanup(callId);
  }

  /**
   * Handle WebRTC offer
   */
  private async handleOffer(
    connection: SocketConnection,
    message: SignalingMessage
  ): Promise<void> {
    const { to, data } = message;
    
    this.sendToUser(to, {
      type: 'offer',
      from: connection.userId,
      callId: message.callId,
      offer: data.offer,
    });
  }

  /**
   * Handle WebRTC answer
   */
  private async handleAnswer(
    connection: SocketConnection,
    message: SignalingMessage
  ): Promise<void> {
    const { to, data } = message;
    
    this.sendToUser(to, {
      type: 'answer',
      from: connection.userId,
      callId: message.callId,
      answer: data.answer,
    });
  }

  /**
   * Handle ICE candidate
   */
  private async handleIceCandidate(
    connection: SocketConnection,
    message: SignalingMessage
  ): Promise<void> {
    const { to, data } = message;
    
    this.sendToUser(to, {
      type: 'ice-candidate',
      from: connection.userId,
      callId: message.callId,
      candidate: data.candidate,
    });
  }

  /**
   * Setup listeners for call service events
   */
  private setupCallServiceListeners(): void {
    this.callService.on('call:initiated', (call) => {
      console.log('Call initiated:', call.callId);
    });

    this.callService.on('call:accepted', (call) => {
      console.log('Call accepted:', call.callId);
    });

    this.callService.on('call:rejected', (call) => {
      console.log('Call rejected:', call.callId);
    });

    this.callService.on('call:ended', (call) => {
      console.log('Call ended:', call.callId);
    });
  }

  /**
   * Send message to a specific socket
   */
  private sendToSocket(socketId: string, data: any): void {
    const connection = this.connections.get(socketId);
    if (connection && connection.socket) {
      connection.socket.emit('signaling', data);
    }
  }

  /**
   * Send message to a user (by userId)
   */
  private sendToUser(userId: string, data: any): void {
    const socketId = this.userSockets.get(userId);
    if (socketId) {
      this.sendToSocket(socketId, data);
    }
  }

  /**
   * Send error message
   */
  private sendError(socketId: string, message: string): void {
    this.sendToSocket(socketId, {
      type: 'error',
      message,
    });
  }

  /**
   * Generate unique call ID
   */
  private generateCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get connection info
   */
  getConnectionInfo(socketId: string): SocketConnection | undefined {
    return this.connections.get(socketId);
  }

  /**
   * Check if user is online
   */
  isUserOnline(userId: string): boolean {
    return this.userSockets.has(userId);
  }

  /**
   * Get online users count
   */
  getOnlineUsersCount(): number {
    return this.userSockets.size;
  }
}

export default new CallSignalingService(WebRTCCallService);

// Made with Bob
