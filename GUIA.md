# 🤖 MILO'S 3D — Guía de la tienda

## 📱 El panel: milos3d.com/admin/

Ahí se dan de alta productos, se calculan precios y se hacen cotizaciones.
Funciona desde el celular y **no necesita computadora**.

### Instalarlo en el celular (una sola vez)

1. Abre **milos3d.com/admin/** en Safari (iPhone) o Chrome (Android).
2. Toca **Compartir** → **Agregar a pantalla de inicio**.
3. Queda como una app con el logo de Milo's.
4. La primera vez que entras, pon **tu nombre** y el **PIN** que quieras.
   Los dos quedan guardados en ese celular.

### Son tres: Emilio, su esposa y su hijo

Cada quien pone su nombre en su propio celular. El panel guarda **quién hizo qué**
y lo muestra en el catálogo:

> *alta **Karla** · datos **Emilio** · publicó **Emilio***

Así siempre se sabe quién dio de alta el producto, quién llenó los datos de
impresión y quién lo subió al sitio. Para cambiar tu nombre:
**Ajustes → Mi nombre en este celular**.

### Conectar el panel con el sitio (una sola vez)

Para que el botón **Publicar** funcione, hay que darle un permiso de GitHub:

1. github.com → foto de perfil → **Settings**
2. Hasta abajo: **Developer settings** → **Personal access tokens** → **Fine-grained tokens**
3. **Generate new token**. Nombre: `Milos 3D panel`. Expiración: 1 año.
4. Repository access → **Only select repositories** → elige **milos3d**
5. Permissions → Repository permissions → **Contents: Read and write**
6. Copia el token y pégalo en **Ajustes → Publicación en el sitio → Token de acceso**
7. Toca **Probar conexión**. Debe decir ✅.

El token se guarda **solo en ese celular**, nunca se sube a ningún lado.
Si se pierde el celular, entra a GitHub y borra el token; se corta el acceso al instante.

---

## 🤝 Cómo trabajan los tres juntos

El flujo normal es este:

1. **Quien sea** (esposa, hijo o Emilio) da de alta el producto desde su celular:
   foto + liga + nombre. Toca **💾 Guardar borrador**.
2. Ese borrador **le aparece a los tres** en el Catálogo, con la etiqueta naranja
   de lo que le falta (*"FALTA 2"*).
3. **Emilio** lo abre desde su celular, llena gramos y tiempo, y el precio sale solo.
   La etiqueta cambia a verde: **LISTO PARA PUBLICAR**.
4. Cualquiera puede publicarlo — pero **antes se ve una pantalla de revisión**
   con la ficha tal cual va a aparecer en la tienda. Nada sale al sitio sin
   pasar por ahí.

> **El botón de publicar está bloqueado** hasta que la ficha tenga nombre, foto,
> gramos, tiempo y precio. Mientras falte algo, el panel dice exactamente qué es.

### ¿Cómo se ven los borradores en los tres celulares?

Viajan por el mismo repositorio donde vive el sitio, igual que el catálogo.
Toca **🔄 Sincronizar** en el Catálogo (o simplemente entra a esa pestaña).

Viaja lo de la ficha: nombre, foto, liga, gramos y tiempo.
**No viajan tus costos ni tus márgenes** — el precio del filamento, la tarifa
por hora y el margen se quedan en los Ajustes de cada celular.

> ⚠️ El repositorio del sitio es **público**, así que el archivo de pendientes
> (`borradores.json`) también lo es: quien adivine la dirección vería los nombres
> y fotos de productos que aún no salen. Los gramos y el tiempo suelen estar
> publicados en MakerWorld de todos modos. Tus costos y márgenes **nunca** salen
> de tu celular. Si prefieres que ni los nombres se vean, dímelo y lo movemos a
> un lugar privado.

## ➕ Subir un producto nuevo (3 minutos)

1. **Foto** — toma la foto de la pieza o sube el screenshot del diseño.
2. **Liga** — pega el link de MakerWorld y toca *Leer datos de la liga*.
   Si MakerWorld no se deja leer (pasa seguido), abre
   **“Pegar datos del laminador”**, copia el texto de Bambu Studio / Handy
   donde vienen los gramos y el tiempo, pégalo y toca *Sacar gramos y tiempo*.
   Eso **nunca falla**.
3. **Datos de impresión** — revisa gramos, tiempo, material y cuántas piezas
   salen por impresión.
4. **Costo y precio** — el precio sale solo. Si quieres cobrar otra cosa,
   escríbelo en *Precio final* y abajo te dice cuánto ganas.
5. **Ficha** — ponle nombre, toca *Generar descripción* (y edítala), elige colores.
6. **👀 Revisar y publicar** — te muestra la ficha tal como se verá en la tienda,
   con lo que cuesta, en cuánto se vende y cuánto ganas. Si algo no te gusta,
   **Volver a editar**. Si está bien, **🚀 Publicar**: la foto y la ficha se suben
   a milos3d.com y tardan **como 1 minuto** en verse.

## 📦 Catálogo

Lista todo: los pendientes de los tres y lo que ya está publicado. Cada uno trae
su etiqueta —**FALTA 3**, **LISTO PARA PUBLICAR** o **PUBLICADO**— y la firma de
quién hizo qué. En el botón **⋯** de cada uno:

- **Editar** — cambiar precio, foto, descripción y volver a publicar
- **Ocultar del sitio** — se agotó o lo pausaste (no lo borra)
- **Cotizar este producto** — crea una cotización con ese producto ya adentro
- **Borrar del panel** — solo lo quita del panel, no del sitio

## 🧾 Cotizar, aprobar y cobrar

1. **+ Nueva cotización** → nombre del cliente, su WhatsApp y los conceptos
   (cada uno con precio, cantidad y detalle). Puedes agregar envío y descuento.
2. **Enviar por WhatsApp** — se abre el chat del cliente con la cotización escrita
   y una **liga** a una página bonita con el detalle y los datos de pago.
3. El cliente toca **Aprobar por WhatsApp** y te llega el mensaje.
   Tú marcas **✅ Aprobada**.
4. **💰 Registrar cobro** — anota anticipo o pago completo, con método y referencia.
   Cuando el saldo llega a cero, la cotización se marca **PAGADA** sola.

Arriba ves siempre **Por cobrar**, **Cobrado** y cuántas están abiertas.

## 💳 Cobrar con tarjeta (Mercado Pago)

Cuando está conectado, la cotización del cliente trae dos botones:
**Pagar anticipo** y **Pagar todo**. El cliente paga con tarjeta, débito,
OXXO o saldo de Mercado Pago sin salir del celular, y regresa a una página
de "¡Pago recibido!".

Luego, en el menú **⋯** de esa cotización, **🔄 ¿Ya pagó con tarjeta?**
consulta a Mercado Pago y registra el cobro solo.

**Mientras no esté conectado no se rompe nada:** la cotización simplemente
muestra los datos de transferencia, igual que hoy.

### Conectarlo (una vez, ~10 min, se necesita una compu)

1. **Cuenta de Mercado Pago** — la de siempre, la que ya usas para vender.
2. Entra a **mercadopago.com.mx/developers** → *Tus integraciones* →
   **Crear aplicación**. Nombre: `Milo's 3D`. Producto: **Checkout Pro**.
3. En esa aplicación → **Credenciales de producción**. Ahí está el
   **Access Token**. Cópialo pero **no lo mandes por WhatsApp ni por correo,
   ni lo pegues en el panel** — es como la llave de tu caja registradora.
4. Abre la carpeta **`pagos/`** de este proyecto y sigue su `README.md`.
   Son cuatro comandos. En uno de ellos la terminal te pide el Access Token:
   lo pegas ahí y queda guardado en Cloudflare, invisible para todos.
5. Al final te da una dirección que termina en **`.workers.dev`**.
   Esa sí es pública: pégala en el panel → **Ajustes → Cobros con tarjeta**
   y toca **Probar servicio**. Debe decir ✅.
6. De vuelta en Mercado Pago → tu aplicación → **Webhooks**: pon
   `https://TU-DIRECCION.workers.dev/webhook`, evento **Pagos**.
   Copia la *clave secreta* que te muestra y guárdala con el cuarto comando
   del README.

> **Si alguna vez crees que el token se filtró:** entra a Mercado Pago →
> tu aplicación → Credenciales de producción → genera unas nuevas.
> Las viejas mueren en ese instante.

### Probar sin cobrar de verdad

En el paso 3 usa las **credenciales de prueba** en lugar de las de producción
y paga con las tarjetas de prueba de Mercado Pago. Cuando todo funcione,
cambia el token por el de producción.

## ⚙️ Ajustes — los números que mueven todo

| Campo | Qué es | Sugerido |
|---|---|---|
| Filamento $/kg | Lo que te cuesta el rollo | 450–650 |
| Impresora $/hora | Luz, boquilla y desgaste | 15–30 |
| Mano de obra $/hora | Tu tiempo de armado y limpieza | 120–200 |
| Merma % | Impresiones que fallan | 10 |
| Margen % | Ganancia sobre el costo | 100–150 |
| Redondear a | Precios "bonitos" | 5 o 10 |
| Anticipo % | Lo que pides para arrancar | 50 |

En **Cobros con tarjeta** va la dirección del servicio de pagos.
En **Otros cobros** van el link manual de Mercado Pago (por si no conectas
el servicio: lo generas desde la app de Mercado Pago para ese monto) y los
**datos de transferencia** que verá el cliente.

También ahí van los **materiales**, cada uno con su precio por kilo.

---

## 🛒 El sitio público

El catálogo vive en `products.json` (el panel lo escribe solo).
Si alguna vez quieres editarlo a mano, cada producto se ve así:

```json
{
  "id": "robot-guardian",
  "nombre": "Robot Guardián",
  "descripcion": "Figura articulada de robot con luz LED.",
  "precio": 250,
  "imagen": "images/robot-guardian.jpg",
  "badge": "¡Nuevo!",
  "colores": ["#c0c8d8", "#4cc9ff"],
  "etiquetas": ["Articulado", "Edición limitada"],
  "visible": true
}
```

En la sección `config` del mismo archivo están el **WhatsApp** y el **Instagram**.

Los pedidos del carrito siguen llegando a **WhatsApp 442 783 1563** con todo escrito.
La promo **3×2 del Amigo Dino** se calcula sola.

## 💻 Ver la página en la compu

```bash
python3 -m http.server 4173 --directory /Users/zenith107/MILOS3D
```

Luego abre http://localhost:4173 (y el panel en http://localhost:4173/admin/)
