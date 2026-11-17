# pdfinfraestructure

Repositorio de infraestructura y despliegue integrado de la plataforma
MS1 + MS2 + MS3 + MongoDB (gestion y extraccion de documentos PDF).

## Propósito

Orquestacion conjunta de:
- **MS1** (`pdfapigateway`): API Gateway, punto de entrada único.
- **MS3** (`pdfcrudservice`): CRUD de documentos y persistencia en MongoDB.
- **MS2** (`pdfextractext`): extraccion de texto de PDF.
- **MongoDB**: persistencia de documentos.

Flujo síncrono: usuario → Traefik público → MS1 → MS3 → Traefik interno → MS2.
MS3 conserva la comunicación con MongoDB; MS2 no utiliza persistencia.

## Arquitectura y redes integradas

```text
Usuario/k6 -- localhost:8080 --> traefik-public -- proxy_public --> MS1:8000
                                                               |
                                                             app_net
                                                               |
                                                              MS3:8000 -- db_net --> MongoDB:27017
                                                               |
                                                        proxy_internal
                                                               |
                                         traefik-internal:8080 --+--> MS2:8000 × N
```

- `traefik-public` publica únicamente `127.0.0.1:8080` y enruta a MS1.
- `traefik-internal` no publica puertos y solo comparte `proxy_internal` con MS3/MS2.
- `proxy_public`: Traefik público y MS1.
- `app_net`: MS1 y MS3.
- `proxy_internal`: Traefik interno, MS3 y réplicas MS2; es una red interna de Docker.
- `db_net`: MS3 y MongoDB; continúa marcada `internal: true`.
- MongoDB conserva el volumen `pdfinfraestructure_mongo_data`; no publica `27017`.
- Los servicios de aplicación escuchan internamente en `8000`; MongoDB en `27017`.

Ambas instancias fijan Traefik en `v3.7.13`, tienen Docker provider habilitado,
`exposedByDefault=false`, restricciones de descubrimiento separadas, dashboard/API
deshabilitados y socket Docker montado de solo lectura. `:ro` no es una garantía
de aislamiento de la API Docker; el acceso al daemon sigue siendo un riesgo.

Cada microservicio es un repositorio Git independiente con su propio ciclo de
vida. Este repositorio contiene únicamente la configuración de despliegue
conjunto y los recursos de infraestructura compartidos (pruebas de
rendimiento, PDFs de prueba, resultados y herramientas).

## Relación entre los cuatro repositorios

Las cuatro carpetas son hermanas bajo el mismo directorio padre
(`Integracion/`):

```text
Integracion/
├── pdfinfraestructure/    # este repositorio: infraestructura compartida
├── pdfapigateway/         # MS1
├── pdfextractext/         # MS2
└── pdfcrudservice/        # MS3
```

## Estructura de carpetas

```text
pdfinfraestructure/
├── docker-compose.integration.yml   # Orquestacion integrada (MS1 + MS3 + MS2 + MongoDB)
├── .env.example                     # Variables de ejemplo (sin credenciales reales)
├── .gitignore
├── README.md
├── performance/
│   ├── k6/
│   │   ├── ms2/                     # Scripts k6 de escenario MS2 directo
│   │   └── integration/             # Scripts k6 de escenario integrado (via MS1)
│   ├── vegeta/
│   │   ├── ms2/                     # Tooling Vegeta de benchmarks MS2
│   │   └── integration/             # Pendiente: implementacion de Vegeta para integracion
│   ├── shared/
│   │   └── pdfs/
│   │       ├── valid/               # PDFs validos (<= 5 MB) para pruebas positivas
│   │       └── invalid/             # PDF de prueba negativa (HTTP 413)
│   └── results/
│       ├── ms2/                     # Resultados de benchmarks de MS2
│       └── integration/             # Resultados de pruebas integradas
├── informes_rendimiento/            # Informes de rendimiento del proyecto
└── tools/                           # Herramientas de infraestructura
```

## Variables de entorno

Copiar `.env.example` a `.env` y ajustar los valores antes de ejecutar el
despliegue. Ese archivo solo lo lee Docker Compose para interpolar e inyectar
variables; no se monta ni se copia dentro de los contenedores. Las aplicaciones
leen exclusivamente variables del entorno. Para ejecutar un servicio localmente
fuera de Docker, desde la carpeta de ese microservicio usar
`uv run --env-file ../pdfinfraestructure/.env ...`.
El archivo `.env` con credenciales reales no se versiona (ver `.gitignore`).

La plantilla central documenta las variables y ejemplos. La selección depende
del modo de ejecución:

| Variable(s) | Uso |
|---|---|
| `MONGO_INITDB_ROOT_USERNAME`, `MONGO_INITDB_ROOT_PASSWORD`, `MONGO_DB_DEV`, `MONGO_COLLECTION` | Compose configura MongoDB y los parámetros de MS3. `MONGO_URL` se usa al ejecutar MS3 localmente; Docker recibe una URI interna autenticada hacia `db`. |
| `MS3_URL`, `EXTRACT_SERVICE_URL` | Direcciones locales usadas al ejecutar MS1/MS3 fuera de Docker. |
| `MS3_URL_DOCKER`, `EXTRACT_SERVICE_URL_DOCKER` | Direcciones internas inyectadas por el Compose integrado. |
| `EXTRACT_SERVICE_URL_SINGLE_DOCKER`, `MONGO_URL_DOCKER` | Overrides opcionales para el Compose individual de MS3 y la URI interna de MongoDB, respectivamente. |
| `MAX_FILE_SIZE_MB`, `EXTRACT_SERVICE_TIMEOUT`, `MS3_TIMEOUT`, `LOG_LEVEL` | Ajustes de aplicación inyectados en los servicios correspondientes. |
| `TRAEFIK_PUBLIC_HOST_PORT` | Puerto host de Traefik público en el Compose integrado; default `8080`. |
| `APP_PORT`, `MS2_HOST_PORT` | Solo publican MS3/MS2, respectivamente, al combinar el Compose individual con su override `docker-compose.single.yml`; no cambian el puerto interno `8000`. |

Para Compose individual, indicar explícitamente el archivo central con
`--env-file ../pdfinfraestructure/.env` al ejecutar desde el repositorio del
servicio. El Compose integrado debe ejecutarse desde `pdfinfraestructure/`.

## Ejecutar el despliegue integrado

Desde la carpeta `pdfinfraestructure/`:

```powershell
docker compose -f docker-compose.integration.yml config --quiet   # validar sintaxis
docker compose -f docker-compose.integration.yml build            # construir imagenes
docker compose -f docker-compose.integration.yml up -d            # levantar servicios
```

Puerto publicado: Traefik público en `127.0.0.1:8080` (`TRAEFIK_PUBLIC_HOST_PORT`).
MS1, MS2, MS3 y MongoDB no publican puertos al host.

Para escalar MS2 manualmente, ejecutar desde `pdfinfraestructure/`:

```bash
docker compose -f docker-compose.integration.yml up -d --scale extract-service=1
docker compose -f docker-compose.integration.yml up -d --scale extract-service=2
docker compose -f docker-compose.integration.yml up -d --scale extract-service=3
docker compose -f docker-compose.integration.yml up -d --scale extract-service=5
```

Traefik interno descubre cada contenedor MS2 mediante Docker provider y balancea
entre sus réplicas saludables. No se configura autoscaling ni Swarm.

## Compose individuales

Los Compose individuales de MS2 y MS3 son para desarrollo independiente y no
forman parte de este despliegue integrado. El Compose individual de MS3 conserva
su propia configuración de Traefik; no combinarlo con este stack centralizado.
El Compose individual de MS2 permanece sin proxy y no se modifica en esta etapa.
Para integración, usar únicamente `docker-compose.integration.yml`.

## Correcciones aplicadas (ETAPA 16.3)

1. **Docker Compose integrado:** los contextos de compilacion se corrigieron
   para apuntar a los repositorios hermanos desde `pdfinfraestructure/`:
   `../pdfextractext`, `../pdfcrudservice`, `../pdfapigateway`. El archivo se
   ejecuta desde `pdfinfraestructure/` (no desde la raiz de `Integracion/`).

2. **Script k6 de MS2 (`performance/k6/ms2/ms2_official_spike.js`):**
   las rutas de `open()` se corrigieron para leer los PDFs oficiales desde
   `../../shared/pdfs/valid/` (copia centralizada) en lugar de la ruta previa
   al arbol `pdfextractext/tests/stress/pdfs/`.

3. **Tooling Vegeta (`performance/vegeta/ms2/run_report.bat`):**
   las rutas absolutas al workspace anterior se remplazaron por rutas relativas
   (`%~dp0`) que funcionan desde la nueva ubicacion.

## PDFs oficiales y independencia de MS2

Los cuatro PDFs oficiales (3 validos en `valid/` y 1 de prueba negativa en
`invalid/`) estan centralizados en `performance/shared/pdfs/`. Adicionalmente,
**MS2 conserva copias locales de los 4 PDFs en `tests/stress/pdfs/`** para que
sus pruebas independientes (`spike_tests.js`, `targets.txt` de Vegeta) puedan
ejecutarse sin depender de otros repositorios, cumpliendo el requisito de que
cada repositorio sea usable de forma autonoma.

## Notas de migracion pendientes

- `docker-compose.ms2.yml` no existe en el sistema de archivos; su creacion
  queda pendiente de una etapa posterior.
- `performance/vegeta/integration/` esta vacia: no se inventan scripts de
  Vegeta para integracion; esa implementacion continua pendiente.
- No se configuraron remotos, no se hicieron commits ni se inicializo Git en
  este repositorio en esta etapa.
