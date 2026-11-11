// =============================================================================
// k6 — Validación de rendimiento MS2 con PDFs oficiales (ETAPA 14.11)
//
// Endpoint: POST /extract (MS2 directo vía Traefik)
// Descripción: Mide el rendimiento de MS2 utilizando exclusivamente los
// PDFs oficiales que cumplen el límite de 5 MB.
// Perfil de carga: 0→100 VUs en 10s, 100 VUs sostenidos 20s, 100→0 en 10s.
// Uso:
//   k6 run -e BASE_URL=http://localhost:80 performance/k6/ms2_official_spike.js
// =============================================================================
import http from 'k6/http';
import { check } from 'k6';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:80';

// Los archivos se abren en el "init context": k6 los carga UNA sola vez
// por VU y los reutilizan en todas las iteraciones (eficiente en memoria).
// Solo se incluyen los PDFs oficiales que cumplen el límite de 5 MB.
const FIXTURES = [
  { name: '2020-Scrum-Guide-Spanish-Latin-South-American.pdf', data: open('../../shared/pdfs/valid/2020-Scrum-Guide-Spanish-Latin-South-American.pdf', 'b') },
  { name: 'Filosofia Lean.pdf', data: open('../../shared/pdfs/valid/Filosofia Lean.pdf', 'b') },
  { name: 'scrum_manager_historias_usuario.pdf', data: open('../../shared/pdfs/valid/scrum_manager_historias_usuario.pdf', 'b') },
];

export const options = {
  scenarios: {
    spike: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '10s', target: 100 }, // Spike: 0 -> 100 VUs
        { duration: '20s', target: 100 }, // Sostenido: 100 VUs
        { duration: '10s', target: 0 },   // Descenso: 100 -> 0 VUs
      ],
    },
  },
  thresholds: {
    // Umbrales iniciales (ajustables según los objetivos del TP)
    http_req_failed: ['rate<0.05'], // menos del 5% de errores
    http_req_duration: ['p(95)<5000'], // p95 por debajo de 5s bajo spike
  },
};

export default function () {
  // Rotación round-robin de archivos por iteración
  const fixture = FIXTURES[__ITER % FIXTURES.length];

  // Enviar los bytes directos del PDF con Content-Type: application/pdf
  const res = http.post(`${BASE_URL}/extract`, fixture.data, {
    headers: { 'Content-Type': 'application/pdf' },
    timeout: '30s',
  });

  check(res, {
    'status 200': (r) => r.status === 200,
    'contrato: page_count > 0': (r) => r.status === 200 && r.json('page_count') > 0,
    'contrato: content no vacío': (r) => r.status === 200 && (r.json('content') || '').length > 0,
  });
}
