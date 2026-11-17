# Security warnings

Known risks. Keep updated with every new feature.

## Open
- **Phone approval relies on a device id the phone itself sends.** A new phone must be approved on the PC ("Povolit"); the approved id is remembered in localStorage. Someone who has both the QR link and a copied device id could skip approval. Acceptable for a LAN tool; revisit with user accounts.
- **Photos are stored unencrypted in the PC browser (IndexedDB).** Anyone using the same browser profile can see them. They may show customers' homes.
- **PC id survives reloads (localStorage).** A link shared by mistake stays valid until the id changes. Add a "new QR code" button if needed.
- **Production signalling uses the public PeerJS cloud server.** It sees only peer ids and connection metadata, never photos (those go directly over WebRTC, encrypted with DTLS). Self-host the server if this becomes a concern.
- **Incoming data from the phone must be validated.** Every message is type-checked (`src/lib/protocol.ts`); photo uploads (F02) must also check file type and size limits.
- **Dev server is reachable by everyone on the local network** (port 5173, `allowedHosts: true`). Dev only, never expose to the internet.
