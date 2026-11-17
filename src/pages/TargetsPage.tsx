import { useState } from "react";
import { Header } from "../components/Header";
import { TargetSheet } from "../components/TargetSheet";
import { TARGET } from "../lib/markers";

const MAX_SHEETS = 20;

function parseWhole(value: string): number | null {
  return /^\d{1,3}$/.test(value.trim()) ? Number(value) : null;
}

/** Printable A4 measuring targets (one target per page). */
export function TargetsPage() {
  const [fromText, setFromText] = useState("1");
  const [countText, setCountText] = useState("1");

  const from = parseWhole(fromText);
  const count = parseWhole(countText);
  const fromError = from === null || from < 1 || from > TARGET.maxNumber ? `Zadej číslo od 1 do ${TARGET.maxNumber}.` : null;
  const countError =
    count === null || count < 1 || count > MAX_SHEETS
      ? `Zadej počet od 1 do ${MAX_SHEETS}.`
      : from !== null && !fromError && from + count - 1 > TARGET.maxNumber
        ? `Poslední terč by měl číslo ${from + count - 1}, nejvyšší je ${TARGET.maxNumber}.`
        : null;
  const valid = !fromError && !countError;
  const numbers = valid ? Array.from({ length: count! }, (_, i) => from! + i) : [];

  return (
    <div className="min-h-dvh">
      <div className="no-print">
        <Header subtitle="terče k tisku" />
      </div>
      <main className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[22rem_1fr] lg:items-start">
        <section className="no-print flex flex-col gap-5" aria-labelledby="targets-title">
          <h2 id="targets-title" className="text-2xl font-bold tracking-wide">
            Měřicí terč A4
          </h2>
          <p className="text-mist">
            Každý terč má vlastní číslo, aplikace ho na fotce pozná. Na menší plochu stačí jeden. Na velkou plochu vytiskni víc terčů
            s různými čísly a rozmísti je asi po 2–3 m.
          </p>

          <div className="grid grid-cols-2 gap-4">
            <label className="flex flex-col gap-1 font-semibold">
              Od čísla
              <input
                inputMode="numeric"
                value={fromText}
                onChange={(e) => setFromText(e.target.value)}
                aria-invalid={fromError !== null}
                aria-describedby={fromError ? "from-error" : undefined}
                className="rounded-xl border border-white/20 bg-navy-light px-4 py-3 text-xl"
                data-testid="target-from"
              />
            </label>
            <label className="flex flex-col gap-1 font-semibold">
              Počet terčů
              <input
                inputMode="numeric"
                value={countText}
                onChange={(e) => setCountText(e.target.value)}
                aria-invalid={countError !== null}
                aria-describedby={countError ? "count-error" : undefined}
                className="rounded-xl border border-white/20 bg-navy-light px-4 py-3 text-xl"
                data-testid="target-count"
              />
            </label>
          </div>
          {fromError && (
            <p id="from-error" className="text-red-300" role="alert">
              {fromError}
            </p>
          )}
          {countError && (
            <p id="count-error" className="text-red-300" role="alert">
              {countError}
            </p>
          )}

          <button
            type="button"
            onClick={() => window.print()}
            disabled={!valid}
            className="rounded-2xl bg-volt px-6 py-4 text-xl font-bold text-navy disabled:opacity-40"
          >
            Vytisknout {valid && count! > 1 ? `${count} terčů` : "terč"}
          </button>

          <div className="rounded-2xl bg-navy-light p-4">
            <h3 className="mb-2 font-bold text-volt">Jak tisknout</h3>
            <ol className="list-decimal space-y-1 pl-5 text-mist">
              <li>Papír A4, orientace na výšku.</li>
              <li>
                Měřítko <strong className="text-white">100 %</strong> / „Skutečná velikost“. Nevolit „Přizpůsobit stránce“.
              </li>
              <li>
                Po tisku přeměř černý čtverec: musí mít <strong className="text-white">{TARGET.sideMm} mm</strong>.
              </li>
              <li>Terč přilep rovně a napnutý, nejlépe na tvrdou podložku.</li>
            </ol>
          </div>

          <a href="#/" className="font-semibold text-volt underline-offset-4 hover:underline">
            ← Zpět na příjem fotek
          </a>
        </section>

        <section className="print-area flex flex-col items-center gap-6" aria-label="Náhled tisku">
          {numbers.map((n) => (
            <div key={n} className="sheet-page w-full max-w-[210mm] overflow-hidden rounded-lg shadow-2xl">
              <TargetSheet number={n} />
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
