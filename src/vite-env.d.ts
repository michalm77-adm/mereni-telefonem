/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Address the phone uses to reach the PC in development, e.g. http://192.168.1.27:5173/ */
  readonly VITE_LAN_URL?: string;
  /** "local" = signalling server behind the dev proxy at /peerjs; otherwise the public PeerJS cloud. */
  readonly VITE_PEER_MODE?: string;
}
