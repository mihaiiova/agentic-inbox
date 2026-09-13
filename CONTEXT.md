# Agentic Inbox

Agentic Inbox receives, stores, organizes, and sends email for a mailbox through its browser client and mail-only MCP interface.

## Language

**Mailbox**:
A configured email address and its complete private collection of mail, folders, labels, settings, and attachments.
_Avoid_: account, inbox

**Message**:
One received, drafted, or outbound email record in a Mailbox.
_Avoid_: email when referring to an address, mail item

**Conversation**:
A related sequence of Messages grouped by message-threading metadata, with subject matching as a legacy fallback.
_Avoid_: thread when referring to implementation fields

**Attachment**:
A file associated with one Message, with metadata stored in the Mailbox and its content stored separately.
_Avoid_: Drive file, document

**Mail Dispatch**:
The act of validating, delivering, and recording an outbound Message from a Mailbox.
_Avoid_: send pipeline, email action

**Mail Intake**:
The act of receiving, validating, and recording an inbound Message for a Mailbox.
_Avoid_: email handler, ingestion
