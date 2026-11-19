// Estado compartilhado entre as telas do painel.
import { BASE } from "./api.js";
export const estado = {
  vista: "geral",
  paginas: [],          // lista resumida
  paginaId: null,       // página selecionada
  pagina: null,         // página completa (com config) em edição
  cfgSalva: "",         // config salva (para detectar alterações)
  dias: 30, de: null, ate: null,
  comparar: false, robos: false,
  stats: null,
};

try {
  const s = JSON.parse(localStorage.getItem("farejador_painel_filtros") || "{}");
  if (s.dias) estado.dias = s.dias;
  estado.comparar = !!s.comparar;
  if (s.paginaId) estado.paginaId = s.paginaId;
} catch (_) {}

export function lembrarFiltros() {
  try { localStorage.setItem("farejador_painel_filtros", JSON.stringify({ dias: estado.dias, comparar: estado.comparar, paginaId: estado.paginaId })); } catch (_) {}
}

/** Parâmetros de página + período para a API. */
export function query(extra) {
  const p = new URLSearchParams();
  if (estado.paginaId) p.set("pagina", estado.paginaId);
  if (estado.dias === "custom" && estado.de && estado.ate) { p.set("de", estado.de); p.set("ate", estado.ate); }
  else p.set("dias", estado.dias === "custom" ? 30 : estado.dias);
  if (estado.robos) p.set("robos", "true");
  Object.entries(extra || {}).forEach(([k, v]) => p.set(k, v));
  return "?" + p.toString();
}

export function paginaAtual() { return estado.paginas.find((p) => p.id === estado.paginaId) || estado.paginas[0]; }
export function urlPublica(p) { p = p || paginaAtual(); return p && !p.principal ? BASE + "?p=" + p.slug : BASE; }
export const urlCampanha = (codigo) => BASE + "?c=" + codigo;
