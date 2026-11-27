import { useState } from 'react';
import { Logo } from '../componentes/Logo';
import { configurado, sb, traducirError } from '../lib/supabase';

export function Entrar() {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);
  const [ver, setVer] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    const { error } = await sb.auth.signInWithPassword({ email: correo.trim(), password: clave });
    setCargando(false);
    if (error) setError(traducirError(error.message));
  }

  return (
    <div className="entrar" style={{ background: '#000' }}>
      <div className="entrar-caja">
        <div className="entrar-logo">
          <Logo alto={200} />
          <span style={{ color: '#BDB6A8', fontSize: 14 }}>Equipo · ingreso personal</span>
        </div>
        <form className="tarjeta pila" onSubmit={entrar} style={{ padding: 22 }}>
          <h2>Entrar</h2>
          {!configurado && (
            <div className="aviso">Falta conectar la base de datos (archivo .env). Mira el LEEME.</div>
          )}
          <div className="campo">
            <label htmlFor="correo">Correo</label>
            <input id="correo" type="email" autoComplete="username" value={correo}
              onChange={(e) => setCorreo(e.target.value)} placeholder="tu@correo.com" required />
          </div>
          <div className="campo">
            <label htmlFor="clave">Clave</label>
            <div style={{ position: 'relative' }}>
              <input id="clave" type={ver ? 'text' : 'password'} autoComplete="current-password" value={clave}
                onChange={(e) => setClave(e.target.value)} required style={{ width: '100%', paddingRight: 48 }} />
              <button type="button" onClick={() => setVer(!ver)} aria-label={ver ? 'Ocultar clave' : 'Mostrar clave'} aria-pressed={ver}
                style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', width: 40, height: 40,
                  border: 0, background: 'transparent', color: '#6B665D', cursor: 'pointer', display: 'grid', placeItems: 'center' }}>
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" /><circle cx="12" cy="12" r="3" />
                  {ver && <path d="M4 4l16 16" />}
                </svg>
              </button>
            </div>
          </div>
          {error && <div className="error">{error}</div>}
          <button className="btn btn-principal btn-ancho" disabled={!configurado || cargando}>
            {cargando ? 'Entrando…' : 'Entrar a mi turno'}
          </button>
        </form>
      </div>
    </div>
  );
}
