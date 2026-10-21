import { createTelegramHandler } from './handler.ts';

Deno.serve(createTelegramHandler({
  APP_ORIGIN: Deno.env.get('APP_ORIGIN'),
  TELEGRAM_OWNER_USER_ID: Deno.env.get('TELEGRAM_OWNER_USER_ID'),
  TELEGRAM_BOT_TOKEN: Deno.env.get('TELEGRAM_BOT_TOKEN'),
  SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
  SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
}));
