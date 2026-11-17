import { useEffect, useState } from "react";
import type { StoredPhoto } from "../lib/db";

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

  return (
    <li className="overflow-hidden rounded-2xl bg-navy-light" data-testid="photo">
      <div className="aspect-[4/3] bg-navy-dark">
        {url && <img src={url} alt={`Fotka ${photo.name}`} className="size-full object-cover" />}
      </div>
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
