import { NextResponse } from "next/server";
import { parseBillPdf } from "@/lib/billParser";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024; // 10 MB

export async function POST(req: Request) {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Esperaba multipart/form-data con un campo 'file'" },
      { status: 400 },
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "FormData inválido" }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Falta el campo 'file'" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `Fichero demasiado grande (>${MAX_BYTES} bytes)` },
      { status: 413 },
    );
  }
  if (
    !file.name.toLowerCase().endsWith(".pdf") &&
    file.type !== "application/pdf"
  ) {
    return NextResponse.json(
      { error: "Sólo se admiten ficheros PDF" },
      { status: 415 },
    );
  }

  try {
    const buffer = await file.arrayBuffer();
    const data = await parseBillPdf(buffer);
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? `Error parseando PDF: ${err.message}`
            : "Error parseando PDF",
      },
      { status: 500 },
    );
  }
}
