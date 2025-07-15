import express from "express";
import cors from "cors";
import 'dotenv/config'
import axios from "axios";
// initialize express
const app = express()

// middlewares
app.use(express.json())
app.use(cors())
app.use(express.urlencoded({ extended: true }));
app.use(express.json({
    type: ['application/json', 'application/*+json']
}));
app.use((req, res, next) => {
    console.log(`➡️  ${req.method} ${req.originalUrl}`);
    console.log("Headers:", req.headers);
    console.log("Body:", JSON.stringify(req.body, null, 2));
    next();
});



// import routes
import lipaNaMpesaRoutes from "./routes/routes.lipanampesa.js"
app.use('/api',lipaNaMpesaRoutes)

const port = process.env.PORT

app.listen(port, () => {
    console.log(`App listening on port ${port}`)
})
