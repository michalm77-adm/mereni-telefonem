import { useEffect, useState } from "react";
import { allowFolder, chooseFolder, folderSupported, subscribeFolder, syncNow, type FolderState } from "../lib/folder";

/** Job name + where photos are saved on this PC. */
export function FolderPanel({ job, onJobChange }: { job: string; onJobChange: (job: string) => void }) {
  const [state, setState] = useState<FolderState>({ kind: folderSupported() ? "none" : "unsupported" });

  useEffect(() => subscribeFolder(setState), []);

  const btn = "rounded-xl px-4 py-2 font-bold";
  return (
    <section className="grid gap-4 rounded-2xl bg-navy-light p-4 md:grid-cols-[minmax(14rem,22rem)_1fr]" aria-label="Zakázka a ukládání" data-testid="folder-panel">
      <label className="flex flex-col gap-1 font-semibold">
        Zakázka
        <input
          value={job}
          maxLength={80}
          onChange={(e) => onJobChange(e.target.value)}
          placeholder="např. Novákovi – rozvaděč"
          className="rounded-xl border border-white/20 bg-navy-dark px-3 py-2 text-lg"
          data-testid="job-name"
        />
        <span className="text-sm font-normal text-mist">Nové fotky se uloží k této zakázce (= podsložka).</span>
      </label>

      <div className="flex flex-col gap-2" aria-live="polite">
        <p className="font-semibold">Ukládání do složky na počítači</p>
        {state.kind === "unsupported" && (
          <p className="text-volt" data-testid="folder-state" data-state="unsupported">
            Tento prohlížeč neumí ukládat do složky. Fotky zůstávají jen v prohlížeči – pro ukládání do složky otevři stránku v Chrome nebo Edge.
          </p>
        )}
        {state.kind === "none" && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-volt" data-testid="folder-state" data-state="none">
              Složka není vybraná – fotky jsou zatím jen v prohlížeči.
            </p>
            <button type="button" onClick={() => void chooseFolder()} className={`${btn} bg-volt text-navy`}>
              Vybrat složku
            </button>
          </div>
        )}
        {state.kind === "needs-permission" && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-volt" data-testid="folder-state" data-state="needs-permission">
              Prohlížeč potřebuje znovu povolit zápis do složky „{state.name}“.
            </p>
            <button type="button" onClick={() => void allowFolder()} className={`${btn} bg-volt text-navy`}>
              Povolit zápis
            </button>
          </div>
        )}
        {state.kind === "ready" && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-emerald-300" data-testid="folder-state" data-state="ready">
              Ukládám do složky „{state.name}“
              {state.saving ? " – ukládám…" : state.savedAt ? ` – uloženo ${state.savedAt.toLocaleTimeString("cs-CZ")}` : ""}
            </p>
            <button type="button" onClick={() => void syncNow()} className={`${btn} border border-white/20`}>
              Uložit teď
            </button>
            <button type="button" onClick={() => void chooseFolder()} className={`${btn} border border-white/20`}>
              Změnit složku
            </button>
          </div>
        )}
        {state.kind === "error" && (
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-red-300" role="alert" data-testid="folder-state" data-state="error">
              Do složky „{state.name}“ se nepodařilo uložit. Není plný disk nebo složka smazaná?
            </p>
            <button type="button" onClick={() => void syncNow()} className={`${btn} bg-volt text-navy`}>
              Zkusit znovu
            </button>
            <button type="button" onClick={() => void chooseFolder()} className={`${btn} border border-white/20`}>
              Vybrat jinou
            </button>
          </div>
        )}
        <p className="text-sm text-mist">Smazání v aplikaci soubory ve složce nemaže.</p>
      </div>
    </section>
  );
}
