// Sonido de Max Pizza: música instrumental y efectos 100 % ORIGINALES, generados en el navegador (Web Audio).
// No hay archivos de audio ni canciones de terceros → no hay temas de derechos de autor.
// Nunca suena solo: la música arranca únicamente después de que el cliente toca algo y la activó.

type Efecto = 'agregar' | 'quitar' | 'nivel' | 'confirmar';
type Prefs = { musica: boolean; efectos: boolean; volumen: number };
const CLAVE = 'maxpizza.tienda.sonido';
const leer = (): Prefs => { try { return { musica: false, efectos: true, volumen: 0.6, ...JSON.parse(localStorage.getItem(CLAVE) ?? '{}') }; } catch { return { musica: false, efectos: true, volumen: 0.6 }; } };

let ctx: AudioContext | null = null;
let maestro: GainNode, busMusica: GainNode, busEfectos: GainNode, eco: ConvolverNode;
let prefs = leer();
let interactuo = false;
let reloj: number | null = null;
let siguiente = 0, paso = 0;
const oyentes = new Set<(p: Prefs & { sonando: boolean }) => void>();
const avisar = () => oyentes.forEach((f) => f({ ...prefs, sonando: reloj != null }));

function iniciar() {
  if (ctx) return ctx;
  const AC = window.AudioContext || (window as any).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  maestro = ctx.createGain(); maestro.gain.value = prefs.volumen; maestro.connect(ctx.destination);
  busMusica = ctx.createGain(); busMusica.gain.value = 0.22;
  busEfectos = ctx.createGain(); busEfectos.gain.value = 0.5;
  // Eco suave (reverberación hecha con ruido que se apaga)
  eco = ctx.createConvolver();
  const largo = ctx.sampleRate * 1.6, ir = ctx.createBuffer(2, largo, ctx.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < largo; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / largo, 3); }
  eco.buffer = ir;
  const mojado = ctx.createGain(); mojado.gain.value = 0.28;
  busMusica.connect(maestro); busMusica.connect(eco); busEfectos.connect(maestro); eco.connect(mojado); mojado.connect(maestro);
  return ctx;
}

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

/** Una nota con envolvente suave */
function nota(destino: AudioNode, midi: number, t: number, dur: number, { tipo = 'triangle' as OscillatorType, vol = 0.3, ataque = 0.01, filtro = 3200 } = {}) {
  const c = ctx!;
  const o = c.createOscillator(), g = c.createGain(), f = c.createBiquadFilter();
  o.type = tipo; o.frequency.value = hz(midi);
  f.type = 'lowpass'; f.frequency.value = filtro;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + ataque);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(f); f.connect(g); g.connect(destino);
  o.start(t); o.stop(t + dur + 0.05);
}

// ── Música: progresión cálida tipo "noche de pizzería" (Do maj7 · La m7 · Re m7 · Sol 7), 84 pulsos por minuto ──
const ACORDES = [[48, 52, 55, 59], [45, 48, 52, 55], [50, 53, 57, 60], [43, 47, 50, 53]];
const ARPEGIO = [0, 2, 1, 3, 2, 1, 3, 2];   // posiciones dentro del acorde (corcheas)
const CORCHEA = 60 / 84 / 2;

function programar() {
  const c = ctx!;
  while (siguiente < c.currentTime + 0.4) {
    const compas = Math.floor(paso / 8) % ACORDES.length, acorde = ACORDES[compas], k = paso % 8;
    if (k === 0) {
      acorde.forEach((n) => nota(busMusica, n + 12, siguiente, CORCHEA * 8.4, { tipo: 'sine', vol: 0.07, ataque: 0.4, filtro: 1400 }));   // colchón
      nota(busMusica, acorde[0] - 12, siguiente, CORCHEA * 3.5, { tipo: 'sine', vol: 0.28, ataque: 0.02, filtro: 600 });                   // bajo
    }
    if (k === 4) nota(busMusica, acorde[2] - 12, siguiente, CORCHEA * 3, { tipo: 'sine', vol: 0.2, ataque: 0.02, filtro: 600 });
    // Melodía punteada (como mandolina suave), con un poco de "swing"
    const t = siguiente + (k % 2 ? CORCHEA * 0.12 : 0);
    if (!(compas === 3 && k > 5)) nota(busMusica, acorde[ARPEGIO[k]] + 24, t, CORCHEA * 1.6, { tipo: 'triangle', vol: k % 2 ? 0.07 : 0.1, filtro: 2600 });
    siguiente += CORCHEA; paso++;
  }
}

function sonarMusica(si: boolean) {
  if (si) {
    if (reloj != null || !interactuo) return;
    const c = iniciar(); if (!c) return;
    c.resume();
    busMusica.gain.cancelScheduledValues(c.currentTime);
    busMusica.gain.setValueAtTime(0.0001, c.currentTime); busMusica.gain.exponentialRampToValueAtTime(0.22, c.currentTime + 1.5);
    siguiente = c.currentTime + 0.05; paso = 0;
    reloj = window.setInterval(programar, 100); programar();
  } else if (reloj != null && ctx) {
    window.clearInterval(reloj); reloj = null;
    busMusica.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.2);
  }
  avisar();
}

// La primera vez que el cliente toca la página, si dejó la música activada antes, arranca (nunca antes)
if (typeof window !== 'undefined') {
  const primerToque = () => { interactuo = true; if (prefs.musica) sonarMusica(true); window.removeEventListener('pointerdown', primerToque); window.removeEventListener('keydown', primerToque); };
  window.addEventListener('pointerdown', primerToque); window.addEventListener('keydown', primerToque);
  document.addEventListener('visibilitychange', () => { if (!ctx) return; document.hidden ? ctx.suspend() : (prefs.musica || prefs.efectos) && ctx.resume(); });
}

export const sonido = {
  prefs: () => ({ ...prefs, sonando: reloj != null }),
  escuchar(f: (p: Prefs & { sonando: boolean }) => void) { oyentes.add(f); return () => { oyentes.delete(f); }; },
  cambiar(c: Partial<Prefs>) {
    interactuo = true;
    prefs = { ...prefs, ...c };
    localStorage.setItem(CLAVE, JSON.stringify(prefs));
    if (ctx) maestro.gain.setTargetAtTime(prefs.volumen, ctx.currentTime, 0.05);
    if ('musica' in c) sonarMusica(prefs.musica); else avisar();
  },
  /** Efectos cortos. Solo suenan si el cliente ya interactuó y los tiene activados. */
  efecto(e: Efecto) {
    if (!prefs.efectos || !interactuo || prefs.volumen <= 0) return;
    const c = iniciar(); if (!c) return; c.resume();
    const t = c.currentTime + 0.01;
    if (e === 'agregar') { nota(busEfectos, 76, t, 0.12, { tipo: 'sine', vol: 0.35 }); nota(busEfectos, 83, t + 0.07, 0.18, { tipo: 'sine', vol: 0.3 }); }
    if (e === 'quitar') { nota(busEfectos, 72, t, 0.12, { tipo: 'sine', vol: 0.25 }); nota(busEfectos, 65, t + 0.08, 0.2, { tipo: 'sine', vol: 0.22 }); }
    if (e === 'nivel') [72, 76, 79, 84].forEach((n, i) => nota(busEfectos, n, t + i * 0.08, 0.35, { tipo: 'triangle', vol: 0.25 }));
    if (e === 'confirmar') {
      [60, 64, 67, 72, 76, 79].forEach((n, i) => nota(busEfectos, n, t + i * 0.09, 0.5, { tipo: 'triangle', vol: 0.25 }));
      [72, 76, 79, 84].forEach((n) => nota(busEfectos, n, t + 0.62, 1.2, { tipo: 'sine', vol: 0.12, ataque: 0.05 }));
    }
  },
};
