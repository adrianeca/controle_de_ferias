// =============================================================================
// IMPORTACAO: RELACAO DE FERIAS CALCULADAS
// Fonte: relatorio "RELACAO DE FERIAS CALCULADAS no periodo de 02/06/2026 a
// 31/01/2027", emitido em 31/07/2026 (59 funcionarios, 62 periodos de gozo).
//
// Execute importFeriasCalculadas() no editor do Apps Script. Para cada
// funcionario do relatorio:
//   1. Garante que existe linha na aba VENCIMENTOS para o periodo aquisitivo
//      do relatorio (Vencimento = fim do aquisitivo). Se nao existir, cria uma
//      nova linha copiando cargo/admissao de outra linha do mesmo funcionario.
//   2. Registra na aba FERIAS os periodos de gozo (Ferias e Abono Pecuniario),
//      com dias contados de forma inclusiva (inicio e fim contam).
//
// Reexecutar NAO duplica registros: periodos de gozo ja importados (mesma
// chave + data de inicio) sao ignorados. Funcionarios que nao existem na
// VENCIMENTOS (ex: instrutores) sao apenas listados no log, sem importar.
// =============================================================================

// [empresa, nome, aquisitivoInicio, aquisitivoFim, feriasInicio, feriasFim, abonoInicio, abonoFim]
const FCALC = [
  ['EDITORA EFICIENCIA LTDA','YVES LORENA MARTINS LAGE ESTEVEZ DUARTE','01/02/2025','31/01/2026','13/07/2026','27/07/2026','',''],
  ['EDITORA EFICIENCIA LTDA','IGOR RIBEIRO LEAL','08/09/2024','07/09/2025','01/06/2026','20/06/2026','21/06/2026','30/06/2026'],
  ['EDITORA EFICIENCIA LTDA','DAYANA NOBREGA FERRADAS MIGUEZ DALTRO','03/01/2025','02/01/2026','27/07/2026','31/07/2026','',''],
  ['EDITORA EFICIENCIA LTDA','SARA SANTOS BARROS DE ALMEIDA','02/06/2025','01/06/2026','17/08/2026','31/08/2026','',''],
  ['BAL - BARRA ASSESSORIA LINGUISTICA LTDA','PAMELLA RIBEIRO MARTINS DE SOUZA','02/01/2025','01/01/2026','08/06/2026','17/06/2026','',''],
  ['BAL - BARRA ASSESSORIA LINGUISTICA LTDA','MARIA DA CONSOLACAO DA SILVA','02/08/2024','01/08/2025','16/06/2026','30/06/2026','',''],
  ['BG ASSESSORIA LINGUISTICA LTDA','EMANUELLE DIOTTI CAMACHO','10/03/2025','09/03/2026','01/06/2026','06/06/2026','',''],
  ['CAMBAUBA ASSESSORIA LINGUISTICA LTDA.','SAMIRA SOUZA DE FREITAS WADDYNGTON','11/04/2025','10/04/2026','11/06/2026','25/06/2026','',''],
  ['CAMBAUBA ASSESSORIA LINGUISTICA LTDA.','MARCOS VINICIUS DA SILVA NOGUEIRA','02/06/2025','01/06/2026','25/06/2026','24/07/2026','',''],
  ['CAXIAS ASSESSORIA LINGUISTICA LTDA.','GILBERLANIA SILVA DOS SANTOS','23/09/2024','22/09/2025','04/08/2026','18/08/2026','',''],
  ['CAXIAS ASSESSORIA LINGUISTICA LTDA.','FLAVIA FERNANDES DA SILVA','09/08/2024','08/08/2025','15/06/2026','29/06/2026','',''],
  ['CAXIAS ASSESSORIA LINGUISTICA LTDA.','MARCIA VALERIA FERREIRA DE OLIVEIRA','02/12/2024','01/12/2025','13/07/2026','27/07/2026','',''],
  ['CG ASSESSORIA LINGUISTICA LTDA','NATHALIA DE OLIVEIRA DUARTE','14/07/2025','13/07/2026','09/07/2026','23/07/2026','',''],
  ['CG ASSESSORIA LINGUISTICA LTDA','THIAGO DOS SANTOS FRANCA','02/01/2025','01/01/2026','31/08/2026','14/09/2026','',''],
  ['DT ASSESSORIA LINGUISTICA LTDA.','LARISSA DOS SANTOS MORAIS FIORAVANTE DA COSTA','16/06/2025','15/06/2026','16/06/2026','30/06/2026','',''],
  ['EC NEW ASSESSORIA LINGUISTICA LTDA','ANDERSON VIEIRA DE CARVALHO','21/01/2025','20/01/2026','10/08/2026','17/08/2026','',''],
  ['EC NEW ASSESSORIA LINGUISTICA LTDA','RENATA DA HORA FIGUEIREDO FENDLER','21/01/2025','20/01/2026','24/08/2026','30/08/2026','',''],
  ['EC NEW ASSESSORIA LINGUISTICA LTDA','VAGNER DA SILVA','29/10/2024','28/10/2025','31/08/2026','29/09/2026','',''],
  ['EC NEW ASSESSORIA LINGUISTICA LTDA','GISELLE DE SOUZA PASSOS','04/02/2025','03/02/2026','24/08/2026','28/08/2026','',''],
  ['EC NEW ASSESSORIA LINGUISTICA LTDA','ISABELLA BARCELOS MOURA','10/11/2024','09/11/2025','16/07/2026','30/07/2026','',''],
  ['EC NEW ASSESSORIA LINGUISTICA LTDA','DANIELLE DE MORAIS MEDEIROS','01/08/2024','31/07/2025','08/06/2026','22/06/2026','',''],
  ['EC NEW ASSESSORIA LINGUISTICA LTDA','LUCAS SANTA ANNA DA SILVA','01/06/2025','31/05/2026','02/06/2026','16/06/2026','',''],
  ['IT ASSESSORIA LINGUISTICA LTDA.','BERONICE RITA DA SILVA','12/07/2025','11/07/2026','16/07/2026','25/07/2026','',''],
  ['IT ASSESSORIA LINGUISTICA LTDA.','ELIAS OLIVEIRA DA SILVA','17/06/2025','16/06/2026','15/07/2026','24/07/2026','',''],
  ['LEXICON ASSESSORIA LINGUISTICA LTDA','ADRIANA SILVA CARDOSO','11/12/2024','10/12/2025','13/07/2026','01/08/2026','',''],
  ['LEXICON ASSESSORIA LINGUISTICA LTDA','MARGARETH SIMOES DA SILVA','01/08/2025','31/07/2026','25/05/2026','08/06/2026','',''],
  ['LEXICON ASSESSORIA LINGUISTICA LTDA','FLAVIA CARNEIRO ALVES','10/05/2025','09/05/2026','20/07/2026','03/08/2026','',''],
  ['LEXICON ASSESSORIA LINGUISTICA LTDA','MARIANA VALVERDE DE FREITAS DOS SANTOS','02/01/2025','01/01/2026','16/06/2026','30/06/2026','',''],
  ['METODOS DE ENSINO BRASAS LTDA','AMANDA FERREIRA DE MELLO CUNHA','04/08/2024','03/08/2025','24/06/2026','03/07/2026','',''],
  ['METODOS DE ENSINO BRASAS LTDA','DIEGO RIBEIRO LEAL','11/03/2025','10/03/2026','06/07/2026','25/07/2026','26/07/2026','04/08/2026'],
  ['METODOS DE ENSINO BRASAS LTDA','ALINE CASTRO DA SILVA','12/03/2025','11/03/2026','02/06/2026','11/06/2026','',''],
  ['METODOS DE ENSINO BRASAS LTDA','RENATA DOREA AYRES','01/02/2025','31/01/2026','20/07/2026','24/07/2026','10/07/2026','19/07/2026'],
  ['METODOS DE ENSINO BRASAS LTDA','DIEGO DE OLIVEIRA ALVES','02/10/2024','01/10/2025','20/07/2026','24/07/2026','',''],
  ['METODOS DE ENSINO BRASAS LTDA','LAIZA MANOELA SILVA PEREIRA DE ARAUJO','04/12/2024','03/12/2025','25/05/2026','03/06/2026','',''],
  ['METODOS DE ENSINO BRASAS LTDA','BRUNA SANTOS LIMA','01/10/2024','30/09/2025','10/08/2026','14/08/2026','',''],
  ['METODOS DE ENSINO BRASAS LTDA','AGATHA LUANA DE FRANCA','28/10/2024','27/10/2025','15/07/2026','24/07/2026','',''],
  ['METODOS DE ENSINO BRASAS LTDA','DEIVED BRUNO PACHECO DOS SANTOS','02/01/2025','01/01/2026','03/08/2026','17/08/2026','',''],
  ['NEW CONCEPTS ASSESSORIA LINGUISTICA LTDA','BRUNA RODRIGUES ARAUJO LIMA','13/07/2024','12/07/2025','08/06/2026','12/06/2026','',''],
  ['NEW CONCEPTS ASSESSORIA LINGUISTICA LTDA','JANETH SILVA DE SOUSA','22/07/2024','21/07/2025','20/05/2026','03/06/2026','',''],
  ['NEW CONCEPTS ASSESSORIA LINGUISTICA LTDA','MARCELO RODRIGUES AFFONSO JUNIOR','18/02/2025','17/02/2026','15/06/2026','24/06/2026','',''],
  ['NS ASSESSORIA LINGUISTICA LTDA','VINICIUS LEONE MACHADO GONÇALVES DE LIMA','02/08/2024','01/08/2025','01/06/2026','15/06/2026','',''],
  ['NT ASSESSORIA LINGUISTICA LTDA.','SYLVIA NAZARE DA SILVA SANTOS','21/10/2024','20/10/2025','13/07/2026','23/07/2026','',''],
  ['P.O. ASSESSORIA LINGUISTICA LTDA','DENISE DE JESUS ALVES','26/01/2024','25/01/2025','22/06/2026','29/06/2026','',''],
  ['RC ASSESSORIA LINGUISTICA LTDA','SIMONE APARECIDA FERREIRA VIANA','21/07/2025','20/07/2026','08/06/2026','12/06/2026','',''],
  ['RC ASSESSORIA LINGUISTICA LTDA','CLAUDIA VALERIA DO NASCIMENTO MARTINS','05/02/2025','04/02/2026','08/06/2026','17/06/2026','',''],
  ['THE WEST COAST SCHOOL OF ENGLISH LTDA','SILVANA RODRIGUES DOS SANTOS TAVARES','02/07/2024','01/07/2025','08/06/2026','25/06/2026','',''],
  ['THE WEST COAST SCHOOL OF ENGLISH LTDA','TATIANA SAMPAIO DE JESUS','01/08/2024','31/07/2025','04/05/2026','02/06/2026','',''],
  ['TJ ASSESSORIA LINGUISTICA LTDA.','CAMILA NASCIMENTO SILVA','04/08/2024','03/08/2025','22/06/2026','01/07/2026','',''],
  ['TQ ASSESSORIA LINGUISTICA LTDA','PAULA CUNHA E SILVA CAMACHO','02/01/2025','01/01/2026','08/06/2026','19/06/2026','',''],
  ['VP ASSESSORIA LINGUISTICA LTDA','CAROLINE CRISTINA CORREA NASCIMENTO','02/12/2024','01/12/2025','08/06/2026','22/06/2026','',''],
  ['VP ASSESSORIA LINGUISTICA LTDA','EDILEUZA FERREIRA DA SILVA','02/01/2025','01/01/2026','01/07/2026','30/07/2026','',''],
  ['FG ASSESSORIA LINGUISTICA LTDA','JESSICA DE ARAUJO SILVA','03/04/2025','02/04/2026','10/08/2026','08/09/2026','',''],
  ['PN ASSESSORIA LINGUISTICA LTDA','ANA PAULA TEIXEIRA DE SOUZA','02/01/2026','01/01/2027','01/06/2026','15/06/2026','',''],
  ['ELEONORA TOSCANO DE BRITTO ZINOVETZ','PAULO DIONISIO CARDOSO','22/04/2025','21/04/2026','04/05/2026','02/06/2026','',''],
  ['ELEONORA TOSCANO DE BRITTO ZINOVETZ','ADEMIR DO SANTO MODESTO ROSMINI','01/06/2025','31/05/2026','04/05/2026','02/06/2026','',''],
  ['ELEONORA TOSCANO DE BRITTO ZINOVETZ','DERLI PEREIRA DE VASCONCELLOS','01/04/2025','31/03/2026','04/05/2026','02/06/2026','',''],
  ['ELEONORA TOSCANO DE BRITTO ZINOVETZ','CLAUDINEI DA COSTA RASMINE','01/08/2025','31/07/2026','03/08/2026','26/08/2026','',''],
  ['ELEONORA TOSCANO DE BRITTO ZINOVETZ','MARCIA DA COSTA DE ALMEIDA','01/08/2025','31/07/2026','03/08/2026','01/09/2026','',''],
  ['ELEONORA TOSCANO DE BRITTO ZINOVETZ','FABIO VERSSIMO PORTUGAL','01/08/2025','31/07/2026','03/08/2026','01/09/2026','','']
];

function importFeriasCalculadas() {
  const tz       = Session.getScriptTimeZone();
  const venSheet = getVenSheet_();
  const ferSheet = getFerSheet_();
  const venRows  = venSheet.getDataRange().getValues();
  const ferRows  = ferSheet.getDataRange().getValues();

  // Indexa funcionarios existentes: normEmpresa|normNome -> dados + vencimentos
  const pessoas    = {};
  const porEmpresa = {};
  for (let i = 1; i < venRows.length; i++) {
    const r    = venRows[i];
    const nome = String(r[VEN.NOME] || '').trim();
    if (!nome) continue;
    const emp = String(r[VEN.EMPRESA] || '').trim();
    const ne  = norm_(emp), nn = norm_(nome);
    const key = ne + '|' + nn;
    if (!pessoas[key]) {
      pessoas[key] = { nome, empresa: emp, cargo: r[VEN.CARGO] || '', admissao: r[VEN.ADMISSAO] || '', vencs: {} };
      (porEmpresa[ne] = porEmpresa[ne] || []).push(nn);
    }
    const vd = r[VEN.VENCIMENTO] instanceof Date
      ? r[VEN.VENCIMENTO]
      : parseDate_(String(r[VEN.VENCIMENTO]));
    if (vd) pessoas[key].vencs[Utilities.formatDate(vd, tz, 'yyyy-MM-dd')] = true;
  }

  // Gozos ja registrados na FERIAS: chave|inicio -> true
  const ferExist = {};
  for (let i = 1; i < ferRows.length; i++) {
    const r   = ferRows[i];
    const ini = r[FER.INICIO] instanceof Date ? r[FER.INICIO] : parseDate_(String(r[FER.INICIO]));
    if (!ini) continue;
    ferExist[String(r[FER.CHAVE]) + '|' + Utilities.formatDate(ini, tz, 'yyyy-MM-dd')] = true;
  }

  const naoEncontrados = [];
  let novosPeriodos = 0, novosGozos = 0, gozosJaExistiam = 0;

  FCALC.forEach(rec => {
    const empresa = rec[0], nome = rec[1], aqFim = rec[3];
    const ferIni = rec[4], ferFim = rec[5], abIni = rec[6], abFim = rec[7];
    const ne = norm_(empresa), nn = norm_(nome);

    let p = pessoas[ne + '|' + nn];
    if (!p) {
      // Nomes truncados na VENCIMENTOS (relatorios cortam em ~40 caracteres):
      // aceita quando um nome e prefixo do outro, dentro da mesma empresa
      const cand = (porEmpresa[ne] || []).filter(x => nn.indexOf(x) === 0 || x.indexOf(nn) === 0);
      if (cand.length === 1) p = pessoas[ne + '|' + cand[0]];
    }
    if (!p) { naoEncontrados.push(nome + ' (' + empresa + ')'); return; }

    const vencDate = parseDate_(aqFim);
    const vencKey  = Utilities.formatDate(vencDate, tz, 'yyyy-MM-dd');
    if (!p.vencs[vencKey]) {
      venSheet.appendRow([p.nome, p.empresa, p.cargo, p.admissao, vencDate, 30, 'Ativo']);
      p.vencs[vencKey] = true;
      novosPeriodos++;
    }

    const chave = makeChave_(p.nome, p.empresa, vencDate);
    const addGozo = (ini, fim, tipo) => {
      if (!ini || !fim) return;
      const iniD = parseDate_(ini), fimD = parseDate_(fim);
      const k = chave + '|' + Utilities.formatDate(iniD, tz, 'yyyy-MM-dd');
      if (ferExist[k]) { gozosJaExistiam++; return; }
      const dias = Math.round((fimD - iniD) / 86400000) + 1;
      ferSheet.appendRow([
        Utilities.getUuid(), chave, p.nome, p.empresa, vencDate,
        iniD, fimD, dias, tipo,
        'Importado da Relação de Férias Calculadas (31/07/2026)',
        'importacao', new Date()
      ]);
      ferExist[k] = true;
      novosGozos++;
    };
    addGozo(ferIni, ferFim, 'Férias');
    addGozo(abIni, abFim, 'Abono Pecuniário');
  });

  const resumo =
    'Importação concluída.\n' +
    '- Novos períodos aquisitivos criados na VENCIMENTOS: ' + novosPeriodos + '\n' +
    '- Períodos de gozo registrados na FERIAS: ' + novosGozos + '\n' +
    '- Gozos que já existiam (ignorados): ' + gozosJaExistiam + '\n' +
    '- Funcionários não encontrados (não importados): ' + naoEncontrados.length +
    (naoEncontrados.length ? '\n\n' + naoEncontrados.join('\n') : '');

  Logger.log(resumo);
  try { SpreadsheetApp.getUi().alert(resumo); } catch (e) { /* sem UI disponível */ }
}
