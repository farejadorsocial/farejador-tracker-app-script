// Minhas páginas: várias páginas no mesmo painel, cada uma com links, visual e estatísticas próprios.
import { BASE, api } from "../api.js";
import { estado, urlPublica } from "../estado.js";
import { $, copiar, esc, fmt, ico, quando, toast } from "../util.js";

let aoMudarLista = async () => {};
export function quandoMudarLista(fn) { aoMudarLista = fn; }

const PRESET_COR = { aurora: "linear-gradient(135deg,#0b0a1a,#7c5cff 60%,#ff4fa3)", claro: "linear-gradient(135deg,#f6f5f2,#c7b8ff)", neon: "linear-gradient(135deg,#05050a,#00ffa3 50%,#b400ff)",
  "por-do-sol": "linear-gradient(135deg,#1d0b14,#ff7a45 50%,#ffc94a)", oceano: "linear-gradient(135deg,#04121f,#0ea5e9 55%,#14b8a6)", floresta: "linear-gradient(135deg,#07140d,#22c55e 55%,#84cc16)", grafite: "linear-gradient(135deg,#111113,#52525b)" };

export async function carregar() {
  const lista = estado.paginas;
  $("#pg-prefixo").textContent = BASE.replace(/^https?:\/\//, "") + "?p=";
  $("#pg-copiar").innerHTML = '<option value="">Página em branco</option>' + lista.map((p) => '<option value="' + p.id + '">Copiar de “' + esc(p.nome) + "”</option>").join("");
  $("#grade-paginas").innerHTML = lista.map((p) => {
    const url = urlPublica(p);
    return '<article class="pagina-card' + (p.id === estado.paginaId ? " atual" : "") + '" data-pid="' + p.id + '">' +
      '<div class="pagina-capa" style="background:' + (PRESET_COR[p.preset] || PRESET_COR.aurora) + '"><span class="pagina-avatar" style="' + (p.avatar ? "background-image:url('" + esc(p.avatar) + "')" : "") + '">' + (p.avatar ? "" : esc((p.nome || "?").charAt(0).toUpperCase())) + "</span>" +
      (p.principal ? '<span class="tag principal">' + ico("estrela") + "Principal</span>" : "") + "</div>" +
      '<div class="pagina-info"><b>' + esc(p.nome) + '</b><a class="mono" href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url.replace(/^https?:\/\//, "")) + "</a>" +
      '<div class="pagina-nums"><span><b>' + fmt.format(p.visitas) + "</b> visitas</span><span><b>" + p.links + "</b> links</span><span>editada " + quando(p.atualizado_em) + "</span></div></div>" +
      '<div class="linha-acoes"><button class="btn pri" data-acao="editar">' + ico("editar") + "Editar</button>" +
      '<button class="btn fant btn-ico" data-acao="copiar" title="Copiar endereço">' + ico("copiar") + "</button>" +
      '<button class="btn fant" data-acao="renomear">Renomear</button>' +
      (p.principal ? "" : '<button class="btn fant" data-acao="principal" title="Abrir em / (endereço raiz)">Tornar principal</button>') +
      (lista.length > 1 ? '<button class="btn fant btn-ico perigo-txt" data-acao="excluir" title="Excluir">' + ico("lixo") + "</button>" : "") + "</div></article>";
  }).join("");
}

export function iniciar() {
  $("#pg-nome").addEventListener("input", (e) => {
    const slug = $("#pg-slug");
    if (!slug.dataset.mexido) slug.value = e.target.value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  });
  $("#pg-slug").addEventListener("input", (e) => { e.target.dataset.mexido = "1"; });
  $("#form-pagina").addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const p = await api("/api/admin/paginas", { method: "POST", body: { nome: $("#pg-nome").value, slug: $("#pg-slug").value, copiar_de: +$("#pg-copiar").value || null } });
      e.target.reset(); delete $("#pg-slug").dataset.mexido;
      toast("Página criada: ?p=" + p.slug);
      estado.paginaId = p.id; await aoMudarLista(); carregar();
    } catch (err) { toast(err.message, true); }
  });
  $("#grade-paginas").addEventListener("click", async (e) => {
    const b = e.target.closest("[data-acao]"); if (!b) return;
    const p = estado.paginas.find((x) => x.id === +b.closest("[data-pid]").dataset.pid), a = b.dataset.acao;
    try {
      if (a === "editar") { estado.paginaId = p.id; await aoMudarLista(); window.dispatchEvent(new CustomEvent("farejador:ir", { detail: "links" })); return; }
      if (a === "copiar") { copiar(urlPublica(p)); return; }
      if (a === "renomear") {
        const nome = prompt("Nome da página:", p.nome); if (nome === null) return;
        const slug = prompt("Endereço (depois de ?p=):", p.slug); if (slug === null) return;
        await api("/api/admin/paginas/" + p.id, { method: "PATCH", body: { nome, slug } });
        if (slug !== p.slug) toast("Atenção: o endereço antigo ?p=" + p.slug + " deixa de funcionar.");
      } else if (a === "principal") {
        await api("/api/admin/paginas/" + p.id, { method: "PATCH", body: { principal: true } });
        toast("“" + p.nome + "” agora abre no endereço principal.");
      } else if (a === "excluir") {
        if (!confirm("Excluir a página “" + p.nome + "”? Os links, campanhas e TODAS as estatísticas dela serão apagados.")) return;
        if (prompt("Digite o endereço da página para confirmar:", "") !== p.slug) { toast("Exclusão cancelada."); return; }
        await api("/api/admin/paginas/" + p.id, { method: "DELETE" });
        if (estado.paginaId === p.id) estado.paginaId = null;
      }
      await aoMudarLista(); carregar();
    } catch (err) { toast(err.message, true); }
  });
}
