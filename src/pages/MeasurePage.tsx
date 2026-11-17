import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Header } from "../components/Header";
import { planeHomography } from "../lib/analysis";
import { getPhoto, saveDimensions, type Dimension, type StoredPhoto } from "../lib/db";
import { applyHomography, distance, type Homography, type Point } from "../lib/homography";
import { randomId } from "../lib/peer";

const ZOOMS = [1, 2, 4] as const;

export function formatMm(mm: number): string {
  return `${Math.round(mm).toLocaleString("cs-CZ")} mm`;
}

function lengthMm(h: Homography, d: Pick<Dimension, "a" | "b">): number {
  return distance(applyHomography(h, d.a), applyHomography(h, d.b));
}

/** Photo with the detected target; the user clicks two points to add a dimension in millimetres. */
export function MeasurePage({ photoId }: { photoId: number }) {
  const [photo, setPhoto] = useState<StoredPhoto | null | undefined>(undefined);
  const [url, setUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<Dimension[]>([]);
  const [start, setStart] = useState<Point | null>(null);
  const [hover, setHover] = useState<Point | null>(null);
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]>(1);
  const [toDelete, setToDelete] = useState<Dimension | "all" | null>(null);
  const [unit, setUnit] = useState(1); // photo pixels per screen pixel
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    getPhoto(photoId)
      .then((p) => {
        setPhoto(p ?? null);
        setDims(p?.dims ?? []);
        if (p) {
          objectUrl = URL.createObjectURL(p.blob);
          setUrl(objectUrl);
        }
      })
      .catch(() => setPhoto(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);

  // Keep lines and labels the same size on screen whatever the photo resolution and zoom.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !photo) return;
    const update = () => setUnit(photo.width / Math.max(1, svg.clientWidth));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(svg);
    return () => observer.disconnect();
  }, [photo, url]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setStart(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const homography = useMemo(() => (photo?.analysis ? planeHomography(photo.analysis) : null), [photo]);
  const marker = photo?.analysis?.markers.find((m) => m.id === photo.analysis?.primaryId);

  const persist = useCallback(
    (next: Dimension[]) => {
      setDims(next);
      if (photo) void saveDimensions(photo.id, next);
    },
    [photo],
  );

  const toPhoto = (e: MouseEvent<SVGSVGElement>): Point | null => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const onClick = (e: MouseEvent<SVGSVGElement>) => {
    const p = toPhoto(e);
    if (!p || !homography) return;
    if (!start) {
      setStart(p);
      return;
    }
    if (distance(start, p) < 2 * unit) return; // same spot clicked twice
    persist([...dims, { id: randomId("kota-"), a: start, b: p }]);
    setStart(null);
  };

  const confirmDelete = () => {
    if (toDelete === "all") persist([]);
    else if (toDelete) persist(dims.filter((d) => d.id !== toDelete.id));
    setToDelete(null);
  };

  const back = (
    <a href="#/" className="rounded-xl border border-volt/60 px-4 py-2 font-semibold text-volt hover:bg-volt hover:text-navy">
      ← Fotky
    </a>
  );

  if (photo === undefined) {
    return (
      <div className="min-h-dvh">
        <Header subtitle="měření" actions={back} />
        <p className="p-8 text-mist">Načítám fotku…</p>
      </div>
    );
  }
  if (photo === null || !homography || !marker) {
    return (
      <div className="min-h-dvh">
        <Header subtitle="měření" actions={back} />
        <p className="p-8 text-lg text-red-300" role="alert" data-testid="measure-error">
          {photo === null ? "Fotka nenalezena. Možná byla smazána." : "Na této fotce není terč, proto na ní nejde měřit."}
        </p>
      </div>
    );
  }

  const quality = photo.analysis!.quality;
  const stroke = 2.5 * unit;
  const font = 16 * unit;

  return (
    <div className="min-h-dvh">
      <Header subtitle="měření" actions={back} />
      <main className="mx-auto grid max-w-[110rem] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_20rem]">
        <section className="flex min-w-0 flex-col gap-3" aria-label="Fotka k měření">
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 font-semibold text-mist">Zvětšení:</span>
            {ZOOMS.map((z) => (
              <button
                key={z}
                type="button"
                onClick={() => setZoom(z)}
                aria-pressed={zoom === z}
                className={`rounded-xl px-4 py-2 font-bold ${zoom === z ? "bg-volt text-navy" : "border border-white/20"}`}
              >
                {z}×
              </button>
            ))}
            <p className="ml-auto text-mist" aria-live="polite" data-testid="measure-hint">
              {start ? "Klikni na druhý bod (Esc = zrušit)" : "Klikni na první bod kóty"}
            </p>
          </div>

          <div className="max-h-[78vh] overflow-auto rounded-2xl bg-navy-dark">
            <div className="relative" style={{ width: `${zoom * 100}%` }}>
              {url && <img src={url} alt={`Fotka ${photo.name}`} className="block h-auto w-full select-none" draggable={false} />}
              <svg
                ref={svgRef}
                viewBox={`0 0 ${photo.width} ${photo.height}`}
                preserveAspectRatio="none"
                className="absolute inset-0 size-full cursor-crosshair"
                onClick={onClick}
                onMouseMove={(e) => setHover(toPhoto(e))}
                onMouseLeave={() => setHover(null)}
                data-testid="measure-svg"
                data-photo-width={photo.width}
                role="presentation"
              >
                <polygon
                  points={marker.corners.map((c) => `${c.x},${c.y}`).join(" ")}
                  fill="rgb(52 211 153 / 0.15)"
                  stroke="#34d399"
                  strokeWidth={stroke}
                />
                <text
                  x={marker.corners[0].x}
                  y={marker.corners[0].y - 8 * unit}
                  fontSize={font}
                  fontWeight={700}
                  fill="#34d399"
                  stroke="#121c2d"
                  strokeWidth={3 * unit}
                  paintOrder="stroke"
                >
                  Terč č. {marker.id}
                </text>

                {dims.map((d, i) => {
                  const mm = lengthMm(homography, d);
                  const mid = { x: (d.a.x + d.b.x) / 2, y: (d.a.y + d.b.y) / 2 };
                  return (
                    <g key={d.id}>
                      <line x1={d.a.x} y1={d.a.y} x2={d.b.x} y2={d.b.y} stroke="#fab60a" strokeWidth={stroke} />
                      {[d.a, d.b].map((p, k) => (
                        <circle key={k} cx={p.x} cy={p.y} r={5 * unit} fill="#fab60a" stroke="#121c2d" strokeWidth={1.5 * unit} />
                      ))}
                      <text
                        x={mid.x}
                        y={mid.y - 8 * unit}
                        fontSize={font * 1.15}
                        fontWeight={700}
                        textAnchor="middle"
                        fill="#ffffff"
                        stroke="#121c2d"
                        strokeWidth={3.5 * unit}
                        paintOrder="stroke"
                        data-testid="dim-label"
                        data-mm={mm.toFixed(2)}
                      >
                        {i + 1}: {formatMm(mm)}
                      </text>
                    </g>
                  );
                })}

                {start && (
                  <g pointerEvents="none">
                    {hover && <line x1={start.x} y1={start.y} x2={hover.x} y2={hover.y} stroke="#fab60a" strokeWidth={stroke} strokeDasharray={`${8 * unit} ${6 * unit}`} />}
                    <circle cx={start.x} cy={start.y} r={6 * unit} fill="#fab60a" />
                    {hover && (
                      <text x={hover.x + 12 * unit} y={hover.y - 12 * unit} fontSize={font} fontWeight={700} fill="#fab60a" stroke="#121c2d" strokeWidth={3 * unit} paintOrder="stroke">
                        {formatMm(lengthMm(homography, { a: start, b: hover }))}
                      </text>
                    )}
                  </g>
                )}
              </svg>
            </div>
          </div>
        </section>

        <aside className="flex flex-col gap-4">
          {quality !== "ok" && (
            <p className="rounded-2xl border border-volt/40 bg-volt/10 p-4 text-volt" role="note">
              {photo.analysis!.message}. Kóty mohou být nepřesné.
            </p>
          )}
          <div className="rounded-2xl bg-navy-light p-4 text-mist">
            <p>Klikni na začátek a konec rozměru. Kóta se spočítá podle terče.</p>
            <p className="mt-2">
              <strong className="text-white">Měř jen body na stejné ploše jako terč</strong> (např. na zdi, kde terč visí). Body mimo tuto plochu
              vyjdou špatně.
            </p>
          </div>

          <div>
            <h2 className="mb-2 text-xl font-bold">Kóty ({dims.length})</h2>
            {dims.length === 0 ? (
              <p className="text-mist">Zatím žádné.</p>
            ) : (
              <ol className="grid gap-2" data-testid="dim-list">
                {dims.map((d, i) => (
                  <li key={d.id} className="flex items-center justify-between gap-2 rounded-xl bg-navy-light px-4 py-2" data-testid="dim-item">
                    <span className="font-semibold">
                      {i + 1}: {formatMm(lengthMm(homography, d))}
                    </span>
                    <button
                      type="button"
                      onClick={() => setToDelete(d)}
                      className="rounded-lg px-2 py-1 text-sm font-semibold text-red-300 hover:bg-red-400/15"
                      aria-label={`Smazat kótu ${i + 1}`}
                    >
                      Smazat
                    </button>
                  </li>
                ))}
              </ol>
            )}
            {dims.length > 1 && (
              <button type="button" onClick={() => setToDelete("all")} className="mt-3 text-sm font-semibold text-red-300 hover:underline">
                Smazat všechny kóty
              </button>
            )}
          </div>
        </aside>
      </main>

      <ConfirmDialog
        open={toDelete !== null}
        title={toDelete === "all" ? "Smazat všechny kóty?" : "Smazat kótu?"}
        confirmLabel="Smazat"
        onConfirm={confirmDelete}
        onCancel={() => setToDelete(null)}
      >
        {toDelete === "all" ? `Smaže se všech ${dims.length} kót na této fotce.` : "Kóta se z fotky smaže."}
      </ConfirmDialog>
    </div>
  );
}
