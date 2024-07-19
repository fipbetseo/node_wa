const venom = require('venom-bot');
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const port = 3000;

let client;
let status = '';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const upload = multer({ storage });

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

app.get('/', (req, res) => {
  res.render('index', { status });
});

app.post('/send', upload.single('media'), async (req, res) => {
  const { numbers, message, delay } = req.body;
  const file = req.file;
  const numberArray = numbers.split('\n').map(num => num.trim()).filter(num => num);

  if (!numbers || !message || !delay) {
    status = 'Number, message, and delay are required';
    return res.redirect('/');
  }

  const delayMs = delay * 1000;

  const sendMessages = async () => {
    for (const number of numberArray) {
      try {
        if (file) {
          const filePath = path.join(__dirname, file.path);
          await client.sendImage(`${number}@c.us`, filePath, file.filename, message);
        } else {
          await client.sendText(`${number}@c.us`, message);
        }
        status += `Message sent to ${number}\n`;
        io.emit('status', `Message sent to ${number}`);
      } catch (error) {
        status += `Error sending message to ${number}: ${error}\n`;
        io.emit('status', `Error sending message to ${number}: ${error}`);
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  };

  sendMessages();

  res.redirect('/');
});

venom
  .create(
    'whatsapp-blast',
    (base64Qr, asciiQR) => {
      console.log('QR code received, scan please!');
      io.emit('qrCode', base64Qr); // Send QR code to clients
    },
    (statusSession, session) => {
      console.log('Status Session: ', statusSession);
      io.emit('status', `Status Session: ${statusSession}`);
    },
    {
      multidevice: true,
    }
  )
  .then((clientInstance) => {
    client = clientInstance;

    client.onStateChange((state) => {
      console.log(`State changed: ${state}`);
      if (state === 'CONFLICT' || state === 'UNLAUNCHED') client.useHere();
      io.emit('status', `State changed: ${state}`);
    });

    client.onMessage((message) => {
      if (message.body === 'Hi') {
        client
          .sendText(message.from, 'Hello, welcome to Venom!')
          .then((result) => {
            console.log('Result: ', result);
          })
          .catch((error) => {
            console.error('Error when sending: ', error);
          });
      }
    });

    server.listen(port, () => {
      console.log(`WhatsApp blast server running at http://localhost:${port}`);
    });
  })
  .catch((error) => {
    console.error('Error initializing client:', error);
    io.emit('status', `Error initializing client: ${error}`);
  });

io.on('connection', (socket) => {
  console.log('New client connected');
  socket.emit('status', status);
  socket.on('disconnect', () => {
    console.log('Client disconnected');
  });
});
