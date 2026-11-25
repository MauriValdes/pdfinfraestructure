# Plan de desarrollo paralelo

## Propósito y fuente de referencia

Este documento organiza las responsabilidades, límites y metodología de trabajo de los compañeros A y B durante las etapas 2 y 3. No reemplaza ni modifica decisiones arquitectónicas.

La fuente oficial de arquitectura es [`docs/ARQUITECTURA_TECNICA.md`](ARQUITECTURA_TECNICA.md). Los detalles no especificados aquí se rigen por ese documento.

## 1. Estado inicial

- La Etapa 1 está finalizada y publicada.
- La base común de procesamiento está implementada.
- Estado de pruebas: **355 exitosas, 2 omitidas y ninguna fallida**.
- Commit base de `pdfcrudservice`: `b2725b8`.
- Commit de arquitectura en `pdfinfraestructure`: `a2bddd6`.
- Ambos desarrolladores tienen incorporados estos commits.

## 2. Organización de ramas

En `pdfcrudservice`:

| Rama | Uso |
|---|---|
| `main` | Código estable |
| `feature/async-api` | Trabajo del compañero B |
| `feature/pdf-worker` | Trabajo del compañero A |

Ambas ramas de trabajo están publicadas y parten del mismo commit. Las ramas de los demás repositorios se crearán cuando sean necesarias.

## 3. Responsabilidades del compañero B — Etapa 2

El compañero B es responsable de:

1. Orquestar la recepción de PDFs.
2. Adquirir y renovar la propiedad de carga.
3. Almacenar los PDFs de forma durable en GridFS.
4. Finalizar la carga atómicamente.
5. Gestionar la deduplicación y las solicitudes concurrentes.
6. Sustituir el flujo síncrono anterior.
7. Implementar las respuestas HTTP según la arquitectura.
8. Implementar la consulta de documentos y estados.
9. Aplicar las restricciones de `PATCH` y `DELETE`.
10. Integrar MS1 con MS3.
11. Añadir las pruebas unitarias y de integración correspondientes.

Áreas y archivos bajo su responsabilidad:

- `src/api/docs_api.py`
- `src/services/document_service.py`
- `src/repository/document_repository.py`
- Schemas públicos de la API.
- Configuración específica de recepción.
- `pdfapigateway`.
- Pruebas de las funcionalidades anteriores.

B no modifica la lógica de procesamiento del worker.

## 4. Responsabilidades del compañero A — Etapa 3

El compañero A es responsable de:

1. Crear el repositorio específico de procesamiento.
2. Añadir los índices MongoDB necesarios para procesamiento, según la arquitectura.
3. Implementar el reclamo atómico de trabajos.
4. Implementar el lease de procesamiento.
5. Implementar el heartbeat.
6. Gestionar el fencing token.
7. Gestionar `processing_cycle_id`.
8. Leer PDFs desde GridFS.
9. Implementar el cliente HTTP hacia MS2.
10. Persistir resultados de forma segura.
11. Implementar el worker como proceso independiente.
12. Añadir las pruebas unitarias y de integración correspondientes.

Ubicaciones acordadas:

- `pdfcrudservice/src/worker/`
- `pdfcrudservice/src/repository/processing_repository.py`

El worker tendrá su propio punto de entrada y configuración específica. No se creará un quinto repositorio.

A no modifica `document_repository.py`, `document_service.py` ni los endpoints públicos sin coordinación previa con B. Los reintentos avanzados, el circuit breaker y las demás funcionalidades de etapas posteriores se abordarán cuando corresponda.

## 5. Contrato compartido

- El punto de integración es un documento correctamente finalizado en estado `pending`, con `file_id` de tipo `ObjectId` asociado a un PDF persistido en GridFS.
- El worker solo reclama documentos `pending` cuyo `file_id` sea válido y cuyo `next_retry_at` esté ausente, sea nulo o haya vencido.
- La propiedad de carga es independiente de la propiedad de procesamiento.
- Un lease de carga vigente no impide procesar un documento correctamente finalizado.
- Los campos de procesamiento compartidos ya implementados son:
  - `worker_id`
  - `lease_until`
  - `heartbeat_at`
  - `fencing_token`
  - `processing_cycle_id`
  - `attempt_count`
  - `next_retry_at`
- `fencing_token` cambia por cada reclamación.
- `processing_cycle_id` y `attempt_count` se conservan durante los reintentos automáticos y la recuperación del mismo ciclo.
- Las escrituras del worker se realizan mediante operaciones atómicas protegidas por propiedad vigente y fencing token.
- La recuperación de documentos `processing` con lease vencido es una operación independiente.

Los demás detalles se rigen por la arquitectura técnica oficial.

## 6. Archivos compartidos

Los cambios en los siguientes componentes requieren coordinación previa:

- `src/models/document.py`
- `src/database/mongodb.py`
- `src/repository/gridfs_repository.py`
- Configuración compartida.
- Dependencias y archivos de lock.
- Configuración común de pytest.
- Dockerfile.
- Docker Compose.
- `.env.example`.
- Arquitectura técnica.

Antes de modificar un archivo compartido, comunicar el cambio al otro desarrollador y acordar quién será responsable de realizarlo e integrarlo. No versionar archivos `.env` ni credenciales.

## 7. Metodología de desarrollo

Ambos desarrolladores deberán respetar:

- Twelve-Factor App.
- TDD: RED, GREEN y REFACTOR cuando corresponda.
- Análisis acotado antes de implementar.
- Revisión del código y de los diffs.
- Pruebas unitarias.
- Pruebas de integración con MongoDB real cuando corresponda.
- Bases y credenciales de testing aisladas.
- Regresión completa antes de integrar.
- Commits pequeños y descriptivos.

No utilizar credenciales root para la ejecución normal de los servicios. No adelantar funcionalidades fuera del alcance asignado.

## 8. Metodología Git

- Cada integrante trabaja en su propia rama.
- Verificar la rama activa antes de modificar archivos.
- No realizar pushes directos a `main` durante el desarrollo de funcionalidades.
- Publicar avances mediante `git push` sobre la rama correspondiente.
- No utilizar force push.
- No agregar archivos indiscriminadamente con `git add .`.
- Integrar unidades funcionales validadas mediante Pull Requests.
- El otro integrante revisa los cambios antes de aprobar la integración.
- Resolver conflictos de forma coordinada.
- Sincronizar `main` y las ramas de trabajo después de las integraciones.

## 9. Validación independiente

- A no necesita esperar a que B termine la API asíncrona. Puede preparar documentos válidos mediante las primitivas de persistencia de la Etapa 1, almacenando PDFs reales en GridFS y finalizando la carga en una base de testing aislada.
- B puede validar el flujo de recepción sin que exista todavía un worker activo.

## 10. Integración conjunta

El worker no se activará en el entorno integrado hasta que se cumplan todas estas condiciones:

- La recepción asíncrona esté implementada y validada.
- El flujo síncrono anterior haya sido sustituido.
- El worker esté validado individualmente.
- Se hayan revisado los contratos compartidos.
- Se realicen las pruebas conjuntas correspondientes en un entorno aislado.

La decisión de integración debe evitar que dos mecanismos procesen simultáneamente el mismo documento.

## 11. Seguimiento

Las tareas comienzan pendientes de implementación. Actualizar esta tabla conforme se completen funcionalidades y se alcancen puntos de integración.

| Responsable | Tarea o entregable | Estado |
|---|---|---|
| B | Orquestación de recepción de PDFs | Pendiente |
| B | Propiedad de carga, lease y renovación | Pendiente |
| B | Almacenamiento durable en GridFS y finalización atómica | Pendiente |
| B | Deduplicación y solicitudes concurrentes | Pendiente |
| B | Sustitución del flujo síncrono y respuestas HTTP | Pendiente |
| B | Consulta de documentos y estados; restricciones de `PATCH` y `DELETE` | Pendiente |
| B | Integración MS1–MS3 | Pendiente |
| B | Pruebas de Etapa 2 y validación del flujo sin worker | Pendiente |
| A | Repositorio de procesamiento e índices necesarios | Pendiente |
| A | Reclamo atómico, lease, heartbeat y fencing | Pendiente |
| A | Gestión de `processing_cycle_id` y recuperación independiente | Pendiente |
| A | Lectura desde GridFS y cliente HTTP hacia MS2 | Pendiente |
| A | Persistencia protegida de resultados y proceso worker independiente | Pendiente |
| A | Pruebas de Etapa 3 y validación individual | Pendiente |
| A y B | Revisión de contratos y archivos compartidos | Pendiente |
| A y B | Pruebas conjuntas aisladas y decisión de integración | Pendiente |
