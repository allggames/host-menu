// Pegá únicamente la URL pública y la clave anon/publishable de Supabase.
// NUNCA pongas aquí la clave service_role o secret.
export const SUPABASE_URL = 'https://ewfblytwbmzclygiwqcy.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_DDDdcBd3TlGMkdrD0NSODw_0ENzS4C1';
export const WHATSAPP_NUMBER = '5493758524581'; 
export const configured = SUPABASE_URL.startsWith('https://') && !SUPABASE_ANON_KEY.startsWith('PEGAR_');
