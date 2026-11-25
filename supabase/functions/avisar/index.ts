// Max Pizza · función "avisar" (Supabase Edge Function)
// La llama la base cuando nace una notificación. Busca los celulares suscritos a ese rol y sede y les manda el aviso.
// Llaves: VAPID_PUBLIC y VAPID_PRIVATE van en los "Secrets" de Supabase, nunca en el código.
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

Deno.serve(async (req) => {
  try {
    // Limpia la llave por si se pegó con el nombre, comillas, espacios o "=" de más
    const limpia = (v?: string) => (v ?? '').trim().replace(/^VAPID_(PUBLIC|PRIVATE)\s*=\s*/i, '').replace(/["'\s]/g, '').replace(/=+$/, '');
    const pub = limpia(Deno.env.get('VAPID_PUBLIC')), priv = limpia(Deno.env.get('VAPID_PRIVATE'));
    if (!pub || !priv) return new Response('faltan las llaves VAPID', { status: 500 });
    webpush.setVapidDetails('https://max-pizza-roan.vercel.app', pub, priv);
    const { id } = await req.json();
    // Solo se avisa de notificaciones reales y recientes (nadie puede inventar el texto desde afuera)
    const { data: n } = await sb.from('notificaciones').select('*').eq('id', id).maybeSingle();
    if (!n || Date.now() - new Date(n.creada_en).getTime() > 5 * 60_000) return new Response('sin aviso', { status: 200 });

    let q = sb.from('push_suscripciones').select('id, endpoint, p256dh, auth');
    q = n.perfil_id ? q.eq('perfil_id', n.perfil_id) : q.eq('sede_id', n.sede_id).eq('rol', n.rol);
    const { data: subs } = await q;

    const aviso = JSON.stringify({ titulo: n.titulo, cuerpo: n.cuerpo ?? '', tipo: n.tipo, id: n.id });
    let enviados = 0;
    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, aviso,
          { TTL: 600, urgency: 'high' });
        enviados++;
      } catch (e) {
        // El celular ya no existe o quitó el permiso: se borra
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await sb.from('push_suscripciones').delete().eq('id', s.id);
      }
    }));
    return new Response(JSON.stringify({ enviados }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    return new Response(String(e), { status: 400 });
  }
});
