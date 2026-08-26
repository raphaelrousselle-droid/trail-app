import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    "SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définis (voir .env.example)."
  );
}

// Client "admin" côté serveur : il contourne la Row Level Security,
// donc on ne l'utilise QUE après avoir vérifié l'identité de l'utilisateur
// (voir src/middleware/auth.ts) et toujours en filtrant explicitement par user_id.
export const supabaseAdmin = createClient(url, serviceKey, {
  auth: { persistSession: false },
});
