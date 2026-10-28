import { put } from "@vercel/blob";
import { type NextRequest } from "next/server";
import { getDb } from "@/db";
import { DomainError } from "@/lib/domain";
import { errorResponse, json, requireStaff } from "@/lib/http";

const MAX_BYTES = 4 * 1024 * 1024;
const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

function uploadsEnabled() {
  return !!process.env.BLOB_READ_WRITE_TOKEN;
}

/** Manager uploads a dish photo from their phone; it is stored in Vercel Blob. */
export async function POST(req: NextRequest) {
  try {
    await requireStaff(getDb(), ["manager"]);
    const origin = req.headers.get("origin");
    const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
    if (!origin || !host || new URL(origin).host !== host) throw new DomainError("Unsupported request", 403);
    if (!uploadsEnabled()) throw new DomainError("Photo upload is not set up yet. Paste a photo link instead.", 503);
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new DomainError("Choose a photo to upload");
    const ext = TYPES[file.type];
    if (!ext) throw new DomainError("Photos must be JPG, PNG or WebP");
    if (file.size > MAX_BYTES) throw new DomainError("Photo is too large. Please keep it under 4 MB.");
    const blob = await put(`dishes/dish.${ext}`, file, { access: "public", addRandomSuffix: true, contentType: file.type });
    return json({ url: blob.url }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
