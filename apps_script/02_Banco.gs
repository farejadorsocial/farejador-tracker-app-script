/**
 * 02_Banco.gs — a planilha funciona como banco de dados (uma aba por tabela).
 * Todas as células são texto puro para o Google Planilhas não "converter" datas e números.
 */
var TABELAS = {
  paginas: ['id', 'slug', 'nome', 'principal', 'config', 'criado_em', 'atualizado_em'],
  eventos: ['id', 'ts', 'epoch', 'tipo', 'pagina_id', 'sessao', 'visitante', 'robo', 'canal', 'link_id', 'campanha_id', 'dados'],
  visitantes: ['id', 'criado_em', 'atualizado_em', 'epoch', 'coletas', 'ip', 'registro', 'ipinfo'],
  visitante_sessoes: ['visitante', 'sessao'],
  campanhas: ['id', 'codigo', 'pagina_id', 'nome', 'origem', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'ativo', 'criado_em'],
  usuarios: ['id', 'usuario', 'hash', 'sal', 'iteracoes', 'criado_em', 'ultimo_login', 'falhas', 'bloqueado_ate'],
  sessoes_admin: ['token_hash', 'usuario_id', 'criado_em', 'expira', 'ultimo_uso', 'ua'],
  ajustes: ['chave', 'valor']
};

var _cacheAbas = {};

function planilha_() {
  var id = PropertiesService.getScriptProperties().getProperty('PLANILHA_ID');
  if (id) return SpreadsheetApp.openById(id);
  var ativa = SpreadsheetApp.getActiveSpreadsheet();
  if (!ativa) throw new Error('Rode a função "configurar" uma vez no editor do Apps Script.');
  PropertiesService.getScriptProperties().setProperty('PLANILHA_ID', ativa.getId());
  return ativa;
}

function aba_(nome) {
  if (_cacheAbas[nome]) return _cacheAbas[nome];
  var ss = planilha_();
  var sh = ss.getSheetByName(nome);
  if (!sh) {
    sh = ss.insertSheet(nome);
    var cab = TABELAS[nome];
    sh.getRange(1, 1, sh.getMaxRows(), cab.length).setNumberFormat('@');
    sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#1d2c49').setFontColor('#ffffff');
    sh.setFrozenRows(1);
  }
  _cacheAbas[nome] = sh;
  return sh;
}

/** Lê a tabela inteira como lista de objetos (com _linha = número da linha na planilha). */
function ler_(nome) {
  var sh = aba_(nome), cab = TABELAS[nome], n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var valores = sh.getRange(2, 1, n, cab.length).getValues();
  var saida = [];
  for (var i = 0; i < valores.length; i++) {
    var o = { _linha: i + 2 };
    for (var j = 0; j < cab.length; j++) o[cab[j]] = valores[i][j] === null ? '' : String(valores[i][j]);
    saida.push(o);
  }
  return saida;
}

function linhaDe_(nome, obj) {
  return TABELAS[nome].map(function (c) {
    var v = obj[c];
    if (v === undefined || v === null) return '';
    if (typeof v === 'object') v = JSON.stringify(v);
    return String(v);
  });
}

function inserir_(nome, obj) {
  var sh = aba_(nome), linha = linhaDe_(nome, obj);
  var nova = sh.getLastRow() + 1;
  if (nova > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 500);
  sh.getRange(nova, 1, 1, linha.length).setNumberFormat('@').setValues([linha]);
}

function inserirVarios_(nome, objs) {
  if (!objs.length) return;
  var sh = aba_(nome), linhas = objs.map(function (o) { return linhaDe_(nome, o); });
  var ini = sh.getLastRow() + 1;
  if (ini + linhas.length > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), linhas.length + 500);
  sh.getRange(ini, 1, linhas.length, linhas[0].length).setNumberFormat('@').setValues(linhas);
}

/** Atualiza a linha de um objeto lido por ler_ (precisa de _linha). */
function atualizar_(nome, obj) {
  var sh = aba_(nome), linha = linhaDe_(nome, obj);
  sh.getRange(obj._linha, 1, 1, linha.length).setNumberFormat('@').setValues([linha]);
}

/** Exclui as linhas cujo objeto satisfaz o filtro (de baixo para cima). */
function excluirOnde_(nome, filtro) {
  var sh = aba_(nome), itens = ler_(nome), n = 0;
  for (var i = itens.length - 1; i >= 0; i--) {
    if (filtro(itens[i])) { sh.deleteRow(itens[i]._linha); n++; }
  }
  return n;
}

function buscar_(nome, campo, valor) {
  var itens = ler_(nome);
  for (var i = 0; i < itens.length; i++) if (itens[i][campo] === String(valor)) return itens[i];
  return null;
}

function proximoId_(nome) {
  var props = PropertiesService.getScriptProperties();
  var chave = 'SEQ_' + nome;
  var n = Number(props.getProperty(chave) || 0);
  if (!n) { // primeira vez: maior id existente
    ler_(nome).forEach(function (o) { n = Math.max(n, Number(o.id) || 0); });
  }
  n += 1;
  props.setProperty(chave, String(n));
  return n;
}

/** Trava de escrita: evita que duas requisições escrevam ao mesmo tempo. */
function comTrava_(fn) {
  var trava = LockService.getScriptLock();
  trava.waitLock(25000);
  try { return fn(); } finally { trava.releaseLock(); }
}

function json_(texto, padrao) {
  if (!texto) return padrao === undefined ? {} : padrao;
  try { return JSON.parse(texto); } catch (e) { return padrao === undefined ? {} : padrao; }
}

function agoraIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'America/Sao_Paulo', "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function ajuste_(chave, padrao) {
  var o = buscar_('ajustes', 'chave', chave);
  return o ? json_(o.valor, padrao) : padrao;
}

function definirAjuste_(chave, valor) {
  var o = buscar_('ajustes', 'chave', chave);
  if (o) { o.valor = JSON.stringify(valor); atualizar_('ajustes', o); }
  else inserir_('ajustes', { chave: chave, valor: JSON.stringify(valor) });
}

// ------------------------------------------------------------------ eventos
function gravarEvento_(ev) {
  var agora = new Date();
  var dados = {};
  var colunas = ['tipo', 'pagina_id', 'sessao', 'visitante', 'canal', 'link_id', 'campanha_id'];
  Object.keys(ev).forEach(function (k) { if (colunas.indexOf(k) < 0 && k !== 'robo') dados[k] = ev[k]; });
  var linha = {
    id: String(agora.getTime()) + Math.floor(Math.random() * 1000),
    ts: agoraIso_(), epoch: String(agora.getTime() / 1000),
    tipo: ev.tipo, pagina_id: ev.pagina_id, sessao: ev.sessao || '', visitante: ev.visitante || '',
    robo: ev.robo ? '1' : '0', canal: ev.canal || '', link_id: ev.link_id || '', campanha_id: ev.campanha_id || '',
    dados: JSON.stringify(dados).slice(0, LIMITE_CELULA)
  };
  comTrava_(function () { inserir_('eventos', linha); });
}

/** Converte uma linha da aba eventos no formato usado pelo painel. */
function eventoObj_(o) {
  var ev = json_(o.dados);
  ev.id = o.id; ev.ts = o.ts; ev.ts_epoch = Number(o.epoch); ev.tipo = o.tipo;
  ev.pagina_id = Number(o.pagina_id) || null; ev.sessao = o.sessao || null; ev.visitante = o.visitante || null;
  ev.robo = o.robo === '1'; ev.canal = o.canal || null; ev.link_id = o.link_id || null;
  ev.campanha_id = o.campanha_id ? Number(o.campanha_id) : null;
  return ev;
}

/** Eventos de uma página entre dois instantes (segundos). Usa a ordem cronológica da aba para ler só o trecho necessário. */
function eventosEntre_(paginaId, ini, fim) {
  var sh = aba_('eventos'), n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var epochs = sh.getRange(2, 3, n, 1).getValues();
  var lo = 0, hi = n; // primeira linha com epoch >= ini
  while (lo < hi) { var m = (lo + hi) >> 1; if (Number(epochs[m][0]) < ini) lo = m + 1; else hi = m; }
  if (lo >= n) return [];
  var cab = TABELAS.eventos, vals = sh.getRange(2 + lo, 1, n - lo, cab.length).getValues(), saida = [];
  for (var i = 0; i < vals.length; i++) {
    var ep = Number(vals[i][2]);
    if (ep > fim) break;
    if (String(vals[i][4]) !== String(paginaId)) continue;
    var o = {};
    for (var j = 0; j < cab.length; j++) o[cab[j]] = String(vals[i][j]);
    saida.push(eventoObj_(o));
  }
  return saida;
}
