import { useState } from 'react';
import { Logo } from '../componentes/Logo';
import { configurado, sb, traducirError } from '../lib/supabase';

export function Entrar() {
  const [correo, setCorreo] = useState('');
  const [clave, setClave] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setCargando(true);
    const { error } = await sb.auth.signInWithPassword({ email: correo.trim(), password: clave });
    setCargando(false);
    if (error) setError(traducirError(error.message));
  }

  return (
    <div className="entrar" style={{ background: 'var(--negro)' }}>
      <div className="entrar-caja">
        <div className="entrar-logo">
          <Logo size={72} />
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
            <input id="clave" type="password" autoComplete="current-password" value={clave}
              onChange={(e) => setClave(e.target.value)} required />
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
