// MAX: el pizzero de Max Pizza (personaje original, dibujado en código).
// Uniforme negro, gorro de chef con banda amarilla, bigote. Cambia de cara, movimiento, accesorio y mensaje
// según el estado REAL del carrito. Las animaciones son CSS: no tapan botones (no recibe toques salvo él mismo).
import { useEffect, useRef, useState } from 'react';

export type EstadoMax = 'bienvenida' | 'vacio' | 'uno' | 'dos' | 'tres' | 'fiesta' | 'confirmado';

/** Estado de MAX según las unidades del carrito (y si el pedido ya se confirmó) */
export function estadoMax(unidades: number, opts: { primeraVez?: boolean; confirmado?: boolean } = {}): EstadoMax {
  if (opts.confirmado) return 'confirmado';
  if (unidades === 0) return opts.primeraVez ? 'bienvenida' : 'vacio';
  if (unidades === 1) return 'uno';
  if (unidades === 2) return 'dos';
  if (unidades < 5) return 'tres';
  return 'fiesta';
}

const MENSAJES: Record<EstadoMax, string> = {
  bienvenida: '¡Hola! Soy MAX 👨‍🍳 ¿Qué se te antoja hoy?',
  vacio: 'Tu caja está vacía… ¿arrancamos con una pizza? 🍕',
  uno: '¡Buena elección! ¿Le sumamos algo para tomar? 🥤',
  dos: '¡Así se habla! Esto ya va tomando forma 😋',
  tres: '¡Pedido de campeones! 🏆 Ya lo estoy imaginando en el horno',
  fiesta: '¡Modo fiesta activado! 🎉 ¡Que nadie se quede con hambre!',
  confirmado: '¡Tu pedido ya va para el horno! 🔥 Gracias por pedir en Max Pizza',
};

/** El dibujo de MAX. `estado` decide cara, brazos y accesorio; `reaccion` dispara un salto o una cara triste. */
export function MaxDibujo({ estado, reaccion, tam = 96 }: { estado: EstadoMax; reaccion?: 'feliz' | 'triste' | null; tam?: number }) {
  const boca = estado === 'fiesta' || estado === 'confirmado' ? 'carcajada' : reaccion === 'triste' ? 'triste'
    : estado === 'vacio' ? 'neutra' : estado === 'bienvenida' ? 'sonrisa' : estado === 'uno' ? 'sonrisa' : 'grande';
  const brazo = estado === 'bienvenida' || estado === 'vacio' ? 'saluda' : estado === 'uno' ? 'pulgar' : estado === 'dos' ? 'pala'
    : estado === 'tres' ? 'pala' : 'arriba';
  return (
    <svg className={`max-svg est-${estado}${reaccion ? ' reac-' + reaccion : ''}`} viewBox="0 0 120 150" width={tam} height={tam * 1.25} aria-hidden="true">
      <defs>
        <linearGradient id="max-piel" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F2C9A0" /><stop offset="1" stopColor="#E2AC7F" /></linearGradient>
        <linearGradient id="max-oro" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#E3A21A" /><stop offset=".5" stopColor="#F6D58A" /><stop offset="1" stopColor="#E3A21A" /></linearGradient>
      </defs>
      <g className="max-cuerpo">
        <ellipse cx="60" cy="146" rx="30" ry="4" fill="rgba(0,0,0,.18)" className="max-sombra" />
        {/* Uniforme negro con botones y pañoleta amarilla */}
        <path d="M28 150 C28 112 40 98 60 98 C80 98 92 112 92 150 Z" fill="#141414" />
        <path d="M48 99 L60 114 L72 99 Z" fill="url(#max-oro)" />
        <circle cx="54" cy="124" r="2.2" fill="#E3A21A" /><circle cx="66" cy="124" r="2.2" fill="#E3A21A" />
        <circle cx="54" cy="136" r="2.2" fill="#E3A21A" /><circle cx="66" cy="136" r="2.2" fill="#E3A21A" />
        <text x="60" y="147" textAnchor="middle" fontSize="7" fontWeight="900" fill="#E3A21A" fontFamily="Montserrat, sans-serif">MAX</text>

        {/* Brazo izquierdo (fijo, en la cintura) */}
        <path d="M33 112 C22 120 22 132 32 138" stroke="#141414" strokeWidth="10" fill="none" strokeLinecap="round" />
        <circle cx="33" cy="139" r="5" fill="url(#max-piel)" />

        {/* Brazo derecho: saluda, pulgar, pala de pizza o brazos arriba */}
        <g className={`max-brazo b-${brazo}`}>
          <path d="M86 112 C98 104 102 92 100 82" stroke="#141414" strokeWidth="10" fill="none" strokeLinecap="round" />
          <circle cx="100" cy="78" r="6" fill="url(#max-piel)" />
          {brazo === 'pulgar' && <path d="M99 72 q1 -7 4 -6 q2 1 0 7" fill="url(#max-piel)" stroke="#C98A5E" strokeWidth=".8" />}
          {brazo === 'pala' && <g className="max-pala">
            <rect x="99" y="38" width="3" height="42" rx="1.5" fill="#9B6A35" />
            <ellipse cx="100.5" cy="34" rx="13" ry="9" fill="#C9934D" />
            <circle cx="100.5" cy="33" r="8.5" fill="#E7A94F" /><circle cx="100.5" cy="33" r="7" fill="#C8432B" /><circle cx="100.5" cy="33" r="6.2" fill="#F2C14E" />
            <circle cx="98" cy="31" r="1.5" fill="#B8322A" /><circle cx="103" cy="34" r="1.5" fill="#B8322A" /><circle cx="100" cy="36" r="1.2" fill="#3E8E41" />
          </g>}
        </g>
        {brazo === 'arriba' && <g className="max-brazo b-arriba2">
          <path d="M34 112 C22 104 18 92 20 82" stroke="#141414" strokeWidth="10" fill="none" strokeLinecap="round" />
          <circle cx="20" cy="78" r="6" fill="url(#max-piel)" />
        </g>}

        {/* Cabeza */}
        <g className="max-cabeza">
          <circle cx="60" cy="72" r="27" fill="url(#max-piel)" />
          <circle cx="34" cy="74" r="5" fill="#E2AC7F" /><circle cx="86" cy="74" r="5" fill="#E2AC7F" />
          {/* Gorro de chef blanco con banda amarilla */}
          <g className="max-gorro">
            <path d="M36 56 C30 40 42 28 52 34 C54 22 70 20 74 32 C84 26 94 38 86 54 Z" fill="#fff" stroke="#E6DFD1" strokeWidth="1.5" />
            <rect x="35" y="49" width="50" height="11" rx="3" fill="url(#max-oro)" />
            <text x="60" y="57.5" textAnchor="middle" fontSize="6.5" fontWeight="900" fill="#141414" fontFamily="Montserrat, sans-serif">MAX PIZZA</text>
          </g>
          {/* Ojos (parpadean) o gafas de sol en modo fiesta */}
          {estado === 'fiesta' ? (
            <g><rect x="41" y="66" width="16" height="9" rx="3" fill="#141414" /><rect x="63" y="66" width="16" height="9" rx="3" fill="#141414" />
              <path d="M57 69 h6" stroke="#141414" strokeWidth="2" /><path d="M44 68 l4 0" stroke="#E3A21A" strokeWidth="1.4" strokeLinecap="round" /></g>
          ) : estado === 'confirmado' ? (
            <g fill="none" stroke="#3b2a1d" strokeWidth="2.4" strokeLinecap="round"><path d="M44 71 q5 -6 10 0" /><path d="M66 71 q5 -6 10 0" /></g>
          ) : (
            <g className="max-ojos"><ellipse cx="49" cy="70" rx="3.4" ry="4.2" fill="#3b2a1d" /><ellipse cx="71" cy="70" rx="3.4" ry="4.2" fill="#3b2a1d" />
              <circle cx="50.2" cy="68.6" r="1.1" fill="#fff" /><circle cx="72.2" cy="68.6" r="1.1" fill="#fff" /></g>
          )}
          {/* Cachetes */}
          <circle cx="43" cy="80" r="4" fill="#F09A8A" opacity=".5" /><circle cx="77" cy="80" r="4" fill="#F09A8A" opacity=".5" />
          {/* Bigote */}
          <path d="M60 81 C54 77 44 79 42 85 C48 83 54 84 60 84 C66 84 72 83 78 85 C76 79 66 77 60 81 Z" fill="#3b2a1d" />
          {/* Boca */}
          {boca === 'sonrisa' && <path d="M53 88 q7 6 14 0" stroke="#7a3b2a" strokeWidth="2.4" fill="none" strokeLinecap="round" />}
          {boca === 'grande' && <path d="M51 87 q9 10 18 0 z" fill="#7a3b2a" />}
          {boca === 'carcajada' && <g><path d="M49 86 q11 15 22 0 z" fill="#7a3b2a" /><path d="M53 92 q7 3 14 0" fill="#E86A5C" /></g>}
          {boca === 'neutra' && <path d="M54 89 h12" stroke="#7a3b2a" strokeWidth="2.4" strokeLinecap="round" />}
          {boca === 'triste' && <path d="M53 91 q7 -5 14 0" stroke="#7a3b2a" strokeWidth="2.4" fill="none" strokeLinecap="round" />}
        </g>
        {/* Accesorios por estado */}
        {estado === 'fiesta' && <g className="max-fiesta"><text x="18" y="30" fontSize="14">🎉</text><text x="92" y="22" fontSize="12">✨</text></g>}
        {estado === 'confirmado' && <g className="max-caja">
          <rect x="16" y="118" width="34" height="22" rx="3" fill="#141414" stroke="#E3A21A" strokeWidth="1.5" />
          <text x="33" y="132" textAnchor="middle" fontSize="6" fontWeight="900" fill="#E3A21A" fontFamily="Montserrat, sans-serif">MAX</text>
          <path d="M22 116 q3 -6 0 -10 M30 116 q3 -6 0 -10 M38 116 q3 -6 0 -10" stroke="#c8c0b0" strokeWidth="1.4" fill="none" className="max-vapor" />
        </g>}
      </g>
    </svg>
  );
}

/** MAX flotante en la tienda: reacciona a lo que pasa en el carrito y habla en una burbuja que se esconde sola. */
export function Max({ unidades, oculto = false }: { unidades: number; oculto?: boolean }) {
  const [primeraVez, setPrimeraVez] = useState(() => !sessionStorage.getItem('maxpizza.max.saludo'));
  const estado = estadoMax(unidades, { primeraVez });
  const [reaccion, setReaccion] = useState<'feliz' | 'triste' | null>(null);
  const [habla, setHabla] = useState(true);
  const [plegado, setPlegado] = useState(() => sessionStorage.getItem('maxpizza.max.plegado') === '1');
  const antes = useRef(unidades);

  // Bienvenida solo la primera vez de la visita
  useEffect(() => {
    if (!primeraVez) return;
    sessionStorage.setItem('maxpizza.max.saludo', '1');
    const t = setTimeout(() => setPrimeraVez(false), 7000);
    return () => clearTimeout(t);
  }, [primeraVez]);

  // Reacción al agregar o quitar (salto feliz / cara triste) y vuelve a hablar
  useEffect(() => {
    if (unidades === antes.current) return;
    const r = unidades > antes.current ? 'feliz' : 'triste';
    antes.current = unidades;
    setReaccion(r); setHabla(true);
    if (unidades > 0) setPrimeraVez(false);
    const t = setTimeout(() => setReaccion(null), 900);
    return () => clearTimeout(t);
  }, [unidades]);

  // La burbuja se esconde sola a los 5 s para no estorbar
  useEffect(() => {
    if (!habla) return;
    const t = setTimeout(() => setHabla(false), 5500);
    return () => clearTimeout(t);
  }, [habla, estado]);

  if (oculto) return null;
  const mensaje = reaccion === 'triste' && unidades > 0 ? '¡Uy! Bueno, lo quitamos. ¿Algo más rico? 😌' : MENSAJES[estado];
  const plegar = (v: boolean) => { setPlegado(v); sessionStorage.setItem('maxpizza.max.plegado', v ? '1' : '0'); };

  return (
    <div className={'max-zona' + (plegado ? ' plegado' : '')}>
      {habla && !plegado && (
        <div className="max-burbuja" role="status" aria-live="polite">
          {mensaje}
          <button className="max-cerrar" aria-label="Ocultar mensaje" onClick={() => setHabla(false)}>✕</button>
        </div>
      )}
      <button className="max-boton" aria-label={plegado ? 'Mostrar a MAX' : 'MAX, el pizzero. Toca para que te hable'}
        onClick={() => (plegado ? plegar(false) : setHabla(!habla))}
        onDoubleClick={() => plegar(true)}>
        <MaxDibujo estado={estado} reaccion={reaccion} tam={plegado ? 40 : 66} />
      </button>
      {!plegado && <button className="max-plegar" aria-label="Esconder a MAX" onClick={() => plegar(true)}>–</button>}
    </div>
  );
}
