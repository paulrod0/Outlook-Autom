#!/usr/bin/env node
/*
 * claude-monitor — panel en terminal para vigilar sesiones de Claude Code.
 *
 * Lee los transcripts que Claude Code deja en ~/.claude/projects/*.jsonl
 * y muestra, en vivo, para cada sesión activa:
 *   - proyecto (nombre corto)
 *   - modelo en uso
 *   - estado (thinking / running:tool / ready / idle)
 *   - tiempo desde la última actividad
 *   - duración del último turno
 *   - ventana de contexto consumida (tokens y %)
 *
 * Uso:
 *   node claude-monitor.js                    # todas las sesiones activas
 *   node claude-monitor.js almara fv crm      # filtrado por nombre (substring)
 *   node claude-monitor.js --all              # incluye sesiones antiguas (>24h)
 *   node claude-monitor.js --interval=500     # refresco cada 500 ms
 *
 * Sin dependencias. Node 18+.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const os = require("os");

// ---------------------------------------------------------------------------
// Configuración
// ---------------------------------------------------------------------------

const CLAUDE_DIR = process.env.CLAUDE_PROJECTS_DIR
  || path.join(os.homedir(), ".claude", "projects");

const IDLE_HIDE_HOURS = 24;

const args = process.argv.slice(2);
const showAll = args.includes("--all");
const intervalArg = args.find((a) => a.startsWith("--interval="));
const REFRESH_MS = intervalArg
  ? Math.max(200, parseInt(intervalArg.split("=")[1], 10) || 1000)
  : 1000;

const filters = args
  .filter((a) => !a.startsWith("-"))
  .map((s) => s.toLowerCase());

// Colores ANSI (sin librerías)
const C = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
};

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function contextSizeFor(model) {
  if (!model) return 200_000;
  const m = model.toLowerCase();
  if (m.includes("[1m]") || m.includes("-1m")) return 1_000_000;
  return 200_000;
}

function shortModel(model) {
  if (!model) return "—";
  let m = model.replace(/^claude-/, "");
  const oneM = m.includes("[1m]") || /-1m(\b|$)/.test(m);
  m = m
    .replace("[1m]", "")
    .replace(/-1m$/, "")
    .replace(/-\d{8}$/, "") // quitar fecha suffix tipo -20251001
    .replace(/-(\d+)-(\d+)$/, "-$1.$2");
  return oneM ? `${m} (1M)` : m;
}

function humanDuration(ms) {
  if (ms < 0) ms = 0;
  if (ms < 1000) return `${ms}ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${s % 60 ? ` ${s % 60}s` : ""}`;
  const h = Math.floor(m / 60);
  return `${h}h${m % 60 ? ` ${m % 60}m` : ""}`;
}

function humanAgo(ts) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  if (diff < 0) return "ahora";
  return `hace ${humanDuration(diff)}`;
}

function readJsonl(file) {
  try {
    // Leemos el fichero completo. Si crecen mucho (>10MB) sólo la cola.
    const stat = fs.statSync(file);
    if (stat.size > 10 * 1024 * 1024) {
      const fd = fs.openSync(file, "r");
      const buf = Buffer.alloc(1024 * 1024); // último MB
      fs.readSync(fd, buf, 0, buf.length, stat.size - buf.length);
      fs.closeSync(fd);
      const chunk = buf.toString("utf-8");
      // descartar la primera línea (parcial)
      const nl = chunk.indexOf("\n");
      return (nl >= 0 ? chunk.slice(nl + 1) : chunk)
        .split("\n")
        .filter(Boolean)
        .map(safeParse)
        .filter(Boolean);
    }
    return fs
      .readFileSync(file, "utf-8")
      .split("\n")
      .filter(Boolean)
      .map(safeParse)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function safeParse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function projectLabelFromCwd(cwd) {
  if (!cwd) return null;
  return path.basename(cwd);
}

function projectLabelFromEncoded(encoded) {
  // ~/.claude/projects/-Users-pablo-Projects-fv → "fv"
  const parts = encoded.split("-").filter(Boolean);
  return parts[parts.length - 1] || encoded;
}

function visibleLen(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

function pad(s, width, align = "left") {
  const vlen = visibleLen(s);
  if (vlen >= width) {
    // truncar respetando ANSI (aproximado: quitamos ANSI, cortamos, sin colores)
    const plain = s.replace(/\x1b\[[0-9;]*m/g, "");
    return plain.slice(0, width - 1) + "…";
  }
  const p = " ".repeat(width - vlen);
  return align === "right" ? p + s : s + p;
}

function pctBar(pct, width = 10) {
  const filled = Math.max(0, Math.min(width, Math.round((pct / 100) * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

// ---------------------------------------------------------------------------
// Extracción de estado por sesión
// ---------------------------------------------------------------------------

function extractStats(dir) {
  const rows = [];
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
  } catch {
    return rows;
  }

  for (const f of files) {
    const full = path.join(dir, f);
    let stat;
    try {
      stat = fs.statSync(full);
    } catch {
      continue;
    }
    if (!showAll && Date.now() - stat.mtimeMs > IDLE_HIDE_HOURS * 3_600_000) continue;

    const events = readJsonl(full);
    if (events.length === 0) continue;

    let model = null;
    let usage = null;
    let cwd = null;
    let lastUserTs = null;
    let lastAssistantTs = null;
    let lastToolUse = null;
    let lastToolResultId = null;

    for (const e of events) {
      const ts = e.timestamp ? Date.parse(e.timestamp) : null;
      if (!cwd && (e.cwd || e.metadata?.cwd)) cwd = e.cwd || e.metadata.cwd;

      const contents = Array.isArray(e.message?.content) ? e.message.content : [];

      if (e.type === "user") {
        if (ts) lastUserTs = ts;
        const tr = contents.find((c) => c && c.type === "tool_result");
        if (tr) lastToolResultId = tr.tool_use_id;
      } else if (e.type === "assistant") {
        if (ts) lastAssistantTs = ts;
        if (e.message?.model) model = e.message.model;
        if (e.message?.usage) usage = e.message.usage;
        const tu = contents.find((c) => c && c.type === "tool_use");
        if (tu) lastToolUse = { name: tu.name, ts: ts || Date.now(), id: tu.id };
      }
    }

    // Estado
    let state = "idle";
    let toolName = null;
    if (lastToolUse && lastToolResultId !== lastToolUse.id) {
      state = "running";
      toolName = lastToolUse.name;
    } else if (
      lastUserTs &&
      (!lastAssistantTs || lastAssistantTs < lastUserTs)
    ) {
      state = "thinking";
    } else if (lastAssistantTs) {
      state = "ready";
    }

    // Duración del último turno
    let lastTurnMs = null;
    if (lastUserTs && lastAssistantTs && lastAssistantTs >= lastUserTs) {
      lastTurnMs = lastAssistantTs - lastUserTs;
    }

    // Contexto
    const contextSize = contextSizeFor(model);
    const inputTokens = usage?.input_tokens ?? 0;
    const cacheRead = usage?.cache_read_input_tokens ?? 0;
    const cacheCreate = usage?.cache_creation_input_tokens ?? 0;
    const usedTokens = inputTokens + cacheRead + cacheCreate;
    const remaining = Math.max(0, contextSize - usedTokens);

    const project =
      projectLabelFromCwd(cwd) || projectLabelFromEncoded(path.basename(dir));

    rows.push({
      project,
      cwd,
      session: f.replace(".jsonl", "").slice(0, 8),
      model: shortModel(model),
      state,
      toolName,
      lastActivityTs: stat.mtimeMs,
      lastTurnMs,
      usedTokens,
      contextSize,
      remaining,
      turns: events.filter((e) => e.type === "assistant").length,
    });
  }
  return rows;
}

function scan() {
  if (!fs.existsSync(CLAUDE_DIR)) return [];
  let dirs;
  try {
    dirs = fs.readdirSync(CLAUDE_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => path.join(CLAUDE_DIR, d.name));
  } catch {
    return [];
  }
  const all = dirs.flatMap(extractStats);
  const filtered = filters.length
    ? all.filter((r) =>
        filters.some(
          (f) =>
            r.project.toLowerCase().includes(f) ||
            (r.cwd || "").toLowerCase().includes(f),
        ),
      )
    : all;
  return filtered.sort((a, b) => b.lastActivityTs - a.lastActivityTs);
}

// ---------------------------------------------------------------------------
// Render
// ---------------------------------------------------------------------------

function stateBadge(state, toolName) {
  switch (state) {
    case "running":
      return C.cyan + "▶ " + (toolName || "tool") + C.reset;
    case "thinking":
      return C.yellow + "⋯ pensando" + C.reset;
    case "ready":
      return C.green + "● listo" + C.reset;
    default:
      return C.dim + "· inactivo" + C.reset;
  }
}

function contextCell(used, size) {
  const pct = size > 0 ? (used / size) * 100 : 0;
  const color = pct > 85 ? C.red : pct > 65 ? C.yellow : C.green;
  const bar = color + pctBar(pct) + C.reset;
  const num =
    C.dim +
    `${(used / 1000).toFixed(0)}k/${(size / 1000).toFixed(0)}k` +
    C.reset;
  return `${bar} ${pct.toFixed(0).padStart(3)}% ${num}`;
}

function render(rows) {
  const buf = [];
  const now = new Date().toLocaleTimeString("es-ES");
  buf.push(
    C.bold + "Claude Code · monitor de sesiones" + C.reset +
      "  " + C.dim + now + C.reset,
  );
  if (filters.length) {
    buf.push(C.dim + "filtro: " + filters.join(", ") + C.reset);
  }
  if (showAll) {
    buf.push(C.dim + "modo --all (incluye sesiones >24h)" + C.reset);
  }
  buf.push("");

  const cols = [
    { key: "project", label: "Proyecto", width: 18 },
    { key: "model", label: "Modelo", width: 20 },
    { key: "state", label: "Estado", width: 18 },
    { key: "last", label: "Última act.", width: 15 },
    { key: "turn", label: "Turno", width: 8 },
    { key: "turns", label: "#T", width: 4, align: "right" },
    { key: "context", label: "Ventana", width: 30 },
  ];

  buf.push(
    C.bold + cols.map((c) => pad(c.label, c.width, c.align)).join(" ") + C.reset,
  );
  buf.push(
    C.gray +
      "─".repeat(cols.reduce((a, c) => a + c.width, 0) + cols.length - 1) +
      C.reset,
  );

  if (rows.length === 0) {
    buf.push("  " + C.dim + "(sin sesiones que mostrar)" + C.reset);
  }

  for (const r of rows) {
    const line = [
      pad(r.project, cols[0].width),
      pad(r.model, cols[1].width),
      pad(stateBadge(r.state, r.toolName), cols[2].width),
      pad(humanAgo(r.lastActivityTs), cols[3].width),
      pad(r.lastTurnMs != null ? humanDuration(r.lastTurnMs) : "—", cols[4].width),
      pad(String(r.turns), cols[5].width, "right"),
      contextCell(r.usedTokens, r.contextSize),
    ].join(" ");
    buf.push(line);
  }

  buf.push("");
  buf.push(
    C.dim +
      `${rows.length} sesión(es) · refresco ${REFRESH_MS}ms · fuente ${CLAUDE_DIR} · Ctrl-C para salir` +
      C.reset,
  );

  // Limpiar pantalla + mover cursor y pintar.
  process.stdout.write("\x1b[H\x1b[2J" + buf.join("\n") + "\n");
}

// ---------------------------------------------------------------------------
// Bucle
// ---------------------------------------------------------------------------

function tick() {
  try {
    render(scan());
  } catch (err) {
    process.stdout.write(
      "\x1b[H\x1b[2J" + C.red + "Error: " + err.message + C.reset + "\n",
    );
  }
}

if (!fs.existsSync(CLAUDE_DIR)) {
  console.error(
    `No existe ${CLAUDE_DIR}. ¿Has ejecutado Claude Code en local alguna vez?`,
  );
  console.error(
    `Puedes forzar otra ruta con CLAUDE_PROJECTS_DIR=/ruta/a/projects.`,
  );
  process.exit(1);
}

tick();
const timer = setInterval(tick, REFRESH_MS);

process.on("SIGINT", () => {
  clearInterval(timer);
  process.stdout.write("\n");
  process.exit(0);
});
