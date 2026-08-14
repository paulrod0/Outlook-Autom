# claude-monitor

Panel en terminal para tu Mac que muestra en vivo, para cada sesión local
de **Claude Code**, el proyecto, el modelo, el estado, el tiempo desde la
última actividad, la duración del último turno y **cuánta ventana de
contexto queda**.

Zero dependencias — solo Node 18+. Lee los transcripts JSONL que Claude
Code guarda en `~/.claude/projects/`.

## Instalación

Dos opciones. Elige una.

**A. Global (recomendada):**
```bash
cd tools/claude-monitor
npm link          # crea el comando `claude-monitor`
```
Luego desde cualquier sitio:
```bash
claude-monitor
```

**B. Ejecución directa (sin instalar):**
```bash
node tools/claude-monitor/claude-monitor.js
```

También puedes hacer un alias en `~/.zshrc`:
```bash
alias cm='node ~/ruta/a/outlook-autom/tools/claude-monitor/claude-monitor.js'
```

## Uso

```bash
claude-monitor                          # todas las sesiones activas (últimas 24 h)
claude-monitor almara fv crm            # filtra por nombre (substring; puede pasar varios)
claude-monitor --all                    # incluye sesiones antiguas
claude-monitor --interval=500           # refresco cada 500 ms (por defecto 1000)
```

También responde a variables de entorno:
- `CLAUDE_PROJECTS_DIR=/ruta` — apuntar a otra carpeta de transcripts
  (por defecto `~/.claude/projects`).

## Qué muestra

| Columna | Significado |
|---------|-------------|
| Proyecto | Nombre del directorio de trabajo (`cwd` de Claude Code) |
| Modelo | El que devolvió el último mensaje asistente (con marca `(1M)` si es ventana grande) |
| Estado | `▶ tool` (ejecutando herramienta), `⋯ pensando`, `● listo`, `· inactivo` |
| Última act. | Cuánto tiempo hace del último evento |
| Turno | Duración del último turno completo (user → assistant) |
| #T | Número de turnos del asistente en la sesión |
| Ventana | Barra + % + `usadas k / total k` (verde <65%, ámbar <85%, rojo ≥85%) |

## Notas

- Solo ve sesiones que hayan corrido en tu **Mac** (via `claude` CLI local).
  Las sesiones de *Claude Code en la web* no aparecen — viven en la nube y
  no dejan transcripts locales.
- La ventana de contexto se estima con los `usage.input_tokens +
  cache_read_input_tokens + cache_creation_input_tokens` del último
  mensaje asistente. Modelos con `[1m]` en el ID se asumen de 1M tokens;
  el resto, 200k.
- El estado `▶ running` se detecta cuando el último `tool_use` no tiene
  aún un `tool_result` correspondiente. Puede haber falsos positivos
  breves entre eventos.
