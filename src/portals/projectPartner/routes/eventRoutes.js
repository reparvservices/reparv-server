import express from "express";
import { addNote, deleteNote, getAllNotes, updateNote } from "../controllers/eventController.js";

const router = express.Router();

// GET  /salesapp/schedule-notes/all?projectPartnerId=123
router.get("/all", getAllNotes);

// POST /salesapp/schedule-notes/add
router.post("/add", addNote);

// PUT  /salesapp/schedule-notes/update/:id
router.put("/update/:id", updateNote);

// DELETE /salesapp/schedule-notes/delete?id=5
router.delete("/delete", deleteNote);

export default router;
