# Servicio de pagos — MILO'S 3D

Pieza mínima con servidor. Existe por una sola razón: el **Access Token de
Mercado Pago no puede estar en el sitio**, porque cualquiera que abra la página
lo podría leer y cobrar en tu nombre. Aquí vive escondido.

Corre en **Cloudflare Workers**. El plan gratis da 100,000 llamadas al día —
sobra con muchísimo.

## Qué hace

| Ruta | Para qué |
|---|---|
| `GET /salud` | Dice si está vivo y si ya tiene credenciales |
| `POST /preferencia` | Crea el cobro y devuelve la liga de Mercado Pago |
| `GET /estado?folio=1001` | Responde si esa cotización ya se pagó |
| `POST /webhook` | Mercado Pago avisa aquí cuando alguien paga |
| `POST /panel/token` | Entrega el token de GitHub, sólo con un código válido de 2 pasos |

## Instalarlo (una sola vez, ~10 minutos)

Necesitas una cuenta gratis en **cloudflare.com**.

```bash
cd pagos

# 1. Entrar a tu cuenta de Cloudflare (abre el navegador)
npx wrangler login

# 2. Publicar el servicio
npx wrangler deploy
```

Al terminar te da una dirección tipo
`https://milos3d-pagos.TU-USUARIO.workers.dev`. **Guárdala.**

### De dónde sale cada credencial de Mercado Pago

Entra a **mercadopago.com.mx → Tu negocio → Configuración → Gestión y
administración → Tus integraciones** y abre tu aplicación:

- **Credenciales de producción → Access Token**: es el del paso 3. Empieza con
  `APP_USR-`. Es el que cobra de verdad; el de *prueba* no mueve dinero.
- **Webhooks / Notificaciones**: registra la URL
  `https://TU-DIRECCION.workers.dev/webhook`, marca el evento **Pagos**, y
  copia la **clave secreta** que te muestra ahí — ésa es la del paso 4. Sirve
  para que nadie pueda inventar avisos de "ya pagó" que no vengan de Mercado
  Pago.

Sin el webhook los cobros funcionan igual; lo que no funciona es el botón
**"¿ya pagó con tarjeta?"** del panel, porque nadie le avisa al servicio.

```bash
# 3. Guardar el Access Token de Mercado Pago.
#    Te lo va a pedir en la terminal y NO se ve mientras lo pegas.
#    Nunca queda escrito en ningún archivo.
npx wrangler secret put MP_ACCESS_TOKEN

# 4. (Recomendado) La clave del webhook, para que nadie pueda
#    inventar avisos de pago falsos.
npx wrangler secret put MP_WEBHOOK_SECRET

# 5. (Opcional) Historial de cobros, para el botón "¿ya pagó?"
npx wrangler kv namespace create PAGOS
#    Copia el id que te imprime, pégalo en wrangler.toml
#    donde dice PEGA_AQUI_EL_ID y quita los # de esas tres líneas.
npx wrangler deploy
```

### Comprobar que quedó

Abre en el navegador `https://TU-DIRECCION.workers.dev/salud`. Debe decir:

```json
{ "ok": true, "mercadopago": true, "webhookFirmado": true, "historial": true }
```

Si `mercadopago` dice `false`, falta el paso 3.

## Conectarlo con el panel

En el panel → **Ajustes → Cobros con tarjeta** pega la dirección del servicio
y toca **Probar servicio**. Listo: las cotizaciones nuevas ya traen el botón
de pagar con tarjeta.

## Cambiar el token después

```bash
npx wrangler secret put MP_ACCESS_TOKEN   # lo reemplaza
```

Si crees que el token se filtró: entra a Mercado Pago → *Tus integraciones* →
tu aplicación → **Credenciales de producción** → genera unas nuevas.
Las viejas dejan de servir en el momento.

## Verificación de 2 pasos del panel (opcional)

Sin esto, el token de GitHub vive cifrado con la contraseña en cada celular.
Con esto, **el token no está en ningún celular**: lo guarda este servicio y sólo
lo entrega cuando alguien escribe el código de 6 dígitos de su app autenticadora.

Es un segundo factor de verdad porque **lo valida el servidor**. Una página
estática no puede hacer esto: cualquier código que revise el navegador se brinca
editando el JavaScript.

```bash
# 1. El token de GitHub pasa a vivir aquí
npx wrangler secret put GH_TOKEN

# 2. Una semilla distinta para cada quien.
#    Genera cada una con este comando y guarda el resultado:
node -e "const b='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';console.log([...crypto.getRandomValues(new Uint8Array(20))].map(x=>b[x%32]).join(''))"

npx wrangler secret put TOTP_ALE         # pega la semilla de Ale
npx wrangler secret put TOTP_EMILIOPAPA  # otra distinta
npx wrangler secret put TOTP_MILO        # otra distinta

# 3. Republicar
npx wrangler deploy
```

Cada quien abre su app autenticadora (Google Authenticator, 1Password, o el
llavero del iPhone) → **Agregar cuenta** → **Escribir clave manualmente**:

- Cuenta: `Milo's 3D (tu nombre)`
- Clave: la semilla que le tocó
- Tipo: **Basada en tiempo**

> El nombre del secreto sale del nombre del panel, en mayúsculas, sin acentos y
> sin espacios: "Ale" → `TOTP_ALE`, "Emilio papá" → `TOTP_EMILIOPAPA`,
> "Milo" → `TOTP_MILO`.

### Lista cerrada: quién puede ser administrador

Poner un `TOTP_` nuevo **no da de alta a nadie**. El Worker sólo entrega el token
de GitHub a las personas que están en la constante `ADMINS`, arriba de todo en
`worker.js`:

```js
const ADMINS = ["Ale", "Emilio papá", "Milo"];
```

Si llega una petición a `/panel/token` con cualquier otro nombre, se rechaza con
403 antes de siquiera mirar el código. Y si alguien agrega un `TOTP_JUAN` en
Cloudflare, el servicio lo ignora y lo reporta en `/salud` dentro de `ignorados`,
para que se note.

**Para agregar o quitar a alguien** hay que editar esa línea, subirla a GitHub y
volver a publicar el Worker (`npx wrangler deploy`). A propósito: así el cambio
queda firmado en el historial del repositorio y no se puede hacer desde el panel,
desde un celular, ni entrando a Cloudflare.

Después, en el panel → **Ajustes → Verificación de 2 pasos → Revisar si está
activo**. A partir de ahí, entrar pide contraseña **y** código.

Hay freno de fuerza bruta: 8 intentos fallidos por persona y se bloquea 15
minutos (necesita el KV del paso 5 de arriba).

## Seguridad

- El token vive como *secret* de Cloudflare: no está en este repositorio,
  no viaja al navegador y no se puede leer de vuelta.
- Solo se aceptan cobros pedidos desde `milos3d.com` (variable `ORIGENES`).
- Los avisos de pago se validan con la firma HMAC de Mercado Pago.
- Hay un tope de $200,000 por cobro como red de seguridad.
- Los montos que manda el navegador se recalculan aquí antes de cobrar.
- Los códigos de 2 pasos se comparan en tiempo constante y se acepta una
  ventana de ±30 segundos por si el reloj del celular va desfasado.

## Probar sin cobrar de verdad

Usa las credenciales **de prueba** de Mercado Pago en el paso 3 y sus
tarjetas de prueba. Cuando todo funcione, repite el paso 3 con las de
producción y vuelve a `npx wrangler deploy`.
