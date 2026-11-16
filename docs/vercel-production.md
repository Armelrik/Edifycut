# Deploiement Vercel

## Lier le projet existant

Depuis le dossier EdifyCut :

```sh
npx vercel@latest login
npx vercel@latest link
```

Choisir le projet EdifyCut existant, sans en creer un second.
Le framework est Next.js ; le dossier racine est celui contenant package.json.
Si le depot Git contient EdifyCut dans un sous-dossier, definir ce dossier
comme Root Directory dans Vercel. Utiliser Node.js 22.x.

## Variables Production

Dans Settings > Environment Variables, reporter les valeurs de .env :

| Variable | Valeur |
| --- | --- |
| DATABASE_URL | Connexion Neon poolee, marquer Secret/Sensitive |
| NEON_AUTH_BASE_URL | URL Neon Auth de la branche de production |
| NEON_AUTH_COOKIE_SECRET | 32 caracteres minimum, marquer Secret/Sensitive |
| APP_URL | Origine HTTPS stable de production, sans chemin |
| PAYPAL_ENV | sandbox pendant la validation, live uniquement apres configuration Live |
| PAYPAL_CLIENT_ID | Client du mode PayPal choisi |
| PAYPAL_CLIENT_SECRET | Secret du meme mode, marquer Secret/Sensitive |
| PAYPAL_WEBHOOK_ID | Webhook du meme mode |

Ne pas importer aveuglement tout .env : les chemins locaux, secrets Zoom et
DATABASE_URL_UNPOOLED (migrations) ne doivent pas etre recopies sur Vercel.
Ne jamais placer un secret Neon dans une variable NEXT_PUBLIC.
Supprimer les anciennes variables Supabase et ACCOUNT_PROVIDER.
Ne pas partager la base de production avec les previews non fiables ; utiliser
une branche Neon de preproduction et PayPal Sandbox pour les previews.

Les nouvelles variables ne s'appliquent qu'au prochain deploiement.
NEXT_PUBLIC est notamment integre au build.

## Domaine et services externes

Choisir le domaine Production stable dans Settings > Domains, pas une URL
unique de deploiement. APP_URL doit correspondre a cette origine.
Dans la console Neon Auth, ajouter le domaine de production aux domaines de
confiance et configurer le fournisseur e-mail (codes de verification et de
recuperation). Ne pas desactiver la verification e-mail pour contourner SMTP.

Dans PayPal Developer, creer ou modifier le webhook vers :

```text
https://DOMAINE-PRODUCTION/api/billing/paypal/webhook
```

Evenements : CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED,
PAYMENT.CAPTURE.REFUNDED, PAYMENT.CAPTURE.REVERSED.
Le webhook doit etre accessible sans authentification Vercel/SSO. Ne pas
desactiver la verification de signature implementee par EdifyCut.
Une nouvelle application PayPal Live necessite ses propres cles et webhook.

## Verifier et deployer

```sh
npm run check:production
npm run lint
npm run build
npx vercel@latest --prod
```

Le controle lit la configuration locale : il ne certifie pas les valeurs
du dashboard Vercel, le SMTP ou la livraison des notifications PayPal.
Verifier ensuite connexion admin, inscription/confirmation, reset de mot de
passe et paiement Sandbox complet sur le domaine public.

## Limites

Le studio FFmpeg.wasm fonctionne sur l'appareil ; Neon conserve les comptes
et droits. Les projets restent actuellement dans le navigateur.
Vercel ne fournit pas le processus persistant, disque durable et binaires
requis par les captures Live/Zoom. Voir docs/zoom-server.md et
docs/youtube-deployment.md pour le serveur separe. Ne pas promettre que ces
captures fonctionnent simplement apres un deploiement Vercel.
