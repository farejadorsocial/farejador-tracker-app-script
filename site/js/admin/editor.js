// Edição da página selecionada: carregar, detectar alterações, prévia ao vivo e salvar.
import { BASE, api } from "./api.js";
import { estado } from "./estado.js";
import { $, $$, lerArquivoComoDataURL, toast } from "./util.js";

const ouvintes = [];
export function aoRecarregar(fn) { ouvintes.push(fn); }

export async function carregarPagina(forcar) {
  if (!estado.paginaId) return null;
  if (!forcar && estado.pagina && estado.pagina.id === estado.paginaId) return estado.pagina;
  estado.pagina = await api("/api/admin/paginas/" + estado.paginaId + "/config");
  estado.cfgSalva = JSON.stringify(estado.pagina.config);
  $("#salvar-barra").hidden = true;
  const src = BASE + "?p=" + estado.pagina.slug + "&preview=1";
  $$(".preview iframe").forEach((f) => { if (f.src !== src) f.src = src; });
  return estado.pagina;
}

export const cfg = () => estado.pagina && estado.pagina.config;
export const temAlteracoes = () => !!estado.pagina && JSON.stringify(estado.pagina.config) !== estado.cfgSalva;

export function marcarAlterado() {
  $("#salvar-barra").hidden = !temAlteracoes();
  atualizarPreview();
}

export function atualizarPreview() {
  if (!estado.pagina) return;
  $$(".preview iframe").forEach((f) => {
    if (!f.contentWindow) return;
    f.contentWindow.postMessage({ tipo: "farejador-preview", slug: estado.pagina.slug, config: JSON.parse(JSON.stringify(estado.pagina.config)),
      mostrarAviso: estado.vista === "aparencia" && estado.pagina.config.coleta.mostrar_aviso }, location.origin);
  });
}

export async function salvar() {
  try {
    const p = await api("/api/admin/paginas/" + estado.pagina.id + "/config", { method: "PUT", body: estado.pagina.config });
    estado.pagina = p; estado.cfgSalva = JSON.stringify(p.config);
    $("#salvar-barra").hidden = true; toast("Página publicada!");
    ouvintes.forEach((fn) => fn());
  } catch (e) { toast(e.message, true); }
}

export function descartar() {
  estado.pagina.config = JSON.parse(estado.cfgSalva);
  $("#salvar-barra").hidden = true;
  ouvintes.forEach((fn) => fn()); atualizarPreview();
}

export async function enviarImagem(arquivo, nome) {
  if (!arquivo) return null;
  if (arquivo.size > 5 * 1024 * 1024) { toast("Imagem acima de 5 MB.", true); return null; }
  const r = await api("/api/admin/upload", { method: "POST", body: { nome, data_url: await lerArquivoComoDataURL(arquivo) } });
  return r.url;
}

export function iniciar() {
  $("#salvar").addEventListener("click", salvar);
  $("#descartar").addEventListener("click", descartar);
  addEventListener("message", (e) => { if (e.origin === location.origin && e.data && e.data.tipo === "farejador-preview-pronto") atualizarPreview(); });
  addEventListener("beforeunload", (e) => { if (temAlteracoes()) { e.preventDefault(); e.returnValue = ""; } });
}
