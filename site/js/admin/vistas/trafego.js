// Tráfego: fluxo origem → destino, feed ao vivo, origens e robôs filtrados.
import { api } from "../api.js";
import { estado, query } from "../estado.js";
import { barras, sankey } from "../graficos.js";
import { $, $$, dataHora, duracao, esc, quando } from "../util.js";

let timer = null, filtro = "", vistos = new Set();

export async function carregar() {
  estado.stats = await api("/api/admin/estatisticas" + query());
  const s = estado.stats;
  sankey("#sankey", s.fluxo);
  barras("#referers", s.referers);
  barras("#campanhas-utm", s.campanhas_utm);
  barras("#robos", s.robos.por_robo);
  barras("#idiomas", s.idiomas);
  barras("#fusos", s.fusos);
  barras("#telas", s.telas);
  await carregarFeed(true);
  parar();
  timer = setInterval(() => { if (!document.hidden) carregarFeed(false).catch(() => {}); }, 10000);
}

export function parar() { if (timer) clearInterval(timer); timer = null; }

export function iniciarFiltros() {
  $("#filtro-eventos").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    filtro = b.dataset.tipo; $$("#filtro-eventos button").forEach((x) => x.classList.toggle("on", x === b)); carregarFeed(true);
  });
}

async function carregarFeed(reset) {
  const extra = { limite: 150 }; if (filtro) extra.tipo = filtro;
  const r = await api("/api/admin/eventos" + query(extra));
  const novos = new Set();
  const html = r.eventos.map((e) => { novos.add(e.id); return itemFeed(e, !reset && !vistos.has(e.id)); }).join("");
  vistos = novos;
  $("#feed").innerHTML = html || '<li class="vazio" style="display:block">Nenhum evento ainda. Abra a página pública para testar.</li>';
}

export function itemFeed(e, novo) {
  const o = e.origem || {}, ua = e.ua_info || {};
  const meta = [];
  if (e.robo) meta.push('<span class="tag robo">🤖 ' + esc(e.robo_nome || "robô") + "</span>");
  if (ua.dispositivo && !e.robo) meta.push('<span class="tag">' + esc(ua.dispositivo) + " · " + esc(ua.navegador) + " · " + esc(ua.sistema) + "</span>");
  if (e.sessao) meta.push('<span class="tag mono" title="sessão">#' + esc(e.sessao.slice(0, 6)) + "</span>");
  if (e.visitante) meta.push('<span class="tag ok" title="visitante identificado">✔ ' + esc(e.visitante.slice(0, 6)) + "</span>");
  if (e.pagina_nome) meta.push('<span class="tag">' + esc(e.pagina_nome) + "</span>");
  let ico = "•", txt = esc(e.tipo);
  if (e.tipo === "pageview") {
    ico = "👁"; txt = "Visita vinda de <b>" + esc(e.canal || o.canal || "Direto") + "</b>";
    if (o.dominio) meta.push('<span class="tag">' + esc(o.dominio) + "</span>");
    const u = e.utm || {}; if (u.utm_campaign) meta.push('<span class="tag">campanha: ' + esc(u.utm_campaign) + "</span>");
  } else if (e.tipo === "clique") {
    ico = "↗"; txt = esc(e.canal || o.canal || "Direto") + '<span class="seta">→</span><b>' + esc(e.link_titulo || e.link_id) + "</b>";
    if (e.destino_host) meta.push('<span class="tag">' + esc(e.destino_host) + "</span>");
    if (e.area) meta.push('<span class="tag">' + (e.area === "icone" ? "pelo ícone" : "pelo botão") + (e.posicao ? " #" + e.posicao : "") + "</span>");
  } else if (e.tipo === "saida") {
    ico = "⏱"; txt = "Saiu após <b>" + duracao(e.duracao_ms) + "</b>"; meta.unshift('<span class="tag">rolou ' + (e.scroll_max || 0) + "%</span>");
  } else if (e.tipo === "consentimento") {
    const ok = (e.dados || {}).escolha === "aceito"; ico = ok ? "✅" : "🚫"; txt = ok ? "Aceitou a coleta" : "Recusou a coleta";
  } else if (e.tipo === "coleta") { ico = "🧬"; txt = "Dados do navegador coletados" + (e.geolocalizacao ? " <b>+ GPS</b>" : ""); }
  else if (e.tipo === "compartilhar") { ico = "🔗"; txt = "Compartilhou a página"; }
  else if (e.tipo === "localizacao") { ico = "📍"; txt = "Localização: <b>" + esc((e.dados || {}).resultado) + "</b>"; }
  else if (e.tipo === "previa") { ico = "🤖"; txt = "Prévia do link gerada por <b>" + esc(e.robo_nome || "robô") + "</b>"; }
  return '<li class="' + (novo ? "novo" : "") + (e.robo ? " eh-robo" : "") + '"><span class="fi ' + esc(e.tipo) + '">' + ico + '</span><div><div class="ft">' + txt +
    '</div><div class="fm">' + meta.join("") + '</div></div><time title="' + dataHora(e.ts) + '">' + quando(e.ts) + "</time></li>";
}
