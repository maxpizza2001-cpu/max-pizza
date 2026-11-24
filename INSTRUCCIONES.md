# Max Pizza · cómo usarla en cada dispositivo

## Instalar
- **Celulares Android (Mesero, Armado, Tortas, Insumos, Comidas rápidas):** descargar `Max-Pizza.apk` de la página
  *Releases* del repositorio en GitHub → abrir el archivo → permitir "instalar apps de origen desconocido" → Instalar.
  Aparece el ícono de Max Pizza.
- **Computador de Caja:** abrir la dirección web de la app en Chrome y usar "Instalar aplicación" (ícono en la barra de
  direcciones) o dejarla en pantalla completa (F11).
- **Tablet fija de Comidas rápidas:** APK o la web; entrar con una cuenta de Comidas rápidas y dejar abierta
  **Tablet de comandas**. Subir el volumen para el aviso de comandas nuevas.
- **Administración:** web en el computador o APK en el celular.

## Primer día
1. Administración entra → **Equipo → ＋ Nuevo integrante** para cada persona (correo, clave, rol y sede).
2. **Catálogo**: revisar productos y precios. **Stock bajo**: revisar mínimos. **Inventario**: poner los saldos reales (Ajustar).
3. Cada persona entra con su correo y clave, elige sede y toca **Iniciar turno**.

## Qué funciona y qué depende de servicios externos
- Todo lo de las 8 pantallas funciona con **Supabase** (base de datos, cuentas y tiempo real). Sin internet la app guarda
  borradores de pedidos y avisa "Pendiente de envío".
- **APK:** la arma GitHub automáticamente en cada cambio (necesita los secretos `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`).
- **Web:** publicada en Vercel (carpeta `app`, mismas dos variables).
- **WhatsApp a proveedores:** abre WhatsApp con el mensaje armado; el envío lo hace la persona.

## Cuentas de prueba
`admin@ caja@ mesero@ rapidas@ armado@ tortas@ insumos@maxpizza.test` (clave en `supabase/cuentas-prueba.sql`).
Desactivarlas en **Equipo** antes de arrancar con el equipo real.
