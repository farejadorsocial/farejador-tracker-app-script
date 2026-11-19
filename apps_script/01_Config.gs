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
