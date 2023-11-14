const Order = require("../models/Order");
const Product = require("../models/Product");
const createError = require("../utils/ErrorHandle");
const { validationResult } = require("express-validator");
const { htmlContent } = require("../utils/SendMail");
const nodemailer = require("nodemailer");
const { getItemsByPage, getTotalPage } = require("../utils/paging");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "dinhnhfx21211@funix.edu.vn",
    pass: "Bv32Xh4CWtyB",
  },
});

//addToCart
exports.addToCart = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error("Validation failed.");
    error.statusCode = 422;
    error.data = errors.array();
    throw error;
  }

  Product.findById(req.body.productId)
    .then((product) => {
      if (!product) {
        createError(404, "This product can not be found!");
      }
      if (product.inventoryQuantity < req.body.quantity) {
        createError(
          404,
          `This product only has ${product.inventoryQuantity} items left in stock`
        );
      }
      return req.user.addToCart(product, req.body.quantity);
    })
    .then((result) => {
      res.status(200).send({ status: "success" });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

//order send email
exports.order = (req, res, next) => {
  console.log(req.body);
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const error = new Error("Validation failed.");
    error.statusCode = 422;
    error.data = errors.array();
    throw error;
  }
  let emailContent;
  let listProduct;
  req.user
    .populate("cart.items.productId")
    .then((user) => {
      if (user.cart.items.length === 0) {
        createError(404, "Cart is empty");
      }

      const products = user.cart.items.map((i) => {
        return { quantity: i.quantity, product: { ...i.productId._doc } };
      });
      listProduct = [...products];

      let totalPrice = 0;
      products.forEach((cartItem) => {
        totalPrice =
          totalPrice + Number(cartItem.product.price) * cartItem.quantity;
      });

      const orderInfo = {
        status: "waiting for paying",
        delivery: "waiting for progressing",
        orderTime: new Date(),
        customerInfo: {
          fullName: req.body.fullName,
          email: req.body.email,
          phone: req.body.phone,
          address: req.body.address,
        },
        products: user.cart.items,
        price: totalPrice,
        user: req.user._id,
      };
      emailContent = {
        customerEmail: req.body.email,
        customerInfo: orderInfo.customerInfo,
        products: products,
        totalPrice: totalPrice,
      };
      console.log(emailContent);
      const newOrder = new Order(orderInfo);
      return newOrder.save();
    })
    .then((result) => {
      req.user.cleanCart();
      listProduct.forEach((cartItem) => {
        Product.findOne({ _id: cartItem.product._id }).then((product) => {
          const oldQuantity = product.inventoryQuantity;
          product.inventoryQuantity = oldQuantity - cartItem.quantity;
          product.save();
        });
      });
      res.status(200).send({ status: "success", order: result });
    })
    .then((result) => {
      const attachments = [];
      emailContent.products.map((item) => {
        const urlImage = item.product.img1;
        const attachItem = {
          filename: urlImage,
          path: urlImage,
          cid: urlImage,
        };
        attachments.push(attachItem);
      });

      return transporter.sendMail({
        from: "dinhnhfx21211@funix.edu.vn",
        to: emailContent.customerEmail,
        subject: "[Confirm email for your order]",
        html: htmlContent(emailContent),
        attachments: attachments,
      });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

//getOrderOfUser
exports.getOrderOfUser = (req, res, next) => {
  const pageParam = req.query.page || 1;
  Order.find({ user: req.user._id })
    .then((result) => {
      const response = {
        results: getItemsByPage(result, pageParam),
        page: pageParam,
        total_pages: getTotalPage(result),
      };
      res.status(200).send(response);
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

//getOrderDetail
exports.getOrderDetail = (req, res, next) => {
  const orderId = req.params.orderId;
  Order.findOne({ _id: orderId })
    .populate("products.productId")
    .then((result) => {
      if (!result) {
        createError(404, "This order can not be found");
      }
      res.status(200).send(result);
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

//getCartItem
exports.getCartItem = (req, res, next) => {
  req.user
    .populate("cart.items.productId")
    .then((user) => {
      const products = user.cart.items.map((i) => {
        return { quantity: i.quantity, product: { ...i.productId._doc } };
      });
      res.status(200).send({ cart: products });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

//setQuantityItemInCart
exports.setQuantityItemInCart = (req, res, next) => {
  Product.findById(req.body.productId)
    .then((result) => {
      if (!result) {
        createError(404, "This product can not be found!");
      }
      if (result.inventoryQuantity < req.body.quantity) {
        createError(
          404,
          `This product only has ${result.inventoryQuantity} items left in stock`
        );
      }
      return req.user.setQuantityItem(result, req.body.quantity);
    })
    .then((result) => {
      res.status(200).send({ status: "success" });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};

//removeItemFromCart
exports.removeItemFromCart = (req, res, next) => {
  Product.findById(req.body.productId)
    .then((result) => {
      if (!result) {
        createError(404, "This product can not be found!");
      }
      return req.user.removeFromCart(req.body.productId);
    })
    .then((result) => {
      res.status(200).send({ status: "success" });
    })
    .catch((err) => {
      if (!err.statusCode) {
        err.statusCode = 500;
      }
      next(err);
    });
};
