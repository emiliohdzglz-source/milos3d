/* ============================================
   MILO'S 3D — Lógica de la tienda
   ============================================ */

let CONFIG = { whatsapp: "524427831563", instagram: "MILO3DSTORE", moneda: "MXN", envio_nota: "" };
let PRODUCTOS = [];
const cart = new Map(); // key: id + color, value: {producto, color, qty}

const $ = (sel) => document.querySelector(sel);
const isTouch = window.matchMedia("(hover: none), (pointer: coarse)").matches;

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
          </div>`}
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

function colorName(hex) {
  const nombres = {
    "#4a7c3a": "Verde militar", "#f2d33c": "Amarillo", "#8aa84f": "Verde/Amarillo"
  };
  return nombres[hex] || hex;
}

/* ---------- Carrito ---------- */
function cartKey(p, color, pack, nota) {
  return p.id + "::" + (color || "-") + "::" + (pack?.nombre || "-") + "::" + (nota || "-");
}

function itemPrice(i) {
  if (i.custom) return i.custom.precio;
  return i.pack ? i.pack.precio : i.producto.precio;
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

  // Total + promo 3x2 del Amigo Dino
  const total = items.reduce((s, i) => s + itemPrice(i) * i.qty, 0);
  const dinoQty = items.filter(i => i.producto.id === "amigo-dino").reduce((s, i) => s + i.qty, 0);
  const gratis = Math.floor(dinoQty / 3);
  const dino = PRODUCTOS.find(p => p.id === "amigo-dino");
  const descuento = gratis * (dino ? dino.precio : 0);
  $("#cart-total").textContent = money(total - descuento);
  $("#cart-promo-note").textContent = gratis > 0
    ? `🎉 Promo 3×2 aplicada: ${gratis} Amigo Dino GRATIS (−${money(descuento)})`
    : (dinoQty > 0 ? `Agrega ${3 - (dinoQty % 3)} más y uno te sale GRATIS (3×2)` : "");

  refreshHoverTargets();
}

/* ---------- Checkout por WhatsApp ---------- */
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
      if (c.letras.length) msg += `   🔤 Letras: ${c.letras.join("-")}\n`;
      if (c.figuras.length) msg += `   🎀 Figuras: ${c.figuras.map(f => `${f.figura} (${f.color})`).join(", ")}\n`;
      if (c.beads.length) msg += `   ⚪ Beads: ${c.beads.map(b => `par ${b}`).join(", ")}\n`;
      msg += `   🪢 Cordón: ${c.metros} m\n`;
    }
  });
  const total = items.reduce((s, i) => s + itemPrice(i) * i.qty, 0);
  const dinoQty = items.filter(i => i.producto.id === "amigo-dino").reduce((s, i) => s + i.qty, 0);
  const gratis = Math.floor(dinoQty / 3);
  const dino = PRODUCTOS.find(p => p.id === "amigo-dino");
  const descuento = gratis * (dino ? dino.precio : 0);
  if (descuento > 0) msg += `\n🎉 Promo 3×2: −${money(descuento)}`;
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
  if (c.letras?.length) partes.push(`🔤 ${c.letras.join("")}`);
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
  const colorOpts = cfg.colores.map(c => `<option value="${c.nombre}">${c.nombre}</option>`).join("");
  const abc = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split("");
  $("#config-body").innerHTML = `
    <div class="config-section">
      <h4>🔤 Letras de tu nombre <small>$${cfg.letra_precio} c/u</small></h4>
      <div class="config-row">
        <select id="cfg-letra" data-hover>${abc.map(l => `<option>${l}</option>`).join("")}</select>
        <button class="btn-mini" id="cfg-add-letra" data-hover>+ Agregar letra</button>
      </div>
      <div class="chips" id="chips-letras"></div>
    </div>
    <div class="config-section">
      <h4>🎀 Figuras <small>$${cfg.figura_precio} c/u</small></h4>
      <div class="config-row">
        <select id="cfg-figura" data-hover>${cfg.figuras.map(f => `<option>${f}</option>`).join("")}</select>
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

  $("#cfg-add-letra").addEventListener("click", () => {
    cfgState.letras.push($("#cfg-letra").value);
    renderCfg();
  });
  $("#cfg-add-figura").addEventListener("click", () => {
    cfgState.figuras.push({ figura: $("#cfg-figura").value, color: $("#cfg-figura-color").value });
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
  return cfgProduct?.configurador?.colores.find(c => c.nombre === nombre)?.hex || "#888";
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
  $("#chips-letras").innerHTML = cfgState.letras.map((l, i) => chip(l, null, "letras", i)).join("") || '<span class="chips-empty">Aún sin letras</span>';
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

function toggleCart(open) {
  $("#cart-drawer").classList.toggle("open", open);
  $("#cart-overlay").classList.toggle("open", open);
}

// Nav con scroll
window.addEventListener("scroll", () => {
  $("#nav").classList.toggle("scrolled", window.scrollY > 40);
}, { passive: true });

/* ---------- Cursor personalizado ---------- */
if (!isTouch) {
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
