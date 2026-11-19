// Visão geral: indicadores, gráfico diário (com comparação), funil, links, canais e horários.
import { api } from "../api.js";
import { estado, query } from "../estado.js";
import { barras, funil, graficoLinhas, kpis, mapaCalor, rotulosDias } from "../graficos.js";
import { $, CORES, ICONES, ICONE_CANAL, SVG, dataCurta, duracao, esc, fmt, iconeMini, variacao } from "../util.js";

export async function carregar() {
  estado.stats = await api("/api/admin/estatisticas" + query());
  render(estado.stats);
}

function delta(atual, ant) {
  const v = variacao(atual, ant);
  return '<span class="kpi-delta ' + v.cls + '">' + v.txt + (v.txt !== "—" && v.txt !== "novo" ? " vs. anterior" : "") + "</span>";
}

export function render(s) {
  const k = s.kpis, a = s.kpis_anterior;
  kpis("#kpis", [
    ["Visualizações", fmt.format(k.visualizacoes), delta(k.visualizacoes, a.visualizacoes), SVG.olho, CORES[0]],
    ["Sessões", fmt.format(k.sessoes), delta(k.sessoes, a.sessoes), SVG.sessao, CORES[6]],
    ["Cliques em links", fmt.format(k.cliques), delta(k.cliques, a.cliques), SVG.clique, CORES[2]],
    ["Taxa de clique (CTR)", k.ctr + "%", delta(k.ctr, a.ctr), SVG.pct, CORES[3]],
    ["Tempo médio na página", duracao(k.tempo_medio_s * 1000), delta(k.tempo_medio_s, a.tempo_medio_s), SVG.tempo, CORES[1]],
    ["Aceitaram a coleta", k.consentimento_taxa + "%", '<span class="kpi-delta">' + fmt.format(k.visitantes_identificados) + " visitantes identificados</span>", SVG.escudo, CORES[4]],
  ]);

  const series = [
    { nome: "Visualizações", valores: s.serie.map((p) => p.visualizacoes), cor: CORES[0], preenchida: true },
    { nome: "Cliques", valores: s.serie.map((p) => p.cliques), cor: CORES[2] },
  ];
  if (estado.comparar) {
    const ant = s.serie_anterior;
    const extra = ant.map((p) => dataCurta(p.dia));
    series.push({ nome: "Visualizações (anterior)", valores: s.serie.map((_, i) => (ant[i] || {}).visualizacoes ?? null), cor: CORES[0], tracejada: true, extra });
    series.push({ nome: "Cliques (anterior)", valores: s.serie.map((_, i) => (ant[i] || {}).cliques ?? null), cor: CORES[2], tracejada: true, extra });
  }
  graficoLinhas("g-serie", rotulosDias(s.serie), series, "#leg-serie");
  funil("#funil", s.funil);

  const r = s.robos;
  $("#robos-resumo").innerHTML = r.total
    ? '<div class="robos-linha"><svg class="i" viewBox="0 0 24 24"><rect x="4" y="8" width="16" height="12" rx="2"/><path d="M12 4v4M8 14h.01M16 14h.01"/></svg><span><b>' + fmt.format(r.total) +
      "</b> acessos de robôs e prévias " + (estado.robos ? "incluídos" : "filtrados") + " (" + r.previas + " prévias de link)</span></div>"
    : "";

  renderComparacao(s);
  renderLinks(s.links);
  barras("#canais", s.canais, { icone: (n) => ICONE_CANAL[n] || "site", cores: true });
  barras("#dispositivos", s.dispositivos);
  barras("#navegadores", s.navegadores);
  barras("#sistemas", s.sistemas);
  mapaCalor("#calor", s.calor);
}

function linhaCmp(nome, ant, atual, icone) {
  const v = variacao(atual, ant);
  return "<tr><td data-rot=\"\">" + (icone || "") + esc(nome) + '</td><td class="num" data-rot="Anterior">' + fmt.format(ant) + '</td><td class="num" data-rot="Atual"><b>' + fmt.format(atual) +
    '</b></td><td class="num ' + v.cls + '" data-rot="Variação">' + v.txt + "</td></tr>";
}

function renderComparacao(s) {
  const card = $("#card-comparacao");
  card.hidden = !estado.comparar;
  if (!estado.comparar) return;
  const p = s.periodo;
  $("#cmp-legenda").textContent = dataCurta(p.cmp_de) + " – " + dataCurta(p.cmp_ate) + "  →  " + dataCurta(p.de) + " – " + dataCurta(p.ate);
  $("#cmp-links").innerHTML = s.links.length
    ? s.links.map((l) => linhaCmp(l.titulo || l.id, l.cliques_anterior, l.cliques, iconeMini(l.tipo, (ICONES[l.tipo] || {}).cor))).join("")
    : '<tr><td colspan="4" class="vazio">Sem links.</td></tr>';
  $("#cmp-canais").innerHTML = s.comparacao_canais.length
    ? s.comparacao_canais.map((c) => linhaCmp(c.nome, c.anterior, c.atual, iconeMini(ICONE_CANAL[c.nome] || "site", (ICONES[ICONE_CANAL[c.nome] || "site"] || {}).cor))).join("")
    : '<tr><td colspan="4" class="vazio">Sem visitas.</td></tr>';
}

function renderLinks(links) {
  const el = $("#ranking-links");
  if (!links.length) { el.innerHTML = '<p class="vazio">Nenhum link cadastrado nesta página.</p>'; return; }
  const max = Math.max(1, ...links.map((l) => l.cliques));
  el.innerHTML = links.map((l) => {
    const ic = ICONES[l.tipo] || ICONES.link;
    const v = estado.comparar ? variacao(l.cliques, l.cliques_anterior) : null;
    return '<div class="barra" title="' + esc(l.url || "") + '"><div class="barra-nome">' + iconeMini(l.tipo, ic.cor) + "<span>" + esc(l.titulo || l.id) + (l.ativo ? "" : ' <small class="muted">(inativo)</small>') + "</span></div>" +
      '<div class="barra-val"><b>' + fmt.format(l.cliques) + "</b> · " + fmt.format(l.unicos) + " · " + l.ctr + "%" + (v ? ' <span class="' + v.cls + '">' + v.txt + "</span>" : "") + "</div>" +
      '<div class="barra-trilho"><i style="width:' + (100 * l.cliques / max) + "%;background:" + CORES[0] + '"></i></div></div>';
  }).join("");
}
