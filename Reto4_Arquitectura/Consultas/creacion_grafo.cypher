// 1. Limpiar la base de datos
MATCH (n) DETACH DELETE n;

// 2. Crear índices para acelerar la carga
CREATE CONSTRAINT usuario_id_unique FOR (u:Usuario) REQUIRE u.id IS UNIQUE;
CREATE CONSTRAINT tema_nombre_unique FOR (t:Tema) REQUIRE t.nombre IS UNIQUE;

// 3. Cargar Nodos de Usuario
LOAD CSV WITH HEADERS FROM 'file:///datos_reto4.csv' AS row
MERGE (u:Usuario {id: row.userid})
SET u.seguidores = toInteger(row.follower_count),
    u.ratio_retuit = toFloat(row.retweet_ratio);

// 4. Cargar Temas y Relaciones (Método Masivo)
LOAD CSV WITH HEADERS FROM 'file:///datos_reto4.csv' AS row
CALL (row) {
  MATCH (u:Usuario {id: row.userid})
  WITH u, split(replace(replace(replace(row.tweet_BoW, '[', ''), ']', ''), "'", ''), ',') AS temas
  UNWIND temas AS tema
  WITH u, trim(toLower(tema)) AS nombre_tema
  WHERE nombre_tema <> ''
  MERGE (t:Tema {nombre: nombre_tema})
  CREATE (u)-[:HABLA_DE]->(t)
} IN TRANSACTIONS OF 10000 ROWS;