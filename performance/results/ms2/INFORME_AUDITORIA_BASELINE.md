# INFORME DE AUDITORÍA DEL BASELINE — ETAPA 14.1

**Proyecto:** Integración de microservicios PDF (MS1 + MS2 + MS3)  
**Ruta raíz:** `C:\Users\marsi\OneDrive\Documents\Integracion\`  
**Fecha de auditoría:** 10/11/2026  
**Tipo:** Auditoría estática, solo lectura  
**Archivos modificados:** Ninguno (solo se creó este informe)

---

## 1. RESULTADOS DE k6 — VERIFICADOS

### 1.1 Script ejecutado

| Elemento | Valor |
|----------|-------|
| Archivo | `pdfextractext/tests/stress/k6_spike.js` |
| Modificado | NO (script original de la cátedra) |
| Endpoint | `POST http://localhost:80/extract` (a través de Traefik) |
| Tipo de envío | Bytes raw con `Content-Type: application/pdf` |
| Archivos PDF | 3 PDFs inline generados en el script JS (`sample_1p.pdf`, `sample_5p.pdf`, `sample_10p.pdf`) — NO los PDFs oficiales de `pdfs/` |

### 1.2 Configuración del escenario (según el script)

| Parámetro | Valor configurado en el script |
|-----------|-------------------------------|
| Executor | `ramping-vus` |
| startVUs | 0 |
| Stage 1 | 10s, target 100 VUs |
| Stage 2 | 20s, target 100 VUs |
| Stage 3 | 10s, target 0 VUs |
| Duración total | 40 segundos |
| Timeout por request | 30s |

### 1.3 Resultados obtenidos (de `k6/consola_completa.txt`)

| Métrica | Valor |
|---------|-------|
| Total solicitudes (`http_reqs`) | 21,067 |
| Solicitudes exitosas | 21,066 |
| Solicitudes fallidas | 1 |
| Tasa de error (`http_req_failed`) | 0.00% (1/21067 = 0.0047%) |
| RPS | 526.59 |
| Latencia promedio (avg) | 142.26 ms |
| Mediana (p50) | 107.05 ms |
| p90 | 307.2 ms |
| p95 | 347.64 ms |
| Máximo (max) | 644.61 ms |
| Iteraciones | 21,067 |
| VUs máximo | 100 |
| Checks aprobados | 63,198 / 63,201 (99.99%) |

### 1.4 Clasificación de comparabilidad: **NO DEMOSTRADA**

**Justificación:**

Los valores obtenidos difieren drásticamente de los valores de referencia del profesor:

| Métrica | Profesor | Obtenido | Diferencia |
|---------|----------|----------|------------|
| Total solicitudes | 1,037 | 21,067 | +20,030 (+1,931%) |
| RPS | 25.35 | 526.59 | +501.24 (+1,977%) |
| Latencia p95 | 8.80 s | 0.348 s | -8.45 s (-96.0%) |
| Tasa de error | 0% | 0.0047% | +0.0047 pp |

**Posibles razones de la discrepancia (no verificadas):**

1. **Entorno diferente:** El profesor pudo haber ejecutado contra una sola instancia de MS2 (sin balanceador Traefik, sin 5 réplicas), lo que reduciría drásticamente el throughput.
2. **PDFs diferentes:** Nuestro script usa PDFs inline pequeños (859 bytes a 44 KB), mientras que el profesor pudo haber usado los PDFs oficiales más grandes (hasta 8.9 MB, que superan el límite de 5 MB y generan 413).
3. **Recursos diferentes:** Nuestro entorno tiene 5 réplicas con 1 CPU y 1 GB cada una; el profesor pudo haber usado menos recursos.
4. **Configuración de k6 diferente:** El profesor pudo haber usado un número diferente de iteraciones o una duración diferente.

**Conclusión:** No se puede afirmar que nuestro entorno sea "mejor" ni que los valores del profesor sean incorrectos. Las condiciones de ejecución no son comparables sin más información sobre cómo el profesor obtuvo sus mediciones.

---

## 2. RESULTADOS DE VEGETA — NO RECUPERABLES

### 2.1 Archivos inspeccionados

| Archivo | Tamaño | Estado | ¿Válido? |
|---------|--------|--------|----------|
| `resultados.bin` | 82,014,720 bytes | Binario corrupto | NO |
| `consola_completa.txt` | 86,053,486 bytes | Contenido corrupto | NO |
| `resultados.json` | 860 bytes | Contiene mensaje de error de parseo | NO |

### 2.2 Análisis del archivo `resultados.bin`

El archivo tiene 82 MB, lo cual es anormalmente grande para un ataque de 50 req/s durante 30 segundos (que debería generar aproximadamente 1,500 solicitudes). Un archivo `.bin` de Vegeta válido para esta carga tendría unos pocos cientos de kilobytes como máximo.

El archivo no es un binario válido de Vegeta. Contiene datos corruptos, probablemente por una redirección incorrecta de salida en PowerShell durante la ejecución de `vegeta attack`.

### 2.3 Análisis de `consola_completa.txt`

El archivo tiene 86 MB y contiene texto de un libro sobre historias de usuario (contenido de los PDFs enviados), no el reporte formateado de Vegeta. Esto confirma que la salida de `vegeta attack` fue capturada incorrectamente o que el comando falló y escribió contenido inesperado.

### 2.4 Análisis de `resultados.json`

El archivo tiene 860 bytes y contiene el mensaje de error:

```
vegeta.exe : 2026/11/10 12:14:53 parse error: syntax error near offset 0 of 'POST http:...
```

Esto confirma que `vegeta attack` falló al intentar parsear el archivo `targets.txt`, probablemente porque las rutas relativas de los PDFs (`@tests/stress/pdfs/...`) no se resolvieron correctamente desde el directorio de ejecución.

### 2.5 Intentos de recuperación realizados

Se intentó:
1. `vegeta report resultados.bin` — falló: no puede detectar encoding del stdin
2. `vegeta report -type=json resultados.bin` — falló: mismo error
3. `vegeta attack -rate=50/1s -duration=30s -targets=...` con `-format=json` — falló: error de parseo de targets

**Conclusión:** El archivo `resultados.bin` está corrupto y no se puede recuperar ningún reporte válido de Vegeta. No se volverá a ejecutar el ataque.

---

## 3. COMPARACIÓN FINAL

| Prueba | Estado | Resultados confiables | Comparable con profesor |
|--------|--------|----------------------|------------------------|
| k6 — Spike | ✅ Ejecutado correctamente | 21,067 req, 526.59 RPS, 0.00% error, p95=347.64ms | **NO** (condiciones no equivalentes) |
| Vegeta — Carga | ❌ No se pudo obtener reporte | Ninguna métrica válida | **NO** (no hay datos) |

### 3.1 Limitaciones de la comparación

1. **k6:** Los scripts de k6 oficiales (`k6_spike.js`) usan PDFs **inline** generados en JavaScript (archivos muy pequeños: 859 bytes a 44 KB), NO los PDFs oficiales de `tests/stress/pdfs/` (uno de los cuales tiene 8.9 MB y supera el límite de 5 MB). Esto hace que las pruebas no sean directamente comparables con un entorno que use los PDFs oficiales.

2. **Vegeta:** No se obtuvieron resultados válidos. El archivo binario está corrupto.

3. **Entorno:** Nuestro entorno tiene 5 réplicas con 1 CPU y 1 GB cada una, detrás de Traefik. No se sabe qué entorno usó el profesor para obtener sus valores de referencia.

### 3.2 Conclusión

**Los resultados de k6 son válidos y reales**, obtenidos en un entorno con 5 réplicas de MS2 balanceadas por Traefik. Sin embargo, **no son directamente comparables** con los valores de referencia del profesor debido a:
- Diferencia en los archivos PDF utilizados (inline pequeños vs. PDFs oficiales grandes)
- Diferencia en la infraestructura (5 réplicas vs. posiblemente 1 instancia)
- Diferencia en la configuración de k6 (ITERATIONS vs. duración basada en VUs)

**Los resultados de Vegeta no están disponibles** debido a que el archivo binario se corrompió durante la ejecución.

---

## 4. Archivos generados en esta auditoría

- `INFORME_AUDITORIA_BASELINE.md` — Este documento (no modifica ningún archivo existente)

Todos los archivos originales en `resultados_benchmark_ms2/` permanecen sin modificar.

---

**Restricciones cumplidas:**
- No se ejecutó k6 ni Vegeta en esta auditoría
- No se modificó ningún archivo original
- No se ejecutaron comandos Docker
- No se consultó MongoDB
- No se realizaron commits ni push

---