# EdifyCut Pro / PayPal

Prix fixe : 5,99 EUR pour un an d'acces. Aucun renouvellement automatique.
L'export gratuit est limite a 60 secondes, 720p/480p pour la video,
MP3 jusqu'a 128 kb/s pour l'audio. Les limitations techniques restent en place.
Live Capture et les imports YouTube ne sont pas soumis a ce paywall.

## Configuration

Ajouter les variables de .env.paypal.example au fichier .env existant.
Ne pas remplacer les secrets de session deja presents.

- PAYPAL_ENV=sandbox : paiements de test uniquement.
- PAYPAL_ENV=live : identifiants d'une application marchande PayPal Live.
- PAYPAL_CLIENT_ID et PAYPAL_CLIENT_SECRET : identifiants de cette application.
- APP_URL : origine publique de l'application, HTTPS en production.
- PAYPAL_WEBHOOK_ID : ID du webhook enregistre dans la meme application
  et le meme environnement PayPal.

Enregistrer le webhook HTTPS :
APP_URL/api/billing/paypal/webhook

Ecouter CHECKOUT.ORDER.APPROVED, PAYMENT.CAPTURE.COMPLETED,
PAYMENT.CAPTURE.REFUNDED et PAYMENT.CAPTURE.REVERSED.
En local, utiliser une origine HTTPS publique de developpement pour les webhooks.
Redemarrer Next apres avoir renseigne les variables.

## Fonctionnement

Le serveur fixe le montant et la devise, cree une commande liee au compte,
redirige vers PayPal puis capture le paiement approuve.
Le retour du navigateur et les webhooks verifies utilisent la meme confirmation
idempotente : ils ne peuvent pas ajouter plusieurs annees pour une commande.
Un paiement en attente n'active pas Pro. Aucun numero de carte n'est conserve.
Le compte doit correspondre a celui ayant cree la commande.

Les notifications de remboursement/reversion retirent l'acces issu de ce
paiement ; elles ne suppriment pas un acces accorde ensuite manuellement.
Les commandes et references de capture sont conservees dans SQLite.
L'administration peut accorder un an manuellement, sans encaisser de paiement.

## Limites

La verification du paiement est cote serveur, mais le verrouillage de
l'export est volontairement local et contournable. Aucun droit payant
n'est applique aux fichiers sources ou a des exports gratuits deja obtenus.

Le paiement reel doit etre verifie avec les comptes Sandbox du marchand et
de l'acheteur avant activation Live. Completer l'identite de l'exploitant,
ses coordonnees de support et sa politique commerciale avant commercialisation.

Documentation officielle :
https://developer.paypal.com/api/rest/integration/orders-api
https://developer.paypal.com/api/webhooks/overview/
