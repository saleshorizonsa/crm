import React, { useState, useEffect } from "react";
import Icon from "components/AppIcon";
import Button from "components/ui/Button";
import Select from "components/ui/Select";
import {
  companyService,
  adminService,
} from "../../../services/supabaseService";

const ProductUploadModal = ({ onClose, onSuccess }) => {
  const [companies, setCompanies] = useState([]);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [dragActive, setDragActive] = useState(false);
  const [uploadStatus, setUploadStatus] = useState(null);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    setLoadingCompanies(true);
    const { data, error } = await companyService.getAllCompanies();
    if (!error && data) {
      setCompanies(data);
    }
    setLoadingCompanies(false);
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile && droppedFile.type === "text/csv") {
      setFile(droppedFile);
    } else {
      alert("Please upload a CSV file only");
    }
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      if (
        selectedFile.type === "text/csv" ||
        selectedFile.name.endsWith(".csv")
      ) {
        setFile(selectedFile);
      } else {
        alert("Please upload a CSV file only");
        e.target.value = null;
      }
    }
  };

  const parseCSV = (text) => {
    const lines = text.split("\n").filter((line) => line.trim());
    if (lines.length === 0) return { headers: [], rows: [] };

    const headers = lines[0]
      .split(",")
      .map((h) => h.trim().replace(/^"|"$/g, ""));
    const rows = lines.slice(1).map((line) => {
      const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
      return headers.reduce((obj, header, index) => {
        obj[header] = values[index] || "";
        return obj;
      }, {});
    });

    return { headers, rows };
  };

  const handleUpload = async () => {
    if (!selectedCompany) {
      alert("Please select a company");
      return;
    }

    if (!file) {
      alert("Please select a CSV file");
      return;
    }

    setLoading(true);
    setUploadStatus(null);

    try {
      const text = await file.text();
      const { headers, rows } = parseCSV(text);

      if (rows.length === 0) {
        alert("CSV file is empty");
        setLoading(false);
        return;
      }

      // Expected columns for products table (case-insensitive matching)
      // Accepts: Material, Material description, Material Group, Base Unit of Measure, Unit Price
      const requiredColumns = ["material"];

      // Validate headers - need at least 'material' column
      const hasRequiredColumns = requiredColumns.every((col) =>
        headers.some((h) => h.toLowerCase().includes(col.toLowerCase()))
      );

      if (!hasRequiredColumns) {
        alert(
          `CSV must contain at minimum: Material\n\nExpected columns: Material, Material description, Material Group, Base Unit of Measure, Unit Price`
        );
        setLoading(false);
        return;
      }

      // Map CSV data to products format
      const products = rows
        .map((row) => {
          // Find column names case-insensitively with flexible matching
          const getValue = (possibleNames) => {
            for (const name of possibleNames) {
              const key = Object.keys(row).find(
                (k) => k.toLowerCase().trim() === name.toLowerCase().trim()
              );
              if (key && row[key]) return row[key].trim();
            }
            return null;
          };

          const material = getValue(["material"]);
          const description = getValue([
            "material description",
            "materialdescription",
            "description",
            "desc",
          ]);
          const materialGroup = getValue([
            "material group",
            "materialgroup",
            "material_group",
            "group",
          ]);
          const baseUom = getValue([
            "base unit of measure",
            "baseunitofmeasure",
            "base_unit_of_measure",
            "base_uom",
            "uom",
          ]);
          const unitPrice = getValue([
            "unit price",
            "unit_price",
            "price",
            "amount",
            "default price",
            "default_price",
          ]);

          return {
            material: material,
            description: description || material, // Use material as description if not provided
            material_group: materialGroup,
            base_unit_of_measure: baseUom,
            unit_price:
              unitPrice && !Number.isNaN(parseFloat(unitPrice))
                ? parseFloat(unitPrice)
                : null,
            company_id: selectedCompany,
            is_active: true,
          };
        })
        .filter((p) => p.material); // Filter out rows without material (required field)

      if (products.length === 0) {
        alert(
          "No valid products found in CSV. Ensure 'Material' column has values."
        );
        setLoading(false);
        return;
      }

      // Deduplicate products by material code (keep last occurrence)
      const uniqueProducts = Object.values(
        products.reduce((acc, product) => {
          acc[product.material] = product; // Later entries overwrite earlier ones
          return acc;
        }, {})
      );

      const duplicatesRemoved = products.length - uniqueProducts.length;

      // Upload products (upsert - updates existing, inserts new)
      const { data, error } = await adminService.bulkUpsertProducts(
        uniqueProducts
      );

      if (error) {
        throw error;
      }

      setUploadStatus({
        success: true,
        count: uniqueProducts.length,
        message: `Successfully processed ${uniqueProducts.length} products.${
          duplicatesRemoved > 0
            ? ` (${duplicatesRemoved} duplicate entries merged)`
            : ""
        } Existing products were updated, new products were inserted.`,
      });

      setTimeout(() => {
        onSuccess();
        onClose();
      }, 2000);
    } catch (error) {
      console.error("Upload error:", error);
      setUploadStatus({
        success: false,
        message: "Failed to upload products: " + error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-background border border-border rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
              <Icon name="Upload" className="text-primary" size={20} />
            </div>
            <div>
              <h2 className="text-xl font-bold">Upload Products</h2>
              <p className="text-sm text-muted-foreground">
                Import products from CSV file
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-accent p-2 rounded-lg transition-colors"
            disabled={loading}
          >
            <Icon name="X" size={20} />
          </button>
        </div>

        {/* Form */}
        <div className="p-6 space-y-6">
          {/* Company Selection */}
          <div>
            <Select
              label="Select Company"
              options={companies.map((c) => ({ value: c.id, label: c.name }))}
              value={selectedCompany}
              onChange={setSelectedCompany}
              required
              disabled={loadingCompanies || loading}
              loading={loadingCompanies}
              placeholder="Choose a company for these products"
            />
          </div>

          {/* File Upload */}
          <div>
            <label className="block text-sm font-semibold mb-3">
              Upload CSV File <span className="text-red-500">*</span>
            </label>

            <div
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              className={`relative border-2 border-dashed rounded-xl p-8 transition-all ${
                dragActive
                  ? "border-primary bg-primary/5"
                  : file
                  ? "border-green-500 bg-green-50/50"
                  : "border-border hover:border-primary/50"
              }`}
            >
              <input
                type="file"
                accept=".csv"
                onChange={handleFileChange}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                disabled={loading}
              />

              <div className="text-center">
                {file ? (
                  <>
                    <Icon
                      name="FileCheck"
                      size={48}
                      className="mx-auto text-green-600 mb-4"
                    />
                    <p className="font-semibold text-foreground mb-1">
                      {file.name}
                    </p>
                    <p className="text-sm text-muted-foreground mb-3">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setFile(null);
                      }}
                      className="text-sm text-red-600 hover:text-red-700 font-medium"
                      disabled={loading}
                    >
                      Remove file
                    </button>
                  </>
                ) : (
                  <>
                    <Icon
                      name="Upload"
                      size={48}
                      className="mx-auto text-muted-foreground mb-4"
                    />
                    <p className="font-semibold text-foreground mb-1">
                      Drop your CSV file here
                    </p>
                    <p className="text-sm text-muted-foreground mb-3">
                      or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Accepts CSV files only
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* CSV Format Info */}
          {!uploadStatus && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex gap-3">
                <Icon
                  name="Info"
                  size={18}
                  className="text-blue-600 mt-0.5 flex-shrink-0"
                />
                <div className="text-sm text-blue-800">
                  <p className="font-semibold mb-2">CSV File Format:</p>
                  <div className="space-y-1">
                    <p>
                      <strong>Required column:</strong> Material
                    </p>
                    <p>
                      <strong>Optional columns:</strong> Material description,
                      Material Group, Base Unit of Measure
                    </p>
                    <p className="mt-2 text-xs">
                      Existing products (matched by Material code) will be
                      updated. New products will be inserted.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Upload Status */}
          {uploadStatus && (
            <div
              className={`border rounded-lg p-4 ${
                uploadStatus.success
                  ? "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200"
              }`}
            >
              <div className="flex gap-3">
                <Icon
                  name={uploadStatus.success ? "CheckCircle" : "AlertCircle"}
                  size={20}
                  className={`mt-0.5 ${
                    uploadStatus.success ? "text-green-600" : "text-red-600"
                  }`}
                />
                <div>
                  <p
                    className={`font-semibold ${
                      uploadStatus.success ? "text-green-800" : "text-red-800"
                    }`}
                  >
                    {uploadStatus.success
                      ? "Upload Successful!"
                      : "Upload Failed"}
                  </p>
                  <p
                    className={`text-sm ${
                      uploadStatus.success ? "text-green-700" : "text-red-700"
                    }`}
                  >
                    {uploadStatus.message}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              variant="outline"
              onClick={onClose}
              className="flex-1"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              className="flex-1"
              disabled={loading || !selectedCompany || !file}
            >
              {loading ? (
                <>
                  <Icon name="Loader2" className="animate-spin" size={16} />
                  Uploading...
                </>
              ) : (
                <>
                  <Icon name="Upload" size={16} />
                  Upload Products
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProductUploadModal;
