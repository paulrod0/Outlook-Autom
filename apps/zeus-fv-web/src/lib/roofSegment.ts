import "server-only";

import * as ort from "onnxruntime-node";
import jpeg from "jpeg-js";

/**
 * Segmentación de tejado con IA (MobileSAM) sobre la ortofoto PNOA.
 *
 * Es nuestro "click-to-segment" tipo SolarEdge/Google pero local y gratis:
 * dado un punto (centroide de la cubierta), descarga la imagen aérea PNOA,
 * la pasa por el encoder+decoder de MobileSAM con ese punto como prompt y
 * devuelve el polígono exacto del tejado, alineado al píxel con la imagen.
 *
 * MobileSAM (~37 MB ONNX) corre en CPU vía onnxruntime-node. Las sesiones
 * se cachean en memoria (warm entre peticiones con Fluid Compute).
 */

const PX = 1024;

let encoderSession: ort.InferenceSession | null = null;
let decoderSession: ort.InferenceSession | null = null;

async function loadModel(origin: string, file: string): Promise<Uint8Array> {
  // no-store: el modelo (>2MB) no cabe en la fetch-cache de Next; lo
  // mantenemos en memoria vía las sesiones cacheadas a nivel de módulo.
  const res = await fetch(new URL(`/models/sam/${file}`, origin).href, {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`No se pudo cargar ${file} (${res.status})`);
  return new Uint8Array(await res.arrayBuffer());
}

async function ensureSessions(origin: string) {
  if (encoderSession && decoderSession) return;
  const [enc, dec] = await Promise.all([
    loadModel(origin, "mobilesam.encoder.onnx"),
    loadModel(origin, "mobilesam.decoder.onnx"),
  ]);
  encoderSession ??= await ort.InferenceSession.create(enc);
  decoderSession ??= await ort.InferenceSession.create(dec);
}

// lon/lat → EPSG:3857
function to3857(lon: number, lat: number): [number, number] {
  const x = (lon * 20037508.34) / 180;
  let y = Math.log(Math.tan(((90 + lat) * Math.PI) / 360)) / (Math.PI / 180);
  y = (y * 20037508.34) / 180;
  return [x, y];
}
// EPSG:3857 → lon/lat
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
  coveragePct: number;
};

export async function segmentRoof(
  origin: string,
  lat: number,
  lon: number,
  boxM = 80,
): Promise<RoofSegmentResult | null> {
  await ensureSessions(origin);

  // 1) Caja EPSG:3857 alrededor del punto + imagen PNOA 1024².
  const [cx, cy] = to3857(lon, lat);
  const half = boxM / 2;
  const minX = cx - half,
    maxX = cx + half,
    minY = cy - half,
    maxY = cy + half;
  const url =
    "https://www.ign.es/wms-inspire/pnoa-ma?service=WMS&request=GetMap&version=1.3.0" +
    "&layers=OI.OrthoimageCoverage&styles=&format=image/jpeg&transparent=false" +
    `&crs=EPSG:3857&width=${PX}&height=${PX}&bbox=${minX},${minY},${maxX},${maxY}`;

  const imgRes = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0", Accept: "image/jpeg" },
    cache: "no-store",
  });
  if (!imgRes.ok) throw new Error(`PNOA GetMap ${imgRes.status}`);
  const { data, width, height } = jpeg.decode(
    Buffer.from(await imgRes.arrayBuffer()),
    { useTArray: true },
  );

  // 2) RGBA → [H,W,3] float para el encoder.
  const rgb = new Float32Array(height * width * 3);
  for (let i = 0, j = 0; i < data.length; i += 4) {
    rgb[j++] = data[i];
    rgb[j++] = data[i + 1];
    rgb[j++] = data[i + 2];
  }
  const imageTensor = new ort.Tensor("float32", rgb, [height, width, 3]);
  const enc = await encoderSession!.run({ input_image: imageTensor });
  const embeddings = enc.image_embeddings;

  // 3) Decoder con varios puntos foreground en el centro (la cubierta bajo
  //    el marcador) para robustez.
  const c = PX / 2;
  const d = PX * 0.12;
  const ptArr = new Float32Array([
    c, c, c - d, c, c + d, c, c, c - d, c, c + d, 0, 0,
  ]);
  const lblArr = new Float32Array([1, 1, 1, 1, 1, -1]);
  const dec = await decoderSession!.run({
    image_embeddings: embeddings,
    point_coords: new ort.Tensor("float32", ptArr, [1, 6, 2]),
    point_labels: new ort.Tensor("float32", lblArr, [1, 6]),
    mask_input: new ort.Tensor("float32", new Float32Array(256 * 256), [1, 1, 256, 256]),
    has_mask_input: new ort.Tensor("float32", new Float32Array([0]), [1]),
    orig_im_size: new ort.Tensor("float32", new Float32Array([PX, PX]), [2]),
  });
  const masks = dec.masks;
  const iou = (dec.iou_predictions.data as Float32Array)[0] ?? 0;
  const maskData = masks.data as Float32Array; // [1,1,PX,PX]

  // 4) Máscara booleana + componente conexa que contiene el centro.
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

  // 5) Contorno → polígono en píxeles → lon/lat.
  const contour = traceBoundary(comp);
  if (contour.length < 4) return null;
  const ring: GeoJSON.Position[] = contour.map(([r, cc]) => {
    const fx = (cc + 0.5) / PX;
    const fy = (r + 0.5) / PX;
    const X = minX + fx * (maxX - minX);
    const Y = maxY - fy * (maxY - minY); // fila 0 = norte (maxY)
    return from3857(X, Y);
  });
  if (
    ring[0][0] !== ring[ring.length - 1][0] ||
    ring[0][1] !== ring[ring.length - 1][1]
  ) {
    ring.push(ring[0]);
  }

  return {
    polygon: { type: "Polygon", coordinates: [ring] },
    iou,
    coveragePct: Number(((100 * on) / (PX * PX)).toFixed(1)),
  };
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
  // Submuestrear el contorno (1 de cada 4 px) para aligerar antes de simplificar.
  return contour.filter((_, i) => i % 4 === 0);
}
