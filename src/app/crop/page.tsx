"use client";

import type React from "react";
import { useCallback, useRef, useState } from "react";
import { Button } from "../../components/Button";
import { Header } from "../../components/Header";
import { LayoutContainer } from "../../components/LayoutContainer";
import { MainContent } from "../../components/MainContent";

export default function CropPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [isProcessing, setIsProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file?.type.startsWith("image/")) {
        setSelectedFile(file);
        const url = URL.createObjectURL(file);
        setPreviewUrl(url);
      }
    },
    [],
  );

  const handleDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    const file = event.dataTransfer.files[0];
    if (file?.type.startsWith("image/")) {
      setSelectedFile(file);
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    }
  }, []);

  const handleDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
    },
    [],
  );

  const handleDownload = useCallback(async () => {
    if (!selectedFile) return;

    setIsProcessing(true);
    try {
      // 実際のクロップ処理はここに実装
      // 現在は元のファイルをダウンロード
      const url = URL.createObjectURL(selectedFile);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cropped_${selectedFile.name}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Crop error:", error);
    } finally {
      setIsProcessing(false);
    }
  }, [selectedFile]);

  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setPreviewUrl("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  return (
    <LayoutContainer>
      <Header />
      <MainContent>
        <div style={{ padding: "2rem" }}>
          <h1
            style={{
              fontSize: "2.5rem",
              fontWeight: "bold",
              color: "var(--foreground)",
              marginBottom: "1rem",
              textAlign: "center",
            }}
          >
            Image Cropping Tool
          </h1>
          <p
            style={{
              fontSize: "1.125rem",
              color: "var(--muted-foreground)",
              textAlign: "center",
              marginBottom: "3rem",
              maxWidth: "600px",
              margin: "0 auto 3rem",
            }}
          >
            Crop and resize your images to perfect dimensions
          </p>

          {!selectedFile ? (
            <div
              style={{
                border: "2px dashed var(--border-dashed)",
                borderRadius: "12px",
                padding: "4rem 2rem",
                textAlign: "center",
                backgroundColor: "white",
                cursor: "pointer",
                transition: "border-color 0.2s ease",
              }}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onClick={() => fileInputRef.current?.click()}
            >
              <div
                style={{
                  fontSize: "3rem",
                  marginBottom: "1rem",
                  color: "var(--muted-foreground)",
                }}
              >
                📷
              </div>
              <h3
                style={{
                  fontSize: "1.5rem",
                  fontWeight: "600",
                  color: "var(--foreground)",
                  marginBottom: "0.5rem",
                }}
              >
                Drop an image here or click to select
              </h3>
              <p
                style={{
                  color: "var(--muted-foreground)",
                  fontSize: "1rem",
                }}
              >
                Supports JPEG, PNG, WebP formats
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                style={{ display: "none" }}
              />
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "2rem",
                alignItems: "center",
              }}
            >
              <div
                style={{
                  maxWidth: "800px",
                  width: "100%",
                  backgroundColor: "white",
                  borderRadius: "12px",
                  border: "1px solid var(--border-dashed)",
                  padding: "2rem",
                  textAlign: "center",
                }}
              >
                <h3
                  style={{
                    fontSize: "1.25rem",
                    fontWeight: "600",
                    color: "var(--foreground)",
                    marginBottom: "1rem",
                  }}
                >
                  Preview
                </h3>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    marginBottom: "2rem",
                  }}
                >
                  <img
                    src={previewUrl}
                    alt="Preview"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "400px",
                      objectFit: "contain",
                      border: "1px solid var(--border-dashed)",
                      borderRadius: "8px",
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    gap: "1rem",
                    justifyContent: "center",
                    flexWrap: "wrap",
                  }}
                >
                  <Button
                    variant="primary"
                    onClick={handleDownload}
                    disabled={isProcessing}
                  >
                    {isProcessing ? "Processing..." : "Download Cropped Image"}
                  </Button>
                  <Button variant="secondary" onClick={handleReset}>
                    Select New Image
                  </Button>
                </div>
              </div>

              <div
                style={{
                  backgroundColor: "white",
                  borderRadius: "12px",
                  border: "1px solid var(--border-dashed)",
                  padding: "1.5rem",
                  maxWidth: "600px",
                  width: "100%",
                }}
              >
                <h4
                  style={{
                    fontSize: "1.125rem",
                    fontWeight: "600",
                    color: "var(--foreground)",
                    marginBottom: "1rem",
                  }}
                >
                  Image Details
                </h4>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "0.5rem",
                    color: "var(--muted-foreground)",
                    fontSize: "0.875rem",
                  }}
                >
                  <div>
                    <strong>File Name:</strong> {selectedFile.name}
                  </div>
                  <div>
                    <strong>File Size:</strong>{" "}
                    {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                  </div>
                  <div>
                    <strong>File Type:</strong> {selectedFile.type}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </MainContent>
    </LayoutContainer>
  );
}
