import type { ReactNode } from 'react';

interface Props {
  title: string;
  /** Link back to the parent page, e.g. `{ href: '#/more', label: 'Ещё' }`. */
  back?: { href: string; label: string };
  children: ReactNode;
}

export function Screen({ title, back, children }: Props) {
  return (
    <div className="mx-auto max-w-xl">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-50/95 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur">
        {back && (
          <a href={back.href} className="-mb-1 -ml-2 inline-flex min-h-11 items-center px-2 text-sm font-medium text-brand-700">
            ‹ {back.label}
          </a>
        )}
        <h1 className="text-xl font-semibold">{title}</h1>
      </header>
      <div className="px-4 py-4">{children}</div>
    </div>
  );
}

export function EmptyState({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-5 py-8 text-center">
      <p className="font-medium">{title}</p>
      <p className="mt-1 text-sm text-stone-500">{text}</p>
    </div>
  );
}
