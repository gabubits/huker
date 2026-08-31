const chatInfo = document.getElementById("chatInfo");

const clienteCodigo = document.getElementById("clienteCodigo");

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

  status.className = erro
    ? "status show status-error"
    : "status show status-success";

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
        <strong>Código do cliente:</strong>
        ${chatAtual.clienteCodigo || "Não associado"}
    `;

  if (chatAtual.clienteCodigo) {
    clienteCodigo.value = chatAtual.clienteCodigo;
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

  const codigo = clienteCodigo.value.trim();

  const resposta = await chrome.runtime.sendMessage({
    type: "ASSOCIAR_JANELA",
    chatId: chatAtual.chatId,
    windowId: janelaAtual.id,
    clienteCodigo: codigo,
  });

  if (resposta?.sucesso) {
    chatAtual.clienteCodigo = codigo;

    mostrarStatus(`Chat ${chatAtual.chatId} associado com sucesso.`);

    await carregarLista();
  } else {
    mostrarStatus("Não foi possível associar a janela.", true);
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

  const resposta = await chrome.runtime.sendMessage({
    type: "REMOVER_ASSOCIACAO",
    chatId: chatAtual.chatId,
  });

  if (resposta?.sucesso) {
    mostrarStatus(
      `Todas as janelas do chat ${chatAtual.chatId} foram desassociadas e fechadas.`,
    );
  } else {
    mostrarStatus("Não foi possível remover a associação.", true);
  }

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
      return (b[1].atualizadoEm || 0) - (a[1].atualizadoEm || 0);
    })
    .forEach(([chatId, dados]) => {
      const item = document.createElement("div");

      item.className = "association-item";

      const janelas = Array.isArray(dados.windows)
        ? dados.windows
        : dados.windowId != null
          ? [{ windowId: dados.windowId }]
          : [];

      item.innerHTML = `
                <div class="association-row">
                    <div class="association-info">
                        <strong class="association-name">
                            ${dados.clienteCodigo || "Código não informado"}
                        </strong>

                        <div class="association-details">
                            Chat: ${chatId}
                            <br>
                            ${janelas.length}
                            ${janelas.length === 1 ? "janela associada" : "janelas associadas"}
                        </div>
                    </div>

                    <div class="association-actions">
                        <button
                            type="button"
                            data-codigo="${dados.clienteCodigo || ""}"
                            data-chat="${chatId}"
                            class="btn-icon abrirAtendimento"
                            title="Abrir atendimento"
                            aria-label="Abrir atendimento"
                        >
                            📂
                        </button>

                        <button
                            type="button"
                            data-chat="${chatId}"
                            class="btn-icon removerLista"
                            title="Desassociar"
                            aria-label="Desassociar"
                        >
                            🗑️
                        </button>
                    </div>
                </div>
            `;

      lista.appendChild(item);
    });

  document.querySelectorAll(".removerLista").forEach((botao) => {
    botao.addEventListener("click", async () => {
      const chatId = botao.dataset.chat;

      const resposta = await chrome.runtime.sendMessage({
        type: "REMOVER_ASSOCIACAO",
        chatId: chatId,
      });

      if (resposta?.sucesso) {
        mostrarStatus(`Todas as janelas do chat ${chatId} foram fechadas.`);
      } else {
        mostrarStatus("Não foi possível remover as janelas.", true);
      }

      await carregarLista();
    });
  });
}

// ==========================================
// SINCRONIZAÇÃO
// ==========================================

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

async function obterProtocoloUltimoAtendimento(codigoCliente, chatId) {
  const resposta = await fetch(
    `https://intranetclt01.mgconecta.com.br:8443/atendimento_historico_fechado.php?id=${encodeURIComponent(codigoCliente)}`,
    {
      credentials: "include",
    },
  );

  if (!resposta.ok) {
    throw new Error(`Falha ao buscar histórico: ${resposta.status}`);
  }

  const html = await resposta.text();
  const documento = new DOMParser().parseFromString(html, "text/html");
  const descricaoEsperada = `Huggy - Protocolo ${chatId}`;

  return [...documento.querySelectorAll('td[width="500"]')]
    .filter((tdChamado) => {
      const descricao = [...tdChamado.querySelectorAll("tr")]
        .find((tr) =>
          tr.querySelector("th")?.textContent.trim().startsWith("Descri"),
        )
        ?.querySelector("td")
        ?.textContent.trim();

      return descricao === descricaoEsperada;
    })
    .map((tdChamado) =>
      [...tdChamado.querySelectorAll("tr")]
        .find((tr) =>
          tr.querySelector("th")?.textContent.trim().startsWith("N"),
        )
        ?.querySelector("td strong")
        ?.textContent.trim(),
    )
    .find(Boolean);
}

async function abrirAtendimento(codigoCliente, chatId) {
  if (!codigoCliente) {
    mostrarStatus("Código do cliente não informado.", true);
    return;
  }

  try {
    mostrarStatus("Buscando último atendimento...");

    const protocolo = await obterProtocoloUltimoAtendimento(
      codigoCliente,
      chatId,
    );

    if (!protocolo) {
      mostrarStatus("Nenhum atendimento encontrado para este chat.", true);
      return;
    }

    await chrome.runtime.sendMessage({
      type: "ABRIR_ATENDIMENTO",
      protocolo: protocolo,
      chatId: chatId,
      clienteCodigo: codigoCliente,
    });

    mostrarStatus("Atendimento aberto em uma nova janela.");
  } catch (erro) {
    console.error(erro);
    mostrarStatus(
      erro.message || "Não foi possível abrir o atendimento.",
      true,
    );
  }
}

lista.addEventListener("click", async (evento) => {
  const botao = evento.target.closest(".abrirAtendimento");

  if (!botao) {
    return;
  }

  await abrirAtendimento(botao.dataset.codigo, botao.dataset.chat);
});
