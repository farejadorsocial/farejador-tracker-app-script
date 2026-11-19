// Campanhas: links rastreados com UTM e link curto /c/código.
import { api } from "../api.js";
import { estado, query, urlCampanha, urlPublica } from "../estado.js";
import { $, $$, ICONES, copiar, corVisivel, esc, fmt, ico, quando, svgIcone, toast, variacao } from "../util.js";
import { abrirQr } from "./qrcode.js";

export const ORIGENS = [
  { id: "instagram-bio", nome: "Bio do Instagram", icone: "instagram", source: "instagram", medium: "bio" },
  { id: "instagram-stories", nome: "Stories", icone: "instagram", source: "instagram", medium: "stories" },
  { id: "tiktok-bio", nome: "Bio do TikTok", icone: "tiktok", source: "tiktok", medium: "bio" },
  { id: "tiktok-video", nome: "Vídeo do TikTok", icone: "tiktok", source: "tiktok", medium: "video" },
  { id: "youtube", nome: "YouTube", icone: "youtube", source: "youtube", medium: "descricao" },
  { id: "kwai", nome: "Kwai", icone: "kwai", source: "kwai", medium: "bio" },
  { id: "whatsapp-status", nome: "Status WhatsApp", icone: "whatsapp", source: "whatsapp", medium: "status" },
  { id: "whatsapp-grupo", nome: "Grupo WhatsApp", icone: "whatsapp", source: "whatsapp", medium: "grupo" },
  { id: "facebook", nome: "Facebook", icone: "facebook", source: "facebook", medium: "post" },
  { id: "email", nome: "E-mail", icone: "email", source: "email", medium: "email" },
  { id: "qr", nome: "QR impresso", icone: "link", source: "qrcode", medium: "impresso" },
  { id: "outro", nome: "Outro", icone: "site", source: "", medium: "" },
];

let lista = [];
const curto = (c) => urlCampanha(c.codigo);
function completo(c) {
  const q = new URLSearchParams(); ["utm_source", "utm_medium", "utm_campaign", "utm_content"].forEach((k) => c[k] && q.set(k, c[k]));
  const u = urlPublica();
  return u + (u.includes("?") ? "&" : "?") + q.toString();
}

export function iniciar() {
  $("#cp-origens").innerHTML = ORIGENS.map((o) => {
    const cor = corVisivel((ICONES[o.icone] || {}).cor || "#888");
    return '<button type="button" data-o="' + o.id + '" style="--c:' + cor + '">' + svgIcone(o.icone, cor) + "<span>" + esc(o.nome) + "</span></button>";
  }).join("");
  $("#cp-origens").addEventListener("click", (e) => {
    const b = e.target.closest("[data-o]"); if (!b) return;
    const o = ORIGENS.find((x) => x.id === b.dataset.o);
    $$("#cp-origens button").forEach((x) => x.classList.toggle("on", x === b));
    $("#cp-source").value = o.source; $("#cp-medium").value = o.medium;
    if (!$("#cp-nome").value) $("#cp-nome").value = o.nome;
    $("#form-campanha").dataset.origem = o.id;
    if (!o.source) $("#cp-source").focus();
  });
  $("#form-campanha").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const c = await api("/api/admin/campanhas", { method: "POST", body: {
        pagina_id: estado.paginaId, nome: $("#cp-nome").value, origem: e.target.dataset.origem || "",
        utm_source: $("#cp-source").value, utm_medium: $("#cp-medium").value, utm_content: $("#cp-content").value, codigo: $("#cp-codigo").value || null,
      } });
      e.target.reset(); delete e.target.dataset.origem; $$("#cp-origens button").forEach((x) => x.classList.remove("on"));
      await copiar(curto(c));
      toast("Link criado e copiado: " + curto(c));
      carregar();
    } catch (err) { toast(err.message, true); }
  });
  $("#lista-campanhas").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-acao]"); if (!b) return;
    const c = lista.find((x) => x.id === +b.closest("[data-cid]").dataset.cid);
    const a = b.dataset.acao;
    if (a === "curto") copiar(curto(c));
    else if (a === "completo") copiar(completo(c));
    else if (a === "qr") abrirQr(curto(c), c.nome);
    else if (a === "pausar") { await api("/api/admin/campanhas/" + c.id, { method: "PATCH", body: { ativo: !c.ativo } }); carregar(); }
    else if (a === "excluir") {
      if (!confirm("Excluir a campanha “" + c.nome + "”? O link curto deixa de funcionar (as visitas continuam no histórico, sem a marcação).")) return;
      await api("/api/admin/campanhas/" + c.id, { method: "DELETE" }); carregar();
    }
  });
}

export async function carregar() {
  const r = await api("/api/admin/campanhas" + query());
  lista = r.campanhas;
  $("#qtd-campanhas").textContent = lista.length;
  $("#lista-campanhas").innerHTML = lista.length ? lista.map((c) => {
    const o = ORIGENS.find((x) => x.id === c.origem) || ORIGENS.find((x) => x.source === c.utm_source) || ORIGENS[ORIGENS.length - 1];
    const cor = corVisivel((ICONES[o.icone] || {}).cor || "#888");
    const vv = variacao(c.visitas, c.visitas_anterior);
    return '<article class="campanha' + (c.ativo ? "" : " pausada") + '" data-cid="' + c.id + '">' +
      '<div class="campanha-topo"><span class="ico" style="--c:' + cor + '">' + svgIcone(o.icone, cor) + '</span><div class="campanha-nome"><b>' + esc(c.nome) + "</b>" +
      '<small class="mono">' + esc(c.utm_source) + (c.utm_medium ? " / " + esc(c.utm_medium) : "") + (c.utm_content ? " / " + esc(c.utm_content) : "") + "</small></div>" +
      (c.ativo ? "" : '<span class="tag">pausada</span>') + "</div>" +
      '<div class="campanha-nums"><div><b>' + fmt.format(c.visitas) + '</b><small>visitas <span class="' + vv.cls + '">' + vv.txt + "</span></small></div><div><b>" + fmt.format(c.cliques) + "</b><small>cliques</small></div><div><b>" + c.ctr +
      "%</b><small>CTR</small></div><div><b>" + quando(c.ultimo) + "</b><small>última visita</small></div></div>" +
      (c.links.length ? '<div class="campanha-links">' + c.links.map((l) => '<span class="tag">' + esc(l.nome) + " · " + l.valor + "</span>").join("") + "</div>" : "") +
      '<div class="campanha-url"><code>' + esc(curto(c).replace(/^https?:\/\//, "")) + "</code></div>" +
      '<div class="linha-acoes"><button class="btn sec" data-acao="curto">' + ico("copiar") + "Copiar link curto</button>" +
      '<button class="btn fant" data-acao="completo" title="Link com os parâmetros UTM">Link completo</button>' +
      '<button class="btn fant btn-ico" data-acao="qr" title="QR Code">' + ico("qr") + "</button>" +
      '<button class="btn fant btn-ico" data-acao="pausar" title="' + (c.ativo ? "Pausar" : "Reativar") + '">' + ico(c.ativo ? "pausa" : "play") + "</button>" +
      '<button class="btn fant btn-ico perigo-txt" data-acao="excluir" title="Excluir">' + ico("lixo") + "</button></div></article>";
  }).join("") : '<p class="vazio">Crie o primeiro link rastreado ao lado. Use um link diferente para cada lugar onde você divulga (bio, stories, vídeo, QR…).</p>';
}
