/**
 * estilos.js — Ligia Manzano Salón
 * La CSP de Vercel (vercel.json: style-src 'self') bloquea los atributos style="…" que llegan en el HTML,
 * así que los valores que se calculan al vuelo (grilla de las hojas, sangrías, alto de las barras) van en
 * data-estilo="…" y este módulo los aplica por JavaScript (CSSOM), que la CSP sí permite.
 * Basta con importarlo: aplica lo que ya está en la página y todo lo que se agregue después (innerHTML).
 */

function aplicar(raiz) {
  const nodos = raiz.matches?.('[data-estilo]') ? [raiz] : [];
  for (const el of [...nodos, ...(raiz.querySelectorAll?.('[data-estilo]') ?? [])]) {
    el.style.cssText += `;${el.dataset.estilo}`;
    el.removeAttribute('data-estilo');
  }
}

// En las pruebas de node no hay document: el módulo no hace nada
if (typeof document !== 'undefined') {
  aplicar(document.documentElement);
  new MutationObserver((cambios) => {
    for (const c of cambios) for (const n of c.addedNodes) if (n.nodeType === 1) aplicar(n);
  }).observe(document.documentElement, { childList: true, subtree: true });
}
