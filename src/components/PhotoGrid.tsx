import { useEffect, useState } from "react";
import type { StoredPhoto } from "../lib/db";
import type { Quality } from "../lib/protocol";

const QUALITY_COLOR: Record<Quality | "pending", string> = {
  ok: "text-emerald-300",
  small: "text-volt",
  skewed: "text-volt",
  missing: "text-red-300",
  error: "text-red-300",
  pending: "text-mist animate-pulse",
};

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} kB`;
}

function Thumb({ photo, onDelete }: { photo: StoredPhoto; onDelete: (photo: StoredPhoto) => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(photo.blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [photo.blob]);

  const quality = photo.analysis?.quality;
  const canMeasure = (photo.analysis?.markers.length ?? 0) > 0;
  const dimCount = photo.dims?.length ?? 0;

  return (
    <li className="overflow-hidden rounded-2xl bg-navy-light" data-testid="photo" data-quality={quality ?? "pending"}>
      <a
        href={canMeasure ? `#/foto/${photo.id}` : undefined}
        aria-disabled={!canMeasure}
        className={`relative block aspect-[4/3] bg-navy-dark ${canMeasure ? "cursor-pointer" : "cursor-default"}`}
        aria-label={canMeasure ? `Měřit na fotce ${photo.name}` : undefined}
      >
        {url && <img src={url} alt={`Fotka ${photo.name}`} className="size-full object-cover" />}
        {canMeasure && (
          <span className="absolute right-2 bottom-2 rounded-lg bg-volt px-3 py-1 text-sm font-bold text-navy shadow">
            {dimCount > 0 ? `Kóty (${dimCount})` : "Měřit"}
          </span>
        )}
      </a>
      <p className={`px-3 pt-2 text-sm font-semibold ${QUALITY_COLOR[quality ?? "pending"]}`} data-testid="photo-quality">
        {photo.analysis?.message ?? "Hledám terč…"}
      </p>
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0 text-sm">
          <p className="truncate font-semibold" title={photo.name}>
            {photo.name}
          </p>
          <p className="text-mist">
            {photo.width} × {photo.height} px · {formatSize(photo.size)}
          </p>
          <p className="text-mist">
            {photo.device} · {photo.receivedAt.toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onDelete(photo)}
          className="shrink-0 rounded-lg px-2 py-1 text-sm font-semibold text-red-300 hover:bg-red-400/15"
          aria-label={`Smazat fotku ${photo.name}`}
        >
          Smazat
        </button>
      </div>
    </li>
  );
}

export function PhotoGrid({ photos, onDelete }: { photos: StoredPhoto[]; onDelete: (photo: StoredPhoto) => void }) {
  if (photos.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-white/20 p-6 text-center text-mist" data-testid="photos-empty">
        Zatím žádné fotky. Pošli je z telefonu tlačítkem +.
      </p>
    );
  }
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-4" data-testid="photos">
      {photos.map((photo) => (
        <Thumb key={photo.id} photo={photo} onDelete={onDelete} />
      ))}
    </ul>
  );
}
