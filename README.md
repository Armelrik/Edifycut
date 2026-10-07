This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Import YouTube experimental

Dans `/editor`, collez le lien d'une video YouTube puis cliquez sur **Analyser**.
Choisissez le format et la qualite, puis **Enregistrer sur mon appareil**.
Sur les navigateurs qui proposent `showSaveFilePicker`, le choix de l'emplacement
precede le telechargement et les donnees sont ecrites directement sur disque.
Sur les autres navigateurs, le telechargement classique utilise leurs reglages
d'emplacement (activez la demande d'emplacement dans ces reglages si necessaire).
Apres l'enregistrement, **Ouvrir dans l'editeur** charge la video pour les coupes
sans la telecharger a nouveau. Les fichiers audio sont enregistres sans import.
Le service utilise le serveur Node.js de Next.
Les imports locaux et les modifications FFmpeg.wasm restent dans le navigateur ;
les imports YouTube passent temporairement par le serveur.

Prerequis : Python 3.10+, Node.js 22+ et FFmpeg/ffprobe accessibles dans le PATH.
Sur macOS, FFmpeg peut etre installe avec `brew install ffmpeg`.

```bash
npm run setup:youtube
npm run dev
```

`setup:youtube` installe ou met a jour `yt-dlp[default]` (avec les composants EJS)
dans `.tools/yt-dlp`, sans changer l'installation systeme.
Le serveur utilise cette version en priorite puis cherche `yt-dlp` dans le PATH.
`YTDLP_PATH` et `FFMPEG_PATH` permettent de choisir d'autres executables.

Les limites de taille et de duree sont configurees avec `YT_MAX_BYTES` et
`YT_MAX_DURATION_S`. Le telechargement peut durer jusqu'a 15 minutes.
Le bouton **Annuler** arrete le telechargement et ses sous-processus ;
les fichiers temporaires sont supprimes apres
le transfert, une erreur ou une annulation. Une fermeture forcee du serveur
peut laisser des dossiers `yt-*` dans le repertoire temporaire.
La barre indique la progression de chaque flux YouTube (video puis audio),
puis celle de l'enregistrement local. La conversion reste indeterminee.
Le suivi utilise un identifiant aleatoire et le meme processus serveur.

Les videos qui exigent une connexion YouTube ne sont pas prises en charge.
Utilisez vos videos accessibles publiquement ou celles dont le telechargement
est autorise. Cette route locale n'est pas prevue pour une exposition publique.

## Montage, effets et silences

Les bornes de l'editeur utilisent des positions absolues `HH:MM:SS.cc`.
Les boutons **Couper avant ici** et **Couper apres ici** fixent les bornes a
la position du lecteur ; **Couper ici** puis **Terminer la coupe ici** retirent
un passage interieur. Les coupes peuvent etre decochees, ecoutees ou supprimees.

La detection des silences utilise FFmpeg.wasm (`silencedetect`) dans le navigateur,
avec seuil sonore, pause minimale et marge de parole. Aucune IA ni transcription.
L'optimisation automatique conserve la vitesse et les couleurs, ajoute des fondus
courts et applique une compression 720p maximum sans agrandir la source.
Les styles visuels sont distincts des presets d'export.

Les passages conserves sont encodes successivement puis assembles en MP4,
avec les memes bornes pour l'image et le son. Les fichiers virtuels sont nettoyes
et le moteur est termine apres l'analyse ou l'export. Les longues videos peuvent
rester couteuses en temps et en memoire ; aucune operation ne modifie l'original.

## Live Capture et atelier audio

`/live` enregistre un direct YouTube en cours depuis son point actuel.
La connexion a un compte est obligatoire. FFmpeg serveur encode des fragments
H.264/AAC de 30 secondes, puis les assemble sans reencoder en MP4.
**Pause** ferme le fragment en cours ; **Continuer** retrouve le flux actuel.
Les periodes en pause ne sont pas recuperees. **Assembler** met la capture en
pause et produit un MP4 ; **Terminer** arrete et assemble. La fin naturelle du
flux declenche aussi l'assemblage. Chaque fragment peut etre telecharge separement.

Les sessions et fragments prives sont dans `.data/live`, hors Git et hors bundle.
Ils survivent a un rafraichissement de page. Apres un redemarrage du serveur,
les sessions interrompues sont marquees en pause et les fragments deja fermes
restent assemblables. Limites : deux captures actives sur le serveur, cinq sessions
par compte, six heures et 4 Go de fragments par session (plus le MP4 assemble).
Les sessions inactives depuis 24 heures sont nettoyees au prochain acces au service.
**Supprimer** efface la session et ses fichiers sur le serveur.

Cette capture exige un serveur Node.js unique, durable, un disque persistant,
yt-dlp a jour et FFmpeg avec libx264/AAC. Ne pas deployer sur des fonctions
serverless a duree limitee ou plusieurs replicas : les processus actifs sont
geres dans l'instance Node. Le stockage est limite a 20 sessions sur le serveur.
Une fermeture forcee peut interrompre le dernier
fragment ; un arret brutal peut aussi necessiter de nettoyer les processus
FFmpeg restes actifs. Les fragments non finalises ne sont pas assembles.

`/audio` traite les fichiers audio locaux uniquement dans le navigateur :
coupe, vitesse de 0.5 a 2, volume, normalisation, fondus et export MP3/M4A/WAV.
Le debit MP3/AAC est reglable. Les originaux ne sont jamais modifies.
Le moteur FFmpeg.wasm est libere apres chaque export ou annulation.
Les fichiers sont limites a 512 Mo ; les limites de memoire du navigateur
peuvent imposer des fichiers plus petits, particulierement sur smartphone.
Le partage utilise le selecteur systeme ou un telechargement de secours.

## Montage photo/video, projets et microphone

`/merge` assemble jusqu'a 12 videos et photos JPG/PNG/WebP dans une timeline,
avec reorganisation par glisser-deposer ou fleches, coupes, duree des photos,
volume et transitions (coupe, fondu, balayage, glissement). Formats paysage,
portrait et carre, en 1080p/720p/480p. FFmpeg.wasm normalise les clips, ajoute
du silence aux photos/videos sans son et assemble successivement les medias.
Les fondus video sont accompagnes de fondus audio. L'export produit un vrai
MP4 H.264/AAC, avec progression, annulation, telechargement et partage.
Les sources sont limitees a 512 Mo au total ; la memoire du navigateur peut
imposer des limites plus basses. Les assemblages successifs reencodent les
transitions : de longs montages peuvent donc etre couteux en temps.

La timeline utilise une regle temporelle, un zoom, un curseur de lecture,
des poignees de decoupe et un alignement sur les raccords. Les gestes utilisent
Pointer Events pour la souris et le tactile. Les fleches sur les blocs permettent
aussi la reorganisation ou le placement audio au clavier. **Scinder ici** coupe
la selection ; Annuler/Retablir conserve jusqu'a 30 etats de reglages.

Jusqu'a quatre clips audio supplementaires sont acceptes (64 Mo et 30 minutes
par fichier), avec position temporelle, bornes source, volume, sourdine et fondus.
La forme d'onde est calculee a partir du vrai signal via FFmpeg, sans conserver
de donnees audio ni de forme d'onde dans les projets. Le son des videos dispose
d'un volume global. L'export prepare les pistes successivement puis applique
leurs delais et le mixage, avec un limiteur anti-saturation. La fin du montage
visuel borne l'audio ; les portions hors export apparaissent grisees.
Les reglages audio sont sauvegardes avec le projet et les fichiers doivent etre
reselectionnes a la reprise. Les projets de montage precedents restent compatibles.

`/audio` permet aussi une prise au microphone via MediaRecorder, avec pause
et reprise. Le microphone exige HTTPS ou localhost et une autorisation.
Les prises sont limitees a 30 minutes/128 Mo puis converties localement en
M4A pour une duree exploitable avant le montage audio. Le microphone et le
moteur sont liberes apres utilisation ou sortie de la page.

`/videos` conserve jusqu'a 50 projets legers dans localStorage : references
de fichiers (nom, taille, date), reglages, ordre et transitions. Aucune video,
photo, prise audio ou vignette n'y est stockee. Reprendre un projet demande
de reselectionner ses originaux. Les projets peuvent etre renommes, supprimes
ou exportes en JSON. Ils sont propres a cet appareil/navigateur, non au compte.

Les preferences personnalisent l'accent, la densite, les animations, la banniere,
la sauvegarde automatique, la duree des photos et la transition par defaut.
L'administration peut creer des utilisateurs ou administrateurs avec un mot
de passe initial hache ; l'accueil offre un lien direct vers l'inscription.
La partie reseaux sociaux reste reservee a la prochaine etape.

## Comptes et administration

```bash
npm run setup:admin
```

Cette commande cree le compte `admin@edifycut.local`, un mot de passe aleatoire
et le secret de session dans `.env`. `ADMIN_EMAIL` peut definir une autre adresse
avant la creation. Les identifiants initiaux sont dans `.data/admin-credentials.txt`
(fichier prive, exclu de Git). Changez le mot de passe depuis `/account`.
Relancer la commande ne remplace pas un compte existant.

Les comptes sont stockes dans `.data/edifycut.sqlite`. L'inscription, la connexion,
le profil et le changement de mot de passe sont accessibles sur `/account`.
La page `/admin` permet aux administrateurs de changer les roles, desactiver
les comptes et definir un nouveau mot de passe. Ces operations invalident les
sessions precedentes du compte. La recuperation de mot de passe par e-mail
n'est pas configuree ; elle passe par l'administrateur de cette installation.

Pour un hebergement, conserver `.data` sur un disque persistant et fournir
`SESSION_SECRET` via la configuration du serveur. En production, les cookies
de session exigent HTTPS. Les montages locaux ne sont pas synchronises avec
le compte. Seules les captures de directs sont rattachees au compte et conservees
temporairement sur le serveur ; cela ne constitue pas une bibliotheque cloud.

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
