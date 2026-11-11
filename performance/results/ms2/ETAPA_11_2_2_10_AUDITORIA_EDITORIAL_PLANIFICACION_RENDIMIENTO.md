# ETAPA 11.2.2.10 — AUDITORÍA EDITORIAL Y CORRECCIÓN DEL INFORME DE RENDIMIENTO

**Proyecto:** Integración MS1 + MS2 + MS3 (gestión y extracción de documentos PDF)  
**Ruta raíz de integración:** `C:\Users\marsi\OneDrive\Documents\Integracion\`  
**Archivo auditado:** `ETAPA_11_2_2_9_PLANIFICACION_RENDIMIENTO.md`  
**Fecha:** 10/11/2026  
**Estado:** CORREGIDO  
**Estado final:** LISTO PARA REVISIÓN ACADÉMICA

---

## 1. RESUMEN EJECUTIVO

Se ha realizado una auditoría completa del informe `ETAPA_11_2_2_9_PLANIFICACION_RENDIMIENTO.md` para corregir inconsistencias encontradas en la numeración de escenarios, clasificación de pruebas, atribución de baseline, conteo de documentos, relación entre escenarios y scripts, y comportamiento de `mixed_read_concurrency.js`. 

Todas las correcciones se aplicaron directamente sobre el archivo `ETAPA_11_2_2_9_PLANIFICACION_RENDIMIENTO.md` en la raíz de `Integracion/`. Este informe (ETAPA 11.2.2.10) documenta exclusivamente los cambios realizados y los datos que no pudieron verificarse. No se ejecutaron pruebas de rendimiento, no se ejecutaron k6 ni Vegeta, y no se modificó ningún script de MS1, MS2 ni MS3.

---

## 2. ARCHIVO MODIFICADO

| Campo | Valor |
|-------|-------|
| Archivo | `ETAPA_11_2_2_9_PLANIFICACION_RENDIMIENTO.md` |
| Ubicación | `C:\Users\marsi\OneDrive\Documents\Integracion\ETAPA_11_2_2_9_PLANIFICACION_RENDIMIENTO.md` |
| Longitud | 34.490 bytes |
| Líneas | 642 líneas |
| Formato | Markdown |

---

## 3. CORRECCIONES REALIZADAS POR SECCIÓN

### 3.1. Sección 1 — Resumen Ejecutivo

**Corrección:** Se precisó que la corrección de `iterations: ITERATIONS` corresponde únicamente a los scripts de escritura de `performance/k6/` que utilizan ese mecanismo (`upload_small_pdf.js`, `upload_medium_pdf.js`, `crud_cycle.js`, `get_document_by_id.js`, `mixed_read_concurrency.js`). No se generaliza a los scripts que utilizan `duration` como modelo de ejecución (healthcheck, list_documents).

### 2. Sección 7 — Escenario 1 — Healthcheck de MS1 (lectura)

**Corrección:**
- Se eliminó la referencia implícita a mediciones de estrés elevadas.
- Se aclaró que 1 VU es una verificación unitaria (smoke test), no una prueba de concurrencia.
- Se mantuvo la medición como operación de lectura pura (solo `GET /health`).

### 3. Sección 7 — Escenario 2 — Listar documentos (lectura)

**Corrección:** Se ajustó la descripción para reflejar correctamente el comportamiento del script `list_documents.js`: operación de lectura pura (GET), 1 VU, 30 segundos de duración.

### 4. Sección 7 — Escenario 6 — Concurrencia mixta de lectura con preparación de escritura

**Corrección (crítica):**

| Campo | Antes (incorrecto) | Después (corregido) |
|-------|--------------------|---------------------|
| Tipo | "Prueba de concurrencia de operaciones de lectura" | "Carga mixta: preparación de escritura (POST) + lectura (GET). No es una prueba exclusivamente de lectura." |
| Cuándo ocurre el POST | No se mencionaba correctamente | Dentro de `default()`, solo en la primera iteración de cada VU |
| Etiqueta del POST | No se aclaraba | `POST /documents/ (preparación por VU)` — el nombre de la etiqueta en el script es `POST /documents/ (setup)`, pero ocurre en `default()`, no en `setup()` |
| Métricas de k6 | No se aclaraba el impacto del POST | Se aclara que el POST se contabiliza en `http_reqs`, `http_req_duration` y `http_req_failed` de k6 |

**Razón:** La inspección directa de `mixed_read_concurrency.js` confirmó que el `POST /documents/` ocurre dentro de la función `default()`, no en `setup()`. Por tanto, no es una prueba exclusivamente de lectura.

### 5. Sección 7 — Escenario 8 — Estrés (progresión gradual)

**Corrección:**
- Se aclaró que `GET /documents/{id}` requiere un ID válido existente de MongoDB, recibido mediante variable de entorno (p. ej. `DOC_ID`).
- Se aclaró que **no se ejecuta `POST /documents/` durante la fase de medición de lectura**.
- No se asume como apropiados los valores 50, 100 y 200 VUs sin una baseline estable de lectura y escritura previa.
- Se propone progresión gradual justificada separando lectura y escritura.

---

## 6. SECCIÓN 8 — CONTEO DE DOCUMENTOS POTENCIAL

**Corrección:** Se dejó explícito que los 14 netos corresponden a la configuración predeterminada (`VUS=1` en el escenario 6):

| Métrica | Valor con `VUS=1` |
|---------|-------------------|
| Total bruto potencial | 17 documentos creados |
| Eliminaciones previstas en `crud_cycle.js` | 3 |
| Incremento neto potencial | 14 documentos |

**Efecto de modificar `VUS`:**
- Bruto potencial con `VUS=N`: `16 + N` documentos creados.
- Eliminaciones (solo `crud_cycle.js`): 3.
- Incremento neto con `VUS=N`: `13 + N` documentos.

Ejemplos:
- `VUS=1` (predeterminado): 17 bruto, 3 eliminados, 14 neto.
- `VUS=5`: 21 bruto, 3 eliminados, 18 neto.
- `VUS=10`: 26 bruto, 3 eliminados, 23 neto.

---

## 7. CORRECCIONES GENERALES

| Corrección | Descripción |
|------------|-------------|
| Atribución de la baseline | Los resultados de lectura (healthcheck y listado de documentos) corresponden a la etapa **11.2.2** (baseline inicial controlada), no a la 11.2.2.4. La 11.2.2.4 es la etapa de "Primera prueba controlada de escritura". |
| Numeración de escenarios | Corregida de 1 → 8 sin saltos. Anteriormente faltaba el 6 y no había script para el 9. |
| Relación escenario ↔ script | Cada escenario relacionado con su script real de `performance/k6/`: healthcheck.js, list_documents.js, get_document_by_id.js, upload_small_pdf.js, upload_medium_pdf.js, mixed_read_concurrency.js, crud_cycle.js. El escenario de estrés no tiene script propio. |
| Referencias a tareas pendientes de otras etapas | Eliminadas las referencias a `uv run pytest -q`, revisión de `DuplicateKeyError`, correcciones en MS3, etc. |
| Cierre | Reescrito para no declarar completadas tareas que sigan pendientes (ver sección 15). |

---

## 4. DATOS QUE NO PUDIERON VERIFICSE

| Dato | Estado | Razón |
|------|--------|-------|
| Resultados de pruebas de estrés (50/100/200 VUs) | No verificables | No existen scripts dedicados ni resultados de ejecución para estos escenarios en el informe original. |
| Resultados de pruebas de escritura (`POST /documents/` a través de MS1) | No verificables | No existen mediciones ejecutadas en el informe original. |
| Valores exactos de RPS, latencia p95 y p99 para el escenario de estrés (Escenario 8) | No verificables | No existen mediciones ejecutadas para este escenario. |
| Resultados de pruebas de estrés de MS2 (Vegeta) | No verificables | No existen resultados de ejecución de Vegeta para MS2. |

---

## 5. CONFIRMACIÓN DE RESTRICTICIONES

| Restricción | Estado |
|-------------|--------|
| No se ejecutó k6 ni Vegeta en esta auditoría | ✅ Confirmado |
| No se ejecutó pytest | ✅ Confirmado |
| No se realizaron solicitudes HTTP | ✅ Confirmado |
| No se ejecutaron comandos Docker | ✅ Confirmado |
| No se modificaron scripts de MS1, MS2 ni MS3 | ✅ Confirmado |
| No se modificó Docker Compose ni `.env` | ✅ Confirmado |
| No se modificaron bases de datos ni volúmenes | ✅ Confirmado |
| No se realizaron commits ni push | ✅ Confirmado |
| No se eliminaron ni sobrescribieron informes anteriores sin autorización | ✅ Confirmado |
| Solo se corrigió el informe principal `ETAPA_11_2_2_9_PLANIFICACION_RENDIMIENTO.md` | ✅ Confirmado |

---

## 6. PRÓXIMOS PASOS (Pendientes)

1. Ejecución de los escenarios 1–7 con k6 (requiere autorización).
2. Creación o adaptación de un script dedicado para el escenario 8 de estrés.
3. Instalación de Vegeta o disponibilidad del contenedor `tsenart/vegeta`, si se autoriza (etapa futura).
4. Obtención de baseline de escritura (`POST /documents/`) antes de cualquier prueba de estrés con escritura.
5. Ejecución de pruebas funcionales pytest de MS3 (índice, `DuplicateKeyError`, concurrencia real) en su ámbito propio, fuera de este informe.

---

**ETAPA 11.2.2.9 cerrada.** La etapa queda en estado de **planificación documentada, sin ejecución de pruebas de rendimiento**.

---