// =============================================================================
// CONFIGURAÇÕES — preencha antes de publicar
// =============================================================================
const FERIAS_SHEET_ID = '1a_e5BUcPWunkB8oo25cGqZu07-4rixbByc2a5hnMWTA';
const HUB_SS_ID       = '1eZPbzhzjhjHoPwMhAW5YvOZgYiAvlTYc07dRan6Lyoc';
const MEU_ACESSO      = 'webferias';
const HUB_URL         = 'https://script.google.com/a/macros/brasas.com/s/AKfycbyF7BArYMYFtcQY7_4RTGGPw89yNohAjR7eGptItP-EsnWhNfiZR2ISRaHdAkwlLSlr/exec';

// E-mails que sempre têm acesso total (mesmo sem role=dp)
const EMAILS_ADM = [
  'dp.ec@brasas.com', 'adriane@brasas.com', 'priscila.soares@brasas.com',
  'bianca_dp@brasas.com', 'bruno@brasas.com'
];

// Limiares de alerta em dias antes do limite para gozar
const ALERTA_CRITICO = 30;
const ALERTA_ATENCAO = 60;

// Mapa sigla (coluna E da SESSOES) → nome normalizado da empresa (coluna EMPRESA do VENCIMENTOS)
// Siglas com múltiplos códigos (ex: MRI/MR, NS/CH) aparecem como entradas separadas apontando para a mesma empresa
const UNIDADES_MAP = {
  'editora': 'editora eficiencia ltda',
  'nl':      'bal - barra assessoria linguistica ltda',
  'bg':      'bg assessoria linguistica ltda',
  'ig':      'cambauba assessoria linguistica ltda.',
  'cx':      'caxias assessoria linguistica ltda.',
  'cg':      'cg assessoria linguistica ltda',
  'dt':      'dt assessoria linguistica ltda.',
  'ec new':  'ec new assessoria linguistica ltda',
  'fg':      'fg assessoria linguistica ltda',
  'it':      'it assessoria linguistica ltda.',
  'bf':      'kansas assessoria linguistica ltda.',
  'vq':      'lexicon assessoria linguistica ltda',
  'lj':      'lj assessoria linguistica ltda',
  'metodos': 'metodos de ensino brasas ltda',
  'mri':     'mri assessoria linguistica ltda',
  'mr':      'mri assessoria linguistica ltda',
  'ip':      'new concepts assessoria linguistica ltda',
  'ni':      'ni assessoria linguistica ltda.',
  'ns':      'ns assessoria linguistica ltda',
  'ch':      'ns assessoria linguistica ltda',
  'nt':      'nt assessoria linguistica ltda.',
  'po':      'p.o. assessoria linguistica ltda',
  'rc':      'rc assessoria linguistica ltda',
  'cp':      'the west coast school of english ltda',
  'tj':      'tj assessoria linguistica ltda.',
  'tq':      'tq assessoria linguistica ltda',
  'vp':      'vp assessoria linguistica ltda',
  'pn':      'pn assessoria linguistica ltda',
  'bod':     'brasas on demand assessoria linguistica',
  'ez':      'eleonora toscano de britto zinovetz'
};

// Colunas da aba VENCIMENTOS (base 0)
const VEN = { NOME: 0, EMPRESA: 1, CARGO: 2, ADMISSAO: 3, VENCIMENTO: 4, DIAS_DIREITO: 5, ATIVO: 6 };

// Colunas da aba FERIAS (base 0)
const FER = {
  ID: 0, CHAVE: 1, NOME: 2, EMPRESA: 3, VENCIMENTO: 4,
  INICIO: 5, FIM: 6, DIAS: 7, TIPO: 8, OBS: 9, REG_POR: 10, REG_EM: 11
};

// =============================================================================
// UTILITÁRIOS
// =============================================================================

function norm_(s) {
  return String(s || '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function fmtData_(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return String(v);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy');
}

function fmtDataHora_(v) {
  if (!v) return '';
  const d = v instanceof Date ? v : new Date(v);
  if (isNaN(d)) return String(v);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm');
}

function parseDate_(s) {
  if (!s) return null;
  if (s instanceof Date) return new Date(s.getTime());
  const p = String(s).trim().split('/');
  if (p.length === 3) return new Date(+p[2], +p[1] - 1, +p[0]);
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

// Data limite para gozo: as férias precisam TERMINAR até o fim do período
// concessivo (fim do período aquisitivo + 12 meses). O último dia possível
// para INICIAR é: fim do concessivo - dias de saldo + 1 dia.
// Exemplo: período aquisitivo até 30/09/2025 com saldo de 5 dias →
// concessivo até 30/09/2026 → limite para iniciar 26/09/2026.
// O limite é dinâmico: conforme dias são gozados, o saldo cai e o limite avança.
function calcLimite_(vencDate, diasRestantes) {
  const d = new Date(vencDate.getTime());
  d.setFullYear(d.getFullYear() + 1);
  d.setDate(d.getDate() - Math.max(0, diasRestantes - 1));
  return d;
}

// Início do período aquisitivo = vencimento - 12 meses + 1 dia
// Exemplo: vencimento 02/01/2026 → início 03/01/2025
function periodoIni_(vencDate) {
  const d = new Date(vencDate.getTime());
  d.setFullYear(d.getFullYear() - 1);
  d.setDate(d.getDate() + 1);
  return d;
}

// Instrutores não entram no controle de férias.
// Aceita a grafia "INTRUTOR", que aparece com erro de digitação na folha de origem.
function isInstrutor_(cargo) {
  return /^ins?trutor\b/.test(norm_(cargo));
}

// Chave estável que identifica uma linha na aba VENCIMENTOS
function makeChave_(nome, empresa, vencDate) {
  const v = Utilities.formatDate(
    vencDate instanceof Date ? vencDate : new Date(vencDate),
    Session.getScriptTimeZone(), 'yyyy-MM-dd'
  );
  return norm_(nome) + '|' + norm_(empresa) + '|' + v;
}

// =============================================================================
// ENTRY POINT
// =============================================================================

function doGet(e) {
  const token = (e && e.parameter && e.parameter.s) ? e.parameter.s : '';
  const tmpl = HtmlService.createTemplateFromFile('Index');
  tmpl.token = token;
  return tmpl.evaluate()
    .setTitle('Controle de Férias — BRASAS')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// =============================================================================
// AUTENTICAÇÃO (mesma estrutura do Hub existente)
// =============================================================================

function getSessionUser_(token) {
  if (!token) return null;
  try {
    const ss = SpreadsheetApp.openById(HUB_SS_ID);
    const sh = ss.getSheetByName('SESSOES');
    if (!sh) return null;
    const found = sh.getRange(1, 1, sh.getLastRow(), 1)
      .createTextFinder(String(token).trim()).matchEntireCell(true).findNext();
    if (!found) return null;
    const row = sh.getRange(found.getRow(), 1, 1, 8).getValues()[0];
    if (row[6] && new Date(row[6]) < new Date()) return null;
    const email = String(row[1] || '').trim().toLowerCase();
    if (!email) return null;
    const acessos = String(row[7] || '').toLowerCase().split(',').map(a => a.trim());
    if (!acessos.includes(MEU_ACESSO))
      throw new Error('Você não tem permissão para acessar o Controle de Férias.');
    const unidadesRaw = String(row[4] || '').trim();
    const unidades = unidadesRaw ? unidadesRaw.split(',').map(u => norm_(u)).filter(Boolean) : [];
    return {
      email,
      nome: String(row[2] || '').trim(),
      role: String(row[3] || '').trim().toLowerCase(),
      unidades  // vazio = acesso a todas; preenchido = só essas unidades
    };
  } catch (e) {
    if (e.message && e.message.includes('permissão')) throw e;
    Logger.log('getSessionUser_: ' + e);
    return null;
  }
}

function getUserFromHub(token) {
  if (!token) throw new Error('Token não fornecido.');
  const u = getSessionUser_(token);
  if (!u) throw new Error('Sessão inválida ou expirada. Acesse novamente pelo Hub.');
  return u;
}

function isDP_(u) {
  return u.role === 'admin' || u.role === 'dp' ||
    EMAILS_ADM.some(e => norm_(e) === norm_(u.email));
}

// =============================================================================
// ABAS DA PLANILHA
// =============================================================================

function getVenSheet_() {
  const ss = SpreadsheetApp.openById(FERIAS_SHEET_ID);
  let s = ss.getSheetByName('VENCIMENTOS');
  if (!s) {
    s = ss.insertSheet('VENCIMENTOS');
    s.appendRow(['Nome', 'Empresa', 'Cargo', 'Admissao', 'Vencimento', 'Dias Direito', 'Ativo']);
    s.getRange(1, 1, 1, 7).setFontWeight('bold');
  }
  return s;
}

function getFerSheet_() {
  const ss = SpreadsheetApp.openById(FERIAS_SHEET_ID);
  let s = ss.getSheetByName('FERIAS');
  if (!s) {
    s = ss.insertSheet('FERIAS');
    s.appendRow(['ID', 'Chave', 'Nome', 'Empresa', 'Vencimento',
                 'Início', 'Fim', 'Dias', 'Tipo', 'Observação', 'Registrado Por', 'Registrado Em']);
    s.getRange(1, 1, 1, 12).setFontWeight('bold');
  }
  return s;
}

// =============================================================================
// LEITURA DOS DADOS
// =============================================================================

function getVencimentosData(token) {
  const user = getSessionUser_(token);
  if (!user) throw new Error('Sessão inválida.');

  // Monta mapa: chave → lista de períodos de férias já registrados
  const ferRows = getFerSheet_().getDataRange().getValues();
  const fMap = {};
  for (let i = 1; i < ferRows.length; i++) {
    const r = ferRows[i];
    const chave = String(r[FER.CHAVE] || '');
    if (!chave) continue;
    if (!fMap[chave]) fMap[chave] = [];
    fMap[chave].push({
      id:     String(r[FER.ID]     || ''),
      inicio: fmtData_(r[FER.INICIO]),
      fim:    fmtData_(r[FER.FIM]),
      dias:   Number(r[FER.DIAS])  || 0,
      tipo:   String(r[FER.TIPO]   || '').trim(),
      obs:    String(r[FER.OBS]    || '').trim(),
      regPor: String(r[FER.REG_POR]|| '').trim(),
      regEm:  fmtDataHora_(r[FER.REG_EM])
    });
  }

  const venRows = getVenSheet_().getDataRange().getValues();
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const records = [], empSet = {};

  for (let i = 1; i < venRows.length; i++) {
    const r = venRows[i];
    const nome = String(r[VEN.NOME] || '').trim();
    if (!nome) continue;

    const atv = norm_(r[VEN.ATIVO] || '');
    if (atv === 'inativo' || atv === 'false' || atv === 'não' || atv === 'nao' || atv === '0') continue;

    const empresa  = String(r[VEN.EMPRESA]   || '').trim();
    if (user.unidades.length > 0) {
      const normEmp = norm_(empresa);
      if (!user.unidades.some(u => (UNIDADES_MAP[u] || u) === normEmp)) continue;
    }
    const cargo    = String(r[VEN.CARGO]     || '').trim();
    if (isInstrutor_(cargo)) continue;

    const admissao = r[VEN.ADMISSAO] ? fmtData_(r[VEN.ADMISSAO] instanceof Date ? r[VEN.ADMISSAO] : parseDate_(String(r[VEN.ADMISSAO]))) : '';
    const venRaw   = r[VEN.VENCIMENTO];
    if (!venRaw) continue;

    const vencDate = venRaw instanceof Date ? new Date(venRaw.getTime()) : parseDate_(String(venRaw));
    if (!vencDate || isNaN(vencDate)) continue;

    const diasDirRaw = r[VEN.DIAS_DIREITO];
    const diasDir  = diasDirRaw instanceof Date ? 30 : (Number(diasDirRaw) || 30);
    const chave    = makeChave_(nome, empresa, vencDate);
    const periodos = (fMap[chave] || []).slice().sort((a, b) => {
      const da = parseDate_(a.inicio), db = parseDate_(b.inicio);
      return (da && db) ? da - db : 0;
    });
    const diasGoz  = periodos.reduce((s, p) => s + p.dias, 0);
    const diasRest = Math.max(0, diasDir - diasGoz);
    const limite   = calcLimite_(vencDate, diasRest);
    const diffDias = Math.ceil((limite - today) / 86400000);

    let status;
    if (diasRest === 0)                    status = 'gozadas';
    else if (diffDias < 0)                 status = 'vencido';
    else if (diffDias <= ALERTA_CRITICO)   status = 'critico';
    else if (diffDias <= ALERTA_ATENCAO)   status = 'atencao';
    else                                   status = 'ok';

    if (empresa) empSet[empresa] = true;
    records.push({
      chave, nome, empresa, cargo, admissao,
      vencimento:   fmtData_(vencDate),
      periodoIni:   fmtData_(periodoIni_(vencDate)),
      limite:       fmtData_(limite),
      diffDias,
      diasDireito:  diasDir,
      diasGozados:  diasGoz,
      diasRestantes: diasRest,
      status,
      periodos
    });
  }

  const PRIO = { vencido: 0, critico: 1, atencao: 2, ok: 3, gozadas: 4 };
  records.sort((a, b) =>
    (PRIO[a.status] - PRIO[b.status]) ||
    a.empresa.localeCompare(b.empresa, 'pt-BR') ||
    a.nome.localeCompare(b.nome, 'pt-BR') ||
    (a.diffDias - b.diffDias)
  );

  return { records, empresas: Object.keys(empSet).sort(), isDP: isDP_(user) };
}

// =============================================================================
// SALVAR PERÍODO DE FÉRIAS
// =============================================================================

function saveFeriasEntry(token, payload) {
  const user = getSessionUser_(token);
  if (!user) throw new Error('Sessão inválida.');
  if (!isDP_(user)) throw new Error('Acesso restrito ao Departamento Pessoal.');

  const { chave, inicio, fim, dias, tipo, obs } = payload;
  if (!chave)                     throw new Error('Funcionário não identificado.');
  if (!inicio)                    throw new Error('Informe a data de início das férias.');
  if (!dias || Number(dias) <= 0) throw new Error('Informe os dias (deve ser maior que zero).');

  const inicioDate = parseDate_(inicio);
  if (!inicioDate || isNaN(inicioDate)) throw new Error('Data de início inválida.');
  const fimDate = fim ? parseDate_(fim) : '';

  // Busca dados completos na aba VENCIMENTOS para gravar junto à linha FERIAS
  const venRows = getVenSheet_().getDataRange().getValues();
  let nomeFull = '', empFull = '', vencDateFull = null;
  for (let i = 1; i < venRows.length; i++) {
    const r  = venRows[i];
    const vd = r[VEN.VENCIMENTO] instanceof Date
      ? new Date(r[VEN.VENCIMENTO].getTime())
      : parseDate_(String(r[VEN.VENCIMENTO]));
    if (vd && makeChave_(r[VEN.NOME], r[VEN.EMPRESA], vd) === chave) {
      nomeFull = String(r[VEN.NOME]    || '').trim();
      empFull  = String(r[VEN.EMPRESA] || '').trim();
      vencDateFull = vd;
      break;
    }
  }
  if (!nomeFull) throw new Error('Funcionário não encontrado na planilha VENCIMENTOS.');

  getFerSheet_().appendRow([
    Utilities.getUuid(), chave, nomeFull, empFull, vencDateFull,
    inicioDate, fimDate || '', Number(dias),
    String(tipo || 'Férias').trim(),
    String(obs  || '').trim(),
    user.email, new Date()
  ]);

  return getVencimentosData(token);
}

// =============================================================================
// NOVO PERÍODO AQUISITIVO
// Cria uma nova linha na aba VENCIMENTOS para o mesmo funcionário, permitindo
// controlar mais de um período aquisitivo em aberto por pessoa.
// =============================================================================

function addPeriodoAquisitivo(token, payload) {
  const user = getSessionUser_(token);
  if (!user) throw new Error('Sessão inválida.');
  if (!isDP_(user)) throw new Error('Acesso restrito ao Departamento Pessoal.');

  const { chave, vencimento, diasDireito } = payload;
  if (!chave) throw new Error('Funcionário não identificado.');
  const vencDate = parseDate_(vencimento);
  if (!vencDate || isNaN(vencDate)) throw new Error('Data de fim do período aquisitivo inválida.');

  const sheet = getVenSheet_();
  const rows  = sheet.getDataRange().getValues();
  let base = null;
  const chavesExistentes = {};
  for (let i = 1; i < rows.length; i++) {
    const r  = rows[i];
    const vd = r[VEN.VENCIMENTO] instanceof Date
      ? new Date(r[VEN.VENCIMENTO].getTime())
      : parseDate_(String(r[VEN.VENCIMENTO]));
    if (!vd) continue;
    const c = makeChave_(r[VEN.NOME], r[VEN.EMPRESA], vd);
    chavesExistentes[c] = true;
    if (c === chave) base = r;
  }
  if (!base) throw new Error('Funcionário não encontrado na planilha VENCIMENTOS.');

  const nome = String(base[VEN.NOME]    || '').trim();
  const emp  = String(base[VEN.EMPRESA] || '').trim();
  const novaChave = makeChave_(nome, emp, vencDate);
  if (chavesExistentes[novaChave])
    throw new Error('Já existe um período aquisitivo com este vencimento para este funcionário.');

  sheet.appendRow([
    nome, emp,
    String(base[VEN.CARGO] || '').trim(),
    base[VEN.ADMISSAO] || '',
    vencDate,
    Number(diasDireito) || 30,
    'Ativo'
  ]);

  return getVencimentosData(token);
}

// =============================================================================
// EXCLUIR PERÍODO AQUISITIVO
// Remove a linha da aba VENCIMENTOS. Bloqueado se o período já tiver férias
// registradas na aba FERIAS, para não deixar registros órfãos.
// =============================================================================

function deletePeriodoAquisitivo(token, payload) {
  const user = getSessionUser_(token);
  if (!user) throw new Error('Sessão inválida.');
  if (!isDP_(user)) throw new Error('Acesso restrito ao Departamento Pessoal.');

  const { chave } = payload;
  if (!chave) throw new Error('Período aquisitivo não identificado.');

  const ferRows = getFerSheet_().getDataRange().getValues();
  for (let i = 1; i < ferRows.length; i++) {
    if (String(ferRows[i][FER.CHAVE]) === chave)
      throw new Error('Este período aquisitivo tem férias registradas. Exclua primeiro os registros de férias.');
  }

  const sheet = getVenSheet_();
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    const r  = rows[i];
    const vd = r[VEN.VENCIMENTO] instanceof Date
      ? new Date(r[VEN.VENCIMENTO].getTime())
      : parseDate_(String(r[VEN.VENCIMENTO]));
    if (vd && makeChave_(r[VEN.NOME], r[VEN.EMPRESA], vd) === chave) {
      sheet.deleteRow(i + 1);
      return getVencimentosData(token);
    }
  }
  throw new Error('Período aquisitivo não encontrado na planilha.');
}

// =============================================================================
// EXCLUIR PERÍODO DE FÉRIAS
// =============================================================================

function deleteFeriasEntry(token, payload) {
  const user = getSessionUser_(token);
  if (!user) throw new Error('Sessão inválida.');
  if (!isDP_(user)) throw new Error('Acesso restrito ao Departamento Pessoal.');

  const { id } = payload;
  if (!id) throw new Error('ID do período não informado.');

  const sheet = getFerSheet_();
  const rows  = sheet.getDataRange().getValues();
  for (let i = 1; i < rows.length; i++) {
    if (String(rows[i][FER.ID]) === id) {
      sheet.deleteRow(i + 1);
      return getVencimentosData(token);
    }
  }
  throw new Error('Período não encontrado na planilha.');
}

// =============================================================================
// EXPORTAR PARA GOOGLE SHEETS (filtros aplicados no frontend)
// =============================================================================

function exportFeriasToSheet(token, payload) {
  const user = getSessionUser_(token);
  if (!user) throw new Error('Sessão inválida.');

  const header = payload.header || [];
  const rows   = (payload.rows  || []).map(r => {
    r = r || [];
    const out = new Array(header.length);
    for (let i = 0; i < header.length; i++) out[i] = r[i] == null ? '' : r[i];
    return out;
  });
  if (!rows.length) throw new Error('Nenhum registro para exportar.');

  const carimbo = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd-MM-yyyy HH:mm');
  const ss    = SpreadsheetApp.create('Controle de Férias — ' + carimbo);
  const sheet = ss.getSheets()[0];
  sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  if (rows.length) sheet.getRange(2, 1, rows.length, header.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, header.length);
  try { ss.addEditor(user.email); } catch (e) { Logger.log('exportFeriasToSheet: ' + e); }
  return ss.getUrl();
}
