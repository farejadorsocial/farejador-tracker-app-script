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
