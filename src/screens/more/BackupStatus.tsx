import { useLiveQuery } from 'dexie-react-hooks';
import { Notice } from '../../components/ui';
import { getSettings } from '../../db/db';
import { exportStatus } from '../../logic/backup';
import { formatDate, toISODate } from '../../logic/dates';

/** Reminder to export once a month and the date of the last export (SPEC §8). */
export function BackupStatus({ link }: { link?: boolean }) {
  const settings = useLiveQuery(() => getSettings());
  if (!settings) return null;
  const status = exportStatus(settings.lastExportAt, new Date());
  const last = settings.lastExportAt ? formatDate(toISODate(new Date(settings.lastExportAt))) : null;

  return (
    <div className="space-y-2">
      <Notice tone={status.kind === 'ok' ? 'info' : 'warning'}>
        <p className="font-medium">Делайте экспорт раз в месяц — данные хранятся только на этом телефоне.</p>
        <p className="mt-1">
          {status.kind === 'never'
            ? 'Экспорт ещё не делали.'
            : `Последний экспорт: ${last}${status.daysAgo === 0 ? ' (сегодня)' : ` (${status.daysAgo} дн. назад)`}.`}
          {status.kind === 'due' && ' Пора сохранить свежую копию.'}
        </p>
        {link && (
          <a href="#/more/data" className="-mb-2 inline-flex min-h-11 items-center font-semibold underline">
            Сделать экспорт
          </a>
        )}
      </Notice>
    </div>
  );
}
