// Farejador (Apps Script + GitHub Pages) — painel administrativo (ponto de entrada).
// Cada tela fica em js/admin/vistas/; utilidades em js/admin/*.js.
import { api, apiConfigurada, quandoSessaoExpirar } from "./admin/api.js";
import * as editor from "./admin/editor.js";
import { estado, lembrarFiltros, paginaAtual, urlPublica } from "./admin/estado.js";
import { destruirGraficos } from "./admin/graficos.js";
import { $, $$, SVG, dataCurta, lerCores, temaAtual, toast } from "./admin/util.js";
import * as aparencia from "./admin/vistas/aparencia.js";
import * as campanhas from "./admin/vistas/campanhas.js";
import * as config from "./admin/vistas/config.js";
import * as geral from "./admin/vistas/geral.js";
import * as links from "./admin/vistas/links.js";
import * as mapa from "./admin/vistas/mapa.js";
import * as paginas from "./admin/vistas/paginas.js";
import * as qrcode from "./admin/vistas/qrcode.js";
import * as retorno from "./admin/vistas/retorno.js";
import * as trafego from "./admin/vistas/trafego.js";
import * as visitantes from "./admin/vistas/visitantes.js";

// titulo, subtitulo, módulo, usa período?, usa seletor de página?
const VISTAS = {
  geral: ["Visão geral", "Como as pessoas chegam e para onde vão.", geral, true, true],
  trafego: ["Tráfego", "Cada visita, clique e saída — de onde veio e para onde foi.", trafego, true, true],
  retorno: ["Retorno de visitantes", "Quem volta, depois de quanto tempo e vindo de onde.", retorno, true, true],
  campanhas: ["Campanhas", "Links rastreados para saber qual post, vídeo ou bio traz mais gente.", campanhas, true, true],
  visitantes: ["Visitantes", "Tudo o que o navegador informou, por visitante que aceitou a coleta.", visitantes, false, true],
  mapa: ["Mapa", "Localização aproximada por IP (IPinfo) e GPS autorizado.", mapa, false, true],
  paginas: ["Minhas páginas", "Crie páginas separadas, cada uma com seu endereço, visual e estatísticas.", paginas, false, false],
  links: ["Links e redes", "Adicione, ordene e personalize as redes que aparecem na página.", links, false, true],
  aparencia: ["Aparência e textos", "Perfil, fundo, botões, fontes e todos os textos da página.", aparencia, false, true],
  qrcode: ["QR Code", "Gere o QR Code da página ou de uma campanha para divulgar e imprimir.", qrcode, false, true],
  config: ["Configurações", "Segurança do login, usuários, limpeza automática e exportação.", config, false, false],
};

// ------------------------------------------------------------------ tema do painel
function aplicarTema(t, redesenhar) {
  document.documentElement.dataset.tema = t;
  try { localStorage.setItem("farejador_tema_painel", t); } catch (_) {}
  $$("#seg-tema button").forEach((b) => b.classList.toggle("on", b.dataset.t === t));
  $$(".alternar-tema").forEach((b) => (b.innerHTML = t === "escuro" ? SVG.sol : SVG.lua));
  const meta = $('meta[name="theme-color"]'); if (meta) meta.content = t === "escuro" ? "#0e1726" : "#f3f6fc";
  lerCores();
  if (redesenhar) { destruirGraficos(); mapa.reiniciar(); carregarVista(); if (estado.vista === "links") links.renderGaleria(); }
}

// ------------------------------------------------------------------ login
let criando = false;
function mostrarLogin(temUsuarios) {
  $("#app").hidden = true; $("#tela-login").hidden = false; trafego.parar();
  criando = temUsuarios === false;
  $("#login-titulo").textContent = criando ? "Criar acesso ao painel" : "Entrar no painel";
  $("#login-sub").textContent = criando ? "Primeiro acesso: escolha um usuário e uma senha (mínimo 8 caracteres, com letras e números)." : "Use seu usuário e senha.";
  $("#campo-confirma").hidden = !criando;
  $("#login-confirma").required = criando;
  $("#login-botao").textContent = criando ? "Criar e entrar" : "Entrar";
  $("#login-senha").autocomplete = criando ? "new-password" : "current-password";
  setTimeout(() => $(criando ? "#login-usuario" : "#login-senha").focus(), 50);
}
quandoSessaoExpirar(() => mostrarLogin(true));

$("#form-login").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#login-erro").textContent = "";
  const corpo = { usuario: $("#login-usuario").value.trim(), senha: $("#login-senha").value, lembrar: $("#login-lembrar").checked };
  try {
    if (criando) {
      if (corpo.senha !== $("#login-confirma").value) throw new Error("As senhas não conferem.");
      await api("/api/admin/primeiro-acesso", { method: "POST", body: corpo });
    } else await api("/api/admin/login", { method: "POST", body: corpo });
    $("#login-senha").value = ""; $("#login-confirma").value = "";
    entrar();
  } catch (err) { $("#login-erro").textContent = err.message; }
});
$("#sair").addEventListener("click", async () => { await api("/api/admin/logout", { method: "POST" }).catch(() => {}); mostrarLogin(true); });

async function entrar() {
  const st = await api("/api/admin/estado");
  if (!st.logado) return mostrarLogin(st.tem_usuarios);
  $("#usuario-atual").textContent = "(" + st.usuario + ")";
  $("#tela-login").hidden = true; $("#app").hidden = false;
  await atualizarPaginas();
  irPara(estado.vista);
}

// ------------------------------------------------------------------ páginas (seletor)
async function atualizarPaginas() {
  estado.paginas = (await api("/api/admin/paginas")).paginas;
  if (!estado.paginas.some((p) => p.id === estado.paginaId)) estado.paginaId = (estado.paginas[0] || {}).id || null;
  $("#sel-pagina").innerHTML = estado.paginas.map((p) => '<option value="' + p.id + '">' + p.nome.replace(/</g, "&lt;") + (p.principal ? " ★" : "") + "</option>").join("");
  $("#sel-pagina").value = String(estado.paginaId);
  $("#abrir-publica").href = urlPublica();
  if (estado.pagina && estado.pagina.id !== estado.paginaId) estado.pagina = null;
  lembrarFiltros();
}
paginas.quandoMudarLista(async () => { estado.pagina = null; await atualizarPaginas(); });

$("#sel-pagina").addEventListener("change", (e) => {
  if (editor.temAlteracoes() && !confirm("Há alterações não salvas nesta página. Trocar mesmo assim e descartar?")) { e.target.value = String(estado.paginaId); return; }
  estado.paginaId = +e.target.value; estado.pagina = null; $("#salvar-barra").hidden = true;
  $("#abrir-publica").href = urlPublica(); lembrarFiltros();
  carregarVista();
});

// ------------------------------------------------------------------ período, comparação e robôs
function marcarPeriodo() {
  $$("#periodo button").forEach((b) => b.classList.toggle("on", String(b.dataset.dias) === String(estado.dias)));
  $("#datas").hidden = estado.dias !== "custom";
  $("#comparar").checked = estado.comparar; $("#tg-comparar").classList.toggle("on", estado.comparar);
  $("#incluir-robos").checked = estado.robos; $("#tg-robos").classList.toggle("on", estado.robos);
}
$("#periodo").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  estado.dias = b.dataset.dias === "custom" ? "custom" : +b.dataset.dias;
  if (estado.dias === "custom" && !estado.de) {
    const hoje = new Date(), ini = new Date(Date.now() - 29 * 864e5), iso = (d) => d.toISOString().slice(0, 10);
    estado.de = iso(ini); estado.ate = iso(hoje); $("#data-de").value = estado.de; $("#data-ate").value = estado.ate;
  }
  marcarPeriodo(); lembrarFiltros(); carregarVista();
});
["#data-de", "#data-ate"].forEach((s) => $(s).addEventListener("change", () => {
  estado.de = $("#data-de").value; estado.ate = $("#data-ate").value;
  if (estado.de && estado.ate) carregarVista();
}));
$("#comparar").addEventListener("change", (e) => { estado.comparar = e.target.checked; marcarPeriodo(); lembrarFiltros(); carregarVista(); });
$("#incluir-robos").addEventListener("change", (e) => { estado.robos = e.target.checked; marcarPeriodo(); carregarVista(); });
$("#atualizar").addEventListener("click", () => carregarVista());

// ------------------------------------------------------------------ navegação
function abrirMenu(abrir) { $("#app").classList.toggle("menu-aberto", abrir); }
$("#abrir-menu").addEventListener("click", () => abrirMenu(true));
$("#lateral-fundo").addEventListener("click", () => abrirMenu(false));
$("#menu").addEventListener("click", (e) => { const b = e.target.closest("button[data-vista]"); if (b) irPara(b.dataset.vista); });
$("#nav-inferior").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.menu) abrirMenu(true); else irPara(b.dataset.vista); });
window.addEventListener("farejador:ir", (e) => irPara(e.detail));
$("#seg-tema").addEventListener("click", (e) => { const b = e.target.closest("[data-t]"); if (b) aplicarTema(b.dataset.t, true); });
document.addEventListener("click", (e) => { if (e.target.closest(".alternar-tema")) aplicarTema(temaAtual() === "escuro" ? "claro" : "escuro", true); });
$("#btn-previa").addEventListener("click", () => { const p = $("#vista-" + estado.vista + " .preview"); if (p) { p.classList.add("aberta"); editor.atualizarPreview(); } });
document.addEventListener("click", (e) => { if (e.target.closest(".preview-fechar") || e.target.classList.contains("preview")) $$(".preview.aberta").forEach((p) => p.classList.remove("aberta")); });

function irPara(vista) {
  if (!VISTAS[vista]) vista = "geral";
  estado.vista = vista;
  const [titulo, sub, , usaPeriodo, usaPagina] = VISTAS[vista];
  $$("#menu button, #nav-inferior button").forEach((b) => b.classList.toggle("ativo", b.dataset.vista === vista));
  $$(".vista").forEach((v) => (v.hidden = v.id !== "vista-" + vista));
  $("#vista-titulo").textContent = titulo; $("#vista-sub").textContent = sub;
  $("#acoes-periodo").hidden = !usaPeriodo;
  $("#seletor-pagina").hidden = !usaPagina || estado.paginas.length < 2;
  $("#tg-comparar").hidden = vista !== "geral";
  $("#tg-robos").hidden = !["geral", "trafego"].includes(vista);
  $("#btn-previa").hidden = !["links", "aparencia"].includes(vista);
  $$(".preview.aberta").forEach((p) => p.classList.remove("aberta"));
  abrirMenu(false); trafego.parar(); window.scrollTo(0, 0);
  carregarVista();
}

async function carregarVista() {
  const [, , mod, usaPeriodo] = VISTAS[estado.vista];
  marcarPeriodo();
  try {
    await mod.carregar();
    const p = estado.stats && estado.stats.periodo;
    $("#faixa-periodo").textContent = usaPeriodo && p && ["geral", "trafego"].includes(estado.vista)
      ? (paginaAtual() ? paginaAtual().nome + " · " : "") + dataCurta(p.de) + " – " + dataCurta(p.ate) + (estado.comparar && estado.vista === "geral" ? "  ·  comparando com " + dataCurta(p.cmp_de) + " – " + dataCurta(p.cmp_ate) : "") + (estado.robos ? "  ·  incluindo robôs" : "")
      : "";
  } catch (e) { if (e.message !== "Sessão expirada") toast(e.message, true); }
}

// ------------------------------------------------------------------ início
[editor, trafego.iniciarFiltros ? { iniciar: trafego.iniciarFiltros } : null, retorno, campanhas, visitantes, mapa, paginas, links, aparencia, qrcode, config]
  .forEach((m) => m && m.iniciar && m.iniciar());
aplicarTema(temaAtual(), false);
if (!apiConfigurada()) { mostrarLogin(true); $("#login-erro").innerHTML = "Falta configurar o endereço do Apps Script no arquivo <b>config.js</b>."; }
else entrar().catch((e) => { mostrarLogin(true); if (e.message !== "Sessão expirada") $("#login-erro").textContent = e.message; });
