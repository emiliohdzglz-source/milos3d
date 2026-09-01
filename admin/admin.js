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

/* ==========================================================
   QUIÉNES PUEDEN USAR EL PANEL
   ----------------------------------------------------------
   Lista cerrada: nadie más se puede dar de alta. La copia que
   manda está en el servicio (pagos/worker.js): aunque alguien
   editara este archivo en su navegador, el token de GitHub no
   sale del Worker si el nombre no está en la lista de allá.
   Ésta de aquí evita el alta por error y mantiene honestas las
   firmas de "quién hizo qué".
   Para cambiarla hay que editar el código y volver a publicar.
   ========================================================== */
const ADMINS = ["Ale", "Emilio papá", "Milo"];

const normNombre = (n) => String(n || "").toUpperCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");
const nombreAdmin = (n) => ADMINS.find(a => normNombre(a) === normNombre(n)) || "";

const DEFAULTS = {
  usuario: "",
  autolock: 5,
  precioKg: 480,
  tarifaHora: 20,
  tarifaMano: 150,
  merma: 10,
  margen: 120,
  redondeo: 5,
  anticipo: 50,
  linkPago: "",
  datosPago: "",
  pagosURL: "",
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

/* Sólo en memoria: se pierden al bloquear o cerrar. Nunca tocan el disco. */
let LLAVE = null;        // llave que abre la bóveda
let SECRETOS = {};       // { ghToken }
let temporizadorLock = null;

function nuevoForm() {
  return {
    id: null, nombre: "", descripcion: "", link: "", imagen: "", imagenPath: "",
    gramos: 0, piezas: 1, horas: 0, minutos: 0, mano: 0, materialIdx: 0,
    colores: [], etiquetas: "", badge: "", precioManual: null,
    creadoPor: "", costosPor: "", publicadoPor: ""
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
      // Un nombre fuera de la lista (guardado antes, o traído en un
      // respaldo) se limpia: hay que volver a elegir de los tres.
      DB.ajustes.usuario = nombreAdmin(DB.ajustes.usuario);
    }
  } catch (e) { console.error("No se pudo leer el guardado", e); }
}

/* ==========================================================
   CANDADO
   ========================================================== */
function paso(cual) {
  ["registro", "entrar", "codigo"].forEach(x => $("#paso-" + x).hidden = x !== cual);
}

function initLock() {
  const registrado = !!DB.seguridad;
  paso(registrado ? "entrar" : "registro");

  if (registrado) {
    $("#entrar-saludo").textContent = DB.ajustes.usuario ? `Hola, ${DB.ajustes.usuario}` : "Bienvenido";
    if (DB.seguridad.porPasskey) {
      $("#btn-bio").hidden = false;
      $("#o-bien").hidden = false;
      SEG.hayBiometrico().then(hay => {
        $("#bio-txt").textContent = hay ? "Entrar con Face ID o huella" : "Entrar con mi passkey";
      });
    }
    setTimeout(() => $("#ent-clave").focus(), 300);
  } else {
    setTimeout(() => $("#reg-nombre").focus(), 300);
  }

  /* ---------- Registro ---------- */
  $("#reg-clave").addEventListener("input", () => {
    const f = SEG.fuerza($("#reg-clave").value);
    const colores = ["var(--bad)", "var(--bad)", "var(--warn)", "var(--warn)", "var(--ok)", "var(--ok)"];
    $("#fuerza-barra").style.width = (f.puntos / 5 * 100) + "%";
    $("#fuerza-barra").style.background = colores[f.puntos];
    $("#fuerza-txt").textContent = $("#reg-clave").value
      ? `${f.etiqueta}${f.ok ? "" : " — usa al menos 8 caracteres y mezcla letras y números"}`
      : "Mínimo 8 caracteres.";
  });

  $("#reg-go").addEventListener("click", async () => {
    const nombre = nombreAdmin($("#reg-nombre").value);
    const clave = $("#reg-clave").value;
    const clave2 = $("#reg-clave2").value;
    if (!nombre) return toast("Elige tu nombre de la lista");
    if (!SEG.fuerza(clave).ok) return toast("La contraseña está muy débil");
    if (clave !== clave2) return toast("Las contraseñas no coinciden");

    busy("Creando tu acceso…");
    try {
      const { seguridad, boveda } = await SEG.crear(clave, {});
      DB.ajustes.usuario = nombre;
      DB.seguridad = seguridad;
      DB.boveda = boveda;
      guardar();
      LLAVE = await SEG.abrirConContrasena(seguridad, clave);
      SECRETOS = {};
      unbusy();
      entrarAlPanel();
      setTimeout(() => ofrecerBiometrico(clave), 700);
    } catch (e) {
      unbusy(); console.error(e); toast("No se pudo crear el acceso");
    }
  });

  /* ---------- Entrar con contraseña ---------- */
  const entrarConClave = async () => {
    const clave = $("#ent-clave").value;
    if (!clave) return;
    busy("Abriendo…");
    const llave = await SEG.abrirConContrasena(DB.seguridad, clave);
    unbusy();
    if (!llave) {
      $("#ent-clave").value = "";
      $("#ent-error").textContent = "Contraseña incorrecta.";
      return;
    }
    $("#ent-error").textContent = "";
    await abrirBoveda(llave);
  };
  $("#ent-go").addEventListener("click", entrarConClave);
  $("#ent-clave").addEventListener("keydown", e => { if (e.key === "Enter") entrarConClave(); });

  /* ---------- Entrar con Face ID / huella ---------- */
  $("#btn-bio").addEventListener("click", async () => {
    $("#ent-error").textContent = "";
    try {
      const llave = await SEG.abrirConPasskey(DB.seguridad);
      if (!llave) { $("#ent-error").textContent = "No se reconoció. Usa tu contraseña."; return; }
      await abrirBoveda(llave);
    } catch (e) {
      $("#ent-error").textContent = "No se pudo usar la huella. Usa tu contraseña.";
    }
  });

  /* ---------- Segundo factor ---------- */
  const verificar = async () => {
    const codigo = $("#cod-2fa").value.replace(/\D/g, "");
    if (codigo.length !== 6) return toast("Son 6 dígitos");
    busy("Verificando…");
    const r = await pedirTokenAlServicio(codigo);
    unbusy();
    if (!r.ok) { $("#cod-2fa").value = ""; $("#cod-error").textContent = r.error; return; }
    SECRETOS.ghToken = r.token;
    $("#cod-error").textContent = "";
    entrarAlPanel();
  };
  $("#cod-go").addEventListener("click", verificar);
  $("#cod-2fa").addEventListener("input", e => { if (e.target.value.replace(/\D/g, "").length === 6) verificar(); });
  $("#cod-cancelar").addEventListener("click", () => { LLAVE = null; paso("entrar"); });

  $("#btn-olvide").addEventListener("click", () => {
    alert("La contraseña no se guarda en ningún lado, así que no se puede recuperar.\n\n" +
      "Lo que puedes hacer: entrar desde el celular de alguien más de la familia, o empezar de nuevo " +
      "en este celular desde Ajustes → Respaldo.\n\n" +
      "Tus productos publicados y el sitio NO se pierden: viven en milos3d.com.");
  });
}

/* ---------- Abrir la bóveda y decidir si falta el 2º paso ---------- */
async function abrirBoveda(llave) {
  LLAVE = llave;
  SECRETOS = (await SEG.leerBoveda(llave, DB.boveda)) || {};
  if (DB.ajustes.dosPasos && pagosBase()) {   // el token lo entrega el servicio, no el celular
    paso("codigo");
    setTimeout(() => $("#cod-2fa").focus(), 250);
    return;
  }
  entrarAlPanel();
}

function entrarAlPanel() {
  $("#lock").style.display = "none";
  $("#app").hidden = false;
  reiniciarAutolock();
  if (!window.__arrancado) { window.__arrancado = true; arrancar(); }
  else { pintarForm(); renderCatalogo(); }
  if (!DB.ajustes.usuario) {
    setTimeout(() => toast("Elige tu nombre en Ajustes → Seguridad"), 900);
  }
}

function yo() { return DB.ajustes.usuario || "alguien"; }

/* ---------- Guardar un secreto en la bóveda ---------- */
async function guardarSecretos() {
  if (!LLAVE) return;
  DB.boveda = await SEG.escribirBoveda(LLAVE, SECRETOS);
  guardar();
}

/* ---------- Bloqueo automático ---------- */
function bloquear() {
  LLAVE = null; SECRETOS = {};
  clearTimeout(temporizadorLock);
  location.reload();
}

function reiniciarAutolock() {
  clearTimeout(temporizadorLock);
  const min = Number(DB.ajustes.autolock);
  if (!min) return;
  temporizadorLock = setTimeout(bloquear, min * 60000);
}

["click", "keydown", "touchstart", "scroll"].forEach(ev =>
  addEventListener(ev, () => { if (LLAVE) reiniciarAutolock(); }, { passive: true }));

document.addEventListener("visibilitychange", () => {
  if (document.hidden && LLAVE && Number(DB.ajustes.autolock)) reiniciarAutolock();
});

/* ---------- Ofrecer Face ID justo después de registrarse ---------- */
async function ofrecerBiometrico(clave) {
  if (!(await SEG.hayBiometrico())) return;
  if (!confirm("¿Quieres entrar con Face ID o tu huella la próxima vez?\n\nTu contraseña seguirá funcionando como respaldo.")) return;
  await activarBiometrico(clave);
}

async function activarBiometrico(clave) {
  const c = clave || prompt("Confirma tu contraseña para activar la huella:");
  if (!c) return;
  const dek = await SEG.bytesDeDek(DB.seguridad, c);
  if (!dek) return toast("Contraseña incorrecta");
  try {
    busy("Registrando tu huella…");
    DB.seguridad.porPasskey = await SEG.registrarPasskey(DB.ajustes.usuario || "Milo's 3D", dek);
    guardar(); unbusy();
    toast("Listo: ya puedes entrar con Face ID 👤");
    pintarEstadoSeguridad();
  } catch (e) {
    unbusy();
    if (String(e.message).includes("PRF_NO_SOPORTADO")) {
      alert("Este navegador reconoce tu huella, pero no permite derivar una llave de ella " +
        "(le falta la extensión PRF).\n\nNo voy a activarla: sería una pantalla bonita que no protege nada. " +
        "Tu contraseña sí cifra el token de verdad.\n\nPrueba con Safari en iPhone (iOS 18 o más nuevo) " +
        "o Chrome actualizado en Android.");
    } else {
      toast("No se pudo registrar la huella");
    }
  }
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

/* ---------- Lectura directa de MakerWorld (API oficial) ---------- */
function mwIdDe(url) {
  const m = String(url).match(/makerworld\.[a-z.]+\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?models\/(\d+)/i);
  return m ? m[1] : null;
}

/* Proxy de imágenes con CORS: weserv es gratuito y confiable; si el servicio
   de pagos está publicado, se usa ese. */
function mwImagenURL(u, w = 1000) {
  const base = pagosBase();
  if (base) return `${base}/mw/imagen?url=${encodeURIComponent(u)}`;
  return "https://images.weserv.nl/?url=" + encodeURIComponent(String(u).replace(/^https?:\/\//, "")) + `&w=${w}&output=jpg`;
}

async function leerMakerWorld(id) {
  const api = `https://makerworld.com/api/v1/design-service/design/${id}`;
  const intentos = [];
  const base = pagosBase();
  if (base) intentos.push(`${base}/mw/design/${id}`);
  intentos.push("https://r.jina.ai/" + api);
  intentos.push(api); // por si algún día abren CORS

  for (const u of intentos) {
    try {
      const r = await fetch(u, { headers: { "Accept": "application/json, text/plain" } });
      if (!r.ok) continue;
      const texto = await r.text();
      const ini = texto.indexOf("{"); const fin = texto.lastIndexOf("}");
      if (ini < 0 || fin <= ini) continue;
      const d = JSON.parse(texto.slice(ini, fin + 1));
      if (d && d.id) return d;
    } catch (e) { /* siguiente */ }
  }
  return null;
}

function limpiaTitulo(t) {
  return String(t || "")
    .replace(/\s*[-–—|]\s*(free\s*)?(3d\s*)?(print(able)?\s*)?(model|file|stl|3mf)s?\s*$/i, "")
    .replace(/\s*\|\s*MakerWorld.*$/i, "")
    .trim().slice(0, 60);
}

function hexCercano(hex) {
  // Acomoda el color del filamento al más parecido de la paleta del sitio
  const h = String(hex || "").toUpperCase();
  if (!/^#[0-9A-F]{6}$/.test(h)) return null;
  const rgb = (x) => [1, 3, 5].map(i => parseInt(x.slice(i, i + 2), 16));
  const [r, g, b] = rgb(h);
  let mejor = h, dist = 90; // si nada queda cerca, conserva el hex real
  for (const p of PALETA) {
    const [pr, pg, pb] = rgb(p.toUpperCase());
    const d = Math.sqrt((r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2);
    if (d < dist) { dist = d; mejor = p; }
  }
  return mejor;
}

let fotosMW = [];

function aplicarMakerWorld(d) {
  const inst = (d.instances || []).find(i => i.isDefault) || (d.instances || [])[0] || {};
  const cambios = [];

  // Nombre (limpio, sin coletillas en inglés)
  const nombre = limpiaTitulo(d.title);
  if (nombre && !$("#f-nombre").value.trim()) { $("#f-nombre").value = nombre; cambios.push(`“${nombre}”`); }

  // Gramos: peso del perfil o suma de filamentos
  let gramos = num(inst.weight);
  if (!gramos && Array.isArray(inst.instanceFilaments)) {
    gramos = inst.instanceFilaments.reduce((s, f) => s + num(f.usedG), 0);
  }
  if (gramos) { $("#f-gramos").value = Math.round(gramos); cambios.push(`${Math.round(gramos)} g`); }

  // Tiempo real de impresión (viene en segundos)
  const secs = num(inst.prediction);
  if (secs > 60) {
    const h = Math.floor(secs / 3600), m = Math.round((secs % 3600) / 60);
    $("#f-horas").value = h; $("#f-min").value = m;
    cambios.push(`${h} h ${m} min`);
  }

  // Material: empata el tipo de filamento con tu lista de materiales
  const tipos = [...new Set((inst.instanceFilaments || []).map(f => String(f.type || "").toUpperCase()).filter(Boolean))];
  if (tipos.length) {
    const idx = DB.ajustes.materiales.findIndex(m => tipos.some(t => m.nombre.toUpperCase().includes(t)));
    if (idx >= 0) { form.materialIdx = idx; $("#f-material").value = String(idx); cambios.push(tipos.join("+")); }
  }

  // Colores propuestos por el diseñador
  const hexes = [...new Set((inst.instanceFilaments || []).map(f => hexCercano(f.color)).filter(Boolean))];
  if (hexes.length) {
    hexes.forEach(c => { if (!form.colores.includes(c)) form.colores.push(c); });
    cambios.push(`${hexes.length} color(es)`);
  }

  // Fotos oficiales del modelo
  fotosMW = [...new Set([
    d.coverUrl,
    inst.cover,
    ...((inst.pictures || []).map(p => (typeof p === "string" ? p : p?.url))),
    ...(((d.designExtension || {}).design_pictures || []).map(p => (typeof p === "string" ? p : p?.url)))
  ].filter(u => typeof u === "string" && /^https:\/\/makerworld\.bblmw\.com\//.test(u)))].slice(0, 8);
  pintarFotosMW();
  if (fotosMW.length && !form.imagen && !form.imagenPath) usarFotoMW(0); // portada automática

  leerForm(); recalcular(); pintarSwatches(); pintarMateriales();
  const perfil = inst.title ? ` · perfil “${inst.title}”` : "";
  $("#link-status").textContent = (cambios.length ? "Leído de MakerWorld: " + cambios.join(" · ") + perfil : "La liga respondió pero sin datos de impresión.")
    + (nombre && /[a-z]/i.test(nombre) ? " · 💡 Ponle nombre en español antes de publicar." : "");
  toast(cambios.length ? "Ficha técnica cargada ✅" : "Sin datos automáticos");
}

function pintarFotosMW() {
  const cont = $("#mw-fotos");
  if (!cont) return;
  if (!fotosMW.length) { cont.hidden = true; cont.innerHTML = ""; return; }
  cont.hidden = false;
  cont.innerHTML = `<p class="hint">Fotos oficiales del diseño — toca una para usarla como foto del producto:</p>
    <div class="mw-strip">` +
    fotosMW.map((u, i) => `<img class="mw-thumb" data-i="${i}" src="${esc(mwImagenURL(u, 220))}" alt="Foto ${i + 1}" loading="lazy">`).join("") +
    `</div>`;
  cont.querySelectorAll(".mw-thumb").forEach(img => {
    img.addEventListener("click", () => usarFotoMW(Number(img.dataset.i)));
  });
}

async function usarFotoMW(i) {
  const u = fotosMW[i];
  if (!u) return;
  busy("Descargando la foto…");
  try {
    const r = await fetch(mwImagenURL(u, 1100));
    if (!r.ok) throw new Error("HTTP " + r.status);
    const blob = await r.blob();
    await tomarFoto(blob);
    toast("Foto del diseño lista ✅");
  } catch (e) {
    console.error(e);
    toast("No se pudo descargar esa foto — prueba otra o toma screenshot");
  }
  unbusy();
}

async function leerLink() {
  const url = $("#f-link").value.trim();
  if (!/^https?:\/\//i.test(url)) return toast("Pega primero una liga válida");

  // MakerWorld: lectura directa de la ficha técnica oficial
  const mwId = mwIdDe(url);
  if (mwId) {
    busy("Leyendo el perfil de impresión de MakerWorld…");
    $("#link-status").textContent = "";
    const d = await leerMakerWorld(mwId);
    unbusy();
    if (d) { aplicarMakerWorld(d); return; }
    $("#link-status").textContent = "MakerWorld no respondió esta vez. Reintenta, o usa “Pegar datos del laminador” aquí abajo.";
    toast("No se pudo leer la liga");
    return;
  }

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
  if ($("#checklist")) pintarChecklist();
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
  const extras = form.colores.filter(c => !PALETA.includes(c));
  $("#f-colores").innerHTML = [...PALETA, ...extras].map(c =>
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
  const mat = DB.ajustes.materiales[form.materialIdx]?.nombre || "PLA";
  const c = calcular();
  const todo = (n + " " + form.etiquetas).toLowerCase();
  const es = (...kws) => kws.some(k => todo.includes(k));

  // Gancho comercial según el tipo de producto
  let gancho;
  if (es("fidget", "clicker", "click", "antiestr", "estres", "estrés"))
    gancho = `${n}: el antiestrés que no vas a querer soltar. Cada clic relaja, entretiene y ayuda a la concentración — perfecto para la escuela, la oficina o para traer en el bolsillo.`;
  else if (es("pulsera", "bracelet", "collar"))
    gancho = `${n}: un accesorio único que se arma a tu gusto. Ideal para regalar, presumir y coleccionar.`;
  else if (es("articulad", "dino", "drag", "flexi"))
    gancho = `${n}: sale de la impresora ya armado y se mueve de verdad. Articulado pieza por pieza — para jugar, coleccionar o regalar.`;
  else if (es("maceta", "lámpara", "lampara", "florero", "deco", "organizador", "portallaves"))
    gancho = `${n}: el detalle que transforma tu espacio. Diseño moderno fabricado capa a capa con acabado profesional.`;
  else if (es("juguete", "juego", "toy"))
    gancho = `${n}: diversión impresa en 3D, resistente y segura. El regalo con el que siempre quedas bien.`;
  else
    gancho = `${n}: diseño exclusivo impreso en 3D con acabado profesional. Una pieza que no vas a encontrar en cualquier tienda.`;

  const partes = [gancho];
  const tiempoTxt = c.horasTotales >= 1
    ? `${form.horas} h ${form.minutos ? form.minutos + " min" : ""}`.trim()
    : (c.horasTotales > 0 ? `${form.minutos} min` : "");
  partes.push(`Fabricado en ${mat} premium con impresión de precisión${tiempoTxt ? ` — cada pieza toma ${tiempoTxt} de máquina y se imprime al momento de tu pedido` : ""}.`);
  if (form.colores.length > 1) partes.push(`Disponible en ${form.colores.length} colores: pídelo en tu combinación favorita.`);
  partes.push("Hecho en México 🇲🇽 por MILO'S 3D. Pídelo hoy por WhatsApp y lo imprimimos para ti.");

  $("#f-desc").value = partes.join(" ");
  leerForm();
  toast("Descripción lista — edítala a tu gusto");
}

/* ==========================================================
   FLYER PROMOCIONAL (lienzo 1080×1350, estilo de la marca)
   ========================================================== */
function cargaImg(src) {
  return new Promise((res, rej) => {
    const im = new Image();
    im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

function rrect(cx, x, y, w, h, r) {
  cx.beginPath();
  cx.moveTo(x + r, y);
  cx.arcTo(x + w, y, x + w, y + h, r);
  cx.arcTo(x + w, y + h, x, y + h, r);
  cx.arcTo(x, y + h, x, y, r);
  cx.arcTo(x, y, x + w, y, r);
  cx.closePath();
}

async function generarFlyer() {
  leerForm();
  if (!form.imagen && !form.imagenPath) { toast("Primero pon la foto del producto"); return; }
  if (!form.nombre.trim()) { toast("Ponle nombre al producto"); return; }
  busy("Armando el flyer…");
  try {
    const c = calcular();
    const W = 1080, H = 1350;
    const cv = document.createElement("canvas");
    cv.width = W; cv.height = H;
    const cx = cv.getContext("2d");

    // Fondo: azul profundo con degradado y cuadrícula técnica
    const bg = cx.createLinearGradient(0, 0, 0, H);
    bg.addColorStop(0, "#060b18"); bg.addColorStop(.55, "#0a1226"); bg.addColorStop(1, "#04060e");
    cx.fillStyle = bg; cx.fillRect(0, 0, W, H);
    cx.strokeStyle = "rgba(76,201,255,0.07)"; cx.lineWidth = 1;
    for (let x = 0; x <= W; x += 54) { cx.beginPath(); cx.moveTo(x, 0); cx.lineTo(x, H); cx.stroke(); }
    for (let y = 0; y <= H; y += 54) { cx.beginPath(); cx.moveTo(0, y); cx.lineTo(W, y); cx.stroke(); }
    // Resplandor central
    const glow = cx.createRadialGradient(W / 2, 560, 80, W / 2, 560, 620);
    glow.addColorStop(0, "rgba(47,123,255,0.22)"); glow.addColorStop(1, "rgba(47,123,255,0)");
    cx.fillStyle = glow; cx.fillRect(0, 0, W, H);

    // Logo arriba
    try {
      const logo = await cargaImg("../assets/logo.webp");
      const lh = 170, lw = logo.width * (lh / logo.height);
      cx.shadowColor = "rgba(76,201,255,.55)"; cx.shadowBlur = 30;
      cx.drawImage(logo, (W - lw) / 2, 34, lw, lh);
      cx.shadowBlur = 0;
    } catch (e) { /* sin logo no pasa nada */ }

    // Foto del producto en marco redondeado con glow
    const foto = await cargaImg(form.imagen || ("../" + form.imagenPath));
    const FS = 640, fx = (W - FS) / 2, fy = 250;
    cx.save();
    cx.shadowColor = "rgba(76,201,255,.45)"; cx.shadowBlur = 46;
    rrect(cx, fx, fy, FS, FS, 34); cx.fillStyle = "#0d1730"; cx.fill();
    cx.shadowBlur = 0;
    rrect(cx, fx, fy, FS, FS, 34); cx.clip();
    const esc_ = Math.max(FS / foto.width, FS / foto.height);
    cx.drawImage(foto, fx + (FS - foto.width * esc_) / 2, fy + (FS - foto.height * esc_) / 2, foto.width * esc_, foto.height * esc_);
    cx.restore();
    cx.strokeStyle = "rgba(76,201,255,.6)"; cx.lineWidth = 3;
    rrect(cx, fx, fy, FS, FS, 34); cx.stroke();

    // Etiqueta naranja (badge)
    if (form.badge) {
      cx.font = "700 34px -apple-system, 'Segoe UI', sans-serif";
      const bw = cx.measureText(form.badge).width + 56;
      cx.save();
      cx.translate(fx + FS - bw * 0.45, fy + 8); cx.rotate(0.06);
      rrect(cx, 0, 0, bw, 62, 31);
      const gb = cx.createLinearGradient(0, 0, bw, 0);
      gb.addColorStop(0, "#ffd23c"); gb.addColorStop(1, "#ff9d2f");
      cx.fillStyle = gb; cx.shadowColor = "rgba(255,170,40,.5)"; cx.shadowBlur = 22; cx.fill();
      cx.shadowBlur = 0;
      cx.fillStyle = "#221600"; cx.textAlign = "center"; cx.textBaseline = "middle";
      cx.fillText(form.badge, bw / 2, 33);
      cx.restore();
    }

    // Nombre del producto (ajusta tamaño al ancho)
    cx.textAlign = "center"; cx.textBaseline = "alphabetic";
    let fz = 72;
    cx.font = `800 ${fz}px -apple-system, 'Segoe UI', sans-serif`;
    while (cx.measureText(form.nombre.toUpperCase()).width > W - 120 && fz > 34) {
      fz -= 4; cx.font = `800 ${fz}px -apple-system, 'Segoe UI', sans-serif`;
    }
    const grad = cx.createLinearGradient(0, 950, 0, 1020);
    grad.addColorStop(0, "#ffffff"); grad.addColorStop(.5, "#bcd0f0"); grad.addColorStop(1, "#7e97c4");
    cx.fillStyle = grad;
    cx.shadowColor = "rgba(76,201,255,.5)"; cx.shadowBlur = 26;
    cx.fillText(form.nombre.toUpperCase(), W / 2, 1005);
    cx.shadowBlur = 0;

    // Burbuja de precio
    const precioTxt = money(c.precio);
    cx.font = "900 76px -apple-system, 'Segoe UI', sans-serif";
    const pw = cx.measureText(precioTxt).width + 110;
    const px = (W - pw) / 2, py = 1050;
    rrect(cx, px, py, pw, 112, 56);
    const gp = cx.createLinearGradient(px, 0, px + pw, 0);
    gp.addColorStop(0, "#4cc9ff"); gp.addColorStop(1, "#2f7bff");
    cx.fillStyle = gp; cx.shadowColor = "rgba(76,201,255,.6)"; cx.shadowBlur = 34; cx.fill();
    cx.shadowBlur = 0;
    cx.fillStyle = "#021226"; cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillText(precioTxt, W / 2, py + 60);

    // Colores disponibles
    if (form.colores.length) {
      const n = Math.min(form.colores.length, 9), R = 17, gap = 50;
      const x0 = W / 2 - ((n - 1) * gap) / 2;
      form.colores.slice(0, 9).forEach((col, i) => {
        cx.beginPath(); cx.arc(x0 + i * gap, 1216, R, 0, Math.PI * 2);
        cx.fillStyle = col; cx.fill();
        cx.strokeStyle = "rgba(255,255,255,.55)"; cx.lineWidth = 2.5; cx.stroke();
      });
    }

    // Pie: contacto
    cx.font = "700 34px -apple-system, 'Segoe UI', sans-serif";
    cx.fillStyle = "#9fb0d0";
    cx.fillText("milos3d.com  ·  WhatsApp 442 783 1563", W / 2, 1305);

    const data = cv.toDataURL("image/jpeg", 0.92);
    $("#flyer-img").src = data;
    $("#flyer-out").hidden = false;
    $("#flyer-dl").href = data;
    $("#flyer-dl").download = `flyer-${slug(form.nombre)}.jpg`;
    form._flyer = data;
    toast("Flyer listo 🖼️");
  } catch (e) {
    console.error(e);
    toast("No se pudo armar el flyer — revisa la foto");
  }
  unbusy();
}

async function compartirFlyer() {
  if (!form._flyer) return toast("Genera primero el flyer");
  try {
    const blob = await (await fetch(form._flyer)).blob();
    const file = new File([blob], `flyer-${slug(form.nombre)}.jpg`, { type: "image/jpeg" });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title: form.nombre });
    } else {
      toast("Tu navegador no comparte archivos — usa Descargar");
    }
  } catch (e) { /* usuario canceló */ }
}

function limpiarForm() {
  form = nuevoForm();
  editandoId = null;
  fotosMW = [];
  pintarForm();
  pintarFotosMW();
  const fo = $("#flyer-out"); if (fo) { fo.hidden = true; $("#flyer-img").removeAttribute("src"); }
  $("#f-paste").value = "";
  window.scrollTo(0, 0);
}

function guardarBorrador(silencioso) {
  leerForm();
  if (!form.nombre.trim()) { toast("Ponle nombre al producto"); return null; }
  const c = calcular();
  if (!form.id) form.id = idUnico(slug(form.nombre));
  const previo = DB.productos.find(p => p.id === form.id) || {};

  const registro = {
    ...JSON.parse(JSON.stringify(form)),
    precio: c.precio,
    costo: Math.round(c.costoPieza),
    estado: previo.estado || "borrador",
    visible: previo.visible !== false,
    creadoPor: previo.creadoPor || form.creadoPor || yo(),
    costosPor: previo.costosPor || form.costosPor || "",
    publicadoPor: previo.publicadoPor || form.publicadoPor || "",
    actualizado: new Date().toISOString()
  };

  // Quien deja completos los datos de costo queda registrado.
  if (!registro.costosPor && tieneCostos(registro)) registro.costosPor = yo();

  const i = DB.productos.findIndex(p => p.id === registro.id);
  if (i >= 0) DB.productos[i] = { ...DB.productos[i], ...registro };
  else DB.productos.unshift(registro);
  editandoId = registro.id;
  form.creadoPor = registro.creadoPor;
  form.costosPor = registro.costosPor;
  guardar();
  pintarChecklist();
  if (!silencioso) {
    toast("Borrador guardado 💾");
    subirBorradores();   // que lo vean los otros dos celulares
  }
  return registro;
}

/* ---------- ¿Qué le falta a la ficha? ---------- */
function tieneCostos(p) {
  return num(p.gramos) > 0 && (num(p.horas) > 0 || num(p.minutos) > 0);
}

function faltantes(p) {
  const lista = [];
  lista.push({
    ok: !!String(p.nombre || "").trim(), texto: "Nombre del producto",
    ayuda: "Cómo se va a llamar en la tienda."
  });
  lista.push({
    ok: !!(p.imagen || p.imagenPath), texto: "Foto del diseño",
    ayuda: "Toma la foto de la pieza o sube el screenshot."
  });
  lista.push({
    ok: num(p.gramos) > 0, texto: "Gramos de filamento",
    ayuda: "Del laminador o de la liga de MakerWorld."
  });
  lista.push({
    ok: num(p.horas) > 0 || num(p.minutos) > 0, texto: "Tiempo de impresión",
    ayuda: "Horas y minutos que tarda la pieza."
  });
  lista.push({
    ok: num(p.precioManual ?? p.precio) > 0, texto: "Precio",
    ayuda: "Sale solo al llenar gramos y tiempo."
  });
  return lista;
}

function pintarChecklist() {
  const p = { ...form, precio: calcular().precio };
  const lista = faltantes(p);
  const faltan = lista.filter(x => !x.ok);
  const cont = $("#checklist");

  cont.innerHTML = faltan.length
    ? lista.map(x => `
        <div class="chk ${x.ok ? "ok" : "falta"}">
          <span class="mark">${x.ok ? "✓" : "○"}</span>
          <span>${x.texto}${x.ok ? "" : `<small>${x.ayuda}</small>`}</span>
        </div>`).join("")
    : `<div class="chk-listo"><span>✓</span><span>Ficha completa — lista para publicar</span></div>`;

  const btn = $("#btn-publicar");
  btn.disabled = faltan.length > 0;
  $("#publicar-hint").textContent = faltan.length
    ? `${faltan.length === 1 ? "Falta un dato" : `Faltan ${faltan.length} datos`}. Guárdalo como borrador y quien tenga los datos de impresión lo completa.`
    : "Te muestro cómo se va a ver antes de subirlo.";
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
function gh() { return { ...DB.ajustes.gh, token: SECRETOS.ghToken || "" }; }
function ghOk() { const g = gh(); return !!(g.owner && g.repo && g.token); }

/* ---------- Pedirle el token al servicio, con el código de 2 pasos ---------- */
async function pedirTokenAlServicio(codigo) {
  const base = pagosBase();
  if (!base) return { ok: false, error: "Falta la dirección del servicio." };
  try {
    const r = await fetch(base + "/panel/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usuario: DB.ajustes.usuario, codigo })
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok || !d.token) return { ok: false, error: d.error || "Código incorrecto." };
    return { ok: true, token: d.token };
  } catch (e) {
    return { ok: false, error: "No se pudo contactar al servicio." };
  }
}

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

/* ---------- Revisión obligatoria antes de publicar ---------- */
function revisarYPublicar() {
  const p = guardarBorrador(true);
  if (!p) return;

  const faltan = faltantes(p).filter(x => !x.ok);
  if (faltan.length) {
    toast("Todavía falta: " + faltan.map(x => x.texto.toLowerCase()).join(", "));
    return;
  }
  if (!ghOk()) { toast("Conecta el sitio primero (Ajustes)"); irA("ajustes"); return; }

  const src = imgSrc(p);
  const tags = (p.etiquetas || "").split(",").map(t => t.trim()).filter(Boolean);
  const yaEsta = p.estado === "publicado";
  const c = calcular();

  mostrarHoja("Así se va a ver", `
    <p class="hint" style="margin:0 0 14px">Revisa que todo esté bien. Al confirmar, esto aparece en milos3d.com.</p>

    <div class="previa">
      <div class="previa-img">
        ${p.badge ? `<span class="previa-badge">${esc(p.badge)}</span>` : ""}
        ${src ? `<img src="${esc(src)}" alt="" onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'vacia',textContent:'🦖'}))">` : `<div class="vacia">🦖</div>`}
      </div>
      <div class="previa-body">
        <div class="previa-nombre">${esc(p.nombre)}</div>
        <div class="previa-desc">${esc(p.descripcion) || '<i>Sin descripción</i>'}</div>
        ${tags.length ? `<div class="previa-tags">${tags.map(t => `<span class="previa-tag">${esc(t)}</span>`).join("")}</div>` : ""}
        ${p.colores?.length ? `<div class="previa-colores"><span class="muted small">Color:</span>${p.colores.map(x => `<i style="background:${esc(x)}"></i>`).join("")}</div>` : ""}
        <div class="previa-foot">
          <span class="previa-precio">${money(p.precio)} <small>c/u</small></span>
          <span class="previa-add">+ Agregar</span>
        </div>
      </div>
    </div>

    <div class="previa-nota">
      Cuesta <b>${money(c.costoPieza)}</b> hacerlo · se vende en <b>${money(p.precio)}</b> ·
      ganas <b>${money(c.utilidad)}</b> (${c.margenReal.toFixed(0)}%).<br>
      <span class="muted">${num(p.gramos)} g · ${num(p.horas)}h ${num(p.minutos)}m${c.piezas > 1 ? ` · ${c.piezas} piezas por impresión` : ""}</span>
    </div>

    <div class="previa-nota" style="margin-top:10px">
      Lo dio de alta <b>${esc(p.creadoPor || "—")}</b> ·
      datos de impresión de <b>${esc(p.costosPor || yo())}</b> ·
      lo publica <b>${esc(yo())}</b>
      ${yaEsta ? "<br><span class=\"muted\">Ya estaba publicado: se reemplaza la versión que está en el sitio.</span>" : ""}
    </div>
  `, `<button class="btn btn-ghost" onclick="cerrarHoja()">Volver a editar</button>
      <button class="btn btn-primary" id="confirmar-publicar">🚀 ${yaEsta ? "Actualizar" : "Publicar"}</button>`);

  $("#confirmar-publicar").addEventListener("click", () => { cerrarHoja(); publicar(); });
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
    reg.publicadoPor = yo();
    reg.publicado = new Date().toISOString();
    reg.actualizado = new Date().toISOString();
    guardar();
    subirBorradores();             // sale de la lista compartida de pendientes

    unbusy();
    mostrarHoja("🚀 ¡Publicado!", `
      <p><b>${esc(p.nombre)}</b> ya está en camino a milos3d.com.</p>
      <p class="hint">Publicado por ${esc(yo())}.</p>
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

/* ==========================================================
   BORRADORES COMPARTIDOS
   Los tres celulares ven los mismos pendientes. Viajan por el
   repositorio, igual que el catálogo. Van los datos de la ficha
   (nombre, foto, liga, gramos, tiempo) — NO los costos ni los
   márgenes, que se quedan en los Ajustes de cada celular.
   ========================================================== */
const CAMPOS_BORRADOR = [
  "id", "nombre", "descripcion", "link", "imagenPath", "gramos", "piezas",
  "horas", "minutos", "mano", "colores", "etiquetas", "badge",
  "creadoPor", "costosPor", "actualizado"
];

function aBorrador(p) {
  const o = {};
  CAMPOS_BORRADOR.forEach(k => { if (p[k] !== undefined && p[k] !== "") o[k] = p[k]; });
  return o;
}

let subiendoBorradores = false;

async function subirFotoBorrador(p) {
  if (!p.imagen) return;                 // sin foto nueva pendiente, nada que hacer
  const ext = p.imagen.startsWith("data:image/webp") ? "webp" : "jpg";
  const ruta = `images/${p.id}.${ext}`;
  const previo = await ghLeer(ruta);
  await ghEscribir(ruta, p.imagen.split(",")[1], `Foto del borrador ${p.nombre}`, previo?.sha);
  p.imagenPath = ruta;   // ya vive en el repo: los otros celulares la pueden ver
  p.imagen = "";         // deja de estar pendiente
}

async function subirBorradores() {
  if (!ghOk() || subiendoBorradores) return;
  subiendoBorradores = true;
  try {
    for (const p of DB.productos.filter(x => x.estado !== "publicado" && x.imagen)) {
      try { await subirFotoBorrador(p); }
      catch (e) { console.warn("Foto del borrador no subió:", e.message); }
    }
    guardar();

    const archivo = await ghLeer("borradores.json");
    const remotos = archivo ? JSON.parse(b64dec(archivo.content)) : { borradores: [] };
    const porId = new Map((remotos.borradores || []).map(b => [b.id, b]));

    DB.productos.forEach(p => {
      if (p.estado === "publicado") { porId.delete(p.id); return; }   // ya no es pendiente
      const remoto = porId.get(p.id);
      if (!remoto || (p.actualizado || "") >= (remoto.actualizado || "")) porId.set(p.id, aBorrador(p));
    });

    const nuevo = { actualizado: new Date().toISOString(), borradores: [...porId.values()] };
    const antes = archivo ? b64dec(archivo.content) : "";
    const texto = JSON.stringify(nuevo, null, 2);
    if (antes.replace(/"actualizado": "[^"]*",?\n/, "") === texto.replace(/"actualizado": "[^"]*",?\n/, "")) return;

    await ghEscribir("borradores.json", b64enc(texto),
      `Borradores actualizados por ${yo()}`, archivo?.sha);
  } catch (e) {
    console.warn("No se pudieron compartir los borradores:", e.message);
  } finally {
    subiendoBorradores = false;
  }
}

async function bajarBorradores() {
  try {
    const r = await fetch("../borradores.json?t=" + Date.now(), { cache: "no-store" });
    if (!r.ok) return 0;
    const data = await r.json();
    let nuevos = 0;
    (data.borradores || []).forEach(b => {
      const local = DB.productos.find(x => x.id === b.id);
      if (!local) {
        DB.productos.unshift({ ...nuevoForm(), ...b, estado: "borrador", visible: true, precioManual: null });
        nuevos++;
      } else if (local.estado !== "publicado" && (b.actualizado || "") > (local.actualizado || "")) {
        Object.assign(local, b);   // el otro celular lo dejó más nuevo
        nuevos++;
      }
    });
    if (nuevos) guardar();
    return nuevos;
  } catch (e) { return 0; }
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
    const deOtros = await bajarBorradores();
    if (nuevos) guardar();
    if (avisar) {
      const partes = [];
      if (nuevos) partes.push(`${nuevos} del sitio`);
      if (deOtros) partes.push(`${deOtros} pendiente(s) de la familia`);
      toast(partes.length ? "Sincronizado: " + partes.join(" y ") : "Todo al día");
    } else if (deOtros) {
      renderCatalogo();
    }
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
  const pendientes = DB.productos.filter(p => p.estado !== "publicado" && faltantes(p).some(x => !x.ok)).length;
  const aviso = $("#cat-aviso");
  if (aviso) {
    aviso.innerHTML = pendientes
      ? `<span>⏳ ${pendientes} producto(s) esperan datos de impresión</span>`
      : "";
  }
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
          ${p.estado === "publicado"
            ? `<span class="badge publicado">publicado</span>`
            : faltantes(p).some(x => !x.ok)
              ? `<span class="badge borrador">falta ${faltantes(p).filter(x => !x.ok).length}</span>`
              : `<span class="badge aprobada">listo para publicar</span>`}
          ${p.visible === false ? ' <span class="badge borrador">oculto</span>' : ""}
        </div>
        <div class="item-meta">
          ${p.gramos ? `${p.gramos} g · ` : ""}${p.costo ? `costo ${money(p.costo)} · ` : ""}<span class="item-price">${money(p.precio || 0)}</span>
        </div>
        <div class="firma">${firmaDe(p)}</div>
      </div>
      <button class="icon-btn" data-menu="${esc(p.id)}">⋯</button>
    </div>`;
  }).join("");

  cont.querySelectorAll("[data-menu]").forEach(b =>
    b.addEventListener("click", () => menuProducto(b.dataset.menu)));
}

function firmaDe(p) {
  const partes = [];
  if (p.creadoPor) partes.push(`alta <b>${esc(p.creadoPor)}</b>`);
  if (p.costosPor) partes.push(`datos <b>${esc(p.costosPor)}</b>`);
  if (p.publicadoPor) partes.push(`publicó <b>${esc(p.publicadoPor)}</b>`);
  return partes.join(" · ");
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

function publicarExistente(id) { editarProducto(id); setTimeout(revisarYPublicar, 250); }

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
    ${DB.ajustes.pagosURL ? `<button class="btn btn-ghost btn-block" onclick="cerrarHoja();revisarPago('${id}')">🔄 ¿Ya pagó con tarjeta?</button>` : ""}
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
    ${DB.ajustes.pagosURL ? `<p class="hint">💳 Esta cotización llevará botón de pago con tarjeta.</p>`
      : `<label>Link de pago de Mercado Pago <span class="muted small">(opcional)</span>
           <input type="url" id="q-link" value="${esc(c.linkPago || "")}" placeholder="Genéralo en la app de Mercado Pago">
         </label>`}
    <div class="pay-row"><span>Total</span><b id="q-total">${money(totalesCot(c).total)}</b></div>`;

  mostrarHoja(`Cotización #${c.folio}`, cuerpo(),
    `<button class="btn btn-ghost" onclick="cerrarHoja()">Cerrar</button>
     <button class="btn btn-primary" id="q-save">Guardar</button>`);

  const leer = () => {
    c.cliente = $("#q-cliente").value; c.tel = $("#q-tel").value;
    c.envio = num($("#q-envio").value); c.descuento = num($("#q-desc").value);
    c.nota = $("#q-nota").value;
    if ($("#q-link")) c.linkPago = $("#q-link").value.trim();
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
    w: DB.ajustes.whatsapp, lp: c.linkPago || DB.ajustes.linkPago, dp: DB.ajustes.datosPago,
    pg: (DB.ajustes.pagosURL || "").trim(),
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

/* ---------- Mercado Pago ---------- */
function pagosBase() { return (DB.ajustes.pagosURL || "").trim().replace(/\/+$/, ""); }

async function probarPagos() {
  const base = pagosBase();
  const msg = $("#s-pagos-msg");
  if (!base) { msg.textContent = "Pega primero la dirección del servicio."; return; }
  busy("Probando el servicio de pagos…");
  try {
    const r = await fetch(base + "/salud");
    const d = await r.json();
    unbusy();
    if (!d.ok) throw new Error("respuesta inesperada");
    msg.textContent = d.mercadopago
      ? `✅ Conectado.${d.historial ? " Con historial de cobros." : " Sin historial: el botón “¿ya pagó?” no estará disponible."}${d.webhookFirmado ? "" : " Falta la clave del webhook."}`
      : "⚠️ El servicio responde, pero todavía no tiene las credenciales de Mercado Pago.";
  } catch (e) {
    unbusy();
    msg.textContent = "❌ No respondió. Revisa la dirección o si ya se publicó el servicio.";
  }
}

async function revisarPago(id) {
  const c = DB.cotizaciones.find(x => x.id === id);
  const base = pagosBase();
  if (!base) return toast("Falta conectar el servicio de pagos");
  busy("Consultando a Mercado Pago…");
  try {
    const r = await fetch(`${base}/estado?folio=${encodeURIComponent(c.folio)}`);
    const d = await r.json();
    unbusy();

    if (d.estado === "approved") {
      const yaEsta = (c.pagos || []).some(p => p.ref === d.pagoId);
      if (yaEsta) return toast("Ese cobro ya estaba registrado");
      c.pagos = c.pagos || [];
      c.pagos.push({
        monto: num(d.monto), metodo: "Mercado Pago",
        ref: d.pagoId || "", fecha: d.fecha || new Date().toISOString()
      });
      c.estado = totalesCot(c).saldo <= 0 ? "pagada" : "aprobada";
      guardar(); renderCotizaciones();
      toast(`✅ Pagó ${money(d.monto)} con tarjeta`);
      return;
    }

    const textos = {
      pendiente: "Todavía no paga. La liga de pago ya está creada.",
      pending: "El pago está en proceso (puede ser OXXO o transferencia).",
      in_process: "Mercado Pago está revisando el pago.",
      rejected: "El pago fue rechazado. El cliente puede intentar otra vez.",
      refunded: "El pago fue devuelto.",
      sin_registro: "Nadie ha abierto la liga de pago de esta cotización.",
      desconocido: "El servicio no guarda historial — actívalo para usar esto."
    };
    toast(textos[d.estado] || `Estado: ${d.estado || "desconocido"}`);
  } catch (e) {
    unbusy();
    toast("No se pudo consultar el servicio");
  }
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
  ["s-datosPago", "datosPago", "str"], ["s-proxy", "proxy", "str"],
  ["s-pagosURL", "pagosURL", "str"]
];

function pintarAjustes() {
  AJ_CAMPOS.forEach(([id, k]) => { const el = $("#" + id); if (el) el.value = DB.ajustes[k] ?? ""; });
  $("#s-owner").value = gh().owner || "";
  $("#s-repo").value = gh().repo || "";
  $("#s-branch").value = gh().branch || "main";
  $("#s-token").value = SECRETOS.ghToken || "";
  $("#s-usuario").value = nombreAdmin(DB.ajustes.usuario);
  $("#s-autolock").value = String(DB.ajustes.autolock ?? 5);
  pintarMaterialesAjustes();
  pintarEstadoSeguridad();
}

function pintarEstadoSeguridad() {
  const bio = !!DB.seguridad?.porPasskey;
  const dos = !!(DB.ajustes.dosPasos && pagosBase());
  const tok = !!SECRETOS.ghToken;

  const fila = (on, titulo, nota) =>
    `<div class="fila"><span class="m ${on ? "on" : "off"}">${on ? "✓" : "○"}</span>
       <span class="${on ? "" : "off"}">${titulo}<small>${nota}</small></span></div>`;

  const e = $("#s-estado-seg");
  if (e) e.innerHTML =
    fila(true, "Lista cerrada de administradores",
      `Sólo ${ADMINS.join(", ")}. No se puede dar de alta a nadie más desde el panel: hay que editar el código y volver a publicar el servicio.`) +
    fila(true, "Contraseña", "Cifra el token que publica en el sitio. Sin ella, es ilegible.") +
    fila(bio, bio ? "Face ID / huella activo" : "Face ID / huella apagado",
      bio ? "La llave sale del sensor de este celular."
          : "Sólo se activa si tu navegador lo permite de verdad.") +
    fila(tok, tok ? "Token guardado y cifrado" : "Falta el token de GitHub",
      tok ? "Vive en la bóveda de este celular." : "Sin él no se puede publicar.");

  const d = $("#s-estado-2fa");
  if (d) d.innerHTML = dos
    ? fila(true, "Verificación de 2 pasos activa", "El token lo entrega el servicio sólo con tu código.")
    : fila(false, "Verificación de 2 pasos apagada",
        pagosBase() ? "El servicio está conectado pero aún no tiene los códigos."
                    : "Necesita el servicio de pagos publicado.");
}

async function revisar2FA() {
  const base = pagosBase();
  const d = $("#s-estado-2fa");
  if (!base) { toast("Publica primero el servicio de pagos"); return; }
  busy("Revisando…");
  try {
    const r = await fetch(base + "/salud");
    const j = await r.json();
    unbusy();
    DB.ajustes.dosPasos = !!(j.panel && j.usuarios2FA?.length);
    guardar();
    pintarEstadoSeguridad();
    if (!j.panel) {
      d.innerHTML = `<div class="fila"><span class="m off">○</span><span>El servicio no tiene el token de GitHub.<small>Falta <code>npx wrangler secret put GH_TOKEN</code></small></span></div>`;
    } else if (!j.usuarios2FA?.length) {
      d.innerHTML = `<div class="fila"><span class="m off">○</span><span>Falta el código de cada quien.<small>Falta <code>npx wrangler secret put TOTP_TUNOMBRE</code></small></span></div>`;
    } else {
      const mio = j.usuarios2FA.some(u => u.toLowerCase() === String(DB.ajustes.usuario).toLowerCase());
      d.innerHTML = `<div class="fila"><span class="m on">✓</span><span>Activo para: ${j.usuarios2FA.map(esc).join(", ")}.<small>${mio ? "Tú incluido: la próxima vez te va a pedir el código." : `Falta el tuyo (${esc(DB.ajustes.usuario)}).`}</small></span></div>`;
    }
    // Códigos puestos en Cloudflare que el servicio NO acepta por no estar
    // en la lista. Si aparece uno que nadie puso, hay que ir a revisar.
    if (j.ignorados?.length) {
      d.innerHTML += `<div class="fila"><span class="m off">⚠</span><span>Códigos ignorados: ${j.ignorados.map(esc).join(", ")}.<small>Están puestos en el servicio pero no están en la lista de administradores, así que no reciben el token. Si tú no los pusiste, bórralos en Cloudflare.</small></span></div>`;
    }
  } catch (e) {
    unbusy();
    d.innerHTML = `<div class="fila"><span class="m off">○</span><span>El servicio no respondió.<small>Revisa la dirección en Cobros con tarjeta.</small></span></div>`;
  }
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
    branch: $("#s-branch").value.trim() || "main"
  };
  const tok = $("#s-token").value.trim();
  if (tok && tok !== SECRETOS.ghToken) {
    SECRETOS.ghToken = tok;
    guardarSecretos();          // se guarda CIFRADO con tu contraseña
  }
  DB.ajustes.autolock = Number($("#s-autolock").value);
  guardar();
  reiniciarAutolock();
  recalcular();
}

function exportarRespaldo() {
  const copia = JSON.parse(JSON.stringify(DB));
  if (copia.ajustes.gh) delete copia.ajustes.gh.token;
  if (copia.seguridad) copia.seguridad.porPasskey = null;   // la huella es de este celular
  const blob = new Blob([JSON.stringify(copia, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `milos3d-respaldo-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast("Respaldo descargado (el token va cifrado)");
}

async function importarRespaldo(file) {
  if (!file) return;
  if (!confirm("Esto reemplaza los productos y cotizaciones de este celular. ¿Continuar?")) return;
  try {
    const d = JSON.parse(await file.text());
    if (d.seguridad && d.boveda && !confirm("Ese respaldo trae su propia bóveda. Vas a entrar con la contraseña de ese otro celular. ¿Seguir?")) return;
    DB = { ...DB, ...d };
    DB.ajustes = { ...DEFAULTS, ...(d.ajustes || {}) };
    DB.ajustes.gh = { ...DEFAULTS.gh, ...(d.ajustes?.gh || {}) };
    DB.ajustes.usuario = nombreAdmin(DB.ajustes.usuario);
    guardar();
    toast("Respaldo restaurado — vuelve a entrar");
    setTimeout(() => location.reload(), 1200);
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
  $("#quien").textContent = DB.ajustes.usuario ? "· " + DB.ajustes.usuario : "";
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
  $("#btn-flyer").addEventListener("click", generarFlyer);
  $("#flyer-share").addEventListener("click", compartirFlyer);
  $("#btn-guardar").addEventListener("click", () => { guardarBorrador(); renderCatalogo(); });
  $("#btn-publicar").addEventListener("click", revisarYPublicar);
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
  $("#s-pagos-test").addEventListener("click", async () => { leerAjustes(); await probarPagos(); });
  $("#s-bio").addEventListener("click", () => activarBiometrico());
  $("#s-bloquear").addEventListener("click", bloquear);
  $("#s-2fa-probar").addEventListener("click", revisar2FA);
  $("#s-clave").addEventListener("click", async () => {
    const actual = prompt("Tu contraseña de ahora:");
    if (!actual) return;
    const dek = await SEG.bytesDeDek(DB.seguridad, actual);
    if (!dek) return toast("Contraseña incorrecta");
    const nueva = prompt("Tu contraseña nueva (mínimo 8 caracteres):");
    if (!nueva) return;
    if (!SEG.fuerza(nueva).ok) return toast("Muy débil: usa 8+ caracteres con letras y números");
    if (prompt("Repítela:") !== nueva) return toast("No coinciden");
    busy("Cambiando…");
    DB.seguridad = await SEG.cambiarContrasena(DB.seguridad, dek, nueva);
    guardar(); unbusy();
    toast("Contraseña cambiada 🔑");
  });
  $("#btn-sync").addEventListener("click", async () => {
    busy("Sincronizando con la familia…");
    await sincronizarCatalogo(true);
    await subirBorradores();
    unbusy(); renderCatalogo();
  });
  $("#s-usuario").addEventListener("change", () => {
    const n = nombreAdmin($("#s-usuario").value);
    if (!n) { $("#s-usuario").value = nombreAdmin(DB.ajustes.usuario); return toast("Sólo " + ADMINS.join(", ")); }
    DB.ajustes.usuario = n; guardar();
    $("#quien").textContent = "· " + n;
    toast("Nombre actualizado");
  });
  $("#s-export").addEventListener("click", exportarRespaldo);
  $("#s-import").addEventListener("change", e => importarRespaldo(e.target.files[0]));

  // Hoja modal
  $("#sheet-close").addEventListener("click", cerrarHoja);
  $("#sheet-overlay").addEventListener("click", cerrarHoja);
}

cargar();
initLock();
