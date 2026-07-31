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
    const res = await fetch("products.json", { cache: "no-store" });
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
      <div class="product-img">
        <img src="${p.imagen}" alt="${p.nombre}" loading="lazy"
             onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'img-fallback',textContent:'🦖'}))">
      </div>
      <div class="product-body">
        <h3 class="product-name">${p.nombre}</h3>
        <p class="product-desc">${p.descripcion}</p>
        ${p.etiquetas?.length ? `<div class="product-tags">${p.etiquetas.map(t => `<span class="product-tag">${t}</span>`).join("")}</div>` : ""}
        ${p.colores?.length ? `
          <div class="product-colors">
            <span class="color-label">Color:</span>
            ${p.colores.map((c, i) => `<button class="color-dot ${i === 0 ? "selected" : ""}" data-color="${c}" style="background:${c}" data-hover aria-label="Color ${c}"></button>`).join("")}
          </div>` : ""}
        <div class="product-foot">
          <div class="product-price">${money(p.precio)} <small>c/u</small></div>
          <button class="btn-add" data-hover data-add="${p.id}">+ Agregar</button>
        </div>
      </div>
    </article>
  `).join("");

  // Selección de color
  grid.querySelectorAll(".product-card").forEach(card => {
    card.querySelectorAll(".color-dot").forEach(dot => {
      dot.addEventListener("click", () => {
        card.querySelectorAll(".color-dot").forEach(d => d.classList.remove("selected"));
        dot.classList.add("selected");
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
      addToCart(p, color);
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
function cartKey(p, color) { return p.id + "::" + (color || "-"); }

function addToCart(p, color) {
  const key = cartKey(p, color);
  const item = cart.get(key);
  if (item) item.qty++;
  else cart.set(key, { producto: p, color, qty: 1 });
  saveCart();
  updateCartUI();
  showToast(`✓ ${p.nombre} agregado al pedido`);
}

function saveCart() {
  const data = [...cart.values()].map(i => ({ id: i.producto.id, color: i.color, qty: i.qty }));
  localStorage.setItem("milos3d_cart", JSON.stringify(data));
}

function restoreCart() {
  try {
    const data = JSON.parse(localStorage.getItem("milos3d_cart") || "[]");
    data.forEach(i => {
      const p = PRODUCTOS.find(x => x.id === i.id);
      if (p) cart.set(cartKey(p, i.color), { producto: p, color: i.color, qty: i.qty });
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
    container.innerHTML = items.map(i => `
      <div class="cart-item" data-key="${cartKey(i.producto, i.color)}">
        <div>
          <div class="cart-item-name">${i.producto.nombre}</div>
          ${i.color ? `<div class="cart-item-meta"><span class="mini-dot" style="background:${i.color}"></span>${colorName(i.color)}</div>` : ""}
          <div class="cart-qty">
            <button data-hover data-dec>−</button>
            <span>${i.qty}</span>
            <button data-hover data-inc>+</button>
          </div>
        </div>
        <div class="cart-item-price">${money(i.producto.precio * i.qty)}</div>
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
  const total = items.reduce((s, i) => s + i.producto.precio * i.qty, 0);
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
    if (i.color) msg += ` (${colorName(i.color)})`;
    msg += ` — ${money(i.producto.precio * i.qty)}\n`;
  });
  const total = items.reduce((s, i) => s + i.producto.precio * i.qty, 0);
  const dinoQty = items.filter(i => i.producto.id === "amigo-dino").reduce((s, i) => s + i.qty, 0);
  const gratis = Math.floor(dinoQty / 3);
  const dino = PRODUCTOS.find(p => p.id === "amigo-dino");
  const descuento = gratis * (dino ? dino.precio : 0);
  if (descuento > 0) msg += `\n🎉 Promo 3×2: −${money(descuento)}`;
  msg += `\n*Total: ${money(total - descuento)}*\n\n`;
  msg += "Mi nombre es: \nMi ciudad es: ";

  window.open(`https://wa.me/${CONFIG.whatsapp}?text=${encodeURIComponent(msg)}`, "_blank");
}

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
      const rotY = (px - 0.5) * 14;
      const rotX = (0.5 - py) * 10;
      card.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg) translateZ(6px)`;
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
