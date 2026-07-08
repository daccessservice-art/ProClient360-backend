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

    // ── FIX: previously returned a 404 "No products found" whenever the
    // CURRENT page happened to be empty (e.g. you deleted the last row on
    // the last page, or searched a page number beyond the new total).
    // That 404 made the frontend nuke `products` to [] AND `pagination`
    // back to all-zeros, which is what made it look like "everything got
    // deleted" after removing just one duplicate — the pagination object
    // collapsing made Next/Prev/page buttons disappear too.
    //
    // Now: only return 404 when there are truly ZERO matching documents
    // in the whole query (not just on this page). If the page itself is
    // out of range, still return success with the correct totals so the
    // frontend can clamp `currentPage` to the real last page. ──
    const totalProducts = await Product.countDocuments(query);

    if (totalProducts === 0) {
      return res.status(404).json({ success: false, error: "No products found" });
    }

    const totalPages = Math.ceil(totalProducts / limit);
    const hasNextPage = page < totalPages;
    const hasPrevPage = page > 1;

    res.status(200).json({
      success: true,
      products, // may legitimately be [] if `page` is beyond totalPages; frontend clamps this
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

// ✅ Get ALL products for report (no pagination)
exports.getAllProductsForReport = async (req, res) => {
  try {
    const user = req.user;
    const { q } = req.query;

    let query = { company: user.company || user._id };

    if (q && q.trim() !== "" && q.trim().toLowerCase() !== "null" && q.trim().toLowerCase() !== "undefined") {
      const searchRegex = new RegExp(q, "i");
      query.$or = [
        { productName: { $regex: searchRegex } },
        { brandName: { $regex: searchRegex } },
        { printName: { $regex: searchRegex } },
        { model: { $regex: searchRegex } },
        { hsnCode: { $regex: searchRegex } },
        { productCategory: { $regex: searchRegex } },
      ];
    }

    const products = await Product.find(query)
      .populate("createdBy", "name email")
      .populate("company", "name")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({
      success: true,
      products,
      total: products.length,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while fetching products for report: " + error.message,
    });
  }
};

// ── NEW: scan ALL of a company's products and return duplicate groups.
// A duplicate group = 2+ products sharing the same productName + brandName
// + model (trimmed, case-insensitive) within the same company. ──
exports.getDuplicateProducts = async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company || user._id;

    const duplicateGroups = await Product.aggregate([
      { $match: { company: companyId } },
      {
        $project: {
          productName: 1,
          brandName: 1,
          model: 1,
          currentStockQty: 1,
          purchasePrice: 1,
          createdAt: 1,
          dupKey: {
            $concat: [
              { $toLower: { $trim: { input: { $ifNull: ["$productName", ""] } } } }, "|",
              { $toLower: { $trim: { input: { $ifNull: ["$brandName", ""] } } } }, "|",
              { $toLower: { $trim: { input: { $ifNull: ["$model", ""] } } } },
            ],
          },
        },
      },
      { $group: { _id: "$dupKey", count: { $sum: 1 }, items: { $push: "$$ROOT" } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
    ]);

    res.status(200).json({
      success: true,
      duplicateGroupCount: duplicateGroups.length,
      duplicateGroups,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while finding duplicate products: " + error.message,
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
      currentStockQty,
      taxType,
      gstRate,
      gstEffectiveDate,
      cessPercentage,
      cessAmount,
      forceCreateDuplicate, // ── NEW: explicit override flag from the frontend ──
    } = req.body;

    const companyId = user.company ? user.company : user._id;

    // ── FIX: THIS is the actual root cause of all the duplicates you saw —
    // there was previously no check at all, so clicking "Add" (or any retry/
    // double-submit) with the same Product Name + Brand + Model just kept
    // inserting new documents forever. Now we block it unless the caller
    // explicitly confirms they want a duplicate (e.g. genuinely re-stocking
    // an identical item under a new lot). ──
    if (productName && !forceCreateDuplicate) {
      const dupQuery = {
        company: companyId,
        productName: new RegExp(`^${productName.trim()}$`, "i"),
        brandName: new RegExp(`^${(brandName || "").trim()}$`, "i"),
        model: new RegExp(`^${(model || "").trim()}$`, "i"),
      };
      const existing = await Product.findOne(dupQuery).lean();
      if (existing) {
        return res.status(409).json({
          success: false,
          isDuplicate: true,
          error: `A product with the same Name, Brand, and Model already exists (Sr ID: ${existing._id}). Set forceCreateDuplicate to true to add it anyway.`,
          existingProductId: existing._id,
        });
      }
    }

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
      currentStockQty: parseFloat(currentStockQty) || 0,
      taxType,
      gstRate,
      gstEffectiveDate,
      cessPercentage,
      cessAmount,
      company: companyId,
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

// ── NEW: bulk-delete endpoint so the frontend "Find Duplicates" workflow
// can remove several duplicate _ids in one request instead of N separate
// delete calls (which is slower and risks partial failures). ──
exports.bulkDeleteProducts = async (req, res) => {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: "Please provide an array of product ids to delete" });
    }

    const result = await Product.deleteMany({ _id: { $in: ids } });

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} product(s) deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while bulk deleting products: " + error.message,
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

// ── NEW: distinct brand list for this company, pulled from the DB instead
// of localStorage, so every user/browser sees the same up-to-date list. ──
exports.getBrandsList = async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company || user._id;

    const brands = await Product.distinct("brandName", {
      company: companyId,
      brandName: { $exists: true, $ne: "" },
    });

    const cleanBrands = brands
      .filter(Boolean)
      .map((b) => b.trim())
      .filter((b) => b.length > 0)
      .sort((a, b) => a.localeCompare(b));

    res.status(200).json({
      success: true,
      brands: cleanBrands,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while fetching brand list: " + error.message,
    });
  }
};

// ── NEW: distinct product categories for this company, from the DB ──
exports.getCategoriesList = async (req, res) => {
  try {
    const user = req.user;
    const companyId = user.company || user._id;

    const categories = await Product.distinct("productCategory", {
      company: companyId,
      productCategory: { $exists: true, $ne: "" },
    });

    const cleanCategories = categories
      .filter(Boolean)
      .map((c) => c.trim())
      .filter((c) => c.length > 0)
      .sort((a, b) => a.localeCompare(b));

    res.status(200).json({
      success: true,
      categories: cleanCategories,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: "Error while fetching category list: " + error.message,
    });
  }
};