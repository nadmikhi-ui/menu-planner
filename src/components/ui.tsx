import type { ReactNode } from 'react';

interface ChipProps {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}

/** Rounded toggle button used for categories and option groups. */
export function Chip({ selected, onClick, children }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-11 shrink-0 rounded-full px-4 text-sm font-medium ${
        selected
          ? 'bg-brand-700 text-white'
          : 'bg-white text-stone-700 ring-1 ring-stone-300 active:bg-stone-100'
      }`}
    >
      {children}
    </button>
  );
}

export function FieldLabel({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-stone-600">
      {children}
    </label>
  );
}

export const inputClass =
  'block w-full rounded-xl border-0 bg-white px-3.5 py-3 text-base ring-1 ring-stone-300 placeholder:text-stone-400 focus:ring-2 focus:ring-brand-600 focus:outline-none';

export function Notice({ tone, children }: { tone: 'info' | 'warning' | 'neutral'; children: ReactNode }) {
  const tones = {
    info: 'bg-brand-50 text-brand-800 ring-brand-100',
    warning: 'bg-amber-50 text-amber-900 ring-amber-200',
    neutral: 'bg-stone-100 text-stone-700 ring-stone-200',
  };
  return <div className={`rounded-xl px-3.5 py-2.5 text-sm ring-1 ${tones[tone]}`}>{children}</div>;
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-xs font-medium text-stone-600">{children}</span>
  );
}
