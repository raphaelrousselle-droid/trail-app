import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabase.js";

export interface AuthedRequest extends Request {
  userId?: string;
}

/**
 * Vérifie le token Supabase envoyé dans l'en-tête Authorization: Bearer <token>.
 * Le frontend récupère ce token après connexion via supabase-js (auth.getSession()).
 */
export async function requireAuth(
  req: AuthedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Token d'authentification manquant." });
  }

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return res.status(401).json({ error: "Token invalide ou expiré." });
  }

  req.userId = data.user.id;
  next();
}
