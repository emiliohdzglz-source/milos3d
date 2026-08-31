/* ==========================================================
   MILO'S 3D — Seguridad del panel
   ----------------------------------------------------------
   Lo que protege de verdad: el token de GitHub, que es lo
   único que puede publicar en el sitio. Se guarda CIFRADO con
   una llave derivada de la contraseña (PBKDF2 + AES-GCM).
   Sin la contraseña el token es ilegible: no es una pantalla
   que se pueda brincar editando el JavaScript.

   Dos modos:
   · Bóveda local  — el token vive cifrado en este celular.
   · Servicio + 2FA — el token vive en el Worker y se libera
     por sesión sólo con contraseña + código del autenticador.
     Ese sí es un segundo factor real, porque lo valida un
     servidor y no el navegador.
   ========================================================== */

const SEG = (() => {
  const te = new TextEncoder();
  const td = new TextDecoder();
  const ITERS = 310000;

  const rnd = (n) => crypto.getRandomValues(new Uint8Array(n));
  const b64 = (u8) => { let s = ""; u8.forEach(b => s += String.fromCharCode(b)); return btoa(s); };
  const ub64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  /* ---------- Derivación y cifrado ---------- */
  async function llaveDeContrasena(clave, salt, iters = ITERS) {
    const base = await crypto.subtle.importKey("raw", te.encode(clave), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt, iterations: iters, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  }

  const llaveDeBytes = (bytes) =>
    crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);

  async function cifrar(llave, texto) {
    const iv = rnd(12);
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, llave, te.encode(texto));
    return { iv: b64(iv), ct: b64(new Uint8Array(ct)) };
  }

  async function descifrar(llave, caja) {
    const pt = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: ub64(caja.iv) }, llave, ub64(caja.ct));
    return td.decode(pt);
  }

  /* ---------- Fortaleza de la contraseña ---------- */
  function fuerza(clave) {
    const c = String(clave || "");
    let puntos = 0;
    if (c.length >= 8) puntos++;
    if (c.length >= 12) puntos++;
    if (/[a-z]/.test(c) && /[A-Z]/.test(c)) puntos++;
    if (/\d/.test(c)) puntos++;
    if (/[^\w\s]/.test(c)) puntos++;
    const comunes = /^(123|contrasena|password|qwerty|milos|000|111|abc)/i.test(c);
    if (comunes) puntos = Math.min(puntos, 1);
    const etiquetas = ["Muy débil", "Débil", "Aceptable", "Buena", "Fuerte", "Muy fuerte"];
    return { puntos, etiqueta: etiquetas[puntos], ok: c.length >= 8 && puntos >= 2 };
  }

  /* ---------- Crear la bóveda ---------- */
  async function crear(clave, secretos) {
    const salt = rnd(16);
    const kek = await llaveDeContrasena(clave, salt);
    const dek = rnd(32);
    const llaveDek = await llaveDeBytes(dek);
    return {
      seguridad: {
        v: 1,
        salt: b64(salt),
        iters: ITERS,
        porContrasena: await cifrar(kek, b64(dek)),
        porPasskey: null,
        prueba: await cifrar(llaveDek, "milos3d-ok")
      },
      boveda: await cifrar(llaveDek, JSON.stringify(secretos || {}))
    };
  }

  /* ---------- Abrir con contraseña ---------- */
  async function abrirConContrasena(seguridad, clave) {
    const kek = await llaveDeContrasena(clave, ub64(seguridad.salt), seguridad.iters || ITERS);
    let dekB64;
    try { dekB64 = await descifrar(kek, seguridad.porContrasena); }
    catch { return null; }                 // contraseña incorrecta: no descifra, punto.
    return llaveDeBytes(ub64(dekB64));
  }

  async function leerBoveda(llaveDek, boveda) {
    try { return JSON.parse(await descifrar(llaveDek, boveda)); }
    catch { return null; }
  }

  async function escribirBoveda(llaveDek, secretos) {
    return cifrar(llaveDek, JSON.stringify(secretos || {}));
  }

  async function cambiarContrasena(seguridad, dekBytes, nueva) {
    // Se re-envuelve la misma llave interna con la contraseña nueva:
    // la bóveda no se toca y la passkey sigue sirviendo.
    const salt = rnd(16);
    const kek = await llaveDeContrasena(nueva, salt);
    return { ...seguridad, salt: b64(salt), iters: ITERS, porContrasena: await cifrar(kek, b64(dekBytes)) };
  }

  /* ==========================================================
     PASSKEY (Face ID / huella)
     Sólo es seguridad real si el navegador soporta la extensión
     PRF, que deriva una llave del propio sensor. Si no la
     soporta, no se ofrece: preferimos no fingir.
     ========================================================== */
  const rpId = () => location.hostname.replace(/^www\./, "");
  const PRF_SALT = te.encode("milos3d-panel-v1");

  function disponible() {
    return !!(window.PublicKeyCredential && navigator.credentials &&
              window.isSecureContext);
  }

  async function hayBiometrico() {
    if (!disponible()) return false;
    try { return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); }
    catch { return false; }
  }

  async function registrarPasskey(usuario, llaveDekBytes) {
    if (!disponible()) throw new Error("Este navegador no permite huella ni Face ID.");
    const cred = await navigator.credentials.create({
      publicKey: {
        challenge: rnd(32),
        rp: { name: "MILO'S 3D", id: rpId() },
        user: { id: te.encode(usuario).slice(0, 64), name: usuario, displayName: usuario },
        pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          residentKey: "required",
          userVerification: "required"
        },
        timeout: 60000,
        attestation: "none",
        extensions: { prf: {} }
      }
    });
    if (!cred) throw new Error("No se registró la huella.");

    const ext = cred.getClientExtensionResults?.() || {};
    if (!ext.prf || ext.prf.enabled === false) {
      throw new Error("PRF_NO_SOPORTADO");
    }

    // El PRF sólo se puede evaluar en un get(), así que pedimos uno enseguida.
    const material = await evaluarPrf(new Uint8Array(cred.rawId));
    if (!material) throw new Error("PRF_NO_SOPORTADO");

    const llavePrf = await llaveDeBytes(material);
    return {
      credId: b64(new Uint8Array(cred.rawId)),
      ...(await cifrar(llavePrf, b64(llaveDekBytes)))
    };
  }

  async function evaluarPrf(credIdBytes) {
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: rnd(32),
        rpId: rpId(),
        allowCredentials: credIdBytes ? [{ type: "public-key", id: credIdBytes }] : [],
        userVerification: "required",
        timeout: 60000,
        extensions: { prf: { eval: { first: PRF_SALT } } }
      }
    });
    const r = assertion?.getClientExtensionResults?.()?.prf?.results?.first;
    return r ? new Uint8Array(r).slice(0, 32) : null;
  }

  async function abrirConPasskey(seguridad) {
    if (!seguridad?.porPasskey) return null;
    const material = await evaluarPrf(ub64(seguridad.porPasskey.credId));
    if (!material) return null;
    const llavePrf = await llaveDeBytes(material);
    try {
      const dekB64 = await descifrar(llavePrf, seguridad.porPasskey);
      return llaveDeBytes(ub64(dekB64));
    } catch { return null; }
  }

  /* ---------- Exportar la llave interna (para re-envolverla) ---------- */
  async function bytesDeDek(seguridad, clave) {
    const kek = await llaveDeContrasena(clave, ub64(seguridad.salt), seguridad.iters || ITERS);
    try { return ub64(await descifrar(kek, seguridad.porContrasena)); }
    catch { return null; }
  }

  return {
    crear, abrirConContrasena, leerBoveda, escribirBoveda, cambiarContrasena,
    fuerza, hayBiometrico, disponible, registrarPasskey, abrirConPasskey, bytesDeDek,
    b64, ub64
  };
})();
