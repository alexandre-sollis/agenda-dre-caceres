import {
    agendaRef,
    setDoc,
    onSnapshot
} from "./firebase.js";

/* =====================================================
   CONFIGURAÇÃO & BLOQUEIO DE REPOUSO (WAKE LOCK)
===================================================== */

const modoTV = window.location.search.includes("tv");
let wakeLock = null;

async function ativarFocoTela() {
    if ('wakeLock' in navigator) {
        try {
            // Evita requisições duplicadas se já estiver ativo
            if (wakeLock !== null) return; 

            wakeLock = await navigator.wakeLock.request('screen');
            console.log("Wake Lock ativo: A tela não irá entrar em repouso.");

            // Adiciona o listener apenas uma vez
            if (!window.visibilityListenerAdded) {
                document.addEventListener('visibilitychange', async () => {
                    if (document.visibilityState === 'visible' && navigator.wakeLock) {
                        wakeLock = await navigator.wakeLock.request('screen');
                    }
                });
                window.visibilityListenerAdded = true;
            }
        } catch (erro) {
            console.log(`Não foi possível manter a tela ativa: ${erro.message}`);
        }
    } else {
        console.log("O navegador desta TV não suporta a API de Wake Lock nativa.");
    }
}

if (modoTV) {
    document.body.classList.add("tv");
    ativarFocoTela();
    window.addEventListener('click', ativarFocoTela, { once: true });
    window.addEventListener('touchstart', ativarFocoTela, { once: true });
}

/* =====================================================
   ELEMENTOS DO DOM
===================================================== */

const tbody = document.getElementById("tbody");
const template = document.getElementById("linha");

const totalEventos = document.getElementById("totalEventos");
const eventosHoje = document.getElementById("eventosHoje");
const totalResponsaveis = document.getElementById("totalResponsaveis");
const proximoEvento = document.getElementById("proximoEvento");

const textoBarra = document.getElementById("textoBarra");

const alertaEvento = document.getElementById("alertaEvento");
const tituloEvento = document.getElementById("tituloEvento");
const horaEvento = document.getElementById("horaEvento");
const contadorEvento = document.getElementById("contadorEvento");

const btnAdicionarLinha = document.getElementById("btnAdicionarLinha");
const btnImportarExcel = document.getElementById("btnImportarExcel");
const btnRemoverLinha = document.getElementById("btnRemoverLinha");
const btnBaixarExcel = document.getElementById("btnBaixarExcel");

// Cria dinamicamente o input oculto para seleção de arquivos CSV
const inputArquivo = document.createElement("input");
inputArquivo.type = "file";
inputArquivo.accept = ".csv";
inputArquivo.style.display = "none";
document.body.appendChild(inputArquivo);

/* =====================================================
   VARIÁVEIS DE CONTROLE
===================================================== */

let salvando = false;
let timeoutSalvar = null;
let ultimaVersao = "";
let ultimoAviso = "";

/* =====================================================
   UTILITÁRIOS (DATA E FORMATAÇÃO)
===================================================== */

function converterData(data, definirFimDoDia = false){
    if(!data) return null;
    const partes = data.split("/");
    let d, m, a;

    if(partes.length === 2){
        [d, m] = partes;
        a = new Date().getFullYear();
    } else if(partes.length === 3){
        [d, m, a] = partes;
    } else {
        return null;
    }
    
    return definirFimDoDia 
        ? new Date(a, m - 1, d, 23, 59, 59, 999)
        : new Date(a, m - 1, d, 0, 0, 0, 0);
}

document.title = "Agenda Institucional";

function converterDataHora(data, hora){
    if(!data || !hora) return null;
    const partes = data.split("/");
    let d, m, a;

    if(partes.length === 2){
        [d, m] = partes;
        a = new Date().getFullYear();
    } else if(partes.length === 3){
        [d, m, a] = partes;
    } else {
        return null;
    }

    const [h, min] = hora.split(":");
    return new Date(a, m - 1, d, h, min || 0, 0, 0);
}

function hojeZero(){
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    return hoje;
}

function formatarTempo(ms){
    if(ms < 0 || isNaN(ms)) ms = 0;
    const total = Math.floor(ms / 1000);
    const dias = Math.floor(total / 86400);
    const horas = Math.floor((total % 86400) / 3600);
    const minutos = Math.floor((total % 3600) / 60);
    const segundos = total % 60;

    if(dias > 0){
        return `${dias}d ${horas}h ${minutos}min`;
    }
    if(horas > 0){
        return `${horas}h ${minutos}min`;
    }
    return `${minutos}min ${segundos}s`;
}

function formatarDataCurta(data){
    if(!data) return "";
    const partes = data.trim().split("/");
    if(partes.length >= 2){
        return `${partes[0].padStart(2, '0')}/${partes[1].padStart(2, '0')}`;
    }
    return data;
}

/* =====================================================
   MANIPULAÇÃO DA TABELA (CRIAR, ADICIONAR, REMOVER, IMPORTAR)
===================================================== */

function criarLinha(item = {
    inicio: "",
    fim: "",
    horario: "",
    aviso: "15",
    periodo: "",
    acao: "",
    responsavel: ""
}){
    if (!template || !tbody) return;

    const clone = template.content.cloneNode(true);
    const tr = clone.querySelector("tr");
    const td = tr.querySelectorAll("td");

    td[0].textContent = formatarDataCurta(item.inicio);
    td[1].textContent = formatarDataCurta(item.fim);
    td[2].textContent = item.horario || "";
    td[3].textContent = item.aviso || "15";
    td[4].textContent = item.periodo || "";
    td[5].textContent = item.acao || "";
    td[6].textContent = item.responsavel || "";

    td.forEach(campo => {
        campo.contentEditable = !modoTV;

        if(!modoTV){
            campo.addEventListener("input", agendarSalvar);
            campo.addEventListener("blur", () => {
                atualizarIndicadores();
                monitorarEventos();
            });
            campo.addEventListener("keydown", e => {
                if(e.key === "Enter"){
                    e.preventDefault();
                    campo.blur();
                }
            });
        }
    });

    tbody.appendChild(tr);
}

function adicionarLinha(){
    criarLinha();
    atualizarIndicadores();
    monitorarEventos();
    agendarSalvar();
}

/* Alteração sutil: A remoção de linhas foi adaptada para manter ao menos uma linha estrutural vazia caso a tabela seja zerada. */
function removerLinha(){
    const lines = tbody.querySelectorAll("tr");
    if(lines.length === 0) return;
    lines[lines.length - 1].remove();
    atualizarIndicadores();
    monitorarEventos();
    agendarSalvar();
}

function lerTabela(){
    const agenda = [];
    if(!tbody) return agenda;
    tbody.querySelectorAll("tr").forEach(tr => {
        const td = tr.querySelectorAll("td");
        if(td.length >= 7) {
            agenda.push({
                inicio: td[0].textContent.trim(),
                fim: td[1].textContent.trim(),
                horario: td[2].textContent.trim(),
                aviso: td[3].textContent.trim() || "15",
                periodo: td[4].textContent.trim(),
                acao: td[5].textContent.trim(),
                responsavel: td[6].textContent.trim()
            });
        }
    });
    return agenda;
}

function baixarExcelDoBanco() {
    const dados = lerTabela();
    if (dados.length === 0) {
        alert("Não há dados na tabela para exportar.");
        return;
    }

    let csvConteudo = "\uFEFF"; 
    csvConteudo += "INÍCIO;FIM;HORÁRIO;AVISO;PERÍODO;AÇÕES;RESPONSÁVEL\n";

    dados.forEach(item => {
        csvConteudo += `"${item.inicio || ''}";"${item.fim || ''}";"${item.horario || ''}";"${item.aviso || '15'}";"${item.periodo || ''}";"${item.acao || ''}";"${item.responsavel || ''}"\n`;
    });

    const blob = new Blob([csvConteudo], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    
    link.href = url;
    link.download = `agenda_dre_caceres_${new Date().toLocaleDateString().replace(/\//g, '_')}.csv`;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Processa o arquivo CSV importado pelo usuário
function importarCSV(e) {
    const arquivo = e.target.files[0];
    if (!arquivo) return;

    const leitor = new FileReader();
    leitor.onload = function (evt) {
        const texto = evt.target.result;
        const linhas = texto.split(/\r?\n/);
        const novosItens = [];

        // Ignora o cabeçalho (i = 1)
        for (let i = 1; i < linhas.length; i++) {
            const linha = linhas[i].trim();
            if (!linha) continue;

            // Divide por ponto e vírgula removendo as aspas extras das strings
            const colunas = linha.split(';').map(col => col.replace(/^"|"$/g, '').trim());

            if (colunas.length >= 7) {
                novosItens.push({
                    inicio: colunas[0],
                    fim: colunas[1],
                    horario: colunas[2],
                    aviso: colunas[3] || "15",
                    periodo: colunas[4],
                    acao: colunas[5],
                    responsavel: colunas[6]
                });
            }
        }

        if (novosItens.length > 0) {
            if (confirm(`Deseja importar ${novosItens.length} eventos? Isso substituirá a lista atual.`)) {
                desenharTabela(novosItens);
                salvarFirebase();
                alert("Importação concluída com sucesso!");
            }
        } else {
            alert("Nenhum dado válido encontrado no arquivo CSV. Certifique-se de usar o separador ';' (ponto e vírgula).");
        }
        
        // Limpa o input para permitir re-importar o mesmo arquivo se necessário
        inputArquivo.value = "";
    };

    leitor.readAsText(arquivo, "UTF-8");
}

/* =====================================================
   SINCRONIZAÇÃO COM O FIREBASE
===================================================== */

function agendarSalvar(){
    clearTimeout(timeoutSalvar);
    timeoutSalvar = setTimeout(() => {
        salvarFirebase();
    }, 500);
}

async function salvarFirebase(){
    if(salvando) return;
    salvando = true;
    try {
        const agenda = lerTabela();
        ultimaVersao = JSON.stringify(agenda);
        await setDoc(agendaRef, {
            agenda,
            atualizadoEm: new Date().toISOString()
        });
    } catch(erro) {
        console.error("Erro ao salvar no Firebase:", erro);
    }
    salvando = false;
}

function desenharTabela(lista){
    if(!tbody) return;
    const hoje = hojeZero();

    lista.sort((a, b) => {
        const inicioA = converterData(a.inicio);
        const fimA = converterData(a.fim, true); 
        const inicioB = converterData(b.inicio);
        const fimB = converterData(b.fim, true);

        const hojeA = inicioA && fimA && hoje >= inicioA && hoje <= fimA;
        const hojeB = inicioB && fimB && hoje >= inicioB && hoje <= fimB;

        if(hojeA && !hojeB) return -1;
        if(!hojeA && hojeB) return 1;

        const futuroA = inicioA && inicioA >= hoje;
        const futuroB = inicioB && inicioB >= hoje;

        if(futuroA && !futuroB) return -1;
        if(!futuroA && futuroB) return 1;

        return (inicioA || 0) - (inicioB || 0);
    });

    tbody.innerHTML = "";
    lista.forEach(item => criarLinha(item));

    destacarEventos();
    colorirLinhas();
    atualizarIndicadores();
    monitorarEventos();
}

/* =====================================================
   INDICADORES E REGRAS VISUAIS
===================================================== */

function destacarEventos(){
    if(!tbody) return;
    const hoje = hojeZero();
    tbody.querySelectorAll("tr").forEach(tr => {
        tr.classList.remove("evento-hoje");
        const td = tr.querySelectorAll("td");
        if(td.length < 2) return;
        const inicio = converterData(td[0].textContent);
        const fim = converterData(td[1].textContent, true);

        if(!inicio || !fim) return;

        if(hoje >= inicio && hoje <= fim){
            tr.classList.add("evento-hoje");
        }
    });
}

/* O gerenciamento e a contagem de indicadores dinâmicos agora filtram de forma limpa entradas inválidas ou vazias na tabela. */
function atualizarIndicadores(){
    if(!tbody) return;
    const linhas = tbody.querySelectorAll("tr");
    if(totalEventos) totalEventos.textContent = linhas.length;

    const hoje = hojeZero();
    let eventosAtivos = 0;
    const responsaveis = new Set();

    linhas.forEach(tr => {
        const td = tr.querySelectorAll("td");
        if(td.length < 7) return;

        const inicio = converterData(td[0].textContent);
        const fim = converterData(td[1].textContent, true);

        if(inicio && fim && hoje >= inicio && hoje <= fim){
            eventosAtivos++;
        }

        const respText = td[6].textContent.trim();
        if(respText){
            responsaveis.add(respText);
        }
    });

    if(eventosHoje) eventosHoje.textContent = eventosAtivos;
    if(totalResponsaveis) totalResponsaveis.textContent = responsaveis.size;
}

function colorirLinhas(){
    if(!tbody) return;
    const hoje = hojeZero();

    tbody.querySelectorAll("tr").forEach(tr => {
        tr.classList.remove(
            "periodo-manha", "periodo-tarde", "periodo-noite", "periodo-integral", "evento-passado"
        );

        const td = tr.querySelectorAll("td");
        if(td.length < 5) return;

        const periodo = td[4].textContent.trim().toLowerCase();

        if(periodo.includes("manhã") || periodo.includes("manha")) tr.classList.add("periodo-manha");
        if(periodo.includes("tarde")) tr.classList.add("periodo-tarde");
        if(periodo.includes("noite")) tr.classList.add("periodo-noite");
        if(periodo.includes("integral")) tr.classList.add("periodo-integral");

        const fim = converterData(td[1].textContent, true);
        if(fim && fim < hoje){
            tr.classList.add("evento-passado");
        }
    });
}

/* =====================================================
   MONITORAMENTO DE EVENTOS & ALERTAS EM TEMPO REAL
===================================================== */

function monitorarEventos(){
    if(!tbody) return;
    const agora = new Date();
    let proximo = null;
    let menorTempo = Infinity;

    tbody.querySelectorAll("tr").forEach(tr => {
        tr.classList.remove("evento-urgente");
        const td = tr.querySelectorAll("td");
        if(td.length < 6) return;

        const inicio = converterDataHora(
            td[0].textContent.trim(),
            td[2].textContent.trim()
        );

        if(!inicio) return;

        const diferenca = inicio - agora;

        if(diferenca >= 0 && diferenca < menorTempo){
            let minutosAviso = parseInt(td[3].textContent.trim(), 10);
            if(isNaN(minutosAviso)) minutosAviso = 15;

            menorTempo = diferenca;
            proximo = {
                linha: tr,
                titulo: td[5].textContent.trim(),
                horario: td[2].textContent.trim(),
                aviso: minutosAviso,
                inicio: inicio
            };
        }
    });

    if(!proximo){
        if(proximoEvento) proximoEvento.textContent = "Sem eventos";
        if(textoBarra) textoBarra.textContent = "Nenhum evento programado.";
        return;
    }

    if(proximoEvento) proximoEvento.textContent = formatarTempo(menorTempo);
    if(textoBarra) {
        textoBarra.textContent = `Próximo evento: ${proximo.titulo} • ${proximo.horario} • Faltam ${formatarTempo(menorTempo)}`;
    }

    if(menorTempo <= 300000){ 
        proximo.linha.classList.add("evento-urgente");
    }

    dispararAviso(proximo);
}

function dispararAviso(evento){
    const agora = new Date();
    const restante = Math.ceil((evento.inicio - agora) / 60000);

    if(restante !== evento.aviso) return;

    const chave = evento.titulo + evento.horario + evento.inicio.toDateString();
    if(chave === ultimoAviso) return;

    ultimoAviso = chave;

    if(tituloEvento) tituloEvento.textContent = evento.titulo;
    if(horaEvento) horaEvento.textContent = "Início às " + evento.horario;
    if(contadorEvento) contadorEvento.textContent = `Faltam ${evento.aviso} minutos`;

    if(alertaEvento) {
        alertaEvento.style.display = "flex";
        tocarSom();
        setTimeout(() => {
            alertaEvento.style.display = "none";
        }, 15000);
    }
}

function tocarSom(){
    const audio = new Audio("alerta.mp3");
    audio.volume = 1;
    audio.play().catch(() => {
        console.log("Som travado pelas políticas de interação do navegador.");
    });

    setTimeout(() => {
        audio.pause();
        audio.currentTime = 0;
    }, 3000);
}

setInterval(monitorarEventos, 5000);

/* =====================================================
   LEITURA EM TEMPO REAL DO FIREBASE
===================================================== */

onSnapshot(agendaRef, async (snapshot) => {
    if(!snapshot.exists()){
        await setDoc(agendaRef, {
            agenda: [],
            atualizadoEm: new Date().toISOString()
        });
        return;
    }

    const dados = snapshot.data();
    const agenda = dados.agenda || [];
    const json = JSON.stringify(agenda);

    if(json === ultimaVersao) return;

    if (!modoTV) {
        if (salvando || timeoutSalvar !== null) return;
        if (document.activeElement && document.activeElement.tagName === "TD") return;
    }

    ultimaVersao = json;
    desenharTabela(agenda);
}, (erro) => {
    console.error("Erro ao ler dados do Firebase:", erro.code, erro.message);
});

/* =====================================================
   RECARREGAMENTO AUTOMÁTICO (MODO TV)
===================================================== */

if (modoTV) {
    setInterval(() => {
        console.log("Limpando cache e atualizando painel...");
        location.replace(location.href);
    }, 15 * 60 * 1000); 
}

/* =====================================================
   NOTÍCIAS G1 NO TICKER
===================================================== */

const RSS_G1 = 'https://g1.globo.com/rss/g1/';

async function carregarNoticiasG1() {
    try {
        const url = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(RSS_G1);
        const resposta = await fetch(url);
        if (!resposta.ok) throw new Error('Status HTTP ' + resposta.status);

        const dados = await resposta.json();
        if (dados.status !== 'ok' || !dados.items?.length) throw new Error('Feed inválido');

        const manchetes = dados.items
            .slice(0, 8)
            .map(item => item.title?.trim())
            .filter(Boolean);

        const avisosEl = document.getElementById('avisos');
        if (manchetes.length && avisosEl) {
            avisosEl.textContent = manchetes.map(m => `📰 ${m}`).join('     •     ');
        }
    } catch (erro) {
        console.log('Não foi possível sincronizar notícias do G1:', erro.message);
    }
}

/* =====================================================
   INICIALIZAÇÃO E ASSINATURA DOS BOTÕES (APÓS DOM)
===================================================== */

document.addEventListener("DOMContentLoaded", () => {
    carregarNoticiasG1();
    setInterval(carregarNoticiasG1, 10 * 60 * 1000);

    // Buscar os botões apenas agora que temos certeza que o HTML foi carregado
    const botaoAdicionar = document.getElementById("btnAdicionarLinha");
    const botaoRemover = document.getElementById("btnRemoverLinha");
    const botaoImportar = document.getElementById("btnImportarExcel");
    const botaoBaixar = document.getElementById("btnBaixarExcel");

    if (!modoTV) {
        if (botaoAdicionar) {
            botaoAdicionar.addEventListener("click", adicionarLinha);
        }
        if (botaoRemover) {
            botaoRemover.addEventListener("click", removerLinha);
        }
    }

    // Configuração do botão de Importar
    if (botaoImportar) {
        // Clonar para limpar qualquer evento residual
        const cloneImportar = botaoImportar.cloneNode(true);
        botaoImportar.replaceWith(cloneImportar);

        if (!modoTV) {
            cloneImportar.addEventListener("click", (e) => {
                e.preventDefault();
                inputArquivo.click(); // Abre a janela de arquivos
            });
            
            // Garantir que o inputArquivo (criado globalmente) escute a mudança
            inputArquivo.addEventListener("change", importarCSV);
            console.log("Botão Importar configurado com sucesso.");
        }
    }

    // Configuração do botão de Exportar (Baixar)
    if (botaoBaixar) {
        // Clonar para limpar qualquer evento residual
        const cloneBaixar = botaoBaixar.cloneNode(true);
        botaoBaixar.replaceWith(cloneBaixar);
        
        cloneBaixar.addEventListener("click", (e) => {
            e.preventDefault();
            baixarExcelDoBanco();
        });
        console.log("Botão Baixar configurado com sucesso.");
    }

    setTimeout(() => {
        document.body.click();
    }, 1500);
});
