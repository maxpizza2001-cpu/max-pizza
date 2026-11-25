// Recomendaciones: qué le falta al pedido para quedar completo, SOLO con productos y combos reales del menú
// (precios del sistema, nada de descuentos inventados). Reglas simples y fáciles de explicar:
//   · hay comida y no hay bebida      → bebidas (de la más barata a la más cara)
//   · hay pizza y no hay acompañante  → papas / salchipapa / comidas rápidas
//   · hay combos con ahorro real      → el combo que más ahorra
import { plata } from '../lib/formato';
import { ImagenProducto } from './Dibujos';
import { platoAgotado, type Combo, type LineaCarrito, type Opcion, type Plato } from './modelo';

export type Sugerencia = { clave: string; motivo: string; plato?: Plato; combo?: Combo };

export function sugerencias(carrito: LineaCarrito[], platos: Plato[], combos: Combo[], max = 4): Sugerencia[] {
  if (!carrito.length) return [];
  const enCarrito = new Set(carrito.map((l) => l.plato_id));
  const tipoDe = (l: LineaCarrito) => platos.find((p) => p.id === l.plato_id)?.categoria_tipo ?? (l.combo_id ? 'combo' : '');
  const tipos = new Set(carrito.map(tipoDe));
  const libres = platos.filter((p) => !platoAgotado(p) && !enCarrito.has(p.id));
  const out: Sugerencia[] = [];
  const hayComida = tipos.has('pizza') || tipos.has('rapida') || tipos.has('combo');

  if (hayComida && !tipos.has('bebida')) {
    libres.filter((p) => p.categoria_tipo === 'bebida').sort((a, b) => a.precio - b.precio).slice(0, 2)
      .forEach((p) => out.push({ clave: p.id, plato: p, motivo: 'Para pasar la pizza' }));
  }
  if (tipos.has('pizza') && !tipos.has('rapida')) {
    const acomp = libres.filter((p) => p.categoria_tipo === 'rapida')
      .sort((a, b) => Number(/papa|salchi/i.test(b.nombre)) - Number(/papa|salchi/i.test(a.nombre)) || a.precio - b.precio);
    acomp.slice(0, 1).forEach((p) => out.push({ clave: p.id, plato: p, motivo: 'El acompañante perfecto' }));
  }
  const ahorro = combos.filter((c) => c.normal > c.precio && !carrito.some((l) => l.combo_id === c.id))
    .sort((a, b) => (b.normal - b.precio) - (a.normal - a.precio))[0];
  if (ahorro) out.push({ clave: 'combo:' + ahorro.id, combo: ahorro, motivo: `Combo · ahorras ${plata(ahorro.normal - ahorro.precio)}` });
  return out.slice(0, max);
}

/** Se puede agregar con un toque (un solo tamaño, sin adicionales) o hay que abrir la ventana del producto */
export const agregaDirecto = (p: Plato, opciones: Opcion[]) => p.variantes.length === 1 && !opciones.some((o) => o.producto_id === p.variantes[0].producto_id);

/** Fila de sugerencias (tarjetitas con foto, nombre, precio real y ＋) */
export function FilaSugerencias({ items, onPlato, onCombo }: { items: Sugerencia[]; onPlato: (p: Plato) => void; onCombo: (c: Combo) => void }) {
  return (
    <div className="t-sug-fila">
      {items.map((s) => (
        <button key={s.clave} className="t-sug" onClick={() => (s.plato ? onPlato(s.plato) : s.combo && onCombo(s.combo))}
          aria-label={`Agregar ${s.plato?.nombre ?? s.combo?.nombre}, ${plata(s.plato?.precio ?? s.combo?.precio ?? 0)}`}>
          <span className="t-sug-img">{s.plato ? <ImagenProducto p={s.plato} tam={52} /> : <span style={{ fontSize: 30 }}>🎉</span>}</span>
          <span className="t-sug-txt">
            <small>{s.motivo}</small>
            <b>{s.plato?.nombre ?? s.combo?.nombre}</b>
            <span>{s.plato && s.plato.variantes.length > 1 ? 'Desde ' : ''}{plata(s.plato?.precio ?? s.combo?.precio ?? 0)}</span>
          </span>
          <span className="t-sug-mas" aria-hidden>＋</span>
        </button>
      ))}
    </div>
  );
}

/** Aviso que aparece al agregar comida: "¡Tu pizza ya está lista para acompañarse!" */
export function SugerenciaFlotante({ titulo, items, onPlato, onCombo, onCerrar }: {
  titulo: string; items: Sugerencia[]; onPlato: (p: Plato) => void; onCombo: (c: Combo) => void; onCerrar: () => void;
}) {
  if (!items.length) return null;
  return (
    <div className="t-sug-flotante" role="dialog" aria-label={titulo}>
      <div className="t-sug-cabeza"><b>{titulo}</b><button onClick={onCerrar} aria-label="Cerrar sugerencias">✕</button></div>
      <FilaSugerencias items={items} onPlato={onPlato} onCombo={onCombo} />
    </div>
  );
}
