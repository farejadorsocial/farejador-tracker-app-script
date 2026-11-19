/**
 * 00_Rotas.gs — porta de entrada do App da Web.
 * O site (GitHub Pages) envia POST com o corpo em texto {"acao": "...", ...}.
 * Usamos text/plain para o navegador não fazer "preflight" de CORS.
 */
// Montadas dentro de funções: no Apps Script os arquivos carregam em sequência,
// então as funções de outros arquivos só existem depois de tudo carregado.
function acoesPublicas_() { return {
  publico_config: acaoPublicoConfig_,
  evento: acaoEvento_,
  coleta: acaoColeta_,
  estado: acaoEstado_,
  primeiro_acesso: acaoPrimeiroAcesso_,
  login: acaoLogin_,
  logout: acaoLogout_
}; }

function acoesAdmin_() { return {
  sessoes: acaoSessoes_, sessoes_encerrar_outras: acaoEncerrarOutras_, sessao_encerrar: acaoEncerrarSessao_,
  trocar_senha: acaoTrocarSenha_, usuarios: acaoUsuarios_, usuario_criar: acaoCriarUsuario_, usuario_excluir: acaoExcluirUsuario_,
  paginas: acaoPaginas_, pagina_criar: acaoCriarPagina_, pagina_atualizar: acaoAtualizarPagina_, pagina_excluir: acaoExcluirPagina_,
  pagina_config: acaoPaginaConfig_, pagina_salvar: acaoSalvarPagina_, opcoes: acaoOpcoes_, upload: acaoUpload_,
  eventos_periodo: acaoEventosPeriodo_, retorno_base: acaoRetornoBase_, eventos_recentes: acaoEventosRecentes_,
  visitantes: acaoVisitantes_, visitante: acaoVisitante_, visitante_excluir: acaoExcluirVisitante_, ipinfo: acaoIpinfo_, mapa: acaoMapa_,
  campanhas_lista: acaoCampanhasLista_, campanha_criar: acaoCriarCampanha_, campanha_editar: acaoEditarCampanha_, campanha_excluir: acaoExcluirCampanha_,
  retencao: acaoRetencao_, retencao_salvar: acaoSalvarRetencao_, retencao_executar: acaoExecutarRetencao_
}; }

function resposta_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doGet(e) {
  return resposta_({ ok: true, servico: 'Farejador (Apps Script)', versao: VERSAO });
}

function doPost(e) {
  var req;
  try { req = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return resposta_({ erro: 'Requisição inválida.', status: 400 }); }
  try {
    var acao = String(req.acao || '');
    var pub = acoesPublicas_(), adm = acoesAdmin_();
    if (pub[acao]) return resposta_(pub[acao](req));
    if (adm[acao]) {
      var sessao = exigirAdmin_(req);
      return resposta_(adm[acao](req, sessao));
    }
    return resposta_({ erro: 'Ação desconhecida: ' + acao, status: 404 });
  } catch (err) {
    var status = err && err.status ? err.status : 500;
    if (status === 500) console.error(err && err.stack ? err.stack : err);
    return resposta_({ erro: status === 500 ? 'Erro interno: ' + (err && err.message) : err.message, status: status });
  }
}
