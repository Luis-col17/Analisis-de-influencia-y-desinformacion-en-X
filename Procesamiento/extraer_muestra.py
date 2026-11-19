import csv

# ¡CAMBIA ESTAS RUTAS POR LAS TUYAS!
# Usa barras normales (/) o dobles barras (\\) en Windows
archivo_origen = "E:/twitter datase/all_tweets_hashed.csv" 
archivo_destino = "E:/twitter datase/muestra_tweets.csv"

# Cantidad de filas que queremos extraer
filas_a_extraer = 1_000_000

print("Iniciando extracción...")

with open(archivo_origen, mode='r', encoding='utf-8') as f_in, \
     open(archivo_destino, mode='w', encoding='utf-8', newline='') as f_out:
    
    lector = csv.reader(f_in)
    escritor = csv.writer(f_out)
    
    # Escribir el encabezado
    encabezado = next(lector)
    escritor.writerow(encabezado)
    
    # Escribir el millón de filas
    for i, fila in enumerate(lector):
        if i < filas_a_extraer:
            escritor.writerow(fila)
        else:
            break # Se detiene al llegar al millón

print(f"¡Listo! Muestra guardada en: {archivo_destino}")