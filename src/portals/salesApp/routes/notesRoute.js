import express from "express";
import { addNote , fetchNotes,
  fetchNotesByDate,
  fetchNotesByMonth,
  updateNote,
  deleteNote,} from "../controllers/notesController.js";


const router = express.Router();

router.post("/add", addNote);
router.get("/all", fetchNotes);
router.get("/by-date", fetchNotesByDate);
router.get("/by-month", fetchNotesByMonth);
router.put("/update", updateNote);
router.delete("/delete", deleteNote);

export default router;
