SafeSeas backend

Quick start (preferred: Docker + MySQL)

1) Start a MySQL container:

   docker run --name safeseas-mysql -e MYSQL_ROOT_PASSWORD=secret -e MYSQL_DATABASE=safeseas -p 3306:3306 -d mysql:8

2) Apply schema (after container is healthy):

   docker exec -i safeseas-mysql sh -c 'mysql -uroot -p"secret" safeseas' < schema.sql

3) Start server:

   npm install
   npm start

Notes:
- If a MySQL instance is not available, the server will fall back to a JSON file store at `server/data.json`.
- API endpoints:
  - `GET /api/boats`
  - `GET /api/trips`
  - `POST /api/trips` (body: { name, notes })
