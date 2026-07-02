import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File;
  const conversationId = formData.get('conversationId') as string | null;

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

  const fileExt = file.name.split('.').pop();
  const storagePath = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

  const arrayBuffer = await file.arrayBuffer();
  const buffer = new Uint8Array(arrayBuffer);

  const { error: uploadError } = await supabase.storage
    .from('uploads')
    .upload(storagePath, buffer, { contentType: file.type });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
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
      mime_type: file.type,
    })
    .select()
    .single();

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 });

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
