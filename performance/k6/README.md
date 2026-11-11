# Pruebas de rendimiento con k6 — MS1/MS2/MS3

Esta carpeta contiene scripts de **Grafana k6** para evaluar el rendimiento de la
integración completa a través de MS1 (API Gateway), publicado en:

```
http://localhost:8003
```

## Estructura

```
performance/k6/
├── README.md
├── results/                # Carpeta para salidas de k6 (vacía inicialmente)
├── fixtures/               # PDFs válidos de referencia (no usados directamente por los scripts)
│   ├── small_1p.pdf        # ~1 KB (1 página)
│   ├── medium_3p.pdf       # ~50 KB (3 páginas)
│   └── medium_100p.pdf     # ~541 KB (100 páginas)
├── healthcheck.js          # Escenario 1: GET /health (MS1)
├── list_documents.js       # Escenario 2: GET /documents (MS1 -> MS3)
├── get_document_by_id.js   # Escenario 3: POST + GET /documents/{id} (MS1 -> MS3)
├── upload_small_pdf.js     # Escenario 4: POST /documents/ (PDF pequeño, inline)
├── upload_medium_pdf.js    # Escenario 5: POST /documents/ (PDF mediano, inline)
├── mixed_read_concurrency.js # Escenario 7: lecturas mixtas GET /documents + GET /documents/{id}
├── crud_cycle.js           # Escenario 8: POST -> PATCH -> DELETE (documentos propios)
└── stress_progressive.js   # Estrés progresivo de lecturas (10 → 25 → 50 VUs)
```

## Requisitos

- **k6 v2.2.0** instalado (verificar con `k6 version`).
- Los tres servicios en ejecución mediante Docker Compose:
  `docker compose -f docker-compose.integration.yml up -d`
- MS1 accesible en `http://localhost:8003`.

## Variables de entorno

Todos los scripts aceptan `BASE_URL` para cambiar el objetivo:

```powershell
k6 run -e BASE_URL=http://localhost:8003 healthcheck.js
```

Por defecto, `BASE_URL = http://localhost:8003`.

### RUN_ID (obligatorio para scripts de escritura)

Los scripts que crean documentos requieren `RUN_ID`, un identificador único por ejecución que se incluye en el contenido de cada PDF para evitar duplicados de checksum entre ejecuciones:

```powershell
k6 run -e BASE_URL=http://localhost:8003 -e RUN_ID=mi-ejecucion-1 upload_small_pdf.js
```

Si no se proporciona `RUN_ID`, k6 genera uno automáticamente con `crypto.randomUUID()`. El valor usado se registra en la consola y en el resumen final (`teardown`).

**Ejemplos:**

```powershell
# Con RUN_ID explícito (recomendado para reproducibilidad)
k6 run -e BASE_URL=http://localhost:8003 -e RUN_ID=run-2026-11-09-01 -e ITERATIONS=5 upload_small_pdf.js

# Con RUN_ID autogenerado
k6 run -e BASE_URL=http://localhost:8003 -e ITERATIONS=3 crud_cycle.js
```

Si se proporciona `RUN_ID` vacío, el escenario se detiene con un error claro.

## Ejemplos de ejecución (documentados, no ejecutar aún)

```powershell
# Baseline: 1 VU, healthcheck
k6 run -e BASE_URL=http://localhost:8003 healthcheck.js

# Baseline: 1 VU, listado de documentos, 30 segundos
k6 run -e BASE_URL=http://localhost:8003 -e VUS=1 -e DURATION=30s list_documents.js

# Subida de PDF pequeño (controlado, 5 iteraciones máx.)
k6 run -e BASE_URL=http://localhost:8003 -e ITERATIONS=5 upload_small_pdf.js

# Ciclo CRUD controlado (3 iteraciones máx.)
k6 run -e BASE_URL=http://localhost:8003 -e ITERATIONS=3 crud_cycle.js

# Estrés progresivo de lecturas (10 → 25 → 50 VUs, 30s por etapa)
k6 run -e BASE_URL=http://localhost:8003 stress_progressive.js

# Estrés progresivo con etapas personalizadas
k6 run -e BASE_URL=http://localhost:8003 -e VUS_STAGE_1=10 -e DURATION_STAGE_1=20s -e VUS_STAGE_2=25 -e DURATION_STAGE_2=20s -e VUS_STAGE_3=50 -e DURATION_STAGE_3=20s stress_progressive.js
```

## Valores predeterminados (primera baseline)

| Script | VUs | Duración | Iteraciones máx. | Documentos máx. creados |
|--------|-----|----------|------------------|-------------------------|
| healthcheck.js | 1 | 30s | — | 0 |
| list_documents.js | 1 | 30s | — | 0 |
| get_document_by_id.js | 1 | 60s | 5 | 5 |
| upload_small_pdf.js | 1 | 60s | 5 | 5 |
| upload_medium_pdf.js | 1 | 60s | 3 | 3 |
| mixed_read_concurrency.js | 1 | 30s | 1 por VU | 1 por VU |
| crud_cycle.js | 1 | 120s | 3 | 3 (y eliminados) |
| stress_progressive.js | 10 → 25 → 50 | 30s por etapa | — | 0 (solo lecturas) |

Todos los valores pueden sobrescribirse con variables de entorno (`VUS`, `DURATION`, `ITERATIONS`).

## Precauciones importantes (leer antes de ejecutar)

1. **Cada `POST /documents/` crea un documento persistente en MongoDB.** No repetir
   el mismo PDF esperando respuestas `201` (el índice `checksum_unique` rechaza
   duplicados con HTTP 400). Los scripts agregan padding único por iteración para
   evitar checksums repetidos.
2. **No usar documentos preexistentes de MongoDB** como objetivo de PATCH/DELETE.
   Los scripts crean sus propios documentos y solo actúan sobre ellos.
3. **No ejecutar k6 y Vegeta simultáneamente.**
4. **Verificar salud antes y después de cada prueba:** `GET /health` en MS1, MS3 y MS2.
5. **No eliminar datos ni volúmenes de MongoDB.**
6. **Vegeta NO está instalado** en este entorno. Solo está disponible k6.

## PDFs inline y fixtures

Los scripts de escritura generan el PDF **inline** dentro del código JavaScript
(firma `%PDF-1.4` válida, aceptada por PyMuPDF). No dependen de que k6 lea
archivos externos mediante `open()` (en esta versión de k6 sobre Windows, `open()`
no resuelve correctamente rutas relativas a fixtures).

Los archivos en `fixtures/` son de referencia y no son leídos directamente por
los scripts actuales.

## Diferencia: MS2 directo vs integración completa

- **MS2 directo:** `POST http://localhost:8002/extract` (solo extracción, sin MongoDB).
- **Integración completa:** `POST http://localhost:8003/documents/` (MS1 → MS3 → MS2,
  con persistencia en MongoDB). Los scripts de esta carpeta prueban la integración
  completa a través de MS1.

## Métricas recogidas por k6

- `http_reqs` — número de solicitudes (RPS)
- `http_req_duration` — latencia (promedio, p50, p90, p95, p99)
- `http_req_failed` — tasa de errores HTTP
- `checks` — resultado de las aserciones de contrato
- Códigos HTTP devueltos (200, 201, 204, 400, 404, 413, 500, 502, 504)

Para métricas de infraestructura (CPU, memoria por contenedor) usar
`docker stats --no-stream` en una terminal separada durante la ejecución.

## Estrés progresivo (stress_progressive.js)

El script `stress_progressive.js` ejecuta una carga gradual de lecturas sobre MS1
en tres etapas:

| Etapa | VUs | Duración predeterminada | Operación |
|-------|-----|------------------------|-----------|
| 1 | 10 | 30s | 70% GET /health, 30% GET /documents |
| 2 | 25 | 30s | 70% GET /health, 30% GET /documents |
| 3 | 50 | 30s | 70% GET /health, 30% GET /documents |

Todas las operaciones son de lectura; no se crean, modifican ni eliminan documentos.
Los VUs y duraciones de cada etapa son configurables mediante variables de entorno
(`VUS_STAGE_1`, `DURATION_STAGE_1`, `VUS_STAGE_2`, `DURATION_STAGE_2`, `VUS_STAGE_3`, `DURATION_STAGE_3`).

## Umbrales

Los umbrales definidos en cada script son **referencias provisionales**, no
objetivos de rendimiento definitivos. Se ajustarán una vez obtenida la baseline
inicial (Etapa 11.2.2).