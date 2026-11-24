const pesos = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });

/** $12.000 */
export const plata = (n: number | string | null | undefined) => '$' + pesos.format(Number(n ?? 0));

/** 2:45 p. m. en hora de Colombia */
export const hora = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { timeZone: 'America/Bogota', hour: 'numeric', minute: '2-digit' }) : '';

export const mesa2 = (n: number) => String(n).padStart(2, '0');

export const ROLES: Record<string, string> = {
  admin: 'Administración',
  caja: 'Caja',
  mesero: 'Mesero',
  rapidas: 'Comidas rápidas',
  armado: 'Armado de ruedas',
  tortas: 'Producción de tortas',
  insumos: 'Producción de insumos',
};

export const PRIORIDAD: Record<string, string> = { alta: 'Alta', media: 'Media', baja: 'Baja' };
