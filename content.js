let ultimoChatId = null;

// ==========================================
// EXTRAI O CHAT DA URL
// ==========================================

function obterChatId() {
  try {
    const url = new URL(window.location.href);

    return url.searchParams.get("chat");
  } catch (erro) {
    return null;
  }
}

// ==========================================
// TENTA IDENTIFICAR O NOME DO CLIENTE
// ==========================================

function obterNomeCliente() {
  /*
   * Primeiro tentamos elementos que normalmente
   * representam o atendimento ativo.
   */

  const seletores = [
    '[aria-current="page"]',
    '[data-active="true"]',
    ".active",
    ".selected",
    '[class*="selected"]',
    '[class*="active"]',
  ];

  for (const seletor of seletores) {
    const elementos = document.querySelectorAll(seletor);

    for (const elemento of elementos) {
      const texto = elemento.innerText?.trim();

      if (texto && texto.length > 1 && texto.length < 100) {
        const linhas = texto
          .split("\n")
          .map((linha) => linha.trim())
          .filter(Boolean);

        if (linhas.length > 0) {
          /*
           * Normalmente o nome aparece
           * nas primeiras linhas do chat.
           */

          return linhas[0];
        }
      }
    }
  }

  /*
   * Como alternativa, usamos o título da página.
   */

  const titulo = document.title?.trim();

  if (titulo && titulo.length > 0 && !titulo.toLowerCase().includes("huggy")) {
    return titulo;
  }

  return "";
}

// ==========================================
// ENVIA O CHAT PARA O BACKGROUND
// ==========================================

function verificarChat() {
  const chatId = obterChatId();

  if (!chatId) {
    return;
  }

  if (chatId === ultimoChatId) {
    return;
  }

  ultimoChatId = chatId;

  /*
   * Pequeno atraso para permitir que a interface
   * do Huggy atualize o nome do cliente.
   */

  setTimeout(() => {
    const clienteNome = obterNomeCliente();

    chrome.runtime.sendMessage({
      type: "HUGGY_CHAT_CHANGED",
      chatId: chatId,
      clienteNome: clienteNome,
    });
  }, 300);
}

// ==========================================
// OBSERVA ALTERAÇÕES DE URL
// ==========================================

const pushStateOriginal = history.pushState;

history.pushState = function (...args) {
  pushStateOriginal.apply(history, args);

  setTimeout(verificarChat, 100);
};

const replaceStateOriginal = history.replaceState;

history.replaceState = function (...args) {
  replaceStateOriginal.apply(history, args);

  setTimeout(verificarChat, 100);
};

window.addEventListener("popstate", () => {
  setTimeout(verificarChat, 100);
});

// ==========================================
// OBSERVA CLIQUES
// ==========================================

document.addEventListener("click", () => {
  setTimeout(verificarChat, 300);
});

// ==========================================
// OBSERVAÇÃO ADICIONAL DO DOM
// ==========================================

const observer = new MutationObserver(() => {
  verificarChat();
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

// Primeira verificação

verificarChat();

function obterChatsDaLista() {
  const ids = new Set();

  /*
   * O Huggy mostra o ID do chat abaixo do nome.
   * Procuramos qualquer texto que contenha somente números
   * com pelo menos 6 dígitos.
   */

  const elementos = document.querySelectorAll("div, span, p");

  elementos.forEach((elemento) => {
    const texto = elemento.textContent?.trim();

    if (!texto) return;

    const encontrado = texto.match(/ID-(\d+)/);

    if (encontrado) {
      ids.add(encontrado[1]);
    }
  });

  return [...ids];
}

chrome.runtime.onMessage.addListener((mensagem, sender, sendResponse) => {
  if (mensagem.type === "OBTER_LISTA_CHATS") {
    sendResponse({
      chats: obterChatsDaLista(),
    });

    return true;
  }
});
