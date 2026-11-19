# Reto 4: Análisis de Influencia y Desinformación en Redes Sociales

## 📌 Descripción
Este proyecto implementa una arquitectura de datos masivos para analizar interacciones de Twitter/X, identificar comunidades temáticas y calcular la influencia de los usuarios mediante teoría de grafos.

## 🏗️ Arquitectura
1. **Spark (Databricks)**: Limpieza de 1,000,000 de tuits y JOIN con métricas de usuarios.
2. **Amazon S3**: Almacenamiento del Data Lake en formato Parquet (8.9 GB).
3. **Neo4j (Docker)**: Construcción del grafo de co-ocurrencia de temas. 267,074 nodos y 6,893,163 relaciones.
4. **BigQuery**: Análisis de la evolución temporal de los tuits.

## 🚀 Requisitos
- Docker y Docker Compose
- Neo4j (se levanta con el `docker-compose.yml`)
- Databricks (para el procesamiento de Spark)
- Cuenta en Google Cloud (para BigQuery)

## 📂 Estructura del Proyecto
- `docker-compose.yml`: Configuración de Neo4j con el plugin GDS.
- `procesamiento/`: Código de PySpark para limpieza y JOIN.
- `consultas/`: Archivos `.cypher` con las consultas de creación y análisis del grafo.
- `diagramas/`: Diagrama de arquitectura.

## 🛠️ Pasos de Ejecución
1. Levantar Neo4j: `docker-compose up -d`
2. Copiar el CSV a la carpeta import: `docker cp datos_reto4.csv neo4j-reto4:var/lib/neo4j/import/`
3. Ejecutar los scripts de `consultas/creacion_grafo.cypher` en Neo4j.
4. Ejecutar los scripts de `consultas/analisis.cypher` para obtener los resultados.
5. Para el análisis temporal, subir el Parquet a BigQuery y ejecutar las consultas SQL.

## 👥 Integrantes
- David Santiago Agudelo Gonzalez
- Luis Manuel Osorio Saenz
