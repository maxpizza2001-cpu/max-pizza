const pesos = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/** $12.000 */
export const plata = (n: number | string | null | undefined) => '$' + pesos.format(Number(n ?? 0));

/** 2:45 p. m. en hora de Colombia */
export const hora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' }) : '';

export const mesa2 = (n: number) => String(n).padStart(2, '0');

export const ROLES: Record<string, string> = {
  ceo: 'Administrador CEO',
  admin: 'Administración',
  caja: 'Caja',
  mesero: 'Mesero',
  rapidas: 'Comidas rápidas',
  armado: 'Armado de ruedas',
  tortas: 'Producción de tortas',
  insumos: 'Producción de insumos',
  domiciliario: 'Domiciliario',
};

export const PRIORIDAD: Record<string, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };

const num = (n: number) => n.toLocaleString('es-CO', { maximumFractionDigits: 2 });
const UNIDAD: Record<string, [string, string]> = {
  porcion: ['porción', 'porciones'], und: ['und', 'und'], torta: ['torta', 'tortas'], ml: ['ml', 'ml'], g: ['g', 'g'],
};
/** 1,5 L · 2 kg · 5 porciones · ½ torta */
export function cant(n: number, unidad: string) {
  if (unidad === 'ml' && Math.abs(n) >= 1000) return `${num(n / 1000)} L`;
  if (unidad === 'g' && Math.abs(n) >= 1000) return `${num(n / 1000)} kg`;
  const [uno, varios] = UNIDAD[unidad] ?? [unidad, unidad];
  return `${num(n)} ${Math.abs(n) === 1 ? uno : varios}`;
}
