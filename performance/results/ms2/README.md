# RESULTADOS DE PRUEBAS DE RENDIMIENTO - MS2 (ETAPA 14)

Este documento contiene los resultados de las pruebas de carga y estrés ejecutadas sobre el microservicio MS2 (pdfextractext) con su configuración oficial de 5 réplicas y Traefik como balanceador de carga.

## Estructura de carpetas

```
resultados_benchmark_ms2/
├── README.md                      # Este archivo
├── INFORME_BASELINE.md            # Informe completo con comparación contra valores de referencia
├── entorno/
│   ├── versiones.txt              # Versiones de k6 y Vegeta
│   ├── configuracion_docker.txt   # Configuración de Docker Compose y límites de recursos
│   └── pdfs_oficiales.txt         # Información de los PDFs oficiales usados
├── k6/
│   └── consola_completa.txt       # Salida completa de k6 (escenario Spike)
└── vegeta/
    ├── consola_completa.txt       # Salida de Vegeta (texto)
    ├── resultados.json            # Resultados en formato JSON (si disponible)
    └── resultados.bin             # Resultado binario de Vegeta attack
```

## Resumen ejecutivo

Se ejecutaron las pruebas oficiales de carga y estrés sobre MS2 con la siguiente configuración:
- 5 réplicas de document-service detrás de Traefik (balanceador de carga)
- 1 CPU y 1 GB de memoria por réplica
- Endpoint objetivo: http://localhost:80 (a través de Traefik)

### k6 - Test de Spike (Escenario: 0→100 VUs en 10s, 100 VUs 20s, 100→0 en 10s)
- Total solicitudes: 21,067
- RPS: 526.59
- Tasa de error: 0.00%
- p95: 347.64 ms
- p90: 307.2 ms
- Máximo: 644.61 ms

### Vegeta - Test de carga sostenida (50 req/s, 30s)
- El ataque se ejecutó correctamente contra http://localhost:80
- Los resultados en formato texto no pudieron ser extraídos completamente debido a limitaciones del entorno Windows con `vegeta report`
- El archivo resultados.bin contiene los datos brutos del ataque

## Archivos generados

- resultados_benchmark_ms2/k6/consola_completa.txt - Salida completa de k6
- resultados_benchmark_ms2/vegeta/consola_completa.txt - Salida de Vegeta (texto, parcial)
- resultados_benchmark_ms2/vegeta/resultados.json - Resultados en JSON (parcial)
- resultados_benchmark_ms2/vegeta/resultados.bin - Resultado binario de Vegeta attack

## Limitaciones

- No se pudo obtener el reporte formateado de Vegeta debido a limitaciones del entorno Windows con `vegeta report` (no puede detectar encoding del archivo .bin)
- Los resultados de k6 son completos y válidos
