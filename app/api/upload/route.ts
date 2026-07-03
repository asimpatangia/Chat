import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  let file: File | null = null;
  let conversationId: string | null = null;

  try {
    const formData = await req.formData();
    file = formData.get('file') as File | null;
    conversationId = formData.get('conversationId') as string | null;
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Build a safe unique path
  const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${Date.now()}-${Math.random().toString(36).slice(2)}-${safeFileName}`;

  let arrayBuffer: ArrayBuffer;
  try {
    arrayBuffer = await file.arrayBuffer();
  } catch {
    return NextResponse.json({ error: 'Could not read file data' }, { status: 400 });
  }

  const { error: uploadError } = await supabase.storage
    .from('uploads')
    .upload(storagePath, arrayBuffer, {
      contentType: file.type || 'application/octet-stream',
      upsert: false,
    });

  if (uploadError) {
    console.error('Supabase upload error:', uploadError);
    return NextResponse.json(
      { error: `Storage upload failed: ${uploadError.message}` },
      { status: 500 }
    );
  }

  const { data: { publicUrl } } = supabase.storage
    .from('uploads')
    .getPublicUrl(storagePath);

  const { data, error: dbError } = await supabase
    .from('uploaded_files')
    .insert({
      conversation_id: conversationId || null,
      name: file.name,
      storage_path: storagePath,
      public_url: publicUrl,
      size: file.size,
      mime_type: file.type || 'application/octet-stream',
    })
    .select()
    .single();

  if (dbError) {
    console.error('Supabase DB error:', dbError);
    // Upload succeeded but DB record failed — still return the URL
    return NextResponse.json({
      id: storagePath,
      name: file.name,
      public_url: publicUrl,
      size: file.size,
      mime_type: file.type,
      warning: 'File uploaded but metadata could not be saved',
    });
  }

  return NextResponse.json(data);
}

// GET /api/upload — list all uploaded files
export async function GET() {
  const { data, error } = await supabase
    .from('uploaded_files')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
