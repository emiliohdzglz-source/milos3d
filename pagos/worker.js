/**
 * MILO'S 3D — Servicio de pagos (Cloudflare Worker)
 * ---------------------------------------------------
 * Única pieza con servidor del proyecto. Existe solo porque el Access Token
 * de Mercado Pago NO puede vivir en el navegador: quien abra el sitio lo vería.
 *
 * Secretos (se ponen con `wrangler secret put`, nunca en este archivo):
 *   MP_ACCESS_TOKEN    — Access token de producción de Mercado Pago
 *   MP_WEBHOOK_SECRET  — Clave secreta del webhook (opcional pero recomendada)
 *   GH_TOKEN           — Token de GitHub que publica en el sitio (2 pasos)
 *   TOTP_<NOMBRE>      — Semilla base32 de cada persona (TOTP_EMILIO, TOTP_KARLA…)
 *
 * Variables (en wrangler.toml):
 *   ORIGENES           — dominios permitidos, separados por coma
 *   SITIO              — URL pública del sitio, para las páginas de regreso
 *
 * KV (opcional):
 *   PAGOS              — guarda el estado de cada cobro por folio
 *
 * Rutas:
 *   GET  /salud                 ¿está vivo y configurado?
 *   POST /preferencia           crea el cobro y devuelve la liga de pago
 *   GET  /estado?folio=1001     ¿ya pagó?
 *   POST /webhook               avisos de Mercado Pago
 *   POST /panel/token           entrega el token de GitHub contra un código TOTP
 */

const MP = "https://api.mercadopago.com";
const MAX_TOTAL = 200000;   // tope de seguridad, en pesos
const MAX_ITEMS = 30;

/* ---------- CORS ---------- */
function origenesPermitidos(env) {
  return (env.ORIGENES || "https://milos3d.com,https://www.milos3d.com")
    .split(",").map(s => s.trim()).filter(Boolean);
}

function cors(request, env) {
  const origen = request.headers.get("Origin") || "";
  const permitidos = origenesPermitidos(env);
  const ok = permitidos.includes(origen) ||
             (origen.startsWith("http://localhost:") && permitidos.includes("*localhost"));
  return {
    "Access-Control-Allow-Origin": ok ? origen : permitidos[0],
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin"
  };
}

const json = (data, status, headers) =>
  new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...(headers || {}) }
  });

/* ---------- Validación de la cotización que llega ---------- */
function limpiarCobro(body) {
  const errores = [];
  const folio = String(body?.folio || "").replace(/[^\w-]/g, "").slice(0, 40);
  if (!folio) errores.push("falta el folio");

  const crudos = Array.isArray(body?.items) ? body.items : [];
  if (!crudos.length) errores.push("no hay conceptos");
  if (crudos.length > MAX_ITEMS) errores.push("demasiados conceptos");

  const items = crudos.slice(0, MAX_ITEMS).map(x => ({
    title: String(x?.n ?? x?.title ?? "Producto").slice(0, 120) || "Producto",
    quantity: Math.min(999, Math.max(1, Math.round(Number(x?.q ?? x?.quantity) || 1))),
    unit_price: Math.round((Number(x?.p ?? x?.unit_price) || 0) * 100) / 100,
    currency_id: "MXN"
  })).filter(x => x.unit_price >= 0);

  const envio = Math.max(0, Math.round((Number(body?.envio) || 0) * 100) / 100);
  const descuento = Math.max(0, Math.round((Number(body?.descuento) || 0) * 100) / 100);
  if (envio > 0) items.push({ title: "Envío", quantity: 1, unit_price: envio, currency_id: "MXN" });

  let total = items.reduce((s, i) => s + i.unit_price * i.quantity, 0) - descuento;
  total = Math.round(total * 100) / 100;

  // El anticipo, si viene, sustituye al desglose por un solo concepto.
  const anticipo = Math.round((Number(body?.anticipo) || 0) * 100) / 100;
  let finales = items;
  if (anticipo > 0 && anticipo < total) {
    finales = [{
      title: `Anticipo cotización #${folio}`.slice(0, 120),
      quantity: 1, unit_price: anticipo, currency_id: "MXN"
    }];
    total = anticipo;
  } else if (descuento > 0) {
    // Mercado Pago no acepta conceptos negativos: se prorratea el descuento
    // y el último concepto absorbe los centavos del redondeo.
    const bruto = items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
    const factor = bruto > 0 ? total / bruto : 1;
    finales = items.map(i => ({
      ...i, unit_price: Math.round(i.unit_price * factor * 100) / 100
    }));
    const ultimo = finales[finales.length - 1];
    if (ultimo) {
      const suma = finales.reduce((s, i) => s + i.unit_price * i.quantity, 0);
      const ajuste = Math.round((total - suma) * 100) / 100;
      const corregido = Math.round((ultimo.unit_price + ajuste / ultimo.quantity) * 100) / 100;
      if (corregido > 0) ultimo.unit_price = corregido;
    }
  }

  if (total <= 0) errores.push("el total debe ser mayor a cero");
  if (total > MAX_TOTAL) errores.push("el total excede el límite permitido");

  return {
    errores, folio, total,
    items: finales,
    cliente: String(body?.cliente || "").slice(0, 80),
    email: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body?.email || "") ? body.email : ""
  };
}

/* ---------- Crear la preferencia de pago ---------- */
async function crearPreferencia(request, env) {
  if (!env.MP_ACCESS_TOKEN) {
    return json({ error: "Mercado Pago todavía no está configurado en el servidor." }, 503);
  }
  let body;
  try { body = await request.json(); }
  catch { return json({ error: "Solicitud inválida." }, 400); }

  const c = limpiarCobro(body);
  if (c.errores.length) return json({ error: c.errores.join(", ") }, 400);

  const sitio = (env.SITIO || "https://www.milos3d.com").replace(/\/+$/, "");
  const referencia = `milos3d-${c.folio}-${Date.now()}`;

  const preferencia = {
    items: c.items,
    external_reference: referencia,
    statement_descriptor: "MILOS3D",
    binary_mode: false,
    back_urls: {
      success: `${sitio}/cotizacion.html?pago=exito&folio=${encodeURIComponent(c.folio)}`,
      pending: `${sitio}/cotizacion.html?pago=pendiente&folio=${encodeURIComponent(c.folio)}`,
      failure: `${sitio}/cotizacion.html?pago=error&folio=${encodeURIComponent(c.folio)}`
    },
    auto_return: "approved",
    notification_url: `${new URL(request.url).origin}/webhook`,
    metadata: { folio: c.folio, cliente: c.cliente },
    ...(c.cliente || c.email
      ? { payer: { ...(c.cliente ? { name: c.cliente } : {}), ...(c.email ? { email: c.email } : {}) } }
      : {})
  };

  const r = await fetch(`${MP}/checkout/preferences`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${env.MP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
      "X-Idempotency-Key": referencia
    },
    body: JSON.stringify(preferencia)
  });

  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.init_point) {
    console.error("MP preferencia", r.status, JSON.stringify(data).slice(0, 500));
    return json({ error: "Mercado Pago rechazó el cobro. Intenta de nuevo o paga por transferencia." }, 502);
  }

  await guardar(env, c.folio, {
    estado: "pendiente", monto: c.total, referencia,
    preferencia: data.id, creado: new Date().toISOString()
  });

  return json({ url: data.init_point, referencia, total: c.total });
}

/* ---------- KV ---------- */
async function guardar(env, folio, datos) {
  if (!env.PAGOS) return;
  try {
    const previo = JSON.parse((await env.PAGOS.get(`folio:${folio}`)) || "{}");
    await env.PAGOS.put(`folio:${folio}`, JSON.stringify({ ...previo, ...datos }),
      { expirationTtl: 60 * 60 * 24 * 180 });
  } catch (e) { console.error("KV", e); }
}

async function consultarEstado(url, env) {
  const folio = String(url.searchParams.get("folio") || "").replace(/[^\w-]/g, "").slice(0, 40);
  if (!folio) return json({ error: "falta el folio" }, 400);
  if (!env.PAGOS) return json({ estado: "desconocido", nota: "El servicio no guarda historial." });
  const raw = await env.PAGOS.get(`folio:${folio}`);
  return json(raw ? JSON.parse(raw) : { estado: "sin_registro" });
}

/* ---------- Webhook ---------- */
async function firmaValida(request, env, dataId) {
  if (!env.MP_WEBHOOK_SECRET) return true;          // sin secreto configurado, no se valida
  const firma = request.headers.get("x-signature") || "";
  const requestId = request.headers.get("x-request-id") || "";
  const partes = Object.fromEntries(
    firma.split(",").map(p => p.split("=").map(s => s.trim())).filter(p => p.length === 2)
  );
  if (!partes.ts || !partes.v1) return false;

  const manifiesto = `id:${dataId};request-id:${requestId};ts:${partes.ts};`;
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(env.MP_WEBHOOK_SECRET),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifiesto));
  const esperado = [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");

  // Comparación de tiempo constante
  if (esperado.length !== partes.v1.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ partes.v1.charCodeAt(i);
  return dif === 0;
}

async function webhook(request, env) {
  let body = {};
  try { body = await request.json(); } catch { /* MP a veces manda vacío */ }

  const url = new URL(request.url);
  const tipo = body?.type || body?.topic || url.searchParams.get("type") || url.searchParams.get("topic");
  const pagoId = body?.data?.id || url.searchParams.get("data.id") || url.searchParams.get("id");

  if (tipo !== "payment" || !pagoId) return new Response("ok", { status: 200 });
  if (!await firmaValida(request, env, pagoId)) {
    console.warn("Webhook con firma inválida");
    return new Response("firma inválida", { status: 401 });
  }
  if (!env.MP_ACCESS_TOKEN) return new Response("ok", { status: 200 });

  const r = await fetch(`${MP}/v1/payments/${encodeURIComponent(pagoId)}`, {
    headers: { "Authorization": `Bearer ${env.MP_ACCESS_TOKEN}` }
  });
  if (!r.ok) return new Response("ok", { status: 200 });
  const p = await r.json();

  const folio = p?.metadata?.folio || String(p?.external_reference || "").split("-")[1];
  if (folio) {
    await guardar(env, folio, {
      estado: p.status,                      // approved | pending | rejected | refunded…
      detalle: p.status_detail,
      monto: p.transaction_amount,
      metodo: p.payment_method_id,
      pagoId: String(p.id),
      fecha: p.date_approved || p.date_created,
      actualizado: new Date().toISOString()
    });
  }
  return new Response("ok", { status: 200 });
}

/* ==========================================================
   VERIFICACIÓN DE 2 PASOS (TOTP)
   Esto es un segundo factor de verdad porque lo valida el
   servidor: el token de GitHub nunca sale de aquí sin un
   código válido del autenticador. Un sitio estático no puede
   hacer esto por su cuenta.
   ========================================================== */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

function base32ADbytes(s) {
  const limpio = String(s).toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, valor = 0;
  const out = [];
  for (const c of limpio) {
    const i = B32.indexOf(c);
    if (i < 0) continue;
    valor = (valor << 5) | i;
    bits += 5;
    if (bits >= 8) { out.push((valor >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return new Uint8Array(out);
}

async function codigoTotp(llave, contador) {
  const buf = new ArrayBuffer(8);
  const dv = new DataView(buf);
  dv.setUint32(0, Math.floor(contador / 2 ** 32));
  dv.setUint32(4, contador >>> 0);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", llave, buf));
  const off = sig[sig.length - 1] & 0x0f;
  const n = ((sig[off] & 0x7f) << 24) | (sig[off + 1] << 16) | (sig[off + 2] << 8) | sig[off + 3];
  return String(n % 1000000).padStart(6, "0");
}

function igualesEnTiempoFijo(a, b) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

async function totpValido(semilla, codigo, ventana = 1) {
  const bytes = base32ADbytes(semilla);
  if (bytes.length < 10) return false;                 // semilla demasiado corta
  const llave = await crypto.subtle.importKey(
    "raw", bytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const paso = Math.floor(Date.now() / 30000);
  for (let d = -ventana; d <= ventana; d++) {          // tolera relojes desfasados
    if (igualesEnTiempoFijo(await codigoTotp(llave, paso + d), codigo)) return true;
  }
  return false;
}

const claveUsuario = (u) => "TOTP_" + String(u || "").toUpperCase()
  .normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z0-9]/g, "");

function usuariosCon2FA(env) {
  return Object.keys(env).filter(k => /^TOTP_[A-Z0-9]+$/.test(k) && env[k])
    .map(k => k.slice(5).charAt(0) + k.slice(6).toLowerCase());
}

/* ---------- Freno a los intentos por fuerza bruta ---------- */
async function intentosOk(env, quien) {
  if (!env.PAGOS) return true;                         // sin KV no hay contador
  const k = `intentos:${quien}`;
  const n = Number(await env.PAGOS.get(k)) || 0;
  return n < 8;
}
async function sumarIntento(env, quien, exito) {
  if (!env.PAGOS) return;
  const k = `intentos:${quien}`;
  if (exito) { await env.PAGOS.delete(k); return; }
  const n = (Number(await env.PAGOS.get(k)) || 0) + 1;
  await env.PAGOS.put(k, String(n), { expirationTtl: 900 });   // se olvida a los 15 min
}

async function tokenDelPanel(request, env) {
  let body = {};
  try { body = await request.json(); } catch { /* vacío */ }

  const usuario = String(body.usuario || "").slice(0, 40);
  const codigo = String(body.codigo || "").replace(/\D/g, "");
  const quien = claveUsuario(usuario);

  if (!env.GH_TOKEN) return json({ error: "El servicio todavía no tiene el token de GitHub." }, 503);
  if (!usuario || codigo.length !== 6) return json({ error: "Faltan datos." }, 400);

  const semilla = env[quien];
  if (!semilla) return json({ error: "Este usuario no tiene verificación de 2 pasos configurada." }, 403);

  if (!await intentosOk(env, quien)) {
    return json({ error: "Demasiados intentos. Espera 15 minutos." }, 429);
  }

  const ok = await totpValido(semilla, codigo);
  await sumarIntento(env, quien, ok);
  if (!ok) return json({ error: "Código incorrecto o vencido." }, 401);

  return json({ token: env.GH_TOKEN, expira: 0 });
}

/* ---------- Router ---------- */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cabeceras = cors(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cabeceras });

    try {
      if (url.pathname === "/webhook" && request.method === "POST") return await webhook(request, env);

      if (url.pathname === "/salud") {
        return json({
          ok: true, servicio: "MILO'S 3D pagos",
          mercadopago: !!env.MP_ACCESS_TOKEN,
          webhookFirmado: !!env.MP_WEBHOOK_SECRET,
          historial: !!env.PAGOS,
          panel: !!env.GH_TOKEN,
          usuarios2FA: usuariosCon2FA(env)
        }, 200, cabeceras);
      }

      if (url.pathname === "/panel/token" && request.method === "POST") {
        const r = await tokenDelPanel(request, env);
        return new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...cabeceras } });
      }

      if (url.pathname === "/preferencia" && request.method === "POST") {
        const r = await crearPreferencia(request, env);
        return new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...cabeceras } });
      }

      if (url.pathname === "/estado" && request.method === "GET") {
        const r = await consultarEstado(url, env);
        return new Response(r.body, { status: r.status, headers: { ...Object.fromEntries(r.headers), ...cabeceras } });
      }

      /* Lee la ficha técnica de un modelo de MakerWorld (el navegador no puede
         hacerlo directo por CORS). Sólo lectura, sin credenciales. */
      if (url.pathname.startsWith("/mw/design/") && request.method === "GET") {
        const id = url.pathname.split("/").pop();
        if (!/^\d{1,12}$/.test(id)) return json({ error: "id inválido" }, 400, cabeceras);
        const r = await fetch(`https://makerworld.com/api/v1/design-service/design/${id}`, {
          headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" }
        });
        if (!r.ok) return json({ error: "MakerWorld respondió " + r.status }, 502, cabeceras);
        return new Response(r.body, {
          status: 200,
          headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "public, max-age=3600", ...cabeceras }
        });
      }

      /* Proxy de imágenes, restringido al CDN de MakerWorld. */
      if (url.pathname === "/mw/imagen" && request.method === "GET") {
        const u = url.searchParams.get("url") || "";
        if (!/^https:\/\/makerworld\.bblmw\.com\//.test(u)) return json({ error: "sólo imágenes de MakerWorld" }, 400, cabeceras);
        const r = await fetch(u, { headers: { "User-Agent": "Mozilla/5.0" } });
        if (!r.ok) return json({ error: "imagen no disponible" }, 502, cabeceras);
        return new Response(r.body, {
          status: 200,
          headers: {
            "Content-Type": r.headers.get("Content-Type") || "image/jpeg",
            "Cache-Control": "public, max-age=86400",
            ...cabeceras
          }
        });
      }

      return json({ error: "no encontrado" }, 404, cabeceras);
    } catch (e) {
      console.error(e);
      return json({ error: "error interno" }, 500, cabeceras);
    }
  }
};
