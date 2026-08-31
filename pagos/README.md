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

## Seguridad

- El token vive como *secret* de Cloudflare: no está en este repositorio,
  no viaja al navegador y no se puede leer de vuelta.
- Solo se aceptan cobros pedidos desde `milos3d.com` (variable `ORIGENES`).
- Los avisos de pago se validan con la firma HMAC de Mercado Pago.
- Hay un tope de $200,000 por cobro como red de seguridad.
- Los montos que manda el navegador se recalculan aquí antes de cobrar.

## Probar sin cobrar de verdad

Usa las credenciales **de prueba** de Mercado Pago en el paso 3 y sus
tarjetas de prueba. Cuando todo funcione, repite el paso 3 con las de
producción y vuelve a `npx wrangler deploy`.
