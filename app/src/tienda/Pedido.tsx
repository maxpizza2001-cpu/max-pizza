// Carrito y checkout: revisar productos, datos del cliente, domicilio o recoger, y medio de pago.
import { useEffect, useRef, useState } from 'react';
import { nuevaOperacion, sb } from '../lib/supabase';
import { plata } from '../lib/formato';
import { Caja } from './Caja';
import { MaxDibujo } from './Max';
import { MEDIOS, precioLinea, useGuardadoLocal, type InfoTienda, type LineaCarrito, type Plato } from './modelo';

export type DatosCliente = {
  nombre: string; celular: string; entrega: 'domicilio' | 'recoger'; direccion: string; barrio: string; zona_id: string;
  referencia: string; indicaciones: string; medio: string; paga_con: string; codigo_promo?: string;
};
const DATOS_VACIOS: DatosCliente = { nombre: '', celular: '', entrega: 'domicilio', direccion: '', barrio: '', zona_id: '',
  referencia: '', indicaciones: '', medio: 'efectivo', paga_con: '' };

export type Enviado = { codigo: string; numero: number; total: number; celular: string; nombre: string; entrega: string };

export function Pedido({ lineas, platos, info, sede, sedeNombre, onCantidad, onEditar, onQuitar, onCerrar, onEnviado, onSeguir }: {
  lineas: LineaCarrito[]; platos: Plato[]; info: InfoTienda; sede: string; sedeNombre: string; onEnviado: (e: Enviado) => void; onSeguir: (e: Enviado) => void;
  onCantidad: (clave: string, cantidad: number) => void; onEditar: (l: LineaCarrito) => void; onQuitar: (clave: string) => void; onCerrar: () => void;
}) {
  const [paso, setPaso] = useState<'carrito' | 'datos' | 'listo'>('carrito');
  const [d, setD] = useGuardadoLocal<DatosCliente>('maxpizza.tienda.cliente', DATOS_VACIOS);
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [errores, setErrores] = useState<string[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [hecho, setHecho] = useState<Enviado | null>(null);
  const op = useRef(nuevaOperacion());   // mismo id si el cliente reintenta: el pedido no se duplica
  const aj = info.ajustes;
  const medios = aj?.medios?.length ? aj.medios : ['efectivo'];
  const entrega = aj && !aj.domicilio ? 'recoger' : aj && !aj.recoger ? 'domicilio' : d.entrega;
  const medio = medios.includes(d.medio) ? d.medio : medios[0];

  const subtotal = lineas.reduce((s, l) => s + precioLinea(l) * l.cantidad, 0);
  const zona = info.zonas.find((z) => z.id === d.zona_id);
  const domicilio = entrega === 'domicilio' ? Number(zona?.tarifa ?? 0) : 0;
  const [promo, setPromo] = useState<{ nombre: string; descuento: number } | null>(null);
  const codigoPromo = (d.codigo_promo ?? '').trim();
  useEffect(() => {   // el servidor dice qué promoción aplica (el valor final lo vuelve a calcular al pedir)
    if (!subtotal) { setPromo(null); return; }
    const t = setTimeout(() => sb.rpc('tienda_promo', { p_sede: sede, p_subtotal: subtotal, p_codigo: codigoPromo || null })
      .then(({ data }) => setPromo(data ? { nombre: (data as any).nombre, descuento: Number((data as any).descuento) } : null)), 350);
    return () => clearTimeout(t);
  }, [sede, subtotal, codigoPromo]);
  const descuento = promo?.descuento ?? 0;
  const total = subtotal + domicilio - descuento;
  const minimo = Number(aj?.pedido_minimo ?? 0);
  const pagaCon = Number(d.paga_con || 0);
  const cambio = medio === 'efectivo' && pagaCon > 0 ? pagaCon - total : null;
  const cambiar = (c: Partial<DatosCliente>) => setD({ ...d, ...c });

  function revisar() {
    const e: string[] = [];
    if (d.nombre.trim().length < 3) e.push('Escribe tu nombre completo.');
    if (!/^3\d{9}$/.test(d.celular.replace(/\D/g, ''))) e.push('Escribe un celular de 10 dígitos (ej. 3001234567).');
    if (entrega === 'domicilio') {
      if (d.direccion.trim().length < 5) e.push('Escribe la dirección.');
      if (d.barrio.trim().length < 2) e.push('Escribe el barrio.');
      if (!zona) e.push('Escoge la zona de entrega.');
    }
    if (medio === 'efectivo' && d.paga_con && pagaCon < total) e.push(`Con ${plata(pagaCon)} no alcanza: el total es ${plata(total)}.`);
    if (subtotal < minimo) e.push(`El pedido mínimo es ${plata(minimo)}.`);
    setErrores(e);
    if (!e.length) enviar();
  }

  async function enviar() {
    setEnviando(true);
    try {
      let ruta = '';
      if (comprobante && medio !== 'efectivo') {
        const ext = (comprobante.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
        ruta = `${sede}/${op.current}.${ext}`;
        const { error } = await sb.storage.from('comprobantes').upload(ruta, comprobante, { upsert: false });
        if (error && !/exists|duplicate/i.test(error.message)) throw new Error('No pudimos subir el comprobante. Intenta otra vez o envíalo sin él.');
      }
      const { data, error } = await sb.rpc('tienda_crear_pedido', {
        p_op: op.current, p_sede: sede,
        p_lineas: lineas.map((l) => (l.combo_id ? { combo_id: l.combo_id, cantidad: l.cantidad, nota: l.nota }
          : { producto_id: l.producto_id, cantidad: l.cantidad, opciones: l.opciones.map((o) => o.id), nota: l.nota })),
        p_datos: { ...d, entrega, medio, paga_con: medio === 'efectivo' ? d.paga_con : '', comprobante: ruta },
      });
      if (error) throw new Error(/fetch|network/i.test(error.message) ? 'Se cayó la conexión. Toca otra vez: tu pedido no se va a repetir.' : error.message);
      const r = data as { codigo: string; numero: number; total: number };
      const e: Enviado = { codigo: r.codigo, numero: r.numero, total: Number(r.total), celular: d.celular.replace(/D/g, ''), nombre: d.nombre.trim(), entrega };
      op.current = nuevaOperacion();
      setHecho(e); setPaso('listo'); onEnviado(e);
    } catch (x) {
      setErrores([(x as Error).message || 'No pudimos enviar el pedido.']);
    } finally { setEnviando(false); }
  }

  return (
    <div className="t-fondo" onClick={onCerrar}>
      <div className="t-hoja t-hoja-alta" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Tu pedido">
        <button className="t-cerrar" onClick={onCerrar} aria-label="Cerrar">✕</button>
        <div className="t-hoja-cuerpo">
          <div className="t-pasos">
            <span className={paso === 'carrito' ? 'on' : 'ok'}>1 · Carrito</span>
            <span className={paso === 'datos' ? 'on' : paso === 'listo' ? 'ok' : ''}>2 · Tus datos</span>
            <span className={paso === 'listo' ? 'on' : ''}>3 · Confirmar</span>
          </div>

          {paso === 'carrito' && <>
            <h2>Tu pedido <span className="t-gris">· {sedeNombre}</span></h2>
            {lineas.length > 0 && <Caja lineas={lineas} platos={platos} compacta />}
            {!lineas.length && <div className="t-vacio">🍕<br />Tu carrito está vacío.<br />Agrega algo rico del menú.</div>}
            {lineas.map((l) => (
              <div key={l.clave} className="t-linea">
                <div className="t-linea-txt">
                  <b>{l.nombre}{l.tamano ? ` · ${l.tamano}` : ''}</b>
                  {l.opciones.map((o) => <span key={o.id} className="t-gris">+ {o.nombre}</span>)}
                  {l.nota && <span className="t-nota">“{l.nota}”</span>}
                  {l.detalle && <span className="t-gris">{l.detalle}</span>}
                  <span className="t-acciones">{!l.combo_id && <button onClick={() => onEditar(l)}>Modificar</button>}<button onClick={() => onQuitar(l.clave)}>Quitar</button></span>
                </div>
                <div className="t-linea-der">
                  <b>{plata(precioLinea(l) * l.cantidad)}</b>
                  <div className="t-cantidad t-cantidad-chica">
                    <button onClick={() => l.cantidad > 1 ? onCantidad(l.clave, l.cantidad - 1) : onQuitar(l.clave)} aria-label="Menos">−</button>
                    <b>{l.cantidad}</b>
                    <button onClick={() => onCantidad(l.clave, Math.min(50, l.cantidad + 1))} aria-label="Más">＋</button>
                  </div>
                </div>
              </div>
            ))}
          </>}

          {paso === 'datos' && <>
            <h2>¿Cómo lo quieres?</h2>
            <div className="t-dos">
              {(!aj || aj.domicilio) && <button className={'t-opcion-grande' + (entrega === 'domicilio' ? ' on' : '')} onClick={() => cambiar({ entrega: 'domicilio' })}>🛵<b>Domicilio</b></button>}
              {(!aj || aj.recoger) && <button className={'t-opcion-grande' + (entrega === 'recoger' ? ' on' : '')} onClick={() => cambiar({ entrega: 'recoger' })}>🏪<b>Recoger en {sedeNombre}</b></button>}
            </div>

            <h3 className="t-sub">Tus datos</h3>
            <input className="t-campo" placeholder="Nombre completo" autoComplete="name" value={d.nombre} onChange={(e) => cambiar({ nombre: e.target.value })} />
            <input className="t-campo" placeholder="Celular (ej. 3001234567)" inputMode="tel" autoComplete="tel" value={d.celular} onChange={(e) => cambiar({ celular: e.target.value.replace(/[^\d ]/g, '').slice(0, 13) })} />

            {entrega === 'domicilio' && <>
              <h3 className="t-sub">¿A dónde lo llevamos?</h3>
              <input className="t-campo" placeholder="Dirección (ej. Calle 10 # 5-20, apto 301)" autoComplete="street-address" value={d.direccion} onChange={(e) => cambiar({ direccion: e.target.value })} />
              <input className="t-campo" placeholder="Barrio" value={d.barrio} onChange={(e) => cambiar({ barrio: e.target.value })} />
              <select className="t-campo" value={d.zona_id} onChange={(e) => cambiar({ zona_id: e.target.value })}>
                <option value="">Zona de entrega…</option>
                {info.zonas.map((z) => <option key={z.id} value={z.id}>{z.nombre} · domicilio {plata(z.tarifa)}{z.minutos_min ? ` · ${z.minutos_min}–${z.minutos_max ?? z.minutos_min} min` : ''}</option>)}
              </select>
              <input className="t-campo" placeholder="Referencia (ej. frente al parque, casa azul)" value={d.referencia} onChange={(e) => cambiar({ referencia: e.target.value })} />
            </>}
            <textarea className="t-campo" rows={2} placeholder="Indicaciones adicionales (opcional)" value={d.indicaciones} onChange={(e) => cambiar({ indicaciones: e.target.value })} />

            <h3 className="t-sub">¿Cómo pagas?</h3>
            <div className="t-opciones">
              {medios.map((m) => (
                <label key={m} className={'t-opcion' + (medio === m ? ' on' : '')}>
                  <input type="radio" name="medio" checked={medio === m} onChange={() => cambiar({ medio: m })} /><span>{MEDIOS[m] ?? m}</span>
                </label>
              ))}
            </div>
            {medio === 'efectivo' && <>
              <input className="t-campo" inputMode="numeric" placeholder="¿Con cuánto pagas? (para llevarte las vueltas)" value={d.paga_con ? plata(Number(d.paga_con)) : ''}
                onChange={(e) => cambiar({ paga_con: e.target.value.replace(/\D/g, '') })} />
              {cambio != null && cambio >= 0 && <div className="t-info">Te llevamos <b>{plata(cambio)}</b> de vueltas.</div>}
            </>}
            {(medio === 'nequi' || medio === 'transferencia') && <div className="t-info">
              {medio === 'nequi' && aj?.nequi_numero && <>Nequi: <b>{aj.nequi_numero}</b><br /></>}
              {medio === 'transferencia' && aj?.cuenta_texto && <>{aj.cuenta_texto}<br /></>}
              Puedes adjuntar el comprobante ahora; lo revisamos antes de preparar.
              <label className="t-adjuntar">📎 {comprobante ? comprobante.name : 'Adjuntar comprobante'}
                <input type="file" accept="image/*,application/pdf" hidden onChange={(e) => setComprobante(e.target.files?.[0] ?? null)} /></label>
            </div>}
            {info.hay_codigos && <>
              <h3 className="t-sub">¿Tienes un código de promoción?</h3>
              <input className="t-campo t-campo-codigo" placeholder="Código" value={d.codigo_promo ?? ''} onChange={(e) => cambiar({ codigo_promo: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} />
            </>}
            {errores.length > 0 && <div className="t-errores">{errores.map((e) => <div key={e}>• {e}</div>)}</div>}
          </>}

          {paso === 'listo' && hecho && <div className="t-listo">
            <div className="max-final"><MaxDibujo estado="confirmado" tam={120} /></div>
            <h2>¡Recibimos tu pedido, {hecho.nombre.split(' ')[0]}!</h2>
            <div className="t-codigo">{hecho.codigo}</div>
            <p>Pedido #{hecho.numero} · Total <b>{plata(hecho.total)}</b><br />
              {hecho.entrega === 'domicilio' ? 'Ya entró a la cocina. Te avisamos cuando salga para tu casa.' : `Te avisamos cuando esté listo para recoger en ${sedeNombre}.`}</p>
            <div className="t-info">Guarda este código: con él y tu celular podrás seguir tu pedido.</div>
            <button className="t-btn t-btn-ancho" onClick={() => onSeguir(hecho)}>Seguir mi pedido en vivo</button>
            <button className="t-enlace-osc" onClick={onCerrar}>Seguir viendo el menú</button>
          </div>}
        </div>

        {lineas.length > 0 && paso !== 'listo' && (
          <div className="t-hoja-pie t-totales">
            <div className="t-fila"><span>Subtotal</span><span>{plata(subtotal)}</span></div>
            {paso === 'datos' && entrega === 'domicilio' && <div className="t-fila"><span>Domicilio</span><span>{zona ? plata(domicilio) : 'Escoge la zona'}</span></div>}
            {descuento > 0 && <div className="t-fila t-verde"><span>🎁 {promo?.nombre}</span><span>− {plata(descuento)}</span></div>}
            <div className="t-fila t-total"><span>Total</span><span>{plata(total)}</span></div>
            {minimo > 0 && subtotal < minimo && <div className="t-gris">Pedido mínimo {plata(minimo)}</div>}
            {aj && !aj.abierta && <div className="t-errores">La tienda está cerrada en este momento. {aj.horario_texto}</div>}
            <div className="fila" style={{ gap: 10 }}>
              {paso === 'datos' && <button className="t-btn-sec" onClick={() => setPaso('carrito')}>← Carrito</button>}
              <button className="t-btn t-btn-ancho" disabled={(!!aj && !aj.abierta) || enviando}
                onClick={() => paso === 'carrito' ? setPaso('datos') : revisar()}>
                {paso === 'carrito' ? 'Continuar' : enviando ? 'Enviando…' : `Confirmar pedido · ${plata(total)}`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
