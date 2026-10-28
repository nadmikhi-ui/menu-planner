import { useLiveQuery } from 'dexie-react-hooks';
import { useRef, useState, type ChangeEvent } from 'react';
import { Screen } from '../../components/Screen';
import { Notice } from '../../components/ui';
import { exportBackup, importBackup } from '../../db/backup';
import { db } from '../../db/db';
import { backupFileName, backupSummary, parseBackup, type Backup } from '../../logic/backup';
import { formatDate, toISODate } from '../../logic/dates';

/** «Экспорт и импорт» (SPEC §8): all data in one JSON file. */
export function DataPage() {
  const stats = useLiveQuery(async () => ({
    dishes: await db.dishes.count(),
    weeks: await db.weeks.count(),
    freezer: (await db.freezer.toArray()).filter((i) => i.status === 'in_stock').length,
    products: await db.products.count(),
  }));
  const [message, setMessage] = useState<{ tone: 'info' | 'warning'; text: string } | null>(null);
  const [pending, setPending] = useState<Backup | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const exportFile = async () => {
    setMessage(null);
    const now = new Date();
    const backup = await exportBackup(db, now);
    const file = new File([JSON.stringify(backup, null, 2)], backupFileName(now), { type: 'application/json' });
    try {
      // On a phone the share sheet lets you save the file to Files or send it.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Меню на неделю — резервная копия' });
        return;
      }
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return;
    }
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = file.name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage({ tone: 'info', text: `Файл «${file.name}» сохранён в загрузки.` });
  };

  const chooseFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMessage(null);
    try {
      setPending(parseBackup(await file.text(), db.verno));
    } catch (err) {
      setPending(null);
      setMessage({ tone: 'warning', text: err instanceof Error ? err.message : String(err) });
    }
  };

  const confirmImport = async () => {
    if (!pending) return;
    try {
      await importBackup(pending);
      setPending(null);
      setMessage({ tone: 'info', text: 'Данные загружены.' });
    } catch (err) {
      setMessage({ tone: 'warning', text: `Не удалось загрузить, данные не изменены: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  const summary = pending && backupSummary(pending);
  const exportedOn = pending?.exportedAt ? formatDate(toISODate(new Date(pending.exportedAt))) : null;

  return (
    <Screen title="Экспорт и импорт" back={{ href: '#/more', label: 'Ещё' }}>
      <div className="space-y-8">
        {message && <Notice tone={message.tone}>{message.text}</Notice>}

        <section>
          <h2 className="mb-1 font-semibold">Сохранить в файл</h2>
          <p className="mb-3 text-sm text-stone-500">
            Все данные одним JSON-файлом: блюда, недели, морозилка, продукты, настройки. Сохраните его, чтобы не
            потерять данные или перенести их на другой телефон.
          </p>
          {stats && (
            <p className="mb-3 text-sm text-stone-600">
              Сейчас: блюд — {stats.dishes}, недель — {stats.weeks}, в морозилке — {stats.freezer}, продуктов —{' '}
              {stats.products}.
            </p>
          )}
          <button
            type="button"
            onClick={() => void exportFile()}
            className="min-h-12 w-full rounded-xl bg-brand-700 font-semibold text-white active:bg-brand-800"
          >
            Сохранить в файл
          </button>
        </section>

        <section>
          <h2 className="mb-1 font-semibold">Загрузить из файла</h2>
          <p className="mb-3 text-sm text-stone-500">
            Данные из файла заменят всё, что сейчас есть в приложении. Перед загрузкой покажу, что в файле.
          </p>
          <input ref={fileInput} type="file" accept="application/json,.json" onChange={(e) => void chooseFile(e)} className="hidden" />
          {pending && summary ? (
            <div className="space-y-3 rounded-2xl bg-white p-4 ring-1 ring-amber-300">
              <p className="font-medium">В файле{exportedOn ? ` от ${exportedOn}` : ''}:</p>
              <p className="text-sm text-stone-600">
                блюд — {summary.dishes}, недель — {summary.weeks}, в морозилке — {summary.freezer}, продуктов —{' '}
                {summary.products}.
              </p>
              <p className="text-sm font-medium text-amber-900">Текущие данные будут удалены и заменены данными из файла.</p>
              <button
                type="button"
                onClick={() => void confirmImport()}
                className="min-h-12 w-full rounded-xl bg-red-700 font-semibold text-white active:bg-red-800"
              >
                Заменить все данные
              </button>
              <button type="button" onClick={() => setPending(null)} className="min-h-11 w-full text-sm text-stone-600">
                Отмена
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="min-h-12 w-full rounded-xl font-medium text-stone-700 ring-1 ring-stone-300 active:bg-stone-100"
            >
              Выбрать файл…
            </button>
          )}
        </section>
      </div>
    </Screen>
  );
}
