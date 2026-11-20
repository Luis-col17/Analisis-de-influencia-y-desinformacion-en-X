# Análisis de influencia y desinformación en X

## Descripción del problema

El objetivo es analizar interacciones de Twitter/X para estudiar la influencia de los usuarios y la aparición de comunidades temáticas que pueden estar asociadas a campañas de desinformación. El trabajo cubre tres preguntas: cómo evoluciona el volumen de tuits en el tiempo, qué usuarios concentran más influencia y qué temas se agrupan entre sí.

Los datos originales provienen de [Twitter Information Operations Classification](https://www.kaggle.com/datasets/pookiewiggington/twitter-information-operations-classification) de Kaggle. De ese dataset se derivaron los CSV hasheados guardados en `Datos originales/` (`all_tweets_hashed.csv` y `all_users_hashed.csv`), que alimentan todo el pipeline.

El resultado final es una web local con dos paneles independientes:

| Panel | Fuente | Endpoint |
|---|---|---|
| Evolución temporal | S3/Athena | CSV público en S3 |
| Grafo de influencia | Neo4j | API HTTP `127.0.0.1:7474` |

Cada panel se carga por separado: si una API falla, la otra sigue funcionando. El panel de evolución toma los datos directamente de S3/Athena y usa `evolucion.js` solo como copia local de respaldo, sin modificaciones.

## Arquitectura y estructura

### Arquitectura

1. **Spark (Databricks)**: limpieza de 1.000.000 de tuits y JOIN con métricas de usuarios.
2. **Amazon S3**: almacenamiento del Data Lake en formato Parquet (8,9 GB).
3. **Neo4j (Docker)**: construcción del grafo `Usuario –[:HABLA_DE]–> Tema`, con 267.074 nodos y 6.893.163 relaciones (409 `Usuario` y 266.665 `Tema`).
4. **Amazon Athena**: análisis de la evolución temporal consultando los datos en S3. El resultado se guardó como CSV en el mismo bucket y es lo que consume la web.

### Estructura del proyecto

```text
.
├── Datos originales/            CSV derivados del dataset de Kaggle, hasheados
├── Datos procesados/            muestra y Parquet resultante
├── Procesamiento/               PySpark y notebooks de limpieza
├── Reto4_Arquitectura/
│   ├── Consultas/               creacion_grafo.cypher y analisis.cypher
│   ├── datos/                   CSV que Neo4j monta como /var/lib/neo4j/import
│   ├── docker-compose.yml       Neo4j + plugins GDS y APOC
│   └── .env.example             variables de conexión de ejemplo
└── web/
    ├── index.html               paneles, filtro de años y selector de consultas
    ├── config.js                URLs, credenciales demo y consultas Cypher
    ├── app.js                   lógica S3, Neo4j, slider y render
    ├── styles.css               estilos, incluido el rango doble de años
    ├── evolución.js             copia local de respaldo (no modificada)
    ├── neo4j_web_setup.cypher   creación del usuario web
    └── s3-cors.json             CORS de S3 en formato consola
```

## Requisitos

- Docker y Docker Compose.
- Neo4j (se levanta con el `docker-compose.yml`).
- Databricks para el procesamiento de Spark.
- Cuenta de AWS con permisos para S3 y Athena.
- Python para servir la carpeta `web/` en local.

## Pasos de instalación

### 1. Levantar Neo4j

Desde la raíz del repo:

```powershell
cd "ruta/del/repositorio"
docker compose -f Reto4_Arquitectura\docker-compose.yml up -d --force-recreate neo4j
```

Verificar que el puerto HTTP esté disponible:

```powershell
Test-NetConnection -ComputerName 127.0.0.1 -Port 7474
```

Debe dar `TcpTestSucceeded : True`. Ingresar a `http://localhost:7474` con usuario `neo4j` y password `password123`.

El compose usa `neo4j:latest`, publica `7474` y `7687`, monta `datos` en `/var/lib/neo4j/import` y habilita los plugins `graph-data-science` y `apoc` con procedimientos `gds.*` y `apoc.*` sin restricciones.

### 2. Crear el usuario web

Ejecutar `web/neo4j_web_setup.cypher` en Neo4j Browser como `neo4j/password123`:

```cypher
CREATE USER webreader IF NOT EXISTS SET PASSWORD 'clave123' CHANGE NOT REQUIRED;
```

La edición Community no tiene roles: **no ejecutar `GRANT ROLE`**. `webreader/clave123` existe solo para la demo local; no subir estas credenciales a Internet.

No hace falta configurar CORS en Neo4j: envía `Access-Control-Allow-Origin: *` por defecto mediante `dbms.security.http_access_control_allow_origin`. El `docker-compose.yml` no debe incluir `NEO4J_server_http_allowed_origins` porque es un setting inválido que apaga el contenedor.

`config.js` usa `http://127.0.0.1:7474/db/neo4j/tx/commit` en vez de `localhost` porque en esta máquina `localhost` resolvía a IPv6 `::1` y Docker publica Neo4j en IPv4, lo que causaba `ERR_CONNECTION_REFUSED`.

### 3. Configurar S3

CSV publicado en:

```text
s3://taller-parcial-bd-resultados/athena-results/Unsaved/2026/11/19/2d93159c-ae03-486a-ad9a-358090357747.csv
```

URL configurada en `config.js`:

```text
https://taller-parcial-bd-resultados.s3.us-east-2.amazonaws.com/athena-results/Unsaved/2026/11/19/2d93159c-ae03-486a-ad9a-358090357747.csv
```

No hace falta renombrarlo a `evolucion.csv`: el parser reconoce las columnas reales `mes,tuits,usuarios,retuits,pct_retuits`.

Bucket policy solo para el objeto `.csv`, sin ACLs:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "LecturaPublicaCSVAthena",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::taller-parcial-bd-resultados/athena-results/Unsaved/2026/11/19/2d93159c-ae03-486a-ad9a-358090357747.csv"
    }
  ]
}
```

En *Block public access* se desmarcaron las dos opciones de políticas; las de ACL pueden quedar activas porque el bucket tiene ACLs desactivadas.

CORS desde la consola web: pegar el contenido de `web/s3-cors.json` (un array):

```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": []
  }
]
```

CORS desde AWS CLI / CloudShell, con `CORSRules`:

```bash
aws s3api put-bucket-cors \
  --bucket taller-parcial-bd-resultados \
  --region us-east-2 \
  --cors-configuration '{"CORSRules":[{"AllowedHeaders":["*"],"AllowedMethods":["GET"],"AllowedOrigins":["*"],"ExposeHeaders":[]}]}'
`

`web/s3-cors.json` está en formato consola; usarlo tal cual solo en la consola.

## Pasos de ejecución

### 1. Cargar el grafo en Neo4j

El CSV `datos_reto4.csv` ya está en `datos/`. Si querés copiarlo vos:

```powershell
Copy-Item Reto4_Arquitectura\datos_reto4.csv Reto4_Arquitectura\datos\datos_reto4.csv
```

También podés copiarlo directo al contenedor:

```powershell
docker cp Reto4_Arquitectura\datos_reto4.csv neo4j-reto4:/var/lib/neo4j/import/
```

Ejecutar en Neo4j Browser, en este orden:

1. `Reto4_Arquitectura/Consultas/creacion_grafo.cypher`
2. `Reto4_Arquitectura/Consultas/analisis.cypher`

`analisis.cypher` incluye la proyección GDS que necesitan PageRank y Louvain:

```cypher
CALL gds.graph.project('grafo-completo', ['Usuario', 'Tema'], ['HABLA_DE']);
```

Si el contenedor se reinicia, la proyección en memoria se pierde; la web la vuelve a crear automáticamente cuando corresponde la consulta de comunidades.

### 2. Ejecutar el análisis temporal en Athena

La consulta de Athena produce el CSV con la evolución mensual: 147 meses, de `2008-10` a `2020-12`, con 1.000.000 de tuits. El resultado ya está publicado en la URL de S3 indicada arriba, así que la web no necesita ejecutar Athena en cada carga.

### 3. Levantar la web

```powershell
cd "./web"
python -m http.server 8000
```

Abrir `http://127.0.0.1:8000`. Estados esperados:

- Evolución: `147 meses · 2008–2020 · S3/Athena`
- Grafo: `N filas · Neo4j`

Chart.js y vis-network vienen por CDN; si no hay Internet, las tablas igual funcionan.

### 4. Usar los filtros y las comunidades

El deslizador doble **Desde / Hasta** filtra años sin volver a consultar S3: recalcula KPIs, gráfico y tabla con los meses del rango. **Ver todos** restaura el período completo. Para forzar otra URL sin editar archivos:

```text
index.html?s3=https://.../evolucion.csv
```

En el selector **Consulta Cypher** está la opción **Louvain · comunidades por tema**, que agrupa temas mencionados por los mismos usuarios:

```cypher
CALL gds.louvain.stream('grafo-completo')
YIELD nodeId, communityId
WITH communityId, gds.util.asNode(nodeId) AS nodo
WHERE nodo:Tema
WITH communityId, collect(nodo.nombre) AS temas_comunidad, count(nodo) AS cantidad_temas
RETURN communityId AS comunidad, cantidad_temas, temas_comunidad[0..5] AS ejemplos
ORDER BY cantidad_temas DESC
LIMIT $limit;
```

`LIMIT $limit` respeta el campo **Límite** de la web. En la tabla, **Comunidad** es un ID interno de GDS (no secuencial), **Temas en comunidad** es la cantidad de nodos `Tema` del cluster y **Ejemplos de temas** son los primeros 5 nombres. Los resultados pueden variar entre ejecuciones porque Louvain usa aleatoriedad.

## Integrantes

David Santiago Agudelo Gonzalez 
Luis Manuel Osorio Saenz
