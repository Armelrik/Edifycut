# Capture audio Zoom cote serveur

## Ce qui est implemente

Live Capture > Reunion Zoom prepare un enregistrement audio prive d'une
reunion autorisee. Le serveur recoit le flux officiel Zoom RTMS avec
@zoom/rtms. FFmpeg ecrit des fragments WAV de 30 secondes et les assemble
en M4A/AAC 128 kb/s, sans transcription ni IA.

Les commandes Pause, Continuer, Assembler, Terminer, Supprimer et les
telechargements du resultat et des fragments sont disponibles. Pause cesse
l'ecriture locale sur le serveur mais ne desactive pas le partage RTMS Zoom.
Assembler met la capture en pause. Terminer ou l'arret du flux Zoom finalise
et assemble les fragments. Aucune fermeture de page n'envoie de commande Stop.
Terminer deconnecte le recepteur EdifyCut ; pour arreter aussi le partage RTMS
et ses eventuels credits Zoom, terminer le partage de l'application dans Zoom.

Le serveur est independant du Mac/Windows et du client Zoom utilise par
les participants. Cela ne garantit pas que tout client puisse demarrer RTMS :
l'hote et les utilisateurs doivent disposer des fonctions et autorisations
Zoom necessaires pour partager le contenu avec l'application.
Un lien ou un mot de passe de reunion ne donne pas acces a son audio.

## Prerequis

- Serveur persistant Linux x64, Node.js 22+ (24 recommande par Zoom), FFmpeg.
- Le SDK officiel prend aussi en charge Mac Apple Silicon pour le serveur.
  Un serveur Windows ou Mac Intel n'est pas pris en charge par cette version
  du SDK. Les participants peuvent utiliser ces systemes.
- Disque durable et prive pour .data et base SQLite existante.
- Une seule instance Next/worker pour cette premiere integration.
- Application Zoom General App avec RTMS et scope meeting:read:meeting_audio.
- Disponibilite RTMS sur le compte Zoom (Developer Pack/credits selon Zoom).
- Autorisation du partage du contenu en temps reel et consentement requis.

La fonction est explicitement indisponible sur Vercel : une requete serverless
ne remplace pas un recepteur audio connecte plusieurs heures.

## Variables serveur

Renseigner dans .env, sans publier les secrets :

```dotenv
ZM_RTMS_CLIENT=
ZM_RTMS_SECRET=
ZM_RTMS_WEBHOOK_SECRET=
ZOOM_ACCOUNT_ID=
ZOOM_CAPTURE_OWNER_ID=
```

ZOOM_ACCOUNT_ID est l'identifiant du compte Zoom autorise (pas le Client ID).
ZOOM_CAPTURE_OWNER_ID est l'identifiant du compte EdifyCut autorise a preparer
les captures. Il est retourne par /api/account quand ce compte est connecte.
La premiere version associe un compte Zoom a un compte EdifyCut configure
par l'administrateur. Ce n'est pas encore une connexion OAuth multi-utilisateurs.
Aucun utilisateur ne peut revendiquer les reunions d'un autre compte Zoom.

Installer les dependances optionnelles sur le serveur cible :

```sh
npm ci --include=optional
node --input-type=module -e 'import("@zoom/rtms").then(() => console.log("SDK Zoom charge"))'
ffmpeg -version
npm run build
npm run start
```

Si le SDK ne se charge pas, consulter sa documentation officielle et verifier
la plateforme ainsi que les binaires precompiles. Une installation npm reussie
ne garantit pas qu'un binaire natif existe pour le systeme cible.

## Configuration Zoom

1. Creer/configurer la General App RTMS dans Zoom App Marketplace.
2. Autoriser uniquement l'audio : meeting:read:meeting_audio.
3. Installer/autoriser l'application sur le compte Zoom cible.
4. Activer le partage du contenu de reunion avec l'application dans les
   parametres Zoom autorises par l'administrateur/hote.
5. Ajouter le webhook HTTPS public :
   https://votre-domaine/api/zoom/webhook
6. Copier son Secret Token dans ZM_RTMS_WEBHOOK_SECRET puis redemarrer Next.
7. Valider l'URL et souscrire meeting.rtms_started et meeting.rtms_stopped.
8. Dans EdifyCut, preparer la capture avec le numero de reunion avant le
   demarrage RTMS. La demande expire apres deux heures sans flux.
9. Demarrer le partage RTMS pour cette application dans Zoom, ou configurer
   son auto-demarrage autorise. EdifyCut ne rejoint pas clandestinement la
   reunion et ne contourne ni la salle d'attente ni un refus d'enregistrement.

Si RTMS est deja demarre avant la preparation, l'arreter puis le redemarrer
avec l'autorisation necessaire pour recevoir un nouvel evenement de debut.
Apres redemarrage du serveur, les fragments sont conserves, mais la connexion
RTMS n'est pas restauree automatiquement.

## Securite et limites

Le webhook verifie le HMAC SHA-256 du corps brut et refuse les signatures
absentes/incorrectes et les timestamps distants de plus de cinq minutes.
Le challenge Zoom renvoie le HMAC du plainToken.
Le compte Zoom, le numero prepare, le proprietaire EdifyCut et l'identifiant
de flux sont controles ; les livraisons de debut dupliquees sont ignorees.
Le SDK est execute dans un processus isole ; aucun serveur webhook non signe
du SDK n'est demarre.

Les fichiers sont accessibles seulement au compte proprietaire. Les dossiers
sont prives. Ils ne sont pas automatiquement envoyes sur l'ordinateur :
le bouton de telechargement produit la copie locale demandee.
Limites : une capture en attente/active, 6 h, 1 Go d'audio source,
plus les fichiers assembles. Nettoyage des captures inactives apres 24 h
lors du prochain acces par leur proprietaire.

Les limites/credits et notifications de Zoom restent applicables. La capture
serveur ne signifie pas un enregistrement local uniquement : les voix et
les metadonnees de reunion transitent par Zoom puis le serveur EdifyCut.

## Verification

La compilation, les controles d'acces et l'assemblage FFmpeg peuvent etre
verifies sans Zoom. Une reunion reelle ne peut etre validee qu'apres
configuration de l'application, des credentials et des autorisations Zoom.

Sources officielles :
https://developers.zoom.us/docs/rtms/meetings/quickstart/
https://github.com/zoom/rtms
https://github.com/zoom/rtms/blob/main/examples/node.md
