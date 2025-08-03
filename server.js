import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import 'dotenv/config';
import lipaNaMpesaRoutes from "./routes/routes.lipanampesa.js";

// initialize express
const app = express();
const httpServer = createServer(app); // ⬅️ create HTTP server

// initialize socket.io
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: "*", // adjust to your frontend origin if needed
    methods: ["GET", "POST"]
  }
});

// ✅ ATTACH SOCKET.IO TO EXPRESS APP - This is what was missing!
app.set('io', io);

// middlewares
app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json({
  type: ['application/json', 'application/*+json']
}));

app.get('/', (req, res) => {
  console.log('Root route hit!'); // Add logging
  res.send("Welcome to Venumux");
});


app.use('/api', lipaNaMpesaRoutes);
// Simple test route (add this right after your other routes)

// Debug: List all registered routes
app.use('/api', (req, res, next) => {
  console.log(`Incoming API request to: ${req.path}`);
  next(); // Continue to next middleware
});

// Debug: Print all routes (add this at the end BEFORE error handlers)
console.log('\nRegistered Routes:');
app._router.stack.forEach((layer) => {
  if (layer.route) {
    console.log(`→ ${layer.route.path}`);
  } else if (layer.name === 'router') {
    layer.handle.stack.forEach((sublayer) => {
      if (sublayer.route) {
        console.log(`→ /api${sublayer.route.path}`);
      }
    });
  }
});

app.get('/api/test-payment-types', async (req, res) => {
  try {
    console.log('Test route hit!'); // Verify the route is being reached

    // Direct Supabase call (same as your original implementation)
    const { data, error } = await supabase.rpc('get_all_payment_types');

    if (error) {
      console.error('Supabase error:', error);
      return res.status(500).json({ error: error.message });
    }

    console.log('Data retrieved:', data); // Log the response data
    res.json(data);

  } catch (e) {
    console.error('Unexpected error:', e);
    res.status(500).json({
      error: e.message || 'Unknown error occurred'
    });
  }
});

// socket.io logic
io.on("connection", (socket) => {
  console.log(`🔌 Client connected: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`❌ Client disconnected: ${socket.id}`);
  });

  // ✅ Handle joining payment rooms
  socket.on("join", (orderId) => {
    socket.join(orderId);
    console.log(`🏠 Socket ${socket.id} joined room: ${orderId}`);
  });

  // ✅ Handle leaving payment rooms
  socket.on("leave", (orderId) => {
    socket.leave(orderId);
    console.log(`🚪 Socket ${socket.id} left room: ${orderId}`);
  });

  // Example: listening to client events
  socket.on("custom-event", (data) => {
    console.log("Received custom-event:", data);
    socket.emit("server-response", { message: "Received your data" });
  });

  // You can emit events from server to client as needed
  // socket.emit("welcome", "Welcome to Socket.IO Server");
});

const port = process.env.PORT || 5000;
httpServer.listen(port, () => {
  console.log(`🚀 Server with Socket.IO running on port ${port}`);
});
