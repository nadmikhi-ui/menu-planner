import { useLiveQuery } from 'dexie-react-hooks';
import { EmptyState, Screen } from '../components/Screen';
import { db } from '../db/db';
import { formatWeekRange } from '../logic/dates';
import { shoppingWeeks } from '../logic/shopping';
import type { ScreenProps } from '../navigation';
import { ShoppingView } from './shopping/ShoppingView';

/** Shopping list of an approved week (SPEC §7). `#/shopping/<weekId>/…` */
export function ShoppingScreen({ path }: ScreenProps) {
  const weeks = useLiveQuery(() => db.weeks.toArray());
  if (!weeks) return <Screen title="Покупки">{null}</Screen>;

  const approved = shoppingWeeks(weeks);
  const requested = path[0] ? approved.find((w) => w.id === Number(path[0])) : undefined;
  const selected = requested ?? approved.at(-1);

  if (!selected) {
    return (
      <Screen title="Покупки">
        <EmptyState
          title="Список покупок пока пуст"
          text="Список сформируется, когда вы утвердите меню недели. Продукты будут сгруппированы по местам покупки."
        />
        <a href="#/week" className="mt-4 block text-center font-medium text-brand-700">
          К меню недели
        </a>
      </Screen>
    );
  }

  return (
    <Screen title="Покупки">
      {approved.length > 1 && (
        <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
          {approved.map((w) => (
            <button
              key={w.id}
              type="button"
              onClick={() => window.location.replace(`#/shopping/${w.id}`)}
              aria-pressed={w.id === selected.id}
              className={`min-h-11 shrink-0 rounded-xl px-3 text-sm font-medium ${
                w.id === selected.id ? 'bg-brand-700 text-white' : 'bg-white ring-1 ring-stone-300'
              }`}
            >
              {formatWeekRange(w.startDate)}
            </button>
          ))}
        </div>
      )}
      <ShoppingView key={selected.id} week={selected} path={requested ? path.slice(1) : []} />
    </Screen>
  );
}
