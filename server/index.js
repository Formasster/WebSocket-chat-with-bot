// 1. IMPORTAR MÓDULOS
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

console.log('ENV KEY:', process.env.GEMINI_API_KEY?.slice(0, 6));

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: 'gemini-flash-latest'
});



async function askBot(prompt) {
  const result = await model.generateContent(prompt);
  return result.response.text();
}


const WebSocket = require('ws');
const http = require('http');
const sqlite3 = require('sqlite3').verbose();

// Crear/abrir archivo de base de datos
// Si 'chat.db' no existe, se crea automáticamente
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
  sendPreviousMessages(ws);

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
      console.error('Error:', error);
    }
  });

  ws.on('close', () => {
  // Eliminar del Map de clientes
  clients.delete(clientId);
  console.log(`Cliente desconectado: ${clientId}`);
  });

  ws.on('error', (error) => {
    console.error('Error en WebSocket:', error);
  });
  
});// FIN wss.on('connection', ...)



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
        ws.send(JSON.stringify({
          type: 'chat',
          data: msg
        }));
      });
    }
  );
}


// Manejar nuevo mensaje de chat

async function handleChatMessage(clientId, message) {
  const client = clients.get(clientId);
  if (!client || !message.text) return;

  const text = message.text.trim();

  // 👉 LLAMADA AL BOT
  if (text.startsWith('/bot')) {
    const question = text.replace('/bot', '').trim();
    if (!question) return;

      const userMessage = {
        id: generateMessageId(),
        username: client.username,
        text: text,
        timestamp: new Date().toISOString()
      };

      db.run(
        'INSERT INTO messages (id, username, text, timestamp) VALUES (?, ?, ?, ?)',
        [userMessage.id, userMessage.username, userMessage.text, userMessage.timestamp]
      );

        broadcast(userMessage);

    try {
      const botReply = await askBot(question);

      const botMessage = {
        id: generateMessageId(),
        username: '🤖 Aideijo',
        text: botReply,
        timestamp: new Date().toISOString()
      };

      // Guardar respuesta del bot
      db.run(
        'INSERT INTO messages (id, username, text, timestamp) VALUES (?, ?, ?, ?)',
        [botMessage.id, botMessage.username, botMessage.text, botMessage.timestamp]
      );

      broadcast(botMessage);
    } catch (err) {
      console.error('Error bot:', err);
    }

    return; // ⛔ NO seguir con el flujo normal
  }

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
      if (!err) {
        broadcast(chatMessage);
      }
    }
  );
}

// Función para manejar evento de "escribiendo..." y notificar a otros clientes

function handleTyping(clientId) {
  const client = clients.get(clientId);
  if (!client) return;

  const data = JSON.stringify({
    type: 'typing',
    username: client.username
  });

  clients.forEach((c) => {
    if (c.ws.readyState === WebSocket.OPEN) {
      c.ws.send(data);
    }
  });
}


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
