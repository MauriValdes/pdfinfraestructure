# pdfinfraestructure

Repositorio de infraestructura y despliegue integrado de la plataforma
MS1 + MS2 + MS3 + MongoDB (gestion y extraccion de documentos PDF).

## Propósito

Orquestacion conjunta de:
- **MS1** (`pdfapigateway`): API Gateway, punto de entrada único.
- **MS3** (`pdfcrudservice`): CRUD de documentos y persistencia en MongoDB.
- **MS2** (`pdfextractext`): extraccion de texto de PDF.
- **MongoDB**: persistencia de documentos.

Flujo síncrono: MS1 → MS3 → MS2 → MongoDB.

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
despliegue. El archivo `.env` con credenciales reales no se versiona (ver
`.gitignore`).

## Ejecutar el despliegue integrado

Desde la carpeta `pdfinfraestructure/`:

```powershell
docker compose -f docker-compose.integration.yml config --quiet   # validar sintaxis
docker compose -f docker-compose.integration.yml build            # construir imagenes
docker compose -f docker-compose.integration.yml up -d            # levantar servicios
```

Puertos publicados: MS1 (8003), MS3 (8001), MS2 (8002), MongoDB inspeccion (27018).
Redes: `integration_net` (MS1, MS3, MS2), `db_net` (MongoDB, MS3, interna).
Volumen: `mongo_data` (persistencia de MongoDB).

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
