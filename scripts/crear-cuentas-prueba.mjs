// Crea una cuenta de prueba por rol en tu proyecto de Supabase y le da acceso a las dos sedes.
// Uso (desde la carpeta max-pizza):  node scripts/crear-cuentas-prueba.mjs
// Necesita en max-pizza/.env (NO se sube a GitHub):
//   SUPABASE_URL=https://xxxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY=clave service_role (Settings → API). Es secreta: no va en la app.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../app/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

const env = Object.fromEntries(
  readFileSync(new URL('../.env', import.meta.url), 'utf8').split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
);
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en max-pizza/.env');
  process.exit(1);
}
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

// Clave de prueba común (solo para estas cuentas de demostración; cámbiala antes de usar la app de verdad)
const CLAVE = 'MaxPizza-prueba-2026';
const CUENTAS = [
  ['admin',   'Administración'],
  ['caja',    'Caja'],
  ['mesero',  'Mesero'],
  ['rapidas', 'Comidas rápidas'],
  ['armado',  'Armado'],
  ['tortas',  'Tortas'],
  ['insumos', 'Insumos'],
];

const { data: sedes, error: e1 } = await sb.from('sedes').select('id, nombre');
if (e1) { console.error('No pude leer las sedes. ¿Ya corriste las migraciones SQL?', e1.message); process.exit(1); }

const { data: lista } = await sb.auth.admin.listUsers({ perPage: 1000 });
for (const [rol, nombre] of CUENTAS) {
  const correo = `${rol}@maxpizza.test`;
  let user = lista.users.find((u) => u.email === correo);
  if (!user) {
    const { data, error } = await sb.auth.admin.createUser({
      email: correo, password: CLAVE, email_confirm: true, user_metadata: { nombre },
    });
    if (error) { console.error(correo, error.message); continue; }
    user = data.user;
  }
  for (const s of sedes) {
    await sb.from('accesos_sede').upsert({ perfil_id: user.id, sede_id: s.id, rol }, { onConflict: 'perfil_id,sede_id,rol' });
  }
  console.log(`✓ ${correo}  (${nombre})`);
}
console.log(`\nClave de todas las cuentas de prueba: ${CLAVE}`);
