# Deploiement YouTube et Live Capture

## Pourquoi yt-dlp manque sur Vercel

L'installation locale npm run setup:youtube cree un environnement Python
dans .tools/yt-dlp. Ce dossier est ignore par Git et exclu du tracing Next.
Il n'est donc pas livre avec les fonctions Vercel. Un environnement Python
cree sur macOS ne doit pas etre copie tel quel sur un serveur Linux.

Ajouter YTDLP_PATH ne suffit pas : le chemin doit pointer vers un executable
present dans l'environnement de la fonction. Les conversions audio et la
fusion video/audio necessitent egalement FFmpeg et FFprobe natifs ; FFmpeg.wasm
du navigateur ne remplace pas ces outils serveur.

Il est possible de preparer des binaires Linux compatibles pendant le build
et de les inclure explicitement dans les fonctions. Cela demande une adaptation
du packaging, des chemins et de la gestion des fichiers temporaires.
Installer simplement un paquet local ne corrige pas ce deploiement.

## Installation sur un serveur Ubuntu/Debian persistant

Avec Node.js 22+ deja installe, depuis la racine EdifyCut :

```sh
sudo apt-get update
sudo apt-get install -y python3 python3-venv ffmpeg
npm ci
npm run setup:youtube
.tools/yt-dlp/bin/yt-dlp --version
ffmpeg -version
ffprobe -version
npm run build
npm run start
```

Le code detecte automatiquement .tools/yt-dlp/bin/yt-dlp et utilise Node.js
comme moteur JavaScript. YTDLP_PATH n'est necessaire qu'avec une autre installation.
Le service doit avoir acces en ecriture a .data, aux fichiers temporaires et
au reseau. Configurer un service de lancement permanent et des sauvegardes de
la base .data/edifycut.sqlite et de ses journaux avant une exploitation publique.

## Limites d'architecture

Vercel Hobby limite une fonction a 300 secondes avec Fluid Compute.
Les captures de plusieurs heures et les processus de fond doivent fonctionner
sur un service persistant, pas uniquement dans une requete serverless.
La progression actuelle utilise la memoire du processus et n'est pas partagee
entre plusieurs instances. La base SQLite et les fragments live utilisent
egalement le disque local.

Pour conserver Vercel en facade, deplacer YouTube et Live Capture vers un
backend persistant avec authentification, et adapter les API de l'application.
Migrer aussi les comptes et paiements vers un stockage durable partage,
ou heberger toute l'application sur le serveur persistant.

Sources officielles :
https://github.com/yt-dlp/yt-dlp#installation
https://vercel.com/docs/functions/limitations
