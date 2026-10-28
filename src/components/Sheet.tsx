import { useEffect, type ReactNode } from 'react';

/** Full-screen panel over the current screen and the bottom navigation. */
export function Sheet({
  title,
  onCancel,
  action,
  children,
}: {
  title: string;
  onCancel: () => void;
  action?: ReactNode;
  children?: ReactNode;
}) {
  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = overflow;
    };
  }, []);

  return (
    <div role="dialog" aria-modal="true" aria-label={title} className="fixed inset-0 z-30 overflow-y-auto overscroll-contain bg-stone-50">
      <div className="mx-auto max-w-xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-stone-200 bg-stone-50/95 px-2 pb-2 pt-[calc(env(safe-area-inset-top)+0.5rem)] backdrop-blur">
          <button type="button" onClick={onCancel} className="min-h-11 px-2 text-stone-600">
            Отмена
          </button>
          <h1 className="text-base font-semibold">{title}</h1>
          <div className="min-w-[4.5rem] text-right">{action}</div>
        </header>
        <div className="px-4 pt-4 pb-[calc(env(safe-area-inset-bottom)+1rem)]">{children}</div>
      </div>
    </div>
  );
}
