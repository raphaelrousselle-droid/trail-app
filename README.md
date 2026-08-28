# Trail App — MVP

Application de plan d'entraînement trail adaptatif : génère un plan à partir
de ton profil et de ton objectif de course, puis l'ajuste automatiquement
selon tes retours (douleur, ressenti d'effort, fatigue) au fil des séances.

## Architecture

```
trail-app/
├── supabase/migrations/0001_init.sql   → schéma de base de données + RLS
├── src/                                 → backend Node.js/TypeScript (Express)
│   ├── index.ts                         → point d'entrée du serveur
│   ├── lib/supabase.ts                  → client Supabase (clé service_role)
│   ├── middleware/auth.ts               → vérifie le token utilisateur
│   ├── services/
│   │   ├── planGenerator.ts             → génère le plan initial (règles d'entraînement)
│   │   └── adaptationEngine.ts          → ajuste le plan selon les logs de séance
│   └── routes/                          → endpoints REST
└── frontend/                            → React + Vite (dashboard minimal)
```

**Pourquoi Supabase ?** Postgres géré + authentification + Row Level Security
intégrés : pas de serveur de base de données à gérer soi-même, et la sécurité
(chacun ne voit que ses données) est appliquée au niveau de la base, pas
seulement dans le code.

## Démarrage

### 1. Créer le projet Supabase

1. Crée un compte sur [supabase.com](https://supabase.com) et un nouveau projet.
2. Dans l'éditeur SQL de Supabase, exécute le contenu de
   `supabase/migrations/0001_init.sql`.
3. Récupère `Project URL`, `anon key` et `service_role key` dans
   Project Settings → API.

### 2. Backend

```bash
cp .env.example .env    # renseigne SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
npm install
npm run dev              # démarre sur http://localhost:3001
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env     # renseigne VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
npm install
npm run dev               # démarre sur http://localhost:5173
```

### 4. Premier parcours

1. Ouvre le frontend, connecte-toi par email (lien magique).
2. Crée un profil et un objectif de course (pas encore d'écran dédié dans ce
   MVP — utilise l'API directement, voir ci-dessous, ou ajoute vite fait un
   formulaire dans `frontend/src/pages`).
3. Génère le plan : `POST /race-goals/:id/generate-plan`.
4. Le dashboard affiche la semaine en cours ; tu peux logger chaque séance.

### Exemple d'appel API (avec un token de session valide)

```bash
curl -X POST http://localhost:3001/race-goals \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Trail des Collines",
    "race_date": "2027-03-15",
    "distance_km": 10,
    "elevation_gain_m": 400,
    "terrain_technicality": 3
  }'
```

## Ce qui est fait vs ce qui reste

**Fait (MVP fonctionnel) :**
- Schéma de base de données complet avec sécurité par utilisateur (RLS)
- Génération de plan basée sur des règles (périodisation 4 phases, montée
  progressive du volume/dénivelé, rotation des types de séances)
- Moteur d'adaptation avec 3 règles concrètes (douleur genou, RPE élevé,
  fatigue répétée) qui modifient les semaines à venir et tracent pourquoi
  (`adaptation_reason`)
- API REST complète (profil, objectifs, plans, logs de séance)
- Frontend minimal : connexion, dashboard de la semaine, formulaire de log

**Ce qui manque pour une v1 solide (bonnes prochaines étapes avec Claude Code) :**
- Écrans frontend pour créer/éditer profil et objectif de course (pour l'instant, API directe)
- Tests automatisés (le moteur d'adaptation en particulier mériterait des tests unitaires)
- Vue calendrier complète côté frontend (le prototype HTML précédent peut inspirer le design)
- Gestion des zones de fréquence cardiaque (non présente dans ce schéma — à ajouter si tu veux la garder)
- Notifications / rappels de séance
- Déploiement (Vercel/Railway pour le backend + frontend, Supabase reste hébergé)

## Notes de sécurité

- La clé `service_role` ne doit **jamais** être exposée côté frontend — elle
  reste uniquement dans `.env` du backend.
- Le backend vérifie systématiquement que la ressource demandée appartient
  bien à l'utilisateur authentifié avant de la lire ou modifier, en plus des
  policies RLS au niveau de la base (défense en profondeur).
