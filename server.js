import express from "express";
import cors from "cors";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import 'dotenv/config';

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

// import routes
import lipaNaMpesaRoutes from "./routes/routes.lipanampesa.js";
app.use('/api', lipaNaMpesaRoutes);

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
