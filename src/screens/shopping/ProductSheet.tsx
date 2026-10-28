import { Sheet } from '../../components/Sheet';
import { Chip, FieldLabel } from '../../components/ui';
import { removeManualItem, setProductPlace, setStaple } from '../../db/shopping';
import type { ShoppingLine } from '../../logic/shopping';
import { closeRoute } from '../../navigation';
import { sourcesText, type ShoppingData } from './ShoppingView';

/** Place, staple flag and hand-added state of one product of the list (SPEC §7). */
export function ProductSheet({ weekId, line, data }: { weekId: number; line: ShoppingLine; data: ShoppingData }) {
  const close = () => closeRoute(`#/shopping/${weekId}`);
  const places = data.settings.places;
  const placeId = places.some((p) => p.id === line.placeId) ? line.placeId : 'other';

  const choosePlace = async (id: string) => {
    await setProductPlace(line.productName, id);
    close();
  };

  const toggleStaple = async () => {
    await setStaple(line.productName, !line.staple);
    close();
  };

  const remove = async () => {
    await removeManualItem(weekId, line.productName);
    close();
  };

  return (
    <Sheet title={line.productName} onCancel={close}>
      <div className="space-y-6">
        <div>
          <FieldLabel>Нужен для</FieldLabel>
          <p>{sourcesText(line, data.input.dishesById)}</p>
        </div>

        <div>
          <FieldLabel>Где покупать</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {places.map((p) => (
              <Chip key={p.id} selected={p.id === placeId} onClick={() => void choosePlace(p.id)}>
                {p.name}
              </Chip>
            ))}
          </div>
          <p className="mt-2 text-sm text-stone-500">Место запомнится для этого продукта во всех списках.</p>
        </div>

        <div className="space-y-2">
          <button
            type="button"
            onClick={() => void toggleStaple()}
            className="min-h-12 w-full rounded-xl font-medium text-stone-700 ring-1 ring-stone-300 active:bg-stone-100"
          >
            {line.staple ? 'Убрать из постоянных запасов' : 'Это постоянный запас'}
          </button>
          <p className="text-sm text-stone-500">
            {line.staple
              ? 'Продукт снова будет попадать в списки покупок.'
              : 'Постоянные запасы (соль, масло, специи) по умолчанию не входят в список покупок.'}
          </p>
        </div>

        {/* A hand-added product a dish also needs stays in the list anyway, unless it is a staple. */}
        {line.manual && (line.sources.length === 0 || line.staple) && (
          <button
            type="button"
            onClick={() => void remove()}
            className="min-h-12 w-full rounded-xl font-medium text-red-700 ring-1 ring-red-200 active:bg-red-50"
          >
            {line.sources.length > 0 && line.staple ? 'Вернуть в постоянные запасы' : 'Убрать из списка'}
          </button>
        )}
      </div>
    </Sheet>
  );
}
