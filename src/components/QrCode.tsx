import { useEffect, useState } from "react";
import QRCode from "qrcode";

/** QR code as an <img>; the encoded link is also exposed for tests and copying. */
export function QrCode({ value, label }: { value: string; label: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    QRCode.toDataURL(value, { width: 560, margin: 2, errorCorrectionLevel: "M", color: { dark: "#1a273d", light: "#ffffff" } })
      .then((url) => {
        if (!cancelled) setSrc(url);
      })
      .catch(() => {
        if (!cancelled) setSrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [value]);

  return (
    <div className="rounded-2xl bg-white p-3 shadow-xl" data-testid="qr" data-sender-url={value}>
      {src ? (
        <img src={src} alt={label} className="block size-64 sm:size-72" />
      ) : (
        <div className="size-64 animate-pulse rounded-lg bg-mist/40 sm:size-72" aria-hidden="true" />
      )}
    </div>
  );
}
