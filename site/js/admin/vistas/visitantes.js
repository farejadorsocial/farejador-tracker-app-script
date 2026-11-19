// Visitantes: tabela, gaveta com todos os dados do navegador e localização por IP (IPinfo sob demanda).
import { api } from "../api.js";
import { query } from "../estado.js";
import { criarMapa, distanciaKm, pino, popupIp } from "../mapas.js";
import { $, $$, CORES, corHash, dataHora, esc, quando, toast } from "../util.js";
import { itemFeed } from "./trafego.js";

let lista = [], atual = null, mapaGaveta = null;

export async function carregar() {
  lista = (await api("/api/admin/visitantes" + query())).visitantes;
  renderTabela();
}

export function iniciar() {
  $("#busca-visitantes").addEventListener("input", renderTabela);
  $("#tabela-visitantes").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) abrirVisitante(tr.dataset.id); });
  $("#gv-fechar").addEventListener("click", fechar);
  $("#gaveta-fundo").addEventListener("click", fechar);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#gaveta").hidden) fechar(); });
}

function renderTabela() {
  const q = $("#busca-visitantes").value.trim().toLowerCase();
  const itens = lista.filter((v) => !q || JSON.stringify(v).toLowerCase().includes(q));
  $("#qtd-visitantes").textContent = lista.length;
  $("#tabela-visitantes tbody").innerHTML = itens.length ? itens.map((v) => {
    const u = v.ua_info || {};
    return '<tr data-id="' + v.visitante_id + '"><td data-rot="Visitante"><span class="avatar-mini" style="background:' + corHash(v.visitante_id) + '">' + v.visitante_id.slice(0, 2).toUpperCase() + '</span><span class="mono">' + v.visitante_id.slice(0, 8) + "</span>" + (v.gps ? ' <span class="tag ok">GPS</span>' : "") + "</td>" +
      '<td data-rot="Última visita">' + quando(v.atualizado_em) + '</td><td data-rot="Origem">' + esc(v.origem_canal || "—") + '</td><td data-rot="Dispositivo"><span>' + esc(u.dispositivo) + " · " + esc(u.navegador) + '<br><small class="muted">' + esc(u.sistema) + (v.tela ? " · " + esc(v.tela) : "") + "</small></span></td>" +
      '<td class="mono" data-rot="IP"><span>' + esc(v.ip || "—") + (v.ips && v.ips.ipv6 && v.ips.ipv6 !== v.ip ? '<br><small class="muted">+ IPv6</small>' : "") + '</span></td><td data-rot="Local (IPinfo)">' + (v.local ? esc(v.local) : '<span class="muted">não consultado</span>') +
      '</td><td class="num" data-rot="Sessões">' + (v.sessoes || 0) + '</td><td class="num" data-rot="Cliques">' + (v.cliques || 0) + '</td><td><button class="btn sec ico-btn" title="Detalhes">›</button></td></tr>';
  }).join("") : '<tr><td colspan="9" class="vazio">Nenhum visitante desta página aceitou a coleta ainda.</td></tr>';
}

function fechar() { $("#gaveta").hidden = true; $("#gaveta-fundo").hidden = true; if (mapaGaveta) { mapaGaveta.remove(); mapaGaveta = null; } }

function dl(pares) {
  return '<dl class="dl">' + pares.map(([k, v]) => {
    const vazio = v === null || v === undefined || v === "" || (Array.isArray(v) && !v.length);
    const val = vazio ? "indisponível" : (typeof v === "boolean" ? (v ? "Sim" : "Não") : Array.isArray(v) ? v.join(", ") : v);
    return "<div><dt>" + esc(k) + '</dt><dd class="' + (vazio ? "vazio-v" : "") + '">' + esc(val) + "</dd></div>";
  }).join("") + "</dl>";
}
const secao = (titulo, html, extra) => '<article class="card"><div class="card-topo"><h2>' + titulo + "</h2>" + (extra || "") + "</div>" + html + "</article>";
const privado = (ip) => /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|::1$|f[cd]|fe80)/i.test(ip);

export async function abrirVisitante(id) {
  $("#gaveta").hidden = false; $("#gaveta-fundo").hidden = false;
  $("#gv-corpo").innerHTML = '<p class="vazio">Carregando…</p>';
  let r; try { r = await api("/api/admin/visitantes/" + id); } catch (e) { $("#gv-corpo").innerHTML = '<p class="vazio">' + esc(e.message) + "</p>"; return; }
  atual = r;
  const reg = r.registro, nav = reg.dados_navegador || {}, con = reg.conexao_servidor || {};
  const n = nav.navegador || {}, t = nav.tela || {}, c = nav.capacidades || {}, o = nav.origem || {}, ch = n.client_hints || {}, cab = con.cabecalhos_http || {};
  const u = r.resumo.ua_info || {};
  $("#gv-titulo").innerHTML = '<span class="avatar-mini" style="background:' + corHash(reg.visitante_id) + '">' + reg.visitante_id.slice(0, 2).toUpperCase() + '</span><span class="mono">' + reg.visitante_id + "</span>";
  $("#gv-sub").textContent = "Primeira visita " + dataHora(reg.criado_em) + " · última " + dataHora(reg.atualizado_em) + " · " + reg.quantidade_coletas + " coleta(s)";

  const ips = [], det = con.ips_publicos_detectados || {};
  [["Principal (" + (con.tipo_ip || "?") + ")", con.ip_observado], ["IPv4 detectado", det.ipv4], ["IPv6 detectado", det.ipv6]].forEach(([rot, ip]) => { if (ip && !ips.some((x) => x[1] === ip)) ips.push([rot, ip]); });
  if (con.ip_conexao_servidor && !ips.some((x) => x[1] === con.ip_conexao_servidor)) ips.push(["Conexão no servidor", con.ip_conexao_servidor]);
  const ipHtml = ips.map(([rot, ip]) => '<div class="ip-linha"><div><small class="muted">' + esc(rot) + '</small><div class="mono">' + esc(ip) + "</div></div>" +
    (privado(ip) ? '<span class="tag">IP local — sem consulta</span>' : '<button class="btn pri" data-ip="' + esc(ip) + '">' + ((reg.ipinfo_admin || {})[ip] ? "📍 Ver localização" : "🔍 Ver localização") + "</button>") + "</div>").join("") || '<p class="vazio">Nenhum IP registrado.</p>';
  const gps = nav.geolocalizacao;
  const perms = Object.entries(nav.permissoes || {}).map(([k, v]) => '<span class="tag ' + (v === "granted" ? "ok" : "") + '">' + esc(k) + ": " + esc(v) + "</span>").join("");
  const prefs = c.preferencias_acessibilidade || {};

  $("#gv-corpo").innerHTML =
    secao("🌐 Conexão e IP", ipHtml + dl([["Origem do IP", con.origem_ip], ["Erros IPv4/IPv6", Object.entries(det.erros || {}).map(([k, v]) => k + ": " + v).join(" · ") || "nenhum"]]) + '<div id="gv-ipinfo" class="ipinfo-card"></div>') +
    (gps ? secao("📍 GPS autorizado pelo visitante", dl([["Latitude", gps.latitude], ["Longitude", gps.longitude], ["Precisão", Math.round(gps.precisao_metros) + " m"], ["Coletado em", dataHora(gps.coletado_em)]])) : "") +
    secao("💻 Dispositivo e navegador", dl([
      ["Tipo", (n.dispositivo || {}).tipo], ["Navegador/app", u.navegador], ["Sistema", u.sistema], ["Plataforma", n.plataforma],
      ["Modelo (Client Hints)", ch.modelo], ["Versão do sistema", ch.versao_plataforma], ["Arquitetura", ch.arquitetura ? ch.arquitetura + " " + (ch.bitness || "") + " bits" : null],
      ["Navegador (CH)", n.navegador_estimado ? n.navegador_estimado.nome + " " + n.navegador_estimado.versao : null],
      ["Idioma", n.idioma], ["Idiomas", n.idiomas], ["Fuso horário", n.timezone], ["Offset UTC", n.timezone_offset_minutos != null ? (-n.timezone_offset_minutos / 60) + " h" : null],
      ["Cookies", n.cookies_habilitados], ["Do Not Track", n.do_not_track], ["Visor de PDF", n.pdf_viewer_habilitado],
    ]) + '<p class="muted pq mono" style="margin-top:10px;word-break:break-all">' + esc(n.user_agent) + "</p>") +
    secao("🖥 Tela e hardware", dl([
      ["Resolução", t.largura ? t.largura + " × " + t.altura : null], ["Área disponível", t.largura_disponivel ? t.largura_disponivel + " × " + t.altura_disponivel : null],
      ["Janela (viewport)", t.viewport_largura ? t.viewport_largura + " × " + t.viewport_altura : null], ["Pixel ratio", t.pixel_ratio], ["Cor", t.profundidade_cor ? t.profundidade_cor + " bits" : null], ["Orientação", t.orientacao],
      ["Núcleos lógicos", c.nucleos_logicos], ["Memória aprox.", c.memoria_gb_aproximada ? c.memoria_gb_aproximada + " GB" : null], ["Toque", c.touchscreen_detectado ? "Sim (" + c.toque_maximo + " pontos)" : "Não"],
      ["Rede", c.conexao ? (c.conexao.tipo_efetivo || "?") + " · " + (c.conexao.downlink_mbps_aproximado ?? "?") + " Mbps · " + (c.conexao.rtt_ms_aproximado ?? "?") + " ms" : null], ["Economia de dados", c.conexao ? c.conexao.economia_dados : null], ["Online", c.online],
    ])) +
    secao("🧩 Recursos, preferências e permissões", dl([
      ["WebGL", (c.recursos || {}).webgl], ["WebAssembly", (c.recursos || {}).webassembly], ["Service Worker", (c.recursos || {}).service_worker], ["Bluetooth API", (c.recursos || {}).bluetooth_api], ["USB API", (c.recursos || {}).usb_api],
      ["localStorage", (c.armazenamento || {}).local_storage], ["IndexedDB", (c.armazenamento || {}).indexed_db],
      ["Tema preferido", prefs.esquema_cores], ["Movimento reduzido", prefs.movimento_reduzido], ["Alto contraste", prefs.contraste_alto], ["Ponteiro", prefs.ponteiro], ["Hover", prefs.hover],
    ]) + '<h3>Permissões (somente leitura do estado)</h3><div class="perm">' + (perms || '<span class="muted">—</span>') + "</div>") +
    secao("🧭 Origem da visita", dl([["Referer", o.referer], ["Página", o.pagina], ["Host", o.host], ["utm_source", (o.campanha || {}).utm_source], ["utm_medium", (o.campanha || {}).utm_medium], ["utm_campaign", (o.campanha || {}).utm_campaign]])) +
    secao("📨 Cabeçalhos HTTP", dl(Object.entries(cab))) +
    secao("🕒 Linha do tempo (" + r.eventos.length + " eventos, todas as páginas)", r.eventos.length ? '<ol class="feed compacto">' + r.eventos.slice().reverse().map((e) => itemFeed(e)).join("") + "</ol>" : '<p class="vazio">Sem eventos vinculados.</p>') +
    secao("🗂 Registro completo", '<details class="bruto"><summary>Mostrar JSON do visitante</summary><pre>' + esc(JSON.stringify(reg, null, 2)) + "</pre></details>", '<button class="btn perigo" id="gv-excluir">Excluir visitante</button>');

  $$("#gv-corpo [data-ip]").forEach((b) => b.addEventListener("click", () => verLocalizacao(b.dataset.ip, b)));
  $("#gv-excluir").addEventListener("click", async () => {
    if (!confirm("Excluir os dados deste visitante? Esta ação não pode ser desfeita.")) return;
    await api("/api/admin/visitantes/" + reg.visitante_id, { method: "DELETE" });
    fechar(); toast("Visitante excluído."); carregar().catch(() => {});
  });
  const salvo = Object.values(reg.ipinfo_admin || {}).find((x) => x.ip === con.ip_observado) || Object.values(reg.ipinfo_admin || {})[0];
  if (salvo) mostrarIpinfo(salvo, true);
}

async function verLocalizacao(ip, botao) {
  botao.disabled = true; const t = botao.textContent; botao.textContent = "Consultando IPinfo…";
  try {
    const r = await api("/api/admin/ipinfo/" + encodeURIComponent(ip) + "?visitante=" + atual.registro.visitante_id, { method: "POST" });
    if (!r.consultado) throw new Error(r.erro || "IPinfo não retornou dados.");
    (atual.registro.ipinfo_admin = atual.registro.ipinfo_admin || {})[r.ip] = r;
    mostrarIpinfo(r, false);
    botao.textContent = "📍 Ver localização";
    const v = lista.find((x) => x.visitante_id === atual.registro.visitante_id);
    if (v && r.ip === v.ip) { v.local = r.cidade + ", " + r.codigo_pais; renderTabela(); }
  } catch (e) { toast(e.message, true); botao.textContent = t; }
  finally { botao.disabled = false; }
}

function mostrarIpinfo(r, doCache) {
  const gps = (atual.registro.dados_navegador || {}).geolocalizacao;
  const dist = gps && r.latitude != null ? distanciaKm(r.latitude, r.longitude, gps.latitude, gps.longitude) : null;
  $("#gv-ipinfo").innerHTML =
    '<div class="card-topo" style="margin:6px 0 0"><h2>📍 ' + esc([r.cidade, r.regiao, r.pais].filter(Boolean).join(", ") || "Localização") + '</h2><span class="muted pq">IPinfo · ' + esc(r.ip) + " · " + (doCache ? "salvo em " : "consultado em ") + dataHora(r.consultado_em) + "</span></div>" +
    dl([["Cidade", r.cidade], ["Região/estado", r.regiao], ["País", r.pais], ["CEP aproximado", r.codigo_postal], ["Coordenadas", r.localizacao_aproximada], ["Fuso horário", r.timezone],
      ["Provedor", r.provedor], ["ASN", r.asn], ["Hostname (DNS reverso)", r.hostname], ["Anycast", r.anycast], ["Distância até o GPS", dist != null ? (dist < 1 ? Math.round(dist * 1000) + " m" : dist.toFixed(1) + " km") : null]]) +
    '<div id="gv-mapa" class="mapa"></div><p class="muted pq">A posição por IP indica a região do provedor, não o endereço exato. O GPS (verde) só existe se o visitante autorizou.</p>';
  if (!window.L || r.latitude == null) return;
  if (mapaGaveta) mapaGaveta.remove();
  mapaGaveta = criarMapa("gv-mapa");
  const pts = [[r.latitude, r.longitude]];
  L.marker(pts[0], { icon: pino(CORES[0]) }).addTo(mapaGaveta).bindPopup(popupIp(r)).openPopup();
  L.circle(pts[0], { radius: 5000, color: CORES[0], weight: 1, fillOpacity: .08, dashArray: "4 4" }).addTo(mapaGaveta);
  if (gps) {
    pts.push([gps.latitude, gps.longitude]);
    L.marker(pts[1], { icon: pino(CORES[5]) }).addTo(mapaGaveta).bindPopup("<b>GPS do visitante</b><br>Precisão ±" + Math.round(gps.precisao_metros) + " m<br>" + gps.latitude.toFixed(6) + ", " + gps.longitude.toFixed(6));
    L.circle(pts[1], { radius: gps.precisao_metros || 50, color: CORES[5], weight: 1.5, fillOpacity: .15 }).addTo(mapaGaveta);
    L.polyline(pts, { color: "#9aa6bd", weight: 1.5, dashArray: "6 6" }).addTo(mapaGaveta);
  }
  setTimeout(() => { mapaGaveta.invalidateSize(); pts.length > 1 ? mapaGaveta.fitBounds(pts, { padding: [40, 40] }) : mapaGaveta.setView(pts[0], 11); }, 60);
}
