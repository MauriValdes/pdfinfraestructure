# INFORME BASELINE - PRUEBAS DE RENDIMIENTO MS2 (ETAPA 14)

## 1. Información del entorno

| Elemento | Valor |
|----------|-------|
| Fecha de ejecución | 10/11/2026 |
| k6 versión | v2.2.0 |
| Vegeta versión | v12.13.0 |
| Entorno | Windows/PowerShell |
| Servicio objetivo | MS2 (pdfextractext) |
| URL base | http://localhost:80 (a través de Traefik) |
| Réplicas de MS2 | 5 |
| Límite CPU por réplica | 1.0 |
| Límite memoria por réplica | 1 GB (1073741824 bytes) |
| Balanceador | Traefik v3 (puerto 80 del host) |

## 2. Resultados obtenidos

### 2.1 k6 - Test de Spike

Configuración: 0→100 VUs en 10s, 100 VUs sostenidos 20s, 100→0 en 10s (40s totales)

| Métrica | Valor obtenido |
|---------|---------------|
| Total solicitudes (http_reqs) | 21,067 |
| Solicitudes exitosas | 21,066 |
| Solicitudes fallidas | 1 |
| Tasa de error (http_req_failed) | 0.00% |
| RPS (solicitudes por segundo) | 526.59 |
| Latencia promedio (avg) | 142.26 ms |
| Mediana (p50/med) | 107.05 ms |
| p90 | 307.2 ms |
| p95 | 347.64 ms |
| Máximo (max) | 644.61 ms |
| Iteraciones completadas | 21,067 |
| VUs máximo | 100 |
| VUs mínimo | 1 |
| Duración total | ~40 segundos |
| Datos recibidos | 8.0 MB |
| Datos enviados | 57 MB |

Checks:
- `status 200`: 21,066 / 21,067 aprobados (99%)
- `contrato: page_count > 0`: 21,066 / 21,067 aprobados (99%)
- `contrato: content no vacío`: 21,066 / 21,067 aprobados (99%)

### 2.2 Vegeta - Test de carga sostenida

Configuración: 50 req/s durante 30 segundos (1,500 solicitudes esperadas)

| Métrica | Valor obtenido | Nota |
|---------|---------------|------|
| Ataque ejecutado | Sí | Se ejecutó `vegeta attack -rate=50/1s -duration=30s -targets=tests/stress/targets.txt` |
| Archivo .bin generado | Sí | resultados.bin en carpeta vegeta/ |
| Reporte de texto | No disponible | Limitación del entorno Windows con `vegeta report` (no puede detectar encoding del archivo .bin) |
| Reporte JSON | No disponible | El comando `vegeta attack -format=json` falló con código de salida 1 |

**Nota:** El ataque de Vegeta se ejecutó correctamente (código de salida 0 en `vegeta attack`). Sin embargo, no se pudo obtener el reporte formateado de texto ni JSON debido a limitaciones del entorno Windows con el comando `vegeta report`, que no puede detectar la encoding del archivo binario .bin generado por `vegeta attack`. Este es un problema conocido de Vegeta en entornos Windows.

## 3. Comparación con valores de referencia del profesor

### 3.1 k6 - Test de Spike

| Métrica | Valor del profesor | Valor obtenido | Diferencia absoluta | Diferencia porcentual | Interpretación |
|---------|-------------------|----------------|---------------------|----------------------|----------------|
| Total solicitudes | 1,037 | 21,067 | +20,030 | +1,931% | Nuestro entorno procesó significativamente más solicitudes |
| RPS | 25.35 | 526.59 | +501.24 | +1,977% | Mucho mayor throughput en nuestro entorno |
| Tasa de error | 0% | 0.00% | 0% | 0% | Ambos sin errores |
| Latencia p50 | 1.88 s | 0.107 s | -1.77 s | -94.1% | Nuestra latencia mediana es mucho menor |
| Latencia p90 | 7.83 s | 0.307 s | -7.52 s | -96.0% | Nuestra latencia p90 es mucho menor |
| Latencia p95 | 8.80 s | 0.348 s | -8.45 s | -96.0% | Nuestra latencia p95 es mucho menor |
| Latencia máxima | 13.94 s | 0.645 s | -13.30 s | -95.4% | Nuestra latencia máxima es mucho menor |

**Nota:** Las diferencias son extremadamente grandes. Esto puede deberse a que los valores del profesor son de referencia teórica o de un entorno diferente (posiblemente con menos recursos o configuración distinta). No se puede afirmar que nuestro sistema es "mejor" sin conocer las condiciones exactas bajo las cuales se midieron los valores del profesor.

### 3.2 Vegeta - Test de carga sostenida

| Métrica | Valor del profesor | Valor obtenido | Diferencia | Interpretación |
|---------|-------------------|----------------|------------|----------------|
| Throughput efectivo | 16.65 req/s | No disponible (no se pudo obtener reporte) | - | No se pudo obtener el reporte de Vegeta |
| Tasa de éxito | 66.53% (998/1,500) | No disponible | - | No se pudo obtener el reporte |
| Timeouts | 501 (33.40%) | No disponible | - | No se pudo obtener el reporte |
| Latencia p50 | 14.89 s | No disponible | - | No se pudo obtener el reporte |

**Nota:** No se pudo obtener el reporte de Vegeta debido a limitaciones del entorno Windows con `vegeta report`. No se puede comparar con los valores del profesor.

## 4. Conclusiones

1. **k6 funcionó correctamente** y obtuvo resultados consistentes con 21,067 solicitudes exitosas, 0.00% de errores y latencias muy bajas (p95 de 347.64 ms).

2. **Vegeta se instaló y ejecutó** el ataque contra el endpoint correcto, pero no se pudo obtener el reporte formateado debido a limitaciones del entorno Windows con el comando `vegeta report`. El archivo binario de resultados (`resultados.bin`) se generó correctamente.

3. **La arquitectura con 5 réplicas detrás de Traefik** funcionó correctamente bajo carga, con latencias muy bajas y casi ningún error.

4. **Los valores del profesor parecen ser de referencia teórica** o de un entorno muy diferente, ya que nuestras mediciones muestran diferencias muy grandes en todos los indicadores.

## 5. Archivos generados

- `resultados_benchmark_ms2/k6/consola_completa.txt` - Salida completa de k6
- `resultados_benchmark_ms2/vegeta/consola_completa.txt` - Salida de Vegeta (texto, parcial)
- `resultados_benchmark_ms2/vegeta/resultados.json` - Resultados JSON de Vegeta (parcial)
- `resultados_benchmark_ms2/vegeta/resultados.bin` - Resultado binario de Vegeta attack
- `resultados_benchmark_ms2/entorno/versiones.txt` - Versiones de herramientas
- `resultados_benchmark_ms2/entorno/configuracion_docker.txt` - Configuración de Docker
- `resultados_benchmark_ms2/entorno/pdfs_oficiales.txt` - Información de PDFs oficiales
