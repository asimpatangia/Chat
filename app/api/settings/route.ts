import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';

// GET /api/settings?deviceId=xxx
export async function GET(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get('deviceId');
  if (!deviceId) return NextResponse.json({}, { status: 400 });

  const { data, error } = await supabase
    .from('user_settings')
    .select('settings_json')
    .eq('device_id', deviceId)
    .single();

  if (error || !data) return NextResponse.json({});
  return NextResponse.json(data.settings_json);
}

// POST /api/settings  { deviceId, settings }
export async function POST(req: NextRequest) {
  const { deviceId, settings } = await req.json();
  if (!deviceId) return NextResponse.json({ error: 'No deviceId' }, { status: 400 });

  const { error } = await supabase
    .from('user_settings')
    .upsert({
      device_id: deviceId,
      settings_json: settings,
      updated_at: new Date().toISOString(),
    });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}

// DELETE /api/settings?deviceId=xxx  — lets the user wipe saved keys
export async function DELETE(req: NextRequest) {
  const deviceId = req.nextUrl.searchParams.get('deviceId');
  if (!deviceId) return NextResponse.json({ error: 'No deviceId' }, { status: 400 });

  const { error } = await supabase
    .from('user_settings')
    .delete()
    .eq('device_id', deviceId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
