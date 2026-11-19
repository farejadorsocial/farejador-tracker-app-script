/**
 * Farejador — TODO o código do Apps Script em um único arquivo (para colar de uma vez).
 * É a junção dos arquivos 00_Rotas.gs … 08_Manutencao.gs desta pasta. Use OU este arquivo OU os separados.
 */

// ======================================================================
// 00_Rotas.gs
// ======================================================================
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

// ======================================================================
// 01_Config.gs
// ======================================================================
/**
 * Farejador — versão Apps Script (backend) + GitHub Pages (site).
 * 01_Config.gs — constantes do projeto.
 *
 * Propriedades do script (Configurações do projeto → Propriedades do script), opcionais:
 *   IPINFO_TOKEN  → token do ipinfo.io (aumenta o limite de consultas)
 */
var VERSAO = '1.0.0-gas';

var SLUGS_RESERVADOS = ['admin', 'api', 'c', 'css', 'js', 'vendor', 'img', 'index', '404'];

var SESSAO_CURTA_S = 60 * 60 * 12;        // 12 horas
var SESSAO_LONGA_S = 60 * 60 * 24 * 30;   // 30 dias ("manter conectado")
var MAX_FALHAS_USUARIO = 6;               // bloqueia a conta por 15 minutos
var BLOQUEIO_S = 15 * 60;
var SENHA_MIN = 8;
var ITERACOES_SENHA = 1500;               // HMAC-SHA256 iterado

var LIMITE_CELULA = 45000;                // a planilha aceita até 50.000 caracteres por célula

var RETENCAO_PADRAO = { eventos_dias: 180, visitantes_dias: 365, ativa: true };

var FONTES = ['Plus Jakarta Sans', 'Inter', 'Poppins', 'Montserrat', 'Nunito', 'Space Grotesk', 'Outfit',
  'DM Sans', 'Sora', 'Playfair Display', 'Lora', 'Bebas Neue', 'Righteous', 'Pacifico', 'Press Start 2P'];
var PRESETS = ['aurora', 'claro', 'neon', 'por-do-sol', 'oceano', 'floresta', 'grafite', 'personalizado'];

// ======================================================================
// 02_Banco.gs
// ======================================================================
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

// ======================================================================
// 03_Analise.gs
// ======================================================================
/**
 * 03_Analise.gs — User-Agent, robôs e origem da visita.
 */
var ROBOS_ = [
  [/WhatsApp/, 'WhatsApp (prévia)'],
  [/facebookexternalhit|facebookcatalog|meta-externalagent/i, 'Facebook/Instagram (prévia)'],
  [/Twitterbot/i, 'X/Twitter (prévia)'], [/TelegramBot/i, 'Telegram (prévia)'], [/Discordbot/i, 'Discord (prévia)'],
  [/Slackbot|Slack-ImgProxy/i, 'Slack (prévia)'], [/LinkedInBot/i, 'LinkedIn (prévia)'], [/Pinterestbot/i, 'Pinterest (prévia)'],
  [/Googlebot|AdsBot-Google|Google-InspectionTool|GoogleOther/i, 'Google (robô)'], [/bingbot|BingPreview/i, 'Bing (robô)'],
  [/YandexBot|Baiduspider|DuckDuckBot|Applebot|PetalBot|SemrushBot|AhrefsBot|GPTBot|ClaudeBot|CCBot|Bytespider/i, 'Rastreador'],
  [/HeadlessChrome|PhantomJS|Puppeteer|Playwright|Selenium/i, 'Navegador automatizado'],
  [/curl\/|Wget\/|python-requests|httpx|Go-http-client|okhttp|axios\/|node-fetch|PostmanRuntime/i, 'Script / ferramenta'],
  [/bot\b|crawler|spider|preview|scanner/i, 'Robô genérico']
];

function detectarRobo_(ua) {
  if (!ua) return 'Sem User-Agent';
  var real = /Mozilla\/5\.0 \((Linux; Android|iPhone|iPad|Windows NT|Macintosh|X11)/.test(ua);
  for (var i = 0; i < ROBOS_.length; i++) {
    if (ROBOS_[i][0].test(ua)) {
      if (ROBOS_[i][1] === 'WhatsApp (prévia)' && real && /Mobile/.test(ua)) return null;
      return ROBOS_[i][1];
    }
  }
  return null;
}

function analisarUa_(ua) {
  ua = ua || '';
  var robo = detectarRobo_(ua), nav;
  if (robo) nav = robo;
  else if (/Instagram/.test(ua)) nav = 'Instagram (app)';
  else if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) nav = 'TikTok (app)';
  else if (/FBAN|FBAV|FB_IAB/.test(ua)) nav = 'Facebook (app)';
  else if (/Kwai/i.test(ua)) nav = 'Kwai (app)';
  else if (/Edg\/|Edge\//.test(ua)) nav = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) nav = 'Opera';
  else if (/SamsungBrowser/.test(ua)) nav = 'Samsung Internet';
  else if (/Firefox\/|FxiOS/.test(ua)) nav = 'Firefox';
  else if (/Chrome\/|CriOS/.test(ua)) nav = 'Chrome';
  else if (/Safari\//.test(ua)) nav = 'Safari';
  else nav = 'Outro';
  var so = /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows'
    : /Mac OS X|Macintosh/.test(ua) ? 'macOS' : /CrOS/.test(ua) ? 'ChromeOS' : /Linux/.test(ua) ? 'Linux' : 'Outro';
  var disp = robo ? 'Robô' : (/iPad|Tablet/.test(ua) || (/Android/.test(ua) && !/Mobile/.test(ua))) ? 'Tablet'
    : /Mobile|iPhone|iPod|Android/.test(ua) ? 'Celular' : 'Computador';
  return { navegador: nav, sistema: so, dispositivo: disp };
}

var ORIGENS_ = [
  [/instagram/i, 'Instagram'], [/tiktok/i, 'TikTok'], [/youtube|youtu\.be/i, 'YouTube'], [/facebook|fb\.com|fb\.me/i, 'Facebook'],
  [/whatsapp|wa\.me/i, 'WhatsApp'], [/t\.me|telegram/i, 'Telegram'], [/twitter|t\.co$|^x\.com|\.x\.com|^x$/i, 'X / Twitter'],
  [/threads/i, 'Threads'], [/kwai/i, 'Kwai'], [/linkedin|lnkd\.in/i, 'LinkedIn'], [/google/i, 'Google'], [/bing/i, 'Bing'],
  [/pinterest/i, 'Pinterest'], [/reddit/i, 'Reddit'], [/discord/i, 'Discord'], [/^qr|qrcode/i, 'QR Code'],
  [/email|e-mail|newsletter|gmail|outlook/i, 'E-mail']
];

function rotuloOrigem_(texto) {
  for (var i = 0; i < ORIGENS_.length; i++) if (ORIGENS_[i][0].test(texto)) return ORIGENS_[i][1];
  return null;
}

function hostDe_(url) {
  var m = /^[a-z][a-z0-9+.-]*:\/\/([^\/?#:]+)/i.exec(url || '');
  return m ? m[1].toLowerCase() : null;
}

function classificarOrigem_(referer, utmSource, hostProprio, ua) {
  var dominio = hostDe_(referer);
  if (dominio && hostProprio && dominio === String(hostProprio).toLowerCase()) dominio = null; // navegação interna
  if (utmSource) {
    var nome = String(utmSource).trim().slice(0, 60);
    return { canal: rotuloOrigem_(nome) || nome, dominio: dominio, via: 'utm' };
  }
  if (dominio) return { canal: rotuloOrigem_(dominio) || dominio.replace(/^www\./, ''), dominio: dominio, via: 'referer' };
  var nav = analisarUa_(ua).navegador;
  if (/\(app\)$/.test(nav)) return { canal: nav.replace(' (app)', ''), dominio: null, via: 'app' };
  return { canal: 'Direto', dominio: null, via: 'direto' };
}

// ======================================================================
// 04_Paginas.gs
// ======================================================================
/**
 * 04_Paginas.gs — páginas públicas, personalização e validação.
 */
var CONFIG_PADRAO = {
  perfil: { nome: 'Minha página', usuario: '@usuario', bio: 'Todas as minhas redes em um só lugar. Escolha onde quer me acompanhar 👇', avatar: '', verificado: false },
  textos: {
    titulo_pagina: 'Minhas redes', descricao_pagina: 'Guia com todas as redes sociais e links oficiais.',
    secao_redes: 'Redes sociais', secao_links: 'Links em destaque', aviso_titulo: 'Sua privacidade',
    aviso_texto: 'Usamos dados técnicos do seu navegador (dispositivo, tela, idioma, origem da visita e IP) para estudar o desempenho desta página. Nada de câmera, microfone ou senhas.',
    botao_aceitar: 'Aceitar', botao_recusar: 'Só o essencial', botao_localizacao: 'Compartilhar localização (opcional)',
    botao_compartilhar: 'Compartilhar', rodape: 'Feito com Farejador'
  },
  tema: {
    preset: 'aurora', cor_destaque: '#7c5cff', fonte: 'Plus Jakarta Sans', fonte_titulo: '',
    fundo_tipo: 'preset', fundo_cor1: '#0b0a1a', fundo_cor2: '#3b1f7a', fundo_angulo: 160, fundo_imagem: '', fundo_escurecer: 40,
    fundo_animado: true, texto: 'claro', formato_botao: 'arredondado', estilo_botao: 'vidro', cor_botao: '#ffffff',
    cor_texto_botao: '#111111', animacao_botao: 'subir', forma_avatar: 'circulo', anel_avatar: true, icones_coloridos: true,
    mostrar_compartilhar: true
  },
  coleta: { mostrar_aviso: true, pedir_localizacao: false },
  links: []
};

var OPCOES_TEMA_ = {
  fundo_tipo: ['preset', 'cor', 'gradiente', 'imagem'], texto: ['claro', 'escuro'],
  formato_botao: ['arredondado', 'pilula', 'quadrado'], estilo_botao: ['vidro', 'solido', 'contorno', 'sombra'],
  animacao_botao: ['nenhuma', 'subir', 'brilho', 'pulsar', 'balancar'], forma_avatar: ['circulo', 'arredondado', 'quadrado']
};
var RE_COR_ = /^#[0-9a-fA-F]{6}$/;

function clonar_(o) { return JSON.parse(JSON.stringify(o)); }
function texto_(v, lim) { return String(v === undefined || v === null ? '' : v).slice(0, lim || 600); }

function normalizarConfig_(bruto) {
  bruto = bruto && typeof bruto === 'object' ? bruto : {};
  var cfg = clonar_(CONFIG_PADRAO);
  ['perfil', 'textos', 'coleta'].forEach(function (sec) {
    var src = bruto[sec] || {};
    Object.keys(cfg[sec]).forEach(function (k) {
      if (src[k] === undefined) return;
      cfg[sec][k] = typeof CONFIG_PADRAO[sec][k] === 'boolean' ? !!src[k] : texto_(src[k]);
    });
  });
  var t = bruto.tema || {};
  Object.keys(cfg.tema).forEach(function (k) {
    if (t[k] === undefined) return;
    var p = CONFIG_PADRAO.tema[k];
    if (typeof p === 'boolean') cfg.tema[k] = !!t[k];
    else if (typeof p === 'number') { var n = parseInt(t[k], 10); cfg.tema[k] = isNaN(n) ? p : n; }
    else cfg.tema[k] = texto_(t[k], 400);
  });
  var tm = cfg.tema;
  Object.keys(OPCOES_TEMA_).forEach(function (k) { if (OPCOES_TEMA_[k].indexOf(tm[k]) < 0) tm[k] = CONFIG_PADRAO.tema[k]; });
  if (PRESETS.indexOf(tm.preset) < 0) tm.preset = 'aurora';
  if (FONTES.indexOf(tm.fonte) < 0) tm.fonte = 'Plus Jakarta Sans';
  if (tm.fonte_titulo && FONTES.indexOf(tm.fonte_titulo) < 0) tm.fonte_titulo = '';
  ['cor_destaque', 'fundo_cor1', 'fundo_cor2', 'cor_botao', 'cor_texto_botao'].forEach(function (k) { if (!RE_COR_.test(tm[k])) tm[k] = CONFIG_PADRAO.tema[k]; });
  tm.fundo_angulo = Math.max(0, Math.min(360, tm.fundo_angulo));
  tm.fundo_escurecer = Math.max(0, Math.min(85, tm.fundo_escurecer));

  var ids = {}, links = [];
  (bruto.links || []).slice(0, 150).forEach(function (it) {
    if (!it || typeof it !== 'object') return;
    var url = texto_(it.url, 1000).trim();
    if (url && !/^(https?:\/\/|mailto:|tel:|sms:)/i.test(url)) url = 'https://' + url;
    if (/^javascript:/i.test(url)) url = '';
    var id = texto_(it.id, 40).toLowerCase().replace(/[^a-z0-9_-]/g, '') || Utilities.getUuid().slice(0, 6);
    while (ids[id]) id = id + '-' + Utilities.getUuid().slice(0, 3);
    ids[id] = true;
    var cor = texto_(it.cor, 20);
    links.push({
      id: id, tipo: texto_(it.tipo || 'link', 30), titulo: texto_(it.titulo, 80), subtitulo: texto_(it.subtitulo, 120), url: url,
      ativo: it.ativo === undefined ? true : !!it.ativo, exibicao: it.exibicao === 'icone' ? 'icone' : 'botao',
      destaque: !!it.destaque, icone_custom: texto_(it.icone_custom, 300), cor: RE_COR_.test(cor) ? cor : ''
    });
  });
  cfg.links = links;
  return cfg;
}

function validarSlug_(slug) {
  slug = String(slug || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  if (!slug || SLUGS_RESERVADOS.indexOf(slug) >= 0) throw erro_('Endereço inválido ou reservado. Use letras, números e hífen.', 400);
  return slug;
}

function paginaObj_(o) {
  return { id: Number(o.id), slug: o.slug, nome: o.nome, principal: o.principal === '1', config: normalizarConfig_(json_(o.config)),
           criado_em: o.criado_em, atualizado_em: o.atualizado_em, _linha: o._linha };
}

function listarPaginas_() {
  return ler_('paginas').map(paginaObj_).sort(function (a, b) { return (b.principal - a.principal) || a.nome.localeCompare(b.nome); });
}

function obterPagina_(id, slug) {
  var lista = ler_('paginas').map(paginaObj_);
  if (id) return lista.filter(function (p) { return p.id === Number(id); })[0] || null;
  if (slug) return lista.filter(function (p) { return p.slug === String(slug).toLowerCase(); })[0] || null;
  return lista.filter(function (p) { return p.principal; })[0] || lista[0] || null;
}

function salvarPaginaLinha_(p) {
  atualizar_('paginas', { _linha: p._linha, id: p.id, slug: p.slug, nome: p.nome, principal: p.principal ? '1' : '0',
    config: JSON.stringify(p.config).slice(0, LIMITE_CELULA), criado_em: p.criado_em, atualizado_em: agoraIso_() });
}

function criarPagina_(nome, slug, config, principal) {
  slug = validarSlug_(slug);
  return comTrava_(function () {
    var lista = ler_('paginas');
    if (lista.some(function (o) { return o.slug === slug; })) throw erro_('Já existe uma página com esse endereço.', 400);
    var id = proximoId_('paginas'), agora = agoraIso_();
    var cfg = normalizarConfig_(config || { perfil: { nome: nome }, textos: { titulo_pagina: nome } });
    var eraVazio = !lista.length;
    if (principal && !eraVazio) lista.forEach(function (o) { if (o.principal === '1') { o.principal = '0'; atualizar_('paginas', o); } });
    inserir_('paginas', { id: id, slug: slug, nome: texto_(nome, 80) || slug, principal: (principal || eraVazio) ? '1' : '0',
      config: JSON.stringify(cfg), criado_em: agora, atualizado_em: agora });
    return obterPagina_(id);
  });
}

function configPublica_(p) {
  var c = p.config;
  return {
    slug: p.slug, principal: p.principal, perfil: c.perfil, textos: c.textos, tema: c.tema, coleta: c.coleta,
    links: c.links.filter(function (l) { return l.ativo && l.url; }).map(function (l) {
      return { id: l.id, tipo: l.tipo, titulo: l.titulo, subtitulo: l.subtitulo, exibicao: l.exibicao, destaque: l.destaque,
               icone_custom: l.icone_custom, cor: l.cor, url: l.url };
    })
  };
}

// ======================================================================
// 05_Seguranca.gs
// ======================================================================
/**
 * 05_Seguranca.gs — usuários, senhas (HMAC-SHA256 iterado com sal), sessões por token e bloqueio.
 * O token fica no navegador (não usa cookies) e só o hash dele é guardado na planilha.
 */
function erro_(msg, status) { var e = new Error(msg); e.status = status || 400; return e; }

function hex_(bytes) {
  return bytes.map(function (b) { var h = (b < 0 ? b + 256 : b).toString(16); return h.length === 1 ? '0' + h : h; }).join('');
}

function hashSenha_(senha, salHex, iteracoes) {
  var chave = Utilities.newBlob(salHex).getBytes();
  var h = Utilities.computeHmacSha256Signature(Utilities.newBlob(String(senha)).getBytes(), chave);
  for (var i = 1; i < iteracoes; i++) h = Utilities.computeHmacSha256Signature(h, chave);
  return hex_(h);
}

function hashToken_(token) {
  return hex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(token)));
}

function comparar_(a, b) { // comparação em tempo constante
  if (a.length !== b.length) return false;
  var r = 0; for (var i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function validarSenhaNova_(senha) {
  if (String(senha || '').length < SENHA_MIN) throw erro_('A senha precisa ter pelo menos ' + SENHA_MIN + ' caracteres.', 400);
  if (/^\d+$/.test(senha) || ['12345678', 'senha123', 'password', 'farejador'].indexOf(String(senha).toLowerCase()) >= 0)
    throw erro_('Escolha uma senha menos óbvia (misture letras e números).', 400);
}

function temUsuarios_() { return ler_('usuarios').length > 0; }

function criarUsuario_(usuario, senha) {
  usuario = String(usuario || '').trim().slice(0, 40);
  if (!/^[A-Za-z0-9_.-]+$/.test(usuario)) throw erro_('Usuário inválido (use letras, números, ponto, hífen ou _).', 400);
  comTrava_(function () {
    if (ler_('usuarios').some(function (u) { return u.usuario.toLowerCase() === usuario.toLowerCase(); })) throw erro_('Esse usuário já existe.', 400);
    var sal = Utilities.getUuid().replace(/-/g, '');
    inserir_('usuarios', { id: proximoId_('usuarios'), usuario: usuario, hash: hashSenha_(senha, sal, ITERACOES_SENHA), sal: sal,
      iteracoes: ITERACOES_SENHA, criado_em: agoraIso_(), ultimo_login: '', falhas: '0', bloqueado_ate: '0' });
  });
}

function definirSenha_(usuarioId, senha) {
  comTrava_(function () {
    var u = buscar_('usuarios', 'id', usuarioId);
    if (!u) throw erro_('Usuário não encontrado.', 404);
    u.sal = Utilities.getUuid().replace(/-/g, '');
    u.hash = hashSenha_(senha, u.sal, ITERACOES_SENHA); u.iteracoes = String(ITERACOES_SENHA);
    u.falhas = '0'; u.bloqueado_ate = '0';
    atualizar_('usuarios', u);
  });
}

function autenticar_(usuario, senha) {
  var agora = Date.now() / 1000;
  var u = ler_('usuarios').filter(function (x) { return x.usuario.toLowerCase() === String(usuario || '').trim().toLowerCase(); })[0];
  if (u && Number(u.bloqueado_ate) > agora) throw erro_('Conta bloqueada temporariamente por tentativas erradas. Tente em alguns minutos.', 429);
  var ok = u && comparar_(hashSenha_(senha || '', u.sal, Number(u.iteracoes)), u.hash);
  if (!u) hashSenha_(senha || '', 'xxxxxxxxxxxxxxxx', ITERACOES_SENHA); // mesmo tempo para usuário inexistente
  if (!ok) {
    if (u) comTrava_(function () {
      var f = Number(u.falhas) + 1;
      if (f >= MAX_FALHAS_USUARIO) { u.falhas = '0'; u.bloqueado_ate = String(agora + BLOQUEIO_S); } else u.falhas = String(f);
      atualizar_('usuarios', u);
    });
    throw erro_('Usuário ou senha incorretos.', 401);
  }
  comTrava_(function () { u.falhas = '0'; u.bloqueado_ate = '0'; u.ultimo_login = agoraIso_(); atualizar_('usuarios', u); });
  return { id: Number(u.id), usuario: u.usuario };
}

function abrirSessao_(usuarioId, lembrar, ua) {
  var token = Utilities.getUuid() + Utilities.getUuid();
  var dur = lembrar ? SESSAO_LONGA_S : SESSAO_CURTA_S;
  comTrava_(function () {
    inserir_('sessoes_admin', { token_hash: hashToken_(token), usuario_id: usuarioId, criado_em: agoraIso_(),
      expira: String(Date.now() / 1000 + dur), ultimo_uso: agoraIso_(), ua: String(ua || '').slice(0, 200) });
  });
  return { token: token, lembrar: !!lembrar };
}

function sessaoAtual_(token) {
  if (!token) return null;
  var th = hashToken_(token);
  var cache = CacheService.getScriptCache(), emCache = cache.get('s_' + th);
  if (emCache) return JSON.parse(emCache);
  var s = buscar_('sessoes_admin', 'token_hash', th);
  if (!s) return null;
  if (Number(s.expira) < Date.now() / 1000) { comTrava_(function () { aba_('sessoes_admin').deleteRow(s._linha); }); return null; }
  var u = buscar_('usuarios', 'id', s.usuario_id);
  if (!u) return null;
  var r = { token_hash: th, usuario_id: Number(u.id), usuario: u.usuario };
  comTrava_(function () { s.ultimo_uso = agoraIso_(); atualizar_('sessoes_admin', s); });
  cache.put('s_' + th, JSON.stringify(r), 300); // 5 min
  return r;
}

function exigirAdmin_(req) {
  var s = sessaoAtual_(req.token);
  if (!s) throw erro_('Faça login no painel.', 401);
  return s;
}

function limparCacheSessoes_(hashes) {
  var c = CacheService.getScriptCache();
  hashes.forEach(function (h) { c.remove('s_' + h); });
}

// ======================================================================
// 06_Publico.gs
// ======================================================================
/**
 * 06_Publico.gs — ações chamadas pela página pública (sem login).
 */
var RE_SESSAO_ = /^[a-zA-Z0-9_-]{8,64}$/;
var RE_VISITANTE_ = /^[a-f0-9]{32}$/;
var TIPOS_EVENTO_ = ['pageview', 'saida', 'consentimento', 'compartilhar', 'localizacao', 'clique'];

function campanhaPorCodigo_(codigo, paginaId) {
  if (!codigo || !/^[a-zA-Z0-9_-]{3,40}$/.test(codigo)) return null;
  var c = buscar_('campanhas', 'codigo', codigo);
  if (!c || (paginaId && String(c.pagina_id) !== String(paginaId))) return null;
  return c;
}

/** Config pública. Aceita {slug} ou {campanha} (link curto ?c=código). */
function acaoPublicoConfig_(req) {
  var campanha = null, pagina = null;
  if (req.campanha) {
    var c = campanhaPorCodigo_(req.campanha);
    if (c) {
      pagina = obterPagina_(c.pagina_id);
      if (c.ativo === '1') campanha = { codigo: c.codigo, utm_source: c.utm_source, utm_medium: c.utm_medium, utm_campaign: c.utm_campaign, utm_content: c.utm_content };
    }
  }
  if (!pagina) pagina = req.slug ? obterPagina_(null, req.slug) : obterPagina_();
  if (!pagina) pagina = obterPagina_();
  if (!pagina) throw erro_('Nenhuma página criada ainda. Entre no painel para criar.', 404);
  var r = configPublica_(pagina);
  r.campanha = campanha;
  return r;
}

function acaoEvento_(req) {
  if (TIPOS_EVENTO_.indexOf(req.tipo) < 0 || !RE_SESSAO_.test(req.sessao || '')) throw erro_('Evento inválido.', 400);
  var pagina = req.slug ? obterPagina_(null, req.slug) : obterPagina_();
  if (!pagina) throw erro_('Página não encontrada.', 404);
  var ua = String(req.ua || '').slice(0, 400);
  var dados = req.dados || {};
  var roboNome = detectarRobo_(ua) || (dados.webdriver ? 'Navegador automatizado' : null);
  var ev = { tipo: req.tipo, pagina_id: pagina.id, sessao: req.sessao, robo: !!roboNome,
             visitante: RE_VISITANTE_.test(req.visitante || '') ? req.visitante : '' };
  if (roboNome) ev.robo_nome = roboNome;
  var resposta = { ok: true };

  if (req.tipo === 'pageview') {
    var utm = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'].forEach(function (k) {
      var v = (req.utm || {})[k]; utm[k] = v ? String(v).slice(0, 120) : null;
    });
    var origem = classificarOrigem_(req.referer, utm.utm_source, req.host, ua);
    var cmp = campanhaPorCodigo_(req.campanha, pagina.id);
    if (!cmp && utm.utm_campaign) {
      cmp = ler_('campanhas').filter(function (c) {
        return String(c.pagina_id) === String(pagina.id) && c.utm_campaign === utm.utm_campaign && (!utm.utm_source || c.utm_source === utm.utm_source);
      }).pop() || null;
    }
    ev.canal = origem.canal; ev.campanha_id = cmp ? cmp.id : '';
    ev.referer = req.referer ? String(req.referer).slice(0, 500) : null;
    ev.utm = utm; ev.origem = origem; ev.ua_info = analisarUa_(ua);
    ev.idioma = String(dados.idioma || '').slice(0, 20) || null;
    ev.timezone = String(dados.timezone || '').slice(0, 60) || null;
    ev.tela = String(dados.tela || '').slice(0, 20) || null;
    resposta.canal = origem.canal; resposta.campanha_id = ev.campanha_id || null; resposta.origem = origem; resposta.utm = utm;
  } else if (req.tipo === 'clique') {
    var link = pagina.config.links.filter(function (l) { return l.id === req.link_id; })[0];
    if (!link) throw erro_('Link inválido.', 400);
    ev.link_id = link.id; ev.link_titulo = link.titulo; ev.link_tipo = link.tipo; ev.destino = link.url;
    ev.destino_host = hostDe_(link.url); ev.posicao = Number(dados.posicao) || null;
    ev.area = ['icone', 'botao'].indexOf(dados.area) >= 0 ? dados.area : null;
    ev.canal = String(req.canal || '').slice(0, 60) || 'Direto';
    ev.campanha_id = req.campanha_id ? String(Number(req.campanha_id) || '') : '';
    ev.origem = req.origem || { canal: ev.canal }; ev.utm = req.utm || {}; ev.ua_info = analisarUa_(ua);
  } else if (req.tipo === 'saida') {
    ev.duracao_ms = Math.max(0, Math.min(Number(dados.duracao_ms) || 0, 6 * 3600 * 1000));
    ev.scroll_max = Math.max(0, Math.min(Number(dados.scroll_max) || 0, 100));
  } else {
    var d = {};
    Object.keys(dados).slice(0, 8).forEach(function (k) { d[k] = String(dados[k]).slice(0, 120); });
    ev.dados = d;
  }
  gravarEvento_(ev);
  return resposta;
}

function ipValido_(ip) {
  ip = String(ip || '');
  if (/^(\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
    var p = ip.split('.').map(Number);
    if (p.some(function (x) { return x > 255; })) return false;
    return !(p[0] === 10 || p[0] === 127 || (p[0] === 192 && p[1] === 168) || (p[0] === 172 && p[1] >= 16 && p[1] <= 31) || (p[0] === 169 && p[1] === 254) || p[0] === 0);
  }
  return /^[0-9a-f:]{3,45}$/i.test(ip) && ip.indexOf(':') >= 0 && !/^(::1|fe80|f[cd])/i.test(ip);
}

/** Coleta completa (só depois do "Aceitar"). O IP vem do navegador (ipify), pois o Apps Script não informa o IP. */
function acaoColeta_(req) {
  if (!req.consentimento) throw erro_('É necessário consentir com a coleta.', 400);
  var vid = RE_VISITANTE_.test(req.visitante || '') ? req.visitante : Utilities.getUuid().replace(/-/g, '');
  var ips = req.ips_publicos_cliente || {};
  var ip = [ips.ipv4, ips.ipv6, req.ip_publico_detectado_cliente].filter(ipValido_)[0] || null;
  var tipoIp = ip ? (ip.indexOf(':') >= 0 ? 'IPv6' : 'IPv4') : null;
  var nav = req.navegador || {};
  var conexao = {
    ip_observado: ip, tipo_ip: tipoIp, origem_ip: ip ? 'ip_publico_detectado_pelo_navegador' : null,
    ips_publicos_detectados: ips, ip_conexao_servidor: null,
    cabecalhos_http: { user_agent: nav.user_agent || null, accept_language: (nav.idiomas || []).join(','), referer: (req.origem || {}).referer || null,
                       observacao: 'O Apps Script não recebe os cabeçalhos HTTP; valores informados pelo navegador.' }
  };
  var dadosNav = {};
  ['consentimento', 'sessao', 'slug', 'coletado_em_cliente', 'navegador', 'tela', 'capacidades', 'permissoes', 'origem', 'geolocalizacao',
   'ip_publico_detectado_cliente', 'ips_publicos_cliente'].forEach(function (k) { dadosNav[k] = req[k] === undefined ? null : req[k]; });

  return comTrava_(function () {
    var linha = buscar_('visitantes', 'id', vid);
    var anterior = linha ? json_(linha.registro) : {};
    var hist = (anterior.historico_acessos || []).filter(function (x) { return x && typeof x === 'object'; });
    hist.push({ registrado_em: agoraIso_(), sessao: req.sessao, pagina: req.slug, conexao_servidor: conexao, dados_navegador: dadosNav });
    var reg = {
      schema_versao: 4, visitante_id: vid, criado_em: anterior.criado_em || agoraIso_(), atualizado_em: agoraIso_(),
      quantidade_coletas: Number(anterior.quantidade_coletas || 0) + 1,
      consentimento: { aceito: true, registrado_em: agoraIso_(), texto_versao: 'coleta-guia-gas-v1' },
      conexao_servidor: conexao, dados_navegador: dadosNav, historico_acessos: hist.slice(-20)
    };
    var texto = JSON.stringify(reg);
    while (texto.length > LIMITE_CELULA && reg.historico_acessos.length > 1) { // limite de 50 mil caracteres por célula
      reg.historico_acessos.shift(); texto = JSON.stringify(reg);
    }
    var obj = { id: vid, criado_em: reg.criado_em, atualizado_em: reg.atualizado_em, epoch: String(Date.now() / 1000),
                coletas: String(reg.quantidade_coletas), ip: ip || '', registro: texto.slice(0, LIMITE_CELULA), ipinfo: linha ? linha.ipinfo : '{}' };
    if (linha) { obj._linha = linha._linha; atualizar_('visitantes', obj); } else inserir_('visitantes', obj);
    if (req.sessao && RE_SESSAO_.test(req.sessao)) {
      var existe = ler_('visitante_sessoes').some(function (x) { return x.visitante === vid && x.sessao === req.sessao; });
      if (!existe) inserir_('visitante_sessoes', { visitante: vid, sessao: req.sessao });
    }
    var pagina = req.slug ? obterPagina_(null, req.slug) : obterPagina_();
    if (pagina && req.sessao) {
      inserir_('eventos', { id: String(Date.now()) + Math.floor(Math.random() * 1000), ts: agoraIso_(), epoch: String(Date.now() / 1000), tipo: 'coleta',
        pagina_id: pagina.id, sessao: req.sessao, visitante: vid, robo: '0', canal: '', link_id: '', campanha_id: '',
        dados: JSON.stringify({ geolocalizacao: !!req.geolocalizacao }) });
    }
    return { ok: true, visitante_id: vid, quantidade_coletas: reg.quantidade_coletas };
  });
}

// ======================================================================
// 07_Admin.gs
// ======================================================================
/**
 * 07_Admin.gs — ações do painel administrativo (todas exigem login, exceto estado/login/primeiro acesso).
 * As estatísticas são calculadas no navegador: aqui só entregamos os eventos brutos do período.
 */

// ------------------------------------------------------------------ login e usuários
function acaoEstado_(req) {
  var s = req.token ? sessaoAtual_(req.token) : null;
  return { tem_usuarios: temUsuarios_(), logado: !!s, usuario: s ? s.usuario : null, versao: VERSAO };
}

function acaoPrimeiroAcesso_(req) {
  if (temUsuarios_()) throw erro_('O primeiro usuário já foi criado.', 400);
  validarSenhaNova_(req.senha);
  criarUsuario_(req.usuario, req.senha);
  var u = autenticar_(req.usuario, req.senha);
  if (!obterPagina_()) criarPagina_('Página principal', 'principal', null, true);
  return abrirSessao_(u.id, req.lembrar, req.ua);
}

function acaoLogin_(req) {
  var u = autenticar_(req.usuario, req.senha);
  var r = abrirSessao_(u.id, req.lembrar, req.ua);
  r.usuario = u.usuario;
  return r;
}

function acaoLogout_(req) {
  if (!req.token) return { ok: true };
  var th = hashToken_(req.token);
  comTrava_(function () { excluirOnde_('sessoes_admin', function (s) { return s.token_hash === th; }); });
  limparCacheSessoes_([th]);
  return { ok: true };
}

function acaoSessoes_(req, s) {
  var agora = Date.now() / 1000;
  return { sessoes: ler_('sessoes_admin').filter(function (x) { return String(x.usuario_id) === String(s.usuario_id) && Number(x.expira) > agora; })
    .map(function (x) { return { id: x.token_hash.slice(0, 16), criado_em: x.criado_em, ultimo_uso: x.ultimo_uso, ip: '—', ua: x.ua, atual: x.token_hash === s.token_hash }; }) };
}

function acaoEncerrarOutras_(req, s) {
  var removidos = [];
  comTrava_(function () {
    excluirOnde_('sessoes_admin', function (x) {
      var sai = String(x.usuario_id) === String(s.usuario_id) && x.token_hash !== s.token_hash;
      if (sai) removidos.push(x.token_hash);
      return sai;
    });
  });
  limparCacheSessoes_(removidos);
  return { encerradas: removidos.length };
}

function acaoEncerrarSessao_(req, s) {
  var removidos = [];
  comTrava_(function () {
    excluirOnde_('sessoes_admin', function (x) {
      var sai = String(x.usuario_id) === String(s.usuario_id) && x.token_hash.slice(0, 16) === String(req.id).slice(0, 16);
      if (sai) removidos.push(x.token_hash);
      return sai;
    });
  });
  limparCacheSessoes_(removidos);
  return { ok: true };
}

function acaoTrocarSenha_(req, s) {
  autenticar_(s.usuario, req.senha_atual);
  validarSenhaNova_(req.nova_senha);
  definirSenha_(s.usuario_id, req.nova_senha);
  acaoEncerrarOutras_(req, s);
  return { ok: true };
}

function acaoUsuarios_(req, s) {
  return { usuarios: ler_('usuarios').map(function (u) {
    return { id: Number(u.id), usuario: u.usuario, criado_em: u.criado_em, ultimo_login: u.ultimo_login || null, voce: Number(u.id) === s.usuario_id };
  }) };
}

function acaoCriarUsuario_(req) { validarSenhaNova_(req.senha); criarUsuario_(req.usuario, req.senha); return { ok: true }; }

function acaoExcluirUsuario_(req, s) {
  if (Number(req.id) === s.usuario_id) throw erro_('Você não pode excluir o próprio usuário.', 400);
  if (ler_('usuarios').length <= 1) throw erro_('Mantenha pelo menos um usuário.', 400);
  comTrava_(function () {
    excluirOnde_('sessoes_admin', function (x) { return String(x.usuario_id) === String(req.id); });
    excluirOnde_('usuarios', function (x) { return String(x.id) === String(req.id); });
  });
  return { ok: true };
}

// ------------------------------------------------------------------ páginas
function contarVisitas_() {
  var sh = aba_('eventos'), n = sh.getLastRow() - 1, cont = {};
  if (n < 1) return cont;
  var v = sh.getRange(2, 4, n, 5).getValues(); // tipo, pagina_id, sessao, visitante, robo
  for (var i = 0; i < v.length; i++) if (v[i][0] === 'pageview' && String(v[i][4]) !== '1') cont[v[i][1]] = (cont[v[i][1]] || 0) + 1;
  return cont;
}

function acaoPaginas_() {
  var cont = contarVisitas_();
  return { paginas: listarPaginas_().map(function (p) {
    return { id: p.id, slug: p.slug, nome: p.nome, principal: p.principal, atualizado_em: p.atualizado_em, links: p.config.links.length,
             visitas: cont[String(p.id)] || 0, avatar: p.config.perfil.avatar, preset: p.config.tema.preset };
  }) };
}

function paginaOu404_(id) { var p = obterPagina_(id); if (!p) throw erro_('Página não encontrada.', 404); return p; }

function acaoCriarPagina_(req) {
  var nome = String(req.nome || 'Nova página').trim();
  var cfg = req.copiar_de ? paginaOu404_(req.copiar_de).config : null;
  return criarPagina_(nome, req.slug || nome, cfg, !!req.principal);
}

function acaoAtualizarPagina_(req) {
  return comTrava_(function () {
    var p = paginaOu404_(req.id);
    if (req.slug !== undefined && req.slug !== null) {
      var slug = validarSlug_(req.slug);
      if (listarPaginas_().some(function (x) { return x.slug === slug && x.id !== p.id; })) throw erro_('Já existe uma página com esse endereço.', 400);
      p.slug = slug;
    }
    if (req.nome) p.nome = texto_(req.nome, 80);
    if (req.principal) {
      listarPaginas_().forEach(function (x) { if (x.principal && x.id !== p.id) { x.principal = false; salvarPaginaLinha_(x); } });
      p.principal = true;
    }
    salvarPaginaLinha_(p);
    return obterPagina_(p.id);
  });
}

function reescrever_(nome, objs) {
  var sh = aba_(nome), cab = TABELAS[nome], n = sh.getLastRow() - 1;
  if (n > 0) sh.getRange(2, 1, n, cab.length).clearContent();
  if (objs.length) sh.getRange(2, 1, objs.length, cab.length).setNumberFormat('@').setValues(objs.map(function (o) { return linhaDe_(nome, o); }));
}

function acaoExcluirPagina_(req) {
  if (ler_('paginas').length <= 1) throw erro_('Mantenha pelo menos uma página.', 400);
  return comTrava_(function () {
    var p = paginaOu404_(req.id), pid = String(p.id);
    reescrever_('eventos', ler_('eventos').filter(function (e) { return e.pagina_id !== pid; }));
    excluirOnde_('campanhas', function (c) { return c.pagina_id === pid; });
    aba_('paginas').deleteRow(p._linha);
    if (p.principal) { var outra = listarPaginas_()[0]; if (outra) { outra.principal = true; salvarPaginaLinha_(outra); } }
    return { ok: true };
  });
}

function acaoPaginaConfig_(req) { var p = paginaOu404_(req.id); delete p._linha; return p; }

function acaoSalvarPagina_(req) {
  return comTrava_(function () {
    var p = paginaOu404_(req.id);
    p.config = normalizarConfig_(req.config);
    if (JSON.stringify(p.config).length > LIMITE_CELULA) throw erro_('Configuração grande demais (muitos links ou textos longos).', 400);
    salvarPaginaLinha_(p);
    var r = obterPagina_(p.id); delete r._linha; return r;
  });
}

function acaoOpcoes_() { return { fontes: FONTES, presets: PRESETS }; }

/** Upload de imagem para uma pasta do Google Drive (link público de visualização). */
function acaoUpload_(req) {
  var m = /^data:image\/(png|jpe?g|webp|gif);base64,(.+)$/.exec(req.data_url || '');
  if (!m) throw erro_('Envie uma imagem PNG, JPG, WEBP ou GIF.', 400);
  var bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 5 * 1024 * 1024) throw erro_('Imagem acima de 5 MB.', 400);
  var tipo = 'image/' + (m[1] === 'jpg' ? 'jpeg' : m[1]);
  var pastaId = PropertiesService.getScriptProperties().getProperty('PASTA_UPLOADS_ID'), pasta;
  try { pasta = pastaId ? DriveApp.getFolderById(pastaId) : null; } catch (e) { pasta = null; }
  if (!pasta) {
    pasta = DriveApp.createFolder('Farejador — imagens');
    PropertiesService.getScriptProperties().setProperty('PASTA_UPLOADS_ID', pasta.getId());
  }
  var nome = String(req.nome || 'img').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 20) + '-' + Utilities.getUuid().slice(0, 8);
  var arq = pasta.createFile(Utilities.newBlob(bytes, tipo, nome));
  arq.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { ok: true, url: 'https://lh3.googleusercontent.com/d/' + arq.getId() };
}

// ------------------------------------------------------------------ dados para as estatísticas
function mapaSessaoVisitante_(sessoesFiltro) {
  var m = {};
  ler_('visitante_sessoes').forEach(function (x) { if (!sessoesFiltro || sessoesFiltro[x.sessao]) m[x.sessao] = x.visitante; });
  return m;
}

/** Eventos brutos [ini, fim] da página (inclui robôs; o painel filtra). */
function acaoEventosPeriodo_(req) {
  var pid = paginaOu404_(req.pagina).id;
  var evs = eventosEntre_(pid, Number(req.ini), Number(req.fim));
  var sess = {};
  evs.forEach(function (e) { if (e.sessao) sess[e.sessao] = true; });
  var mapa = mapaSessaoVisitante_(sess);
  evs.forEach(function (e) { if (e.sessao && !e.visitante && mapa[e.sessao]) e.visitante = mapa[e.sessao]; e.ua = undefined; });
  return { eventos: evs };
}

/** Para o retorno de visitantes: início e canal de cada sessão (até `fim`) + quem é o visitante. */
function acaoRetornoBase_(req) {
  var pid = String(paginaOu404_(req.pagina).id), fim = Number(req.fim);
  var sh = aba_('eventos'), n = sh.getLastRow() - 1, sess = {};
  if (n > 0) {
    var v = sh.getRange(2, 3, n, 7).getValues(); // epoch, tipo, pagina_id, sessao, visitante, robo, canal
    for (var i = 0; i < v.length; i++) {
      var ep = Number(v[i][0]);
      if (ep > fim) break;
      if (v[i][1] !== 'pageview' || String(v[i][2]) !== pid || String(v[i][5]) === '1' || !v[i][3]) continue;
      var s = String(v[i][3]);
      if (!sess[s]) sess[s] = [s, ep, String(v[i][6] || 'Direto'), String(v[i][4] || '')];
    }
  }
  var mapa = mapaSessaoVisitante_();
  var lista = Object.keys(sess).map(function (k) { var x = sess[k]; if (!x[3] && mapa[k]) x[3] = mapa[k]; return x; });
  return { sessoes: lista };
}

function acaoEventosRecentes_(req) {
  var pid = String(paginaOu404_(req.pagina).id), limite = Math.max(1, Math.min(Number(req.limite) || 150, 500));
  var sh = aba_('eventos'), n = sh.getLastRow() - 1, saida = [];
  if (n < 1) return { eventos: [] };
  var ler = Math.min(n, 4000), cab = TABELAS.eventos;
  var v = sh.getRange(2 + n - ler, 1, ler, cab.length).getValues();
  for (var i = v.length - 1; i >= 0 && saida.length < limite; i--) {
    if (String(v[i][4]) !== pid) continue;
    var o = {}; for (var j = 0; j < cab.length; j++) o[cab[j]] = String(v[i][j]);
    if (req.tipo === 'robo') { if (o.robo !== '1') continue; }
    else { if (req.tipo && o.tipo !== req.tipo) continue; if (!req.robos && o.robo === '1') continue; }
    var e = eventoObj_(o); delete e.ua; saida.push(e);
  }
  return { eventos: saida };
}

// ------------------------------------------------------------------ visitantes
function resumoVisitante_(l) {
  var reg = json_(l.registro), nav = reg.dados_navegador || {}, con = reg.conexao_servidor || {};
  var n = nav.navegador || {}, t = nav.tela || {}, ipi = json_(l.ipinfo)[l.ip] || null;
  return {
    visitante_id: l.id, criado_em: l.criado_em, atualizado_em: l.atualizado_em, quantidade_coletas: Number(l.coletas), ip: l.ip || null,
    tipo_ip: con.tipo_ip, ips: con.ips_publicos_detectados || {}, ua_info: analisarUa_(n.user_agent), idioma: n.idioma, timezone: n.timezone,
    tela: t.largura ? t.largura + '×' + t.altura : null, gps: !!nav.geolocalizacao,
    local: ipi && ipi.cidade ? ipi.cidade + ', ' + ipi.codigo_pais : null
  };
}

function statsVisitantes_(pid) {
  var mapa = mapaSessaoVisitante_(), sh = aba_('eventos'), n = sh.getLastRow() - 1, st = {};
  if (n < 1) return st;
  var v = sh.getRange(2, 3, n, 7).getValues(); // epoch, tipo, pagina_id, sessao, visitante, robo, canal
  for (var i = 0; i < v.length; i++) {
    if (String(v[i][2]) !== String(pid) || String(v[i][5]) === '1') continue;
    var tipo = v[i][1]; if (tipo !== 'pageview' && tipo !== 'clique') continue;
    var s = String(v[i][3] || ''), vid = String(v[i][4] || '') || mapa[s];
    if (!vid) continue;
    var x = st[vid] || (st[vid] = { sessoes: {}, cliques: 0, canal: null, t: null });
    if (tipo === 'pageview') { x.sessoes[s] = true; if (x.t === null || Number(v[i][0]) < x.t) { x.t = Number(v[i][0]); x.canal = String(v[i][6]); } }
    else x.cliques++;
  }
  return st;
}

function acaoVisitantes_(req) {
  var pid = paginaOu404_(req.pagina).id, st = statsVisitantes_(pid);
  var lista = ler_('visitantes').filter(function (l) { return st[l.id]; }).sort(function (a, b) { return Number(b.epoch) - Number(a.epoch); })
    .map(function (l) { var r = resumoVisitante_(l), x = st[l.id]; r.sessoes = Object.keys(x.sessoes).length; r.cliques = x.cliques; r.origem_canal = x.canal; return r; });
  return { visitantes: lista };
}

function acaoVisitante_(req) {
  if (!RE_VISITANTE_.test(req.id || '')) throw erro_('ID inválido.', 400);
  var l = buscar_('visitantes', 'id', req.id);
  if (!l) throw erro_('Visitante não encontrado.', 404);
  var sess = {};
  ler_('visitante_sessoes').forEach(function (x) { if (x.visitante === req.id) sess[x.sessao] = true; });
  var nomes = {}; listarPaginas_().forEach(function (p) { nomes[p.id] = p.nome; });
  var evs = ler_('eventos').filter(function (e) { return e.visitante === req.id || (e.sessao && sess[e.sessao]); }).slice(-300)
    .map(function (o) { var e = eventoObj_(o); delete e.ua; e.pagina_nome = nomes[e.pagina_id]; return e; });
  var reg = json_(l.registro); reg.ipinfo_admin = json_(l.ipinfo);
  return { registro: reg, resumo: resumoVisitante_(l), eventos: evs };
}

function acaoExcluirVisitante_(req) {
  if (!RE_VISITANTE_.test(req.id || '')) throw erro_('ID inválido.', 400);
  comTrava_(function () {
    excluirOnde_('visitantes', function (x) { return x.id === req.id; });
    excluirOnde_('visitante_sessoes', function (x) { return x.visitante === req.id; });
  });
  return { ok: true };
}

/** Única ação que consulta o IPinfo — acionada pelo botão "Ver localização". */
function acaoIpinfo_(req) {
  var ip = String(req.ip || '').trim(), vazio = { consultado: false, ip: ip, erro: null };
  if (!ipValido_(ip)) { vazio.erro = 'IP privado, local ou inválido; consulta pública não aplicável'; return vazio; }
  var cache = CacheService.getScriptCache(), emCache = cache.get('ipinfo_' + ip), r;
  if (emCache) r = JSON.parse(emCache);
  else {
    var token = PropertiesService.getScriptProperties().getProperty('IPINFO_TOKEN');
    var resp = UrlFetchApp.fetch('https://ipinfo.io/' + encodeURIComponent(ip) + '/json' + (token ? '?token=' + token : ''), { muteHttpExceptions: true, headers: { Accept: 'application/json' } });
    if (resp.getResponseCode() !== 200) { vazio.erro = 'IPinfo HTTP ' + resp.getResponseCode(); return vazio; }
    var d = JSON.parse(resp.getContentText()), org = String(d.org || '').trim(), asn = /^AS/i.test(org) ? org.split(' ')[0] : null;
    var loc = d.loc && d.loc.split(','), lat = loc ? Number(loc[0]) : null, lon = loc ? Number(loc[1]) : null;
    delete d.readme;
    r = { consultado: true, ip: ip, provedor: asn && org.indexOf(' ') > 0 ? org.slice(org.indexOf(' ') + 1) : (org || null), organizacao: org || null, asn: asn,
          pais: d.country || null, codigo_pais: d.country || null, regiao: d.region || null, cidade: d.city || null, codigo_postal: d.postal || null,
          timezone: d.timezone || null, localizacao_aproximada: d.loc || null, latitude: lat, longitude: lon, hostname: d.hostname || null,
          anycast: d.anycast || null, bruto: d, consultado_em: agoraIso_(), erro: null };
    cache.put('ipinfo_' + ip, JSON.stringify(r), 3600);
  }
  if (req.visitante && RE_VISITANTE_.test(req.visitante)) {
    comTrava_(function () {
      var l = buscar_('visitantes', 'id', req.visitante);
      if (l) { var atual = json_(l.ipinfo); atual[ip] = r; l.ipinfo = JSON.stringify(atual).slice(0, LIMITE_CELULA); atualizar_('visitantes', l); }
    });
  }
  return r;
}

function acaoMapa_(req) {
  var pid = paginaOu404_(req.pagina).id, st = statsVisitantes_(pid), pontos = [];
  ler_('visitantes').forEach(function (l) {
    if (!st[l.id]) return;
    var ipi = json_(l.ipinfo);
    Object.keys(ipi).forEach(function (ip) {
      var inf = ipi[ip];
      if (inf && inf.latitude !== null && inf.latitude !== undefined)
        pontos.push({ visitante: l.id, ip: ip, lat: inf.latitude, lon: inf.longitude, cidade: inf.cidade, regiao: inf.regiao, pais: inf.pais, org: inf.organizacao, tipo: 'ip' });
    });
    var gps = (json_(l.registro).dados_navegador || {}).geolocalizacao;
    if (gps && gps.latitude !== undefined && gps.latitude !== null) pontos.push({ visitante: l.id, lat: gps.latitude, lon: gps.longitude, precisao: gps.precisao_metros, tipo: 'gps' });
  });
  return { mapa: pontos };
}

// ------------------------------------------------------------------ campanhas
function limparUtm_(v) {
  v = String(v || '').trim().toLowerCase().replace(/[^a-z0-9_.\-]/g, '-').replace(/-{2,}/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return v || '';
}

function campanhaObj_(c) {
  return { id: Number(c.id), codigo: c.codigo, pagina_id: Number(c.pagina_id), nome: c.nome, origem: c.origem, utm_source: c.utm_source,
           utm_medium: c.utm_medium || null, utm_campaign: c.utm_campaign || null, utm_content: c.utm_content || null, ativo: c.ativo === '1', criado_em: c.criado_em };
}

function acaoCampanhasLista_(req) {
  var pid = String(paginaOu404_(req.pagina).id);
  return { campanhas: ler_('campanhas').filter(function (c) { return c.pagina_id === pid; }).map(campanhaObj_).reverse() };
}

function acaoCriarCampanha_(req) {
  paginaOu404_(req.pagina_id);
  if (!String(req.nome || '').trim() || !limparUtm_(req.utm_source)) throw erro_('Informe o nome e a origem da campanha.', 400);
  return comTrava_(function () {
    var todas = ler_('campanhas'), usado = {};
    todas.forEach(function (c) { usado[c.codigo] = true; });
    var codigo = req.codigo ? limparUtm_(req.codigo) : '';
    if (codigo && usado[codigo]) throw erro_('Esse código curto já está em uso.', 400);
    while (!codigo) { var c = Utilities.getUuid().replace(/-/g, '').slice(0, 5); if (!usado[c]) codigo = c; }
    var obj = { id: proximoId_('campanhas'), codigo: codigo, pagina_id: req.pagina_id, nome: String(req.nome).trim().slice(0, 80),
                origem: String(req.origem || '').slice(0, 40), utm_source: limparUtm_(req.utm_source), utm_medium: limparUtm_(req.utm_medium),
                utm_campaign: limparUtm_(req.utm_campaign) || limparUtm_(req.nome), utm_content: limparUtm_(req.utm_content), ativo: '1', criado_em: agoraIso_() };
    inserir_('campanhas', obj);
    return campanhaObj_(linhaDe_('campanhas', obj).reduce(function (o, v, i) { o[TABELAS.campanhas[i]] = v; return o; }, {}));
  });
}

function acaoEditarCampanha_(req) {
  comTrava_(function () {
    var c = buscar_('campanhas', 'id', req.id);
    if (!c) throw erro_('Campanha não encontrada.', 404);
    if (req.ativo !== undefined && req.ativo !== null) c.ativo = req.ativo ? '1' : '0';
    if (req.nome && String(req.nome).trim()) c.nome = String(req.nome).trim().slice(0, 80);
    atualizar_('campanhas', c);
  });
  return { ok: true };
}

function acaoExcluirCampanha_(req) {
  comTrava_(function () { excluirOnde_('campanhas', function (c) { return c.id === String(req.id); }); });
  return { ok: true };
}

// ------------------------------------------------------------------ retenção
function acaoRetencao_() {
  var tz = Session.getScriptTimeZone(), sh = aba_('eventos'), n = Math.max(0, sh.getLastRow() - 1);
  var maisAntigo = n ? String(sh.getRange(2, 2).getValue()) : null;
  return {
    retencao: obterRetencao_(), ultima_limpeza: ajuste_('ultima_limpeza', null),
    contagem: { eventos: n, visitantes: Math.max(0, aba_('visitantes').getLastRow() - 1), mais_antigo: maisAntigo },
    banco_mb: Math.round((n * 600) / 10485.76) / 100, versao: VERSAO, fuso: tz,
    planilha_url: planilha_().getUrl()
  };
}

function acaoSalvarRetencao_(req) {
  var r = { eventos_dias: Math.max(0, Math.min(Number(req.eventos_dias) || 0, 3650)), visitantes_dias: Math.max(0, Math.min(Number(req.visitantes_dias) || 0, 3650)), ativa: !!req.ativa };
  definirAjuste_('retencao', r);
  return { retencao: r };
}

function acaoExecutarRetencao_() { return limparDadosAntigos_(true); }

// ======================================================================
// 08_Manutencao.gs
// ======================================================================
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
