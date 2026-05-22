const express    = require('express');
const cors       = require('cors');
const path       = require('path');
const fse        = require('fs-extra');
const { randomUUID } = require('crypto');


const app = express();
app.use(cors());
app.use(express.json());

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'hotel.html')));
app.use(express.static(path.join(__dirname)));

// ── Hotel data helpers ──────────────────────────────────
const HOTEL_FILE = path.join(__dirname, 'data', 'hotel.json');

async function readHotel() {
  await fse.ensureDir(path.join(__dirname, 'data'));
  try { return await fse.readJson(HOTEL_FILE); }
  catch { return { rooms: [] }; }
}

async function writeHotel(data) {
  await fse.ensureDir(path.join(__dirname, 'data'));
  await fse.writeJson(HOTEL_FILE, data, { spaces: 2 });
}

// ── Hotel API ───────────────────────────────────────────
// GET all rooms
app.get('/api/hotel/rooms', async (req, res) => {
  const data = await readHotel();
  res.json(data);
});

// POST add a room
app.post('/api/hotel/rooms', async (req, res) => {
  const { name, type, beds = [] } = req.body;
  if (!name || !type) return res.status(400).json({ error: 'name and type required' });

  const data = await readHotel();
  const room = {
    id: randomUUID(),
    name,
    type,
    createdAt: new Date().toISOString(),
    beds: beds.map(b => ({
      id: randomUUID(),
      label: b.label,
      position: b.position || null,
      bunkPair: b.bunkPair || null,
      occupied: false,
    })),
  };
  data.rooms.push(room);
  await writeHotel(data);
  res.json({ room });
});

// DELETE a room
app.delete('/api/hotel/rooms/:id', async (req, res) => {
  const data = await readHotel();
  data.rooms = data.rooms.filter(r => r.id !== req.params.id);
  await writeHotel(data);
  res.json({ ok: true });
});

// PATCH toggle a bed's occupied status
app.patch('/api/hotel/rooms/:roomId/beds/:bedId', async (req, res) => {
  const data = await readHotel();
  const room = data.rooms.find(r => r.id === req.params.roomId);
  if (!room) return res.status(404).json({ error: 'Room not found' });
  const bed = room.beds.find(b => b.id === req.params.bedId);
  if (!bed)  return res.status(404).json({ error: 'Bed not found' });
  bed.occupied = !bed.occupied;
  await writeHotel(data);
  res.json({ bed });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Hotel reception running on http://localhost:${PORT}`));
