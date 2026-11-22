#!/usr/bin/env node
/**
 * MILO'S 3D — El puente del taller
 * ---------------------------------------------------------------
 * Corre en una computadora de la casa, en el mismo WiFi que las
 * impresoras. Cada pocos segundos le pregunta al servicio si hay
 * algo que imprimir, manda el archivo a la máquina y reporta.
 *
 * Todo el tráfico es de SALIDA: no hay que abrir ningún puerto del
 * router ni exponer la impresora a internet. Si la casa se queda sin
 * luz o sin internet, el puente simplemente deja de preguntar y
 * retoma solo cuando vuelve.
 *
 * Qué necesita:
 *   · Node 18 o más nuevo (trae fetch y FormData de fábrica).
 *   · Las impresoras en la misma red, con su API abierta.
 *   · Una carpeta con los archivos YA REBANADOS (.gcode / .3mf).
 *
 * Cómo se arranca (ver README.md de esta carpeta):
 *   node puente.js
 *
 * Hoy habla Moonraker, que es lo que trae la Snapmaker U1 (Klipper).
 * Las Bambu usan otro protocolo y todavía no están aquí.
 */

import { readFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { createHash } from "node:crypto";

/* ================= Configuración ================= */
const cfg = {
  servicio: (process.env.MILOS_SERVICIO || "https://milos3d-pagos.emilio-hdz-glz.workers.dev").replace(/\/+$/, ""),
  clave: process.env.MILOS_TALLER_CLAVE || "",
  carpeta: resolve(process.env.MILOS_ARCHIVOS || "./archivos"),
  cadaSegundos: Number(process.env.MILOS_INTERVALO || 10),
  // Las máquinas que este puente atiende: NOMBRE=http://ip
  // Ej: MILOS_MAQUINAS="Snapmaker U1=http://192.168.1.50"
  maquinas: parsearMaquinas(process.env.MILOS_MAQUINAS || ""),
  apiKey: process.env.MILOS_MOONRAKER_APIKEY || ""   // normalmente no hace falta en red local
};

function parsearMaquinas(txt) {
  const m = {};
  txt.split(",").map(s => s.trim()).filter(Boolean).forEach(par => {
    const i = par.indexOf("=");
    if (i < 0) return;
    const nombre = par.slice(0, i).trim();
    const url = par.slice(i + 1).trim().replace(/\/+$/, "");
    if (nombre && url) m[nombre] = url;
  });
  return m;
}

/* ================= Bitácora ================= */
const hora = () => new Date().toLocaleTimeString("es-MX", { hour12: false });
const log = (...a) => console.log(`[${hora()}]`, ...a);
const err = (...a) => console.error(`[${hora()}] ⚠️ `, ...a);

/* ================= Moonraker =================
   Referencia: moonraker.readthedocs.io/en/latest/external_api/
   · POST /server/files/upload — multipart, campo "file"; con el
     campo print="true" la impresión arranca sola al terminar de subir.
   · GET  /printer/objects/query?print_stats&virtual_sdcard&webhooks
   · POST /printer/print/pause | resume | cancel
*/
function cabecerasMoonraker() {
  return cfg.apiKey ? { "X-Api-Key": cfg.apiKey } : {};
}

async function moonrakerEstado(base) {
  const r = await fetch(`${base}/printer/objects/query?print_stats&virtual_sdcard&webhooks`,
    { headers: cabecerasMoonraker(), signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`la máquina respondió ${r.status}`);
  const j = await r.json();
  // La documentación envuelve la respuesta en "result"; algunas
  // versiones la mandan pelada. Se aceptan las dos.
  const st = (j.result || j).status || {};
  const ps = st.print_stats || {};
  return {
    estado: ps.state || "desconocido",          // standby|printing|paused|error|complete
    archivo: ps.filename || "",
    mensaje: ps.message || "",
    avance: Math.round((st.virtual_sdcard?.progress || 0) * 100),
    klipper: st.webhooks?.state || ""
  };
}

async function moonrakerImprimir(base, ruta) {
  const datos = await readFile(ruta);
  const nombre = basename(ruta);
  const form = new FormData();
  form.append("file", new Blob([datos]), nombre);
  form.append("root", "gcodes");
  // Suma de control: si el archivo llega dañado, Moonraker lo rechaza
  // con 422 en vez de ponerse a imprimir basura.
  form.append("checksum", createHash("sha256").update(datos).digest("hex"));
  form.append("print", "true");

  const r = await fetch(`${base}/server/files/upload`, {
    method: "POST", body: form,
    headers: cabecerasMoonraker(),
    signal: AbortSignal.timeout(180000)        // un gcode grande tarda en subir
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`al subir: ${r.status} ${txt.slice(0, 200)}`);

  let j = {};
  try { j = JSON.parse(txt); } catch { /* algunas versiones no devuelven JSON */ }
  const d = j.result || j;
  if (d.print_started === false && d.print_queued === false) {
    throw new Error("el archivo subió pero la máquina no arrancó la impresión");
  }
  return { nombre, encolado: d.print_queued === true };
}

/* ================= El servicio ================= */
async function pedir(ruta, opciones = {}) {
  const r = await fetch(`${cfg.servicio}${ruta}`, { ...opciones, signal: AbortSignal.timeout(15000) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `el servicio respondió ${r.status}`);
  return j;
}

const pendientes = (maquina) =>
  pedir(`/taller/pendientes?clave=${encodeURIComponent(cfg.clave)}&maquina=${encodeURIComponent(maquina)}`);

const reportar = (cuerpo) =>
  pedir("/taller/reportar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clave: cfg.clave, ...cuerpo })
  });

/* ================= Archivos ================= */
async function buscarArchivo(nombre) {
  const archivos = await readdir(cfg.carpeta).catch(() => {
    throw new Error(`no encuentro la carpeta ${cfg.carpeta}`);
  });
  // Se compara sin mayúsculas para que no falle por un acento de teclado.
  const hit = archivos.find(a => a.toLowerCase() === nombre.toLowerCase());
  if (!hit) throw new Error(`no está «${nombre}» en ${cfg.carpeta}`);
  return join(cfg.carpeta, hit);
}

/* ================= La ronda ================= */
async function atender(maquina, base) {
  // 1. Cómo va la máquina. Si no contesta, se reporta y no se le manda nada.
  let estado = null;
  try {
    estado = await moonrakerEstado(base);
    await reportar({ maquina, impresora: estado });
  } catch (e) {
    await reportar({ maquina, impresora: { estado: "sin_contacto", mensaje: String(e.message).slice(0, 200) } })
      .catch(() => {});
    err(`${maquina}: ${e.message}`);
    return;
  }

  // 2. Si está ocupada, no se le encima otro trabajo.
  if (estado.estado === "printing" || estado.estado === "paused") return;

  // 3. Lo que haya en la cola, de uno en uno.
  const { trabajos } = await pendientes(maquina);
  if (!trabajos?.length) return;

  const t = trabajos[0];
  log(`${maquina}: tomando «${t.archivo}»`);
  await reportar({ id: t.id, estado: "enviando" });
  try {
    const ruta = await buscarArchivo(t.archivo);
    const res = await moonrakerImprimir(base, ruta);
    await reportar({
      id: t.id, estado: "imprimiendo",
      detalle: res.encolado ? "en la cola de la máquina" : "arrancó"
    });
    log(`${maquina}: ✅ ${res.nombre}`);
  } catch (e) {
    await reportar({ id: t.id, estado: "error", detalle: String(e.message).slice(0, 300) });
    err(`${maquina}: ${e.message}`);
  }
}

async function ronda() {
  for (const [maquina, base] of Object.entries(cfg.maquinas)) {
    try { await atender(maquina, base); }
    catch (e) { err(`${maquina}: ${e.message}`); }
  }
}

/* ================= Arranque ================= */
function revisarConfig() {
  const faltan = [];
  if (!cfg.clave) faltan.push("MILOS_TALLER_CLAVE (la clave del taller)");
  if (!Object.keys(cfg.maquinas).length) faltan.push('MILOS_MAQUINAS (ej: "Snapmaker U1=http://192.168.1.50")');
  if (faltan.length) {
    console.error("\nFalta configurar:\n  · " + faltan.join("\n  · ") + "\n\nVe el README.md de esta carpeta.\n");
    process.exit(1);
  }
}

async function main() {
  revisarConfig();
  log("MILO'S 3D — puente del taller");
  log(`servicio:  ${cfg.servicio}`);
  log(`archivos:  ${cfg.carpeta}`);
  log(`máquinas:  ${Object.entries(cfg.maquinas).map(([n, u]) => `${n} → ${u}`).join(" · ")}`);
  log(`revisando cada ${cfg.cadaSegundos} s. Ctrl+C para parar.\n`);

  let vivo = true;
  process.on("SIGINT", () => { log("\nhasta luego"); vivo = false; process.exit(0); });

  while (vivo) {
    // Una ronda nunca debe tumbar el puente: si algo truena, se anota
    // y se vuelve a intentar en la siguiente vuelta.
    try { await ronda(); } catch (e) { err(e.message); }
    await new Promise(r => setTimeout(r, cfg.cadaSegundos * 1000));
  }
}

// Sólo arranca si se ejecuta directo; importarlo (las pruebas) no hace nada.
if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) main();

export { moonrakerEstado, moonrakerImprimir, buscarArchivo, atender, parsearMaquinas, cfg };
