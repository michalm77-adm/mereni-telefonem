import { useCallback, useEffect, useRef, useState } from "react";
import Peer, { type DataConnection } from "peerjs";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Header } from "../components/Header";
import { PhotoGrid } from "../components/PhotoGrid";
import { QrCode } from "../components/QrCode";
import { StatusBadge } from "../components/StatusBadge";
import { analysePhoto, isUsable, needsAnalysis } from "../lib/analysis";
import { deletePhoto, deleteWall, listPhotos, listWalls, savePhoto, type StoredPhoto, type Wall } from "../lib/db";
import { phoneCannotReach, senderUrl } from "../lib/links";
import { PC_ID_PREFIX, peerOptions, randomId } from "../lib/peer";
import { deviceName, isPhoneMessage, PHONE_TIMEOUT_MS, type PcMessage } from "../lib/protocol";
import { readStored, writeStored } from "../lib/storage";
import { PhotoReceiver } from "../lib/transfer";

const PC_ID_KEY = "2m-mereni:pc-id";
const APPROVED_KEY = "2m-mereni:approved-phones";
const MAX_APPROVED = 50;
const MAX_ID_RETRIES = 4;

const STEPS = [
  "Připoj telefon na stejnou Wi-Fi jako počítač.",
  "Naskenuj QR kód fotoaparátem telefonu.",
  "Poprvé připojení telefonu povol tady na počítači.",
  "V telefonu přidej fotky velkým tlačítkem +.",
];

type Phone = { connId: string; deviceId: string; name: string; since: Date; approved: boolean };
type Status = "starting" | "ready" | "error";
/** Live connection to one phone; `approved` is checked for every photo message. */
type PhoneLink = { conn: DataConnection; approved: boolean };

function storedPcId(): string {
  const saved = readStored(PC_ID_KEY);
  if (saved?.startsWith(PC_ID_PREFIX)) return saved;
  const fresh = randomId(PC_ID_PREFIX);
  writeStored(PC_ID_KEY, fresh);
  return fresh;
}

function approvedPhones(): string[] {
  try {
    const list: unknown = JSON.parse(readStored(APPROVED_KEY) ?? "[]");
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function rememberApproved(deviceId: string): void {
  const list = [deviceId, ...approvedPhones().filter((id) => id !== deviceId)].slice(0, MAX_APPROVED);
  writeStored(APPROVED_KEY, JSON.stringify(list));
}

/** PC side: shows the pairing QR code, approves phones and receives their photos. */
export function DeskPage() {
  const [pcId, setPcId] = useState(storedPcId);
  const [status, setStatus] = useState<Status>("starting");
  const [phones, setPhones] = useState<Phone[]>([]);
  const [photos, setPhotos] = useState<StoredPhoto[]>([]);
  const [storageError, setStorageError] = useState(false);
  const [toDelete, setToDelete] = useState<StoredPhoto | null>(null);
  const [walls, setWalls] = useState<Wall[]>([]);
  const [wallToDelete, setWallToDelete] = useState<Wall | null>(null);

  useEffect(() => {
    listWalls()
      .then(setWalls)
      .catch(() => setWalls([]));
  }, []);
  const [attempt, setAttempt] = useState(0);
  const [copied, setCopied] = useState(false);
  const retries = useRef(0);
  const conns = useRef(new Map<string, PhoneLink>());

  const reloadPhotos = useCallback(async () => {
    try {
      setPhotos(await listPhotos());
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, []);

  useEffect(() => {
    void (async () => {
      await reloadPhotos();
      // Photos received earlier (or analysed by an older version) get analysed now.
      for (const photo of await listPhotos().catch(() => [])) {
        if (needsAnalysis(photo)) await analysePhoto(photo.id).catch(() => undefined);
      }
      await reloadPhotos();
    })();
  }, [reloadPhotos]);

  useEffect(() => {
    setStatus("starting");
    const peer = new Peer(pcId, peerOptions());
    let retryTimer: number | undefined;

    peer.on("open", () => {
      retries.current = 0;
      setStatus("ready");
    });

    peer.on("connection", (conn: DataConnection) => {
      const connId = conn.connectionId;
      let silenceTimer: number | undefined;
      let dropped = false;
      let name = "Zařízení";
      const link: PhoneLink = { conn, approved: false };

      const reply = (msg: PcMessage) => {
        if (conn.open) void conn.send(msg);
      };
      const drop = () => {
        if (dropped) return;
        dropped = true;
        window.clearTimeout(silenceTimer);
        conns.current.delete(connId);
        setPhones((list) => list.filter((p) => p.connId !== connId));
        conn.close();
      };
      // A phone that closes its browser sends nothing, so rely on its regular ping.
      const heardFromPhone = () => {
        window.clearTimeout(silenceTimer);
        silenceTimer = window.setTimeout(drop, PHONE_TIMEOUT_MS);
      };
      heardFromPhone();

      const receiver = new PhotoReceiver(conn, async (photo, transferId) => {
        const id = await savePhoto({ ...photo, device: name, receivedAt: new Date() });
        await reloadPhotos();
        // Look for the target right away and tell the phone whether the photo is usable.
        void analysePhoto(id).then(async (analysis) => {
          await reloadPhotos();
          reply({ type: "photo-quality", id: transferId, quality: analysis.quality, message: analysis.message });
        });
      });
      conns.current.set(connId, link);

      conn.on("data", (data) => {
        if (!isPhoneMessage(data)) return;
        heardFromPhone();
        if (data.type === "ping") return;
        if (data.type === "hello") {
          name = deviceName(data.device);
          link.approved = approvedPhones().includes(data.deviceId);
          const phone: Phone = { connId, deviceId: data.deviceId, name, since: new Date(), approved: link.approved };
          setPhones((list) => [...list.filter((p) => p.connId !== connId), phone]);
          reply(link.approved ? { type: "welcome" } : { type: "waiting" });
          return;
        }
        // Photos are accepted only from phones the user approved on this PC.
        if (!link.approved) return;
        receiver.handle(data);
      });
      conn.on("iceStateChanged", (state) => {
        if (state === "failed" || state === "closed") drop();
      });
      conn.on("close", drop);
      conn.on("error", drop);
    });

    peer.on("disconnected", () => {
      if (!peer.destroyed) peer.reconnect();
    });

    peer.on("error", (err) => {
      if (err.type === "unavailable-id") {
        // The id from the previous page load may still be held for a moment; retry, then pick a new one.
        retries.current += 1;
        if (retries.current > MAX_ID_RETRIES) {
          retries.current = 0;
          const fresh = randomId(PC_ID_PREFIX);
          writeStored(PC_ID_KEY, fresh);
          setPcId(fresh);
        } else {
          retryTimer = window.setTimeout(() => setAttempt((n) => n + 1), 1500);
        }
        return;
      }
      if (err.type === "peer-unavailable") return; // not relevant on the PC side
      setStatus("error");
    });

    return () => {
      window.clearTimeout(retryTimer);
      conns.current.clear();
      peer.destroy();
    };
  }, [pcId, attempt, reloadPhotos]);

  const decide = (phone: Phone, allow: boolean) => {
    const link = conns.current.get(phone.connId);
    if (!link) return;
    const { conn } = link;
    if (allow) {
      rememberApproved(phone.deviceId);
      link.approved = true;
      setPhones((list) => list.map((p) => (p.connId === phone.connId ? { ...p, approved: true } : p)));
      if (conn.open) void conn.send({ type: "welcome" } satisfies PcMessage);
    } else {
      if (conn.open) void conn.send({ type: "rejected" } satisfies PcMessage);
      window.setTimeout(() => conn.close(), 300);
    }
  };

  const confirmDelete = async () => {
    const photo = toDelete;
    setToDelete(null);
    if (!photo) return;
    try {
      await deletePhoto(photo.id);
    } finally {
      await reloadPhotos();
    }
  };

  const link = senderUrl(pcId);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, [link]);

  return (
    <div className="min-h-dvh">
      <Header
        subtitle="počítač"
        actions={
          <a href="#/terce" className="rounded-xl border border-volt/60 px-4 py-2 font-semibold text-volt hover:bg-volt hover:text-navy">
            Tisk terčů
          </a>
        }
      />
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6">
        <div className="grid gap-8 md:grid-cols-[auto_1fr] md:items-start">
          <section aria-labelledby="pair-title" className="flex flex-col items-center gap-4">
            <h2 id="pair-title" className="sr-only">
              QR kód pro připojení telefonu
            </h2>
            <QrCode value={link} label="QR kód – naskenuj ho telefonem" />
            <button
              type="button"
              onClick={copyLink}
              className="rounded-xl border border-white/20 px-4 py-2 text-sm font-semibold text-mist hover:border-volt hover:text-volt"
            >
              {copied ? "Odkaz zkopírován" : "Zkopírovat odkaz"}
            </button>
          </section>

          <section className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              {status === "starting" && (
                <StatusBadge tone="wait" testId="pc-status">
                  Připravuji spojení…
                </StatusBadge>
              )}
              {status === "ready" && (
                <StatusBadge tone="ok" testId="pc-status">
                  Připraveno – čekám na telefon
                </StatusBadge>
              )}
              {status === "error" && (
                <>
                  <div className="flex flex-wrap items-center gap-3">
                    <StatusBadge tone="error" testId="pc-status">
                      Spojení se nepodařilo připravit
                    </StatusBadge>
                    <button type="button" onClick={() => setAttempt((n) => n + 1)} className="rounded-xl bg-volt px-4 py-2 font-bold text-navy">
                      Zkusit znovu
                    </button>
                  </div>
                  <p className="text-mist">Zkontroluj připojení k internetu. Bez něj se telefon s počítačem nenajde.</p>
                </>
              )}
            </div>

            <ol className="grid gap-3 text-lg sm:grid-cols-2">
              {STEPS.map((step, i) => (
                <li key={step} className="flex items-start gap-3 rounded-2xl bg-navy-light p-4">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-volt font-bold text-navy">{i + 1}</span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>

            {phoneCannotReach() && (
              <p className="rounded-2xl border border-volt/40 bg-volt/10 p-4 text-volt" role="note">
                Stránka běží na adrese „localhost“, kterou telefon neotevře. Otevři ji na počítači přes jeho adresu ve Wi-Fi síti.
              </p>
            )}

            <div>
              <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.15em] text-mist">Připojené telefony</h2>
              {phones.length === 0 ? (
                <p className="text-mist" data-testid="phones-empty">
                  Zatím žádný.
                </p>
              ) : (
                <ul className="grid gap-2" data-testid="phones">
                  {phones.map((p) => (
                    <li key={p.connId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-navy-light px-4 py-3">
                      <span>
                        <span className="font-semibold">{p.name}</span>{" "}
                        <span className="text-sm text-mist">od {p.since.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}</span>
                      </span>
                      {p.approved ? (
                        <span className="text-sm font-semibold text-emerald-300">Povoleno</span>
                      ) : (
                        <span className="flex gap-2">
                          <button type="button" onClick={() => decide(p, true)} className="rounded-xl bg-volt px-4 py-2 font-bold text-navy">
                            Povolit
                          </button>
                          <button type="button" onClick={() => decide(p, false)} className="rounded-xl border border-white/20 px-4 py-2 font-semibold">
                            Odmítnout
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>

        {walls.length > 0 && (
          <section aria-labelledby="walls-title" className="flex flex-col gap-3">
            <h2 id="walls-title" className="text-2xl font-bold tracking-wide">
              Plochy <span className="text-mist">({walls.length})</span>
            </h2>
            <ul className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-3">
              {walls.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-2 rounded-2xl bg-navy-light p-4" data-testid="wall-item">
                  <a href={`#/plocha/${w.id}`} className="min-w-0 hover:underline">
                    <span className="block truncate text-lg font-bold text-volt">{w.name}</span>
                    <span className="text-sm text-mist">{w.devices.length} zařízení</span>
                  </a>
                  <button
                    type="button"
                    onClick={() => setWallToDelete(w)}
                    className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-red-300 hover:bg-red-400/15"
                    aria-label={`Smazat plochu ${w.name}`}
                  >
                    Smazat
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="photos-title" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="photos-title" className="text-2xl font-bold tracking-wide">
              Fotky <span className="text-mist" data-testid="photo-count">({photos.length})</span>
            </h2>
            {photos.length > 0 && (
              <p className="font-semibold" data-testid="usable-summary" aria-live="polite">
                Použitelné pro měření:{" "}
                <span className={photos.some(isUsable) ? "text-emerald-300" : "text-red-300"}>
                  {photos.filter(isUsable).length} z {photos.length}
                </span>
              </p>
            )}
          </div>
          {photos.length > 0 && !photos.some(isUsable) && photos.every((p) => p.analysis) && (
            <p className="rounded-2xl border border-volt/40 bg-volt/10 p-4 text-volt" role="note">
              Zatím žádná fotka není použitelná. Na fotce musí být celý terč, ostře a co nejvíc zepředu.
            </p>
          )}
          {storageError && (
            <p className="rounded-2xl bg-red-400/15 p-4 text-red-300" role="alert">
              Prohlížeč nedovolil fotky uložit. Nepoužíváš anonymní okno?
            </p>
          )}
          <PhotoGrid photos={photos} onDelete={setToDelete} />
        </section>
      </main>

      <ConfirmDialog
        open={toDelete !== null}
        title="Smazat fotku?"
        confirmLabel="Smazat"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      >
        Fotka „{toDelete?.name}“ se z tohoto počítače nenávratně smaže.
        {toDelete && walls.some((w) => w.photoId === toDelete.id) && " Plochy z ní zůstanou, jen bez fotky na pozadí."}
      </ConfirmDialog>
      <ConfirmDialog
        open={wallToDelete !== null}
        title="Smazat plochu?"
        confirmLabel="Smazat"
        onConfirm={() => {
          const w = wallToDelete;
          setWallToDelete(null);
          if (!w) return;
          void deleteWall(w.id).then(() => setWalls((list) => list.filter((x) => x.id !== w.id)));
        }}
        onCancel={() => setWallToDelete(null)}
      >
        Plocha „{wallToDelete?.name}“ i s rozmístěnými zařízeními se smaže. Fotka zůstane.
      </ConfirmDialog>
    </div>
  );
}
