⚠️ **ADVERTENCIA: Copia histórica obsoleta.** Este archivo es una copia divergente y desactualizada de `ETAPA_11_2_2_9_PLANIFICACION_RENDIMIENTO.md`. El documento vigente se encuentra en la raíz de `Integracion/` (`C:\Users\marsi\OneDrive\Documents\Integracion\ETAPA_11_2_2_9_PLANIFICACION_RENDIMIENTO.md`). No sincronizar el contenido de esta copia con el documento principal.

---

# ETAPA 11.2.2.9 — PLANIFICACIÓN DE PRUEBAS DE RENDIMIENTO (k6 + Vegeta)

**Proyecto:** Integración MS1 + MS2 + MS3 (gestión y extracción de documentos PDF)  
**Ruta raíz de integración:** `C:\Users\marsi\OneDrive\Documents\Integracion\`  
**Fecha:** 10/11/2026  
**Estado:** PLANIFICACIÓN — sin ejecución de pruebas de rendimiento  
**Etapa previa:** 11.2.2.8 (corrección de executors en pruebas k6 completada)  
**Scripts de referencia:** `performance/k6/` (Grafana k6 v2.2.0)  

---

## 1. RESUMEN EJECUTIVO

Esta etapa prepara el plan concreto de pruebas de rendimiento de la integración MS1 + MS2 + MS3, utilizando **Grafana k6** y documentando **Vegeta** como herramienta no disponible en este entorno.

**Hallazgos clave:**
- **k6 v2.2.0** está instalado y disponible en el entorno (Windows/PowerShell).
- **Vegeta NO está instalado**; no se puede ejecutar sin instalarlo, lo cual está prohibido en esta etapa (no modificar el entorno). Las pruebas con Vegeta quedan documentadas como plan pendiente para una etapa futura donde se autorice su instalación, o bien se podrá ejecutar desde un contenedor Docker `tsenart/vegeta` si se dispone de la imagen.
- **MS2 ya cuenta con materiales de pruebas de estrés preexistentes** en `pdfextractext/tests/stress/` (scripts k6, Vegeta, fixtures PDF, targets). Esos materiales apuntan a MS2 directo (`POST /extract`), no al flujo completo vía MS1.
- Existe una **baseline inicial de lectura obtenida en la etapa 11.2.2** (ver sección 12).
- No se ejecutaron pruebas de rendimiento en esta etapa. Este informe solo planifica.

---

## 2. ESTADO ACTUAL DE LOS TRES MICROSERVICIOS

### MS1 — `pdfapigateway` (API Gateway)

| Aspecto | Detalle |
|---------|---------|
| Rol | Punto de entrada único; proxy transparente hacia MS3 |
| Base de datos | Ninguna (no accede a MongoDB ni a MS2 directamente) |
| Endpoints | `GET /`, `GET /health`, `POST /documents/`, `GET /documents`, `GET /documents/{id}`, `PATCH /documents/{id}`, `DELETE /documents/{id}` |
| Comunicación con MS3 | `httpx.AsyncClient` reutilizable, `base_url=MS3_URL`, `timeout=MS3_TIMEOUT` |
| `MS3_URL` (local) | `http://localhost:8001` |
| `MS3_URL` (Docker) | `http://crud-service:8000` |
| `MS3_TIMEOUT` | 40 s |
| Puerto interno | 8000 |
| Puerto publicado (host) | 8003 |
| Healthcheck | `GET /health` → `{"status":"ok","service":"ms1-gateway"}` (liveness básico, no verifica dependencias) |
| Manejo de errores | Propaga 4xx/5xx de MS3; `ConnectError` → HTTP 502; `TimeoutException` → HTTP 504 |
| Cabeceras | Elimina cabeceras hop-by-hop (RFC 7230) al reenviar |

### MS2 — `pdfextractext` (Extracción de texto PDF)

| Aspecto | Detalle |
|---------|---------|
| Rol | Extracción de texto de PDF; stateless, sin MongoDB |
| Endpoint principal | `POST /extract` (raíz, sin prefijo) |
| Formatos de entrada | `multipart/form-data` con campo `file`; o bytes raw con `Content-Type: application/pdf` |
| Respuesta de éxito | HTTP 200 `{"content": "<texto>", "page_count": <int>}` |
| Límite de tamaño | `max_file_size_mb` (por defecto 5 MB) |
| Motor de extracción | PyMuPDF (`fitz`), CPU-bound, ejecutado en `run_in_threadpool` |
| Validaciones | Firma magic header `%PDF-`, contenido no vacío, tipo de archivo, tamaño máximo |
| Errores | `InvalidFileTypeError` → 400; `EmptyFileError` → 400; `FileTooLargeError` → 413; `ExtractionError` → 422 |
| Puerto interno | 8000 |
| Puerto publicado (host) | 8002 |
| Healthcheck | `GET /health` → `{"status":"ok"}` |

### MS3 — `pdfcrudservice` (CRUD y persistencia)

| Aspecto | Detalle |
|---------|---------|
| Rol | CRUD de documentos, persistencia en MongoDB, coordinación síncrona con MS2 |
| Base de datos | MongoDB (`pdf_database_dev` por defecto, colección `processed_pdfs`) |
| Endpoints | `POST /documents/`, `GET /documents`, `GET /documents/{id}`, `PATCH /documents/{id}`, `DELETE /documents/{id}` |
| Flujo síncrono | 1) validar archivo; 2) `submit_pdf` (PENDING en MongoDB); 3) `process_pdf_extraction` → llama a MS2; 4) actualizar a COMPLETED o FAILED |
| Índice único | `checksum_unique` sobre campo `checksum` (evita duplicados) |
| Manejo duplicados | `DuplicateKeyError` → `ValueError("El documento ya existe")` → HTTP 400 |
| Estados | PENDING → COMPLETED / FAILED |
| Comunicación con MS2 | `httpx.AsyncClient`, `EXTRACT_SERVICE_URL=http://extract-service:8000` (Docker) / `http://localhost:8002` (local), `EXTRACT_SERVICE_TIMEOUT=30` |
| Puerto interno | 8000 |
| Puerto publicado (host) | 8001 |
| Healthcheck | `GET /health` → `{"status":"ok"}` |
| Índice de inicialización | Se crea en `MongoDB.connect()` vía `_ensure_unique_index_on_checksum()` |

---

## 3. ESTADO ACTUAL DE DOCKER COMPOSE

**Archivo:** `docker-compose.integration.yml` (raíz de `Integracion/`)

### Servicios definidos

| Servicio | Contenedor | Imagen/Build | Puerto interno | Puerto publicado (host) | Redes |
|----------|------------|--------------|----------------|-------------------------|-------|
| `db` (MongoDB) | `integracion_mongo_db` | `mongo:8.0` | 27017 | 27018 | `db_net` |
| `extract-service` (MS2) | `integracion_extract_service` | `./pdfextractext` (Dockerfile) | 8000 | 8002 | `integration_net` |
| `crud-service` (MS3) | `integracion_crud_service` | `./pdfcrudservice` (Dockerfile) | 8000 | 8001 | `integration_net`, `db_net` |
| `gateway-service` (MS1) | `integracion_ms1_gateway` | `./pdfapigateway` (Dockerfile) | 8000 | 8003 | `integration_net` |

### Redes

| Red | Driver | Servicios | Nota |
|-----|--------|-----------|------|
| `integration_net` | bridge | MS1, MS3, MS2 | Comunicación síncrona entre servicios de aplicación |
| `db_net` | bridge (`internal: true`) | MongoDB, MS3 | Solo persistencia; MS1 y MS2 no alcanzan a MongoDB |

### Volúmenes

| Volumen | Usado por | Propósito |
|---------|-----------|-----------|
| `mongo_data` | MongoDB (`db`) | Persistencia de datos (`/data/db`) |

MS1 no declara volumen propio.

### Límites y reservas de CPU y memoria (Compose vigente)

| Servicio | Límite CPU | Límite Memoria | Reserva CPU | Reserva Memoria |
|----------|------------|----------------|-------------|-----------------|
| `db` (MongoDB) | 2 | 1G | 0.5 | 256M |
| `crud-service` (MS3) | 2 | 512M | 0.5 | 128M |
| `extract-service` (MS2) | No declara | No declara | — | — |
| `gateway-service` (MS1) | 1 | 256M | 0.25 | 64M |

**Nota:** MS2 (`extract-service`) no tiene bloque `deploy.resources` en `docker-compose.integration.yml`, por tanto no declara límites ni reservas de CPU/memoria. Esto es relevante para pruebas de rendimiento: MS2 puede consumir recursos sin tope configurado en Compose.

### Variables de entorno relevantes

**MS3 en Compose:**
- `MONGO_URL=mongodb://${MONGO_INITDB_ROOT_USERNAME}:${MONGO_INITDB_ROOT_PASSWORD}@db:27017/?authSource=admin`
- `MONGO_DB_DEV=pdf_database_dev`
- `MONGO_COLLECTION=processed_pdfs`
- `MAX_FILE_SIZE_MB=5`
- `EXTRACT_SERVICE_URL=http://extract-service:8000`
- `EXTRACT_SERVICE_TIMEOUT=30`

**MS1 en Compose:**
- `MS3_URL=http://crud-service:8000`
- `MS3_TIMEOUT=40`
- `APP_PORT=8000`
- `HOST_PORT=8003`
- `LOG_LEVEL=INFO`

### Healthchecks y dependencias

| Servicio | Depende de | Healthcheck | Intervalo | Timeout | Retries | Start period |
|----------|------------|-------------|-----------|---------|---------|--------------|
| `db` | — | `mongosh ping` | 10s | 5s | 5 | 30s |
| `extract-service` | — | `python urllib /health` | 10s | 5s | 5 | 10s |
| `crud-service` | `db` (healthy), `extract-service` (healthy) | `python urllib /health` | 10s | 5s | 5 | 10s |
| `gateway-service` | `crud-service` (healthy) | `python urllib /health` | 10s | 5s | 5 | 10s |

---

## 4. DISPONIBILIDAD DE k6 Y VEGETA

| Herramienta | ¿Instalada? | Versión | Comando de verificación | Comentario |
|-------------|-------------|---------|-------------------------|------------|
| **k6** | ✅ Sí | v2.2.0 | `k6 version` | Disponible nativamente en Windows/PowerShell |
| **Vegeta** | ❌ No | — | `vegeta version` → "no se reconoce como nombre de un cmdlet" | No está instalado ni en el PATH |

**Recomendación:** k6 puede usarse inmediatamente desde el host (Windows/PowerShell) sin instalación adicional. Vegeta no puede usarse sin instalarlo, lo cual está prohibido en esta etapa (no modificar el entorno). Las pruebas con Vegeta quedan documentadas como plan pendiente para una etapa futura donde se autorice su instalación, o bien se podrá ejecutar desde un contenedor Docker `tsenart/vegeta` si se dispone de la imagen.

**Forma recomendada de ejecutar k6 en Windows/PowerShell:**
```powershell
k6 run <archivo_script.js>
k6 run -e BASE_URL=http://localhost:8003 <script.js>
```

---

## 5. ENDPOINTS APTOS PARA PRUEBAS DE RENDIMIENTO

| # | Endpoint | Método | Servicio | Cuerpo / Formato | Apto para k6 | Tipo de prueba | Notas |
|---|----------|--------|----------|------------------|--------------|----------------|-------|
| 1 | `/health` | GET | MS1 | Ninguno | ✅ Sí | Lectura (liveness) | Latencia de gateway; sin persistencia |
| 2 | `/documents` | GET | MS1→MS3 | Ninguno | ✅ Sí | Lectura | Listar documentos (colección MongoDB) |
| 3 | `/documents/{id}` | GET | MS1→MS3 | Ninguno | ✅ Sí | Lectura | Consultar documento existente |
| 4 | `/documents/` | POST | MS1→MS3→MS2 | `multipart/form-data` (campo `file`) o bytes raw `application/pdf` | ✅ Sí | Escritura persistente | Flujo completo: persiste en MongoDB + llama a MS2. Genera documentos nuevos. |
| 5 | `/documents/{id}` | PATCH | MS1→MS3 | JSON (`status`, `content`, `page_count`, `error_message`) | ✅ Sí | Escritura / ciclo CRUD | Actualizar documento existente |
| 6 | `/documents/{id}` | DELETE | MS1→MS3 | Ninguno | ✅ Sí | Escritura / ciclo CRUD | Eliminar documento existente |

**Endpoints de MS2 aptos (si se prueba MS2 de forma aislada, fuera de este plan):**
- `POST /extract` (MS2 directo, puerto 8002): bytes raw o multipart; flujo de extracción sin MongoDB.

**Endpoints con precaución:**
- `POST /documents/` genera documentos persistidos en MongoDB y consume MS2. Cada iteración aumenta el tamaño de la base de datos. Usar PDFs con checksums distintos (diferente `RUN_ID` y padding por iteración) para no activar la lógica de duplicados (HTTP 400). Evitar acumulación innecesaria; limitar número de iteraciones en pruebas de POST.

---

## 6. ALCANCE DE ESTE INFORME Y PRUEBAS EXCLUIDAS

Este informe planifica exclusivamente **pruebas de rendimiento con k6 (y Vegeta cuando esté disponible)** sobre el flujo integrado a través de MS1 (`http://localhost:8003`).

Las pruebas **pytest** de `pdfcrudservice/tests/test_docs_api.py` (inicialización automática del índice `checksum_unique`, idempotencia de inicialización, manejo de fallos de índice, concurrencia real contra MongoDB con `test_concurrent_upload_same_pdf_real_mongodb`, revisión de `DuplicateKeyError` en `document_service.py` y `docs_api.py`) son **pruebas funcionales/integración de MS3 ejecutadas con pytest**. No son pruebas de rendimiento, no usan k6 ni Vegeta, y no forman parte de este plan. Se mencionan únicamente como contexto independiente para dejar claro que quedan fuera del alcance de esta planificación de rendimiento.

No se incluye en este plan ninguna tarea pendiente de otras etapas (corrección de ejecutores k6, auditoría de scripts, validaciones de inicialización de índice, corrección de `DuplicateKeyError`, instalación de Vegeta, etc.).

---

## 7. ESCENARIOS PROPUESTOS

Se proponen escenarios progresivos, de menor a mayor intensidad. Todos se documentan aquí pero **no se ejecutan en esta etapa**. Cada escenario se relaciona con el script real de `performance/k6/` que lo implementa.

### Escenario 1 — Healthcheck de MS1 (lectura)

| Campo | Valor |
|-------|-------|
| Tipo | Prueba de lectura (liveness, sin persistencia) |
| Endpoint | `GET http://localhost:8003/health` |
| Script real | `performance/k6/healthcheck.js` |
| Procedencia | Etapa 11.2.2 — baseline inicial controlada |
| Usuarios virtuales | 1 VU constante |
| Duración | 30 s |
| Métricas | Latencia promedio, p50, p95, p99; tasa de errores; RPS |
| Métricas obtenidas | 30 solicitudes, 30 exitosas, 0 fallos; latencia promedio 2,38 ms; p95 3,15 ms; p99 no disponible; máximo 3,42 ms |
| Objetivo | Medir latencia base del gateway sin carga de negocio |
| Riesgo | Ninguno (solo lectura, sin persistencia) |

### Escenario 2 — Listar documentos (lectura)

| Campo | Valor |
|-------|-------|
| Tipo | Prueba de lectura (colección MongoDB vía MS3) |
| Endpoint | `GET http://localhost:8003/documents` |
| Script real | `performance/k6/list_documents.js` |
| Procedencia | Baseline inicial controlada, etapa 11.2.2 |
| Usuarios virtuales | 1 VU constante (configurable con `VUS`) |
| Duración | 30 s (configurable con `DURATION`) |
| Iteraciones | 30 |
| Métricas | RPS, latencia p50/p95/p99, errores HTTP |
| Métricas obtenidas | 30 solicitudes, 30 exitosas, 0 fallos; latencia promedio 26,76 ms; p95 12,47 ms; 60 checks aprobados |
| Objetivo | Lectura de colección en MongoDB vía MS3 |
| Riesgo | Lectura únicamente; no modifica datos |

### Escenario 3 — Consultar documento individual por ID (lectura con creación propia)

| Campo | Valor |
|-------|-------|
| Tipo | Prueba de lectura (GET por ID) con creación previa de documento propio |
| Endpoint | `POST /documents/` (crear) → `GET /documents/{id}` (consultar) |
| Script real | `performance/k6/get_document_by_id.js` |
| Usuarios virtuales | 1 VU |
| Iteraciones | 5 (por defecto, `ITERATIONS`) |
| Métricas | Latencia p50/p95/p99, tasa de 200 vs 404, errores HTTP |
| Objetivo | Lectura por ID en MongoDB sobre un documento creado por el propio test |
| Riesgo | Crea un documento persistente por iteración y **no lo elimina** (acumulación de 5 documentos por ejecución por defecto). Ver sección 8 (conteo de documentos). |

### Escenario 4 — Carga de PDF pequeño (escritura persistente)

| Campo | Valor |
|-------|-------|
| Tipo | Prueba de escritura persistente (flujo completo POST → MS3 → MS2 → MongoDB) |
| Endpoint | `POST http://localhost:8003/documents/` |
| Script real | `performance/k6/upload_small_pdf.js` |
| Cuerpo | PDF pequeño generado inline (~600 bytes, válido) |
| Usuarios virtuales | 1 VU |
| Iteraciones | 5 (por defecto, `ITERATIONS`) |
| Métricas | RPS, latencia p50/p95/p99, tasa de 201 vs errores, tiempo total (MS1+MS3+MS2+MongoDB) |
| Objetivo | Flujo completo de subida con persistencia y extracción |
| Riesgo | Genera un documento en MongoDB por iteración (5 por ejecución por defecto). Usar `RUN_ID` distinto en cada ejecución para evitar duplicados de checksum. Ver sección 8 (conteo de documentos). |

### Escenario 5 — Carga de PDF mediano (escritura persistente)

| Campo | Valor |
|-------|-------|
| Tipo | Prueba de escritura persistente (flujo completo POST → MS3 → MS2 → MongoDB) |
| Endpoint | `POST http://localhost:8003/documents/` |
| Script real | `performance/k6/upload_medium_pdf.js` |
| Cuerpo | PDF mediano generado inline (~50 KB, válido) |
| Usuarios virtuales | 1 VU |
| Iteraciones | 3 (por defecto, `ITERATIONS`) |
| Métricas | Igual que escenario 4; impacto del tamaño en latencia y CPU de MS2 (PyMuPDF) |
| Objetivo | Evaluar comportamiento con documentos de mayor tamaño |
| Riesgo | Genera documentos en MongoDB (3 por ejecución por defecto). Mayor consumo de CPU en MS2. Ver sección 8 (conteo de documentos). |

### Escenario 6 — Concurrencia de lecturas (concurrencia)

| Campo | Valor |
|-------|-------|
| Tipo | Carga mixta: preparación de escritura (POST) + lectura (GET). No es una prueba exclusivamente de lectura. |
| Script real | `performance/k6/mixed_read_concurrency.js` |
| Cuándo ocurre el POST | Dentro de `default()`, solo en la primera iteración de cada VU (cuando `!docIdByVU.has(vu)`). Cada VU ejecuta un `POST /documents/` para crear su propio documento y obtener un ID propio. |
| Escritura de preparación | Un `POST /documents/` por VU, ejecutado una sola vez en la primera iteración de esa VU. No se repite en iteraciones siguientes. |
| Lecturas durante la medición | ~70% `GET /documents/{id}` y ~30% `GET /documents` (ambas lecturas; se ejecutan en cada iteración, incluida la primera, tras el POST de preparación si corresponde). |
| Impacto en métricas de k6 | El POST dentro de `default()` **sí se contabiliza** en `http_reqs`, `http_req_duration` y `http_req_failed` de k6. Las lecturas también se contabilizan. Los tags permiten separarlas por nombre en el reporte de k6: `POST /documents/ (preparación por VU)` vs `GET /documents` / `GET /documents/{id}`. No existe un filtro que excluya el POST de las métricas generales. |
| Usuarios virtuales | 1 VU por defecto (configurable con `VUS`; se recomienda 5–10 VUs para concurrencia real) |
| Duración | 30 s (configurable con `DURATION`) |
| Documentos creados | Hasta 1 documento por VU (uno por cada VU que complete el POST de preparación con HTTP 201). Con `VUS=1` (predeterminado): hasta 1 documento. Con `VUS=5`: hasta 5 documentos. Con `VUS=10`: hasta 10 documentos. |
| Eliminación | Ninguna. El script no elimina los documentos creados; persisten en MongoDB tras la ejecución. |
| Métricas | RPS agregado (incluye el POST de preparación), latencia p50/p95/p99 (mezcla POST y GET), errores HTTP (incluye fallos del POST). Para interpretar, separar por tag de nombre de solicitud. |
| Objetivo | Evaluar comportamiento con lecturas concurrentes sobre MS1→MS3, considerando el coste de la preparación de escritura por VU. |
| Riesgo | El POST de preparación persiste 1 documento por VU sin eliminarlos, afectando MongoDB y las métricas generales de k6. 1 VU no es una prueba de concurrencia significativa; es únicamente una verificación unitaria (smoke). Una prueba de concurrencia real requiere VUs > 1 (solo lecturas). |

### Escenario 6.5 — Benchmark de estrés de MS2 (escritura persistente, k6_spike.js)

| Campo | Valor |
|-------|-------|
| Tipo | Prueba de escritura persistente y estrés (flujo completo POST → MS1 → MS3 → MS2) |
| Script real | `performance/k6/upload_small_pdf.js` (equivalente al script `k6_spike.js` de `performance/k6/`, que ejecuta `POST /documents/` sobre MS1) |
| Usuarios virtuales | 1 VU |
| Iteraciones | 17 (por defecto, `ITERATIONS`) |
| Métricas | RPS, latencia p50/p95/p99, errores HTTP |
| Métricas obtenidas | 21.067 solicitudes totales; 21.066 exitosas, 1 fallido; tasa de error 0,00475%; latencia promedio 142,26 ms; p50 107,05 ms; p90 307,2 ms; p95 347,64 ms; máximo 644,61 ms |
| Objetivo | Prueba de escritura persistente y estrés sobre el flujo integrado MS1→MS3→MS2 |
| Riesgo | El script utiliza PDFs generados inline, no los PDFs de `tests/stress/fixtures/`. La comparabilidad directa con el baseline del profesor **no está demostrada** debido a diferencias en el contenido de los documentos y en el entorno de ejecución. |

### Escenario 7 — Ciclo CRUD completo (crea y elimina sus propios documentos)

| Campo | Valor |
|-------|-------|
| Tipo | Ciclo CRUD que elimina sus propios documentos |
| Endpoints | `POST /documents/` → `PATCH /documents/{id}` → `DELETE /documents/{id}` |
| Script real | `performance/k6/crud_cycle.js` |
| Usuarios virtuales | 1 VU |
| Iteraciones | 3 (por defecto, `ITERATIONS`) |
| Métricas | RPS, latencia p50/p95/p99, errores HTTP, tiempo de respuesta total |
| Objetivo | Verificar flujo completo de creación, actualización y eliminación sobre documentos creados por el propio test |
| Riesgo | Genera y elimina documentos en MongoDB por cada iteración. No deja residuos si todas las operaciones finalizan correctamente; si alguna falla, pueden quedar documentos no eliminados. Ver sección 8 (conteo de documentos). |

### Escenario 8 — Estrés (progresión gradual, sin script propio aún)

| Campo | Valor |
|-------|-------|
| Tipo | Prueba de estrés (identificar punto de saturación) |
| Endpoint de medición | `GET /documents` y `GET /documents/{id}` (lectura) en primera instancia. `POST /documents/` solo con autorización explícita y en etapas separadas de escritura. |
| ID para `GET /documents/{id}` | Debe ser un ID válido de documento existente en MongoDB. Proponerse recibirlo mediante variable de entorno (por ejemplo `DOC_ID`), sin generar documentos mediante `POST` durante la prueba de estrés de lectura. |
| Escritura de preparación | No se realiza `POST /documents/` durante la fase de medición de lectura. Si se requiere un ID válido, se debe proveer por variable de entorno o obtenerlo de una ejecución previa controlada (escenario 3, 4 o 5), nunca dentro del estrés de lectura. |
| Script real | **No existe aún un script dedicado en `performance/k6/`**; se deberá crear o adaptar antes de ejecutar |
| Progresión propuesta | Solo lectura: rampa gradual 10 → 25 → 50 VUs, etapas de 60 s cada una, separando lecturas de escrituras. Escritura: solo cargas controladas (1–5 VUs, pocas iteraciones) y **únicamente con autorización explícita**. No se asumen como apropiados los valores 50, 100 y 200 VUs sin una baseline estable de lectura y escritura previa. |
| Duración | Aprox. 180 s para la progresión de lectura (3 etapas × 60 s) |
| Métricas | Tasa de errores (`http_req_failed`), latencia p99, timeouts, CPU/memoria por contenedor (`docker stats`), errores 502/504 del gateway |
| Objetivo | Identificar punto donde la latencia aumenta bruscamente o aparecen errores (saturación) |
| Riesgo | POST genera muchos documentos en MongoDB; posible agotamiento de conexiones. No establecer cargas de escritura elevadas sin autorización explícita. |

**Criterio adicional de seguridad para escritura:** ninguna prueba de escritura con carga elevada (VUs > 5 o iteraciones múltiples sostenidas) se ejecutará sin autorización explícita y baseline de escritura estable. Durante el estrés de lectura (escenario 8), no se ejecuta `POST /documents/` ni se crean documentos.

---

## 8. CONTEO DE DOCUMENTOS POTENCIAL (ejecuciones con valores por defecto de los scripts)

Los valores siguientes son **potenciales**, corresponden a **ejecuciones independientes** (una tras otra, nunca simultáneas) y dependen de que **todas las operaciones finalicen correctamente** (si un `POST` devuelve 400 por duplicado de checksum o falla por cualquier motivo, se crean menos documentos).

| Script | Documentos creados por ejecución (por defecto) | Documentos eliminados por ejecución | Incremento neto |
|--------|-----------------------------------------------|-------------------------------------|-----------------|
| `get_document_by_id.js` (5 iteraciones) | 5 | 0 | +5 |
| `upload_small_pdf.js` (5 iteraciones) | 5 | 0 | +5 |
| `upload_medium_pdf.js` (3 iteraciones) | 3 | 0 | +3 |
| `crud_cycle.js` (3 iteraciones) | 3 | 3 | 0 |
| `mixed_read_concurrency.js` | Hasta 1 por VU (creado perezosamente en la primera iteración de cada VU; no se elimina) | 0 | +1 por VU |
| `healthcheck.js`, `list_documents.js` | 0 | 0 | 0 |
| **Total (configuración predeterminada `VUS=1` en el escenario 6)** | **17 (bruto potencial)** | **3** | **14 (incremento neto potencial)** |

- **Total bruto potencial (`VUS=1`):** 17 documentos creados si se ejecutan todos los scripts de escritura con sus valores por defecto.
- **Eliminaciones previstas en `crud_cycle.js`:** 3 (uno por cada DELETE exitoso de las 3 iteraciones).
- **Incremento neto potencial (`VUS=1`):** 17 − 3 = 14 documentos.

**Efecto de modificar `VUS` en `mixed_read_concurrency.js`:**
Los demás scripts mantienen su conteo fijo (5 + 5 + 3 + 3 = 16 creaciones, 3 eliminaciones en `crud_cycle.js`). Solo `mixed_read_concurrency.js` varía con `VUS`, creando hasta 1 documento adicional por VU (1 documento por VU, sin eliminación, creado perezosamente en la primera iteración de cada VU).

- Bruto potencial con `VUS=N`: `16 + N` documentos creados.
- Eliminaciones (solo `crud_cycle.js`): 3.
- Incremento neto con `VUS=N`: `13 + N` documentos.

Ejemplos:
- `VUS=1` (predeterminado): 17 bruto, 3 eliminados, 14 neto.
- `VUS=5`: 21 bruto, 3 eliminados, 18 neto.
- `VUS=10`: 26 bruto, 3 eliminados, 23 neto.

Todos los valores son potenciales y dependen de que todas las operaciones finalicen correctamente; un `POST` rechazado (duplicado de checksum o error) reduce la cantidad creada.

---

## 9. MÉTRICAS A REGISTRAR

| Métrica | k6 la provee directamente | Requiere observar Docker | Descripción |
|---------|---------------------------|--------------------------|-------------|
| Requests por segundo (RPS) | ✅ (`http_reqs`) | — | Volumen de solicitudes |
| Throughput | ✅ | — | Bytes transferidos |
| Latencia promedio | ✅ (`http_req_duration` avg) | — | Tiempo medio de respuesta |
| Latencia mediana (p50) | ✅ | — | Percentil 50 |
| Latencia p90 | ✅ | — | Percentil 90 |
| Latencia p95 | ✅ | — | Percentil 95 |
| Latencia p99 | ✅ | — | Percentil 99 (k6 lo soporta) |
| Tasa de errores HTTP | ✅ (`http_req_failed`) | — | Porcentaje de requests fallidos |
| Timeouts | ✅ (timeouts en k6) | — | Requests que exceden timeout |
| Códigos HTTP devueltos | ✅ (por status) | — | Distribución 2xx/4xx/5xx |
| CPU por contenedor | — | ✅ (`docker stats`) | Uso de CPU de cada contenedor |
| Memoria por contenedor | — | ✅ (`docker stats`) | Uso de RAM de cada contenedor |
| Comportamiento de MongoDB | — | ✅ (logs/mongostat) | Operaciones, conexiones, índices |
| Duración total de prueba | ✅ | — | Tiempo desde inicio hasta fin |

**Distinción:** k6/Vegeta proporcionan métricas de nivel de aplicación (HTTP, latencia, errores). Docker proporciona métricas de infraestructura (CPU, RAM, red por contenedor). Ambas deben correlacionarse por tiempo.

---

## 10. PLAN DE EJECUCIÓN Y SEGURIDAD

### Orden de ejecución propuesto

1. **Pre-check:** Verificar salud de MS1 (`GET /health`), MS3 (`GET /health`), MS2 (`GET /health`) antes de cada prueba.
2. **Ejecutar escenario** (uno por vez, nunca simultáneos con k6 y Vegeta).
3. **Post-check:** Verificar salud nuevamente tras la prueba.
4. **Tiempo de recuperación:** Esperar entre escenarios para que contenedores y MongoDB se estabilicen.
5. **Repetir** con el siguiente escenario.

### Precauciones específicas

- **No eliminar datos existentes.** No ejecutar `docker compose down -v`, ni borrar colecciones ni volúmenes de MongoDB.
- **POST genera documentos:** Cada `POST /documents/` persiste un documento en MongoDB. Usar PDFs con checksums distintos en cada iteración para no activar la lógica de duplicados (HTTP 400). Evitar acumulación innecesaria; limitar número de iteraciones en pruebas de POST.
- **No pruebas simultáneas k6 + Vegeta:** Ejecutar una herramienta a la vez para no mezclar tráfico y distorsionar métricas.
- **Monitorear recursos:** Capturar `docker stats --no-stream` durante cada ejecución para CPU/memoria por contenedor.
- **Timeouts:** MS3_TIMEOUT=40 s (gateway) y EXTRACT_SERVICE_TIMEOUT=30 s (MS3→MS2). Los scripts de k6 deben respetar estos timeouts para no generar falsos 504/502.
- **Cargas de escritura:** no establecer cargas de escritura elevadas sin autorización explícita.

### Comandos de PowerShell documentados (no ejecutar en esta etapa)

```powershell
# Verificar salud antes de probar
Invoke-RestMethod -Uri "http://localhost:8003/health" -Method Get

# Ejecutar script k6 (ejemplo de estructura, no ejecutar)
k6 run -e BASE_URL=http://localhost:8003 <script.js>

# Monitorear contenedores durante prueba (en otra terminal)
docker stats --no-stream

# Verificar salud después de probar
Invoke-RestMethod -Uri "http://localhost:8003/health" -Method Get
```

---

## 11. RIESGOS Y PRECAUCIONES

| Riesgo | Descripción | Mitigación |
|--------|-------------|------------|
| Crecimiento de MongoDB | Cada POST persiste un documento | Usar PDFs con checksums distintos; limitar iteraciones; no limpiar datos existentes |
| Duplicados (checksum) | PDFs idénticos generan HTTP 400 | Rotar entre distintos PDFs fixtures; usar `RUN_ID` único por ejecución |
| CPU en MS2 | PyMuPDF es CPU-bound; límite no declarado en Compose | Monitorear `docker stats`; limitar VUs en pruebas POST |
| Timeout gateway | MS3_TIMEOUT=40 s; si MS2/MongoDB tardan, MS1 devuelve 504 | Ajustar duración de pruebas y timeouts de k6 |
| Sin Vegeta instalado | No se puede ejecutar Vegeta sin instalar | Documentar como pendiente; usar k6 para esta etapa |
| Interferencia entre pruebas | k6 y Vegeta simultáneos distorsionan métricas | Ejecutar una herramienta a la vez; recuperación entre escenarios |
| Estrés sin baseline | 50/100/200 VUs sin justificación previa | Progresión gradual justificada; lectura y escritura separadas; escritura elevada solo con autorización explícita |

**Nota de coherencia (escenario 6 y conteo):** `mixed_read_concurrency.js` persiste hasta 1 documento por VU sin eliminarlos. Con `VUS=5` o `VUS=10` se crean 5 o 10 documentos adicionales por ejecución, respectivamente, que permanecen en MongoDB. Esto debe considerarse al planificar el crecimiento de la base de datos y al elegir el valor de `VUS`.

---

## 12. PROPUESTA DE BASELINE

Una **baseline** es la medición inicial de referencia en condiciones normales (carga baja, sistema en reposo).

**Propuesta:**
1. Levantar los tres servicios vía `docker compose -f docker-compose.integration.yml up -d`.
2. Esperar a que todos los healthchecks estén verdes.
3. Ejecutar el Escenario 1 (healthcheck, 1 VU, 30 s) y el Escenario 2 (listar documentos, 1 VU, 30 s).
4. Registrar: latencia p50/p95/p99, RPS, errores, CPU/memoria por contenedor.
5. Usar esos valores como referencia para comparar pruebas de carga elevada y estrés.

**No establecer objetivos arbitrarios** de latencia o throughput sin mediciones que los justifiquen. La baseline define lo que es "normal" para este entorno.

**Resultados de baseline obtenidos (etapa 11.2.2 — baseline inicial controlada, no etapa 11.2.2.4):**
- **GET /documents:** 30 solicitudes, 30 exitosas, 0 fallos, latencia promedio 26.76 ms, p95 12.47 ms, ≈ 0,97 req/s.
- **GET /health:** 30 solicitudes, 30 exitosas, 0 fallos, latencia promedio 2.38 ms, p95 3.15 ms.

**Nota de verificación:** estos valores coinciden con el informe `ETAPA_11_2_2_BASELINE_INICIAL.md` (etapa 11.2.2, ejecutada 09/11/2026). No se volvieron a ejecutar mediciones en esta etapa (prohibido ejecutar pruebas). La atribución previa a la etapa 11.2.2.4 era incorrecta: la 11.2.2.4 es la etapa de "Primera prueba controlada de escritura", no la de obtención de la baseline de lectura.

La baseline solo cubre operaciones de lectura (GET). No cubre el flujo de escritura (`POST /documents/`) que involucra a MS2 y la persistencia en MongoDB.

---

## 13. DIFERENCIACIÓN DE ESCENARIOS Y TIPO DE PRUEBA

Para una interpretación correcta de los resultados, se diferencian claramente los escenarios según su tipo de prueba:

| Categoría | Escenarios | Descripción |
|-----------|------------|-------------|
| **Pruebas de lectura de MS1/MS3** | Escenario 1 (healthcheck), Escenario 2 (listar documentos) | Pruebas de lectura (GET) sobre MS1/MS3 que no crean documentos. Muestran latencia y RPS de lectura pura. |
| **Pruebas de integración MS1 → MS3** | Escenario 3 (consulta por ID), Escenario 4 (subida PDF pequeño), Escenario 5 (subida PDF mediano), Escenario 6 (concurrencia mixta) | Pruebas que incluyen escritura persistente (POST /documents/) a través del flujo integrado MS1→MS3→MS2. Crean documentos en MongoDB. |
| **Benchmark k6 oficial de MS2** | `k6_spike.js` | Prueba de escritura sobre POST /documents/ a través de MS1 (MS1→MS3→MS2). 21.067 solicitudes, 21.066 exitosas, 1 fallido; tasa de error 0,00475%; latencia promedio 142,26 ms; p50 107,05 ms; p90 307,2 ms; p95 347,64 ms; máximo 644,61 ms. Los PDFs son generados inline, no comparables directamente con el baseline del profesor. |
| **Benchmark Vegeta de MS2** | No ejecutado | No se pudieron obtener resultados válidos de Vegeta (archivo de resultados corrupto). No hay datos registrados. |
| **Escenarios pendientes o no verificables** | Escenario 8 (estrés 10 → 25 → 50 VUs) | No existe script dedicado ni resultados de ejecución. Los valores de RPS y latencia p95 no están disponibles y no deben ser reportados como medidos. |

---

## 15. CRITERIOS DE EVALUACIÓN

| Tipo de prueba | Criterio de satisfacción |
|----------------|--------------------------|
| Baseline | Todas las respuestas 2xx; latencia estable; sin errores 5xx |
| Carga normal | Tasa de errores < 1%; latencia p95 dentro de un rango razonable respecto a baseline; sin timeouts |
| Carga elevada | Tasa de errores aceptable (< 5%); latencia aumenta de forma gradual, no brusca; contenedores estables (sin OOM) |
| Estrés | Se identifica el punto de saturación (donde latencia o errores crecen descontroladamente); el sistema no cae de forma irrecuperable |
| Recuperación | Tras finalizar la prueba, los healthchecks vuelven a estar verdes |

**Criterios de parada de una prueba de estrés:** tasa de errores > 10%, latencia p99 > 10 s, o contenedor en estado OOM/killed.

---

## 15. CORRECCIONES APLICADAS EN ESTE INFORME (ETAPA 11.2.2.9)

1. **Etapa previa corregida:** 11.2.2.7 → 11.2.2.8 (la etapa de "Corrección de executors en pruebas k6" es la 11.2.2.8).
2. **Eliminadas las secciones que mezclaban pytest con planificación k6:** plan de inicialización de índice (`test_index_unique_is_created_automatically`, etc.), prueba de concurrencia real contra MongoDB (`test_concurrent_upload_same_pdf_real_mongodb`) y revisión de `DuplicateKeyError` en `document_service.py`/`docs_api.py`. Esas tareas pertenecen al ámbito funcional de MS3, no a este plan de rendimiento. Las pruebas pytest se mantienen únicamente como contexto independiente aclarando que no son pruebas de rendimiento.
3. **Eliminada la segunda sección numerada como "10" ("PRÓXIMOS PASOS")** que referenciaba tareas pendientes de otras etapas (`uv run pytest -q`, revisión de `DuplicateKeyError`, correcciones en MS3).
4. **Atribución de la baseline corregida:** los resultados de lectura corresponden a la etapa **11.2.2** (baseline inicial controlada), no a la 11.2.2.4.
5. **Numeración de escenarios corregida:** 1 → 8 sin saltos (anteriormente faltaba el 6 y no había script para el 9).
6. **Cada escenario relacionado con su script real de `performance/k6/`:** healthcheck.js, list_documents.js, get_document_by_id.js, upload_small_pdf.js, upload_medium_pdf.js, mixed_read_concurrency.js, crud_cycle.js; el escenario de estrés no tiene script propio aún.
7. **Diferenciación clara por tipo de prueba:** lectura, escritura persistente, ciclo CRUD que elimina sus propios documentos, concurrencia, estrés.
8. **Añadido conteo de documentos:** total bruto potencial 17, eliminaciones en `crud_cycle.js` 3, incremento neto potencial 14, con aclaración de ejecuciones independientes y condicionadas al éxito de las operaciones.
9. **Concurrencia revisada:** 1 VU no se presenta como prueba de concurrencia significativa; es una verificación unitaria. La concurrencia real requiere VUs > 1 (solo lecturas).
10. **Estrés revisado:** no se asumen 50/100/200 VUs como apropiados; se propone progresión gradual justificada separando lectura y escritura, y no se establecen cargas de escritura elevadas sin autorización explícita.
11. **Criterios de parada y recuperación mantenidos y revisados:** errores > 10%, p99 > 10 s u OOM como parada; recuperación con healthchecks verdes.
12. **Referencias a tareas pendientes de otras etapas eliminadas.**
13. **Cierre reescrito:** no se declara completado lo que sigue pendiente (ver sección 16).

**Correcciones de esta sub-tarea (verificación directa de scripts, sin ejecución):**

14. **Escenario 6 corregido con inspección de `mixed_read_concurrency.js`:** El POST de preparación ocurre **dentro de `default()`** (no en `setup()`), solo en la primera iteración de cada VU. El script **no es exclusivamente de lectura**: es una carga mixta de escritura de preparación (1 POST por VU) y lecturas (~70% `GET /documents/{id}`, ~30% `GET /documents`). El POST **sí se contabiliza** en `http_reqs`, `http_req_duration` y `http_req_failed` de k6; los tags permiten separarlo por nombre (`POST /documents/ (preparación por VU)` vs `GET /documents` / `GET /documents/{id}`) pero no excluirlo de las métricas generales. No existe eliminación; los documentos persisten. 1 VU → hasta 1 documento; 5 VUs → hasta 5; 10 VUs → hasta 10.
15. **Escenario 8 corregido:** `GET /documents/{id}` requiere un ID válido existente, proponerse recibirlo por variable de entorno (p. ej. `DOC_ID`); no se ejecuta `POST /documents/` durante el estrés de lectura ni se crean documentos en esa fase.
16. **Conteo de documentos actualizado:** los 14 netos corresponden a la configuración predeterminada (`VUS=1` en el escenario 6). Con `VUS=N`, el bruto es `16 + N`, las eliminaciones 3 y el neto `13 + N` (ej. `VUS=5`: 21 bruto, 18 neto; `VUS=10`: 26 bruto, 23 neto).
17. **Coherencia revisada:** escenarios 6 y 8, conteo de documentos y sección de riesgos alineados con la implementación real de `mixed_read_concurrency.js` (1 documento por VU sin eliminación).
18. **Nota de riesgo añadida:** `mixed_read_concurrency.js` persiste hasta 1 documento por VU sin eliminarlos, relevante para el crecimiento de MongoDB y la elección de `VUS`.

---

## 16. CIERRE Y ESTADO DE LA ETAPA

**Estado:** La etapa 11.2.2.9 queda en estado de **planificación documentada, sin ejecución de pruebas de rendimiento**.

**Pendientes (no declarados como completados):**
- Ejecución de los escenarios 1–7 con k6 (autorización requerida).
- Creación o adaptación de un script dedicado para el escenario 8 de estrés.
- Instalación de Vegeta o disponibilidad del contenedor `tsenart/vegeta`, si se autoriza (etapa futura).
- Obtención de baseline de escritura (`POST /documents/`) antes de cualquier prueba de estrés con escritura.
- Ejecución de pruebas funcionales pytest de MS3 (índice, `DuplicateKeyError`, concurrencia real) en su ámbito propio, fuera de este informe.

**Confirmaciones de restricciones de esta etapa:**
- No se ejecutó k6 ni Vegeta.
- No se ejecutó pytest.
- No se realizaron solicitudes HTTP.
- No se iniciaron, detuvieron ni reiniciaron contenedores.
- No se modificaron scripts ni código de MS1, MS2 ni MS3.
- No se modificó Docker Compose ni `.env`.
- No se modificaron bases de datos ni volúmenes.
- No se realizaron commits ni push.
- Solo se corrigió el informe principal `ETAPA_11_2_2_9_PLANIFICACION_RENDIMIENTO.md`.

---