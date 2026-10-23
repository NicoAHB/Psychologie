import { createMarketingHandler } from './handler.ts';
// Supabase provides the service-role secret only to this server environment.
Deno.serve(createMarketingHandler(Deno.env.toObject()));
