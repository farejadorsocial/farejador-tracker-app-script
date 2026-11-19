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
