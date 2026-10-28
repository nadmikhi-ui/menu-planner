import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { Screen } from '../../components/Screen';
import { Chip, Notice } from '../../components/ui';
import { db, getSettings } from '../../db/db';
import { setFreezerMaxAge, setRepeatPolicy, setWeekStartDay } from '../../db/settings';
import { FREEZER_MONTHS_MAX, FREEZER_MONTHS_MIN, REPEAT_CATEGORIES, parseFreezerMonths } from '../../logic/settings';
import { CATEGORY_LABELS, WEEKDAY_LABELS, type Weekday } from '../../types';
import { PlacesAndStaples } from '../shopping/SetupSheet';

const WEEKDAYS: Weekday[] = [1, 2, 3, 4, 5, 6, 0];
const SHORT_WEEKDAY: Record<Weekday, string> = { 1: 'Пн', 2: 'Вт', 3: 'Ср', 4: 'Чт', 5: 'Пт', 6: 'Сб', 0: 'Вс' };

/** «Настройки» (SPEC §8). Every change is saved at once. */
export function SettingsPage() {
  const data = useLiveQuery(async () => ({ settings: await getSettings(), products: await db.products.toArray() }));

  return (
    <Screen title="Настройки" back={{ href: '#/more', label: 'Ещё' }}>
      {data && (
        <div className="space-y-8 pb-4">
          <section>
            <h2 className="mb-1 font-semibold">Неделя начинается</h2>
            <p className="mb-3 text-sm text-stone-500">
              День после закупки. Действует для новых недель: {WEEKDAY_LABELS[data.settings.weekStartDay].toLowerCase()}.
            </p>
            <div className="flex flex-wrap gap-2">
              {WEEKDAYS.map((day) => (
                <Chip key={day} selected={data.settings.weekStartDay === day} onClick={() => void setWeekStartDay(day)}>
                  {SHORT_WEEKDAY[day]}
                </Chip>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-1 font-semibold">Правила повторов</h2>
            <p className="mb-3 text-sm text-stone-500">
              «Строго» — блюдо не повторяется в неделе и не берётся, если было на прошлой. «Можно повторять» —
              автосборка всё равно старается не повторять, но предупреждений не будет.
            </p>
            <ul className="divide-y divide-stone-100 overflow-hidden rounded-2xl bg-white ring-1 ring-stone-200">
              {REPEAT_CATEGORIES.map((category) => {
                const policy = data.settings.repeatPolicy[category] ?? 'strict';
                return (
                  <li key={category} className="flex flex-wrap items-center gap-2 px-4 py-2.5">
                    <span className="min-w-28 flex-1">{CATEGORY_LABELS[category]}</span>
                    <span className="flex gap-1.5">
                      <Chip selected={policy === 'strict'} onClick={() => void setRepeatPolicy(category, 'strict')}>
                        Строго
                      </Chip>
                      <Chip selected={policy === 'relaxed'} onClick={() => void setRepeatPolicy(category, 'relaxed')}>
                        Можно повторять
                      </Chip>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <FreezerMonths key={data.settings.freezerMaxAgeMonths} value={data.settings.freezerMaxAgeMonths} />

          <PlacesAndStaples settings={data.settings} products={data.products} />
        </div>
      )}
    </Screen>
  );
}

function FreezerMonths({ value }: { value: number }) {
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    try {
      const months = parseFreezerMonths(text);
      setError(null);
      if (months !== value) await setFreezerMaxAge(months);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <section>
      <h2 className="mb-1 font-semibold">Срок хранения заморозки</h2>
      <p className="mb-3 text-sm text-stone-500">Заготовки, которые лежат дольше, подсвечиваются в «Морозилке».</p>
      <label className="flex items-center gap-3">
        <input
          type="number"
          inputMode="numeric"
          min={FREEZER_MONTHS_MIN}
          max={FREEZER_MONTHS_MAX}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={() => void save()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
          aria-label="Срок хранения заморозки в месяцах"
          className="block w-24 rounded-xl border-0 bg-white px-3.5 py-3 text-base ring-1 ring-stone-300 focus:ring-2 focus:ring-brand-600 focus:outline-none"
        />
        <span className="text-stone-600">мес.</span>
      </label>
      {error && <div className="mt-2"><Notice tone="warning">{error}</Notice></div>}
    </section>
  );
}
