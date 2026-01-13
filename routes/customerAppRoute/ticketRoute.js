import express from "express";
import { add,getAll } from "../../controllers/customerAppController/ticketController.js";


const router = express.Router();

router.post('/add',add)
router.get('/get/:contact',getAll)
export default router;
