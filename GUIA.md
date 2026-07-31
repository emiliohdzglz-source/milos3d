# 🤖 MILO'S 3D — Guía rápida de tu tienda

## ¿Cómo agregar o cambiar productos?

Todo se controla desde **un solo archivo**: `products.json`. Para agregar un producto, copia un bloque y cambia los datos:

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

- **precio**: solo el número, en MXN.
- **imagen**: guarda la foto en la carpeta `images/` con ese nombre. Si no hay foto, sale un 🦖 de relleno.
- **badge**: texto de la etiquetita naranja (déjalo `""` si no quieres).
- **colores**: códigos de color de las opciones (puedes buscar "color picker" en Google para sacar el código).
- **visible**: ponlo en `false` para ocultar un producto sin borrarlo (agotado, pausado, etc.).

También en `products.json` está la sección `config` con tu **WhatsApp** e **Instagram**.

## ¿Cómo funcionan las ventas?

1. El cliente arma su carrito en la página.
2. Al dar clic en "Completar pedido", se abre **tu WhatsApp (442 783 1563)** con el pedido ya escrito: productos, colores, cantidades, promo 3×2 aplicada y total.
3. Tú solo confirmas pago y envío por WhatsApp.

La promo **3×2 del Amigo Dino** se calcula sola en el carrito.

## Fotos que faltan por agregar

- `assets/logo.png` — tu logo (el de fondo transparente). Aparecerá en la barra de navegación y como ícono de la pestaña.
- `images/amigo-dino.jpg` — foto real del Amigo Dino (la del flyer sirve, recortada).

## Ver la página en tu compu

```bash
python3 -m http.server 4173 --directory /Users/zenith107/MILOS3D
```

Luego abre http://localhost:4173

## Siguiente paso: publicarla en MILOS3D.COM

La página está lista para subirse gratis a Vercel o Netlify y conectar tu dominio. Pídemelo y lo hacemos juntos (necesitarás acceso al panel donde compraste el dominio para apuntarlo).
