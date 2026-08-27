const chatInfo = document.getElementById("chatInfo");

const clienteNome = document.getElementById("clienteNome");

const janelaInfo = document.getElementById("janelaInfo");

const botaoAssociar = document.getElementById("associar");

const botaoDesassociar = document.getElementById("desassociarAtual");

const lista = document.getElementById("lista");

const contador = document.getElementById("contador");

const status = document.getElementById("status");

const sincronizarChats = document.getElementById("sincronizarChats");

let chatAtual = null;
let janelaAtual = null;

// ==========================================
// STATUS
// ==========================================

function mostrarStatus(mensagem, erro = false) {
  status.textContent = mensagem;

  status.className = erro ? "status error" : "status show";

  setTimeout(() => {
    status.className = "status";
  }, 3000);
}

// ==========================================
// OBTÉM A JANELA ATUAL
// ==========================================

async function carregarJanelaAtual() {
  janelaAtual = await chrome.windows.getCurrent();

  if (!janelaAtual?.id) {
    janelaInfo.textContent = "Não foi possível identificar a janela.";

    return;
  }

  janelaInfo.textContent = `Janela atual: ${janelaAtual.id}`;
}

// ==========================================
// OBTÉM O CHAT ATUAL
// ==========================================

async function carregarChatAtual() {
  const resposta = await chrome.runtime.sendMessage({
    type: "OBTER_CHAT_ATUAL",
  });

  chatAtual = resposta?.chatAtual || null;

  if (!chatAtual?.chatId) {
    chatInfo.innerHTML = "Nenhum chat do Huggy identificado ainda.";

    return;
  }

  chatInfo.innerHTML = `
        <strong>Chat ID:</strong>
        ${chatAtual.chatId}
        <br>
        <strong>Cliente:</strong>
        ${chatAtual.clienteNome || "Não identificado"}
    `;

  if (chatAtual.clienteNome) {
    clienteNome.value = chatAtual.clienteNome;
  }
}

// ==========================================
// ASSOCIA JANELA
// ==========================================

botaoAssociar.addEventListener("click", async () => {
  if (!chatAtual?.chatId) {
    mostrarStatus("Nenhum chat Huggy selecionado.", true);

    return;
  }

  await carregarJanelaAtual();

  if (!janelaAtual?.id) {
    mostrarStatus("Não foi possível identificar a janela atual.", true);

    return;
  }

  const nome = clienteNome.value.trim();

  const resposta = await chrome.runtime.sendMessage({
    type: "ASSOCIAR_JANELA",
    chatId: chatAtual.chatId,
    windowId: janelaAtual.id,
    clienteNome: nome,
  });

  if (resposta?.sucesso) {
    chatAtual.clienteNome = nome;

    mostrarStatus(`Chat ${chatAtual.chatId} associado com sucesso.`);

    await carregarLista();
  }
});

// ==========================================
// REMOVE O CHAT ATUAL
// ==========================================

botaoDesassociar.addEventListener("click", async () => {
  if (!chatAtual?.chatId) {
    mostrarStatus("Nenhum chat identificado.", true);

    return;
  }

  await chrome.runtime.sendMessage({
    type: "REMOVER_ASSOCIACAO",
    chatId: chatAtual.chatId,
  });

  mostrarStatus(`Associação do chat ${chatAtual.chatId} removida.`);

  await carregarLista();
});

// ==========================================
// CARREGA LISTA
// ==========================================

async function carregarLista() {
  const resposta = await chrome.runtime.sendMessage({
    type: "LISTAR_ASSOCIACOES",
  });

  const associacoes = resposta?.associacoes || {};

  const chats = Object.entries(associacoes);

  contador.textContent = `${chats.length}`;

  lista.innerHTML = "";

  if (chats.length === 0) {
    lista.innerHTML = `
            <div class="vazio">
                Nenhum chat associado.
            </div>
        `;

    return;
  }

  chats
    .sort((a, b) => {
      return b[1].atualizadoEm - a[1].atualizadoEm;
    })
    .forEach(([chatId, dados]) => {
      const item = document.createElement("div");

      item.className = "associacao";

      item.innerHTML = `
                <strong>
                    ${dados.clienteNome || "Cliente não identificado"}
                </strong>

                <div class="detalhes">
                    Chat: ${chatId}
                    <br>
                    Janela: ${dados.windowId}
                </div>

                <button
                    data-chat="${chatId}"
                    class="removerLista"
                >
                    Desassociar
                </button>
            `;

      lista.appendChild(item);
    });

  document.querySelectorAll(".removerLista").forEach((botao) => {
    botao.addEventListener("click", async () => {
      const chatId = botao.dataset.chat;

      await chrome.runtime.sendMessage({
        type: "REMOVER_ASSOCIACAO",
        chatId: chatId,
      });

      mostrarStatus(`Chat ${chatId} desassociado.`);

      await carregarLista();
    });
  });
}

sincronizarChats.addEventListener("click", async () => {
  mostrarStatus("Verificando chats presentes no Huggy...");

  const resposta = await chrome.runtime.sendMessage({
    type: "SINCRONIZAR_CHATS",
  });

  if (!resposta?.sucesso) {
    mostrarStatus(resposta?.erro || "Erro ao sincronizar.", true);

    return;
  }

  const fechados = resposta.fechados || [];

  const mantidos = resposta.mantidos || [];

  mostrarStatus(
    `${fechados.length} janela(s) fechada(s). ${mantidos.length} chat(s) permanecem ativos.`,
  );

  await carregarLista();
});

// ==========================================
// INICIALIZA
// ==========================================

async function iniciar() {
  await carregarJanelaAtual();

  await carregarChatAtual();

  await carregarLista();
}

iniciar();
