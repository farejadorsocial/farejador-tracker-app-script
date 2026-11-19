// QR Code da página ou de uma campanha, com download em PNG e SVG.
import { api } from "../api.js";
import { estado, paginaAtual, query, urlCampanha, urlPublica } from "../estado.js";
import { baixar, desenhar, svg } from "../qr.js";
import { $, copiar, esc } from "../util.js";

let alvoPendente = null;

/** Chamado de outras telas (ex.: campanhas) para abrir o QR já com o link escolhido. */
export function abrirQr(url, nome) {
  alvoPendente = { url, nome };
  window.dispatchEvent(new CustomEvent("farejador:ir", { detail: "qrcode" }));
}

function opcoes() {
  const p = paginaAtual();
  return { cor: $("#qr-cor").value, fundo: $("#qr-fundo").value, estilo: $("#qr-estilo").value, margem: +$("#qr-margem").value,
           logo: $("#qr-logo").checked && p && p.avatar ? p.avatar : null };
}
const alvo = () => $("#qr-alvo").value;

async function redesenhar() {
  if (!window.qrcode) { $("#qr-url").textContent = "Biblioteca de QR não carregou."; return; }
  $("#qr-url").textContent = alvo().replace(/^https?:\/\//, "");
  await desenhar($("#qr-canvas"), alvo(), opcoes());
}

export async function carregar() {
  const pagina = urlPublica();
  let campanhas = [];
  try { campanhas = (await api("/api/admin/campanhas" + query())).campanhas.filter((c) => c.ativo); } catch (_) {}
  const ops = [{ url: pagina, nome: "Página: " + (paginaAtual() || {}).nome }].concat(campanhas.map((c) => ({ url: urlCampanha(c.codigo), nome: "Campanha: " + c.nome })));
  if (alvoPendente && !ops.some((o) => o.url === alvoPendente.url)) ops.push({ url: alvoPendente.url, nome: "Campanha: " + alvoPendente.nome });
  $("#qr-alvo").innerHTML = ops.map((o) => '<option value="' + esc(o.url) + '">' + esc(o.nome) + "</option>").join("");
  if (alvoPendente) { $("#qr-alvo").value = alvoPendente.url; alvoPendente = null; }
  $("#qr-logo").disabled = !(paginaAtual() || {}).avatar;
  redesenhar();
}

export function iniciar() {
  ["#qr-alvo", "#qr-estilo", "#qr-margem", "#qr-logo"].forEach((s) => $(s).addEventListener("change", redesenhar));
  [["#qr-cor", "#qr-cor-txt"], ["#qr-fundo", "#qr-fundo-txt"]].forEach(([a, b]) => {
    $(a).addEventListener("input", () => { $(b).value = $(a).value; redesenhar(); });
    $(b).addEventListener("change", () => { if (/^#[0-9a-f]{6}$/i.test($(b).value)) { $(a).value = $(b).value; redesenhar(); } });
  });
  const nomeArq = () => "qrcode-" + ((estado.pagina && estado.pagina.slug) || "pagina");
  $("#qr-png").addEventListener("click", () => baixar(nomeArq() + ".png", $("#qr-canvas").toDataURL("image/png")));
  $("#qr-svg").addEventListener("click", () => baixar(nomeArq() + ".svg", svg(alvo(), opcoes()), "image/svg+xml"));
  $("#qr-copiar").addEventListener("click", () => copiar(alvo()));
}
