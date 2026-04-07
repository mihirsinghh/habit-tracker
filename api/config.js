export default function handler(_request, response) {
  const { SUPABASE_ANON_KEY, SUPABASE_URL } = process.env;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    response.status(200).json({ configured: false });
    return;
  }

  response.status(200).json({
    configured: true,
    supabaseAnonKey: SUPABASE_ANON_KEY,
    supabaseUrl: SUPABASE_URL
  });
}
