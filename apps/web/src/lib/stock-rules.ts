/**
 * Stock rules — T128 (spec §3.6.23–24)
 *
 * Stock never goes below 0 except through an explicit admin override, which
 * is logged. Pure so the server action and the adjustment dialog agree.
 */

export function checkStockChange(input: {
  quantity: number;
  onHand: number;
  allowNegative?: boolean;
}): string | null {
  if (!Number.isInteger(input.quantity) || input.quantity === 0)
    return "La cantidad debe ser un número entero distinto de 0.";
  const after = input.onHand + input.quantity;
  if (after < 0 && !input.allowNegative)
    return input.onHand > 0
      ? `Solo hay ${input.onHand} en inventario: no se pueden sacar ${-input.quantity}.`
      : "No hay unidades en inventario para sacar.";
  return null;
}
