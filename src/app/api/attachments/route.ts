import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiUser } from "@/lib/auth";

const MAX = 10 * 1024 * 1024;
const ALLOWED: Record<string, string[]> = {
  "image/jpeg": ["jpg", "jpeg"], "image/png": ["png"], "image/webp": ["webp"], "image/heic": ["heic"],
  "application/pdf": ["pdf"], "text/plain": ["txt"], "text/csv": ["csv"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["docx"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["xlsx"],
  "application/msword": ["doc"], "application/vnd.ms-excel": ["xls"],
};
const ENTITY_TABLE: Record<string, string> = { transaction: "transactions", task: "tasks", bill: "bills", event: "calendar_events" };

/** Magic-byte check so a renamed executable can't masquerade as a PDF/image. */
function sniffOk(mime: string, buf: Uint8Array) {
  const starts = (...b: number[]) => b.every((v, i) => buf[i] === v);
  if (mime === "application/pdf") return starts(0x25, 0x50, 0x44, 0x46);
  if (mime === "image/png") return starts(0x89, 0x50, 0x4e, 0x47);
  if (mime === "image/jpeg") return starts(0xff, 0xd8, 0xff);
  if (mime === "image/webp") return starts(0x52, 0x49, 0x46, 0x46);
  if (mime.includes("openxmlformats")) return starts(0x50, 0x4b);
  if (mime === "text/plain" || mime === "text/csv") return !buf.slice(0, 512).includes(0);
  return true;
}

export async function POST(req: Request) {
  const u = await getApiUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: allowed } = await u.supabase.rpc("check_rate_limit", { p_bucket: "upload", p_limit: 60, p_window_seconds: 3600 });
  if (allowed === false) return NextResponse.json({ error: "Upload limit reached" }, { status: 429 });

  const fd = await req.formData();
  const file = fd.get("file");
  const meta = z.object({
    entity_type: z.enum(["transaction", "task", "bill", "event", "business_document"]),
    entity_id: z.uuid().optional(),
    business_id: z.uuid().optional(),
    title: z.string().max(200).optional(),
  }).safeParse({
    entity_type: fd.get("entity_type"), entity_id: fd.get("entity_id") || undefined,
    business_id: fd.get("business_id") || undefined, title: fd.get("title") || undefined,
  });
  if (!(file instanceof File) || !meta.success) return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  if (file.size === 0 || file.size > MAX) return NextResponse.json({ error: "Files must be between 1 byte and 10 MB" }, { status: 400 });
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED[file.type]?.includes(ext)) return NextResponse.json({ error: "Unsupported file type. Use PDF, images, Office documents, TXT or CSV." }, { status: 400 });
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!sniffOk(file.type, buf)) return NextResponse.json({ error: "File contents don't match its type" }, { status: 400 });

  // The linked record must belong to the user (RLS makes other users' rows invisible).
  if (meta.data.entity_id && ENTITY_TABLE[meta.data.entity_type]) {
    const { data } = await u.supabase.from(ENTITY_TABLE[meta.data.entity_type]).select("id").eq("id", meta.data.entity_id).maybeSingle();
    if (!data) return NextResponse.json({ error: "Linked record not found" }, { status: 404 });
  }
  const safeName = file.name.replace(/[^\w.\- ]+/g, "_").slice(-120);
  const path = `${u.user.id}/${meta.data.entity_type}/${crypto.randomUUID()}.${ext}`;
  const up = await u.supabase.storage.from("attachments").upload(path, buf, { contentType: file.type, upsert: false });
  if (up.error) return NextResponse.json({ error: `Storage error: ${up.error.message}` }, { status: 500 });
  const { data: row, error } = await u.supabase.from("attachments").insert({
    user_id: u.user.id, entity_type: meta.data.entity_type, entity_id: meta.data.entity_id ?? null, business_id: meta.data.business_id ?? null,
    title: meta.data.title ?? null, storage_path: path, file_name: safeName, mime_type: file.type, size_bytes: file.size,
  }).select("*").single();
  if (error) {
    await u.supabase.storage.from("attachments").remove([path]);
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ ok: true, attachment: row });
}

export async function GET(req: Request) {
  const u = await getApiUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const { data: a } = await u.supabase.from("attachments").select("storage_path, file_name").eq("id", id).single();
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { data, error } = await u.supabase.storage.from("attachments").createSignedUrl(a.storage_path, 60, { download: a.file_name });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.redirect(data.signedUrl);
}

export async function DELETE(req: Request) {
  const u = await getApiUser();
  if (!u) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(req.url).searchParams.get("id");
  if (!id || !z.uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const { data: a } = await u.supabase.from("attachments").select("storage_path").eq("id", id).single();
  if (!a) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await u.supabase.storage.from("attachments").remove([a.storage_path]);
  await u.supabase.from("attachments").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
