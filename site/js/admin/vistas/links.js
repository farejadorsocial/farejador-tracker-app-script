// Editor de links e redes da página selecionada.
import { cfg, carregarPagina, enviarImagem, marcarAlterado, aoRecarregar, atualizarPreview } from "../editor.js";
import { estado } from "../estado.js";
import { $, $$, ICONES, corVisivel, esc, svgIcone, toast } from "../util.js";

const URL_BASE = { instagram: "https://instagram.com/", tiktok: "https://www.tiktok.com/@", youtube: "https://youtube.com/@", kwai: "https://www.kwai.com/@", facebook: "https://facebook.com/", whatsapp: "https://wa.me/55", telegram: "https://t.me/", x: "https://x.com/", threads: "https://www.threads.net/@", bluesky: "https://bsky.app/profile/", linkedin: "https://www.linkedin.com/in/", github: "https://github.com/", pinterest: "https://pinterest.com/", spotify: "https://open.spotify.com/", discord: "https://discord.gg/", twitch: "https://twitch.tv/", kick: "https://kick.com/", email: "mailto:", telefone: "tel:+55", gmail: "mailto:" };
const abertos = new Set();
let arrastando = null;

export async function carregar() {
  await carregarPagina();
  renderGaleria(); render(); atualizarPreview();
}

export function renderGaleria() {
  $("#galeria").innerHTML = Object.entries(ICONES).map(([k, i]) => { const c = corVisivel(i.cor); return '<button type="button" data-tipo="' + k + '" style="--c:' + c + '">' + svgIcone(k, c) + "<span>" + esc(i.nome) + "</span></button>"; }).join("");
}

function cliques(id) { const s = estado.stats && estado.stats.links && estado.stats.links.find((l) => l.id === id); return s ? s.cliques : null; }

export function render() {
  if (!cfg()) return;
  const links = cfg().links;
  $("#qtd-links").textContent = links.length;
  const opcoes = Object.entries(ICONES).map(([k, i]) => '<option value="' + k + '">' + esc(i.nome) + "</option>").join("");
  $("#links-ed").innerHTML = links.length ? links.map((l, idx) => {
    const ic = ICONES[l.tipo] || ICONES.link, real = l.cor || ic.cor, cor = corVisivel(real), ab = abertos.has(l.id), nc = cliques(l.id);
    return '<li class="link-ed' + (l.ativo ? "" : " inativo") + '" data-idx="' + idx + '" draggable="true" style="--c:' + esc(cor) + '">' +
      '<div class="link-ed-topo"><span class="alca" title="Arrastar">⋮⋮</span><span class="ico">' + (l.icone_custom ? '<img src="' + esc(l.icone_custom) + '" alt="">' : svgIcone(l.tipo, cor)) + "</span>" +
      '<div class="link-ed-nome"><b>' + esc(l.titulo || ic.nome) + "</b><small>" + esc(l.url || "sem URL") + "</small></div>" +
      '<div class="link-ed-acoes">' + (nc != null ? '<span class="pill" title="cliques no período">' + nc + " cliques</span>" : "") +
      '<label class="chave" title="Publicado"><input type="checkbox" data-k="ativo"' + (l.ativo ? " checked" : "") + "><span></span></label>" +
      '<button class="btn fant ico-btn" data-acao="cima" title="Subir">↑</button><button class="btn fant ico-btn" data-acao="baixo" title="Descer">↓</button>' +
      '<button class="btn sec ico-btn" data-acao="editar" title="Editar">' + (ab ? "▴" : "✎") + "</button></div></div>" +
      (ab ? '<div class="link-ed-corpo">' +
        '<label class="campo"><span>Rede / tipo de ícone</span><select data-k="tipo">' + opcoes.replace('value="' + l.tipo + '"', 'value="' + l.tipo + '" selected') + "</select></label>" +
        '<label class="campo"><span>Título</span><input data-k="titulo" value="' + esc(l.titulo) + '" maxlength="80"></label>' +
        '<label class="campo span2"><span>URL (perfil, site, wa.me, mailto:, tel:)</span><input data-k="url" value="' + esc(l.url) + '" placeholder="https://"></label>' +
        '<label class="campo span2"><span>Subtítulo (ex.: “120 mil seguidores”)</span><input data-k="subtitulo" value="' + esc(l.subtitulo) + '" maxlength="120"></label>' +
        '<label class="campo"><span>Aparece como</span><select data-k="exibicao"><option value="botao"' + (l.exibicao !== "icone" ? " selected" : "") + '>Botão grande (lista)</option><option value="icone"' + (l.exibicao === "icone" ? " selected" : "") + ">Ícone pequeno (no topo)</option></select></label>" +
        '<label class="campo"><span>Cor personalizada</span><span class="cor-campo"><input type="color" data-k="cor" value="' + esc(real) + '"><button class="btn fant" data-acao="cor-padrao" type="button">Cor oficial</button></span></label>' +
        '<label class="check"><input type="checkbox" data-k="destaque"' + (l.destaque ? " checked" : "") + "> Destacar (borda pulsante)</label>" +
        '<div class="linha-acoes fim"><label class="btn sec">Imagem própria<input type="file" accept="image/png,image/jpeg,image/webp,image/gif" data-acao="imagem" hidden></label>' +
        (l.icone_custom ? '<button class="btn fant" data-acao="sem-imagem" type="button">Usar ícone padrão</button>' : "") +
        '<button class="btn perigo" data-acao="remover" type="button">Remover</button></div>' +
        '<p class="muted pq span2">Todo clique neste link é registrado automaticamente (id <code>' + esc(l.id) + "</code>).</p></div>" : "") + "</li>";
  }).join("") : '<li class="vazio">Nenhum link. Escolha uma rede acima para começar.</li>';
}

const linkDe = (el) => cfg().links[+el.closest(".link-ed").dataset.idx];

export function iniciar() {
  aoRecarregar(() => { if (estado.vista === "links") render(); });
  $("#galeria").addEventListener("click", (e) => {
    const b = e.target.closest("button[data-tipo]"); if (!b || !cfg()) return;
    const tipo = b.dataset.tipo, i = ICONES[tipo];
    let id; do { id = tipo + "-" + Math.random().toString(36).slice(2, 6); } while (cfg().links.some((l) => l.id === id));
    cfg().links.push({ id, tipo, titulo: i.nome, subtitulo: "", url: URL_BASE[tipo] || "https://", ativo: true, exibicao: "botao", destaque: false, icone_custom: "", cor: "" });
    abertos.add(id); render(); marcarAlterado();
    setTimeout(() => { const el = $('.link-ed:last-child input[data-k="url"]'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); el.scrollIntoView({ block: "center", behavior: "smooth" }); } }, 30);
  });
  const ed = $("#links-ed");
  ed.addEventListener("input", (e) => {
    const k = e.target.dataset.k; if (!k) return;
    const l = linkDe(e.target), li = e.target.closest(".link-ed");
    l[k] = e.target.type === "checkbox" ? e.target.checked : e.target.value;
    if (k === "titulo" || k === "url") { $(".link-ed-nome b", li).textContent = l.titulo; $(".link-ed-nome small", li).textContent = l.url; }
    if (k === "ativo") li.classList.toggle("inativo", !l.ativo);
    if (k === "tipo" || k === "cor") {
      if (k === "tipo") { l.cor = ""; const i = ICONES[l.tipo]; if (i && (!l.titulo || Object.values(ICONES).some((x) => x.nome === l.titulo))) l.titulo = i.nome; }
      render();
    }
    marcarAlterado();
  });
  ed.addEventListener("change", async (e) => {
    if (e.target.dataset.acao !== "imagem") return;
    const l = linkDe(e.target);
    try { const url = await enviarImagem(e.target.files[0], l.tipo); if (url) { l.icone_custom = url; render(); marcarAlterado(); } } catch (err) { toast(err.message, true); }
  });
  ed.addEventListener("click", (e) => {
    const b = e.target.closest("[data-acao]"); if (!b || b.dataset.acao === "imagem") return;
    const links = cfg().links, idx = +b.closest(".link-ed").dataset.idx, l = links[idx], a = b.dataset.acao;
    if (a === "editar") abertos.has(l.id) ? abertos.delete(l.id) : abertos.add(l.id);
    else if (a === "cima" && idx > 0) [links[idx - 1], links[idx]] = [links[idx], links[idx - 1]];
    else if (a === "baixo" && idx < links.length - 1) [links[idx + 1], links[idx]] = [links[idx], links[idx + 1]];
    else if (a === "remover") { if (!confirm("Remover “" + (l.titulo || l.id) + "”? Os cliques já registrados continuam no histórico.")) return; links.splice(idx, 1); }
    else if (a === "cor-padrao") l.cor = "";
    else if (a === "sem-imagem") l.icone_custom = "";
    else return;
    render(); if (a !== "editar") marcarAlterado();
  });
  ed.addEventListener("dragstart", (e) => {
    const li = e.target.closest(".link-ed");
    if (!li || (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement.tagName) && li.contains(document.activeElement))) { e.preventDefault(); return; }
    arrastando = +li.dataset.idx; li.classList.add("arrastando"); e.dataTransfer.effectAllowed = "move";
  });
  ed.addEventListener("dragover", (e) => { const li = e.target.closest(".link-ed"); if (arrastando == null || !li) return; e.preventDefault(); $$(".link-ed.sobre").forEach((x) => x.classList.remove("sobre")); li.classList.add("sobre"); });
  ed.addEventListener("drop", (e) => {
    const li = e.target.closest(".link-ed"); if (arrastando == null || !li) return; e.preventDefault();
    const links = cfg().links, [m] = links.splice(arrastando, 1); links.splice(+li.dataset.idx, 0, m);
    arrastando = null; render(); marcarAlterado();
  });
  ed.addEventListener("dragend", () => { arrastando = null; $$(".link-ed").forEach((x) => x.classList.remove("arrastando", "sobre")); });
}
