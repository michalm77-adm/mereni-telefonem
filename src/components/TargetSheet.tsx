import { markerBits, TARGET } from "../lib/markers";

/** A4 page in millimetres. */
const PAGE = { w: 210, h: 297 };
const MARKER_X = (PAGE.w - TARGET.sideMm) / 2;
const MARKER_Y = 26;
const CELL = TARGET.sideMm / TARGET.cells;
const INK = "#000000";
const BRAND = "#1a273d";

/**
 * One printable A4 target sheet. The SVG uses millimetres as units and is printed at exactly 210 × 297 mm,
 * so the black square must come out 180 mm wide when printed at 100 %.
 */
export function TargetSheet({ number }: { number: number }) {
  const bits = markerBits(number);
  const markerBottom = MARKER_Y + TARGET.sideMm;
  const midX = PAGE.w / 2;
  const midY = MARKER_Y + TARGET.sideMm / 2;
  const rulerY = 262;

  return (
    <svg
      className="target-sheet block h-auto w-full bg-white"
      viewBox={`0 0 ${PAGE.w} ${PAGE.h}`}
      width={`${PAGE.w}mm`}
      height={`${PAGE.h}mm`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`Měřicí terč číslo ${number}`}
      data-testid="target-sheet"
      data-number={number}
      fontFamily="Barlow, Arial, sans-serif"
    >
      <rect width={PAGE.w} height={PAGE.h} fill="#ffffff" />

      {/* Header */}
      <text x={MARKER_X} y={14} fontSize={5} fontWeight={700} fill={BRAND} letterSpacing={0.8}>
        2M ELEKTRO · MĚŘICÍ TERČ
      </text>
      <text x={PAGE.w - MARKER_X} y={14} fontSize={5} fontWeight={700} fill={BRAND} textAnchor="end">
        č. {number}
      </text>

      {/* Marker: black square with white data cells */}
      <g shapeRendering="crispEdges" data-testid="target-marker" data-side-mm={TARGET.sideMm}>
        <rect x={MARKER_X} y={MARKER_Y} width={TARGET.sideMm} height={TARGET.sideMm} fill={INK} />
        {bits.flatMap((row, y) =>
          row.map((white, x) =>
            white ? (
              <rect
                key={`${x}-${y}`}
                x={MARKER_X + (x + 1) * CELL}
                y={MARKER_Y + (y + 1) * CELL}
                width={CELL}
                height={CELL}
                fill="#ffffff"
                data-cell={`${x},${y}`}
              />
            ) : null,
          ),
        )}
      </g>

      {/* Centre ticks on every side: line them up with a spirit level or a laser line */}
      <g stroke={INK} strokeWidth={0.35}>
        <line x1={midX} y1={MARKER_Y - 8} x2={midX} y2={MARKER_Y - 2} />
        <line x1={midX} y1={markerBottom + 2} x2={midX} y2={markerBottom + 8} />
        <line x1={MARKER_X - 8} y1={midY} x2={MARKER_X - 2} y2={midY} />
        <line x1={PAGE.w - MARKER_X + 2} y1={midY} x2={PAGE.w - MARKER_X + 8} y2={midY} />
      </g>

      {/* Number and size */}
      <text x={MARKER_X} y={markerBottom + 24} fontSize={16} fontWeight={700} fill={BRAND}>
        Terč č. {number}
      </text>
      <text x={PAGE.w - MARKER_X} y={markerBottom + 17} fontSize={4.2} fontWeight={600} fill={BRAND} textAnchor="end">
        Strana černého čtverce: {TARGET.sideMm} mm
      </text>
      <text x={PAGE.w - MARKER_X} y={markerBottom + 23.5} fontSize={3.4} fill="#4a5a72" textAnchor="end">
        {TARGET.dictionary} · ID {number}
      </text>

      {/* 100 mm control ruler: measure it after printing */}
      <g stroke={INK} strokeWidth={0.25} data-testid="control-ruler">
        <line x1={MARKER_X} y1={rulerY} x2={MARKER_X + 100} y2={rulerY} />
        {Array.from({ length: 101 }, (_, mm) => (
          <line key={mm} x1={MARKER_X + mm} y1={rulerY} x2={MARKER_X + mm} y2={rulerY - (mm % 10 === 0 ? 4 : mm % 5 === 0 ? 2.6 : 1.5)} />
        ))}
      </g>
      {Array.from({ length: 11 }, (_, cm) => (
        <text key={cm} x={MARKER_X + cm * 10} y={rulerY + 4} fontSize={2.8} fill={INK} textAnchor="middle">
          {cm}
        </text>
      ))}
      <text x={MARKER_X + 104} y={rulerY} fontSize={3.4} fill={BRAND}>
        Kontrolní měřítko 100 mm (10 cm)
      </text>

      {/* Instructions */}
      <text x={MARKER_X} y={278} fontSize={3.4} fill="#4a5a72">
        <tspan x={MARKER_X}>Tiskni ve skutečné velikosti (100 %), ne „Přizpůsobit stránce“. Po tisku přeměř pravítkem černý</tspan>
        <tspan x={MARKER_X} dy={4.6}>
          čtverec ({TARGET.sideMm} mm) a měřítko (100 mm). Terč přilep rovně, nesmí být zvlněný ani přeložený.
        </tspan>
      </text>
    </svg>
  );
}
