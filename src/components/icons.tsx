import type { TabId } from '../navigation';

const paths: Record<TabId, string> = {
  // calendar
  week: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  // book
  dishes: 'M5 4h10a4 4 0 0 1 4 4v12H8a3 3 0 0 1-3-3V4Zm0 13a3 3 0 0 1 3-3h11',
  // basket
  shopping: 'M3 9h18l-2 11H5L3 9Zm5 0 4-6 4 6M9 13v4M15 13v4',
  // snowflake
  freezer: 'M12 2v20M4 6l16 12M20 6 4 18M9 3l3 3 3-3M9 21l3-3 3 3',
  // dots
  more: 'M5 12h.01M12 12h.01M19 12h.01',
};

export function TabIcon({ id, className }: { id: TabId; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={id === 'more' ? 3 : 1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={paths[id]} />
    </svg>
  );
}
