# Образ фронтенду StudySwap: статичні файли (без збірки) віддає Nginx.

# Середовище: веб-сервер Nginx
FROM nginx:1.27-alpine

# Код: index.html, app.js, lib/, styles.css — у теку, яку Nginx віддає за замовчуванням
# (що не копіювати — див. .dockerignore)
COPY . /usr/share/nginx/html

EXPOSE 80
