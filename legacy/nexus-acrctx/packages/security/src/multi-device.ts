/**
 * multi-device.ts — Multi-Device Fan-Out Encryption
 *
 * Each user can have N devices. Each device has its own Identity Key
 * and registers its own PreKeyBundle on the server.
 *
 * When sending a message, the sender encrypts the SAME plaintext
 * independently for each of the recipient's devices, and also for
 * each of the sender's OTHER devices (so they can read their own messages).
 *
 * The server stores one row per (sender, recipientDevice) ciphertext.
 */

import { SessionManager, type EncryptedEnvelope } from "./session-manager";
import type { PreKeyBundle } from "./x3dh";

// ─── Types ──────────────────────────────────────────────────

export interface DeviceBundle {
  deviceId: string;
  bundle: PreKeyBundle;
}

export interface FanOutEnvelope {
  /** Target device ID */
  deviceId: string;
  /** The encrypted envelope for this specific device */
  envelope: EncryptedEnvelope;
}

export interface MultiDeviceMessage {
  senderId: string;
  receiverId: string;
  /** One envelope per recipient device */
  deviceEnvelopes: FanOutEnvelope[];
}

// ─── Multi-Device Manager ───────────────────────────────────

export class MultiDeviceManager {
  private sessionManager: SessionManager;
  private myUserId: string;
  private myDeviceId: string;

  constructor(myUserId: string, myDeviceId: string) {
    this.myUserId = myUserId;
    this.myDeviceId = myDeviceId;
    this.sessionManager = new SessionManager(`${myUserId}:${myDeviceId}`);
  }

  /**
   * Bootstrap this device: generate keys and return the bundle to upload.
   */
  async bootstrap(): Promise<{ deviceId: string; bundle: PreKeyBundle }> {
    const bundle = await this.sessionManager.bootstrap();
    return { deviceId: this.myDeviceId, bundle };
  }

  /**
   * Encrypt a message for all of a recipient's devices.
   *
   * @param recipientId  The recipient's user ID
   * @param plaintext    The plaintext message
   * @param deviceBundles  All of the recipient's device bundles (from server).
   *                       For existing sessions, bundles are optional.
   */
  async encryptForAllDevices(
    recipientId: string,
    plaintext: string,
    deviceBundles: DeviceBundle[]
  ): Promise<MultiDeviceMessage> {
    const deviceEnvelopes: FanOutEnvelope[] = [];

    for (const { deviceId, bundle } of deviceBundles) {
      // Each device has its own independent session
      const recipientDeviceKey = `${recipientId}:${deviceId}`;

      try {
        const envelope = await this.sessionManager.encrypt(
          recipientDeviceKey,
          plaintext,
          bundle
        );
        deviceEnvelopes.push({ deviceId, envelope });
      } catch (err) {
        console.error(
          `[MultiDevice] Failed to encrypt for device ${deviceId}:`,
          err
        );
        // Skip this device — the message will be queued server-side
        // and delivered when the device refreshes its bundle
      }
    }

    return {
      senderId: this.myUserId,
      receiverId: recipientId,
      deviceEnvelopes,
    };
  }

  /**
   * Decrypt a message addressed to this device.
   */
  async decryptForThisDevice(
    senderId: string,
    senderDeviceId: string,
    envelope: EncryptedEnvelope
  ): Promise<string> {
    const senderDeviceKey = `${senderId}:${senderDeviceId}`;
    return this.sessionManager.decrypt(senderDeviceKey, envelope);
  }

  /**
   * Generate a unique device ID for this browser/app instance.
   * Persisted in localStorage so the same browser always uses the same ID.
   */
  static getOrCreateDeviceId(): string {
    if (typeof window === "undefined") {
      return `device_server_${Date.now()}`;
    }

    const KEY = "quantchat_device_id";
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      localStorage.setItem(KEY, id);
    }
    return id;
  }
}
