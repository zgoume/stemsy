# Stemsy : Infrastructure & Middleware

## Architecture
- **Infra** : Conteneurisation (Docker).
- **Config** : Docker Compose avec montage de volume externe.
- **Cible** : Serveur web Nginx léger (Alpine) servant une PWA (Progressive Web App) statique.

## Pré-requis
- Docker
- Docker Compose

## Structure du Projet
```bash
.
├── css/                  # Feuilles de style (Tailwind CDN utilisé en dev)
├── icons/                # Icônes et SVG de l'application
├── js/                   # Logique d'application Vue 3 et moteur Web Audio API
├── playlists/            # Dossier monté en volume externe (contenant les fichiers .json et les .wav/.mp3)
├── index.html            # Point d'entrée PWA
├── manifest.json         # Manifeste PWA
├── sw.js                 # Service Worker
├── Dockerfile            # Instructions de conteneurisation Nginx
└── docker-compose.yml    # Configuration et orchestration des conteneurs
```

## Guide de démarrage rapide

- **Étape 1 : Build**
  Construisez l'image Docker de l'application :
  ```bash
  docker-compose build
  ```

- **Étape 2 : Lancement (Run)**
  Démarrez le conteneur en tâche de fond :
  ```bash
  docker-compose up -d
  ```
  L'application sera alors accessible sur `http://localhost:8000`.

## Variables principales

| Outil          | Variable / Option | Description                                      | Défaut |
|----------------|-------------------|--------------------------------------------------|--------|
| Docker Compose | `ports`           | Port d'écoute exposé sur l'hôte vers le port 80  | `8000` |
| Docker Compose | `volumes`         | Montage du dossier local `playlists` dans Nginx  | `./playlists:/usr/share/nginx/html/playlists` |

## Gestion des Secrets
Aucun secret (mot de passe ou token) n'est nécessaire pour le fonctionnement de cette application statique.

## Maintenance

- **Accéder aux logs** :
  ```bash
  docker-compose logs -f
  ```
- **Modifier les fichiers audio (Volume Externe)** :
  Ajoutez ou modifiez les fichiers `.json` et `.wav` directement dans le répertoire local `./playlists/`. Grâce au volume monté, ces modifications sont immédiatement répercutées dans l'application sans nécessiter de redémarrage du conteneur.
- **Arrêter et détruire l'environnement (Destroy)** :
  ```bash
  docker-compose down
  ```
