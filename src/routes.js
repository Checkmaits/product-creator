import { Router } from "express";
import * as controller from "./controller.js";

const router = Router();

router.get("/", (req, res) => res.render("index"));

router.get("/products", controller.fetchProducts);
router.post("/products", controller.createProducts);

export default router;
