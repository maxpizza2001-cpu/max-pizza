// Ventana para armar un producto: tamaño, adicionales, observaciones y cantidad. El precio se actualiza solo.
import { BarraHoja } from './BarraHoja';
import { useState } from 'react';
import { plata } from '../lib/formato';
import { ImagenProducto } from './Dibujos';
import { precioLinea, type LineaCarrito, type Opcion, type Plato, agotada } from './modelo';

export function Elegir({ plato, opciones, linea, onListo, onCerrar }: {
  plato: Plato; opciones: Opcion[]; linea?: LineaCarrito; onListo: (l: LineaCarrito) => void; onCerrar: () => void;
}) {
  const libres = plato.variantes.filter((v) => !agotada(v));
  const [varId, setVarId] = useState(linea?.producto_id ?? (libres[libres.length > 1 ? 1 : 0] ?? plato.variantes[0]).producto_id);
  const variante = plato.variantes.find((v) => v.producto_id === varId) ?? plato.variantes[0];
  const disponibles = opciones.filter((o) => o.producto_id === variante.producto_id);
  const [marcadas, setMarcadas] = useState<string[]>(linea?.opciones.map((o) => o.nombre) ?? []);
  const [nota, setNota] = useState(linea?.nota ?? '');
  const [cantidad, setCantidad] = useState(linea?.cantidad ?? 1);

  const elegidas = disponibles.filter((o) => marcadas.includes(o.nombre));
  const nueva: LineaCarrito = {
    clave: linea?.clave ?? crypto.randomUUID(), plato_id: plato.id, producto_id: variante.producto_id, nombre: plato.nombre,
    tamano: variante.etiqueta || null, precio_base: variante.precio,
    opciones: elegidas.map((o) => ({ id: o.id, nombre: o.nombre, precio: Number(o.precio_extra) })), nota: nota.trim(), cantidad,
  };
  const total = precioLinea(nueva) * cantidad;

  return (
    <div className="t-fondo" onClick={onCerrar}>
      <div className="t-hoja" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={plato.nombre}>
        <BarraHoja onAtras={onCerrar} oscura />
        <div className="t-hoja-img"><div className="rueda-gira"><ImagenProducto p={plato} tam={190} /></div></div>
        <div className="t-hoja-cuerpo">
          <h2>{plato.nombre}</h2>
          {plato.descripcion && <p className="t-desc-larga">{plato.descripcion}</p>}

          {plato.variantes.length > 1 && <>
            <h3 className="t-sub">Tamaño</h3>
            <div className="t-opciones">
              {plato.variantes.map((v) => (
                <label key={v.producto_id} className={'t-opcion' + (v.producto_id === varId ? ' on' : '') + (agotada(v) ? ' t-opcion-agotada' : '')}>
                  <input type="radio" name="tam" disabled={agotada(v)} checked={v.producto_id === varId} onChange={() => { setVarId(v.producto_id); setMarcadas([]); }} />
                  <span>{v.etiqueta}{agotada(v) && <small> · Agotado</small>}</span><b>{plata(v.precio)}</b>
                </label>
              ))}
            </div>
          </>}

          {disponibles.length > 0 && <>
            <h3 className="t-sub">Adicionales <span>(opcional)</span></h3>
            <div className="t-opciones">
              {disponibles.map((o) => (
                <label key={o.id} className={'t-opcion' + (marcadas.includes(o.nombre) ? ' on' : '')}>
                  <input type="checkbox" checked={marcadas.includes(o.nombre)}
                    onChange={(e) => setMarcadas(e.target.checked ? [...marcadas, o.nombre] : marcadas.filter((x) => x !== o.nombre))} />
                  <span>{o.nombre}</span><b>+ {plata(Number(o.precio_extra))}</b>
                </label>
              ))}
            </div>
          </>}

          <h3 className="t-sub">¿Algo especial? <span>(opcional)</span></h3>
          <textarea className="t-campo" rows={2} maxLength={200} placeholder="Ej. Sin cebolla, bien tostada…" value={nota} onChange={(e) => setNota(e.target.value)} />
        </div>
        <div className="t-hoja-pie">
          <div className="t-cantidad">
            <button onClick={() => setCantidad(Math.max(1, cantidad - 1))} aria-label="Menos">−</button>
            <b>{cantidad}</b>
            <button onClick={() => setCantidad(Math.min(50, variante.disponibles ?? 50, cantidad + 1))} aria-label="Más">＋</button>
          </div>
          <button className="t-btn t-btn-ancho" disabled={agotada(variante)} onClick={() => onListo(nueva)}>
            {agotada(variante) ? 'Agotado por hoy' : `${linea ? 'Guardar cambios' : 'Agregar al carrito'} · ${plata(total)}`}
          </button>
        </div>
      </div>
    </div>
  );
}
