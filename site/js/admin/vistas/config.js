// Configurações: senha, dispositivos conectados, usuários, retenção de dados e exportação.
import { api, baixarCsv } from "../api.js";
import { estado } from "../estado.js";
import { $, dataHora, esc, fmt, ico, quando, toast } from "../util.js";

function nomeDispositivo(ua) {
  ua = ua || "";
  const so = /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows" : /Mac/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Dispositivo";
  const nav = /Edg\//.test(ua) ? "Edge" : /Firefox/.test(ua) ? "Firefox" : /Chrome/.test(ua) ? "Chrome" : /Safari/.test(ua) ? "Safari" : "Navegador";
  return nav + " no " + so;
}

export async function carregar() {
  const [s, u, r] = await Promise.all([api("/api/admin/sessoes"), api("/api/admin/usuarios"), api("/api/admin/retencao")]);
  $("#lista-sessoes").innerHTML = s.sessoes.map((x) => '<li><div><b>' + esc(nomeDispositivo(x.ua)) + "</b>" + (x.atual ? ' <span class="tag ok">este dispositivo</span>' : "") +
    '<small class="muted">entrou ' + dataHora(x.criado_em) + " · último uso " + quando(x.ultimo_uso) + "</small></div>" +
    (x.atual ? "" : '<button class="btn fant btn-ico perigo-txt" data-sid="' + x.id + '" title="Desconectar">' + ico("lixo") + "</button>") + "</li>").join("");
  $("#lista-usuarios").innerHTML = u.usuarios.map((x) => '<li><div><b>' + esc(x.usuario) + "</b>" + (x.voce ? ' <span class="tag ok">você</span>' : "") +
    '<small class="muted">criado ' + dataHora(x.criado_em) + " · último login " + (x.ultimo_login ? quando(x.ultimo_login) : "nunca") + "</small></div>" +
    (x.voce ? "" : '<button class="btn fant btn-ico perigo-txt" data-uid="' + x.id + '" title="Excluir usuário">' + ico("lixo") + "</button>") + "</li>").join("");
  if (r.planilha_url) $("#link-planilha").href = r.planilha_url;
  const ret = r.retencao;
  $("#ret-ativa").checked = ret.ativa;
  $("#ret-eventos").value = String(ret.eventos_dias); if (!$("#ret-eventos").value) $("#ret-eventos").value = "180";
  $("#ret-visitantes").value = String(ret.visitantes_dias); if (!$("#ret-visitantes").value) $("#ret-visitantes").value = "365";
  const ul = r.ultima_limpeza || {};
  $("#ret-info").innerHTML = '<div class="info-grade"><div><small>Eventos guardados</small><b>' + fmt.format(r.contagem.eventos) + "</b></div><div><small>Visitantes</small><b>" + fmt.format(r.contagem.visitantes) +
    "</b></div><div><small>Banco de dados</small><b>" + r.banco_mb + " MB</b></div><div><small>Dado mais antigo</small><b>" + (r.contagem.mais_antigo ? quando(r.contagem.mais_antigo) : "—") + "</b></div></div>" +
    '<p class="muted pq">Última limpeza: ' + (ul.executado_em ? dataHora(ul.executado_em) + " — removeu " + (ul.eventos || 0) + " eventos e " + (ul.visitantes || 0) + " visitantes" : "ainda não rodou") + ". Versão " + esc(r.versao) + ".</p>";
}

export function iniciar() {
  $("#link-csv").addEventListener("click", async (e) => {
    e.preventDefault(); toast("Gerando CSV…");
    try { await baixarCsv(estado.paginaId); } catch (err) { toast(err.message, true); }
  });
  $("#form-senha").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await api("/api/admin/trocar-senha", { method: "POST", body: { senha_atual: $("#senha-atual").value, nova_senha: $("#senha-nova").value } }); toast("Senha alterada. Outros dispositivos foram desconectados."); e.target.reset(); carregar(); }
    catch (err) { toast(err.message, true); }
  });
  $("#encerrar-outras").addEventListener("click", async () => {
    const r = await api("/api/admin/sessoes/encerrar-outras", { method: "POST" }); toast(r.encerradas + " dispositivo(s) desconectado(s)."); carregar();
  });
  $("#lista-sessoes").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-sid]"); if (!b) return;
    await api("/api/admin/sessoes/" + b.dataset.sid, { method: "DELETE" }); carregar();
  });
  $("#lista-usuarios").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-uid]"); if (!b) return;
    if (!confirm("Excluir este usuário do painel?")) return;
    try { await api("/api/admin/usuarios/" + b.dataset.uid, { method: "DELETE" }); carregar(); } catch (err) { toast(err.message, true); }
  });
  $("#form-usuario").addEventListener("submit", async (e) => {
    e.preventDefault();
    try { await api("/api/admin/usuarios", { method: "POST", body: { usuario: $("#nu-usuario").value, senha: $("#nu-senha").value } }); toast("Usuário criado."); e.target.reset(); carregar(); }
    catch (err) { toast(err.message, true); }
  });
  $("#form-retencao").addEventListener("submit", async (e) => {
    e.preventDefault();
    await api("/api/admin/retencao", { method: "PUT", body: { eventos_dias: +$("#ret-eventos").value, visitantes_dias: +$("#ret-visitantes").value, ativa: $("#ret-ativa").checked } });
    toast("Retenção salva."); carregar();
  });
  $("#ret-executar").addEventListener("click", async () => {
    if (!confirm("Apagar agora os dados mais antigos que o prazo escolhido?")) return;
    const r = await api("/api/admin/retencao/executar", { method: "POST" });
    toast("Removidos " + r.eventos + " eventos e " + r.visitantes + " visitantes."); carregar();
  });
}
