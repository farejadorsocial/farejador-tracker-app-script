/**
 * 08_Manutencao.gs — configuração inicial, limpeza automática e recuperação de senha.
 *
 * Funções para rodar manualmente no editor (menu "Executar"):
 *   configurar()          → cria as abas e o gatilho da limpeza automática (rode uma vez)
 *   redefinirSenhaAdmin() → troca a senha do usuário "admin" (edite NOVA_SENHA abaixo antes)
 */

function configurar() {
  planilha_();
  Object.keys(TABELAS).forEach(aba_);
  var padrao = planilha_().getSheetByName('Página1') || planilha_().getSheetByName('Sheet1') || planilha_().getSheetByName('Planilha1');
  if (padrao && planilha_().getSheets().length > 1) planilha_().deleteSheet(padrao);
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'gatilhoLimpeza') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('gatilhoLimpeza').timeBased().everyHours(6).create();
  if (!obterPagina_()) criarPagina_('Página principal', 'principal', null, true);
  Logger.log('Pronto! Agora publique: Implantar → Nova implantação → App da Web (Executar como: Eu · Acesso: Qualquer pessoa).');
}

function redefinirSenhaAdmin() {
  var NOVA_SENHA = 'troque-esta-senha'; // ← escreva a nova senha aqui, rode a função e depois apague daqui
  var USUARIO = 'admin';
  if (NOVA_SENHA === 'troque-esta-senha') throw new Error('Edite a variável NOVA_SENHA antes de rodar.');
  validarSenhaNova_(NOVA_SENHA);
  var u = ler_('usuarios').filter(function (x) { return x.usuario.toLowerCase() === USUARIO; })[0];
  if (u) definirSenha_(Number(u.id), NOVA_SENHA); else criarUsuario_(USUARIO, NOVA_SENHA);
  comTrava_(function () { excluirOnde_('sessoes_admin', function () { return true; }); });
  Logger.log('Senha de "' + USUARIO + '" redefinida. Apague a senha do código agora.');
}

function gatilhoLimpeza() { limparDadosAntigos_(false); }

function obterRetencao_() {
  var r = ajuste_('retencao', {}) || {};
  return { eventos_dias: r.eventos_dias === undefined ? RETENCAO_PADRAO.eventos_dias : r.eventos_dias,
           visitantes_dias: r.visitantes_dias === undefined ? RETENCAO_PADRAO.visitantes_dias : r.visitantes_dias,
           ativa: r.ativa === undefined ? RETENCAO_PADRAO.ativa : r.ativa };
}

function limparDadosAntigos_(forcar) {
  var r = obterRetencao_(), agora = Date.now() / 1000;
  var res = { eventos: 0, visitantes: 0, sessoes_admin: 0, executado_em: agoraIso_() };
  comTrava_(function () {
    res.sessoes_admin = excluirOnde_('sessoes_admin', function (s) { return Number(s.expira) < agora; });
    if (!(r.ativa || forcar)) return;
    if (r.eventos_dias > 0) { // eventos estão em ordem cronológica: apaga o bloco do início
      var sh = aba_('eventos'), n = sh.getLastRow() - 1, limite = agora - r.eventos_dias * 86400;
      if (n > 0) {
        var ep = sh.getRange(2, 3, n, 1).getValues(), k = 0;
        while (k < ep.length && Number(ep[k][0]) < limite) k++;
        if (k > 0) { sh.deleteRows(2, k); res.eventos = k; }
      }
    }
    if (r.visitantes_dias > 0) {
      var lim = agora - r.visitantes_dias * 86400, vivos = {};
      res.visitantes = excluirOnde_('visitantes', function (v) { var sai = Number(v.epoch) < lim; if (!sai) vivos[v.id] = true; return sai; });
      if (res.visitantes) reescrever_('visitante_sessoes', ler_('visitante_sessoes').filter(function (x) { return vivos[x.visitante]; }));
    }
  });
  definirAjuste_('ultima_limpeza', res);
  return res;
}
