/*
 * Configuración de la web.
 *
 * API 1 (S3/Athena):
 *   URL real del CSV de evolución ya cargada en S3_EVOLUCION_URL.
 *   También podés pasarla por URL: index.html?s3=https://.../evolucion.csv
 *   Si la dejás vacía, se usa web/evolucion.js (copia local de respaldo).
 *
 * API 2 (Neo4j):
 *   Usar el usuario webreader, nunca neo4j/password123.
 *   NEO4J_URL usa 127.0.0.1 para forzar IPv4 (localhost puede resolver a ::1).
 *   Neo4j Community no tiene roles: todos los usuarios tienen privilegios de administrador.
 *   Por eso estas credenciales son solo para demo local; no publicarlas en Internet.
 *   Ver neo4j_web_setup.cypher para crearlo.
 */
window.WEB_CONFIG = {
  S3_EVOLUCION_URL: "https://taller-parcial-bd-resultados.s3.us-east-2.amazonaws.com/athena-results/Unsaved/2026/11/19/2d93159c-ae03-486a-ad9a-358090357747.csv",

  NEO4J_URL: "http://127.0.0.1:7474/db/neo4j/tx/commit",
  NEO4J_USER: "webreader",
  NEO4J_PASSWORD: "clave123",
  NEO4J_LIMIT: 20,

  CONSULTAS: {
    relaciones: {
      etiqueta: "Relaciones usuario → tema",
      columnas: ["usuario", "seguidores", "tema", "peso"],
      cypher: `MATCH (u:Usuario)-[r:HABLA_DE]->(t:Tema)
RETURN u.id AS usuario, u.seguidores AS seguidores, t.nombre AS tema, count(r) AS peso
ORDER BY peso DESC
LIMIT $limit`
    },

    top_usuarios: {
      etiqueta: "Usuarios con más temas",
      columnas: ["usuario", "seguidores", "temas"],
      cypher: `MATCH (u:Usuario)-[r:HABLA_DE]->(t:Tema)
RETURN u.id AS usuario, u.seguidores AS seguidores, count(DISTINCT t) AS temas
ORDER BY temas DESC
LIMIT $limit`
    },

    top_temas: {
      etiqueta: "Temas más usados",
      columnas: ["tema", "usos"],
      cypher: `MATCH (t:Tema)<-[r:HABLA_DE]-(:Usuario)
RETURN t.nombre AS tema, count(r) AS usos
ORDER BY usos DESC
LIMIT $limit`
    },

    comunidades: {
      etiqueta: "Louvain · comunidades por tema",
      columnas: ["comunidad", "cantidad_temas", "ejemplos"],
      cypher: `CALL gds.louvain.stream('grafo-completo')
YIELD nodeId, communityId
WITH communityId, gds.util.asNode(nodeId) AS nodo
WHERE nodo:Tema
WITH communityId, collect(nodo.nombre) AS temas_comunidad, count(nodo) AS cantidad_temas
RETURN communityId AS comunidad, cantidad_temas, temas_comunidad[0..5] AS ejemplos
ORDER BY cantidad_temas DESC
LIMIT $limit`
    },

    resumen: {
      etiqueta: "Resumen del grafo",
      columnas: ["usuarios", "temas", "relaciones"],
      cypher: `MATCH (u:Usuario)
WITH count(u) AS usuarios
MATCH (t:Tema)
WITH usuarios, count(t) AS temas
MATCH ()-[r:HABLA_DE]->()
RETURN usuarios, temas, count(r) AS relaciones`
    }
  }
};
