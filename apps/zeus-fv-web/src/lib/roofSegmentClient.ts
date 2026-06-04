"use client";

import * as ort from "onnxruntime-web";

/**
 * Detección de tejado con IA (MobileSAM) EN EL NAVEGADOR.
 *
 * onnxruntime-web está diseñado para correr en el navegador (WASM), donde
 * sí puede cargar los .wasm por https y no hay límite de tamaño serverless.
 * Aquí: descargamos la ortofoto PNOA (vía proxy), la pasamos por
 * encoder+decoder de MobileSAM con el punto central como prompt, y
 * devolvemos el polígono exacto del tejado en lon/lat.
 *
 * Los modelos (~37 MB) se descargan una vez de /public/models/sam y se
 * cachean en memoria + en la caché del navegador.
 */

const PX = 1024;

ort.env.wasm.wasmPaths =
  "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.19.2/dist/";

let encoderSession: ort.InferenceSession | null = null;
let decoderSession: ort.InferenceSession | null = null;
let loadingPromise: Promise<void> | null = null;

async function ensureSessions(onProgress?: (msg: string) => void) {
  if (encoderSession && decoderSession) return;
  if (!loadingPromise) {
    loadingPromise = (async () => {
      onProgress?.("Descargando modelo IA (37 MB, primera vez)…");
      const [encBuf, decBuf] = await Promise.all([
        fetch("/models/sam/mobilesam.encoder.onnx").then((r) => r.arrayBuffer()),
        fetch("/models/sam/mobilesam.decoder.onnx").then((r) => r.arrayBuffer()),
      ]);
      onProgress?.("Inicializando IA…");
      encoderSession = await ort.InferenceSession.create(encBuf, {
        executionProviders: ["wasm"],
      });
      decoderSession = await ort.InferenceSession.create(decBuf, {
        executionProviders: ["wasm"],
      });
    })();
  }
  await loadingPromise;
}

function to3857(lon: number, lat: number): [number, number] {
  const x = (lon * 20037508.34) / 180;
  let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  y = (y * 20037508.34) / 180;
  return [x, y];
}
function from3857(x: number, y: number): [number, number] {
  const lon = (x / 20037508.34) * 180;
  let lat = (y / 20037508.34) * 180;
  lat =
    (180 / Math.PI) *
    (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
  return [lon, lat];
}

export type RoofSegmentResult = {
  polygon: GeoJSON.Polygon;
  iou: number;
};

export async function segmentRoofClient(
  lat: number,
  lon: number,
  boxM = 80,
  onProgress?: (msg: string) => void,
): Promise<RoofSegmentResult | null> {
  await ensureSessions(onProgress);
  onProgress?.("Descargando imagen aérea…");

  const [cx, cy] = to3857(lon, lat);
  const half = boxM / 2;
  const minX = cx - half,
    maxX = cx + half,
    minY = cy - half,
    maxY = cy + half;
  const bbox = `${minX},${minY},${maxX},${maxY}`;

  // Imagen PNOA → ImageBitmap → canvas → píxeles.
  const blob = await fetch(`/api/pnoa-image?bbox=${bbox}&px=${PX}`).then((r) => {
    if (!r.ok) throw new Error(`PNOA ${r.status}`);
    return r.blob();
  });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = PX;
  canvas.height = PX;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, PX, PX);
  const imgData = ctx.getImageData(0, 0, PX, PX).data;

  const rgb = new Float32Array(PX * PX * 3);
  for (let i = 0, j = 0; i < imgData.length; i += 4) {
    rgb[j++] = imgData[i];
    rgb[j++] = imgData[i + 1];
    rgb[j++] = imgData[i + 2];
  }

  onProgress?.("Detectando tejado con IA…");
  const enc = await encoderSession!.run({
    input_image: new ort.Tensor("float32", rgb, [PX, PX, 3]),
  });
  const embeddings = enc.image_embeddings;

  const c = PX / 2;
  const d = PX * 0.12;
  const dec = await decoderSession!.run({
    image_embeddings: embeddings,
    point_coords: new ort.Tensor(
      "float32",
      new Float32Array([c, c, c - d, c, c + d, c, c, c - d, c, c + d, 0, 0]),
      [1, 6, 2],
    ),
    point_labels: new ort.Tensor("float32", new Float32Array([1, 1, 1, 1, 1, -1]), [1, 6]),
    mask_input: new ort.Tensor("float32", new Float32Array(256 * 256), [1, 1, 256, 256]),
    has_mask_input: new ort.Tensor("float32", new Float32Array([0]), [1]),
    orig_im_size: new ort.Tensor("float32", new Float32Array([PX, PX]), [2]),
  });
  const iou = (dec.iou_predictions.data as Float32Array)[0] ?? 0;
  const maskData = dec.masks.data as Float32Array;

  const mask: boolean[][] = [];
  let on = 0;
  for (let r = 0; r < PX; r++) {
    const row: boolean[] = [];
    for (let cc = 0; cc < PX; cc++) {
      const v = maskData[r * PX + cc] > 0;
      row.push(v);
      if (v) on++;
    }
    mask.push(row);
  }
  if (on < 50) return null;

  const comp = componentAtCenter(mask);
  const contour = traceBoundary(comp).filter((_, i) => i % 4 === 0);
  if (contour.length < 4) return null;

  const ring: GeoJSON.Position[] = contour.map(([r, cc]) => {
    const X = minX + ((cc + 0.5) / PX) * (maxX - minX);
    const Y = maxY - ((r + 0.5) / PX) * (maxY - minY);
    return from3857(X, Y);
  });
  if (ring[0][0] !== ring[ring.length - 1][0] || ring[0][1] !== ring[ring.length - 1][1]) {
    ring.push(ring[0]);
  }
  return { polygon: { type: "Polygon", coordinates: [ring] }, iou };
}

function componentAtCenter(mask: boolean[][]): boolean[][] {
  const H = mask.length,
    W = mask[0].length;
  const out = mask.map((r) => r.map(() => false));
  const cr = Math.floor(H / 2),
    cc = Math.floor(W / 2);
  let start: [number, number] | null = mask[cr][cc] ? [cr, cc] : null;
  if (!start) {
    let best = Infinity;
    for (let r = 0; r < H; r++)
      for (let c = 0; c < W; c++)
        if (mask[r][c]) {
          const dd = (r - cr) ** 2 + (c - cc) ** 2;
          if (dd < best) {
            best = dd;
            start = [r, c];
          }
        }
  }
  if (!start) return out;
  const st = [start];
  out[start[0]][start[1]] = true;
  while (st.length) {
    const [r, c] = st.pop()!;
    for (const [dr, dc] of [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1],
    ] as [number, number][]) {
      const nr = r + dr,
        nc = c + dc;
      if (nr < 0 || nc < 0 || nr >= H || nc >= W) continue;
      if (mask[nr][nc] && !out[nr][nc]) {
        out[nr][nc] = true;
        st.push([nr, nc]);
      }
    }
  }
  return out;
}

function traceBoundary(mask: boolean[][]): [number, number][] {
  const H = mask.length,
    W = mask[0].length;
  let start: [number, number] | null = null;
  for (let r = 0; r < H && !start; r++)
    for (let c = 0; c < W; c++)
      if (mask[r][c]) {
        start = [r, c];
        break;
      }
  if (!start) return [];
  const dirs: [number, number][] = [
    [-1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
    [1, 0],
    [1, -1],
    [0, -1],
    [-1, -1],
  ];
  const inside = (r: number, c: number) =>
    r >= 0 && c >= 0 && r < H && c < W && mask[r][c];
  const contour: [number, number][] = [];
  let curr = start;
  let back = 6;
  let guard = 0;
  const max = H * W * 8;
  do {
    contour.push(curr);
    let found = false;
    for (let k = 0; k < 8; k++) {
      const dir = (back + 1 + k) % 8;
      const nr = curr[0] + dirs[dir][0];
      const nc = curr[1] + dirs[dir][1];
      if (inside(nr, nc)) {
        back = (dir + 4) % 8;
        curr = [nr, nc];
        found = true;
        break;
      }
    }
    if (!found) break;
    guard++;
  } while ((curr[0] !== start[0] || curr[1] !== start[1]) && guard < max);
  return contour;
}
