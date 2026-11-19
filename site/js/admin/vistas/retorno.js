// Retorno de visitantes: novos x recorrentes, tempo até voltar, origem que fideliza e coortes.
import { api } from "../api.js";
import { query } from "../estado.js";
import { barras, graficoColunas, kpis, rotulosDias } from "../graficos.js";
import { $, CORES, ICONES, ICONE_CANAL, SVG, corHash, dataCurta, dataHora, esc, fmt, iconeMini } from "../util.js";
import { abrirVisitante } from "./visitantes.js";

export async function carregar() {
  const r = await api("/api/admin/retorno" + query());
  kpis("#kpis-retorno", [
    ["Visitantes identificados", fmt.format(r.visitantes_ativos), "", SVG.pessoas, CORES[0]],
    ["Novos", fmt.format(r.novos), "", SVG.novo, CORES[2]],
    ["Recorrentes", fmt.format(r.recorrentes), '<span class="kpi-delta">já tinham visitado antes</span>', SVG.volta, CORES[6]],
    ["Novos que voltaram", r.taxa_retorno_novos + "%", "", SVG.pct, CORES[3]],
    ["Sessões por visitante", String(r.sessoes_por_visitante).replace(".", ","), "", SVG.sessao, CORES[1]],
    ["Cobertura", r.cobertura.pct + "%", '<span class="kpi-delta">das sessões têm visitante identificado</span>', SVG.escudo, CORES[4]],
  ]);
  $("#retorno-cobertura").innerHTML = "ℹ️ O retorno só pode ser medido para quem <b>aceitou a coleta</b> (cookie de visitante). No período, " +
    fmt.format(r.cobertura.identificadas) + " sessões foram identificadas e " + fmt.format(r.cobertura.anonimas) + " ficaram anônimas.";

  graficoColunas("g-retorno", rotulosDias(r.serie), [
    { nome: "Novos", valores: r.serie.map((p) => p.novos), cor: CORES[2] },
    { nome: "Recorrentes", valores: r.serie.map((p) => p.recorrentes), cor: CORES[6] },
  ], "#leg-retorno");
  barras("#intervalo", r.intervalo_retorno, { cores: false });

  $("#retorno-canais").innerHTML = r.por_canal.length ? r.por_canal.map((c) => {
    const t = ICONE_CANAL[c.canal] || "site";
    return '<tr><td data-rot="">' + iconeMini(t, (ICONES[t] || {}).cor) + esc(c.canal) + '</td><td class="num" data-rot="Visitantes">' + c.visitantes + '</td><td class="num" data-rot="Voltaram">' + c.voltaram +
      '</td><td class="num" data-rot="Taxa"><b>' + c.taxa + "%</b></td></tr>";
  }).join("") : '<tr><td colspan="4" class="vazio">Sem dados.</td></tr>';

  let h = '<div class="coorte cab"><span>Semana</span><span>Pessoas</span><span>+1 sem</span><span>+2 sem</span><span>+3 sem</span><span>+4 sem</span></div>';
  r.coortes.forEach((c) => {
    h += '<div class="coorte"><span>' + dataCurta(c.semana) + "</span><span>" + c.visitantes + "</span>" + c.retorno.map((p) => p === null || !c.visitantes
      ? '<span class="cel vazia">—</span>'
      : '<span class="cel" style="background:color-mix(in srgb,' + CORES[0] + " " + Math.round(8 + p * .9) + '%, var(--bg-2))">' + (c.visitantes ? p + "%" : "") + "</span>").join("") + "</div>";
  });
  $("#coortes").innerHTML = h;

  $("#tabela-fieis tbody").innerHTML = r.top_visitantes.length ? r.top_visitantes.map((v) =>
    '<tr data-id="' + v.visitante + '"><td data-rot="Visitante"><span class="avatar-mini" style="background:' + corHash(v.visitante) + '">' + v.visitante.slice(0, 2).toUpperCase() + '</span><span class="mono">' + v.visitante.slice(0, 8) +
    '</span></td><td class="num" data-rot="Sessões"><b>' + v.sessoes + '</b></td><td data-rot="Primeira">' + dataHora(v.primeira) + '</td><td data-rot="Última">' + dataHora(v.ultima) + '</td><td data-rot="Origem">' + esc(v.canal) + "</td></tr>"
  ).join("") : '<tr><td colspan="5" class="vazio">Ninguém voltou ainda no período.</td></tr>';
}

export function iniciar() {
  $("#tabela-fieis").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) abrirVisitante(tr.dataset.id); });
}
