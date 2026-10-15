# Comptes en ligne avec Supabase

## Perimetre

- Supabase Auth : inscription, confirmation email, connexion, changement et
  recuperation du mot de passe, deconnexion d'un appareil ou de tous.
- Postgres : profils, roles admin/utilisateur, suspension, droits Pro,
  commandes PayPal, presence et mesures d'usage.
- SSR Next : sessions par cookies, rafraichissement via src/proxy.ts,
  verification par auth.getUser et lecture du profil a chaque requete.
- Les fichiers lourds, le microphone et FFmpeg.wasm restent sur l'appareil.
  Les configurations de projets restent dans le navigateur pour cette version.
- YouTube et les captures Live/Zoom restent des services distincts qui
  necessitent un serveur persistant. Supabase ne les rend pas serverless.

## Avant la bascule

1. Creer un projet Supabase dedie a EdifyCut (ou connecter Supabase pour permettre sa
   configuration assistee). Conserver les secrets hors du chat et de Git.
2. Sauvegarder la base SQLite avec son mecanisme de backup ou arreter le
   serveur avant de sauvegarder .data, WAL compris.
3. Appliquer supabase/migrations/202610150001_accounts.sql dans le SQL Editor
   du projet. Le fichier ne supprime pas les comptes Auth existants.
4. Ajouter les variables de .env.supabase.example dans .env. Pendant la
   preparation, garder explicitement ACCOUNT_PROVIDER=local.
5. Configurer Auth et les emails selon la section suivante.
6. Importer les anciens comptes si necessaire puis tester le parcours sur
   une URL de preproduction avec ACCOUNT_PROVIDER=supabase.
7. Reporter les variables dans Vercel et redeployer apres validation.

Variables :

```dotenv
ACCOUNT_PROVIDER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://votre-projet.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
APP_URL=https://votre-domaine-public
```

Les anciennes cles NEXT_PUBLIC_SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY
sont aussi acceptees. La cle serveur doit rester strictement privee.
Ne jamais mettre service_role/secret dans NEXT_PUBLIC_*.
APP_URL doit utiliser une origine stable et accessible sans connexion Vercel.
SESSION_SECRET et l'ancien cookie iron-session ne sont plus utilises
pour les connexions Supabase ; les garder pour un retour au mode local.
Une indisponibilite Supabase ne provoque jamais un repli sur les comptes SQLite.

## Auth : reglages et emails

Dans Authentication :

- Activer le fournisseur Email et la confirmation d'adresse.
- Definir Site URL = APP_URL et autoriser les URL de redirection du studio,
  notamment /auth/confirm et /account/reset, plus localhost en developpement.
- Configurer un fournisseur SMTP adapte a l'envoi aux utilisateurs reels.
  Le service de test integre Supabase est limite et ne remplace pas ce reglage.
- Configurer les limites de tentatives et d'envoi dans Supabase Auth.
- Definir une longueur minimale de mot de passe de 12 caracteres dans Auth
  pour appliquer aussi cette politique aux appels directs a Supabase.

Dans Email Templates, remplacer les liens par :

Confirm signup :

```html
<a href="{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email">Confirmer mon compte EdifyCut</a>
```

Reset Password :

```html
<a href="{{ .SiteURL }}/account/reset#token_hash={{ .TokenHash }}">Choisir mon nouveau mot de passe</a>
```

Ces liens utilisent le hash de token, pas le lien de redirection PKCE par
defaut. Le fragment #token_hash n'est pas envoye au serveur avec la page
et evite sa presence dans les journaux d'acces HTTP. La page de reset ne
consomme le token qu'au clic Enregistrer pour
eviter une consommation par un scanner automatique d'emails.
Le token ne doit pas etre journalise ni partage. Il est retire de l'URL
apres reinitialisation et la page definit Referrer-Policy via ses metadonnees.

## Import des comptes locaux

Simulation, sans modification :

```sh
npm run migrate:supabase
```

Apres sauvegarde, configuration des cles et application du SQL :

```sh
npm run migrate:supabase -- --apply
```

L'import conserve les UUID, les hachages bcrypt, les roles, les suspensions,
les dates, les droits Pro et les commandes PayPal. Aucun mot de passe en
clair n'est lu ou exporte. Les anciennes sessions locales ne sont pas migrees :
les utilisateurs devront se reconnecter. SQLite n'est pas modifie.

Les administrateurs locaux sont importes comme comptes confirmes. Les
utilisateurs ordinaires doivent confirmer leur email avec Renvoyer la
confirmation. Si les adresses ont deja ete verifiees par ailleurs, l'operateur
peut choisir explicitement --confirm-existing-emails en plus de --apply.

Le script bloque en cas d'email deja associe a un autre UUID. Il ne rapproche
jamais deux identites silencieusement. Il marque les imports en cours dans
app_metadata pour reprendre une execution interrompue sans reinitialiser
des mots de passe ou roles de comptes deja migres. Les droits/commandes
existants ne sont pas ecrases. Les ordres PayPal conservent leur mode
Sandbox/Live : les achats Sandbox ne donnent pas acces Pro en Live.

Pour un projet sans comptes locaux, creer un compte Auth puis promouvoir
explicitement son profil dans le SQL Editor :

```sql
update public.profiles set role='admin' where id='UUID_DU_COMPTE_AUTH';
```

Ne pas utiliser npm run setup:admin pour creer un administrateur Supabase :
ce script historique configure uniquement l'installation SQLite locale.

## Controles d'acces

RLS est active sur toutes les tables. Un utilisateur authentifie peut lire
uniquement son profil et son droit Pro. Aucune ecriture navigateur n'est
autorisee sur les roles, suspensions, paiements ou droits Pro.
Les metadonnees envoyees a signUp ne peuvent pas attribuer le role admin.
Les API serveur verifient l'identite et le profil avant d'utiliser la cle
serveur. Les fonctions transactionnelles d'administration et de paiement
sont reservees au role serveur, et le dernier administrateur est protege.
La creation administrative d'un compte confirme l'email volontairement :
l'administrateur doit verifier l'identite et transmettre les acces securises.

Les suspensions et changements de role sont verifies dans le profil de
chaque requete, independamment du JWT. Les deconnexions revoquent les
sessions/refresh tokens ; un JWT deja emis peut rester valide jusqu'a son
expiration selon le fonctionnement Supabase. Ne pas promettre une invalidation
instantanee de tous les jetons d'acces.

## Verification avant production

Verifier avec le vrai projet :

1. Inscription et confirmation sur un vrai email.
2. Connexion, actualisation de page, renouvellement de session et deconnexion.
3. Recuperation sur un nouveau navigateur et refus d'un token reutilise.
4. Utilisateur non admin refuse sur /admin et /api/admin/*.
5. Suspension, modification de role, dernier administrateur et droits Pro.
6. Paiement PayPal Sandbox puis webhook, doublon et remboursement.
7. Lecture inter-utilisateurs et ecriture des roles refusees par RLS.

Le compteur de presence est partage entre instances. Les mesures CPU/memoire
restent celles de l'instance Next courante ; l'historique est separe par
instance et ne mesure ni le stockage Postgres Supabase ni l'ensemble de Vercel.

Documentation officielle :
https://supabase.com/docs/guides/auth/server-side/creating-a-client
https://supabase.com/docs/guides/database/postgres/row-level-security
https://supabase.com/docs/guides/auth/auth-email-templates
https://supabase.com/docs/guides/auth/auth-smtp
