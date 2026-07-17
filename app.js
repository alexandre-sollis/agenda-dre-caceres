import {
    agendaRef,
    setDoc,
    onSnapshot
} from "./firebase.js";

/* =====================================================
   CONFIGURAÇÃO
===================================================== */

const modoTV = window.location.search.includes("tv");

if (modoTV) {
    document.body.classList.add("tv");
}

/* =====================================================
   ELEMENTOS
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
const btnRemoverLinha = document.getElementById("btnRemoverLinha");

/* =====================================================
   VARIÁVEIS
===================================================== */

let salvando = false;
let timeoutSalvar = null;
let ultimaVersao = "";
let ultimoAviso = "";


/* =====================================================
   UTILITÁRIOS
===================================================== */

function converterData(data){

    if(!data) return null;

    const partes = data.split("/");

    let d,m,a;

    if(partes.length===2){

        [d,m] = partes;
        a = new Date().getFullYear();

    }else if(partes.length===3){

        [d,m,a] = partes;

    }else{

        return null;

    }

    return new Date(a,m-1,d);

}

function converterDataHora(data,hora){

    if(!data || !hora) return null;

    const partes = data.split("/");

    let d,m,a;

    if(partes.length===2){

        [d,m] = partes;
        a = new Date().getFullYear();

    }else if(partes.length===3){

        [d,m,a] = partes;

    }else{

        return null;

    }

    const [h,min] = hora.split(":");

    return new Date(a,m-1,d,h,min||0,0);

}

function hojeZero(){

    const hoje = new Date();

    hoje.setHours(0,0,0,0);

    return hoje;

}

function formatarTempo(ms){

    if(ms<0) ms=0;

    const total=Math.floor(ms/1000);

    const dias=Math.floor(total/86400);

    const horas=Math.floor((total%86400)/3600);

    const minutos=Math.floor((total%3600)/60);

    const segundos=total%60;

    if(dias>0){

        return `${dias}d ${horas}h ${minutos}min`;

    }

    if(horas>0){

        return `${horas}h ${minutos}min`;

    }

    return `${minutos}min ${segundos}s`;

}

function formatarDataCurta(data){

    if(!data) return "";

    const partes = data.trim().split("/");

    if(partes.length>=2){

        return `${partes[0]}/${partes[1]}`;

    }

    return data;

}

/* =====================================================
   CRIAR LINHA
===================================================== */

function criarLinha(item = {

    inicio:"",
    fim:"",
    horario:"",
    aviso:"15",
    periodo:"",
    acao:"",
    responsavel:""

}){

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

    td.forEach(campo=>{

        campo.contentEditable = !modoTV;

        if(!modoTV){

            campo.addEventListener("input",agendarSalvar);

            campo.addEventListener("blur",()=>{

                atualizarIndicadores();

                monitorarEventos();

            });

            campo.addEventListener("keydown",e=>{

                if(e.key==="Enter"){

                    e.preventDefault();

                    campo.blur();

                }

            });

        }

    });

    tbody.appendChild(tr);

}

/* =====================================================
   ADICIONAR / REMOVER LINHA
===================================================== */

function adicionarLinha(){

    criarLinha();

    atualizarIndicadores();

    monitorarEventos();

    agendarSalvar();

}

function removerLinha(){

    const linhas = tbody.querySelectorAll("tr");

    if(linhas.length===0) return;

    linhas[linhas.length-1].remove();

    atualizarIndicadores();

    monitorarEventos();

    agendarSalvar();

}

if(!modoTV && btnAdicionarLinha && btnRemoverLinha){

    btnAdicionarLinha.addEventListener("click",adicionarLinha);

    btnRemoverLinha.addEventListener("click",removerLinha);

}

/* =====================================================
   LER TABELA
===================================================== */

function lerTabela(){

    const agenda=[];

    tbody.querySelectorAll("tr").forEach(tr=>{

        const td=tr.querySelectorAll("td");

        agenda.push({

            inicio:td[0].textContent.trim(),

            fim:td[1].textContent.trim(),

            horario:td[2].textContent.trim(),

            aviso:td[3].textContent.trim() || "15",

            periodo:td[4].textContent.trim(),

            acao:td[5].textContent.trim(),

            responsavel:td[6].textContent.trim()

        });

    });

    return agenda;

}

/* =====================================================
   SALVAR
===================================================== */

function agendarSalvar(){

    clearTimeout(timeoutSalvar);

    timeoutSalvar = setTimeout(()=>{

        salvarFirebase();

    },500);

}

async function salvarFirebase(){

    if(salvando) return;

    salvando = true;

    try{

        const agenda = lerTabela();

        ultimaVersao = JSON.stringify(agenda);

        await setDoc(agendaRef,{

            agenda,

            atualizadoEm:new Date().toISOString()

        });

    }catch(erro){

        console.error(erro);

    }

    salvando=false;

}

/* =====================================================
   FIREBASE
===================================================== */

onSnapshot(agendaRef,async(snapshot)=>{

    if(!snapshot.exists()){

        await setDoc(agendaRef,{

            agenda:[],

            atualizadoEm:new Date().toISOString()

        });

        return;

    }

    const dados = snapshot.data();

    const agenda = dados.agenda || [];

    const json = JSON.stringify(agenda);

    if(json===ultimaVersao) return;

    ultimaVersao = json;

    desenharTabela(agenda);

});

function desenharTabela(lista){

    const hoje = hojeZero();

    lista.sort((a,b)=>{

        const inicioA = converterData(a.inicio);
        const fimA = converterData(a.fim);

        const inicioB = converterData(b.inicio);
        const fimB = converterData(b.fim);

        const hojeA =
            inicioA && fimA &&
            hoje >= inicioA &&
            hoje <= fimA;

        const hojeB =
            inicioB && fimB &&
            hoje >= inicioB &&
            hoje <= fimB;

        if(hojeA && !hojeB) return -1;
        if(!hojeA && hojeB) return 1;

        const futuroA = inicioA && inicioA >= hoje;
        const futuroB = inicioB && inicioB >= hoje;

        if(futuroA && !futuroB) return -1;
        if(!futuroA && futuroB) return 1;

        return inicioA - inicioB;

    });

    tbody.innerHTML="";

    lista.forEach(item=>criarLinha(item));

    destacarEventos();
    colorirLinhas();
    atualizarIndicadores();

    monitorarEventos();

}
function destacarEventos(){

    const hoje = hojeZero();

    tbody.querySelectorAll("tr").forEach(tr=>{

        tr.classList.remove("evento-hoje");

        const td = tr.querySelectorAll("td");

        const inicio = converterData(td[0].textContent);

        const fim = converterData(td[1].textContent);

        if(!inicio || !fim) return;

        if(hoje >= inicio && hoje <= fim){

            tr.classList.add("evento-hoje");

        }

    });

}
function atualizarIndicadores(){

    const linhas = tbody.querySelectorAll("tr");

    totalEventos.textContent = linhas.length;

    const hoje = hojeZero();

    let eventosAtivos = 0;

    const responsaveis = new Set();

    linhas.forEach(tr=>{

        const td = tr.querySelectorAll("td");

        const inicio = converterData(td[0].textContent);

        const fim = converterData(td[1].textContent);

        if(inicio && fim){

            if(hoje >= inicio && hoje <= fim){

                eventosAtivos++;

            }

        }

        if(td[6].textContent.trim()){

            responsaveis.add(
                td[6].textContent.trim()
            );

        }

    });

    eventosHoje.textContent = eventosAtivos;

    totalResponsaveis.textContent =
        responsaveis.size;

}
function monitorarEventos(){

    const agora = new Date();

    let proximo = null;

    let menorTempo = Infinity;

    tbody.querySelectorAll("tr").forEach(tr=>{

        tr.classList.remove("evento-urgente");

        const td = tr.querySelectorAll("td");

        const inicio = converterDataHora(
            td[0].textContent.trim(),
            td[2].textContent.trim()
        );

        if(!inicio) return;

        const diferenca = inicio - agora;

        if(diferenca >= 0 && diferenca < menorTempo){

            menorTempo = diferenca;

            proximo = {

                linha:tr,

                titulo:td[5].textContent.trim(),

                horario:td[2].textContent.trim(),

                aviso:parseInt(td[3].textContent.trim() || "15"),

                inicio:inicio

            };

        }

    });

    if(!proximo){

        proximoEvento.textContent="Sem eventos";

        textoBarra.textContent="Nenhum evento programado.";

        return;

    }

    proximoEvento.textContent = formatarTempo(menorTempo);

    textoBarra.textContent =
        `Próximo evento: ${proximo.titulo} • ${proximo.horario} • Faltam ${formatarTempo(menorTempo)}`;

    if(menorTempo <= 300000){

        proximo.linha.classList.add("evento-urgente");

    }

    dispararAviso(proximo);

}
function dispararAviso(evento){

    const agora = new Date();

    const restante = Math.ceil(
        (evento.inicio-agora)/60000
    );

    if(restante !== evento.aviso) return;

    const chave =
        evento.titulo +
        evento.horario +
        evento.inicio.toDateString();

    if(chave === ultimoAviso) return;

    ultimoAviso = chave;

    tituloEvento.textContent = evento.titulo;

    horaEvento.textContent =
        "Início às " + evento.horario;

    contadorEvento.textContent =
        "Faltam " + evento.aviso + " minutos";

    alertaEvento.style.display="flex";

    tocarSom();

    setTimeout(()=>{

        alertaEvento.style.display="none";

    },15000);

}
function tocarSom(){

    const audio = new Audio("alerta.mp3");

    audio.volume = 1;

    audio.play().catch(()=>{

        console.log("Som bloqueado pelo navegador.");

    });

    setTimeout(()=>{

        audio.pause();

        audio.currentTime = 0;

    },3000);

}
setInterval(monitorarEventos,5000);

function colorirLinhas(){

    const hoje = hojeZero();

    tbody.querySelectorAll("tr").forEach(tr=>{

        tr.classList.remove(
            "periodo-manha",
            "periodo-tarde",
            "periodo-noite",
            "periodo-integral",
            "evento-passado"
        );

        const td = tr.querySelectorAll("td");

        const periodo = td[4].textContent
            .trim()
            .toLowerCase();

        if(periodo.includes("manhã"))
            tr.classList.add("periodo-manha");

        if(periodo.includes("tarde"))
            tr.classList.add("periodo-tarde");

        if(periodo.includes("noite"))
            tr.classList.add("periodo-noite");

        if(periodo.includes("integral"))
            tr.classList.add("periodo-integral");

        const fim = converterData(td[1].textContent);

        if(fim && fim < hoje){

            tr.classList.add("evento-passado");

        }

    });



}

/* =====================================================
   RECARREGAMENTO AUTOMÁTICO (MODO TV)
===================================================== */

if (modoTV) {

    // Recarrega a página a cada 15 minutos
    setInterval(() => {

        console.log("Recarregando painel...");

        location.replace(location.href);

    }, 15 * 60 * 1000);

}

/* ===========================
   NOTÍCIAS G1 NO TICKER
=========================== */

const RSS_G1 = 'https://g1.globo.com/rss/g1/educacao/';

async function carregarNoticiasG1() {
    try {
        const url = 'https://api.rss2json.com/v1/api.json?rss_url=' + encodeURIComponent(RSS_G1);
        const resposta = await fetch(url);

        if (!resposta.ok) {
            throw new Error('Status ' + resposta.status);
        }

        const dados = await resposta.json();

        if (dados.status !== 'ok' || !dados.items?.length) {
            throw new Error('Feed vazio ou status: ' + dados.status);
        }

        const manchetes = dados.items
            .slice(0, 8)
            .map(item => item.title?.trim())
            .filter(Boolean);

        if (manchetes.length) {
            document.getElementById('avisos').textContent =
                manchetes.map(m => `📰 ${m}`).join('     •     ');
            console.log('Notícias G1 carregadas:', manchetes.length);
        }
    } catch (erro) {
        console.log('Não foi possível carregar notícias do G1:', erro.message);
    }
}

carregarNoticiasG1();
setInterval(carregarNoticiasG1, 10 * 60 * 1000);
