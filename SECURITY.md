# QuantChat Security Notes

## Sensitive Data

QuantChat handles messages, session tokens, device state, consent settings, WebRTC metadata, and optional AI prompts. Never commit real `.env` files, chat exports, access tokens, private keys, or debug logs with message bodies.

## Privacy Controls

- Device revoke must invalidate stale sessions immediately.
- AI smart replies must be opt-in and user-confirmed.
- Consent and receipt settings must be enforced server-side.
- Logs should contain correlation IDs, not message contents.

## Release Gate

Before marking messaging or privacy work verified, record:

- Two-device revoke trace.
- Build/lint/typecheck command results.
- Reconnect behavior for realtime sessions.
- Any known encryption-readiness gaps.
