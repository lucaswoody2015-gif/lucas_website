import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const server = createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(join(__dirname, 'index.html'));
});

// Game state tracking
const MAP_SIZE = 2000;
const players = {};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // Create a brand new player
  players[socket.id] = {
    id: socket.id,
    x: Math.random() * (MAP_SIZE - 200) + 100,
    y: Math.random() * (MAP_SIZE - 200) + 100,
    color: `hsl(${Math.random() * 360}, 80%, 50%)`,
    score: 10,
    tail: []
  };

  // Inform the single player of their state and send all current enemies
  socket.emit('init', { id: socket.id, players });
  // Notify everyone else that a new rival spawned
  socket.broadcast.emit('newPlayer', players[socket.id]);

  // Read movement inputs from the client browser
  socket.on('updateInput', (input) => {
    const player = players[socket.id];
    if (!player) return;

    // Calculate movement trajectory
    const speed = 4;
    const dx = input.x - player.x;
    const dy = input.y - player.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance > 5) {
      // Drop a trail anchor point before shifting position
      player.tail.push({ x: player.x, y: player.y });
      if (player.tail.length > 40) player.tail.shift(); 

      player.x += (dx / distance) * speed;
      player.y += (dy / distance) * speed;

      // Restrict player inside safe map coordinates
      player.x = Math.max(0, Math.min(MAP_SIZE, player.x));
      player.y = Math.max(0, Math.min(MAP_SIZE, player.y));
    }
  });

  // Handle combat collisions and logic checks
  socket.on('checkCollisions', () => {
    const player = players[socket.id];
    if (!player) return;

    for (let id in players) {
      if (id === socket.id) continue;
      const enemy = players[id];

      // Hexanaut Mechanics: If you collide with an enemy's trail, they instantly die
      enemy.tail.forEach((point) => {
        const dist = Math.hypot(player.x - point.x, player.y - point.y);
        if (dist < 15) {
          io.to(id).emit('gameOver');
          delete players[id];
          io.emit('playerLeft', id);
          player.score += 15;
        }
      });
    }
  });

  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    delete players[socket.id];
    io.emit('playerLeft', socket.id);
  });
});

// Broadcast consistent tick snapshots at 30 FPS
setInterval(() => {
  io.emit('heartbeat', players);
}, 33);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running smoothly on port ${PORT}`);
});

