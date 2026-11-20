/**
 * Ciudades para los plazos (sin imports en tiempo de ejecución): la prueban los tests unitarios con `node --test`.
 */

const HORA = 3600_000;

/** Ciudades que cuentan como una sola para el plazo de confirmación (contra entrega de un lado al otro, en el día). */
const AREA: Record<string, string> = { "La Paz": "La Paz", "El Alto": "La Paz" };

/** ¿Vendedor y comprador están en la misma ciudad? "Otra" o una ciudad sin dato nunca cuenta como la misma. */
export function mismaCiudad(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b || a === "Otra" || b === "Otra") return false;
  return (AREA[a] ?? a) === (AREA[b] ?? b);
}

/** "Pagar al vendedor" se habilita 2 h después del envío en la misma ciudad y 24 h si es otra ciudad. */
export function esperaParaConfirmar(ciudadVendedor: string | null | undefined, ciudadDestino: string | null | undefined): { ms: number; label: string } {
  return mismaCiudad(ciudadVendedor, ciudadDestino) ? { ms: 2 * HORA, label: "2 horas (misma ciudad)" } : { ms: 24 * HORA, label: "24 horas (otra ciudad)" };
}
