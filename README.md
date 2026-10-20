# HOST V4 — menú público y administración privada

## Archivos
- `index.html`: menú público, carrito y derivación a WhatsApp.
- `admin/index.html`: inicio de sesión y panel de administración.
- `config.js`: configuración pública de Supabase y número de WhatsApp.
- `schema.sql`: tablas, permisos RLS y almacenamiento de fotos.

## Instalación
1. Crear un proyecto en https://supabase.com.
2. En **SQL Editor**, ejecutar `schema.sql`.
3. En **Authentication > Users**, crear tu usuario administrador (email y contraseña). Copiar su **User UID**.
4. En **SQL Editor**, ejecutar `insert into public.admin_users(user_id) values ('PEGAR_USER_UID');` con el UUID real. No exponer esta instrucción como endpoint público.
5. En **Project Settings / API**, copiar la **Project URL** y la clave **anon/publishable** a `config.js`. No usar `service_role` ni claves secretas en GitHub.
6. Configurar `WHATSAPP_NUMBER` en `config.js` (solo dígitos, código de país + área + número).
7. Subir todos los archivos y la carpeta `admin` a la raíz de `host-menu` en GitHub. Activar GitHub Pages con rama `main`, carpeta `/ (root)`.
8. Abrir `https://allggames.github.io/host-menu/admin/`, ingresar y cargar categorías y productos. Menú público en `https://allggames.github.io/host-menu/`.

## Limitaciones importantes
- GitHub Pages es público: la seguridad del panel la aplican Supabase Auth + RLS, no la ruta `/admin/`.
- El pedido se registra **antes de abrir WhatsApp**, con estado `iniciado_whatsapp`. No confirma que el mensaje se haya enviado. Confirmar manualmente en el panel tras recibir el WhatsApp.
- Los precios y totales del navegador **no son fuente confiable**: verificar contra el catálogo al aceptar un pedido. Para producción conviene crear el pedido mediante una Edge Function que valide los precios y añada antispam/rate limiting.
- El catálogo ya es compartido entre todos los dispositivos, a diferencia de las versiones con localStorage.
- El carrito es temporal en cada navegador. No se almacenan pagos ni se procesan cobros.
- Las fotos se suben al bucket público `product-images`; usá imágenes sin información privada.
- Si ya cargaste productos en la versión anterior, **no se migran automáticamente**: deberás volver a cargarlos o hacer una importación posterior.
- Para cambios más rápidos del menú se puede agregar actualización en tiempo real o recarga periódica.
