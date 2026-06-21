"use strict";

const $ = (id) => document.getElementById(id);

const CONFIG_FIELDS = [
  "mode", "symbology", "qr_error", "label_width_cm", "label_height_cm",
  "bar_height_cm", "dpi", "font_size_pt",
];

function configForm() {
  const fd = new FormData();
  for (const id of CONFIG_FIELDS) fd.append(id, $(id).value);
  fd.append("show_text", $("show_text").checked ? "true" : "false");
  return fd;
}

function setStatus(msg, kind = "") {
  const el = $("status");
  el.textContent = msg;
  el.className = "status " + kind;
}

// Mostrar/ocultar campos según el tipo de código.
function syncMode() {
  const isBarcode = $("mode").value === "barcode";
  $("symbology-wrap").hidden = !isBarcode;
  $("qr-error-wrap").hidden = isBarcode;
}
$("mode").addEventListener("change", syncMode);
syncMode();

// Pestañas.
document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    tab.classList.add("active");
    const target = tab.dataset.tab;
    $("tab-individual").hidden = target !== "individual";
    $("tab-lote").hidden = target !== "lote";
  });
});

// --- Individual ---
async function preview() {
  const value = $("value").value.trim();
  if (!value) return setStatus("Introduce una referencia.", "error");
  setStatus("Generando…");
  const fd = configForm();
  fd.append("value", value);
  try {
    const res = await fetch("/api/preview", { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json();
      return setStatus(err.error || "Error al generar.", "error");
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    $("preview-box").innerHTML = `<img src="${url}" alt="etiqueta" />`;
    setStatus("Vista previa lista.", "ok");
    return url;
  } catch (e) {
    setStatus("Error de red: " + e.message, "error");
  }
}

$("btn-preview").addEventListener("click", preview);

$("btn-download").addEventListener("click", async () => {
  const url = await preview();
  if (!url) return;
  const a = document.createElement("a");
  a.href = url;
  a.download = ($("value").value.trim() || "etiqueta") + ".png";
  a.click();
});

// --- Lote ---
$("file").addEventListener("change", async () => {
  const file = $("file").files[0];
  if (!file) return;
  setStatus("Leyendo columnas…");
  const fd = new FormData();
  fd.append("file", file);
  try {
    const res = await fetch("/api/columns", { method: "POST", body: fd });
    const data = await res.json();
    if (!res.ok) return setStatus(data.error, "error");
    const sel = $("column");
    sel.innerHTML = "";
    data.columns.forEach((c, i) => {
      const opt = document.createElement("option");
      opt.value = c || String(i);
      opt.textContent = c || `Columna ${i + 1}`;
      sel.appendChild(opt);
    });
    sel.disabled = false;
    setStatus(`Archivo cargado: ${data.columns.length} columnas.`, "ok");
  } catch (e) {
    setStatus("Error de red: " + e.message, "error");
  }
});

async function runBatch(output) {
  const file = $("file").files[0];
  if (!file) return setStatus("Sube un archivo primero.", "error");
  setStatus("Generando lote… esto puede tardar unos segundos.");
  const fd = configForm();
  fd.append("file", file);
  fd.append("column", $("column").value);
  fd.append("output", output);
  fd.append("dedupe", $("dedupe").checked ? "true" : "false");
  try {
    const res = await fetch("/api/batch", { method: "POST", body: fd });
    if (!res.ok) {
      const err = await res.json();
      return setStatus(err.error || "Error al generar el lote.", "error");
    }
    const count = res.headers.get("X-Generated-Count");
    const errors = res.headers.get("X-Error-Count");
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = output === "pdf" ? "etiquetas.pdf" : "etiquetas.zip";
    a.click();
    let msg = `Generadas ${count} etiquetas.`;
    if (errors && errors !== "0") msg += ` ${errors} fila(s) con error (omitidas).`;
    setStatus(msg, "ok");
  } catch (e) {
    setStatus("Error de red: " + e.message, "error");
  }
}

$("btn-zip").addEventListener("click", () => runBatch("zip"));
$("btn-pdf").addEventListener("click", () => runBatch("pdf"));
