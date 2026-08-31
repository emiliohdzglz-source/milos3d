/* ==========================================================
   MILO'S 3D — Panel de administración
   Sin servidor: guarda en el celular y publica a GitHub Pages.
   ========================================================== */

/* ---------- Constantes ---------- */
const LS_KEY = "milos3d_admin_v1";
const PALETA = [
  "#4a7c3a", "#f2d33c", "#8aa84f", "#4a90d9", "#d93025", "#f2f2f2",
  "#7fd8c8", "#e91e78", "#f7a8c4", "#8e6bc8", "#b9a6e0", "#ff7a2f",
  "#1b1b1b", "#c0c8d8", "#4cc9ff"
];

const DEFAULTS = {
  pin: "",
  precioKg: 480,
  tarifaHora: 20,
  tarifaMano: 150,
  merma: 10,
  margen: 120,
  redondeo: 5,
  anticipo: 50,
  linkPago: "",
  datosPago: "",
  proxy: "https://r.jina.ai/",
  materiales: [
    { nombre: "PLA", precioKg: 450 },
    { nombre: "PLA Seda", precioKg: 620 },
    { nombre: "PETG", precioKg: 540 },
    { nombre: "TPU flexible", precioKg: 780 }
  ],
  gh: { owner: "emiliohdzglz-source", repo: "milos3d", branch: "main", token: "" },
  whatsapp: "524427831563"
};

/* ---------- Estado ---------- */
let DB = { ajustes: { ...DEFAULTS }, productos: [], cotizaciones: [], folio: 1000 };
let form = nuevoForm();
let editandoId = null;
let vistaActual = "nuevo";
let filtroCat = "todos";
let filtroCot = "todas";

function nuevoForm() {
  return {
    id: null, nombre: "", descripcion: "", link: "", imagen: "", imagenPath: "",
    gramos: 0, piezas: 1, horas: 0, minutos: 0, mano: 0, materialIdx: 0,
    colores: [], etiquetas: "", badge: "", precioManual: null
  };
}

/* ---------- Utilidades ---------- */
const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const num = (v) => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
const money = (n) => "$" + Math.round(n).toLocaleString("es-MX");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function slug(s) {
  return String(s).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "producto";
}

function b64enc(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = ""; const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}
function b64dec(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
}
const b64url = (s) => b64enc(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(t._t); t._t = setTimeout(() => t.classList.remove("show"), 2600);
}
function busy(msg) { $("#busy-msg").textContent = msg || "Trabajando…"; $("#busy").hidden = false; }
function unbusy() { $("#busy").hidden = true; }

/* ---------- Persistencia ---------- */
function guardar() { localStorage.setItem(LS_KEY, JSON.stringify(DB)); }
function cargar() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      DB = { ...DB, ...d };
      DB.ajustes = { ...DEFAULTS, ...(d.ajustes || {}) };
      DB.ajustes.gh = { ...DEFAULTS.gh, ...(d.ajustes?.gh || {}) };
    }
  } catch (e) { console.error("No se pudo leer el guardado", e); }
}

/* ==========================================================
   CANDADO
   ========================================================== */
function initLock() {
  const primera = !DB.ajustes.pin;
  if (!primera) $("#lock-hint").textContent = "Escribe tu PIN para entrar.";
  const entrar = () => {
    const pin = $("#lock-pin").value.trim();
    if (pin.length < 4) return toast("El PIN necesita al menos 4 dígitos");
    if (primera) { DB.ajustes.pin = pin; guardar(); }
    else if (pin !== DB.ajustes.pin) { $("#lock-pin").value = ""; return toast("PIN incorrecto"); }
    $("#lock").style.display = "none";
    $("#app").hidden = false;
    arrancar();
  };
  $("#lock-go").addEventListener("click", entrar);
  $("#lock-pin").addEventListener("keydown", e => { if (e.key === "Enter") entrar(); });
}

/* ==========================================================
   NAVEGACIÓN
   ========================================================== */
function irA(v) {
  vistaActual = v;
  $$(".view").forEach(el => el.hidden = el.id !== "view-" + v);
  $$(".tab").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  window.scrollTo(0, 0);
  if (v === "catalogo") renderCatalogo();
  if (v === "cotiza") renderCotizaciones();
  if (v === "ajustes") pintarAjustes();
}

/* ==========================================================
   IMÁGENES
   ========================================================== */
async function comprimirImagen(file, maxLado = 1400, calidad = 0.85) {
  const bitmap = await createImageBitmap(file).catch(async () => {
    const img = new Image();
    img.src = URL.createObjectURL(file);
    await img.decode();
    return img;
  });
  const w0 = bitmap.width, h0 = bitmap.height;
  const escala = Math.min(1, maxLado / Math.max(w0, h0));
  const w = Math.round(w0 * escala), h = Math.round(h0 * escala);
  const cv = document.createElement("canvas");
  cv.width = w; cv.height = h;
  const cx = cv.getContext("2d");
  cx.fillStyle = "#0a1020"; cx.fillRect(0, 0, w, h);
  cx.drawImage(bitmap, 0, 0, w, h);
  let dataURL = cv.toDataURL("image/webp", calidad);
  if (!dataURL.startsWith("data:image/webp")) dataURL = cv.toDataURL("image/jpeg", calidad);
  return dataURL;
}

async function tomarFoto(file) {
  if (!file) return;
  busy("Preparando la foto…");
  try {
    form.imagen = await comprimirImagen(file);
    const kb = Math.round((form.imagen.length * 0.75) / 1024);
    $("#photo-info").textContent = `Lista · ${kb} KB`;
    pintarFoto();
  } catch (e) {
    console.error(e); toast("No se pudo leer la imagen");
  }
  unbusy();
}

function pintarFoto() {
  const img = $("#photo-preview");
  if (form.imagen) { img.src = form.imagen; img.hidden = false; $("#photo-empty").hidden = true; }
  else { img.hidden = true; img.removeAttribute("src"); $("#photo-empty").hidden = false; }
}

/* ==========================================================
   LECTURA DE LIGAS Y TEXTO
   ========================================================== */
function parseDatos(texto) {
  const t = String(texto || "").replace(/ /g, " ");
  const out = { gramos: 0, horas: 0, minutos: 0, nombre: "", imagen: "" };

  // --- Gramos: primero cerca de una palabra clave, si no el primer "N g" ---
  const conClave = t.match(/(?:filament|filamento|material|peso|weight|used|usado)[^\n]{0,40}?(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramos|grams)\b/i);
  const suelto = t.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramos|grams)\b/i);
  const mg = conClave || suelto;
  if (mg) out.gramos = num(String(mg[1]).replace(",", "."));

  // --- Tiempo: "2h 14m", "2 horas 14 min", "2:14" ---
  let mt = t.match(/\b(\d{1,3})\s*(?:h|hr|hrs|hora|horas|hour|hours)\b[^\dA-Za-z]{0,4}(\d{1,2})?\s*(?:m|min|mins|minuto|minutos|minute|minutes)?\b/i);
  if (mt) { out.horas = num(mt[1]); out.minutos = num(mt[2] || 0); }
  else {
    mt = t.match(/(?:time|tiempo|duraci[oó]n)[^\n]{0,30}?\b(\d{1,3}):(\d{2})\b/i) || t.match(/\b(\d{1,2}):(\d{2})\b/);
    if (mt) { out.horas = num(mt[1]); out.minutos = num(mt[2]); }
    else {
      mt = t.match(/\b(\d{1,4})\s*(?:m|min|mins|minuto|minutos|minutes?)\b/i);
      if (mt) { out.minutos = num(mt[1]) % 60; out.horas = Math.floor(num(mt[1]) / 60); }
    }
  }

  // --- Título ---
  const mn = t.match(/^\s*Title:\s*(.+)$/mi) || t.match(/^\s*#\s+(.+)$/m);
  if (mn) out.nombre = mn[1].replace(/\s*[|\-–]\s*MakerWorld.*$/i, "").trim().slice(0, 60);

  // --- Primera imagen grande ---
  const mi = [...t.matchAll(/!\[[^\]]*\]\((https?:\/\/[^\s)]+)\)/g)].map(x => x[1])
    .find(u => /makerworld|bambulab|cdn|image/i.test(u) && !/logo|avatar|icon|favicon/i.test(u));
  if (mi) out.imagen = mi;

  return out;
}

function aplicarDatos(d, origen) {
  let cambios = [];
  if (d.gramos) { $("#f-gramos").value = d.gramos; cambios.push(`${d.gramos} g`); }
  if (d.horas || d.minutos) { $("#f-horas").value = d.horas; $("#f-min").value = d.minutos; cambios.push(`${d.horas}h ${d.minutos}m`); }
  if (d.nombre && !$("#f-nombre").value.trim()) { $("#f-nombre").value = d.nombre; cambios.push(`“${d.nombre}”`); }
  leerForm(); recalcular();
  const msg = cambios.length ? "Encontré: " + cambios.join(" · ") : "No encontré gramos ni tiempo — captúralos a mano.";
  $("#link-status").textContent = msg;
  toast(cambios.length ? "Datos cargados ✅" : "Sin datos automáticos");
  return d;
}

async function leerLink() {
  const url = $("#f-link").value.trim();
  if (!/^https?:\/\//i.test(url)) return toast("Pega primero una liga válida");
  const proxy = (DB.ajustes.proxy || "").trim();
  const intentos = [];
  if (proxy) intentos.push(proxy.includes("{url}") ? proxy.replace("{url}", encodeURIComponent(url)) : proxy.replace(/\/?$/, "/") + url);
  intentos.push(url);

  busy("Leyendo la liga…");
  $("#link-status").textContent = "";
  for (const u of intentos) {
    try {
      const r = await fetch(u, { headers: { "Accept": "text/plain, text/html;q=0.9, */*;q=0.5" } });
      if (!r.ok) continue;
      const texto = await r.text();
      if (!texto || texto.length < 40) continue;
      const d = parseDatos(texto);
      unbusy();
      aplicarDatos(d, u);
      if (d.imagen && !form.imagen) {
        $("#link-status").textContent += " · La imagen no se descarga sola: toma el screenshot del diseño.";
      }
      return;
    } catch (e) { /* siguiente intento */ }
  }
  unbusy();
  $("#link-status").textContent = "No se pudo leer la liga (MakerWorld bloquea la lectura directa). Usa “Pegar datos del laminador” aquí abajo — es más rápido y nunca falla.";
  toast("No se pudo leer la liga");
}

/* ==========================================================
   CÁLCULO DE COSTOS
   ========================================================== */
function calcular(f = form, a = DB.ajustes) {
  const mat = a.materiales[f.materialIdx] || a.materiales[0] || { precioKg: a.precioKg };
  const precioKg = num(mat.precioKg) || num(a.precioKg);
  const piezas = Math.max(1, num(f.piezas) || 1);

  const horasTotales = num(f.horas) + num(f.minutos) / 60;
  const material = (num(f.gramos) / 1000) * precioKg;
  const maquina = horasTotales * num(a.tarifaHora);
  const mano = (num(f.mano) / 60) * num(a.tarifaMano);

  const directo = material + maquina + mano;
  const merma = directo * (num(a.merma) / 100);
  const costoTotal = directo + merma;
  const costoPieza = costoTotal / piezas;

  const sugerido = costoPieza * (1 + num(a.margen) / 100);
  const paso = Math.max(1, num(a.redondeo) || 1);
  const precioSugerido = Math.ceil(sugerido / paso) * paso;
  const precio = f.precioManual != null && f.precioManual !== "" ? num(f.precioManual) : precioSugerido;
  const utilidad = precio - costoPieza;
  const margenReal = precio > 0 ? (utilidad / precio) * 100 : 0;

  return { material, maquina, mano, merma, costoTotal, costoPieza, precioSugerido, precio, utilidad, margenReal, piezas, precioKg, horasTotales };
}

function recalcular() {
  const c = calcular();
  $("#calc-breakdown").innerHTML = `
    <div class="bd-row"><span>Filamento (${num(form.gramos)} g × ${money(c.precioKg)}/kg)</span><b>${money(c.material)}</b></div>
    <div class="bd-row"><span>Impresora (${c.horasTotales.toFixed(2)} h)</span><b>${money(c.maquina)}</b></div>
    <div class="bd-row"><span>Armado (${num(form.mano)} min)</span><b>${money(c.mano)}</b></div>
    <div class="bd-row"><span>Merma ${num(DB.ajustes.merma)}%</span><b>${money(c.merma)}</b></div>
    <div class="bd-row total"><span>Costo${c.piezas > 1 ? ` de ${c.piezas} piezas` : ""}</span><b>${money(c.costoTotal)}</b></div>
    ${c.piezas > 1 ? `<div class="bd-row"><span>Costo por pieza</span><b>${money(c.costoPieza)}</b></div>` : ""}
  `;
  $("#calc-precio").textContent = money(c.precioSugerido);
  $("#f-precio").placeholder = String(c.precioSugerido);
  $("#calc-margen").textContent = c.precio > 0
    ? `Con ${money(c.precio)} ganas ${money(c.utilidad)} por pieza (${c.margenReal.toFixed(0)}% del precio).`
    : "Captura gramos y tiempo para ver el precio.";
}

/* ==========================================================
   FORMULARIO DE PRODUCTO
   ========================================================== */
function pintarMateriales() {
  $("#f-material").innerHTML = DB.ajustes.materiales
    .map((m, i) => `<option value="${i}">${esc(m.nombre)} — ${money(m.precioKg)}/kg</option>`).join("");
  $("#f-material").value = String(Math.min(form.materialIdx, DB.ajustes.materiales.length - 1));
}

function pintarSwatches() {
  $("#f-colores").innerHTML = PALETA.map(c =>
    `<button type="button" class="sw ${form.colores.includes(c) ? "on" : ""}" data-c="${c}" style="background:${c}" aria-label="Color ${c}"></button>`
  ).join("");
  $$("#f-colores .sw").forEach(b => b.addEventListener("click", () => {
    const c = b.dataset.c;
    const i = form.colores.indexOf(c);
    if (i >= 0) form.colores.splice(i, 1); else form.colores.push(c);
    pintarSwatches();
  }));
}

function leerForm() {
  form.nombre = $("#f-nombre").value;
  form.descripcion = $("#f-desc").value;
  form.link = $("#f-link").value;
  form.gramos = num($("#f-gramos").value);
  form.piezas = num($("#f-piezas").value) || 1;
  form.horas = num($("#f-horas").value);
  form.minutos = num($("#f-min").value);
  form.mano = num($("#f-mano").value);
  form.materialIdx = num($("#f-material").value);
  form.etiquetas = $("#f-tags").value;
  form.badge = $("#f-badge").value;
  const pm = $("#f-precio").value.trim();
  form.precioManual = pm === "" ? null : num(pm);
}

function pintarForm() {
  $("#f-nombre").value = form.nombre;
  $("#f-desc").value = form.descripcion;
  $("#f-link").value = form.link;
  $("#f-gramos").value = form.gramos || "";
  $("#f-piezas").value = form.piezas || 1;
  $("#f-horas").value = form.horas || 0;
  $("#f-min").value = form.minutos || 0;
  $("#f-mano").value = form.mano || 0;
  $("#f-tags").value = form.etiquetas;
  $("#f-badge").value = form.badge;
  $("#f-precio").value = form.precioManual ?? "";
  $("#photo-info").textContent = form.imagen ? "Foto lista" : (form.imagenPath ? "Usando la foto ya publicada" : "");
  $("#link-status").textContent = "";
  pintarMateriales(); pintarSwatches(); pintarFoto(); recalcular();
  $("#view-nuevo .view-title").textContent = editandoId ? "Editar producto" : "Nuevo producto";
}

function generarDescripcion() {
  leerForm();
  const n = form.nombre.trim() || "Esta pieza";
  const tags = form.etiquetas.split(",").map(s => s.trim()).filter(Boolean);
  const c = calcular();
  const partes = [];
  partes.push(`${n} impreso en 3D con ${DB.ajustes.materiales[form.materialIdx]?.nombre || "PLA"} premium.`);
  if (tags.length) partes.push(tags.join(", ") + ".");
  if (form.gramos) partes.push(`Pieza sólida de ${Math.round(form.gramos)} g.`);
  if (c.horasTotales >= 0.5) partes.push(`Cada una toma ${form.horas > 0 ? form.horas + " h " : ""}${form.minutos > 0 ? form.minutos + " min" : ""} de impresión — se fabrica al momento de tu pedido.`);
  if (form.colores.length > 1) partes.push("Elige tu color favorito.");
  $("#f-desc").value = partes.join(" ");
  leerForm();
  toast("Descripción lista — edítala a tu gusto");
}

function limpiarForm() {
  form = nuevoForm();
  editandoId = null;
  pintarForm();
  $("#f-paste").value = "";
  window.scrollTo(0, 0);
}

function guardarBorrador(silencioso) {
  leerForm();
  if (!form.nombre.trim()) { toast("Ponle nombre al producto"); return null; }
  const c = calcular();
  if (!form.id) form.id = idUnico(slug(form.nombre));
  const registro = {
    ...JSON.parse(JSON.stringify(form)),
    precio: c.precio,
    costo: Math.round(c.costoPieza),
    estado: editandoId ? (DB.productos.find(p => p.id === editandoId)?.estado || "borrador") : "borrador",
    visible: DB.productos.find(p => p.id === form.id)?.visible !== false,
    actualizado: new Date().toISOString()
  };
  const i = DB.productos.findIndex(p => p.id === registro.id);
  if (i >= 0) DB.productos[i] = { ...DB.productos[i], ...registro };
  else DB.productos.unshift(registro);
  editandoId = registro.id;
  guardar();
  if (!silencioso) toast("Borrador guardado 💾");
  return registro;
}

function idUnico(base) {
  let id = base, n = 2;
  while (DB.productos.some(p => p.id === id && p.id !== editandoId)) id = `${base}-${n++}`;
  return id;
}

function editarProducto(id) {
  const p = DB.productos.find(x => x.id === id);
  if (!p) return;
  form = { ...nuevoForm(), ...p, precioManual: p.precioManual ?? p.precio ?? null };
  editandoId = id;
  irA("nuevo");
  pintarForm();
}

/* ==========================================================
   GITHUB
   ========================================================== */
function gh() { return DB.ajustes.gh; }
function ghOk() { const g = gh(); return !!(g.owner && g.repo && g.token); }

async function ghFetch(path, opts = {}) {
  const g = gh();
  const url = `https://api.github.com/repos/${g.owner}/${g.repo}/contents/${path}`;
  const r = await fetch(url, {
    ...opts,
    headers: {
      "Authorization": `Bearer ${g.token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(opts.body ? { "Content-Type": "application/json" } : {}),
      ...(opts.headers || {})
    }
  });
  return r;
}

async function ghLeer(path) {
  const g = gh();
  const r = await ghFetch(`${path}?ref=${encodeURIComponent(g.branch || "main")}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${(await r.json().catch(() => ({}))).message || "error al leer"}`);
  return r.json();
}

async function ghEscribir(path, contenidoB64, mensaje, sha) {
  const g = gh();
  const r = await ghFetch(path, {
    method: "PUT",
    body: JSON.stringify({
      message: mensaje,
      content: contenidoB64,
      branch: g.branch || "main",
      ...(sha ? { sha } : {})
    })
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(`GitHub ${r.status}: ${j.message || "no se pudo escribir"}`);
  }
  return r.json();
}

async function probarConexion() {
  if (!ghOk()) { $("#s-test-msg").textContent = "Faltan datos (usuario, repo o token)."; return false; }
  busy("Probando conexión…");
  try {
    const j = await ghLeer("products.json");
    unbusy();
    if (!j) { $("#s-test-msg").textContent = "Conectado, pero no encontré products.json en esa rama."; return false; }
    $("#s-test-msg").textContent = "✅ Conectado. El sitio está listo para recibir publicaciones.";
    $("#sync-pill").textContent = "conectado"; $("#sync-pill").className = "pill ok";
    return true;
  } catch (e) {
    unbusy();
    $("#s-test-msg").textContent = "❌ " + e.message;
    $("#sync-pill").textContent = "sin conectar"; $("#sync-pill").className = "pill bad";
    return false;
  }
}

/* ---------- Publicar ---------- */
async function publicar() {
  const p = guardarBorrador(true);
  if (!p) return;
  if (!ghOk()) { toast("Conecta el sitio primero (Ajustes)"); irA("ajustes"); return; }
  if (!p.imagen && !p.imagenPath) { if (!confirm("No hay foto. ¿Publicar sin imagen?")) return; }

  try {
    let imagenPath = p.imagenPath;

    if (p.imagen) {
      busy("Subiendo la foto…");
      const ext = p.imagen.startsWith("data:image/webp") ? "webp" : "jpg";
      imagenPath = `images/${p.id}.${ext}`;
      const b64 = p.imagen.split(",")[1];
      const prev = await ghLeer(imagenPath);
      await ghEscribir(imagenPath, b64, `Foto de ${p.nombre}`, prev?.sha);
    }

    busy("Actualizando el catálogo…");
    const archivo = await ghLeer("products.json");
    if (!archivo) throw new Error("No encontré products.json en el repositorio.");
    const data = JSON.parse(b64dec(archivo.content));
    data.productos = data.productos || [];

    const ficha = {
      id: p.id,
      nombre: p.nombre,
      descripcion: p.descripcion || "",
      precio: Math.round(p.precio),
      imagen: imagenPath || "",
      badge: p.badge || "",
      colores: p.colores || [],
      etiquetas: (p.etiquetas || "").split(",").map(s => s.trim()).filter(Boolean),
      visible: p.visible !== false
    };

    const i = data.productos.findIndex(x => x.id === p.id);
    if (i >= 0) data.productos[i] = { ...data.productos[i], ...ficha };
    else {
      const ej = data.productos.findIndex(x => x.id === "ejemplo-producto");
      if (ej >= 0) data.productos.splice(ej, 0, ficha); else data.productos.push(ficha);
    }

    await ghEscribir("products.json", b64enc(JSON.stringify(data, null, 2)),
      `Producto: ${p.nombre}`, archivo.sha);

    const reg = DB.productos.find(x => x.id === p.id);
    reg.estado = "publicado";
    reg.imagenPath = imagenPath;
    reg.imagen = "";               // ya vive en el repo, no ocupamos la copia local
    reg.publicado = new Date().toISOString();
    guardar();

    unbusy();
    mostrarHoja("🚀 ¡Publicado!", `
      <p><b>${esc(p.nombre)}</b> ya está en camino a milos3d.com.</p>
      <p class="hint">GitHub tarda alrededor de un minuto en actualizar la página. Si no lo ves, recarga en unos momentos.</p>
    `, `<button class="btn btn-ghost" onclick="cerrarHoja()">Cerrar</button>
        <a class="btn btn-primary" href="https://www.milos3d.com/#catalogo" target="_blank" rel="noopener">Ver el sitio</a>`);
    limpiarForm();
    renderCatalogo();
  } catch (e) {
    unbusy();
    console.error(e);
    alert("No se pudo publicar.\n\n" + e.message);
  }
}

/* ---------- Traer lo que ya está publicado ---------- */
async function sincronizarCatalogo(avisar) {
  try {
    const r = await fetch("../products.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return;
    const data = await r.json();
    let nuevos = 0;
    (data.productos || []).forEach(p => {
      if (p.id === "ejemplo-producto") return;
      if (DB.productos.some(x => x.id === p.id)) {
        const l = DB.productos.find(x => x.id === p.id);
        l.estado = "publicado";
        if (!l.imagenPath) l.imagenPath = p.imagen || "";
      } else {
        DB.productos.push({
          ...nuevoForm(),
          id: p.id, nombre: p.nombre, descripcion: p.descripcion || "",
          imagenPath: p.imagen || "", precio: p.precio || 0, costo: 0,
          badge: p.badge || "", colores: p.colores || [],
          etiquetas: (p.etiquetas || []).join(", "),
          precioManual: p.precio || null,
          visible: p.visible !== false, estado: "publicado", importado: true
        });
        nuevos++;
      }
    });
    if (nuevos) guardar();
    if (avisar) toast(nuevos ? `${nuevos} producto(s) del sitio importados` : "Todo sincronizado");
  } catch (e) { /* offline: seguimos con lo local */ }
}

/* ==========================================================
   CATÁLOGO
   ========================================================== */
function imgSrc(p) {
  if (p.imagen) return p.imagen;
  if (p.imagenPath) return "../" + p.imagenPath;
  return "";
}

function renderCatalogo() {
  const lista = DB.productos.filter(p => filtroCat === "todos" || p.estado === filtroCat);
  const cont = $("#cat-list");
  if (!lista.length) {
    cont.innerHTML = `<div class="empty">Nada por aquí todavía.<br>Crea tu primer producto en la pestaña <b>Nuevo</b>.</div>`;
    return;
  }
  cont.innerHTML = lista.map(p => {
    const src = imgSrc(p);
    return `
    <div class="item" data-id="${esc(p.id)}">
      ${src ? `<img class="item-img" src="${esc(src)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'item-img',textContent:'🦖'}))">`
            : `<div class="item-img">🦖</div>`}
      <div class="item-body">
        <div class="item-name">${esc(p.nombre)}</div>
        <div class="item-meta">
          <span class="badge ${p.estado}">${p.estado}</span>
          ${p.visible === false ? ' <span class="badge borrador">oculto</span>' : ""}
        </div>
        <div class="item-meta">
          ${p.gramos ? `${p.gramos} g · ` : ""}${p.costo ? `costo ${money(p.costo)} · ` : ""}<span class="item-price">${money(p.precio || 0)}</span>
        </div>
      </div>
      <button class="icon-btn" data-menu="${esc(p.id)}">⋯</button>
    </div>`;
  }).join("");

  cont.querySelectorAll("[data-menu]").forEach(b =>
    b.addEventListener("click", () => menuProducto(b.dataset.menu)));
}

function menuProducto(id) {
  const p = DB.productos.find(x => x.id === id);
  if (!p) return;
  mostrarHoja(p.nombre, `
    <button class="btn btn-ghost btn-block" onclick="cerrarHoja();editarProducto('${esc(id)}')">✏️ Editar</button>
    <button class="btn btn-ghost btn-block" onclick="cerrarHoja();publicarExistente('${esc(id)}')">🚀 ${p.estado === "publicado" ? "Volver a publicar" : "Publicar"}</button>
    <button class="btn btn-ghost btn-block" onclick="cerrarHoja();toggleVisible('${esc(id)}')">${p.visible === false ? "👁️ Mostrar en el sitio" : "🙈 Ocultar del sitio"}</button>
    <button class="btn btn-ghost btn-block" onclick="cerrarHoja();cotizarDesde('${esc(id)}')">🧾 Cotizar este producto</button>
    <button class="btn btn-danger btn-block" onclick="cerrarHoja();borrarProducto('${esc(id)}')">🗑️ Borrar del panel</button>
  `, `<button class="btn btn-ghost" onclick="cerrarHoja()">Cerrar</button>`);
}

function publicarExistente(id) { editarProducto(id); setTimeout(publicar, 250); }

async function toggleVisible(id) {
  const p = DB.productos.find(x => x.id === id);
  p.visible = p.visible === false;
  guardar(); renderCatalogo();
  if (p.estado === "publicado" && ghOk()) {
    try {
      busy("Actualizando el sitio…");
      const archivo = await ghLeer("products.json");
      const data = JSON.parse(b64dec(archivo.content));
      const i = data.productos.findIndex(x => x.id === id);
      if (i >= 0) {
        data.productos[i].visible = p.visible;
        await ghEscribir("products.json", b64enc(JSON.stringify(data, null, 2)),
          `${p.visible ? "Mostrar" : "Ocultar"} ${p.nombre}`, archivo.sha);
      }
      unbusy(); toast(p.visible ? "Visible en el sitio" : "Oculto del sitio");
    } catch (e) { unbusy(); alert("No se pudo actualizar el sitio.\n\n" + e.message); }
  } else toast("Guardado");
}

function borrarProducto(id) {
  const p = DB.productos.find(x => x.id === id);
  if (!confirm(`¿Borrar “${p.nombre}” del panel?\n\nEsto NO lo quita del sitio — para eso usa “Ocultar del sitio”.`)) return;
  DB.productos = DB.productos.filter(x => x.id !== id);
  guardar(); renderCatalogo(); toast("Borrado del panel");
}

/* ==========================================================
   COTIZACIONES
   ========================================================== */
function nuevaCotizacion(items = []) {
  DB.folio = (DB.folio || 1000) + 1;
  const c = {
    id: "c" + Date.now(),
    folio: DB.folio,
    cliente: "", tel: "",
    items: items.length ? items : [{ nombre: "", precio: 0, qty: 1, nota: "" }],
    envio: 0, descuento: 0, nota: "",
    estado: "borrador", pagos: [],
    creada: new Date().toISOString()
  };
  DB.cotizaciones.unshift(c);
  guardar();
  return c;
}

function cotizarDesde(id) {
  const p = DB.productos.find(x => x.id === id);
  const c = nuevaCotizacion([{ nombre: p.nombre, precio: p.precio || 0, qty: 1, nota: "", imagen: p.imagenPath || "" }]);
  irA("cotiza");
  editarCotizacion(c.id);
}

function totalesCot(c) {
  const sub = c.items.reduce((s, i) => s + num(i.precio) * num(i.qty), 0);
  const total = sub + num(c.envio) - num(c.descuento);
  const pagado = (c.pagos || []).reduce((s, p) => s + num(p.monto), 0);
  return { sub, total, pagado, saldo: total - pagado };
}

function renderCotizaciones() {
  const lista = DB.cotizaciones.filter(c => filtroCot === "todas" || c.estado === filtroCot);

  const abiertas = DB.cotizaciones.filter(c => c.estado === "enviada" || c.estado === "aprobada");
  const porCobrar = abiertas.reduce((s, c) => s + totalesCot(c).saldo, 0);
  const cobrado = DB.cotizaciones.reduce((s, c) => s + totalesCot(c).pagado, 0);
  $("#cot-totales").innerHTML = `
    <div class="tot"><span>Por cobrar</span><strong>${money(porCobrar)}</strong></div>
    <div class="tot"><span>Cobrado</span><strong>${money(cobrado)}</strong></div>
    <div class="tot"><span>Abiertas</span><strong>${abiertas.length}</strong></div>`;

  const cont = $("#cot-list");
  if (!lista.length) { cont.innerHTML = `<div class="empty">Sin cotizaciones aquí.</div>`; return; }
  cont.innerHTML = lista.map(c => {
    const t = totalesCot(c);
    return `
    <div class="item">
      <div class="item-img">🧾</div>
      <div class="item-body">
        <div class="item-name">${esc(c.cliente || "Sin nombre")} <span class="muted small">#${c.folio}</span></div>
        <div class="item-meta"><span class="badge ${c.estado}">${c.estado}</span> ${c.items.length} concepto(s)</div>
        <div class="item-meta">
          <span class="item-price">${money(t.total)}</span>
          ${t.saldo > 0 && t.pagado > 0 ? ` · saldo ${money(t.saldo)}` : ""}
        </div>
      </div>
      <button class="icon-btn" data-cot="${c.id}">⋯</button>
    </div>`;
  }).join("");
  cont.querySelectorAll("[data-cot]").forEach(b =>
    b.addEventListener("click", () => menuCotizacion(b.dataset.cot)));
}

function menuCotizacion(id) {
  const c = DB.cotizaciones.find(x => x.id === id);
  const t = totalesCot(c);
  mostrarHoja(`#${c.folio} · ${c.cliente || "Sin nombre"}`, `
    <div class="pay-row"><span>Total</span><b>${money(t.total)}</b></div>
    <div class="pay-row"><span>Pagado</span><b>${money(t.pagado)}</b></div>
    <div class="pay-row"><span>Saldo</span><b>${money(t.saldo)}</b></div>
    <button class="btn btn-ghost btn-block" onclick="cerrarHoja();editarCotizacion('${id}')">✏️ Editar</button>
    <button class="btn btn-primary btn-block" onclick="cerrarHoja();enviarCotizacion('${id}')">📤 Enviar por WhatsApp</button>
    <button class="btn btn-ghost btn-block" onclick="cerrarHoja();copiarLink('${id}')">🔗 Copiar liga de la cotización</button>
    <button class="btn btn-ghost btn-block" onclick="cerrarHoja();cambiarEstado('${id}','aprobada')">✅ Marcar aprobada</button>
    <button class="btn btn-ghost btn-block" onclick="cerrarHoja();registrarPago('${id}')">💰 Registrar cobro</button>
    <button class="btn btn-ghost btn-block" onclick="cerrarHoja();cambiarEstado('${id}','cancelada')">🚫 Cancelar</button>
    <button class="btn btn-danger btn-block" onclick="cerrarHoja();borrarCotizacion('${id}')">🗑️ Borrar</button>
  `, `<button class="btn btn-ghost" onclick="cerrarHoja()">Cerrar</button>`);
}

function editarCotizacion(id) {
  const c = DB.cotizaciones.find(x => x.id === id);
  const lineas = () => c.items.map((it, i) => `
    <div class="qline">
      <div class="qline-head">
        <b>Concepto ${i + 1}</b>
        ${c.items.length > 1 ? `<button class="btn btn-mini btn-danger" data-del="${i}">Quitar</button>` : ""}
      </div>
      <label>Qué es<input type="text" data-f="nombre" data-i="${i}" value="${esc(it.nombre)}" placeholder="Ej: Dragón articulado"></label>
      <div class="grid2">
        <label>Precio c/u<input type="number" inputmode="decimal" data-f="precio" data-i="${i}" value="${it.precio || ""}"></label>
        <label>Cantidad<input type="number" inputmode="numeric" min="1" data-f="qty" data-i="${i}" value="${it.qty || 1}"></label>
      </div>
      <label>Detalle<input type="text" data-f="nota" data-i="${i}" value="${esc(it.nota || "")}" placeholder="Colores, tamaño, nombre…"></label>
    </div>`).join("");

  const cuerpo = () => `
    <div class="grid2">
      <label>Cliente<input type="text" id="q-cliente" value="${esc(c.cliente)}" placeholder="Nombre"></label>
      <label>WhatsApp<input type="tel" id="q-tel" inputmode="tel" value="${esc(c.tel)}" placeholder="4427831563"></label>
    </div>
    <div id="q-lineas">${lineas()}</div>
    <button class="btn btn-ghost btn-block" id="q-add">+ Agregar concepto</button>
    <div class="grid2" style="margin-top:14px">
      <label>Envío<input type="number" inputmode="decimal" id="q-envio" value="${c.envio || ""}"></label>
      <label>Descuento<input type="number" inputmode="decimal" id="q-desc" value="${c.descuento || ""}"></label>
    </div>
    <label>Notas para el cliente<textarea id="q-nota" rows="2" placeholder="Tiempo de entrega, condiciones…">${esc(c.nota)}</textarea></label>
    <div class="pay-row"><span>Total</span><b id="q-total">${money(totalesCot(c).total)}</b></div>`;

  mostrarHoja(`Cotización #${c.folio}`, cuerpo(),
    `<button class="btn btn-ghost" onclick="cerrarHoja()">Cerrar</button>
     <button class="btn btn-primary" id="q-save">Guardar</button>`);

  const leer = () => {
    c.cliente = $("#q-cliente").value; c.tel = $("#q-tel").value;
    c.envio = num($("#q-envio").value); c.descuento = num($("#q-desc").value);
    c.nota = $("#q-nota").value;
    $$("#q-lineas [data-f]").forEach(el => {
      const it = c.items[+el.dataset.i];
      if (!it) return;
      it[el.dataset.f] = el.dataset.f === "nombre" || el.dataset.f === "nota" ? el.value : num(el.value);
    });
    $("#q-total").textContent = money(totalesCot(c).total);
  };

  const enlazar = () => {
    $("#sheet-body").querySelectorAll("input, textarea").forEach(el => el.addEventListener("input", leer));
    $$("#q-lineas [data-del]").forEach(b => b.addEventListener("click", () => {
      leer(); c.items.splice(+b.dataset.del, 1);
      $("#q-lineas").innerHTML = lineas(); enlazar(); leer();
    }));
    $("#q-add").addEventListener("click", () => {
      leer(); c.items.push({ nombre: "", precio: 0, qty: 1, nota: "" });
      $("#q-lineas").innerHTML = lineas(); enlazar();
    });
  };
  enlazar();

  $("#q-save").addEventListener("click", () => {
    leer(); guardar(); cerrarHoja(); renderCotizaciones(); toast("Cotización guardada");
  });
}

function linkCotizacion(c) {
  const t = totalesCot(c);
  const payload = {
    f: c.folio, c: c.cliente,
    i: c.items.map(x => ({ n: x.nombre, p: num(x.precio), q: num(x.qty), d: x.nota || "", im: x.imagen || "" })),
    e: num(c.envio), x: num(c.descuento), t: c.nota,
    w: DB.ajustes.whatsapp, lp: DB.ajustes.linkPago, dp: DB.ajustes.datosPago,
    a: num(DB.ajustes.anticipo), tot: t.total
  };
  return `${location.origin}/cotizacion.html#q=${b64url(JSON.stringify(payload))}`;
}

function textoCotizacion(c) {
  const t = totalesCot(c);
  let m = `¡Hola${c.cliente ? " " + c.cliente : ""}! 🤖 Aquí va tu cotización de MILO'S 3D (#${c.folio}):\n\n`;
  c.items.forEach(i => {
    m += `▸ ${num(i.qty)}× ${i.nombre} — ${money(num(i.precio) * num(i.qty))}\n`;
    if (i.nota) m += `   ${i.nota}\n`;
  });
  if (num(c.envio)) m += `\n🚚 Envío: ${money(c.envio)}`;
  if (num(c.descuento)) m += `\n🎉 Descuento: −${money(c.descuento)}`;
  m += `\n\n*Total: ${money(t.total)}*\n`;
  if (c.nota) m += `\n${c.nota}\n`;
  m += `\nVer la cotización completa:\n${linkCotizacion(c)}\n\nResponde "APRUEBO" y la mandamos a imprimir. 🚀`;
  return m;
}

function enviarCotizacion(id) {
  const c = DB.cotizaciones.find(x => x.id === id);
  if (!c.items.some(i => i.nombre.trim())) return toast("Agrega al menos un concepto");
  if (c.estado === "borrador") { c.estado = "enviada"; c.enviada = new Date().toISOString(); guardar(); renderCotizaciones(); }
  const tel = String(c.tel || "").replace(/\D/g, "");
  const destino = tel ? (tel.length === 10 ? "52" + tel : tel) : "";
  window.open(`https://wa.me/${destino}?text=${encodeURIComponent(textoCotizacion(c))}`, "_blank");
}

async function copiarLink(id) {
  const c = DB.cotizaciones.find(x => x.id === id);
  const url = linkCotizacion(c);
  try { await navigator.clipboard.writeText(url); toast("Liga copiada 🔗"); }
  catch { prompt("Copia esta liga:", url); }
}

function cambiarEstado(id, estado) {
  const c = DB.cotizaciones.find(x => x.id === id);
  c.estado = estado; c[estado] = new Date().toISOString();
  guardar(); renderCotizaciones(); toast("Estado: " + estado);
}

function registrarPago(id) {
  const c = DB.cotizaciones.find(x => x.id === id);
  const t = totalesCot(c);
  const anticipo = Math.round(t.total * num(DB.ajustes.anticipo) / 100);
  mostrarHoja(`Registrar cobro · #${c.folio}`, `
    <div class="pay-row"><span>Total</span><b>${money(t.total)}</b></div>
    <div class="pay-row"><span>Ya pagado</span><b>${money(t.pagado)}</b></div>
    <div class="pay-row"><span>Saldo</span><b>${money(t.saldo)}</b></div>
    <label>Monto<input type="number" inputmode="decimal" id="p-monto" value="${Math.max(0, t.saldo)}"></label>
    <div class="row">
      <button class="btn btn-mini btn-ghost grow" id="p-ant">Anticipo ${DB.ajustes.anticipo}% (${money(anticipo)})</button>
      <button class="btn btn-mini btn-ghost grow" id="p-tot">Saldo completo</button>
    </div>
    <label style="margin-top:12px">Método
      <select id="p-metodo">
        <option>Efectivo</option><option>Transferencia / SPEI</option>
        <option>Mercado Pago</option><option>PayPal</option>
        <option>Tarjeta</option><option>Otro</option>
      </select>
    </label>
    <label>Referencia (opcional)<input type="text" id="p-ref" placeholder="Folio, últimos 4 dígitos…"></label>
    ${(c.pagos || []).length ? `<h4 class="card-title" style="margin-top:16px">Cobros anteriores</h4>` +
      c.pagos.map(p => `<div class="pay-row"><span>${new Date(p.fecha).toLocaleDateString("es-MX")} · ${esc(p.metodo)}</span><b>${money(p.monto)}</b></div>`).join("") : ""}
  `, `<button class="btn btn-ghost" onclick="cerrarHoja()">Cancelar</button>
      <button class="btn btn-primary" id="p-save">Registrar</button>`);

  $("#p-ant").addEventListener("click", () => $("#p-monto").value = anticipo);
  $("#p-tot").addEventListener("click", () => $("#p-monto").value = Math.max(0, t.saldo));
  $("#p-save").addEventListener("click", () => {
    const monto = num($("#p-monto").value);
    if (monto <= 0) return toast("Pon un monto");
    c.pagos = c.pagos || [];
    c.pagos.push({ monto, metodo: $("#p-metodo").value, ref: $("#p-ref").value, fecha: new Date().toISOString() });
    const nt = totalesCot(c);
    c.estado = nt.saldo <= 0 ? "pagada" : (c.estado === "borrador" || c.estado === "enviada" ? "aprobada" : c.estado);
    guardar(); cerrarHoja(); renderCotizaciones();
    toast(nt.saldo <= 0 ? "¡Pagada por completo! 🎉" : `Cobrado. Saldo: ${money(nt.saldo)}`);
  });
}

function borrarCotizacion(id) {
  const c = DB.cotizaciones.find(x => x.id === id);
  if (!confirm(`¿Borrar la cotización #${c.folio}?`)) return;
  DB.cotizaciones = DB.cotizaciones.filter(x => x.id !== id);
  guardar(); renderCotizaciones(); toast("Borrada");
}

/* ==========================================================
   AJUSTES
   ========================================================== */
const AJ_CAMPOS = [
  ["s-precioKg", "precioKg", "num"], ["s-tarifaHora", "tarifaHora", "num"],
  ["s-tarifaMano", "tarifaMano", "num"], ["s-merma", "merma", "num"],
  ["s-margen", "margen", "num"], ["s-redondeo", "redondeo", "num"],
  ["s-anticipo", "anticipo", "num"], ["s-linkPago", "linkPago", "str"],
  ["s-datosPago", "datosPago", "str"], ["s-proxy", "proxy", "str"]
];

function pintarAjustes() {
  AJ_CAMPOS.forEach(([id, k]) => { const el = $("#" + id); if (el) el.value = DB.ajustes[k] ?? ""; });
  $("#s-owner").value = gh().owner || "";
  $("#s-repo").value = gh().repo || "";
  $("#s-branch").value = gh().branch || "main";
  $("#s-token").value = gh().token || "";
  pintarMaterialesAjustes();
}

function pintarMaterialesAjustes() {
  $("#s-materiales").innerHTML = DB.ajustes.materiales.map((m, i) => `
    <div class="mini">
      <span class="grow">${esc(m.nombre)}</span>
      <b>${money(m.precioKg)}/kg</b>
      <button class="icon-btn" data-mat="${i}">✕</button>
    </div>`).join("") || `<p class="hint">Agrega al menos un material.</p>`;
  $$("#s-materiales [data-mat]").forEach(b => b.addEventListener("click", () => {
    DB.ajustes.materiales.splice(+b.dataset.mat, 1);
    guardar(); pintarMaterialesAjustes(); pintarMateriales(); recalcular();
  }));
}

function leerAjustes() {
  AJ_CAMPOS.forEach(([id, k, tipo]) => {
    const el = $("#" + id); if (!el) return;
    DB.ajustes[k] = tipo === "num" ? num(el.value) : el.value.trim();
  });
  DB.ajustes.gh = {
    owner: $("#s-owner").value.trim(), repo: $("#s-repo").value.trim(),
    branch: $("#s-branch").value.trim() || "main", token: $("#s-token").value.trim()
  };
  guardar();
  recalcular();
}

function exportarRespaldo() {
  const copia = JSON.parse(JSON.stringify(DB));
  delete copia.ajustes.token;
  if (copia.ajustes.gh) copia.ajustes.gh.token = "";
  const blob = new Blob([JSON.stringify(copia, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `milos3d-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Respaldo descargado (sin el token)");
}

async function importarRespaldo(file) {
  if (!file) return;
  if (!confirm("Esto reemplaza los productos y cotizaciones de este celular. ¿Continuar?")) return;
  try {
    const d = JSON.parse(await file.text());
    const token = gh().token;
    DB = { ...DB, ...d };
    DB.ajustes = { ...DEFAULTS, ...(d.ajustes || {}) };
    DB.ajustes.gh = { ...DEFAULTS.gh, ...(d.ajustes?.gh || {}), token };
    guardar(); pintarAjustes(); toast("Respaldo restaurado");
  } catch (e) { alert("El archivo no se pudo leer."); }
}

/* ==========================================================
   HOJA MODAL
   ========================================================== */
function mostrarHoja(titulo, cuerpo, pie) {
  $("#sheet-title").textContent = titulo;
  $("#sheet-body").innerHTML = cuerpo;
  $("#sheet-foot").innerHTML = pie || "";
  $("#sheet").hidden = false; $("#sheet-overlay").hidden = false;
}
function cerrarHoja() { $("#sheet").hidden = true; $("#sheet-overlay").hidden = true; }

/* ==========================================================
   ARRANQUE
   ========================================================== */
function arrancar() {
  pintarForm();
  sincronizarCatalogo(false);
  if (ghOk()) { $("#sync-pill").textContent = "conectado"; $("#sync-pill").className = "pill ok"; }
  else { $("#sync-pill").textContent = "conecta el sitio"; $("#sync-pill").className = "pill bad"; }

  // Navegación
  $$(".tab").forEach(b => b.addEventListener("click", () => irA(b.dataset.view)));
  $("#btn-lock").addEventListener("click", () => location.reload());

  // Foto
  $("#in-camera").addEventListener("change", e => tomarFoto(e.target.files[0]));
  $("#in-file").addEventListener("change", e => tomarFoto(e.target.files[0]));

  // Liga y pegado
  $("#btn-leer").addEventListener("click", leerLink);
  $("#btn-parse").addEventListener("click", () => {
    const txt = $("#f-paste").value;
    if (!txt.trim()) return toast("Pega el texto primero");
    aplicarDatos(parseDatos(txt), "pegado");
  });

  // Cálculo en vivo
  ["f-gramos", "f-piezas", "f-horas", "f-min", "f-mano", "f-material", "f-precio"].forEach(id =>
    $("#" + id).addEventListener("input", () => { leerForm(); recalcular(); }));
  $("#f-material").addEventListener("change", () => { leerForm(); recalcular(); });

  // Guardar / publicar
  $("#btn-desc").addEventListener("click", generarDescripcion);
  $("#btn-guardar").addEventListener("click", () => { guardarBorrador(); renderCatalogo(); });
  $("#btn-publicar").addEventListener("click", publicar);
  $("#btn-limpiar").addEventListener("click", () => { if (confirm("¿Limpiar el formulario?")) limpiarForm(); });

  // Catálogo
  $$("#cat-filtro .seg-btn").forEach(b => b.addEventListener("click", () => {
    filtroCat = b.dataset.f;
    $$("#cat-filtro .seg-btn").forEach(x => x.classList.toggle("active", x === b));
    renderCatalogo();
  }));

  // Cotizaciones
  $("#btn-nueva-cot").addEventListener("click", () => { const c = nuevaCotizacion(); renderCotizaciones(); editarCotizacion(c.id); });
  $$("#cot-filtro .seg-btn").forEach(b => b.addEventListener("click", () => {
    filtroCot = b.dataset.f;
    $$("#cot-filtro .seg-btn").forEach(x => x.classList.toggle("active", x === b));
    renderCotizaciones();
  }));

  // Ajustes
  $$("#view-ajustes input, #view-ajustes textarea").forEach(el => {
    if (el.type === "file") return;
    el.addEventListener("change", leerAjustes);
  });
  $("#s-mat-add").addEventListener("click", () => {
    const n = $("#s-mat-nombre").value.trim(), p = num($("#s-mat-precio").value);
    if (!n || !p) return toast("Pon nombre y precio por kilo");
    DB.ajustes.materiales.push({ nombre: n, precioKg: p });
    $("#s-mat-nombre").value = ""; $("#s-mat-precio").value = "";
    guardar(); pintarMaterialesAjustes(); pintarMateriales();
  });
  $("#s-test").addEventListener("click", async () => { leerAjustes(); await probarConexion(); });
  $("#s-pin").addEventListener("click", () => {
    const p = prompt("Nuevo PIN (mínimo 4 dígitos):");
    if (p && p.trim().length >= 4) { DB.ajustes.pin = p.trim(); guardar(); toast("PIN actualizado"); }
  });
  $("#s-export").addEventListener("click", exportarRespaldo);
  $("#s-import").addEventListener("change", e => importarRespaldo(e.target.files[0]));

  // Hoja modal
  $("#sheet-close").addEventListener("click", cerrarHoja);
  $("#sheet-overlay").addEventListener("click", cerrarHoja);
}

cargar();
initLock();
