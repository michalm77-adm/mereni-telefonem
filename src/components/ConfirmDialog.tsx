import { useEffect, useRef, type ReactNode } from "react";

/** Confirmation before destructive actions (every delete must use it). */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      aria-labelledby="confirm-title"
      className="m-auto w-[min(28rem,calc(100%-2rem))] rounded-2xl bg-navy-light p-6 text-white shadow-2xl backdrop:bg-black/60"
    >
      <h2 id="confirm-title" className="text-xl font-bold">
        {title}
      </h2>
      <div className="mt-2 text-mist">{children}</div>
      <div className="mt-6 flex flex-wrap justify-end gap-3">
        <button type="button" onClick={onCancel} autoFocus className="rounded-xl border border-white/20 px-5 py-3 font-semibold">
          Zrušit
        </button>
        <button type="button" onClick={onConfirm} className="rounded-xl bg-red-500 px-5 py-3 font-bold text-white hover:bg-red-400">
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
