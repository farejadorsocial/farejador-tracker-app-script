// Aparência e textos: perfil, fundo, botões, fontes e textos da página.
import { api } from "../api.js";
import { aoRecarregar, atualizarPreview, carregarPagina, cfg, enviarImagem, marcarAlterado } from "../editor.js";
import { estado } from "../estado.js";
import { $, $$, esc, toast } from "../util.js";

const TEMAS = [
  ["aurora", "Aurora", "linear-gradient(135deg,#0b0a1a,#7c5cff 60%,#ff4fa3)"],
  ["claro", "Claro", "linear-gradient(135deg,#f6f5f2,#c7b8ff 60%,#ffc2dd)"],
  ["neon", "Neon", "linear-gradient(135deg,#05050a,#00ffa3 50%,#b400ff)"],
  ["por-do-sol", "Pôr do sol", "linear-gradient(135deg,#1d0b14,#ff7a45 50%,#ffc94a)"],
  ["oceano", "Oceano", "linear-gradient(135deg,#04121f,#0ea5e9 55%,#14b8a6)"],
  ["floresta", "Floresta", "linear-gradient(135deg,#07140d,#22c55e 55%,#84cc16)"],
  ["grafite", "Grafite", "linear-gradient(135deg,#111113,#3f3f46 60%,#52525b)"],
];
let fontes = [];

const ler = (cam) => cam.split(".").reduce((o, k) => (o || {})[k], cfg());
function gravar(cam, v) { const ks = cam.split("."); const ult = ks.pop(); ks.reduce((o, k) => (o[k] = o[k] || {}), cfg())[ult] = v; }

export async function carregar() {
  await carregarPagina();
  if (!fontes.length) {
    try { fontes = (await api("/api/admin/opcoes")).fontes; } catch (_) { fontes = ["Plus Jakarta Sans"]; }
    $$(".sel-fonte").forEach((s) => { s.innerHTML = (s.dataset.vazio ? '<option value="">' + esc(s.dataset.vazio) + "</option>" : "") + fontes.map((f) => '<option value="' + esc(f) + '" style="font-family:\'' + esc(f) + '\'">' + esc(f) + "</option>").join(""); });
    const l = document.createElement("link"); l.rel = "stylesheet";
    l.href = "https://fonts.googleapis.com/css2?" + fontes.map((f) => "family=" + encodeURIComponent(f).replace(/%20/g, "+")).join("&") + "&display=swap";
    document.head.appendChild(l);
  }
  preencher(); atualizarPreview();
}

function preencher() {
  if (!cfg()) return;
  $$("#form-aparencia [data-campo]").forEach((el) => { const v = ler(el.dataset.campo); if (el.type === "checkbox") el.checked = !!v; else el.value = v == null ? "" : v; });
  $$("#form-aparencia [data-valor]").forEach((el) => { el.textContent = ler(el.dataset.valor); });
  $("#temas").innerHTML = TEMAS.map(([id, nome, g]) => '<button type="button" class="tema-op' + (cfg().tema.preset === id ? " on" : "") + '" data-tema="' + id + '"><i style="background:' + g + '"></i><span>' + nome + "</span></button>").join("");
  visibilidade(); avatarPrev();
}

function visibilidade() {
  const t = cfg().tema, fundo = t.fundo_tipo || "preset";
  $$("#seg-fundo button").forEach((b) => b.classList.toggle("on", b.dataset.fundo === fundo));
  $$("#form-aparencia [data-mostrar]").forEach((el) => { el.hidden = !el.dataset.mostrar.split(" ").includes(fundo); });
  $$("#form-aparencia [data-estilo]").forEach((el) => { el.hidden = !el.dataset.estilo.split(" ").includes(t.estilo_botao); });
  $("#rot-cor1").textContent = fundo === "gradiente" ? "Primeira cor" : fundo === "imagem" ? "Cor de reserva (enquanto a imagem carrega)" : "Cor do fundo";
}

function avatarPrev() {
  const p = cfg().perfil, el = $("#avatar-prev");
  el.style.backgroundImage = p.avatar ? "url('" + p.avatar.replace(/'/g, "%27") + "')" : "";
  el.textContent = p.avatar ? "" : (p.nome || "?").charAt(0).toUpperCase();
  el.dataset.forma = cfg().tema.forma_avatar;
}

export function iniciar() {
  aoRecarregar(() => { if (estado.vista === "aparencia") preencher(); });
  const form = $("#form-aparencia");
  form.addEventListener("input", (e) => {
    const el = e.target, cam = el.dataset.campo; if (!cam || !cfg()) return;
    let v = el.type === "checkbox" ? el.checked : el.value;
    if (el.type === "range") v = +v;
    if (el.type !== "color" && /cor/.test(cam) && el.type !== "checkbox" && !/^#[0-9a-f]{6}$/i.test(v)) return; // espera a cor completa
    gravar(cam, v);
    $$('#form-aparencia [data-campo="' + cam + '"]').forEach((o) => { if (o !== el && o.type !== "checkbox") o.value = v; });
    $$('#form-aparencia [data-valor="' + cam + '"]').forEach((o) => (o.textContent = v));
    if (cam.startsWith("perfil.") || cam === "tema.forma_avatar") avatarPrev();
    if (cam === "tema.estilo_botao") visibilidade();
    marcarAlterado();
  });
  $("#temas").addEventListener("click", (e) => {
    const b = e.target.closest("[data-tema]"); if (!b) return;
    cfg().tema.preset = b.dataset.tema; $$(".tema-op").forEach((x) => x.classList.toggle("on", x === b)); marcarAlterado();
  });
  $("#seg-fundo").addEventListener("click", (e) => {
    const b = e.target.closest("[data-fundo]"); if (!b) return;
    cfg().tema.fundo_tipo = b.dataset.fundo; visibilidade(); marcarAlterado();
  });
  $("#avatar-arquivo").addEventListener("change", async (e) => {
    try { const url = await enviarImagem(e.target.files[0], "avatar"); if (url) { cfg().perfil.avatar = url; preencher(); marcarAlterado(); } } catch (err) { toast(err.message, true); }
    e.target.value = "";
  });
  $("#fundo-arquivo").addEventListener("change", async (e) => {
    try { const url = await enviarImagem(e.target.files[0], "fundo"); if (url) { cfg().tema.fundo_imagem = url; preencher(); marcarAlterado(); } } catch (err) { toast(err.message, true); }
    e.target.value = "";
  });
  $("#avatar-remover").addEventListener("click", () => { cfg().perfil.avatar = ""; preencher(); marcarAlterado(); });
}
