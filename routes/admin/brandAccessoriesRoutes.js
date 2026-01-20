import express from "express";
import multer from "multer";
import path from "path";
import {
  getAll,
  getAllActive,
  getById,
  add,
  edit,
  del,
  placeOrder,
  getOrders,
  getAllOrdersByUserId,
  getOrderById,
  addStock,
  getStockList,
  status,
  changeOrderStatus,
  cancelOrderByPartner,
  deleteOrder,
  addToCart,
  removeFromCart,
  getProductsFromCart,
  placeAllCartItemsIntoOrders,
} from "../../controllers/admin/brandAccessoriesController.js";

const router = express.Router();

/* Multer – memory storage for S3 */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 1 * 1024 * 1024 }, // 1MB
  fileFilter: (req, file, cb) => {
    const allowed = ["image/jpeg", "image/png", "image/jpg"];
    if (!allowed.includes(file.mimetype)) {
      return cb(new Error("Only JPG, JPEG, PNG allowed"));
    }
    cb(null, true);
  },
});
// Products Routes
router.get("/products", getAll);
router.get("/products/active", getAllActive);
router.get("/product/:id", getById);
router.get("/product/stock/list/:id", getStockList);
router.get("/product/size/list/:id", getStockList);

router.post(
  "/product/add",
  upload.fields([
    { name: "productImage", maxCount: 1 },
  ]),
  add
);

router.put(
  "/product/edit/:id",
  upload.fields([
    { name: "productImage", maxCount: 1 },
  ]),
  edit
);

// ADD Stock
router.post("/product/stock/add/:id", addStock);
// change status
router.put("/product/status/:id", status);
// Delete Product
router.delete("/product/delete/:id", del);


// ***  Orders Routes ***

// get Routes
router.get("/product/orders/get/:role", getOrders);
router.get("/product/order/:id", getOrderById);
// partner Orders
router.get("/partner/orders/:role", getAllOrdersByUserId);

// place order
router.post("/product/buy/:id", placeOrder);

// chnage order status
router.put("/order/status/:id", changeOrderStatus);

// Cancel Order Through Partner
router.put("/partner/order/cancel/:id", cancelOrderByPartner);

// delete Order
router.delete("/order/delete/:id", deleteOrder);


// ***  Cart Routes ***

// Fetch Product Items From Cart
router.get("/product/cart/get/:role", getProductsFromCart);

// Add to Cart
router.post("/product/cart/add/:id", addToCart);

// Remove From Cart
router.delete("/product/cart/remove/:id", removeFromCart);

// Convert All Carts Data Into Orders
router.post("/product/cart/buy", placeAllCartItemsIntoOrders);

export default router;