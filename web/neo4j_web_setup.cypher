// Ejecutar en Neo4j Browser conectado como neo4j (admin).
// Neo4j Community Edition no soporta GRANT ROLE: no existen roles y todos los usuarios
// tienen privilegios implícitos de administrador. Por eso NO incluimos esa línea.
// El usuario webreader se usa solo para la demo local de la web.
CREATE USER webreader IF NOT EXISTS SET PASSWORD 'clave123' CHANGE NOT REQUIRED;

// En Enterprise se podría agregar: GRANT ROLE reader TO webreader;
// Verificación opcional:
// SHOW USERS;
