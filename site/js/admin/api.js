// Comunicação com o Apps Script.
// As telas continuam pedindo "/api/admin/…" (igual à versão Python); aqui cada pedido vira uma
// "ação" do Apps Script, e as estatísticas são calculadas no navegador (estatisticas.js).
import * as E from "./estatisticas.js";

const API = (window.FAREJADOR || {}).API_URL || "";
const CHAVE = "farejador_token";
let aoExpirar = () => {};
export function quandoSessaoExpirar(fn) { aoExpirar = fn; }

/** Endereço do site (pasta onde está o index.html público), descoberto a partir de /admin/. */
export const BASE = location.origin + location.pathname.replace(/admin\/(index\.html)?$/, "");

function token() { try { return sessionStorage.getItem(CHAVE) || localStorage.getItem(CHAVE); } catch (_) { return null; } }
function guardarToken(t, lembrar) {
  try { sessionStorage.removeItem(CHAVE); localStorage.removeItem(CHAVE); if (t) (lembrar ? localStorage : sessionStorage).setItem(CHAVE, t); } catch (_) {}
}

export function apiConfigurada() { return API && !/COLE_AQUI/.test(API); }

export async function chamar(acao, dados) {
  if (!apiConfigurada()) throw new Error("Configure o endereço do Apps Script no arquivo config.js.");
  let r;
  try {
    r = await fetch(API, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, redirect: "follow",
      body: JSON.stringify(Object.assign({ acao, token: token(), ua: navigator.userAgent }, dados || {})) });
  } catch (e) { throw new Error("Não foi possível falar com o Apps Script. Confira o endereço em config.js e se a implantação está como “Qualquer pessoa”."); }
  let j; try { j = await r.json(); } catch (_) { throw new Error("Resposta inválida do Apps Script (a implantação está atualizada?)."); }
  if (j && j.erro) {
    if (j.status === 401 && !/^(login|primeiro_acesso|trocar_senha)$/.test(acao)) { guardarToken(null); aoExpirar(); throw new Error("Sessão expirada"); }
    throw new Error(j.erro);
  }
  return j;
}

// ------------------------------------------------------------------ cache curto dos eventos (evita baixar 2x ao trocar de tela)
const cache = new Map();
async function eventos(pagina, ini, fim) {
  const k = pagina + ":" + Math.floor(ini) + ":" + Math.floor(fim), c = cache.get(k);
  if (c && Date.now() - c.t < 20000) return c.v;
  const v = (await chamar("eventos_periodo", { pagina, ini, fim })).eventos;
  cache.set(k, { t: Date.now(), v });
  return v;
}
export function limparCache() { cache.clear(); }

// ------------------------------------------------------------------ rotas "/api/admin/…" → ações
const ROTAS = [
  ["GET", /\/estado$/, () => chamar("estado")],
  ["POST", /\/primeiro-acesso$/, async (q, b) => { const r = await chamar("primeiro_acesso", b); guardarToken(r.token, b.lembrar); return { ok: true }; }],
  ["POST", /\/login$/, async (q, b) => { const r = await chamar("login", b); guardarToken(r.token, b.lembrar); return { ok: true, usuario: r.usuario }; }],
  ["POST", /\/logout$/, async () => { try { await chamar("logout"); } finally { guardarToken(null); } return { ok: true }; }],

  ["GET", /\/paginas$/, () => chamar("paginas")],
  ["POST", /\/paginas$/, (q, b) => chamar("pagina_criar", b)],
  ["PATCH", /\/paginas\/(\d+)$/, (q, b, m) => chamar("pagina_atualizar", Object.assign({ id: +m[1] }, b))],
  ["DELETE", /\/paginas\/(\d+)$/, (q, b, m) => chamar("pagina_excluir", { id: +m[1] })],
  ["GET", /\/paginas\/(\d+)\/config$/, (q, b, m) => chamar("pagina_config", { id: +m[1] })],
  ["PUT", /\/paginas\/(\d+)\/config$/, (q, b, m) => chamar("pagina_salvar", { id: +m[1], config: b })],
  ["GET", /\/opcoes$/, () => chamar("opcoes")],
  ["POST", /\/upload$/, (q, b) => chamar("upload", b)],

  ["GET", /\/estatisticas$/, async (q) => {
    const p = E.resolverPeriodo(q), pagina = +q.pagina || null;
    const [evs, cfg, mapa] = await Promise.all([eventos(pagina, p.cmpIni, p.fim), chamar("pagina_config", { id: pagina }), chamar("mapa", { pagina })]);
    return Object.assign(E.visaoGeral(evs, p, cfg.config.links, q.robos === "true"), { mapa: mapa.mapa });
  }],
  ["GET", /\/retorno$/, async (q) => { const p = E.resolverPeriodo(q); return E.retorno((await chamar("retorno_base", { pagina: +q.pagina || null, fim: p.fim })).sessoes, p); }],
  ["GET", /\/campanhas$/, async (q) => {
    const p = E.resolverPeriodo(q), pagina = +q.pagina || null;
    const [lista, evs] = await Promise.all([chamar("campanhas_lista", { pagina }), eventos(pagina, p.cmpIni, p.fim)]);
    return { campanhas: E.campanhas(lista.campanhas, evs, p) };
  }],
  ["POST", /\/campanhas$/, (q, b) => chamar("campanha_criar", b)],
  ["PATCH", /\/campanhas\/(\d+)$/, (q, b, m) => chamar("campanha_editar", Object.assign({ id: +m[1] }, b))],
  ["DELETE", /\/campanhas\/(\d+)$/, (q, b, m) => chamar("campanha_excluir", { id: +m[1] })],

  ["GET", /\/eventos$/, (q) => chamar("eventos_recentes", { pagina: +q.pagina || null, limite: +q.limite || 150, tipo: q.tipo || "", robos: q.robos === "true" })],
  ["GET", /\/visitantes$/, (q) => chamar("visitantes", { pagina: +q.pagina || null })],
  ["GET", /\/visitantes\/([a-f0-9]{32})$/, (q, b, m) => chamar("visitante", { id: m[1] })],
  ["DELETE", /\/visitantes\/([a-f0-9]{32})$/, (q, b, m) => chamar("visitante_excluir", { id: m[1] })],
  ["POST", /\/ipinfo\/([^/]+)$/, (q, b, m) => chamar("ipinfo", { ip: decodeURIComponent(m[1]), visitante: q.visitante })],

  ["GET", /\/sessoes$/, () => chamar("sessoes")],
  ["POST", /\/sessoes\/encerrar-outras$/, () => chamar("sessoes_encerrar_outras")],
  ["DELETE", /\/sessoes\/([a-f0-9]+)$/, (q, b, m) => chamar("sessao_encerrar", { id: m[1] })],
  ["POST", /\/trocar-senha$/, (q, b) => chamar("trocar_senha", b)],
  ["GET", /\/usuarios$/, () => chamar("usuarios")],
  ["POST", /\/usuarios$/, (q, b) => chamar("usuario_criar", b)],
  ["DELETE", /\/usuarios\/(\d+)$/, (q, b, m) => chamar("usuario_excluir", { id: +m[1] })],
  ["GET", /\/retencao$/, () => chamar("retencao")],
  ["PUT", /\/retencao$/, (q, b) => chamar("retencao_salvar", b)],
  ["POST", /\/retencao\/executar$/, () => chamar("retencao_executar")],
];

export async function api(caminho, opcoes) {
  const o = opcoes || {}, metodo = (o.method || "GET").toUpperCase();
  const [rota, qs] = caminho.split("?");
  const q = Object.fromEntries(new URLSearchParams(qs || ""));
  const corpo = typeof o.body === "string" ? JSON.parse(o.body) : (o.body || {});
  for (const [m, re, fn] of ROTAS) {
    const achou = metodo === m && re.exec(rota);
    if (achou) {
      if (metodo !== "GET") limparCache();
      return fn(q, corpo, achou);
    }
  }
  throw new Error("Rota não suportada nesta versão: " + metodo + " " + rota);
}

/** Baixa todos os eventos da página como CSV (gerado no navegador). */
export async function baixarCsv(pagina) {
  const evs = (await chamar("eventos_periodo", { pagina, ini: 0, fim: Date.now() / 1000 + 86400 })).eventos;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([E.csv(evs)], { type: "text/csv;charset=utf-8" }));
  a.download = "farejador_eventos.csv"; document.body.appendChild(a); a.click(); a.remove();
}
