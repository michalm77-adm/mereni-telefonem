import { useCallback, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import Peer, { type DataConnection } from "peerjs";
import { Header } from "../components/Header";
import { StatusBadge } from "../components/StatusBadge";
import { ImageError, preparePhoto } from "../lib/image";
import { PHONE_ID_PREFIX, peerOptions, randomId } from "../lib/peer";
import { isPcMessage, PING_INTERVAL_MS, type PcMessage, type PhoneMessage, type Quality } from "../lib/protocol";
import { readStored, writeStored } from "../lib/storage";
import { sendPhoto } from "../lib/transfer";

const CONNECT_TIMEOUT_MS = 15000;
const ACK_TIMEOUT_MS = 60000;
const DEVICE_ID_KEY = "2m-mereni:device-id";

type Status = "connecting" | "waiting" | "connected" | "rejected" | "not-found" | "lost" | "error";
type ItemState = "queued" | "preparing" | "sending" | "checking" | "done" | "failed";
type Item = { id: string; file: File; state: ItemState; progress: number; error?: string; quality?: Quality; qualityText?: string };
type Ack = Extract<PcMessage, { type: "photo-ack" }>;

/** Stable id of this phone, so the PC remembers it was approved. */
function deviceId(): string {
  const saved = readStored(DEVICE_ID_KEY);
  if (saved?.startsWith("tel-")) return saved;
  const fresh = randomId("tel-");
  writeStored(DEVICE_ID_KEY, fresh);
  return fresh;
}

const STATE_LABEL: Record<ItemState, string> = {
  queued: "Čeká na odeslání",
  preparing: "Připravuji…",
  sending: "Odesílám",
  checking: "Počítač kontroluje…",
  done: "Přijato",
  failed: "Neodesláno",
};

/** Phone side: opened from the QR code, connects to the PC and sends photos. */
export function SendPage({ pcId }: { pcId: string | null }) {
  const [status, setStatus] = useState<Status>("connecting");
  const [attempt, setAttempt] = useState(0);
  const [items, setItems] = useState<Item[]>([]);
  const itemsRef = useRef<Item[]>([]);
  const connRef = useRef<DataConnection | null>(null);
  const acks = useRef(new Map<string, (ack: Ack) => void>());
  const busy = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const patch = useCallback((id: string, change: Partial<Item>) => {
    itemsRef.current = itemsRef.current.map((it) => (it.id === id ? { ...it, ...change } : it));
    setItems(itemsRef.current);
  }, []);

  const processQueue = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      for (;;) {
        const conn = connRef.current;
        const next = itemsRef.current.find((it) => it.state === "queued");
        if (!conn?.open || !next) return;
        try {
          patch(next.id, { state: "preparing", progress: 0, error: undefined });
          const photo = await preparePhoto(next.file);
          patch(next.id, { state: "sending" });
          let shown = 0;
          const ack = new Promise<Ack>((resolve, reject) => {
            const timer = window.setTimeout(() => reject(new Error("timeout")), ACK_TIMEOUT_MS);
            acks.current.set(next.id, (msg) => {
              window.clearTimeout(timer);
              resolve(msg);
            });
          });
          await sendPhoto(conn, { id: next.id, ...photo }, (fraction) => {
            const pct = Math.floor(fraction * 100);
            if (pct !== shown) {
              shown = pct;
              patch(next.id, { progress: pct });
            }
          });
          patch(next.id, { state: "checking", progress: 100 });
          const result = await ack;
          if (result.ok) patch(next.id, { state: "done" });
          else patch(next.id, { state: "failed", error: `Počítač fotku odmítl: ${result.reason}` });
        } catch (err) {
          const error = err instanceof ImageError ? err.message : "Spojení se přerušilo. Zkus fotku poslat znovu.";
          patch(next.id, { state: "failed", error });
        } finally {
          acks.current.delete(next.id);
        }
      }
    } finally {
      busy.current = false;
    }
  }, [patch]);

  useEffect(() => {
    if (!pcId) return;
    setStatus("connecting");
    const peer = new Peer(randomId(PHONE_ID_PREFIX), peerOptions());
    let answered = false;
    let pingTimer: number | undefined;
    const timeout = window.setTimeout(() => {
      if (!answered) setStatus("not-found");
    }, CONNECT_TIMEOUT_MS);

    peer.on("open", () => {
      const conn = peer.connect(pcId, { reliable: true });
      conn.on("open", () => {
        void conn.send({ type: "hello", device: navigator.userAgent.slice(0, 60), deviceId: deviceId() } satisfies PhoneMessage);
        pingTimer = window.setInterval(() => void conn.send({ type: "ping" } satisfies PhoneMessage), PING_INTERVAL_MS);
      });
      conn.on("data", (data) => {
        if (!isPcMessage(data)) return;
        if (data.type === "photo-ack") {
          acks.current.get(data.id)?.(data);
          return;
        }
        if (data.type === "photo-quality") {
          patch(data.id, { quality: data.quality, qualityText: data.message });
          return;
        }
        answered = true;
        window.clearTimeout(timeout);
        if (data.type === "waiting") setStatus("waiting");
        if (data.type === "rejected") setStatus("rejected");
        if (data.type === "welcome") {
          connRef.current = conn;
          setStatus("connected");
          void processQueue();
        }
      });
      conn.on("close", () => {
        connRef.current = null;
        setStatus((s) => (s === "rejected" ? s : answered ? "lost" : s));
      });
    });

    peer.on("error", (err) => {
      window.clearTimeout(timeout);
      if (err.type === "peer-unavailable") setStatus("not-found");
      else setStatus(answered ? "lost" : "error");
    });

    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(pingTimer);
      connRef.current = null;
      peer.destroy();
    };
  }, [pcId, attempt, processQueue, patch]);

  const addFiles = (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;
    const added = files.map((file): Item => ({ id: randomId("foto-"), file, state: "queued", progress: 0 }));
    itemsRef.current = [...itemsRef.current, ...added];
    setItems(itemsRef.current);
    void processQueue();
  };

  const resendFailed = () => {
    itemsRef.current = itemsRef.current.map((it) => (it.state === "failed" ? { ...it, state: "queued", error: undefined } : it));
    setItems(itemsRef.current);
    void processQueue();
  };

  if (!pcId) {
    return (
      <Shell>
        <StatusBadge tone="error" testId="phone-status">
          Neplatný odkaz
        </StatusBadge>
        <p className="text-lg text-mist">Naskenuj QR kód znovu z obrazovky počítače.</p>
      </Shell>
    );
  }

  const retry = (
    <button type="button" onClick={() => setAttempt((n) => n + 1)} className="w-full rounded-2xl bg-volt px-6 py-4 text-xl font-bold text-navy">
      Zkusit znovu
    </button>
  );
  const done = items.filter((it) => it.state === "done").length;
  const failed = items.filter((it) => it.state === "failed").length;
  const usable = items.filter((it) => it.quality === "ok").length;
  const canAdd = status === "connected";

  return (
    <Shell>
      {status === "connecting" && (
        <StatusBadge tone="wait" testId="phone-status">
          Připojuji se k počítači…
        </StatusBadge>
      )}
      {status === "waiting" && (
        <>
          <StatusBadge tone="wait" testId="phone-status">
            Povol telefon na počítači
          </StatusBadge>
          <p className="text-lg text-mist">Na obrazovce počítače klikni u tohoto telefonu na „Povolit“.</p>
        </>
      )}
      {status === "connected" && (
        <StatusBadge tone="ok" testId="phone-status">
          Spojeno s počítačem
        </StatusBadge>
      )}
      {status === "rejected" && (
        <StatusBadge tone="error" testId="phone-status">
          Počítač připojení odmítl
        </StatusBadge>
      )}
      {status === "not-found" && (
        <>
          <StatusBadge tone="error" testId="phone-status">
            Počítač se nepodařilo najít
          </StatusBadge>
          <p className="text-lg text-mist">Je stránka na počítači otevřená a jste oba na stejné Wi-Fi?</p>
          {retry}
        </>
      )}
      {status === "lost" && (
        <>
          <StatusBadge tone="error" testId="phone-status">
            Spojení s počítačem se přerušilo
          </StatusBadge>
          {retry}
        </>
      )}
      {status === "error" && (
        <>
          <StatusBadge tone="error" testId="phone-status">
            Nepodařilo se připojit
          </StatusBadge>
          <p className="text-lg text-mist">Zkontroluj připojení k internetu a zkus to znovu.</p>
          {retry}
        </>
      )}

      <input ref={inputRef} type="file" accept="image/*" multiple className="sr-only" tabIndex={-1} onChange={addFiles} data-testid="photo-input" />
      <button
        type="button"
        disabled={!canAdd}
        onClick={() => inputRef.current?.click()}
        className="mt-2 grid aspect-square w-full max-w-64 place-items-center self-center rounded-[2rem] bg-volt text-navy shadow-2xl active:scale-95 disabled:opacity-40"
        data-testid="add-photos"
      >
        <span className="text-9xl font-bold leading-none" aria-hidden="true">
          +
        </span>
        <span className="sr-only">Přidat fotky</span>
      </button>
      <p className="text-center text-mist">{canAdd ? "Klepni na + a vyber fotky z galerie nebo vyfoť nové." : "Fotky půjde přidat po spojení s počítačem."}</p>

      {items.length > 0 && (
        <section aria-labelledby="sent-title" className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 id="sent-title" className="text-lg font-bold">
              Odeslané fotky
            </h2>
            <p className="font-semibold text-mist" data-testid="sent-summary" aria-live="polite">
              Přijato {done} z {items.length}
            </p>
          </div>
          {done > 0 && (
            <p
              className={`rounded-xl px-4 py-3 font-semibold ${usable > 0 ? "bg-emerald-400/15 text-emerald-300" : "bg-volt/10 text-volt"}`}
              data-testid="usable-summary"
              aria-live="polite"
            >
              {usable > 0
                ? `Použitelné pro měření: ${usable} z ${done}`
                : items.some((it) => it.state === "done" && !it.quality)
                  ? "Počítač kontroluje fotky…"
                  : "Zatím žádná použitelná fotka – vyfoť terč celý a víc zepředu."}
            </p>
          )}
          <ul className="grid gap-2">
            {items.map((it) => (
              <li key={it.id} className="rounded-xl bg-navy-light px-4 py-3" data-testid="sent-item" data-state={it.state}>
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">{it.file.name}</span>
                  <span
                    className={`shrink-0 text-sm font-semibold ${it.state === "done" ? "text-emerald-300" : it.state === "failed" ? "text-red-300" : "text-mist"}`}
                  >
                    {it.state === "done" && "✓ "}
                    {STATE_LABEL[it.state]}
                    {it.state === "sending" && ` ${it.progress} %`}
                  </span>
                </div>
                {it.state === "sending" && (
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={it.progress} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full bg-volt transition-[width]" style={{ width: `${it.progress}%` }} />
                  </div>
                )}
                {it.error && <p className="mt-1 text-sm text-red-300">{it.error}</p>}
                {it.state === "done" && (
                  <p
                    className={`mt-1 text-sm ${it.quality === "ok" ? "text-emerald-300" : it.quality ? "text-volt" : "animate-pulse text-mist"}`}
                    data-testid="sent-quality"
                    data-quality={it.quality ?? "pending"}
                  >
                    {it.qualityText ?? "Počítač hledá terč…"}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {failed > 0 && canAdd && (
            <button type="button" onClick={resendFailed} className="rounded-2xl border border-volt px-6 py-3 text-lg font-bold text-volt">
              Odeslat nepřijaté znovu ({failed})
            </button>
          )}
        </section>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Header subtitle="telefon" />
      <main className="mx-auto flex max-w-md flex-col gap-4 px-4 py-6">{children}</main>
    </div>
  );
}
