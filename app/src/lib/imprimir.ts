// Impresión de tickets (80 mm / 58 mm). Usa la impresión del sistema: sirve con cualquier
// impresora instalada en el computador o, en Android, con la app de impresión de la impresora.
import { plata } from './formato';

export type LineaTicket = { izq: string; der?: string; fuerte?: boolean; nota?: string };

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

export function ancho(): '80' | '58' { return localStorage.getItem('mp.ticket') === '58' ? '58' : '80'; }
export function cambiarAncho(a: '80' | '58') { localStorage.setItem('mp.ticket', a); }

export function imprimirTicket(titulo: string, sub: string[], lineas: LineaTicket[], pie?: string[]) {
  const mm = ancho();
  const fecha = new Date().toLocaleString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'short', timeStyle: 'short' });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>
    @page { size: ${mm}mm auto; margin: 2mm; }
    body { font-family: 'Courier New', monospace; font-size: ${mm === '58' ? 11 : 13}px; width: ${Number(mm) - 6}mm; margin: 0; color: #000; }
    h1 { font-size: 1.35em; text-align: center; margin: 0 0 2px; } .c { text-align: center; }
    .l { display: flex; justify-content: space-between; gap: 6px; } .f { font-weight: bold; font-size: 1.15em; }
    .n { font-size: .9em; padding-left: 10px; } hr { border: 0; border-top: 1px dashed #000; margin: 5px 0; }
  </style></head><body>
    <h1>MAX PIZZA</h1><div class="c">¡Más sabor!</div><hr>
    <div class="c f">${esc(titulo)}</div>${sub.map((s) => `<div class="c">${esc(s)}</div>`).join('')}<div class="c">${fecha}</div><hr>
    ${lineas.map((l) => `<div class="l${l.fuerte ? ' f' : ''}"><span>${esc(l.izq)}</span><span>${esc(l.der ?? '')}</span></div>${l.nota ? `<div class="n">* ${esc(l.nota)}</div>` : ''}`).join('')}
    ${pie?.length ? `<hr>${pie.map((p) => `<div class="c">${esc(p)}</div>`).join('')}` : ''}
  </body></html>`;
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;width:0;height:0;border:0;right:0;bottom:0';
  document.body.appendChild(f);
  const d = f.contentDocument!;
  d.open(); d.write(html); d.close();
  setTimeout(() => { f.contentWindow!.focus(); f.contentWindow!.print(); setTimeout(() => f.remove(), 60000); }, 300);
}

export const lineaPlata = (izq: string, v: number, fuerte?: boolean): LineaTicket => ({ izq, der: plata(v), fuerte });
