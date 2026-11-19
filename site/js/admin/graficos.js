// Gráficos reutilizáveis: barras HTML, funil, mapa de calor, fluxo (sankey) e linhas/colunas (Chart.js).
import { $, CORES, ICONES, cssVar, dataCurta, esc, fmt, iconeMini, paleta } from "./util.js";

const charts = {};

export function destruirGraficos() { Object.keys(charts).forEach((k) => { charts[k].destroy(); delete charts[k]; }); }

function opcoesBase(extra) {
  return Object.assign({
    responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: { backgroundColor: cssVar("--card"), borderColor: cssVar("--borda-2"), borderWidth: 1, titleColor: cssVar("--txt"), bodyColor: cssVar("--txt-2"), padding: 10, boxPadding: 4, usePointStyle: true },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: cssVar("--txt-3"), maxRotation: 0, autoSkipPadding: 14 }, border: { color: cssVar("--borda") } },
      y: { beginAtZero: true, grid: { color: cssVar("--borda") }, ticks: { color: cssVar("--txt-3"), precision: 0 }, border: { display: false } },
    },
  }, extra || {});
}

/** Linhas por dia. `series`: [{nome, valores, cor, tracejada, preenchida}] */
export function graficoLinhas(id, rotulos, series, legendaSel) {
  const ctx = $("#" + id);
  if (legendaSel) $(legendaSel).innerHTML = series.map((s) => '<span><i style="background:' + s.cor + (s.tracejada ? ";opacity:.55" : "") + '"></i>' + esc(s.nome) + "</span>").join("");
  if (!window.Chart) { ctx.parentElement.innerHTML = '<p class="vazio">Chart.js não carregou.</p>'; return; }
  const dados = {
    labels: rotulos,
    datasets: series.map((s) => ({
      label: s.nome, data: s.valores, borderColor: s.cor, backgroundColor: s.cor + "26", fill: !!s.preenchida,
      borderWidth: s.tracejada ? 1.6 : 2, borderDash: s.tracejada ? [5, 5] : [], tension: .35,
      pointRadius: rotulos.length > 40 || s.tracejada ? 0 : 3, pointHoverRadius: 5, pointBackgroundColor: s.cor, pointBorderColor: cssVar("--card"), pointBorderWidth: 2,
      extra: s.extra,
    })),
  };
  if (charts[id]) { charts[id].data = dados; charts[id].update(); return; }
  charts[id] = new Chart(ctx, {
    type: "line", data: dados,
    options: opcoesBase({
      plugins: Object.assign(opcoesBase().plugins, {
        tooltip: Object.assign(opcoesBase().plugins.tooltip, {
          callbacks: { label: (c) => " " + c.dataset.label + ": " + fmt.format(c.parsed.y) + (c.dataset.extra ? " (" + c.dataset.extra[c.dataIndex] + ")" : "") },
        }),
      }),
    }),
  });
}

/** Colunas empilhadas por dia. */
export function graficoColunas(id, rotulos, series, legendaSel) {
  const ctx = $("#" + id);
  if (legendaSel) $(legendaSel).innerHTML = series.map((s) => '<span><i style="background:' + s.cor + '"></i>' + esc(s.nome) + "</span>").join("");
  if (!window.Chart) return;
  const dados = { labels: rotulos, datasets: series.map((s) => ({ label: s.nome, data: s.valores, backgroundColor: s.cor, borderRadius: 4, borderSkipped: false, borderColor: cssVar("--card"), borderWidth: { top: 2 }, maxBarThickness: 28 })) };
  if (charts[id]) { charts[id].data = dados; charts[id].update(); return; }
  const op = opcoesBase();
  op.scales.x.stacked = true; op.scales.y.stacked = true;
  charts[id] = new Chart(ctx, { type: "bar", data: dados, options: op });
}

export const rotulosDias = (serie) => serie.map((p) => dataCurta(p.dia));

/** Barras horizontais em HTML. */
export function barras(sel, itens, op) {
  op = op || {};
  const el = $(sel);
  if (!itens || !itens.length) { el.innerHTML = '<p class="vazio">Sem dados no período.</p>'; return; }
  const total = itens.reduce((a, b) => a + b.valor, 0) || 1;
  const max = Math.max(...itens.map((i) => i.valor), 1);
  el.innerHTML = itens.map((i, n) => {
    const cor = i.nome === "Outros" ? paleta.cinza : (op.cores ? CORES[n % 8] : CORES[0]);
    const tipo = op.icone ? op.icone(i.nome) : null;
    const ic = tipo ? iconeMini(tipo, (ICONES[tipo] || {}).cor) : "";
    return '<div class="barra"><div class="barra-nome">' + ic + "<span>" + esc(i.nome || "—") + '</span></div><div class="barra-val"><b>' + fmt.format(i.valor) + "</b> · " + Math.round(100 * i.valor / total) +
      '%</div><div class="barra-trilho"><i style="width:' + (100 * i.valor / max) + "%;background:" + cor + '"></i></div></div>';
  }).join("");
}

export function funil(sel, etapas) {
  const max = Math.max(1, etapas[0].valor);
  $(sel).innerHTML = etapas.map((e, i) => {
    const pct = Math.round(100 * e.valor / max);
    const conv = i > 0 && etapas[i - 1].valor ? Math.round(100 * e.valor / etapas[i - 1].valor) + "% da etapa anterior" : (i === 0 ? "sessões no período" : "—");
    return '<div class="funil-etapa"><i style="width:' + pct + '%"></i><div><span>' + esc(e.etapa) + "</span><b>" + fmt.format(e.valor) + "</b></div><small>" + conv + "</small></div>";
  }).join("");
}

export function mapaCalor(sel, m) {
  const dias = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const max = Math.max(1, ...m.flat());
  let h = "<span></span>";
  for (let i = 0; i < 24; i++) h += '<span class="h">' + (i % 3 === 0 ? i + "h" : "") + "</span>";
  m.forEach((linha, d) => {
    h += '<span class="d">' + dias[d] + "</span>";
    linha.forEach((v, hr) => {
      const a = v ? .12 + .88 * (v / max) : 0;
      h += '<span class="c" style="' + (v ? "background:color-mix(in srgb," + CORES[0] + " " + Math.round(a * 100) + "%, var(--bg-2))" : "") + '" title="' + dias[d] + " " + hr + "h — " + v + ' visitas"></span>';
    });
  });
  $(sel).innerHTML = h;
}

export function sankey(sel, fluxo) {
  const el = $(sel);
  if (!fluxo.length) { el.innerHTML = '<p class="vazio">Ainda não há cliques no período. Quando alguém clicar em um link, o caminho aparece aqui.</p>'; return; }
  const somaPor = (campo) => { const m = new Map(); fluxo.forEach((f) => m.set(f[campo], (m.get(f[campo]) || 0) + f.valor)); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  const esq = somaPor("origem"), dir = somaPor("destino");
  const total = fluxo.reduce((a, f) => a + f.valor, 0);
  const W = Math.max(640, el.clientWidth || 800), gap = 10, nodeW = 12, padX = 150, slot = 38;
  const n = Math.max(esq.length, dir.length);
  const k = Math.max(220, n * 44) / total;
  const corOrigem = new Map(esq.map(([nome], i) => [nome, i < 8 ? CORES[i] : paleta.cinza]));
  function posicoes(lista) {
    let y = 0; const m = new Map();
    lista.forEach(([nome, v]) => { const h = Math.max(3, v * k); m.set(nome, { y, h, off: 0 }); y += Math.max(h + gap, slot); });
    return { m, alt: y };
  }
  const A = posicoes(esq), B = posicoes(dir), H = Math.max(A.alt, B.alt);
  [A, B].forEach((P) => { const d = (H - P.alt) / 2; P.m.forEach((v) => (v.y += d)); });
  const pe = A.m, pd = B.m, x0 = padX, x1 = W - padX;
  let faixas = "";
  const ordenado = [...fluxo].sort((a, b) => esq.findIndex((e) => e[0] === a.origem) - esq.findIndex((e) => e[0] === b.origem) || dir.findIndex((d) => d[0] === a.destino) - dir.findIndex((d) => d[0] === b.destino));
  ordenado.forEach((f) => {
    const a = pe.get(f.origem), b = pd.get(f.destino), w = Math.max(1.5, f.valor * k);
    const ya = a.y + a.off + w / 2, yb = b.y + b.off + w / 2; a.off += f.valor * k; b.off += f.valor * k;
    const mx = (x0 + nodeW + x1) / 2;
    faixas += '<path class="faixa" d="M' + (x0 + nodeW) + "," + ya + " C" + mx + "," + ya + " " + mx + "," + yb + " " + x1 + "," + yb + '" stroke="' + corOrigem.get(f.origem) + '" stroke-width="' + w + '"><title>' + esc(f.origem) + " → " + esc(f.destino) + ": " + f.valor + " clique(s)</title></path>";
  });
  let nos = "";
  esq.forEach(([nome, v]) => { const p = pe.get(nome); nos += '<rect x="' + x0 + '" y="' + p.y + '" width="' + nodeW + '" height="' + p.h + '" rx="3" fill="' + corOrigem.get(nome) + '"/><text x="' + (x0 - 10) + '" y="' + (p.y + p.h / 2 - 2) + '" text-anchor="end">' + esc(nome) + '</text><text class="v" x="' + (x0 - 10) + '" y="' + (p.y + p.h / 2 + 12) + '" text-anchor="end">' + v + " cliques</text>"; });
  dir.forEach(([nome, v]) => { const p = pd.get(nome); nos += '<rect x="' + x1 + '" y="' + p.y + '" width="' + nodeW + '" height="' + p.h + '" rx="3" fill="' + paleta.cinza + '"/><text x="' + (x1 + nodeW + 10) + '" y="' + (p.y + p.h / 2 - 2) + '">' + esc(nome) + '</text><text class="v" x="' + (x1 + nodeW + 10) + '" y="' + (p.y + p.h / 2 + 12) + '">' + v + " (" + Math.round(100 * v / total) + "%)</text>"; });
  el.innerHTML = '<svg viewBox="0 0 ' + W + " " + (H + 10) + '" role="img" aria-label="Fluxo de origem para destino">' + faixas + nos +
    '<text class="v" x="' + x0 + '" y="' + (H + 8) + '">ORIGEM</text><text class="v" x="' + (x1 + nodeW) + '" y="' + (H + 8) + '" text-anchor="end">DESTINO</text></svg>';
}

/** Cartões de indicadores. itens: [rotulo, valor, deltaHTML, iconeSVG, cor] */
export function kpis(sel, itens) {
  $(sel).innerHTML = itens.map(([r, v, d, svg, c]) => '<div class="kpi" style="--c:' + c + '"><div class="kpi-topo"><span class="kpi-ico"><svg class="i" viewBox="0 0 24 24">' + svg +
    '</svg></span><span class="kpi-rot">' + r + '</span></div><div class="kpi-val">' + v + "</div>" + (d || "") + "</div>").join("");
}
