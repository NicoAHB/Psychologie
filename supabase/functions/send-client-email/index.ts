import { createEmailHandler } from './handler.ts';

Deno.serve(createEmailHandler({
  APP_ORIGIN: Deno.env.get('APP_ORIGIN'),
  EMAIL_OWNER_USER_ID: Deno.env.get('EMAIL_OWNER_USER_ID'),
  EMAIL_FROM: Deno.env.get('EMAIL_FROM'),
  RESEND_API_KEY: Deno.env.get('RESEND_API_KEY'),
  SUPABASE_URL: Deno.env.get('SUPABASE_URL'),
  SUPABASE_ANON_KEY: Deno.env.get('SUPABASE_ANON_KEY'),
}));
