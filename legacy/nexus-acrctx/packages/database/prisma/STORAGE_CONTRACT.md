## Storage contract

Persistence for this package is defined by [`schema.prisma`](/C:/infinity%20trinity%20apps%20motive/Quantchat-quantchat/Quantchat-quantchat/Nexus/packages/database/prisma/schema.prisma). No checked-in Prisma migration history is present in this package.

Operational invariants:

- `User.email` is globally unique and `PublicKeyBundle.userId`, `DigitalTwin.userId`, and `GiftPreferences.userId` are one-to-one extensions of a user record.
- `ConversationParticipant @@unique([conversationId, userId])`, `WorkspaceMember @@unique([workspaceId, userId])`, and `HiveMember @@unique([userId, hiveId])` are the membership idempotency keys for joining the same container twice.
- `PollVote @@unique([optionId, voterId])` is the vote idempotency key for a single option.
- `CallMinuteLog @@unique([userId, callId, minuteBucket])` is the earnings idempotency key for token awards. Ledger appends should be derived from this uniqueness boundary.
- `Gift.slug`, `Workspace.slug`, `WorkspaceId+Channel.name`, and `MediaAttachment.s3Key` are the external identity anchors that must remain stable across retries.
- Attention-token debits, credits, call-minute awards, gift sends, and gift refunds must run inside serializable Prisma transactions. The write order is `User` balance mutation plus append-only `AttentionTokenLedger` row in the same transaction so readers never observe a committed balance without its ledger entry.
- Rows with `createdAt` but no `updatedAt` are append-only ledgers, logs, or immutable envelopes unless a service documents a mutation path explicitly.

Known risks still present:

- `AttentionTokenLedger` is append-only but has no unique reference key. Serializable transactions reduce race windows, but retries that reuse the same logical operation outside the built-in `CallMinuteLog` key can still append duplicate debits or credits unless callers deduplicate on `refId`.
- `GiftTransaction` has no unique idempotency token for `(senderId, recipientId, giftId, callId)` or another service-level fingerprint, so duplicate send requests can create multiple pending gifts.
- `Message` does not carry a sender-scoped idempotency key. Replayed client submits can create duplicate encrypted envelopes unless the messaging service deduplicates before insert.
- Ownership enforcement is mostly relational and service-layer based. Many rows store raw foreign keys without explicit actor columns, so auth checks must remain close to write paths.

Rollback posture:

- Without checked-in migrations, future schema changes should be additive first, with preflight queries for orphaned relational data before new foreign keys or uniqueness constraints are introduced.
