const WebSocket = require('ws');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();


async function askBot(question, username) {
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      text: question,
      user: username
    });

    const options = {
      hostname: '127.0.0.1',
      port: 8000,
      path: '/bot',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      }
    };

  const req = http.request(options, (res) => {
    console.log('status: ' + res.statusCode);

    if (res.statusCode !== 200) {
      reject(new Error('FastAPI no respondió bien'));
      return;
    }

    let data = '';
    res.on('data', chunk => {
      data += chunk;
    });
    res.on('end', () => {
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
  });

  req.on('error', (e) => {
    reject(e);
  });

  req.write(postData);
  req.end();
});
}

// ============================================
// CONFIGURAR BASE DE DATOS
// ============================================
const db = new sqlite3.Database('./chat.db', (err) => {
  if (err) {
    console.error('Error:', err);
  } else {
    console.log('✅ Base de datos conectada');
  }
});

// Crear tabla de mensajes si no existe
// PRIMARY KEY = Identificador único
// NOT NULL = Campo obligatorio

db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    text TEXT NOT NULL,
    timestamp TEXT NOT NULL
  )
`, (err) => {
  if (err) {
    console.error('Error creando tabla:', err);
  } else {
    console.log('Tabla de mensajes creada o ya existente');
  }
});

//FUNCIONES AUXILIARES

function generateClientId() {
  // Combina timestamp + texto aleatorio
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
// Ejemplo: "client_1707567890123_k3h8s9d2f"

function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}
// Ejemplo: "msg_1707567890456_p9x2m5n7k"



// 3. CREAR SERVIDORES HTTP Y WEBSOCKET
// --------------------------------------------
// Servidor HTTP básico (necesario para WebSocket)

const server = http.createServer();

// Servidor WebSocket vinculado al HTTP
const wss = new WebSocket.Server({ server });

// Map para guardar clientes conectados
// Estructura: { clientId: { ws: conexión, username: 'nombre' } }
const clients = new Map();

// Ejemplo de estructura de 'clients':

/*{
  'client_123': { ws: conexión1, username: 'Juan' },
  'client_456': { ws: conexión2, username: 'María' }
}
*/

console.log('Servidor de chat con SQLite');
console.log('Los mensajes se guardan en: chat.db');

// 4. MANEJAR NUEVAS CONEXIONES
// --------------------------------------------
// Se ejecuta cada vez que un cliente se conecta

wss.on('connection', (ws) => {//Es un "event listener" (escuchador de eventos)
//Se ejecuta cada vez que un cliente nuevo se conecta
  // ws = la conexión WebSocket de este cliente específico
  
  // 1. Generar ID único para este cliente
  const clientId = generateClientId();
  
  // 2. Guardarlo en nuestro Map
  clients.set(clientId, { 
    ws: ws,                // La conexión WebSocket
    username: 'Anónimo'    // Nombre por defecto
  });
  console.log(`Cliente conectado: ${clientId} (Total: ${clients.size})`);

  // Historial
    sendPreviousMessages(ws);

  // Cambiar nombre de usuario

  function handleSetUsername(clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;

  if (typeof message.username === 'string' && message.username.trim() !== '') {
    client.username = message.username.trim();
    console.log(`👤 Cliente ${clientId} ahora es: ${client.username}`);
  }
}

  
  // ESCUCHAR MENSAJES DE ESTE CLIENTE

  ws.on('message', (data) => {
    // data = lo que envió el cliente
    
    try {
      // 1. Convertir de JSON a objeto JavaScript
      const message = JSON.parse(data);
      
      // 2. Decidir qué hacer según el tipo
      if (message.type === 'setUsername') {
        // Cambiar nombre de usuario
        handleSetUsername(clientId, message);
      }
      
      if (message.type === 'chat') {
        // Nuevo mensaje de chat
        handleChatMessage(clientId, message);
      }

      if (message.type === 'typing') {
        handleTyping(clientId);
      }
      
    } catch (error) {
      console.error('Error procesando mensaje:', error);
    }
  });

  ws.on('close', () => {
  // Eliminar del Map de clientes
  clients.delete(clientId);
  console.log(`Cliente desconectado: ${clientId} (Total: ${clients.size})`);
  });

  ws.on('error', (error) => {
    console.error('Error en WebSocket:', error);
  });
  
});// FIN wss.on('connection', ...)

// ============================================
// FUNCIONES DE MANEJO DE MENSAJES
// ============================================

  function sendPreviousMessages(ws) {
  // Consultar últimos 50 mensajes de la base de datos
  db.all(
    'SELECT * FROM messages ORDER BY timestamp DESC LIMIT 50',
    [],
    (err, rows) => {
      if (err) {
        console.error('Error:', err);
        return;
      }
      
      // rows es un array de mensajes
      // Enviamos en orden cronológico (del más antiguo al más nuevo)
      rows.reverse().forEach(msg => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'chat',
            data: msg
          }));
        }
      });
      console.log(`📤 Enviados ${rows.length} mensajes de historial`);
    }
  );
}


// Manejar nuevo mensaje de chat

async function handleChatMessage(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !message.text) return;

  const text = message.text.trim();

  // ============================================
  // 🤖 COMANDO BOT
  // ============================================
  if (text.startsWith('/bot')) {
    const question = text.replace('/bot', '').trim();

    if (!question) {
      // Si escriben solo "/bot" sin pregunta
      sendSystemMessage('❗ Uso: /bot [tu pregunta]');
      return;
    }
    // Guardar pregunta del usuario
      const userMessage = {
        id: generateMessageId(),
        username: client.username,
        text: question,
        timestamp: new Date().toISOString()
      };

      db.run(
        'INSERT INTO messages (id, username, text, timestamp) VALUES (?, ?, ?, ?)',
        [userMessage.id, userMessage.username, userMessage.text, userMessage.timestamp]
      );

      broadcast(userMessage);

       // Mostrar "Bot está escribiendo..."
      broadcastTyping('🤖 Aideijo');

    try {

      console.log(`🤖 Pregunta al bot: "${question}" (de ${client.username})`);
      const botReply = await askBot(question, client.username);
      const typingDelay = botReply.typing_delay ?? 0;

      console.log(`✅ Bot respondió (delay: ${typingDelay}s)`);

      const botMessage = {
        id: generateMessageId(),
        username: '🤖 Aideijo',
        text: botReply.reply,
        timestamp: new Date().toISOString()
      };

      // Guardar respuesta del bot
      const sendBotMessage = () => {
        // Guardar en BD
        db.run(
          'INSERT INTO messages (id, username, text, timestamp) VALUES (?, ?, ?, ?)',
          [botMessage.id, botMessage.username, botMessage.text, botMessage.timestamp],
          (err) => {
            if (!err) {
              broadcast(botMessage);
              // Limpiar indicador de "escribiendo"
              clearTyping();
            }
          }
        );
      };

      // Si hay delay, esperar antes de enviar
        if (typingDelay > 0) {
          setTimeout(sendBotMessage, typingDelay * 1000);
        } else {
          sendBotMessage();
        }
      } catch (err) {
        console.error('❌ Error consultando bot:', err);

        const errorMessage = {
        id: generateMessageId(),
        username: '🤖 Aideijo',
        text: '❌ Lo siento, no pude conectarme con mi servidor. ¿Está corriendo FastAPI en puerto 8000?',
        timestamp: new Date().toISOString()
      };

      db.run(
        'INSERT INTO messages (id, username, text, timestamp) VALUES (?, ?, ?, ?)',
        [errorMessage.id, errorMessage.username, errorMessage.text, errorMessage.timestamp],
        (err) => {
          if (!err) {
            broadcast(errorMessage);
            clearTyping();
          }
        }
      );

      return; // ⛔ No seguir con el flujo normal

    }
  } else {
    // 👉 MENSAJE NORMAL
    const chatMessage = {
    id: generateMessageId(),
    username: client.username,
    text: text,
    timestamp: new Date().toISOString()
  };

  db.run(
    'INSERT INTO messages (id, username, text, timestamp) VALUES (?, ?, ?, ?)',
    [chatMessage.id, chatMessage.username, chatMessage.text, chatMessage.timestamp],
    (err) => {
      if (err) {
        console.error('❌ Error guardando mensaje:', err);
      } else {
        console.log(`💬 ${client.username}: ${text}`);
        broadcast(chatMessage);
      }
    }
  );
  }
}

// Función para manejar evento de "escribiendo..." y notificar a otros clientes

function handleTyping(clientId) {
  const client = clients.get(clientId);
  if (!client) return;

  // Enviar a todos EXCEPTO al que está escribiendo
  clients.forEach((c, cId) => {
    if (cId !== clientId && c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(JSON.stringify({
        type: 'typing',
        username: client.username
      }));
    }
  });
}

// ============================================
// FUNCIONES DE BROADCAST
// ============================================

function broadcast(message) {
  const data = JSON.stringify({
    type: 'chat',
    data: message
  });

  clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  });
}

// Broadcast de "escribiendo..." (del bot)
function broadcastTyping(username) {
  const data = JSON.stringify({
    type: 'typing',
    username: username
  });

  clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  });
}

// Limpiar indicador de "escribiendo"
function clearTyping() {
  const data = JSON.stringify({
    type: 'typing',
    username: null // null = limpiar
  });

  clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(data);
    }
  });
}

// Enviar mensaje del sistema
function sendSystemMessage(text) {
  const message = {
    id: generateMessageId(),
    username: '⚙️ Sistema',
    text: text,
    timestamp: new Date().toISOString()
  };
  
  broadcast(message);
}



// Función para enviar mensaje a TODOS los clientes conectados

/*por qué verificar readyState?

Un cliente puede desconectarse en cualquier momento
Estados posibles:

CONNECTING (0): Conectando
OPEN (1): Conectado
CLOSING (2): Cerrando
CLOSED (3): Cerrado */

// Dentro de wss.on('connection', ...)

// 5. INICIAR SERVIDOR

const PORT = 8080;


server.listen(PORT, () => {
  console.log(`Servidor WebSocket corriendo en ws://localhost:${PORT}`);
  console.log(`Abre index.html en tu navegador para usar el chat`);
  
  // Mostrar total de mensajes guardados
  db.get('SELECT COUNT(*) as count FROM messages', [], (err, row) => {
    if (!err) {
      console.log(`Mensajes en base de datos: ${row.count}`);
    }
  });
});

// CERRAR CORRECTAMENTE
// --------------------------------------------
// Cuando presionas Ctrl+C
process.on('SIGINT', () => {
  console.log('\n👋 Cerrando servidor...');
  
  // Cerrar base de datos
  db.close((err) => {
    if (err) {
      console.error('❌ Error cerrando base de datos:', err);
    } else {
      console.log('✅ Base de datos cerrada correctamente');
    }
    process.exit(0);
  });
});
