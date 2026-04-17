import express from "express";
import { addNote, deleteNote, getAll, getNotes } from "../controllers/calenderController.js";

const router = express.Router();

router.get("/meetings", getAll);
router.get("/notes", getNotes);
router.post("/note/add", addNote);
router.delete("/note/delete/:id", deleteNote);

export default router;
