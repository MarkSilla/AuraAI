const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || '0.0.0.0';
const dataDirectory = path.join(__dirname, 'data');
const databaseFile = path.join(dataDirectory, 'aura.sqlite');

require('fs').mkdirSync(dataDirectory, { recursive: true });
const database = new DatabaseSync(databaseFile);
database.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS conversations (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    preview TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    position INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS messages_conversation_position
    ON messages (conversation_id, position);
`);

function readConversations() {
  const conversations = database
    .prepare('SELECT id, title, preview, updated_at AS updatedAt FROM conversations ORDER BY updated_at DESC')
    .all();
  const messages = database
    .prepare('SELECT id, conversation_id, role, content FROM messages ORDER BY conversation_id, position')
    .all();
  return conversations.map((conversation) => ({
    ...conversation,
    messages: messages
      .filter((message) => message.conversation_id === conversation.id)
      .map(({ conversation_id, ...message }) => message),
  }));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) reject(new Error('Request body is too large.'));
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Request body must be valid JSON.'));
      }
    });
    request.on('error', reject);
  });
}

function createTitle(messages) {
  const firstUserMessage = messages.find((message) => message.role === 'user');
  return (firstUserMessage?.content || 'New conversation').slice(0, 28);
}

function createResponse(message) {
  const topic = message.trim().replace(/[.!?]+$/, '');
  return `I’m ready to help with “${topic}”. This is a local backend response for now — connect your llama.cpp or GGUF inference layer in server/index.js when your model is ready.`;
}

async function handleRequest(request, response) {
  if (request.method === 'OPTIONS') {
    sendJson(response, 204, {});
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
  const route = url.pathname;

  if (request.method === 'GET' && route === '/api/health') {
    sendJson(response, 200, { ok: true, service: 'aura-backend' });
    return;
  }

  if (request.method === 'GET' && route === '/api/conversations') {
    sendJson(response, 200, readConversations());
    return;
  }

  if (request.method === 'POST' && route === '/api/chat') {
    const body = await readBody(request);
    if (typeof body.message !== 'string' || !body.message.trim()) {
      sendJson(response, 400, { error: 'message is required.' });
      return;
    }
    sendJson(response, 200, { content: createResponse(body.message) });
    return;
  }

  if (request.method === 'POST' && route === '/api/conversations') {
    const body = await readBody(request);
    if (!Array.isArray(body.messages) || body.messages.length === 0) {
      sendJson(response, 400, { error: 'messages must be a non-empty array.' });
      return;
    }
    const conversation = {
      id: crypto.randomUUID(),
      title: createTitle(body.messages),
      preview: body.messages[body.messages.length - 1].content.slice(0, 42),
      updatedAt: new Date().toISOString(),
    };
    database.exec('BEGIN');
    try {
      database
        .prepare('INSERT OR REPLACE INTO conversations (id, title, preview, updated_at) VALUES (?, ?, ?, ?)')
        .run(conversation.id, conversation.title, conversation.preview, conversation.updatedAt);
      const insertMessage = database.prepare(
        'INSERT INTO messages (id, conversation_id, role, content, position) VALUES (?, ?, ?, ?, ?)',
      );
      body.messages.forEach((message, position) => {
        insertMessage.run(message.id, conversation.id, message.role, message.content, position);
      });
      database.exec('COMMIT');
    } catch (error) {
      database.exec('ROLLBACK');
      throw error;
    }
    conversation.messages = body.messages;
    sendJson(response, 201, conversation);
    return;
  }

  const conversationMatch = route.match(/^\/api\/conversations\/([^/]+)$/);
  if (request.method === 'DELETE' && conversationMatch) {
    database.prepare('DELETE FROM conversations WHERE id = ?').run(conversationMatch[1]);
    sendJson(response, 204, {});
    return;
  }

  sendJson(response, 404, { error: 'Route not found.' });
}

const server = http.createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    sendJson(response, 500, { error: error.message });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`AURA backend listening on http://localhost:${PORT}`);
  console.log('For Expo Go on a phone, set EXPO_PUBLIC_API_URL to your computer LAN IP.');
});
