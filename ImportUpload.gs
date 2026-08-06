// =============================================================================
// UPLOAD DA RELAÇÃO DE FÉRIAS CALCULADAS
//
// Permite ao DP subir pela tela o relatório "RELAÇÃO DE FÉRIAS CALCULADAS"
// exportado do sistema da contabilidade, em vez de colar os dados dentro do
// ImportFeriasCalculadas.gs e rodar o script no editor.
//
// Fluxo em dois passos, para nada ser gravado às cegas:
//   1. analisarArquivoFerias  → lê o arquivo e devolve o que SERIA importado
//   2. importarFeriasArquivo  → grava, refazendo toda a conferência no servidor
//
// Layout do relatório (posições aprendidas do próprio cabeçalho, não fixas):
//   "Empresa:"            → nome da empresa do bloco, no formato "101 - NOME"
//   "Nome do empregado"   → linha de cabeçalho; a linha seguinte traz "Início"
//                           em cada coluna de data (aquisitivo, férias, abono)
//   Cada empregado ocupa DUAS linhas: a primeira com as datas de início e a
//   segunda com as de fim, nas mesmas colunas.
//   "Total da empresa" / "Sistema licenciado" → fim do bloco
//
// Arquivos .xls/.xlsx são convertidos em planilha Google via Drive API (é
// preciso ativar o serviço avançado "Drive API" no editor). CSV e TXT são
// lidos direto, sem conversão — assim as datas nunca passam por reinterpretação
// de locale (o sistema escreve dd/mm/aaaa e é assim que continuam).
// =============================================================================

const IMP_MAX_MB   = 10;
const RE_DATA_BR   = /^\d{2}\/\d{2}\/\d{4}$/;
const IMP_EXT_OK   = ['xls', 'xlsx', 'ods', 'csv', 'txt'];

// =============================================================================
// PASSO 1 — ANALISAR (não grava nada)
// =============================================================================

function analisarArquivoFerias(token, payload) {
  const user = getSessionUser_(token);
  if (!user) throw new Error('Sessão inválida.');
  if (!isDP_(user)) throw new Error('Acesso restrito ao Departamento Pessoal.');

  const matriz = lerMatrizArquivo_(payload);
  const lidos  = extrairRegistros_(matriz);

  if (!lidos.registros.length)
    throw new Error('Não encontrei nenhum funcionário no arquivo. Confira se é a ' +
                    '"Relação de Férias Calculadas" exportada do sistema.');

  const conf = conciliar_(lidos, user);
  conf.arquivo = String(payload && payload.nome || '');
  return conf;
}

// =============================================================================
// PASSO 2 — IMPORTAR
// Recebe de volta as linhas lidas do arquivo, mas refaz toda a conferência aqui:
// nada que venha do navegador é usado como verdade sobre o que já existe.
// =============================================================================

function importarFeriasArquivo(token, payload) {
  const user = getSessionUser_(token);
  if (!user) throw new Error('Sessão inválida.');
  if (!isDP_(user)) throw new Error('Acesso restrito ao Departamento Pessoal.');

  const brutos = (payload && payload.registros || []).map(function(r) {
    return {
      empresa: String(r.empresa || ''), nome: String(r.nome || ''),
      aqIni:   String(r.aqIni   || ''), aqFim:  String(r.aqFim  || ''),
      ferIni:  String(r.ferIni  || ''), ferFim: String(r.ferFim || ''),
      abIni:   String(r.abIni   || ''), abFim:  String(r.abFim  || '')
    };
  });
  if (!brutos.length) throw new Error('Nenhum registro para importar.');

  const criarPeriodos = payload.criarPeriodos !== false;
  const emissao       = String(payload.emissao || '');
  const arquivo       = String(payload.arquivo || 'arquivo do sistema');
  const origem        = 'Importado de ' + arquivo + (emissao ? ' (emissão ' + emissao + ')' : '');

  const conf     = conciliar_({ registros: brutos, emissao: emissao }, user);
  const tz       = Session.getScriptTimeZone();
  const venSheet = getVenSheet_();
  const ferSheet = getFerSheet_();
  const agora    = new Date();

  const novasVen = [], novasFer = [], criados = {};
  let gozosGravados = 0, periodosCriados = 0, pulados = 0;

  conf.registros.forEach(function(r) {
    if (r.status === 'nao-encontrado' || r.status === 'sem-permissao' ||
        r.status === 'erro' || r.status === 'sem-gozo') return;

    const vencDate = parseDate_(r.aqFim);
    const novos    = r.itens.filter(function(it) { return it.situacao === 'novo'; });
    if (!novos.length) return;

    if (!r.temPeriodo && !criados[r.chave]) {
      if (!criarPeriodos) { pulados += novos.length; return; }
      novasVen.push([r.matchNome, r.matchEmpresa, r.cargo, r.admissao, vencDate, r.diasDireito, 'Ativo']);
      criados[r.chave] = true;
      periodosCriados++;
    }

    novos.forEach(function(it) {
      novasFer.push([
        Utilities.getUuid(), r.chave, r.matchNome, r.matchEmpresa, vencDate,
        parseDate_(it.inicio), parseDate_(it.fim), it.dias, it.tipo,
        origem, user.email, agora
      ]);
      gozosGravados++;
    });
  });

  if (novasVen.length)
    venSheet.getRange(venSheet.getLastRow() + 1, 1, novasVen.length, 7).setValues(novasVen);
  if (novasFer.length)
    ferSheet.getRange(ferSheet.getLastRow() + 1, 1, novasFer.length, 12).setValues(novasFer);

  return {
    resultado: {
      gozosGravados:   gozosGravados,
      periodosCriados: periodosCriados,
      pulados:         pulados,
      jaExistiam:      conf.resumo.jaExistiam,
      naoEncontrados:  conf.resumo.naoEncontrados,
      semPermissao:    conf.resumo.semPermissao
    },
    data: getVencimentosData(token)
  };
}

// =============================================================================
// LEITURA DO ARQUIVO → MATRIZ DE TEXTO
// =============================================================================

function lerMatrizArquivo_(payload) {
  const nome = String(payload && payload.nome || 'arquivo');
  const b64  = String(payload && payload.dados || '');
  if (!b64) throw new Error('Nenhum arquivo recebido.');

  const bytes = Utilities.base64Decode(b64);
  if (bytes.length > IMP_MAX_MB * 1024 * 1024)
    throw new Error('Arquivo muito grande (máximo ' + IMP_MAX_MB + ' MB).');

  const ext = nome.indexOf('.') >= 0 ? nome.split('.').pop().toLowerCase() : '';
  if (IMP_EXT_OK.indexOf(ext) === -1)
    throw new Error('Formato não suportado' + (ext ? ' (.' + ext + ')' : '') +
                    '. Envie o .xls/.xlsx do sistema ou salve como CSV.');

  const blob = Utilities.newBlob(bytes, payload.mime || 'application/octet-stream', nome);
  return (ext === 'csv' || ext === 'txt') ? matrizDeTexto_(blob) : matrizDePlanilha_(blob, nome);
}

// CSV/TXT: lido direto, com detecção de acentuação e de separador
function matrizDeTexto_(blob) {
  let txt = blob.getDataAsString('UTF-8');
  // Caractere de substituição = o arquivo não era UTF-8; o sistema costuma
  // exportar em Latin-1, então relemos com essa acentuação
  if (txt.indexOf('�') !== -1) txt = blob.getDataAsString('ISO-8859-1');

  const amostra = txt.split('\n').slice(0, 40).join('\n');
  const conta = function(d) { return amostra.split(d).length - 1; };
  const tab = conta('\t'), pv = conta(';'), vg = conta(',');
  const delim = (tab > pv && tab > vg) ? '\t' : (pv >= vg ? ';' : ',');

  return Utilities.parseCsv(txt, delim);
}

// XLS/XLSX/ODS: convertidos em planilha Google temporária, lida e descartada
function matrizDePlanilha_(blob, nome) {
  if (typeof Drive === 'undefined')
    throw new Error('Para ler arquivos .xls/.xlsx é preciso ativar o serviço avançado ' +
                    '"Drive API" no editor do Apps Script (Serviços → Drive API → Adicionar). ' +
                    'Como alternativa, salve o relatório como CSV e envie de novo.');

  const titulo = 'TEMP IMPORT FERIAS ' + Utilities.getUuid();
  let fileId = null;
  try {
    fileId = Drive.Files.insert
      ? Drive.Files.insert({ title: titulo, mimeType: MimeType.GOOGLE_SHEETS }, blob).id
      : Drive.Files.create({ name: titulo, mimeType: MimeType.GOOGLE_SHEETS }, blob).id;
    return SpreadsheetApp.openById(fileId).getSheets()[0].getDataRange().getDisplayValues();
  } catch (e) {
    throw new Error('Não consegui ler "' + nome + '": ' + (e.message || e) +
                    '. Abra o arquivo no Excel e salve como .xlsx ou CSV, depois tente de novo.');
  } finally {
    if (fileId) { try { DriveApp.getFileById(fileId).setTrashed(true); } catch (e2) { Logger.log(e2); } }
  }
}

// =============================================================================
// MATRIZ → REGISTROS DO RELATÓRIO
// =============================================================================

function extrairRegistros_(m) {
  const registros = [];
  let empresa = '', emissao = '', colNome = -1, colsData = null, dentro = false;

  for (let i = 0; i < m.length; i++) {
    const linha = (m[i] || []).map(function(c) { return String(c == null ? '' : c).trim(); });
    const cheias = linha.filter(function(c) { return c !== ''; });
    if (!cheias.length) continue;
    const primeiro = cheias[0];

    // "Emissão: 31/07/2026" — usada só para identificar a origem dos registros
    for (let c = 0; c < linha.length; c++) {
      if (/^emiss[aã]o/i.test(linha[c])) {
        const v = linha.slice(c + 1).filter(function(x) { return x !== ''; })[0] || '';
        if (RE_DATA_BR.test(v)) emissao = v;
      }
    }

    // Início de um bloco de empresa: "Empresa:  101 - EDITORA EFICIENCIA LTDA"
    if (/^empresa:?$/i.test(primeiro)) {
      empresa  = (cheias[1] || '').replace(/^\s*\d+\s*-\s*/, '').trim();
      dentro   = false;
      colsData = null;
      continue;
    }

    // Cabeçalho da tabela: aprende a coluna do nome e as colunas de data
    if (/nome do empregado/i.test(linha.join(' '))) {
      colNome = -1;
      for (let c = 0; c < linha.length; c++) {
        if (/nome do empregado/i.test(linha[c])) { colNome = c; break; }
      }
      // A linha seguinte traz "Início" sob cada coluna de data,
      // na ordem: aquisitivo, férias, abono
      const prox = (m[i + 1] || []).map(function(c) { return String(c == null ? '' : c).trim(); });
      const inicios = [];
      for (let c = 0; c < prox.length; c++) if (/^in[ií]cio$/i.test(prox[c])) inicios.push(c);
      colsData = inicios.length >= 2 ? inicios : null;
      dentro   = colNome >= 0 && !!colsData;
      continue;
    }

    if (/^total da empresa/i.test(primeiro) || /^sistema licenciado/i.test(primeiro)) {
      dentro = false;
      continue;
    }
    if (!dentro) continue;

    // Linha de início: tem nome do empregado e data no período aquisitivo
    const nome = linha[colNome] || '';
    if (!nome || /^(in[ií]cio|fim|c[oó]digo)$/i.test(nome)) continue;

    const dataEm = function(l, c) { return RE_DATA_BR.test(l[c] || '') ? l[c] : ''; };
    const iniA = colsData.map(function(c) { return dataEm(linha, c); });
    if (!iniA[0]) continue;

    // Linha de fim: a próxima linha sem nome que traga data na coluna do aquisitivo
    let fimB = colsData.map(function() { return ''; });
    for (let j = i + 1; j < Math.min(i + 4, m.length); j++) {
      const lb = (m[j] || []).map(function(c) { return String(c == null ? '' : c).trim(); });
      if (lb[colNome]) break;                       // já começou outro empregado
      if (dataEm(lb, colsData[0])) {
        fimB = colsData.map(function(c) { return dataEm(lb, c); });
        i = j;                                      // consome a linha de fim
        break;
      }
    }

    registros.push({
      empresa: empresa,       nome:   nome,
      aqIni:   iniA[0],       aqFim:  fimB[0],
      ferIni:  iniA[1] || '', ferFim: fimB[1] || '',
      abIni:   iniA[2] || '', abFim:  fimB[2] || ''
    });
  }

  return { registros: registros, emissao: emissao };
}

// =============================================================================
// CONCILIAÇÃO COM AS ABAS VENCIMENTOS E FERIAS
// =============================================================================

function conciliar_(lidos, user) {
  const tz      = Session.getScriptTimeZone();
  const chaveDe = function(d) { return Utilities.formatDate(d, tz, 'yyyy-MM-dd'); };

  // Índice de funcionários da VENCIMENTOS: normEmpresa|normNome
  const venRows = getVenSheet_().getDataRange().getValues();
  const pessoas = {}, porEmpresa = {}, diasPorChave = {};
  for (let i = 1; i < venRows.length; i++) {
    const r    = venRows[i];
    const nome = String(r[VEN.NOME] || '').trim();
    if (!nome) continue;
    const emp = String(r[VEN.EMPRESA] || '').trim();
    const ne  = norm_(emp), nn = norm_(nome);
    const key = ne + '|' + nn;
    if (!pessoas[key]) {
      pessoas[key] = {
        nome: nome, empresa: emp,
        cargo:    String(r[VEN.CARGO] || '').trim().toUpperCase(),
        admissao: r[VEN.ADMISSAO] || '',
        vencs: {}
      };
      (porEmpresa[ne] = porEmpresa[ne] || []).push(nn);
    }
    const vd = r[VEN.VENCIMENTO] instanceof Date
      ? r[VEN.VENCIMENTO]
      : parseDate_(String(r[VEN.VENCIMENTO]));
    if (!vd) continue;
    pessoas[key].vencs[chaveDe(vd)] = true;
    const dr = r[VEN.DIAS_DIREITO];
    diasPorChave[makeChave_(nome, emp, vd)] = (dr instanceof Date) ? 30 : (Number(dr) || 30);
  }

  // Gozos já registrados: chave|inicio e total de dias por chave
  const ferRows  = getFerSheet_().getDataRange().getValues();
  const ferExist = {}, gozadoPorChave = {};
  for (let i = 1; i < ferRows.length; i++) {
    const r     = ferRows[i];
    const chave = String(r[FER.CHAVE] || '');
    if (!chave) continue;
    gozadoPorChave[chave] = (gozadoPorChave[chave] || 0) + (Number(r[FER.DIAS]) || 0);
    const ini = r[FER.INICIO] instanceof Date ? r[FER.INICIO] : parseDate_(String(r[FER.INICIO]));
    if (ini) ferExist[chave + '|' + chaveDe(ini)] = true;
  }

  const resumo = {
    linhas: lidos.registros.length, novosGozos: 0, jaExistiam: 0,
    periodosNovos: 0, naoEncontrados: 0, semPermissao: 0, semGozo: 0, comAviso: 0
  };
  const periodosVistos = {};

  const registros = lidos.registros.map(function(b) {
    const reg = {
      empresa: b.empresa, nome: b.nome,
      aqIni: b.aqIni, aqFim: b.aqFim,
      ferIni: b.ferIni, ferFim: b.ferFim, abIni: b.abIni, abFim: b.abFim,
      itens: [], status: 'novo', motivo: '', aviso: '',
      matchNome: '', matchEmpresa: '', cargo: '', admissao: '',
      chave: '', temPeriodo: false, diasDireito: 30
    };

    // Empresas fora das unidades do usuário não entram
    if (user.unidades.length > 0) {
      const ne = norm_(b.empresa);
      if (!user.unidades.some(function(u) { return (UNIDADES_MAP[u] || u) === ne; })) {
        reg.status = 'sem-permissao';
        reg.motivo = 'Empresa fora das suas unidades';
        resumo.semPermissao++;
        return reg;
      }
    }

    // Nome: casamento exato e, se falhar, por prefixo dentro da mesma empresa
    // (o relatório corta nomes longos em ~40 caracteres)
    const ne = norm_(b.empresa), nn = norm_(b.nome);
    let p = pessoas[ne + '|' + nn];
    if (!p) {
      const cand = (porEmpresa[ne] || []).filter(function(x) {
        return nn.indexOf(x) === 0 || x.indexOf(nn) === 0;
      });
      if (cand.length === 1) p = pessoas[ne + '|' + cand[0]];
    }
    if (!p) {
      reg.status = 'nao-encontrado';
      reg.motivo = 'Não está na aba VENCIMENTOS (instrutores não entram no controle)';
      resumo.naoEncontrados++;
      return reg;
    }

    const vencDate = parseDate_(b.aqFim);
    if (!vencDate || isNaN(vencDate)) {
      reg.status = 'erro';
      reg.motivo = 'Fim do período aquisitivo inválido';
      return reg;
    }

    reg.matchNome    = p.nome;
    reg.matchEmpresa = p.empresa;
    reg.cargo        = p.cargo;
    reg.admissao     = p.admissao;
    reg.chave        = makeChave_(p.nome, p.empresa, vencDate);
    reg.temPeriodo   = !!p.vencs[chaveDe(vencDate)];
    reg.diasDireito  = diasPorChave[reg.chave] || 30;
    if (norm_(p.nome) !== nn) reg.aviso = 'Nome casado por aproximação: ' + p.nome;

    // Períodos de gozo do relatório
    const addItem = function(tipo, ini, fim) {
      if (!ini || !fim) return;
      const di = parseDate_(ini), df = parseDate_(fim);
      if (!di || !df || isNaN(di) || isNaN(df)) return;
      const dias = Math.round((df - di) / 86400000) + 1;
      if (dias <= 0) {
        reg.itens.push({ tipo: tipo, inicio: ini, fim: fim, dias: 0, situacao: 'invalido' });
        return;
      }
      const jaTem = !!ferExist[reg.chave + '|' + chaveDe(di)];
      reg.itens.push({
        tipo: tipo, inicio: ini, fim: fim, dias: dias,
        situacao: jaTem ? 'existente' : 'novo'
      });
    };
    addItem('Férias', b.ferIni, b.ferFim);
    addItem('Abono Pecuniário', b.abIni, b.abFim);

    const novos = reg.itens.filter(function(it) { return it.situacao === 'novo'; });
    const jaLa  = reg.itens.filter(function(it) { return it.situacao === 'existente'; });
    resumo.novosGozos += novos.length;
    resumo.jaExistiam += jaLa.length;

    if (!reg.itens.length) {
      reg.status = 'sem-gozo';
      reg.motivo = 'Sem datas de férias ou abono no relatório';
      resumo.semGozo++;
      return reg;
    }
    if (!novos.length) {
      reg.status = 'ja-importado';
      return reg;
    }

    // Só conta período novo uma vez, mesmo que o relatório traga duas linhas
    if (!reg.temPeriodo && !periodosVistos[reg.chave]) {
      periodosVistos[reg.chave] = true;
      resumo.periodosNovos++;
    }

    // Alerta de saldo: o que já está lançado mais o que vem do arquivo
    const somaNovos = novos.reduce(function(s, it) { return s + it.dias; }, 0);
    const total     = (gozadoPorChave[reg.chave] || 0) + somaNovos;
    if (total > reg.diasDireito) {
      reg.aviso = (reg.aviso ? reg.aviso + ' · ' : '') +
        'Passa do direito do período: ' + total + ' de ' + reg.diasDireito + ' dias';
      resumo.comAviso++;
    }
    return reg;
  });

  return { registros: registros, resumo: resumo, emissao: lidos.emissao || '' };
}
