/* ============================================
   MILO'S 3D — Lógica de la tienda
   ============================================ */

let CONFIG = { whatsapp: "524427831563", instagram: "MILO3DSTORE", moneda: "MXN", envio_nota: "" };
let PRODUCTOS = [];
const cart = new Map(); // key: id + color, value: {producto, color, qty}

const $ = (sel) => document.querySelector(sel);
const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;

/* Lo que hay impreso, por color. null = todavía no se publica inventario. */
let INVENTARIO = null;

/* Cuántas piezas quedan de algo en un color, descontando lo que el
   cliente ya lleva puesto en el configurador. Sin inventario, no hay
   límite: devuelve Infinity y nada se bloquea. */
function disponibles(color, pieza, yaUsadas = 0) {
  if (!INVENTARIO) return Infinity;
  // Una pieza que el inventario no cuenta en NINGÚN color no está
  // agotada: es que no se lleva su cuenta. Sin esto, publicar el stock
  // de clickers bloqueaba todas las letras de la pulsera, que se
  // imprimen por encargo y nunca estuvieron contadas.
  if (!(coloresCon(pieza) || []).length) return Infinity;
  const hay = INVENTARIO.piezas?.[color]?.[pieza] || 0;
  return hay - yaUsadas;
}

/* Los colores que pueden surtir esta pieza ahora mismo. */
function coloresCon(pieza) {
  if (!INVENTARIO) return null;
  return INVENTARIO.colores.filter(c => (INVENTARIO.piezas?.[c.nombre]?.[pieza] || 0) > 0);
}

/* Los colores en los que hay un clicker COMPLETO listo para entregar.
   Un clicker es una cadena: un inicio, los medios que quieras y un
   final. Faltando el inicio o el final no hay clicker, por muchos
   medios que sobren — así que manda el más escaso de los dos. */
const INICIOS_CLICKER = ["Inicio", "Inicio sin llavero"];
function coloresConClicker() {
  if (!INVENTARIO) return null;
  const hay = INVENTARIO.colores.filter(c => {
    const p = INVENTARIO.piezas?.[c.nombre] || {};
    const inicio = INICIOS_CLICKER.reduce((s, k) => s + (p[k] || 0), 0);
    return inicio > 0 && (p["Final"] || 0) > 0;
  });
  return hay.length ? hay : null;
}

/* ---------- Cargar productos ---------- */
async function init() {
  try {
    // `no-store` sólo evita el caché del navegador; la red de GitHub Pages
    // guarda una copia unos minutos y por eso un producto recién publicado
    // tardaba en aparecer. La marca de tiempo pide una dirección distinta
    // cada vez, así que siempre llega la versión de hoy.
    const res = await fetch("products.json?v=" + Date.now(), { cache: "no-store" });
    const data = await res.json();
    CONFIG = { ...CONFIG, ...data.config };
    PRODUCTOS = (data.productos || []).filter(p => p.visible !== false);
  } catch (e) {
    console.error("No se pudo cargar products.json", e);
  }

  /* El inventario de letras y figuras ya impresas. Es opcional a
     propósito: si el archivo todavía no existe, el configurador se
     comporta como siempre y no bloquea nada. Sólo cuando hay
     inventario publicado empieza a filtrar por lo que de verdad hay. */
  try {
    const r = await fetch("inventario.json?v=" + Date.now(), { cache: "no-store" });
    if (r.ok) {
      const inv = await r.json();
      if (inv?.colores?.length) INVENTARIO = inv;
    }
  } catch (e) { /* sin inventario: se ofrece todo, como antes */ }
  // El pago con tarjeta aparece sólo si products.json trae la dirección
  // del servicio. Sin ella, la tienda funciona como siempre por WhatsApp.
  if (CONFIG.pagos) {
    const caja = $("#cart-pago");
    if (caja) caja.hidden = false;
  }

  renderProducts();
  setupLinks();
  restoreCart();
  updateCartUI();
}

function money(n) {
  return "$" + Number(n).toLocaleString("es-MX") + " " + CONFIG.moneda;
}

function renderProducts() {
  const grid = $("#products-grid");
  if (!PRODUCTOS.length) {
    grid.innerHTML = '<div class="products-empty">Muy pronto: nuevas impresiones en camino 🚀</div>';
    return;
  }
  grid.innerHTML = PRODUCTOS.map(p => `
    <article class="product-card reveal" data-tilt data-id="${p.id}">
      <div class="glare"></div>
      ${p.badge ? `<div class="product-badge">${p.badge}</div>` : ""}
      <a class="product-img" href="${p.flyer || p.imagen}" target="_blank" rel="noopener" data-hover title="Ver imagen completa">
        <img src="${p.imagen}" alt="${p.nombre}" loading="lazy"
             onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'img-fallback',textContent:'🦖'}))">
      </a>
      <div class="product-body">
        <h3 class="product-name">${p.nombre}</h3>
        <p class="product-desc">${p.descripcion}</p>
        ${p.etiquetas?.length ? `<div class="product-tags">${p.etiquetas.map(t => `<span class="product-tag">${t}</span>`).join("")}</div>` : ""}
        ${p.colores?.length ? `
          <div class="product-colors">
            <span class="color-label">Color:</span>
            ${p.colores.map((c, i) => `<button class="color-dot ${i === 0 ? "selected" : ""}" data-color="${c}" style="background:${c}" data-hover aria-label="Color ${c}"></button>`).join("")}
          </div>` : ""}
        ${p.paquetes?.length ? `
          <div class="product-packs">
            ${p.paquetes.map((pk, i) => `<button class="pack-btn ${i === 0 ? "selected" : ""}" data-pack="${pk.nombre}" data-hover>${pk.nombre}</button>`).join("")}
          </div>` : ""}
        ${p.combos?.length ? `
          <div class="product-combo">
            <span class="color-label">Combinación de colores:</span>
            <select class="combo-select" data-hover>${p.combos.map(c => `<option>${c}</option>`).join("")}</select>
          </div>` : ""}
        ${p.usa_inventario_clicker && coloresConClicker() ? `
          <div class="stock-colores">
            <span class="color-label">Listos para entrega hoy:</span>
            <div class="stock-dots">
              ${coloresConClicker().map(c =>
                `<span class="stock-dot" title="${c.nombre}"><i style="background:${c.hex}"></i>${c.nombre}</span>`).join("")}
            </div>
          </div>` : ""}
        ${p.tipo === "config" ? `
          <div class="price-list">
            ${(p.precios_lista || []).map(x => `<span class="price-item">${x.nombre} <strong>${x.precio}</strong></span>`).join("")}
          </div>
          <div class="product-foot">
            <button class="btn-add btn-quote" data-hover data-config="${p.id}">🎨 Diseñar mi pulsera</button>
          </div>` : p.tipo === "cotizar" ? `
          <div class="price-list">
            ${(p.precios_lista || []).map(x => `<span class="price-item">${x.nombre} <strong>${x.precio}</strong></span>`).join("")}
          </div>
          <div class="product-foot">
            <button class="btn-add btn-quote" data-hover data-quote="${p.id}">💬 Cotizar por WhatsApp</button>
          </div>` : `
          <div class="product-foot">
            <div class="product-price" data-price>${money(p.paquetes?.length ? p.paquetes[0].precio : p.precio)} <small>${p.paquetes?.length ? "paquete" : "c/u"}</small></div>
            <button class="btn-add" data-hover data-add="${p.id}">+ Agregar</button>
          </div>
          ${p.promo?.lleva > p.promo?.paga
            ? `<p class="product-promo">🎉 <b>${p.promo.lleva}×${p.promo.paga}</b> — lleva ${p.promo.lleva} y paga ${p.promo.paga}</p>`
            : ""}`}
      </div>
    </article>
  `).join("");

  // Selección de color y paquete
  grid.querySelectorAll(".product-card").forEach(card => {
    const p = PRODUCTOS.find(x => x.id === card.dataset.id);
    card.querySelectorAll(".color-dot").forEach(dot => {
      dot.addEventListener("click", () => {
        card.querySelectorAll(".color-dot").forEach(d => d.classList.remove("selected"));
        dot.classList.add("selected");
      });
    });
    card.querySelectorAll(".pack-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        card.querySelectorAll(".pack-btn").forEach(b => b.classList.remove("selected"));
        btn.classList.add("selected");
        const pk = p.paquetes.find(k => k.nombre === btn.dataset.pack);
        const priceEl = card.querySelector("[data-price]");
        if (priceEl && pk) priceEl.innerHTML = `${money(pk.precio)} <small>paquete</small>`;
      });
    });
  });

  // Agregar al carrito
  grid.querySelectorAll("[data-add]").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.add;
      const p = PRODUCTOS.find(x => x.id === id);
      const card = btn.closest(".product-card");
      const color = card.querySelector(".color-dot.selected")?.dataset.color || null;
      const packName = card.querySelector(".pack-btn.selected")?.dataset.pack || null;
      const pack = packName && p.paquetes ? p.paquetes.find(k => k.nombre === packName) : null;
      const nota = card.querySelector(".combo-select")?.value || null;
      addToCart(p, color, pack, nota);
    });
  });

  // Cotizar por WhatsApp
  grid.querySelectorAll("[data-quote]").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = PRODUCTOS.find(x => x.id === btn.dataset.quote);
      const msg = p.mensaje_wa || `¡Hola MILO'S 3D! Quiero cotizar: ${p.nombre}`;
      window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`, "_blank");
    });
  });

  // Abrir configurador
  grid.querySelectorAll("[data-config]").forEach(btn => {
    btn.addEventListener("click", () => {
      const p = PRODUCTOS.find(x => x.id === btn.dataset.config);
      openConfigurator(p);
    });
  });

  setupTilt();
  setupReveal();
  refreshHoverTargets();
}

/* Los colores se guardan en hexadecimal porque así se pintan los
   círculos, pero al cliente hay que decírselos por su nombre: en el
   carrito y en el WhatsApp del pedido salía "#d93025", que no le dice
   nada a nadie y encima se ve a medio terminar. */
function colorName(hex) {
  const nombres = {
    "#1b1b1b": "Negro", "#d93025": "Rojo", "#4a7c3a": "Verde militar",
    "#f2d33c": "Amarillo", "#4a90d9": "Azul", "#e91e78": "Rosa mexicano",
    "#f7a8c4": "Rosa pastel", "#8e6bc8": "Morado", "#ff7a2f": "Naranja",
    "#c0c8d8": "Gris", "#f2f2f2": "Blanco", "#4cc9ff": "Azul cielo",
    "#8aa84f": "Verde/Amarillo"
  };
  return nombres[String(hex).toLowerCase()] || hex;
}

/* ---------- Carrito ---------- */
function cartKey(p, color, pack, nota) {
  return p.id + "::" + (color || "-") + "::" + (pack?.nombre || "-") + "::" + (nota || "-");
}

function itemPrice(i) {
  if (i.custom) return i.custom.precio;
  return i.pack ? i.pack.precio : i.producto.precio;
}

/* ---------- Promociones de "lleva N y paga M" ----------
   Vive en products.json, en cada producto:  "promo": { "lleva": 3, "paga": 2 }
   Antes el 3×2 del Amigo Dino estaba escrito a mano en tres lugares
   distintos —el carrito, el pago con tarjeta y el mensaje de WhatsApp—
   y poner la misma promo en otro producto significaba copiarlo una
   cuarta vez y confiar en que los cuatro dieran el mismo número. Ahora
   la cuenta es una sola y los tres caminos la llaman.

   Las piezas se cuentan sumando TODAS las líneas de ese producto: tres
   bolas de tres colores distintos son tres bolas. Lo que se regala es
   la más barata de ellas, que es lo que significa un 3×2. */
function promosDelCarrito(items) {
  const porProducto = new Map();
  items.forEach(i => {
    const p = i.producto;
    if (!p?.promo || !(p.promo.lleva > p.promo.paga)) return;
    const g = porProducto.get(p.id) || { producto: p, qty: 0, precioMin: Infinity };
    g.qty += i.qty;
    g.precioMin = Math.min(g.precioMin, itemPrice(i));
    porProducto.set(p.id, g);
  });

  const detalles = [];
  porProducto.forEach(g => {
    const { lleva, paga } = g.producto.promo;
    const gratis = Math.floor(g.qty / lleva) * (lleva - paga);
    const faltan = gratis > 0 ? 0 : lleva - (g.qty % lleva);
    detalles.push({
      producto: g.producto, etiqueta: `${lleva}×${paga}`,
      qty: g.qty, gratis, faltan,
      monto: gratis * (g.precioMin === Infinity ? 0 : g.precioMin)
    });
  });
  const descuento = detalles.reduce((s, d) => s + d.monto, 0);
  return { descuento, detalles };
}

/* El renglón que le dice al cliente qué se le aplicó, o cuántas le
   faltan. Sin esto la promo existe pero nadie se entera a tiempo. */
function notaPromo(detalles) {
  const aplicadas = detalles.filter(d => d.gratis > 0);
  if (aplicadas.length) {
    return "🎉 " + aplicadas.map(d =>
      `Promo ${d.etiqueta}: ${d.gratis} ${d.producto.nombre} GRATIS (−${money(d.monto)})`).join(" · ");
  }
  const cerca = detalles.filter(d => d.qty > 0);
  if (cerca.length) {
    const d = cerca[0];
    return `Agrega ${d.faltan} ${d.producto.nombre} más y uno te sale GRATIS (${d.etiqueta})`;
  }
  return "";
}

function addToCart(p, color, pack, nota) {
  const key = cartKey(p, color, pack, nota);
  const item = cart.get(key);
  if (item) item.qty++;
  else cart.set(key, { producto: p, color, pack, nota: nota || null, qty: 1 });
  saveCart();
  updateCartUI();
  showToast(`✓ ${p.nombre}${pack ? " (" + pack.nombre + ")" : ""} agregado al pedido`);
}

function saveCart() {
  const data = [...cart.entries()].map(([key, i]) => ({
    key, id: i.producto.id, color: i.color, pack: i.pack?.nombre || null,
    nota: i.nota || null, custom: i.custom || null, qty: i.qty
  }));
  localStorage.setItem("milos3d_cart", JSON.stringify(data));
}

function restoreCart() {
  try {
    const data = JSON.parse(localStorage.getItem("milos3d_cart") || "[]");
    data.forEach(i => {
      const p = PRODUCTOS.find(x => x.id === i.id);
      if (!p) return;
      const pack = i.pack && p.paquetes ? p.paquetes.find(k => k.nombre === i.pack) : null;
      cart.set(i.key, { producto: p, color: i.color, pack, nota: i.nota || null, custom: i.custom || null, qty: i.qty });
    });
  } catch (e) { /* carrito vacío */ }
}

function updateCartUI() {
  const items = [...cart.values()];
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  $("#cart-count").textContent = totalQty;

  const container = $("#cart-items");
  if (!items.length) {
    container.innerHTML = '<p class="cart-empty">Tu carrito está vacío.<br>¡Agrega tu primera impresión! 🤖</p>';
  } else {
    container.innerHTML = [...cart.entries()].map(([key, i]) => `
      <div class="cart-item" data-key="${key}">
        <div>
          <div class="cart-item-name">${i.producto.nombre}</div>
          ${i.pack ? `<div class="cart-item-meta">📦 Paquete ${i.pack.nombre}</div>` : ""}
          ${i.nota ? `<div class="cart-item-meta">🎨 ${i.nota}</div>` : ""}
          ${i.custom ? `<div class="cart-item-meta">${customResumen(i.custom)}</div>` : ""}
          ${i.color ? `<div class="cart-item-meta"><span class="mini-dot" style="background:${i.color}"></span>${colorName(i.color)}</div>` : ""}
          <div class="cart-qty">
            <button data-hover data-dec>−</button>
            <span>${i.qty}</span>
            <button data-hover data-inc>+</button>
          </div>
        </div>
        <div class="cart-item-price">${money(itemPrice(i) * i.qty)}</div>
        <button class="cart-item-remove" data-hover data-remove>Quitar</button>
      </div>
    `).join("");

    container.querySelectorAll(".cart-item").forEach(el => {
      const key = el.dataset.key;
      el.querySelector("[data-inc]").addEventListener("click", () => { cart.get(key).qty++; saveCart(); updateCartUI(); });
      el.querySelector("[data-dec]").addEventListener("click", () => {
        const it = cart.get(key);
        it.qty--; if (it.qty <= 0) cart.delete(key);
        saveCart(); updateCartUI();
      });
      el.querySelector("[data-remove]").addEventListener("click", () => { cart.delete(key); saveCart(); updateCartUI(); });
    });
  }

  const { total, descuento, detalles } = pedidoDelCarrito();
  $("#cart-total").textContent = money(total - descuento);
  $("#cart-promo-note").textContent = notaPromo(detalles);

  refreshHoverTargets();
}

/* ---------- Checkout por WhatsApp ---------- */
/* El pedido en números: lo mismo que ve el cliente en el carrito y lo
   mismo que se le cobra. Una sola cuenta para los dos caminos. */
function pedidoDelCarrito() {
  const items = [...cart.values()];
  const total = items.reduce((s, i) => s + itemPrice(i) * i.qty, 0);
  const { descuento, detalles } = promosDelCarrito(items);
  return { items, total, descuento, detalles, aPagar: total - descuento };
}

/* ---------- Pagar con tarjeta, sin pasar por WhatsApp ---------- */
function etiquetaItem(i) {
  let t = i.producto.nombre;
  if (i.pack) t += ` (${i.pack.nombre})`;
  if (i.color) t += ` · ${colorName(i.color)}`;
  if (i.nota) t += ` · ${i.nota}`;
  if (i.custom?.letras?.length) t += ` · ${i.custom.letras.map(l => l.letra).join("")}`;
  return t.slice(0, 120);
}

async function pagarConTarjeta() {
  const { items, descuento, aPagar } = pedidoDelCarrito();
  if (!items.length) { showToast("Tu carrito está vacío"); return; }

  const nombre = $("#cart-nombre").value.trim();
  const tel = $("#cart-tel").value.trim();
  const msg = $("#cart-pago-msg");
  if (!nombre) { msg.textContent = "Escribe tu nombre para saber de quién es el pedido."; return; }
  if (tel.replace(/\D/g, "").length < 10) { msg.textContent = "Escribe tu WhatsApp a 10 dígitos."; return; }

  const boton = $("#cart-pagar");
  boton.disabled = true;
  msg.textContent = "Preparando tu pago…";
  try {
    const r = await fetch(CONFIG.pagos.replace(/\/+$/, "") + "/preferencia", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        folio: "W" + Date.now().toString(36).toUpperCase(),
        canal: "tienda",
        cliente: nombre,
        tel,
        descuento,
        items: items.map(i => ({ n: etiquetaItem(i), q: i.qty, p: itemPrice(i) }))
      })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.url) throw new Error(d.error || "No se pudo preparar el pago.");
    // Antes de irse a Mercado Pago, se guarda el carrito por si vuelve.
    try { localStorage.setItem("milos3d_ultimo_pedido", JSON.stringify({ folio: d.referencia, total: aPagar, nombre })); } catch (e) { /* sin guardado, igual se paga */ }
    window.location.href = d.url;
  } catch (e) {
    boton.disabled = false;
    msg.textContent = e.message + " Puedes pedirlo por WhatsApp aquí abajo.";
  }
}

function checkout() {
  const items = [...cart.values()];
  if (!items.length) { showToast("Tu carrito está vacío"); return; }

  let msg = "¡Hola MILO'S 3D! 🤖 Quiero hacer este pedido:\n\n";
  items.forEach(i => {
    msg += `▸ ${i.qty}× ${i.producto.nombre}`;
    if (i.pack) msg += ` [Paquete ${i.pack.nombre}]`;
    if (i.nota) msg += ` [Colores: ${i.nota}]`;
    if (i.color) msg += ` (${colorName(i.color)})`;
    msg += ` — ${money(itemPrice(i) * i.qty)}\n`;
    if (i.custom) {
      const c = i.custom;
      if (c.letras.length) msg += `   🔤 Letras: ${c.letras.map(l => `${l.letra} (${l.color})`).join(" · ")}\n`;
      if (c.figuras.length) msg += `   🎀 Figuras: ${c.figuras.map(f => `${f.figura} (${f.color})`).join(", ")}\n`;
      if (c.beads.length) msg += `   ⚪ Beads: ${c.beads.map(b => `par ${b}`).join(", ")}\n`;
      msg += `   🪢 Cordón: ${c.metros} m\n`;
    }
  });
  const { total, descuento, detalles } = pedidoDelCarrito();
  detalles.filter(d => d.gratis > 0).forEach(d => {
    msg += `\n🎉 Promo ${d.etiqueta} ${d.producto.nombre}: ${d.gratis} gratis (−${money(d.monto)})`;
  });
  msg += `\n*Total: ${money(total - descuento)}*\n\n`;
  msg += "Mi nombre es: \nMi ciudad es: ";

  window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`, "_blank");
}

/* ---------- Configurador (pulsera personalizada) ---------- */
let cfgProduct = null;
let cfgState = null;
let cfgCounter = Number(localStorage.getItem("milos3d_cfg_n") || 0);

function customResumen(c) {
  const partes = [];
  if (c.letras?.length) partes.push(`🔤 ${c.letras.map(l => l.letra).join("")}`);
  if (c.figuras?.length) partes.push(`🎀 ${c.figuras.length} figura(s)`);
  if (c.beads?.length) partes.push(`⚪ ${c.beads.length} par(es)`);
  partes.push(`🪢 ${c.metros} m`);
  return partes.join(" · ");
}

function openConfigurator(p) {
  cfgProduct = p;
  const cfg = p.configurador;
  cfgState = { letras: [], figuras: [], beads: [], metros: 1 };
  $("#config-title").textContent = "🎨 " + p.nombre;
  /* Con inventario publicado, los colores que se ofrecen son los que de
     verdad tienen piezas; sin él, los que trae la ficha del producto. */
  const todasLasLetras = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split("");
  /* El inventario sólo manda sobre lo que de verdad lleva contado. Hoy
     lo que hay preimpreso son piezas de clicker, no letras: si se
     filtrara a ciegas, el selector de letras saldría VACÍO y la pulsera
     dejaría de poder pedirse aunque se imprima por encargo. Así que
     cada categoría se filtra sólo cuando el inventario tiene algo de
     ella; si no, se ofrece todo, como cuando no había inventario. */
  const hayLetras = !!INVENTARIO && todasLasLetras.some(l => (coloresCon(l) || []).length);
  const hayFiguras = !!INVENTARIO && cfg.figuras.some(f => (coloresCon(f) || []).length);

  const paleta = hayLetras || hayFiguras ? INVENTARIO.colores : cfg.colores;
  const colorOpts = paleta.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join("");
  const abc = hayLetras ? todasLasLetras.filter(l => (coloresCon(l) || []).length) : todasLasLetras;
  const figurasDisponibles = hayFiguras ? cfg.figuras.filter(f => (coloresCon(f) || []).length) : cfg.figuras;
  $("#config-body").innerHTML = `
    <div class="config-section">
      <h4>🔤 Letras de tu nombre <small>$${cfg.letra_precio} c/u</small></h4>
      <div class="config-row">
        <select id="cfg-letra" data-hover>${abc.map(l => `<option>${l}</option>`).join("")}</select>
        <select id="cfg-letra-color" data-hover>${colorOpts}</select>
        <button class="btn-mini" id="cfg-add-letra" data-hover>+ Agregar letra</button>
      </div>
      <div class="chips" id="chips-letras"></div>
      <p class="cfg-aviso" id="cfg-aviso-letra"></p>
    </div>
    <div class="config-section">
      <h4>🎀 Figuras <small>$${cfg.figura_precio} c/u</small></h4>
      <div class="config-row">
        <select id="cfg-figura" data-hover>${figurasDisponibles.map(f => `<option>${f}</option>`).join("")}</select>
        <select id="cfg-figura-color" data-hover>${colorOpts}</select>
        <button class="btn-mini" id="cfg-add-figura" data-hover>+ Agregar</button>
      </div>
      <div class="chips" id="chips-figuras"></div>
    </div>
    <div class="config-section">
      <h4>⚪ Beads <small>$${cfg.beads_precio} el par</small></h4>
      <div class="config-row">
        <select id="cfg-bead-color" data-hover>${colorOpts}</select>
        <button class="btn-mini" id="cfg-add-bead" data-hover>+ Agregar par</button>
      </div>
      <div class="chips" id="chips-beads"></div>
    </div>
    <div class="config-section">
      <h4>🪢 Cordón <small>$${cfg.cordon_precio_m} por metro</small></h4>
      <div class="config-row">
        <button class="btn-mini" id="cfg-m-dec" data-hover>−</button>
        <span class="cfg-metros" id="cfg-metros">1 m</span>
        <button class="btn-mini" id="cfg-m-inc" data-hover>+</button>
      </div>
    </div>`;

  /* Cuenta cuántas de esta pieza y color ya lleva el cliente en el
     configurador, para no ofrecerle más de las que quedan. */
  const yaPuestas = (pieza, color) =>
    cfgState.letras.filter(x => x.letra === pieza && x.color === color).length +
    cfgState.figuras.filter(x => x.figura === pieza && x.color === color).length;

  const avisar = (donde, texto) => {
    const el = $(donde);
    if (!el) return;
    el.textContent = texto;
    if (texto) setTimeout(() => { if (el.textContent === texto) el.textContent = ""; }, 4000);
  };

  $("#cfg-add-letra").addEventListener("click", () => {
    const letra = $("#cfg-letra").value;
    const color = $("#cfg-letra-color").value;
    if (!letra) return;
    if (disponibles(color, letra, yaPuestas(letra, color)) <= 0) {
      const otros = (coloresCon(letra) || []).map(c => c.nombre).filter(n => n !== color);
      return avisar("#cfg-aviso-letra", otros.length
        ? `Ya no quedan «${letra}» en ${color}. Sí hay en: ${otros.join(", ")}.`
        : `Por ahora no quedan «${letra}». Escríbenos y la imprimimos para ti.`);
    }
    cfgState.letras.push({ letra, color });
    avisar("#cfg-aviso-letra", "");
    renderCfg();
  });
  $("#cfg-add-figura").addEventListener("click", () => {
    const figura = $("#cfg-figura").value;
    const color = $("#cfg-figura-color").value;
    if (!figura) return;
    if (disponibles(color, figura, yaPuestas(figura, color)) <= 0) {
      const otros = (coloresCon(figura) || []).map(c => c.nombre).filter(n => n !== color);
      return avisar("#cfg-aviso-letra", otros.length
        ? `Ya no quedan «${figura}» en ${color}. Sí hay en: ${otros.join(", ")}.`
        : `Por ahora no quedan «${figura}».`);
    }
    cfgState.figuras.push({ figura, color });
    renderCfg();
  });
  $("#cfg-add-bead").addEventListener("click", () => {
    cfgState.beads.push($("#cfg-bead-color").value);
    renderCfg();
  });
  $("#cfg-m-dec").addEventListener("click", () => { if (cfgState.metros > 1) { cfgState.metros--; renderCfg(); } });
  $("#cfg-m-inc").addEventListener("click", () => { cfgState.metros++; renderCfg(); });

  renderCfg();
  toggleConfig(true);
}

function colorHex(nombre) {
  return (INVENTARIO?.colores || cfgProduct?.configurador?.colores || [])
    .find(c => c.nombre === nombre)?.hex
    || cfgProduct?.configurador?.colores.find(c => c.nombre === nombre)?.hex
    || "#888";
}

function cfgTotal() {
  const cfg = cfgProduct.configurador;
  return cfgState.letras.length * cfg.letra_precio
    + cfgState.figuras.length * cfg.figura_precio
    + cfgState.beads.length * cfg.beads_precio
    + cfgState.metros * cfg.cordon_precio_m;
}

function renderCfg() {
  const chip = (label, dot, onIdx, idx) =>
    `<span class="chip-sel" data-list="${onIdx}" data-idx="${idx}">${dot ? `<span class="mini-dot" style="background:${dot}"></span>` : ""}${label} <b>✕</b></span>`;
  $("#chips-letras").innerHTML = cfgState.letras.map((l, i) =>
    chip(l.letra, colorHex(l.color), "letras", i)).join("") || '<span class="chips-empty">Aún sin letras</span>';
  $("#chips-figuras").innerHTML = cfgState.figuras.map((f, i) => chip(`${f.figura}`, colorHex(f.color), "figuras", i)).join("") || '<span class="chips-empty">Aún sin figuras</span>';
  $("#chips-beads").innerHTML = cfgState.beads.map((b, i) => chip("Par", colorHex(b), "beads", i)).join("") || '<span class="chips-empty">Aún sin beads</span>';
  $("#cfg-metros").textContent = cfgState.metros + " m";
  $("#config-total").textContent = money(cfgTotal());
  document.querySelectorAll(".chip-sel").forEach(el => {
    el.addEventListener("click", () => {
      cfgState[el.dataset.list].splice(Number(el.dataset.idx), 1);
      renderCfg();
    });
  });
  refreshHoverTargets();
}

function toggleConfig(open) {
  $("#config-modal").classList.toggle("open", open);
  $("#config-overlay").classList.toggle("open", open);
}

$("#config-close").addEventListener("click", () => toggleConfig(false));
$("#config-overlay").addEventListener("click", () => toggleConfig(false));
$("#config-add").addEventListener("click", () => {
  if (!cfgState.letras.length && !cfgState.figuras.length && !cfgState.beads.length) {
    showToast("Agrega al menos una letra, figura o bead 🎨");
    return;
  }
  cfgCounter++;
  localStorage.setItem("milos3d_cfg_n", String(cfgCounter));
  const key = cfgProduct.id + "::custom::" + cfgCounter;
  cart.set(key, { producto: cfgProduct, color: null, pack: null, nota: null, custom: { ...cfgState, precio: cfgTotal() }, qty: 1 });
  saveCart();
  updateCartUI();
  toggleConfig(false);
  toggleCart(true);
  showToast("✓ ¡Tu pulsera personalizada está en el pedido!");
});

/* ---------- UI general ---------- */
function setupLinks() {
  $("#footer-wa").href = `https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent("¡Hola MILO'S 3D! Quiero cotizar una impresión 🤖 Te mando una foto/ejemplo de lo que busco:")}`;
  $("#footer-ig").href = `https://instagram.com/${CONFIG.instagram}`;
}

function showToast(text) {
  const t = $("#toast");
  t.textContent = text;
  t.classList.add("show");
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove("show"), 2200);
}

// Drawer del carrito
$("#cart-btn").addEventListener("click", () => toggleCart(true));
$("#cart-close").addEventListener("click", () => toggleCart(false));
$("#cart-overlay").addEventListener("click", () => toggleCart(false));
$("#cart-checkout").addEventListener("click", checkout);
$("#cart-pagar")?.addEventListener("click", pagarConTarjeta);

function toggleCart(open) {
  $("#cart-drawer").classList.toggle("open", open);
  $("#cart-overlay").classList.toggle("open", open);
}

// Nav con scroll
window.addEventListener("scroll", () => {
  $("#nav").classList.toggle("scrolled", window.scrollY > 40);
}, { passive: true });

/* ---------- Cursor personalizado ---------- */
if (!isTouch && $(".cursor-dot") && $(".cursor-ring")) {
  const dot = $(".cursor-dot");
  const ring = $(".cursor-ring");
  let mx = -100, my = -100, rx = -100, ry = -100;

  window.addEventListener("mousemove", (e) => { mx = e.clientX; my = e.clientY; });

  (function animCursor() {
    rx += (mx - rx) * 0.18;
    ry += (my - ry) * 0.18;
    dot.style.transform = `translate(${mx}px, ${my}px) translate(-50%,-50%)`;
    ring.style.transform = `translate(${rx}px, ${ry}px) translate(-50%,-50%)`;
    requestAnimationFrame(animCursor);
  })();

  window._setupHover = () => {
    document.querySelectorAll("[data-hover], a, button").forEach(el => {
      if (el._hoverBound) return;
      el._hoverBound = true;
      el.addEventListener("mouseenter", () => ring.classList.add("is-hover"));
      el.addEventListener("mouseleave", () => ring.classList.remove("is-hover"));
    });
  };
}

function refreshHoverTargets() {
  if (window._setupHover) window._setupHover();
}

/* ---------- Efecto tilt 3D ---------- */
function setupTilt() {
  if (isTouch) return;
  document.querySelectorAll("[data-tilt]").forEach(card => {
    if (card._tiltBound) return;
    card._tiltBound = true;
    card.addEventListener("mousemove", (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;
      const rotY = (px - 0.5) * 18;
      const rotX = (0.5 - py) * 13;
      card.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(14px) scale(1.02)`;
      card.style.setProperty("--mx", `${px * 100}%`);
      card.style.setProperty("--my", `${py * 100}%`);
    });
    card.addEventListener("mouseleave", () => {
      card.style.transform = "rotateX(0) rotateY(0) translateZ(0)";
      card.style.transition = "transform .5s ease";
      setTimeout(() => card.style.transition = "box-shadow .3s, border-color .3s", 500);
    });
  });
}

/* ---------- Reveal on scroll ---------- */
function setupReveal() {
  const obs = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (en.isIntersecting) { en.target.classList.add("visible"); obs.unobserve(en.target); }
    });
  }, { threshold: 0.12 });
  document.querySelectorAll(".reveal:not(.visible)").forEach(el => obs.observe(el));
}
setupReveal();

/* ---------- Fondo: circuitos animados ---------- */
(function circuitBackground() {
  const canvas = document.getElementById("circuit-bg");
  if (!canvas) return; // la piel nueva ya no trae el fondo de circuitos
  const ctx = canvas.getContext("2d");
  let W, H, nodes = [];
  let mouseX = -1000, mouseY = -1000;

  function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    const count = Math.min(90, Math.floor((W * H) / 22000));
    nodes = Array.from({ length: count }, () => ({
      x: Math.random() * W,
      y: Math.random() * H,
      vx: (Math.random() - 0.5) * 0.35,
      vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.8 + 0.8,
    }));
  }
  resize();
  window.addEventListener("resize", resize);
  if (!isTouch) window.addEventListener("mousemove", (e) => { mouseX = e.clientX; mouseY = e.clientY; });

  const LINK_DIST = 140;

  function frame() {
    ctx.clearRect(0, 0, W, H);

    for (const n of nodes) {
      n.x += n.vx; n.y += n.vy;
      if (n.x < 0 || n.x > W) n.vx *= -1;
      if (n.y < 0 || n.y > H) n.vy *= -1;

      // atracción sutil al mouse
      const dxm = mouseX - n.x, dym = mouseY - n.y;
      const dm = Math.hypot(dxm, dym);
      if (dm < 200 && dm > 0.1) {
        n.x += (dxm / dm) * 0.25;
        n.y += (dym / dm) * 0.25;
      }
    }

    // líneas
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < LINK_DIST) {
          const alpha = (1 - d / LINK_DIST) * 0.22;
          ctx.strokeStyle = `rgba(76, 201, 255, ${alpha})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          // estilo circuito: líneas en ángulo recto
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }

    // nodos
    for (const n of nodes) {
      ctx.fillStyle = "rgba(120, 210, 255, 0.7)";
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fill();
    }

    requestAnimationFrame(frame);
  }
  frame();
})();

init();
