// 1. Proyectar el grafo
CALL gds.graph.project('grafo-completo', ['Usuario', 'Tema'], ['HABLA_DE']);

// 2. PageRank
CALL gds.pageRank.stream('grafo-completo')
YIELD nodeId, score
WITH gds.util.asNode(nodeId) AS nodo, score
WHERE nodo:Usuario
RETURN nodo.id AS Usuario, score
ORDER BY score DESC LIMIT 5;

// 3. Louvain (Comunidades)
CALL gds.louvain.stream('grafo-completo')
YIELD nodeId, communityId
WITH communityId, gds.util.asNode(nodeId) AS nodo
WHERE nodo:Tema
WITH communityId, collect(nodo.nombre) AS temas_comunidad, count(nodo) AS cantidad_temas
RETURN communityId AS ID_Comunidad, cantidad_temas, temas_comunidad[0..5] AS Ejemplos_de_Temas
ORDER BY cantidad_temas DESC LIMIT 5;

// 4. Nodos Puente (Degree Centrality como alternativa)
MATCH (u:Usuario)-[r:HABLA_DE]->(t:Tema)
RETURN u.id AS Usuario, count(t) AS Temas_Difundidos
ORDER BY Temas_Difundidos DESC LIMIT 10;