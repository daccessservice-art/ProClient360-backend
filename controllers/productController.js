const Product = require("../models/productModel");

exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ success: false, error: "Product not found" });
    }
    res.status(200).json({ success: true, message: "Product fetched successfully", product });
  } catch (error) {
    res.status(500).json({ error: "Error in getting a product: " + error.message });
  }
};

exports.showAll = async (req, res) => {
  try {
    const user = req.user;

    let page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    let skip = (page - 1) * limit;

    const { q } = req.query;

    let query = {};
    if (
      q !== undefined &&
      q !== null &&
      q.trim() !== "" &&
      q.trim().toLowerCase() !== "null" &&
      q.trim().toLowerCase() !== "undefined"
    ) {
      const searchRegex = new RegExp(q, "i");
      skip = 0;
      page = 1;
      query = {
        company: user.company ? user.company : user._id,
        $or: [
          { productName: { $regex: searchRegex } },
          { brandName: { $regex: searchRegex } },
          { printName: { $regex: searchRegex } },
          { model: { $regex: searchRegex } },
          { hsnCode: { $regex: searchRegex } },
          { productCategory: { $regex: searchRegex } },
        ],
      };
    } else {
      query = {
        company: user.company || user._id,
      };
    }

    const products = await Product.find(query)
      .skip(skip)
      .limit(limit)
      .populate("createdBy", "name email")
      .populate("company", "name")
      .sort({ createdAt: -1 })
      .lean();

    if (products.length === 0) {
      return res.status(404).json({ success: false, error: "No products found" });
    }

    const totalProducts = await Product.countDocuments(query);
    const totalPages = Math.ceil(totalProducts / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      products,
      pagination: {
        currentPage: page,
        totalPages,
        totalProducts,
        limit,
        hasNextPage,
        hasPrevPage,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while fetching products: " + error.message,
    });
  }
};

exports.createProduct = async (req, res) => {
  try {
    const user = req.user;
    const {
      productName,
      brandName,
      printName,
      aliasName,
      model,
      hsnCode,
      description,
      productCategory,
      baseUOM,
      alternateUOM,
      uomConversion,
      category,
      mrp,
      salesPrice,
      purchasePrice,
      minSalesPrice,
      minQtyLevel,
      discountType,
      discountValue,
      taxType,
      gstRate,
      gstEffectiveDate,
      cessPercentage,
      cessAmount
    } = req.body;

    const newProduct = new Product({
      productName,
      brandName,
      printName,
      aliasName,
      model,
      hsnCode,
      description,
      productCategory,
      baseUOM,
      alternateUOM,
      uomConversion,
      category,
      mrp,
      salesPrice,
      purchasePrice,
      minSalesPrice,
      minQtyLevel,
      discountType,
      discountValue,
      taxType,
      gstRate,
      gstEffectiveDate,
      cessPercentage,
      cessAmount,
      company: user.company ? user.company : user._id,
      createdBy: user._id,
    });

    if (newProduct) {
      await newProduct.save();
      res.status(201).json({
        success: true,
        message: "Product created successfully",
        product: newProduct
      });
    } else {
      res.status(400).json({ 
        success: false,
        error: "Invalid product data" 
      });
    }
  } catch (error) {
    if (error.name === "ValidationError") {
      res.status(400).json({ 
        success: false, 
        error: error.message 
      });
    } else {
      res.status(500).json({ 
        error: "Error creating product: " + error.message 
      });
    }
  }
};

exports.deleteProduct = async (req, res) => {
  try {
    const productId = req.params.id;
    const product = await Product.findByIdAndDelete(productId);

    if (!product) {
      return res.status(404).json({ 
        success: false, 
        error: "Product Not Found!!" 
      });
    }

    res.status(200).json({ 
      success: true, 
      message: "Product deleted successfully" 
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while deleting product: " + error.message
    });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const { id } = req.params;
    const updatedData = req.body;

    const existingProduct = await Product.findById(id);

    if (!existingProduct) {
      return res.status(404).json({ 
        success: false, 
        error: "Product not found" 
      });
    }

    const updatedProduct = await Product.findByIdAndUpdate(id, updatedData, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({ 
      success: true, 
      message: "Product updated successfully", 
      updatedProduct 
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false, 
      error: "Error updating product: " + error.message 
    });
  }
};