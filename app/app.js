const WS_URL = 'ws://localhost:8080';
let ws;
let currentUsername = 'Usuario';
const typingDiv = document.getElementById('typing');
let typingTimeout;


const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('messageInput');
const sendButton = document.getElementById('sendButton');
const usernameInput = document.getElementById('username');

function connect() {
  // Crear conexión WebSocket
  console.log('🔌 Conectando a WebSocket...');
  ws = new WebSocket(WS_URL);
  
  // Cuando se conecta...
    ws.onopen = () => {
        console.log('✅ Conectado al servidor');
        ws.send(JSON.stringify({
            type: 'setUsername',
            username: currentUsername
        }));
    };
  
  // Cuando llega un mensaje...
  ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('RECIBIDO:', event.data);

  // TIPO 1: Indicador de "escribiendo..."

  if (data.type === 'typing') {
      if (data.username) {
        typingDiv.textContent = `${data.username} está escribiendo...`;
        
        // Limpiar después de 1.5 segundos
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
          typingDiv.textContent = '';
        }, 1500);
      } else {
        // Si username es null, limpiar inmediatamente
        typingDiv.textContent = '';
      }
    }

  if (data.type === 'chat') {
      // Limpiar indicador de escritura
      typingDiv.textContent = '';
      clearTimeout(typingTimeout);
      
      // Mostrar mensaje
      displayMessage(data.data);
    }
};

  
  // Si se desconecta...
  ws.onclose = () => {
    console.log('Desconectado');
    // Reconectar después de 3 segundos
    setTimeout(connect, 3000);
    typingDiv.textContent = '🔴 Desconectado - Reconectando...';
     // Reconectar después de 3 segundos
    setTimeout(connect, 3000);
  };

  // Errores
  ws.onerror = (error) => {
    console.error('❌ Error en WebSocket:', error);
  };
}

// Iniciar conexión
connect();

// ============================================
// ENVIAR MENSAJE
// ============================================

function sendMessage() {
  const text = messageInput.value.trim();
  
  if (!text) return; // No enviar mensajes vacíos
  
  if (ws.readyState === WebSocket.OPEN) {
    // Crear objeto del mensaje
    const message = {
      type: 'chat',
      text: text
    };
    
    console.log('📤 Enviando:', message);
    
    // Enviar como JSON
    ws.send(JSON.stringify(message));
    
    // Limpiar input
    messageInput.value = '';
    messageInput.focus();
  } else {
    console.warn('⚠️ WebSocket no está conectado');
    typingDiv.textContent = '⚠️ No conectado al servidor';
  }
}

// ============================================
// EVENT LISTENERS
// ============================================

// Escuchar clic en botón
sendButton.addEventListener('click', sendMessage);

// Escuchar tecla Enter
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendMessage();
  }
});

// Indicador de "escribiendo..."
let lastTypingNotification = 0;

messageInput.addEventListener('input', () => {
  const now = Date.now();

  // Solo enviar notificación cada 500ms (evitar spam)
  if (ws.readyState === WebSocket.OPEN && now - lastTypingNotification > 500) {
    ws.send(JSON.stringify({
      type: 'typing'
    }));
    
    lastTypingNotification = now;
  }
});

// ============================================
// MOSTRAR MENSAJES
// ============================================

function displayMessage(message) {
  const messageDiv = document.createElement('div');

  if (message.username === currentUsername) {
    className = 'message me';
  } else if (message.username === '🤖 Aideijo') {  // ✅ CORREGIDO
    className = 'message bot';
  } else if (message.username === '⚙️ Sistema') {
    className = 'message system';
  }

  messageDiv.className = className;

  const time = new Date(message.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  });


  messageDiv.innerHTML = `
    <strong>${escapeHtml(message.username)}</strong><br>
    ${escapeHtml(message.text)}
    <span class="time">${time}</span>
  `;

  messagesContainer.appendChild(messageDiv);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}


// Función para escapar HTML (previene XSS) seguridad

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

//cambiar nombre de usuario

usernameInput.addEventListener('change', (e) => {
  const newName = e.target.value.trim() || 'Usuario';
  currentUsername = newName;

  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'setUsername',
      username: currentUsername
    }));
  }
});

// ============================================
// SEGURIDAD
// ============================================

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ============================================
// DEBUG
// ============================================

// Mostrar estado de conexión en consola
setInterval(() => {
  const estados = {
    0: 'CONNECTING',
    1: 'OPEN',
    2: 'CLOSING',
    3: 'CLOSED'
  };
  
  if (ws && estados[ws.readyState] !== 'OPEN') {
    console.log(`📊 Estado WebSocket: ${estados[ws.readyState]}`);
  }
}, 5000);

/* Flujo completo de un mensaje
```
1. Usuario A escribe "Hola"
   ↓
2. Cliente A: sendMessage()
   ↓
3. WebSocket: envía JSON al servidor
   ↓
4. Servidor: recibe en ws.on('message')
   ↓
5. Servidor: guarda en base de datos
   ↓
6. Servidor: broadcast() a todos los clientes
   ↓
7. Cliente A y B: reciben en ws.onmessage
   ↓
8. Cliente A y B: displayMessage()
   ↓
9. ¡El mensaje aparece en ambas pantallas!
*/