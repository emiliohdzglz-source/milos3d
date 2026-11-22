# El puente del taller

Lo que conecta el panel con las impresoras de la casa.

## Por qué existe

El panel vive en milos3d.com, que es internet. Las impresoras viven en el WiFi
de tu casa. **Un navegador no puede hablarle a una impresora de tu red desde
una página de internet** — lo bloquea por seguridad, y abrir un puerto del
router sería peor idea.

Así que nadie entra a tu casa. Un programita corre ahí adentro, **pregunta
hacia afuera** cada pocos segundos si hay algo que imprimir, y lo manda a la
máquina. Todo el tráfico es de salida: el router se queda cerrado.

```
  Panel (milos3d.com)  ──deja el recado──▶  Servicio (Cloudflare)
                                                    ▲
                                            pregunta│cada 10 s
                                                    │
  Impresora ◀──manda el archivo──  Puente (tu casa)
```

Si se va la luz o el internet, el puente deja de preguntar y **retoma solo**
cuando vuelve. Lo que estaba en la cola sigue ahí.

## Qué máquinas atiende

Hoy, **la Snapmaker U1**, que corre Klipper con Moonraker — un protocolo
abierto y documentado.

**Las Bambu (X1C, P2S, A1) todavía no.** Usan otro protocolo, y para abrirlo
hay que poner la impresora en Modo Desarrollador, lo que la desconecta de la
nube de Bambu y te deja sin Bambu Handy fuera de casa. Esa decisión es tuya y
no la tomé por ti.

## Qué necesitas

- Una computadora en casa, prendida, en el mismo WiFi que la impresora.
  Sirve una laptop vieja o una Raspberry Pi.
- **Node 18 o más nuevo**. Para saber si ya lo tienes: `node --version`.
- Una carpeta con los archivos **ya rebanados** (`.gcode`). El puente no
  rebana: eso se sigue haciendo en Snapmaker Orca.
- La **IP de la impresora**: en su pantalla, Ajustes → Red.

## Arrancarlo

```bash
cd taller

export MILOS_TALLER_CLAVE="la-clave-que-inventaste"
export MILOS_MAQUINAS="Snapmaker U1=http://192.168.1.50"
export MILOS_ARCHIVOS="/Users/ale/Documents/Milos3D/rebanados"

node puente.js
```

Debe verse así:

```
[14:03:11] MILO'S 3D — puente del taller
[14:03:11] máquinas:  Snapmaker U1 → http://192.168.1.50
[14:03:11] revisando cada 10 s. Ctrl+C para parar.
```

> **El nombre de la máquina tiene que coincidir exactamente** con el que está
> en el panel (Ajustes → Mis máquinas). Si en el panel dice «Snapmaker U1»,
> aquí también.

## La clave del taller

Es una contraseña que tú inventas y que va en **tres lugares**:

1. Cloudflare → Workers → `milos3d-pagos` → Settings → Variables → *Add*,
   tipo **Secret**, nombre `TALLER_CLAVE`.
2. En el puente: `MILOS_TALLER_CLAVE`.
3. En el panel: Ajustes → *Clave del taller*.

Que sea larga y que no se parezca a ninguna otra tuya. Protege la cola de
impresión: con ella se puede mandar a imprimir, nada más. No da acceso a tu
sitio ni a tu dinero.

## Todos los ajustes

| Variable | Para qué | Si no la pones |
|---|---|---|
| `MILOS_TALLER_CLAVE` | La clave compartida | **No arranca** |
| `MILOS_MAQUINAS` | `Nombre=http://ip`, separadas por coma | **No arranca** |
| `MILOS_ARCHIVOS` | Carpeta de los rebanados | `./archivos` |
| `MILOS_SERVICIO` | Dirección del Worker | el de milos3d |
| `MILOS_INTERVALO` | Cada cuántos segundos pregunta | 10 |
| `MILOS_MOONRAKER_APIKEY` | Sólo si la impresora la pide | vacío |

## Que arranque solo (Mac)

Para no tener que acordarse de prenderlo. Crea
`~/Library/LaunchAgents/com.milos3d.puente.plist` con el contenido de abajo,
ajustando las rutas y la clave, y luego:

```bash
launchctl load ~/Library/LaunchAgents/com.milos3d.puente.plist
```

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.milos3d.puente</string>
  <key>ProgramArguments</key>
  <array><string>/usr/local/bin/node</string><string>/RUTA/A/taller/puente.js</string></array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>MILOS_TALLER_CLAVE</key><string>la-clave-que-inventaste</string>
    <key>MILOS_MAQUINAS</key><string>Snapmaker U1=http://192.168.1.50</string>
    <key>MILOS_ARCHIVOS</key><string>/RUTA/A/rebanados</string>
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>/tmp/milos-puente.log</string>
  <key>StandardErrorPath</key><string>/tmp/milos-puente.log</string>
</dict></plist>
```

## Cuando algo falla

| Lo que ves | Qué pasa |
|---|---|
| `Falta configurar:` | No pusiste la clave o las máquinas |
| `la máquina respondió 404` | La IP contesta pero no es Moonraker. ¿Es la impresora? |
| `fetch failed` | No alcanza la impresora: apagada, otra IP, u otra red |
| `no está «X.gcode»` | Ese archivo no está en `MILOS_ARCHIVOS`. Revisa el nombre |
| `al subir: 422` | La impresora rechazó el archivo (llegó dañado) |
| El panel dice «sin contacto» | El puente corre pero no alcanza la máquina |
| El trabajo nunca sale de «pendiente» | El puente no está corriendo, o atiende otra máquina |

Para ver qué está pasando, míralo correr en la terminal: cada ronda se anota.

## Lo que todavía no hace

- **Las Bambu.** Falta decidir lo del Modo Desarrollador.
- **Mandar el archivo desde el panel.** Hoy el archivo rebanado ya tiene que
  estar en la carpeta del puente; el panel sólo manda su nombre.
- **Avisar cuando la impresión termina.** El puente reporta el estado de la
  máquina, pero no cierra el pedido solo.

## Una advertencia honesta

El código de este puente está escrito contra la
[documentación oficial de Moonraker](https://moonraker.readthedocs.io/en/latest/external_api/)
y probado contra un simulador que responde como dice esa documentación —
**pero nunca se ha conectado a una Snapmaker U1 de verdad.** La primera vez,
pruébalo con una pieza chica y quédate mirando.
