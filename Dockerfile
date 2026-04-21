FROM nginx:alpine

# Copier les fichiers statiques de l'application
COPY index.html /usr/share/nginx/html/
COPY manifest.json /usr/share/nginx/html/
COPY sw.js /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY icons/ /usr/share/nginx/html/icons/

# Créer le dossier playlists qui servira de point de montage pour le volume externe
RUN mkdir -p /usr/share/nginx/html/playlists

# On copie par défaut le contenu de playlists au cas où le conteneur est lancé sans volume, 
# mais le volume externe prendra le dessus s'il est monté.
COPY playlists/ /usr/share/nginx/html/playlists/

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]