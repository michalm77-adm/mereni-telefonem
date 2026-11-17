import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Header } from "../components/Header";
import { deleteWall, getPhoto, getWall, updateWall, type Device, type Wall } from "../lib/db";
import type { Point } from "../lib/homography";
import { bounds, deviceDimensions, deviceProblem, PRESETS, type DimensionLine } from "../lib/layout";
import { randomId } from "../lib/peer";
import { formatMm } from "./MeasurePage";

const MIN_SIZE_MM = 10;
const MAX_SIZE_MM = 20000;
const SNAP_MM = 10;

type DragState = { id: string; pointerId: number; start: Point; origin: Point };

function parseMm(text: string): number | null {
  const v = Number(text.replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(v) ? v : null;
}

/** Front view of one wall (straightened with the target) where devices are placed and dimensioned. */
export function WallPage({ wallId }: { wallId: number }) {
  const [wall, setWall] = useState<Wall | null | undefined>(undefined);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoSize, setPhotoSize] = useState<{ w: number; h: number } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [snap, setSnap] = useState(true);
  const [width, setWidth] = useState(800);
  const [toDelete, setToDelete] = useState<Device | "wall" | null>(null);
  const [custom, setCustom] = useState({ name: "", w: "", h: "" });
  const [customError, setCustomError] = useState<string | null>(null);
  const drag = useRef<DragState | null>(null);
  const holderRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    getWall(wallId)
      .then(async (w) => {
        setWall(w ?? null);
        if (!w) return;
        const photo = await getPhoto(w.photoId);
        if (photo) {
          objectUrl = URL.createObjectURL(photo.blob);
          setPhotoUrl(objectUrl);
          setPhotoSize({ w: photo.width, h: photo.height });
        }
      })
      .catch(() => setWall(null));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [wallId]);

  useEffect(() => {
    const el = holderRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [wall]);

  const save = useCallback(
    (changes: Partial<Pick<Wall, "name" | "devices">>) => {
      setWall((w) => (w ? { ...w, ...changes } : w));
      void updateWall(wallId, changes);
    },
    [wallId],
  );

  const box = useMemo(() => (wall ? bounds(wall.outline) : null), [wall]);

  if (wall === undefined) return <Shell>Načítám plochu…</Shell>;
  if (wall === null || !box) {
    return (
      <Shell>
        <span className="text-red-300" role="alert" data-testid="wall-error">
          Plocha nenalezena. Možná byla smazána.
        </span>
      </Shell>
    );
  }

  const wallW = box.maxX - box.minX;
  const wallH = box.maxY - box.minY;
  const margin = Math.max(80, 0.14 * Math.max(wallW, wallH));
  const view = { x: box.minX - margin, y: box.minY - margin, w: wallW + 2 * margin, h: wallH + 2 * margin };
  const maxHeight = Math.max(300, window.innerHeight * 0.75);
  const scale = Math.min(width / view.w, maxHeight / view.h); // screen px per mm
  const screenW = view.w * scale;
  const screenH = view.h * scale;
  const u = 1 / scale; // mm per screen px
  const toScreen = (p: Point) => ({ x: (p.x - view.x) * scale, y: (p.y - view.y) * scale });

  // Photo → screen: (mm → screen) · (photo px → mm), applied to the photo with a CSS 3D matrix.
  const hm = wall.homography;
  const g = [
    scale * hm[0] - view.x * scale * hm[6],
    scale * hm[1] - view.x * scale * hm[7],
    scale * hm[2] - view.x * scale * hm[8],
    scale * hm[3] - view.y * scale * hm[6],
    scale * hm[4] - view.y * scale * hm[7],
    scale * hm[5] - view.y * scale * hm[8],
    hm[6],
    hm[7],
    hm[8],
  ].map((v, _, arr) => v / arr[8]);
  const matrix = `matrix3d(${g[0]},${g[3]},0,${g[6]},${g[1]},${g[4]},0,${g[7]},0,0,1,0,${g[2]},${g[5]},0,${g[8]})`;
  const clip = `polygon(${wall.outline.map((p) => `${toScreen(p).x}px ${toScreen(p).y}px`).join(",")})`;

  const selected = wall.devices.find((d) => d.id === selectedId) ?? null;
  const dims: DimensionLine[] = selected ? deviceDimensions(selected, wall) : [];

  const setDevices = (devices: Device[]) => save({ devices });
  const patchDevice = (id: string, change: Partial<Device>) => setDevices(wall.devices.map((d) => (d.id === id ? { ...d, ...change } : d)));
  const round = (v: number) => (snap ? Math.round(v / SNAP_MM) * SNAP_MM : Math.round(v));
  // Snap horizontally from the left edge of the wall and vertically from the floor (how installers measure).
  const snapX = (x: number) => box.minX + round(x - box.minX);
  const snapY = (y: number, h: number) => box.maxY - h - round(box.maxY - h - y);

  const addDevice = (name: string, w: number, h: number) => {
    const offset = (wall.devices.length % 5) * 40;
    const d: Device = {
      id: randomId("zar-"),
      name,
      w,
      h,
      x: Math.round(box.minX + wallW / 2 - w / 2 + offset),
      y: Math.round(box.minY + wallH / 2 - h / 2 + offset),
    };
    setDevices([...wall.devices, d]);
    setSelectedId(d.id);
  };

  const addCustom = () => {
    const w = parseMm(custom.w);
    const h = parseMm(custom.h);
    const name = custom.name.trim().slice(0, 60);
    if (!name) return setCustomError("Zadej název zařízení.");
    if (w === null || h === null || w < MIN_SIZE_MM || h < MIN_SIZE_MM || w > MAX_SIZE_MM || h > MAX_SIZE_MM) {
      return setCustomError(`Šířka a výška musí být čísla od ${MIN_SIZE_MM} do ${MAX_SIZE_MM} mm.`);
    }
    setCustomError(null);
    addDevice(name, Math.round(w), Math.round(h));
    setCustom({ name: "", w: "", h: "" });
  };

  const toMm = (e: PointerEvent): Point | null => {
    const ctm = svgRef.current?.getScreenCTM();
    if (!ctm) return null;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const onDevicePointerDown = (e: PointerEvent<SVGGElement>, d: Device) => {
    const p = toMm(e);
    if (!p) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setSelectedId(d.id);
    drag.current = { id: d.id, pointerId: e.pointerId, start: p, origin: { x: d.x, y: d.y } };
  };

  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    const state = drag.current;
    if (!state || state.pointerId !== e.pointerId) return;
    const p = toMm(e);
    if (!p) return;
    const dragged = wall.devices.find((d) => d.id === state.id);
    if (!dragged) return;
    const x = snapX(state.origin.x + p.x - state.start.x);
    const y = snapY(state.origin.y + p.y - state.start.y, dragged.h);
    setWall((w) => (w ? { ...w, devices: w.devices.map((d) => (d.id === state.id ? { ...d, x, y } : d)) } : w));
  };

  const onPointerUp = () => {
    if (!drag.current) return;
    drag.current = null;
    setWall((w) => {
      if (w) void updateWall(wallId, { devices: w.devices });
      return w;
    });
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (!selected) return;
    const step = e.shiftKey ? 1 : SNAP_MM;
    const moves: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    const move = moves[e.key];
    if (move) {
      e.preventDefault();
      patchDevice(selected.id, { x: selected.x + move.x, y: selected.y + move.y });
    } else if (e.key === "Delete") {
      e.preventDefault();
      setToDelete(selected);
    } else if (e.key === "Escape") {
      setSelectedId(null);
    }
  };

  const confirmDelete = async () => {
    const target = toDelete;
    setToDelete(null);
    if (target === "wall") {
      await deleteWall(wall.id);
      window.location.hash = "#/";
    } else if (target) {
      setDevices(wall.devices.filter((d) => d.id !== target.id));
      setSelectedId(null);
    }
  };

  const floorY = box.maxY;
  const field = "w-full rounded-xl border border-white/20 bg-navy-dark px-3 py-2 text-lg";

  return (
    <div className="min-h-dvh">
      <Header
        subtitle="rozmístění"
        actions={
          <>
            <a href={`#/foto/${wall.photoId}`} className="rounded-xl border border-white/20 px-4 py-2 font-semibold text-mist hover:text-white">
              Fotka
            </a>
            <a href="#/" className="rounded-xl border border-volt/60 px-4 py-2 font-semibold text-volt hover:bg-volt hover:text-navy">
              ← Fotky
            </a>
          </>
        }
      />
      <main className="mx-auto grid max-w-[110rem] gap-6 px-4 py-6 sm:px-6 lg:grid-cols-[1fr_22rem]">
        <section className="flex min-w-0 flex-col gap-3" aria-label="Plocha">
          <div className="flex flex-wrap items-center gap-4">
            <h2 className="text-2xl font-bold tracking-wide">{wall.name}</h2>
            <p className="font-semibold text-mist" data-testid="wall-size" data-w={wallW.toFixed(1)} data-h={wallH.toFixed(1)}>
              {formatMm(wallW).replace(" mm", "")} × {formatMm(wallH)}
            </p>
            <label className="ml-auto flex items-center gap-2 text-mist">
              <input type="checkbox" checked={snap} onChange={(e) => setSnap(e.target.checked)} className="size-5 accent-volt" />
              Přichytávat po {SNAP_MM} mm
            </label>
          </div>

          <div ref={holderRef} className="w-full">
            <div
              className="relative overflow-hidden rounded-2xl bg-navy-dark outline-none"
              style={{ width: screenW, height: screenH }}
              tabIndex={0}
              onKeyDown={onKeyDown}
              aria-label="Plocha se zařízeními. Šipky posunou vybrané zařízení o 10 mm, se Shiftem o 1 mm. Delete smaže."
              data-testid="wall-canvas"
            >
              {photoUrl && photoSize && (
                <>
                  <img
                    src={photoUrl}
                    alt=""
                    className="pointer-events-none absolute top-0 left-0 max-w-none opacity-25 select-none"
                    style={{ width: photoSize.w, height: photoSize.h, transform: matrix, transformOrigin: "0 0" }}
                  />
                  <div className="pointer-events-none absolute inset-0" style={{ clipPath: clip }}>
                    <img
                      src={photoUrl}
                      alt={`Narovnaná fotka plochy ${wall.name}`}
                      className="absolute top-0 left-0 max-w-none select-none"
                      style={{ width: photoSize.w, height: photoSize.h, transform: matrix, transformOrigin: "0 0" }}
                    />
                  </div>
                </>
              )}
              <svg
                ref={svgRef}
                className="absolute inset-0 touch-none"
                width={screenW}
                height={screenH}
                viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onPointerDown={(e) => {
                  if (e.target === e.currentTarget) setSelectedId(null);
                }}
                data-testid="wall-svg"
                data-scale={scale}
                data-view-x={view.x}
                data-view-y={view.y}
              >
                <polygon points={wall.outline.map((p) => `${p.x},${p.y}`).join(" ")} fill={photoUrl ? "none" : "rgb(203 215 230 / 0.08)"} stroke="#fab60a" strokeWidth={2.5 * u} />

                {/* Overall size of the wall */}
                <DimLine from={{ x: box.minX, y: box.minY - 28 * u }} to={{ x: box.maxX, y: box.minY - 28 * u }} mm={wallW} u={u} color="#cbd7e6" />
                <DimLine from={{ x: box.minX - 28 * u, y: box.maxY }} to={{ x: box.minX - 28 * u, y: box.minY }} mm={wallH} u={u} color="#cbd7e6" />

                {wall.devices.map((d) => {
                  const problem = deviceProblem(d, wall);
                  const isSel = d.id === selectedId;
                  return (
                    <g
                      key={d.id}
                      onPointerDown={(e) => onDevicePointerDown(e, d)}
                      onFocus={() => setSelectedId(d.id)}
                      tabIndex={0}
                      role="button"
                      aria-label={`${d.name}, ${d.w} × ${d.h} mm`}
                      aria-pressed={isSel}
                      className="cursor-move outline-none"
                      data-testid="device"
                      data-name={d.name}
                      data-problem={problem ?? ""}
                    >
                      <rect
                        x={d.x}
                        y={d.y}
                        width={d.w}
                        height={d.h}
                        rx={Math.min(d.w, d.h) * 0.06}
                        fill={problem ? "rgb(248 113 113 / 0.55)" : "rgb(250 182 10 / 0.8)"}
                        stroke={isSel ? "#ffffff" : problem ? "#f87171" : "#1a273d"}
                        strokeWidth={(isSel ? 3 : 1.5) * u}
                      />
                      <text
                        x={d.x + d.w / 2}
                        y={d.y + d.h / 2}
                        fontSize={Math.min(14 * u, d.h * 0.4)}
                        fontWeight={700}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill="#1a273d"
                        pointerEvents="none"
                      >
                        {d.name}
                      </text>
                    </g>
                  );
                })}

                {dims.map((dim) => (
                  <DimLine key={dim.side} from={dim.from} to={dim.to} mm={dim.mm} u={u} color={dim.to_ === "device" ? "#7dd3fc" : "#ffffff"} side={dim.side} />
                ))}
              </svg>
            </div>
          </div>
          <p className="text-mist">
            Zařízení posouvej myší, nebo ho vyber a posouvej šipkami (10 mm, se Shiftem 1 mm). Bílé kóty vedou k okraji plochy, modré k sousednímu zařízení.
            Červené zařízení přesahuje plochu nebo se překrývá s jiným.
          </p>
        </section>

        <aside className="flex flex-col gap-5">
          <label className="flex flex-col gap-1 font-semibold">
            Název plochy
            <input className={field} value={wall.name} maxLength={80} onChange={(e) => save({ name: e.target.value })} data-testid="wall-name" />
          </label>

          <div>
            <h3 className="mb-2 text-lg font-bold">Přidat zařízení</h3>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => addDevice(p.name, p.w, p.h)}
                  className="rounded-xl bg-navy-light px-3 py-2 text-left hover:bg-volt hover:text-navy"
                >
                  <span className="block font-bold">{p.name}</span>
                  <span className="text-sm opacity-75">
                    {p.w} × {p.h} mm
                  </span>
                </button>
              ))}
            </div>
            <form
              className="mt-3 grid grid-cols-[1fr_5rem_5rem] items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                addCustom();
              }}
            >
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Vlastní
                <input className={field} placeholder="Název" value={custom.name} onChange={(e) => setCustom({ ...custom, name: e.target.value })} data-testid="custom-name" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Šířka
                <input className={field} inputMode="numeric" placeholder="mm" value={custom.w} onChange={(e) => setCustom({ ...custom, w: e.target.value })} data-testid="custom-w" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Výška
                <input className={field} inputMode="numeric" placeholder="mm" value={custom.h} onChange={(e) => setCustom({ ...custom, h: e.target.value })} data-testid="custom-h" />
              </label>
              <button type="submit" className="col-span-3 rounded-xl border border-volt px-4 py-2 font-bold text-volt hover:bg-volt hover:text-navy">
                Přidat vlastní
              </button>
            </form>
            {customError && (
              <p className="mt-2 text-red-300" role="alert">
                {customError}
              </p>
            )}
          </div>

          {selected && (
            <div className="rounded-2xl bg-navy-light p-4" data-testid="device-editor">
              <h3 className="mb-3 text-lg font-bold">Vybrané: {selected.name}</h3>
              <div className="grid grid-cols-2 gap-3">
                <NumberField label="Šířka (mm)" value={selected.w} min={MIN_SIZE_MM} max={MAX_SIZE_MM} onCommit={(w) => patchDevice(selected.id, { w })} testId="edit-w" />
                <NumberField label="Výška (mm)" value={selected.h} min={MIN_SIZE_MM} max={MAX_SIZE_MM} onCommit={(h) => patchDevice(selected.id, { h })} testId="edit-h" />
                <NumberField
                  label="Od levého kraje"
                  value={selected.x - box.minX}
                  min={-MAX_SIZE_MM}
                  max={MAX_SIZE_MM}
                  onCommit={(v) => patchDevice(selected.id, { x: box.minX + v })}
                  testId="edit-left"
                />
                <NumberField
                  label="Střed nad podlahou"
                  value={floorY - (selected.y + selected.h / 2)}
                  min={-MAX_SIZE_MM}
                  max={MAX_SIZE_MM}
                  onCommit={(v) => patchDevice(selected.id, { y: floorY - v - selected.h / 2 })}
                  testId="edit-height"
                />
              </div>
              <p className="mt-2 text-sm text-mist">Podlaha = spodní okraj plochy.</p>
              <button type="button" onClick={() => setToDelete(selected)} className="mt-3 font-semibold text-red-300 hover:underline">
                Smazat zařízení
              </button>
            </div>
          )}

          <div>
            <h3 className="mb-2 text-lg font-bold">Zařízení na ploše ({wall.devices.length})</h3>
            {wall.devices.length === 0 ? (
              <p className="text-mist">Zatím žádné. Přidej je tlačítky výše.</p>
            ) : (
              <ul className="grid gap-2">
                {wall.devices.map((d) => (
                  <li key={d.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(d.id)}
                      aria-pressed={d.id === selectedId}
                      className={`flex w-full justify-between rounded-xl px-4 py-2 text-left ${d.id === selectedId ? "bg-volt text-navy" : "bg-navy-light"}`}
                      data-testid="device-item"
                    >
                      <span className="font-semibold">{d.name}</span>
                      <span className="text-sm">
                        {d.w} × {d.h}
                        {deviceProblem(d, wall) && " ⚠"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button type="button" onClick={() => setToDelete("wall")} className="self-start font-semibold text-red-300 hover:underline">
            Smazat celou plochu
          </button>
        </aside>
      </main>

      <ConfirmDialog
        open={toDelete !== null}
        title={toDelete === "wall" ? "Smazat plochu?" : "Smazat zařízení?"}
        confirmLabel="Smazat"
        onConfirm={() => void confirmDelete()}
        onCancel={() => setToDelete(null)}
      >
        {toDelete === "wall"
          ? `Plocha „${wall.name}“ i se všemi ${wall.devices.length} zařízeními se smaže. Fotka zůstane.`
          : `Zařízení „${toDelete?.name ?? ""}“ se z plochy smaže.`}
      </ConfirmDialog>
    </div>
  );
}

/** Dimension line with end ticks and the length in mm; sizes are given in screen px via `u` (mm per px). */
function DimLine({ from, to, mm, u, color, side }: { from: Point; to: Point; mm: number; u: number; color: string; side?: string }) {
  if (mm < 0.5) return null;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * 6 * u;
  const ny = (dx / len) * 6 * u;
  const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
  const vertical = Math.abs(dy) > Math.abs(dx);
  return (
    <g pointerEvents="none">
      <line x1={from.x} y1={from.y} x2={to.x} y2={to.y} stroke={color} strokeWidth={1.5 * u} />
      <line x1={from.x - nx} y1={from.y - ny} x2={from.x + nx} y2={from.y + ny} stroke={color} strokeWidth={1.5 * u} />
      <line x1={to.x - nx} y1={to.y - ny} x2={to.x + nx} y2={to.y + ny} stroke={color} strokeWidth={1.5 * u} />
      <text
        x={mid.x}
        y={mid.y - 6 * u}
        transform={vertical ? `rotate(-90 ${mid.x} ${mid.y})` : undefined}
        fontSize={13 * u}
        fontWeight={700}
        textAnchor="middle"
        fill={color}
        stroke="#121c2d"
        strokeWidth={3 * u}
        paintOrder="stroke"
        data-testid={side ? "device-dim" : "wall-dim"}
        data-side={side}
        data-mm={mm.toFixed(1)}
      >
        {formatMm(mm)}
      </text>
    </g>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onCommit,
  testId,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onCommit: (v: number) => void;
  testId: string;
}) {
  const [text, setText] = useState(String(Math.round(value)));
  const [focused, setFocused] = useState(false);
  const invalid = (() => {
    const v = parseMm(text);
    return v === null || v < min || v > max;
  })();

  useEffect(() => {
    if (!focused) setText(String(Math.round(value)));
  }, [value, focused]);

  const commit = () => {
    const v = parseMm(text);
    if (v !== null && v >= min && v <= max) onCommit(Math.round(v));
    else setText(String(Math.round(value)));
  };

  return (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      {label}
      <input
        className={`w-full rounded-xl border bg-navy-dark px-3 py-2 text-lg ${invalid ? "border-red-400" : "border-white/20"}`}
        inputMode="numeric"
        value={text}
        aria-invalid={invalid}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
        data-testid={testId}
      />
    </label>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <Header subtitle="rozmístění" />
      <p className="p-8 text-lg text-mist">{children}</p>
    </div>
  );
}
