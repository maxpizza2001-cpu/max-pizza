// Base de datos de prueba en memoria (PGlite = PostgreSQL real en Node) con un "auth" mínimo como el de Supabase.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const dirMig = new URL('../supabase/migrations/', import.meta.url);

export async function nuevaBase() {
  const db = new PGlite();
  await db.exec(`
    create role authenticated; create role anon;
    create schema auth;
    create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  for (const f of readdirSync(dirMig).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(new URL(f, dirMig), 'utf8'));
    } catch (e) {
      throw new Error(`Falló la migración ${f}: ${e.message}`);
    }
  }
  const sedes = Object.fromEntries((await db.query(`select nombre, id from sedes`)).rows.map((r) => [r.nombre, r.id]));
  return new Base(db, sedes);
}

class Base {
  constructor(db, sedes) { this.db = db; this.sedes = sedes; this.principal = sedes['Sede Principal']; }

  async q(sql, params = []) { return (await this.db.query(sql, params)).rows; }
  async uno(sql, params = []) { return (await this.q(sql, params))[0]; }

  async usuario(nombre, accesos) {   // accesos: [[sedeId, rol], ...]
    const id = randomUUID();
    await this.db.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3)`,
      [id, `${nombre.toLowerCase()}@maxpizza.test`, { nombre }]);
    for (const [sede, rol] of accesos) {
      await this.db.query(`insert into accesos_sede (perfil_id, sede_id, rol) values ($1,$2,$3)`, [id, sede, rol]);
    }
    return id;
  }

  async como(uid) { await this.db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [uid ?? '']); }

  async rpc(fn, args) {
    const keys = Object.keys(args);
    const sql = `select ${fn}(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')}) as r`;
    return (await this.db.query(sql, keys.map((k) => args[k]))).rows[0].r;
  }

  async producto(nombre) { return (await this.uno(`select id from productos where nombre = $1`, [nombre])).id; }
  async insumo(codigo) { return (await this.uno(`select id from insumos where codigo = $1`, [codigo])).id; }

  async saldo(sede, ubic, codigo) {
    return this.uno(`select fisico::float as fisico, reservado::float as reservado, disponible::float as disponible
      from v_saldos where sede_id = $1 and ubicacion = $2 and insumo_codigo = $3`, [sede, ubic, codigo]);
  }

  async tareasAbiertas(sede, rol, titulo) {
    return this.q(`select * from tareas where sede_id = $1 and rol = $2 and titulo = $3 and estado in ('pendiente','en_proceso')`, [sede, rol, titulo]);
  }
}

export const op = () => randomUUID();
