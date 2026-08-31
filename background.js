const STORAGE_ASSOCIACOES = "associacoes";
const STORAGE_CHAT_ATUAL = "chatAtual";
const STORAGE_ULTIMO_CHAT = "ultimoChatId";
const STORAGE_CONFIG_JANELA = "configJanela";

// ==========================================
// RECEBE ALTERAÇÕES DO HUGGY
// ==========================================

chrome.runtime.onMessage.addListener((mensagem, sender) => {
  if (mensagem.type === "HUGGY_CHAT_CHANGED") {
    processarChatHuggy(mensagem.chatId, "", sender.tab);
  }
});

// ==========================================
// PROCESSA O CHAT ATUAL
// ==========================================

async function processarChatHuggy(chatId, clienteCodigo, tab) {
  if (!chatId) {
    return;
  }

  const dados = await chrome.storage.local.get(STORAGE_ASSOCIACOES);
  const associacoes = dados[STORAGE_ASSOCIACOES] || {};
  const associacao = normalizarAssociacao(associacoes[chatId]);
  const codigoAssociado = associacao?.clienteCodigo || "";

  const chatAtual = {
    chatId: chatId,
    clienteCodigo: clienteCodigo || codigoAssociado || "",
    tabId: tab?.id || null,
    atualizadoEm: Date.now(),
  };

  await chrome.storage.local.set({
    [STORAGE_CHAT_ATUAL]: chatAtual,
    [STORAGE_ULTIMO_CHAT]: chatId,
  });

  console.log("Chat Huggy detectado:", chatAtual);

  await focarAssociacao(chatId);
}

// ==========================================
// NORMALIZA UMA ASSOCIAÇÃO
// Mantém compatibilidade com associações antigas
// de uma única janela.
// ==========================================

function normalizarAssociacao(associacao) {
  if (!associacao) {
    return null;
  }

  if (Array.isArray(associacao.windows)) {
    return {
      ...associacao,
      windows: associacao.windows.filter(
        (janela) => janela && janela.windowId != null,
      ),
    };
  }

  if (associacao.windowId != null) {
    return {
      ...associacao,
      windows: [
        {
          windowId: associacao.windowId,
          criadoEm: associacao.criadoEm || Date.now(),
        },
      ],
    };
  }

  return {
    ...associacao,
    windows: [],
  };
}

// ==========================================
// FOCA A JANELA ASSOCIADA
// ==========================================

async function focarAssociacao(chatId) {
  const dados = await chrome.storage.local.get(STORAGE_ASSOCIACOES);

  const associacoes = dados[STORAGE_ASSOCIACOES] || {};

  let associacao = normalizarAssociacao(associacoes[chatId]);

  if (!associacao || associacao.windows.length === 0) {
    console.log(`Chat ${chatId} não possui janela associada.`);
    return;
  }

  let alterado = false;

  // Remove referências a janelas que já não existem.
  const janelasValidas = [];

  for (const janela of associacao.windows) {
    try {
      const janelaChrome = await chrome.windows.get(janela.windowId);

      if (janelaChrome?.id != null) {
        janelasValidas.push(janela);
      }
    } catch (erro) {
      console.warn(
        `A janela ${janela.windowId} do chat ${chatId} não existe mais.`,
      );

      alterado = true;
    }
  }

  associacao.windows = janelasValidas;

  if (associacao.windows.length === 0) {
    delete associacoes[chatId];
    alterado = true;
  } else {
    associacoes[chatId] = associacao;
  }

  if (alterado) {
    await chrome.storage.local.set({
      [STORAGE_ASSOCIACOES]: associacoes,
    });
  }

  for (const janela of associacao.windows) {
    try {
      const janelaChrome = await chrome.windows.get(janela.windowId);

      if (janelaChrome.state === "minimized") {
        await chrome.windows.update(janela.windowId, {
          state: "normal",
        });
      }

      await chrome.windows.update(janela.windowId, {
        focused: true,
      });

      console.log(
        `Chat ${chatId}: janela ${janela.windowId} trazida para frente.`,
      );
    } catch (erro) {
      console.warn(`Não foi possível focar a janela ${janela.windowId}.`, erro);
    }
  }
}

// ==========================================
// ASSOCIA UMA JANELA AO CHAT
// ==========================================

async function associarJanela(chatId, windowId, clienteCodigo = "") {
  if (!chatId || windowId == null) {
    return false;
  }

  const dados = await chrome.storage.local.get(STORAGE_ASSOCIACOES);

  const associacoes = dados[STORAGE_ASSOCIACOES] || {};

  let associacao = normalizarAssociacao(associacoes[chatId]);

  if (!associacao) {
    associacao = {
      clienteCodigo: clienteCodigo,
      windows: [],
      criadoEm: Date.now(),
      atualizadoEm: Date.now(),
    };
  }

  if (clienteCodigo) {
    associacao.clienteCodigo = clienteCodigo;
  }

  // Evita duplicar a mesma janela no mesmo chat.
  const jaAssociada = associacao.windows.some(
    (janela) => janela.windowId === windowId,
  );

  if (jaAssociada) {
    // Salva no formato novo mesmo se era uma associação antiga.
    associacoes[chatId] = associacao;

    const atualizacaoStorage = {
      [STORAGE_ASSOCIACOES]: associacoes,
    };

    const dadosChatAtual = await chrome.storage.local.get(STORAGE_CHAT_ATUAL);
    const chatAtual = dadosChatAtual[STORAGE_CHAT_ATUAL];

    if (chatAtual?.chatId === chatId) {
      atualizacaoStorage[STORAGE_CHAT_ATUAL] = {
        ...chatAtual,
        clienteCodigo: associacao.clienteCodigo || "",
        atualizadoEm: Date.now(),
      };
    }

    await chrome.storage.local.set(atualizacaoStorage);

    console.log(`Chat ${chatId} já possui a janela ${windowId} associada.`);

    return true;
  }

  associacao.windows.push({
    windowId: windowId,
    criadoEm: Date.now(),
  });

  associacao.atualizadoEm = Date.now();

  associacoes[chatId] = associacao;

  const atualizacaoStorage = {
    [STORAGE_ASSOCIACOES]: associacoes,
  };

  const dadosChatAtual = await chrome.storage.local.get(STORAGE_CHAT_ATUAL);
  const chatAtual = dadosChatAtual[STORAGE_CHAT_ATUAL];

  if (chatAtual?.chatId === chatId) {
    atualizacaoStorage[STORAGE_CHAT_ATUAL] = {
      ...chatAtual,
      clienteCodigo: associacao.clienteCodigo || "",
      atualizadoEm: Date.now(),
    };
  }

  await chrome.storage.local.set(atualizacaoStorage);

  console.log(`Associação criada: Chat ${chatId} → Janela ${windowId}`);

  return true;
}

// ==========================================
// REMOVE TODAS AS JANELAS DE UM CHAT
// ==========================================

async function removerAssociacao(chatId) {
  const dados = await chrome.storage.local.get(STORAGE_ASSOCIACOES);

  const associacoes = dados[STORAGE_ASSOCIACOES] || {};

  const associacao = normalizarAssociacao(associacoes[chatId]);

  if (!associacao) {
    return true;
  }

  for (const janela of associacao.windows) {
    try {
      await chrome.windows.remove(janela.windowId);
      console.log(`Janela ${janela.windowId} fechada.`);
    } catch (erro) {
      console.log(`A janela ${janela.windowId} já estava fechada.`);
    }
  }

  delete associacoes[chatId];

  await chrome.storage.local.set({
    [STORAGE_ASSOCIACOES]: associacoes,
  });

  return true;
}

async function abrirAtendimento(protocolo, chatId, clienteCodigo = "") {
  if (!protocolo) {
    return false;
  }

  const janela = await chrome.windows.create({
    url: `https://intranetclt01.mgconecta.com.br:8443/atendimento_iniciar_new.php?id=${encodeURIComponent(protocolo)}`,
    focused: true,
  });

  if (chatId && janela?.id != null) {
    await associarJanela(chatId, janela.id, clienteCodigo);
  }

  return true;
}

// ==========================================
// MENSAGENS DO POPUP
// ==========================================

chrome.runtime.onMessage.addListener((mensagem, sender, sendResponse) => {
  if (mensagem.type === "ASSOCIAR_JANELA") {
    (async () => {
      const sucesso = await associarJanela(
        mensagem.chatId,
        mensagem.windowId,
        mensagem.clienteCodigo,
      );

      sendResponse({
        sucesso: sucesso,
      });
    })();

    return true;
  }

  if (mensagem.type === "REMOVER_ASSOCIACAO") {
    (async () => {
      const sucesso = await removerAssociacao(mensagem.chatId);

      sendResponse({
        sucesso: sucesso,
      });
    })();

    return true;
  }

  if (mensagem.type === "LISTAR_ASSOCIACOES") {
    (async () => {
      const dados = await chrome.storage.local.get(STORAGE_ASSOCIACOES);

      const associacoesOriginais = dados[STORAGE_ASSOCIACOES] || {};

      const associacoes = {};

      for (const chatId in associacoesOriginais) {
        const normalizada = normalizarAssociacao(associacoesOriginais[chatId]);

        if (normalizada) {
          associacoes[chatId] = normalizada;
        }
      }

      sendResponse({
        associacoes: associacoes,
      });
    })();

    return true;
  }

  if (mensagem.type === "OBTER_CHAT_ATUAL") {
    (async () => {
      const dados = await chrome.storage.local.get(STORAGE_CHAT_ATUAL);

      sendResponse({
        chatAtual: dados[STORAGE_CHAT_ATUAL] || null,
      });
    })();

    return true;
  }

  if (mensagem.type === "ABRIR_ATENDIMENTO") {
    (async () => {
      try {
        const sucesso = await abrirAtendimento(
          mensagem.protocolo,
          mensagem.chatId,
          mensagem.clienteCodigo,
        );

        sendResponse({
          sucesso: sucesso,
        });
      } catch (erro) {
        console.error(erro);

        sendResponse({
          sucesso: false,
          erro: erro.message,
        });
      }
    })();

    return true;
  }

  if (mensagem.type === "SINCRONIZAR_CHATS") {
    (async () => {
      try {
        const resultado = await sincronizarChatsHuggy();

        sendResponse({
          sucesso: true,
          fechados: resultado.fechados,
          mantidos: resultado.mantidos,
        });
      } catch (erro) {
        console.error(erro);

        sendResponse({
          sucesso: false,
          erro: erro.message,
        });
      }
    })();

    return true;
  }
});

// ==========================================
// ATALHO CTRL + SHIFT + A
// ==========================================

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "associar-janela") {
    return;
  }

  const dados = await chrome.storage.local.get(STORAGE_CHAT_ATUAL);

  const chatAtual = dados[STORAGE_CHAT_ATUAL];

  if (!chatAtual?.chatId) {
    console.warn("Nenhum chat Huggy foi identificado.");

    return;
  }

  const janela = await chrome.windows.getLastFocused();

  if (!janela?.id) {
    return;
  }

  await associarJanela(chatAtual.chatId, janela.id, chatAtual.clienteCodigo);

  console.log(
    `Atalho: Chat ${chatAtual.chatId} associado à janela ${janela.id}`,
  );
});

// ==========================================
// REMOVE ASSOCIAÇÕES DE JANELAS FECHADAS
// ==========================================

chrome.windows.onRemoved.addListener(async (windowId) => {
  const dados = await chrome.storage.local.get(STORAGE_ASSOCIACOES);

  const associacoes = dados[STORAGE_ASSOCIACOES] || {};

  let alterado = false;

  for (const chatId in associacoes) {
    const associacao = normalizarAssociacao(associacoes[chatId]);

    if (!associacao) {
      continue;
    }

    const quantidadeAntes = associacao.windows.length;

    associacao.windows = associacao.windows.filter(
      (janela) => janela.windowId !== windowId,
    );

    if (associacao.windows.length !== quantidadeAntes) {
      alterado = true;

      if (associacao.windows.length === 0) {
        delete associacoes[chatId];
      } else {
        associacao.atualizadoEm = Date.now();
        associacoes[chatId] = associacao;
      }

      console.log(
        `Janela ${windowId} removida da associação do chat ${chatId}.`,
      );
    }
  }

  if (alterado) {
    await chrome.storage.local.set({
      [STORAGE_ASSOCIACOES]: associacoes,
    });
  }
});

async function sincronizarChatsHuggy() {
  const tabs = await chrome.tabs.query({
    url: "https://www.huggy.app/panel/attendance/inbox/*",
  });

  if (!tabs.length) {
    throw new Error("Nenhuma aba do Huggy encontrada.");
  }

  const abaHuggy = tabs[0];

  const resposta = await chrome.tabs.sendMessage(abaHuggy.id, {
    type: "OBTER_LISTA_CHATS",
  });

  const chatsPresentes = new Set(resposta?.chats || []);

  console.log("Chats presentes:", [...chatsPresentes]);

  const dados = await chrome.storage.local.get(STORAGE_ASSOCIACOES);

  const associacoes = dados[STORAGE_ASSOCIACOES] || {};

  const fechados = [];
  const mantidos = [];

  for (const chatId in associacoes) {
    const associacao = normalizarAssociacao(associacoes[chatId]);

    if (!associacao) {
      continue;
    }

    if (chatsPresentes.has(chatId)) {
      mantidos.push(chatId);
      continue;
    }

    for (const janela of associacao.windows) {
      try {
        await chrome.windows.remove(janela.windowId);
      } catch (erro) {
        console.warn(
          `Janela ${janela.windowId} do chat ${chatId} já estava fechada.`,
        );
      }
    }

    fechados.push(chatId);

    delete associacoes[chatId];
  }

  await chrome.storage.local.set({
    [STORAGE_ASSOCIACOES]: associacoes,
  });

  return {
    fechados,
    mantidos,
  };
}
