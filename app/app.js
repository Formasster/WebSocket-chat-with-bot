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
  ws = new WebSocket(WS_URL);

  
  // Cuando se conecta...
    ws.onopen = () => {
        ws.send(JSON.stringify({
            type: 'setUsername',
            username: currentUsername
        }));
    };

  
  // Cuando llega un mensaje...
  ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('RECIBIDO:', event.data);

  if (data.type === 'typing') {
    typingDiv.textContent = `${data.username} está escribiendo...`;

    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      typingDiv.textContent = '';
    }, 1500);
  }

  if (data.type === 'chat') {
    typingDiv.textContent = '';
    displayMessage(data.data);
  }
};

  
  // Si se desconecta...
  ws.onclose = () => {
    console.log('Desconectado');
    // Reconectar después de 3 segundos
    setTimeout(connect, 3000);
  };
}

// Iniciar conexión
connect();

function sendMessage() {
  const text = messageInput.value.trim();
  
  // Verificar que hay texto y conexión abierta
  if (text && ws.readyState === WebSocket.OPEN) {
    // Crear objeto del mensaje
    const message = {
      type: 'chat',
      text: text
    };
    
    // Enviar como JSON
    ws.send(JSON.stringify(message));
    
    // Limpiar input
    messageInput.value = '';
  }
}

// Escuchar clic en botón
sendButton.addEventListener('click', sendMessage);

// Escuchar tecla Enter
messageInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    sendMessage();
  }
});

messageInput.addEventListener('input', () => {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'typing'
    }));
  }
});



function displayMessage(message) {
  const messageDiv = document.createElement('div');

  let className = 'message other';
  if (message.username === currentUsername) className = 'message me';
  if (message.username === 'Bot') className = 'message bot';

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