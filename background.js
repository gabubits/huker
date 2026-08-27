const STORAGE_ASSOCIACOES = "associacoes";
const STORAGE_CHAT_ATUAL = "chatAtual";
const STORAGE_ULTIMO_CHAT = "ultimoChatId";
const STORAGE_CONFIG_JANELA = "configJanela";
// ==========================================
// RECEBE ALTERAÇÕES DO HUGGY
// ==========================================

chrome.runtime.onMessage.addListener((mensagem, sender) => {
  if (mensagem.type === "HUGGY_CHAT_CHANGED") {
    processarChatHuggy(mensagem.chatId, mensagem.clienteNome, sender.tab);
  }
});

// ==========================================
// PROCESSA O CHAT ATUAL
// ==========================================

async function processarChatHuggy(chatId, clienteNome, tab) {
  if (!chatId) {
    return;
  }

  const chatAtual = {
    chatId: chatId,
    clienteNome: clienteNome || "",
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
// FOCA A JANELA ASSOCIADA
// ==========================================

async function focarAssociacao(chatId) {
  const dados = await chrome.storage.local.get(STORAGE_ASSOCIACOES);

  const associacoes = dados[STORAGE_ASSOCIACOES] || {};

  const associacao = associacoes[chatId];

  if (!associacao) {
    console.log(`Chat ${chatId} não possui janela associada.`);

    return;
  }

  try {
    await chrome.windows.update(associacao.windowId, {
      focused: true,
    });

    console.log(`Chat ${chatId} focou a janela ${associacao.windowId}`);
  } catch (erro) {
    console.warn("A janela associada não existe mais.", erro);

    delete associacoes[chatId];

    await chrome.storage.local.set({
      [STORAGE_ASSOCIACOES]: associacoes,
    });
  }
}

// ==========================================
// ASSOCIA UMA JANELA AO CHAT
// ==========================================

async function associarJanela(chatId, windowId, clienteNome = "") {
  if (!chatId || !windowId) {
    return false;
  }

  const dados = await chrome.storage.local.get(STORAGE_ASSOCIACOES);

  const associacoes = dados[STORAGE_ASSOCIACOES] || {};

  associacoes[chatId] = {
    windowId: windowId,
    clienteNome: clienteNome,
    criadoEm: Date.now(),
    atualizadoEm: Date.now(),
  };

  await chrome.storage.local.set({
    [STORAGE_ASSOCIACOES]: associacoes,
  });

  console.log(`Associação criada: Chat ${chatId} → Janela ${windowId}`);

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
        mensagem.clienteNome,
      );

      sendResponse({
        sucesso: sucesso,
      });
    })();

    return true;
  }

  if (mensagem.type === "REMOVER_ASSOCIACAO") {
    (async () => {
      const dados = await chrome.storage.local.get(STORAGE_ASSOCIACOES);

      const associacoes = dados[STORAGE_ASSOCIACOES] || {};

      const associacao = associacoes[mensagem.chatId];

      if (associacao?.windowId) {
        try {
          await chrome.windows.remove(associacao.windowId);

          console.log(`Janela ${associacao.windowId} fechada.`);
        } catch (erro) {
          console.log(`A janela ${associacao.windowId} já estava fechada.`);
        }
      }

      delete associacoes[mensagem.chatId];

      await chrome.storage.local.set({
        [STORAGE_ASSOCIACOES]: associacoes,
      });

      sendResponse({
        sucesso: true,
      });
    })();

    return true;
  }

  if (mensagem.type === "LISTAR_ASSOCIACOES") {
    (async () => {
      const dados = await chrome.storage.local.get(STORAGE_ASSOCIACOES);

      sendResponse({
        associacoes: dados[STORAGE_ASSOCIACOES] || {},
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

  await associarJanela(chatAtual.chatId, janela.id, chatAtual.clienteNome);

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
    if (associacoes[chatId].windowId === windowId) {
      delete associacoes[chatId];

      alterado = true;

      console.log(
        `Associação do chat ${chatId} removida porque a janela foi fechada.`,
      );
    }
  }

  if (alterado) {
    await chrome.storage.local.set({
      [STORAGE_ASSOCIACOES]: associacoes,
    });
  }
});
