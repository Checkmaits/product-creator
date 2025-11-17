import { config } from "dotenv";
import express from "express";
import cors from "cors";
import path from "path";
import routes from "./routes.js";

config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const __dirname = import.meta.dirname;
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use("/system", express.static(path.join(__dirname, "..", "node_modules")));

app.use("/", routes);

const port = 9000;
app.listen(port, "0.0.0.0", () => console.log(`[Product Creator]: App listening on port ${port}...`));
